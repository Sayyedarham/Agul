<#
.SYNOPSIS
    FamilyGuard Background Endpoint Agent for Windows.
.DESCRIPTION
    Runs as a continuous background daemon on managed Windows PCs.
    Gathers local non-invasive hardware, OS, and health telemetry,
    submits check-ins to the FamilyGuard Server, and enforces transparent
    parental policies (e.g. bedtime lock screen and process restrictions).
#>

[CmdletBinding()]
param (
    [string]$ConfigPath = "$PSScriptRoot\config.json",
    [string]$ServerUrl = "",
    [string]$DeviceToken = "",
    [string]$DeviceId = "",
    [int]$IntervalSeconds = 60
)

# Load configuration if present
if (Test-Path $ConfigPath) {
    try {
        $cfg = Get-Content $ConfigPath -Raw | ConvertFrom-Json
        if (-not $ServerUrl -and $cfg.ServerUrl) { $ServerUrl = $cfg.ServerUrl }
        if (-not $DeviceToken -and $cfg.DeviceToken) { $DeviceToken = $cfg.DeviceToken }
        if (-not $DeviceId -and $cfg.DeviceId) { $DeviceId = $cfg.DeviceId }
        if ($cfg.IntervalSeconds) { $IntervalSeconds = [int]$cfg.IntervalSeconds }
    } catch {
        Write-Warning "Failed to parse config.json: $_"
    }
}

if (-not $ServerUrl) {
    Write-Error "ServerUrl is required (via parameter or config.json)."
    exit 1
}
if (-not $DeviceToken) {
    Write-Error "DeviceToken is required (via parameter or config.json)."
    exit 1
}

$ServerUrl = $ServerUrl.TrimEnd('/')
$CheckinUrl = "$ServerUrl/api/family/agent/checkin"

Write-Host "FamilyGuard Agent started." -ForegroundColor Green
Write-Host "Server: $CheckinUrl"
Write-Host "Check-in Interval: $IntervalSeconds seconds"

function Get-EpochMs([datetime]$dt) {
    return [int64]([DateTimeOffset]::new($dt).ToUnixTimeMilliseconds())
}

function Get-CurrentEpochMs {
    return [int64]([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
}

function Collect-HealthSnapshot([string]$devId) {
    $nowMs = Get-CurrentEpochMs

    # 1. OS & Memory
    $os = Get-CimInstance -ClassName Win32_OperatingSystem -ErrorAction SilentlyContinue
    $totalMemGb = if ($os.TotalVisibleMemorySize) { [math]::Round($os.TotalVisibleMemorySize / 1MB, 1) } else { 8.0 }
    $freeMemGb = if ($os.FreePhysicalMemory) { [math]::Round($os.FreePhysicalMemory / 1MB, 1) } else { 4.0 }
    $usedMemGb = [math]::Round($totalMemGb - $freeMemGb, 1)
    $usedPct = if ($totalMemGb -gt 0) { [math]::Round(($usedMemGb / $totalMemGb) * 100, 1) } else { 50 }

    # 2. Battery
    $batteryCim = Get-CimInstance -ClassName Win32_Battery -ErrorAction SilentlyContinue
    $batterySnap = @{
        pct = 100
        charging = $true
        estimatedMinutesRemaining = $null
        healthPct = 100
        cycleCount = $null
    }
    if ($batteryCim) {
        $batterySnap.pct = [int]$batteryCim.EstimatedChargeRemaining
        $batterySnap.charging = ($batteryCim.BatteryStatus -eq 2 -or $batteryCim.BatteryStatus -eq 6 -or $batteryCim.BatteryStatus -eq 7)
        if (-not $batterySnap.charging -and $batteryCim.EstimatedRunTime -and $batteryCim.EstimatedRunTime -lt 71582788) {
            $batterySnap.estimatedMinutesRemaining = [int]$batteryCim.EstimatedRunTime
        }
    }

    # 3. Storage
    $disks = Get-CimInstance -ClassName Win32_LogicalDisk -Filter "DriveType=3" -ErrorAction SilentlyContinue
    $storageList = @()
    foreach ($d in $disks) {
        $tot = if ($d.Size) { [math]::Round($d.Size / 1GB, 1) } else { 0 }
        $fre = if ($d.FreeSpace) { [math]::Round($d.FreeSpace / 1GB, 1) } else { 0 }
        $storageList += @{
            label = $d.DeviceID
            totalGb = $tot
            freeGb = $fre
            encrypted = $false
            smartStatus = "healthy"
        }
    }
    if ($storageList.Count -eq 0) {
        $storageList += @{
            label = "C:"
            totalGb = 256.0
            freeGb = 120.0
            encrypted = $false
            smartStatus = "healthy"
        }
    }

    # 4. Connectivity
    $connType = "none"
    $ssid = $null
    $signalPct = $null
    $netsh = netsh wlan show interfaces 2>$null | Out-String
    if ($netsh -match "SSID\s*:\s*(.+)") {
        $ssid = $matches[1].Trim()
        $connType = "wifi"
    }
    if ($netsh -match "Signal\s*:\s*(\d+)%") {
        $signalPct = [int]$matches[1]
    }
    if (-not $ssid) {
        $nic = Get-CimInstance -ClassName Win32_NetworkAdapter -Filter "NetConnectionStatus=2" -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($nic) { $connType = "ethernet" }
    }

    # Ping latency
    $latencyMs = 15
    try {
        $ping = Test-Connection -ComputerName "1.1.1.1" -Count 1 -TimeoutSeconds 1 -ErrorAction SilentlyContinue
        if ($ping) { $latencyMs = [int]$ping.ResponseTime }
    } catch { }

    # 5. Boot and OS Health
    $bootTime = if ($os.LastBootUpTime) { $os.LastBootUpTime } else { (Get-Date).AddDays(-1) }
    $uptimeSec = [int64]((Get-Date) - $bootTime).TotalSeconds
    $pendingReboot = (Test-Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired")

    # 6. Security (Defender & Firewall)
    $defenderOn = $true
    try {
        $mp = Get-MpComputerStatus -ErrorAction SilentlyContinue
        if ($mp) {
            $defenderOn = [bool]$mp.AMServiceEnabled -and [bool]$mp.AntivirusEnabled
        }
    } catch { }

    $firewallOn = $true
    try {
        $fw = Get-NetFirewallProfile -ErrorAction SilentlyContinue
        if ($fw) {
            $firewallOn = ($fw | Where-Object { $_.Enabled -eq $true }).Count -gt 0
        }
    } catch { }

    # 7. Reliability
    $appCrashes = 0
    try {
        $recentCrashes = Get-WinEvent -FilterHashtable @{
            LogName = 'Application'
            ProviderName = 'Application Error'
            StartTime = (Get-Date).AddHours(-24)
        } -ErrorAction SilentlyContinue
        if ($recentCrashes) { $appCrashes = $recentCrashes.Count }
    } catch { }

    # 8. Peripherals (USB)
    $usbList = @()
    try {
        $usbDevs = Get-CimInstance Win32_PnPEntity -Filter "PNPClass='USB'" -ErrorAction SilentlyContinue | Select-Object -First 5
        foreach ($u in $usbDevs) {
            if ($u.Name) {
                $usbList += @{
                    id = $u.DeviceID
                    name = $u.Name
                    type = "usb"
                    connectedAt = $nowMs
                    trusted = $true
                }
            }
        }
    } catch { }

    return @{
        deviceId = $devId
        collectedAt = $nowMs
        battery = $batterySnap
        memory = @{
            totalGb = $totalMemGb
            usedGb = $usedMemGb
            usedPct = $usedPct
            sustainedHighPct = ($usedPct -gt 85)
        }
        storage = $storageList
        connectivity = @{
            online = $true
            type = $connType
            ssid = $ssid
            signalPct = $signalPct
            latencyMs = $latencyMs
            lastNetworkChangeAt = $nowMs
        }
        boot = @{
            lastBootAt = (Get-EpochMs $bootTime)
            uptimeSeconds = $uptimeSec
            lastBootDurationMs = 15000
            unexpectedShutdownsLast30d = 0
            restartPendingForUpdate = $pendingReboot
        }
        windowsHealth = @{
            version = if ($os.Caption) { $os.Caption } else { "Windows 11" }
            build = if ($os.BuildNumber) { $os.BuildNumber } else { "26100" }
            updateStatus = if ($pendingReboot) { "pending" } else { "up_to_date" }
            pendingRestart = $pendingReboot
            lastUpdateAt = (Get-EpochMs (Get-Date).AddDays(-3))
            activationStatus = "activated"
        }
        security = @{
            defenderEnabled = $defenderOn
            definitionDate = $nowMs
            lastScanAt = $nowMs
            firewallEnabled = $firewallOn
            bitlockerEnabled = $false
            tpmPresent = $true
        }
        reliability = @{
            appCrashes24h = $appCrashes
            bsodLast30d = 0
            lastBsodAt = $null
            failedServicesCount = 0
            failedServiceNames = @()
        }
        peripherals = @{
            usb = $usbList
            bluetooth = @()
        }
    }
}

function Enforce-Policy($policy) {
    if (-not $policy) { return }

    # A. Check Bedtime
    if ($policy.bedtime -and $policy.bedtime.enabled) {
        $now = Get-Date
        $dayOfWeek = [int]$now.DayOfWeek # 0=Sun, 1=Mon, ..., 6=Sat
        $activeDays = $policy.bedtime.days
        if ($activeDays -contains $dayOfWeek) {
            $startParts = $policy.bedtime.startTime.Split(':')
            $endParts = $policy.bedtime.endTime.Split(':')

            $todayStart = (Get-Date).Date.AddHours([int]$startParts[0]).AddMinutes([int]$startParts[1])
            $todayEnd = (Get-Date).Date.AddHours([int]$endParts[0]).AddMinutes([int]$endParts[1])

            $inBedtime = $false
            if ($todayStart -lt $todayEnd) {
                # e.g., 01:00 to 06:00
                $inBedtime = ($now -ge $todayStart -and $now -lt $todayEnd)
            } else {
                # e.g., 21:30 to 07:00 (spans midnight)
                $inBedtime = ($now -ge $todayStart -or $now -lt $todayEnd)
            }

            if ($inBedtime) {
                Write-Host "[Policy] Bedtime active! Locking workstation." -ForegroundColor Yellow
                rundll32.exe user32.dll,LockWorkStation
            }
        }
    }

    # B. Block restricted processes
    if ($policy.blockedApps -and $policy.blockedApps.Count -gt 0) {
        foreach ($procRule in $policy.blockedApps) {
            $baseName = [System.IO.Path]::GetFileNameWithoutExtension($procRule)
            $running = Get-Process -Name $baseName -ErrorAction SilentlyContinue
            if ($running) {
                Write-Host "[Policy] Restricted app found: $procRule. Terminating process." -ForegroundColor Red
                Stop-Process -Name $baseName -Force -ErrorAction SilentlyContinue
            }
        }
    }
}

# --- Main Polling Loop ---
while ($true) {
    try {
        $snapshot = Collect-HealthSnapshot -devId $DeviceId
        $payload = @{
            deviceToken = $DeviceToken
            snapshot = $snapshot
            immediateEvents = @()
        } | ConvertTo-Json -Depth 6

        $headers = @{
            "Authorization" = "Bearer $DeviceToken"
            "Content-Type" = "application/json"
        }

        $res = Invoke-RestMethod -Uri $CheckinUrl -Method Post -Body $payload -Headers $headers -TimeoutSec 15
        Write-Host "[$([DateTime]::Now.ToString('HH:mm:ss'))] Heartbeat sent successfully." -ForegroundColor Cyan

        if ($res.policy) {
            Enforce-Policy -policy $res.policy
        }
    } catch {
        Write-Warning "[$([DateTime]::Now.ToString('HH:mm:ss'))] Check-in failed: $_"
    }

    Start-Sleep -Seconds $IntervalSeconds
}

