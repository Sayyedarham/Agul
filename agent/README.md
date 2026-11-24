# FamilyGuard Windows Agent (Python)

The FamilyGuard agent runs on each child PC, collects a health snapshot
(battery, RAM, CPU, disks, network, Defender, firewall, updates, top
processes), and pushes it to the FamilyGuard Supabase backend every 5 minutes.
The parent sees everything on the admin website — no server is hosted on the
child PC.

- Python 3.9+, **standard library only** (no `pip install` needed).
- Windows only. All data comes from PowerShell/CIM queries (see
  `agent/windows/FamilyGuardAgent.ps1` for the original PowerShell collector).
- The device token is stored in `C:\ProgramData\FamilyGuard\config.json` and
  is never printed or written to the log.

## Install on a child PC

1. Install Python 3.9+ from python.org (check "Add python.exe to PATH").
   Copy `familyguard_agent.py` to a permanent location, e.g.
   `C:\FamilyGuard\familyguard_agent.py`.

2. On the **parent's** admin website, open *Enroll Device* and copy the
   8-character enrollment code (it expires after 15 minutes).

3. On the child PC, open an **Administrator** PowerShell/Command Prompt and
   enroll (replace the URL with your Supabase project URL):

   ```bat
   python C:\FamilyGuard\familyguard_agent.py enroll ^
     --server https://<your-project-ref>.supabase.co ^
     --code ABCD1234 ^
     --nickname "Emma's Laptop"
   ```

   This registers the device and writes `C:\ProgramData\FamilyGuard\config.json`.

4. Schedule the every-5-minutes check-in (still in the Administrator shell):

   ```bat
   python C:\FamilyGuard\familyguard_agent.py install-task
   ```

   This creates a Scheduled Task named `FamilyGuardAgent` that runs
   `<pythonw.exe> familyguard_agent.py once` every 5 minutes as SYSTEM.

5. Verify:

   ```bat
   schtasks /query /tn FamilyGuardAgent
   python C:\FamilyGuard\familyguard_agent.py once
   ```

   The parent dashboard should show the device online with its first snapshot
   within a minute. Logs go to `C:\ProgramData\FamilyGuard\agent.log`.

## Uninstall

```bat
schtasks /delete /tn FamilyGuardAgent /f
python C:\FamilyGuard\familyguard_agent.py uninstall --remove-config
```

`--remove-config` deletes the saved device token; without it the config is
kept so the device can be re-registered without a new enrollment code
(re-enrollment is still recommended after a revoke).

## PyInstaller note

If you do not want Python installed on the child PC, build a standalone
`.exe`:

```bat
pip install pyinstaller
pyinstaller --onefile --name FamilyGuardAgent familyguard_agent.py
```

The `.exe` supports the same commands
(`FamilyGuardAgent.exe enroll --server ... --code ...`, `install-task`,
`once`, `uninstall`). When run with `pythonw.exe` or as an `.exe`, console
output goes to `agent.log` only.

## What is collected (and what is not)

Collected: OS version/build, hostname, uptime, RAM total/used, CPU
model/cores/load, top 15 process **names** with memory and CPU usage, disk
free/total per fixed drive, battery percentage/charging state, network
type/SSID/signal/latency, Defender and firewall state, pending-reboot flag,
and app-crash count for the last 24 hours.

Never collected: keystrokes, screenshots, webcam/microphone, browser history,
window titles, file paths, or chat contents.
