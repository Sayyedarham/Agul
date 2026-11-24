<#
.SYNOPSIS
    Installs the FamilyGuard Windows Agent as a continuous background Scheduled Task.
.DESCRIPTION
    Requires Administrator privileges. Enrolls this PC with the FamilyGuard Server,
    saves the secure device configuration to C:\ProgramData\FamilyGuard, and creates
    a Windows Scheduled Task that launches silently in the background at boot and logon.
#>

[CmdletBinding()]
param (
    [string]$ServerUrl = "",
    [string]$EnrollCode = "",
    [string]$DeviceToken = "",
    [string]$Nickname = ""
)

# Ensure running with Administrator privileges
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "Elevating permissions to Administrator..." -ForegroundColor Yellow
    $argsList = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    if ($ServerUrl) { $argsList += " -ServerUrl `"$ServerUrl`"" }
    if ($EnrollCode) { $argsList += " -EnrollCode `"$EnrollCode`"" }
    if ($DeviceToken) { $argsList += " -DeviceToken `"$DeviceToken`"" }
    if ($Nickname) { $argsList += " -Nickname `"$Nickname`"" }

    Start-Process powershell.exe -Verb RunAs -ArgumentList $argsList
    exit
}

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "   FamilyGuard Windows Agent - Background Setup Installer   " -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Prompt interactively if not passed via parameters
if (-not $ServerUrl) {
    $ServerUrl = Read-Host "Enter FamilyGuard Server URL (e.g. http://192.168.1.50:3000)"
}
$ServerUrl = $ServerUrl.TrimEnd('/')

if (-not $EnrollCode -and -not $DeviceToken) {
    $EnrollCode = Read-Host "Enter 8-character Enrollment Code from Parent Dashboard"
}

if (-not $Nickname) {
    $defaultNick = $env:COMPUTERNAME
    $inputNick = Read-Host "Enter friendly nickname for this PC (Default: $defaultNick)"
    $Nickname = if ($inputNick) { $inputNick } else { $defaultNick }
}

$InstallDir = "$env:ProgramData\FamilyGuard"
if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

$DeviceId = "dev-$($env:COMPUTERNAME.ToLower())"

# Perform Enrollment if code provided
if ($EnrollCode) {
    Write-Host "Contacting server to enroll device..." -ForegroundColor Yellow
    $enrollPayload = @{
        code = $EnrollCode.ToUpper().Trim()
        deviceName = $env:COMPUTERNAME
        nickname = $Nickname
    } | ConvertTo-Json

    try {
        $enrollRes = Invoke-RestMethod -Uri "$ServerUrl/api/family/agent/enroll" -Method Post -Body $enrollPayload -ContentType "application/json"
        $DeviceToken = $enrollRes.deviceToken
        if ($enrollRes.device.id) {
            $DeviceId = $enrollRes.device.id
        }
        Write-Host "Enrollment successful! Assigned Device ID: $DeviceId" -ForegroundColor Green
    } catch {
        Write-Error "Enrollment failed: $_"
        Write-Host "Make sure the enrollment code is valid and port 3000 on the server is reachable." -ForegroundColor Red
        exit 1
    }
}

# Save configuration
$configObj = @{
    ServerUrl = $ServerUrl
    DeviceToken = $DeviceToken
    DeviceId = $DeviceId
    Nickname = $Nickname
    IntervalSeconds = 60
    InstalledAt = (Get-Date).ToString("o")
}

$configPath = "$InstallDir\config.json"
$configObj | ConvertTo-Json -Depth 4 | Set-Content -Path $configPath -Force

# Copy daemon script
$sourceScript = Join-Path $PSScriptRoot "FamilyGuardAgent.ps1"
if (-not (Test-Path $sourceScript)) {
    Write-Error "Could not find FamilyGuardAgent.ps1 in installer directory."
    exit 1
}
Copy-Item -Path $sourceScript -Destination "$InstallDir\FamilyGuardAgent.ps1" -Force

# Register Windows Scheduled Task
$TaskName = "FamilyGuardAgent"
Write-Host "Registering Windows Scheduled Task: $TaskName..." -ForegroundColor Yellow

# Unregister previous instance if exists
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

$Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$InstallDir\FamilyGuardAgent.ps1`""
$TriggerBoot = New-ScheduledTaskTrigger -AtStartup
$TriggerLogon = New-ScheduledTaskTrigger -AtLogOn

$Principal = New-ScheduledTaskPrincipal -UserId "NT AUTHORITY\SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit 0

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger @($TriggerBoot, $TriggerLogon) -Principal $Principal -Settings $Settings -Description "FamilyGuard Endpoint Health Reporter and Parental Control Daemon" | Out-Null

# Start the task now
Write-Host "Starting background task..." -ForegroundColor Yellow
Start-ScheduledTask -TaskName $TaskName

Start-Sleep -Seconds 2
$taskStatus = Get-ScheduledTask -TaskName $TaskName
Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "   FamilyGuard Agent Successfully Installed and Running!    " -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host "Status        : $($taskStatus.State)"
Write-Host "Install Path  : $InstallDir"
Write-Host "Server Target : $ServerUrl"
Write-Host "Task Name     : $TaskName (Viewable in Task Scheduler / taskschd.msc)"
Write-Host ""

