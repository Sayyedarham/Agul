#!/usr/bin/env python3
"""FamilyGuard endpoint agent for Windows.

Python 3.9+, standard library only. Collects non-invasive health telemetry
(via PowerShell/CIM, mirroring agent/windows/FamilyGuardAgent.ps1) and pushes
it to the FamilyGuard Supabase backend every few minutes.

Commands:
  enroll         Exchange an enrollment code for a device token (once).
  once           Collect one snapshot and POST it to /functions/v1/ingest.
  install-task   Register a Scheduled Task that runs `once` every 5 minutes.
  uninstall      Remove the Scheduled Task (and optionally the config).

Configuration is stored at C:\\ProgramData\\FamilyGuard\\config.json and the
device token is never printed or logged.
"""

import argparse
import json
import os
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

AGENT_VERSION = "1.0.0"
AGENT_NAME = "familyguard_agent.py"

CONFIG_DIR = r"C:\ProgramData\FamilyGuard"
CONFIG_PATH = os.path.join(CONFIG_DIR, "config.json")
LOG_PATH = os.path.join(CONFIG_DIR, "agent.log")

TASK_NAME = "FamilyGuardAgent"
DEFAULT_INTERVAL_SECONDS = 300


# ---------------------------------------------------------------- logging ---

def log(msg: str) -> None:
    line = "[%s] %s" % (time.strftime("%Y-%m-%d %H:%M:%S"), msg)
    print(line, flush=True)
    log_path = LOG_PATH
    try:
        if not os.path.isdir(CONFIG_DIR):
            os.makedirs(CONFIG_DIR, exist_ok=True)
    except OSError:
        log_path = os.path.join(tempfile.gettempdir(), "familyguard_agent.log")
    try:
        with open(log_path, "a", encoding="utf-8") as fh:
            fh.write(line + "\n")
    except OSError:
        pass


# ----------------------------------------------------------------- config ---

def load_config() -> dict:
    if not os.path.isfile(CONFIG_PATH):
        log("error: config not found at %s - run `enroll` first" % CONFIG_PATH)
        sys.exit(1)
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as fh:
            cfg = json.load(fh)
    except (OSError, ValueError) as exc:
        log("error: cannot read config: %s" % exc)
        sys.exit(1)
    if not cfg.get("serverUrl") or not cfg.get("deviceToken") or not cfg.get("deviceId"):
        log("error: config is incomplete (serverUrl, deviceToken, deviceId required)")
        sys.exit(1)
    return cfg


def save_config(cfg: dict) -> None:
    os.makedirs(CONFIG_DIR, exist_ok=True)
    tmp_path = CONFIG_PATH + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as fh:
        json.dump(cfg, fh, indent=2)
    os.replace(tmp_path, CONFIG_PATH)
    try:
        os.chmod(CONFIG_PATH, 0o600)  # best-effort on NTFS
    except OSError:
        pass


# ---------------------------------------------------------------- HTTP -----

def post_json(url: str, payload: dict, token: str | None = None,
              timeout: int = 25) -> tuple[int, str]:
    """POST JSON, returns (status, body). status 0 means a network failure."""
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", "replace")
    except (urllib.error.URLError, OSError) as exc:
        return 0, str(exc)


def post_with_retry(url: str, payload: dict, token: str | None = None,
                    attempts: int = 3) -> tuple[int, str]:
    last = (0, "network failure")
    for attempt in range(attempts):
        status, body = post_json(url, payload, token)
        if status in (400, 401, 403, 404, 405):
            return status, body  # hard errors: don't retry
        if status != 0:
            return status, body
        last = (status, body)
        if attempt < attempts - 1:
            time.sleep(5 * (attempt + 1))
    return last


# ----------------------------------------------------------- PowerShell -----

def run_powershell(script: str) -> str:
    proc = subprocess.run(
        ["powershell.exe", "-NoProfile", "-NonInteractive",
         "-ExecutionPolicy", "Bypass", "-Command", script],
        capture_output=True, text=True, timeout=180,
    )
    if proc.returncode != 0 or not proc.stdout.strip():
        raise RuntimeError(
            "PowerShell collection failed (exit %s): %s" %
            (proc.returncode, (proc.stderr or proc.stdout).strip()[:500])
        )
    return proc.stdout


# One PowerShell round-trip that emits a single JSON document with the raw
# Windows readings. Windows PowerShell 5.1 compatible.
PS_COLLECT_SCRIPT = r"""
$ErrorActionPreference = 'SilentlyContinue'

$os = Get-CimInstance -ClassName Win32_OperatingSystem
$cs = Get-CimInstance -ClassName Win32_ComputerSystem
$cpu = Get-CimInstance -ClassName Win32_Processor | Select-Object -First 1

# ---- memory ----
$totalMemMb = [double]$os.TotalVisibleMemorySize
$freeMemMb = [double]$os.FreePhysicalMemory
$totalGb = [math]::Round($totalMemMb / 1MB, 1)
$freeGb = [math]::Round($freeMemMb / 1MB, 1)
$usedGb = [math]::Round($totalGb - $freeGb, 1)
$usedPct = if ($totalGb -gt 0) { [math]::Round(($usedGb / $totalGb) * 100, 1) } else { 50 }

# ---- battery (desktops report 100% charging) ----
$battery = Get-CimInstance -ClassName Win32_Battery
if ($battery) {
    $batPct = [int]$battery.EstimatedChargeRemaining
    $charging = ($battery.BatteryStatus -eq 2 -or $battery.BatteryStatus -eq 6 -or $battery.BatteryStatus -eq 7)
    $estMin = $null
    if (-not $charging -and $battery.EstimatedRunTime -and $battery.EstimatedRunTime -lt 71582788) {
        $estMin = [int]$battery.EstimatedRunTime
    }
} else {
    $batPct = 100; $charging = $true; $estMin = $null
}

# ---- disks ----
$bitlocker = @{}
try {
    Get-BitLockerVolume | ForEach-Object { $bitlocker[$_.MountPoint] = ($_.ProtectionStatus -eq 1) }
} catch {}
$disks = @(Get-CimInstance -ClassName Win32_LogicalDisk -Filter "DriveType=3" | ForEach-Object {
    $total = if ($_.Size) { [math]::Round($_.Size / 1GB, 1) } else { 0 }
    $free = if ($_.FreeSpace) { [math]::Round($_.FreeSpace / 1GB, 1) } else { 0 }
    $enc = $false
    if ($bitlocker.ContainsKey($_.DeviceID + '\')) { $enc = $bitlocker[$_.DeviceID + '\'] }
    elseif ($bitlocker.ContainsKey($_.DeviceID)) { $enc = $bitlocker[$_.DeviceID] }
    [pscustomobject]@{ label = $_.DeviceID; totalGb = $total; freeGb = $free; encrypted = [bool]$enc }
})
if ($disks.Count -eq 0) {
    $disks = @([pscustomobject]@{ label = 'C:'; totalGb = 256.0; freeGb = 120.0; encrypted = $false })
}

# ---- connectivity ----
$connType = 'none'; $ssid = $null; $signal = $null
$netsh = netsh wlan show interfaces 2>$null | Out-String
if ($netsh -match 'SSID\s*:\s*(.+)') { $ssid = $matches[1].Trim(); $connType = 'wifi' }
if ($netsh -match 'Signal\s*:\s*(\d+)%') { $signal = [int]$matches[1] }
if (-not $ssid) {
    $nic = Get-CimInstance -ClassName Win32_NetworkAdapter -Filter "NetConnectionStatus=2" | Select-Object -First 1
    if ($nic) { $connType = 'ethernet' }
}

$latency = $null
$pingOut = ping -n 1 -w 1000 1.1.1.1 2>$null | Out-String
if ($pingOut -match 'time[=<]([0-9]+)ms') { $latency = [int]$matches[1] }

# ---- security ----
$mp = Get-MpComputerStatus
$defenderOn = if ($mp) { [bool]$mp.AMServiceEnabled -and [bool]$mp.AntivirusEnabled } else { $false }
$defDate = $null
if ($mp.AntivirusSignatureLastUpdated) {
    $defDate = [int64]([DateTimeOffset]::new($mp.AntivirusSignatureLastUpdated).ToUnixTimeMilliseconds())
}
$fw = @(Get-NetFirewallProfile)
$firewallOn = if ($fw.Count -gt 0) { @($fw | Where-Object { $_.Enabled }).Count -gt 0 } else { $false }

# ---- windows update / reboot ----
$pendingReboot = Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired'

# ---- crashes in last 24 h ----
$appCrashes = @(Get-WinEvent -FilterHashtable @{LogName='Application'; ProviderName='Application Error'; StartTime=(Get-Date).AddHours(-24)}).Count

# ---- cpu ----
$cores = if ($cpu.NumberOfLogicalProcessors) { [int]$cpu.NumberOfLogicalProcessors } else { 4 }

# ---- processes: two samples 1 s apart, aggregated by name ----
$procsA = @(Get-Process | ForEach-Object { [pscustomobject]@{ Name = $_.ProcessName; WS = [double]$_.WS; CPU = [double]$_.CPU } })
Start-Sleep -Milliseconds 1000
$procsB = @(Get-Process | ForEach-Object { [pscustomobject]@{ Name = $_.ProcessName; WS = [double]$_.WS; CPU = [double]$_.CPU } })
$aggA = @($procsA | Group-Object Name | ForEach-Object {
    [pscustomobject]@{ Name = $_.Name; WS = ($_.Group | Measure-Object WS -Sum).Sum; CPU = ($_.Group | Measure-Object CPU -Sum).Sum }
})
$top = @($procsB | Group-Object Name | ForEach-Object {
    [pscustomobject]@{ Name = $_.Name; WS = ($_.Group | Measure-Object WS -Sum).Sum; CPU = ($_.Group | Measure-Object CPU -Sum).Sum }
} | Sort-Object WS -Descending | Select-Object -First 15 | ForEach-Object {
    $name = $_.Name
    $a = $aggA | Where-Object { $_.Name -eq $name } | Select-Object -First 1
    $delta = 0
    if ($a) { $delta = [math]::Max(0, $_.CPU - $a.CPU) }
    $cpuPct = [math]::Round(($delta / [math]::Max(1, $cores)) * 100, 1)
    [pscustomobject]@{ name = $_.Name; memMb = [math]::Round($_.WS / 1MB, 1); cpuPct = $cpuPct }
})

# ---- cpu load: perf counter with process-sum fallback ----
$loadPct = 0
try {
    $samples = (Get-Counter '\Processor(_Total)\% Processor Time' -SampleInterval 1 -MaxSamples 2).CounterSamples.CookedValue
    if ($samples -is [array]) { $loadPct = [math]::Round((($samples | Measure-Object -Average).Average), 1) }
    else { $loadPct = [math]::Round([double]$samples, 1) }
} catch {}
if ($loadPct -le 0 -and $top.Count -gt 0) {
    $loadPct = [math]::Round((($top | Measure-Object -Property cpuPct -Sum).Sum), 1)
}

# ---- uptime ----
$uptimeSec = [int64]((Get-Date) - $os.LastBootUpTime).TotalSeconds
$lastBootMs = $null
if ($os.LastBootUpTime) { $lastBootMs = [int64]([DateTimeOffset]::new($os.LastBootUpTime).ToUnixTimeMilliseconds()) }

$result = [ordered]@{
    hostname = [string]$env:COMPUTERNAME
    osVersion = [string]$os.Caption
    osBuild = [string]$os.BuildNumber
    deviceModel = [string]$cs.Model
    totalMemGb = $totalGb
    usedMemGb = $usedGb
    usedMemPct = $usedPct
    cpuModel = [string]$cpu.Name
    cpuCores = $cores
    cpuLoadPct = $loadPct
    batteryPct = $batPct
    batteryCharging = [bool]$charging
    batteryEstMinutes = $estMin
    disks = @($disks)
    connType = $connType
    ssid = $ssid
    signalPct = $signal
    latencyMs = $latency
    defenderOn = [bool]$defenderOn
    defenderDefDateMs = $defDate
    firewallOn = [bool]$firewallOn
    pendingReboot = [bool]$pendingReboot
    appCrashes24h = [int]$appCrashes
    uptimeSeconds = $uptimeSec
    lastBootAtMs = $lastBootMs
    processes = @($top)
}
ConvertTo-Json $result -Depth 4 -Compress
"""


def collect_snapshot(device_id: str) -> dict:
    raw = json.loads(run_powershell(PS_COLLECT_SCRIPT))
    now_ms = int(time.time() * 1000)

    def num(value, default=0):
        return value if isinstance(value, (int, float)) else default

    disks = raw.get("disks") or []
    storage = [
        {
            "label": str(d.get("label", "C:")),
            "totalGb": num(d.get("totalGb")),
            "freeGb": num(d.get("freeGb")),
            "encrypted": bool(d.get("encrypted", False)),
            "smartStatus": "unknown",
        }
        for d in disks
        if isinstance(d, dict)
    ]

    processes = [
        {
            "name": str(p.get("name", ""))[:100],
            "memMb": round(num(p.get("memMb")), 1),
            "cpuPct": round(num(p.get("cpuPct")), 1),
        }
        for p in (raw.get("processes") or [])
        if isinstance(p, dict) and p.get("name")
    ][:15]

    used_pct = num(raw.get("usedMemPct"), 50)
    latency = raw.get("latencyMs")
    return {
        "deviceId": device_id,
        "collectedAt": now_ms,
        "agentVersion": AGENT_VERSION,
        "deviceModel": str(raw.get("deviceModel") or "") or None,
        "battery": {
            "pct": num(raw.get("batteryPct"), 100),
            "charging": bool(raw.get("batteryCharging", True)),
            "estimatedMinutesRemaining": raw.get("batteryEstMinutes"),
            "healthPct": None,
            "cycleCount": None,
        },
        "memory": {
            "totalGb": num(raw.get("totalMemGb"), 8),
            "usedGb": num(raw.get("usedMemGb"), 4),
            "usedPct": used_pct,
            "sustainedHighPct": used_pct > 85,
        },
        "storage": storage,
        "connectivity": {
            "online": True,
            "type": str(raw.get("connType") or "none"),
            "ssid": raw.get("ssid"),
            "signalPct": raw.get("signalPct"),
            "latencyMs": latency if isinstance(latency, (int, float)) else None,
            "lastNetworkChangeAt": now_ms,
        },
        "boot": {
            "lastBootAt": raw.get("lastBootAtMs") or now_ms,
            "uptimeSeconds": num(raw.get("uptimeSeconds")),
            "lastBootDurationMs": None,
            "unexpectedShutdownsLast30d": 0,
            "restartPendingForUpdate": bool(raw.get("pendingReboot", False)),
        },
        "windowsHealth": {
            "version": str(raw.get("osVersion") or "Windows"),
            "build": str(raw.get("osBuild") or ""),
            "updateStatus": "pending" if raw.get("pendingReboot") else "up_to_date",
            "pendingRestart": bool(raw.get("pendingReboot", False)),
            "lastUpdateAt": None,
            "activationStatus": "unknown",
        },
        "security": {
            "defenderEnabled": bool(raw.get("defenderOn", False)),
            "definitionDate": raw.get("defenderDefDateMs"),
            "lastScanAt": None,
            "firewallEnabled": bool(raw.get("firewallOn", False)),
            "bitlockerEnabled": any(d.get("encrypted") for d in storage),
            "tpmPresent": False,
        },
        "reliability": {
            "appCrashes24h": int(num(raw.get("appCrashes24h"))),
            "bsodLast30d": 0,
            "lastBsodAt": None,
            "failedServicesCount": 0,
            "failedServiceNames": [],
        },
        "peripherals": {
            "usb": [],
            "bluetooth": [],
        },
        "cpu": {
            "model": str(raw.get("cpuModel") or "Unknown CPU"),
            "cores": int(num(raw.get("cpuCores"), 4)),
            "loadPct": num(raw.get("cpuLoadPct")),
        },
        "processes": processes,
    }


# -------------------------------------------------------------- commands ---

def cmd_enroll(args: argparse.Namespace) -> None:
    server = args.server.rstrip("/")
    code = args.code.strip().upper()
    device_name = socket.gethostname()
    nickname = (args.nickname or "").strip() or device_name

    if len(code) != 8:
        log("error: enrollment code must be 8 characters")
        sys.exit(1)

    log("Enrolling device %s with code at %s ..." % (device_name, server))
    status, body = post_json(
        server + "/functions/v1/enroll",
        {"code": code, "deviceName": device_name, "nickname": nickname},
    )
    if status != 201:
        log("error: enrollment failed (HTTP %s): %s" % (status, body[:300]))
        sys.exit(1)

    try:
        result = json.loads(body)
        token = result["deviceToken"]
        device_id = result["device"]["id"]
    except (ValueError, KeyError) as exc:
        log("error: unexpected enroll response: %s" % exc)
        sys.exit(1)

    cfg = {
        "serverUrl": server,
        "deviceToken": token,   # never printed or logged
        "deviceId": device_id,
        "nickname": nickname,
        "intervalSeconds": args.interval or DEFAULT_INTERVAL_SECONDS,
    }
    save_config(cfg)
    log("Enrollment complete. Device id: %s" % device_id)
    log("Config saved to %s (device token stored, not displayed)." % CONFIG_PATH)
    log("Next: run `python %s install-task` to schedule check-ins." % AGENT_NAME)


def cmd_once(_args: argparse.Namespace) -> None:
    cfg = load_config()
    device_id = cfg["deviceId"]
    server = cfg["serverUrl"].rstrip("/")
    token = cfg["deviceToken"]

    try:
        snapshot = collect_snapshot(device_id)
    except (RuntimeError, ValueError) as exc:
        log("error: telemetry collection failed: %s" % exc)
        sys.exit(1)

    url = server + "/functions/v1/ingest"
    status, body = post_with_retry(url, snapshot, token=token, attempts=3)

    if status == 200:
        log("check-in ok")
        sys.exit(0)
    if status == 429:
        log("check-in skipped (throttled, another check-in was recent)")
        sys.exit(0)
    if status == 0 or status >= 500:
        # Transient network/server failure: the next scheduled run will retry.
        log("check-in deferred (transient failure): %s" % body[:300])
        sys.exit(0)
    log("check-in failed (HTTP %s): %s" % (status, body[:300]))
    sys.exit(1)


def cmd_install_task(_args: argparse.Namespace) -> None:
    load_config()  # only install when the device is enrolled

    pythonw = os.path.join(os.path.dirname(sys.executable), "pythonw.exe")
    if not os.path.isfile(pythonw):
        pythonw = sys.executable
    agent_path = os.path.abspath(__file__)

    task_run = '"%s" "%s" once' % (pythonw, agent_path)
    command = [
        "schtasks", "/create", "/tn", TASK_NAME, "/tr", task_run,
        "/sc", "minute", "/mo", "5", "/ru", "SYSTEM", "/rl", "HIGHEST", "/f",
    ]
    log("Creating scheduled task (requires administrator):")
    log(" ".join('"%s"' % c if " " in c and not c.startswith(("/", "\\")) else c for c in command))
    proc = subprocess.run(command, capture_output=True, text=True)
    # schtasks returns 0 on success and also for a few non-fatal codes
    if proc.returncode != 0:
        log("schtasks exit code %s: %s" % (proc.returncode, (proc.stdout + proc.stderr).strip()))
        log("If you see 'Access is denied', run this shell as Administrator.")
        sys.exit(1)
    log("Scheduled task %s created (runs every 5 minutes as SYSTEM)." % TASK_NAME)
    log("Verify with: schtasks /query /tn %s" % TASK_NAME)


def cmd_uninstall(args: argparse.Namespace) -> None:
    log("Removing scheduled task %s ..." % TASK_NAME)
    proc = subprocess.run(
        ["schtasks", "/delete", "/tn", TASK_NAME, "/f"],
        capture_output=True, text=True,
    )
    if proc.returncode != 0 and "cannot find" not in (proc.stdout + proc.stderr).lower():
        log("schtasks exit code %s: %s" % (proc.returncode, (proc.stdout + proc.stderr).strip()))
        sys.exit(1)
    log("Scheduled task removed.")

    if args.remove_config:
        if os.path.isfile(CONFIG_PATH):
            os.remove(CONFIG_PATH)
            log("Removed %s" % CONFIG_PATH)
    else:
        log("Config kept at %s (pass --remove-config to delete it)." % CONFIG_PATH)


def main() -> None:
    parser = argparse.ArgumentParser(prog=AGENT_NAME, description="FamilyGuard Windows endpoint agent")
    sub = parser.add_subparsers(dest="command", required=True)

    p_enroll = sub.add_parser("enroll", help="exchange an enrollment code for a device token")
    p_enroll.add_argument("--server", required=True, help="Supabase project URL, e.g. https://<ref>.supabase.co")
    p_enroll.add_argument("--code", required=True, help="8-character enrollment code from the admin site")
    p_enroll.add_argument("--nickname", help="friendly name for the device (default: hostname)")
    p_enroll.add_argument("--interval", type=int, help="check-in interval in seconds (default 300)")
    p_enroll.set_defaults(func=cmd_enroll)

    p_once = sub.add_parser("once", help="collect one snapshot and check in")
    p_once.set_defaults(func=cmd_once)

    p_task = sub.add_parser("install-task", help="register the every-5-minutes scheduled task")
    p_task.set_defaults(func=cmd_install_task)

    p_rm = sub.add_parser("uninstall", help="remove the scheduled task")
    p_rm.add_argument("--remove-config", action="store_true",
                      help="also delete C:\\ProgramData\\FamilyGuard\\config.json")
    p_rm.set_defaults(func=cmd_uninstall)

    args = parser.parse_args()
    if os.name != "nt":
        log("error: this agent is Windows-only")
        sys.exit(1)
    args.func(args)


if __name__ == "__main__":
    main()
