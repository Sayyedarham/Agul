# FamilyGuard — Windows Family Device-Health & Parental-Control Platform

FamilyGuard is a consent-first, privacy-respecting Windows device-health and parental-control platform. It allows parents to register Windows laptops, view real-time endpoint health in an intuitive dashboard, receive actionable human-language alerts, and manage transparent parental-control policies.

FamilyGuard is explicitly architected to **prevent covert monitoring or surveillance**. It operates as a visible Windows service with clear child notice, collects only essential hardware and operational health telemetry, and enforces transparent boundaries.

---

## Table of Contents

1. [Key Capabilities](#key-capabilities)
2. [Architecture Overview](#architecture-overview)
3. [Consent & Privacy Architecture](#consent--privacy-architecture)
4. [Device Registration & Enrollment Flow](#device-registration--enrollment-flow)
5. [Health Monitoring & Alert Engine](#health-monitoring--alert-engine)
6. [Parental-Control Policy Management](#parental-control-policy-management)
7. [Windows Agent Integration Contract](#windows-agent-integration-contract)
8. [Getting Started & Local Testing](#getting-started--local-testing)
9. [Database Schema & Cloud Authentication](#database-schema--cloud-authentication)

---

## 1. Key Capabilities

- **Device Inventory**: View all family laptops, friendly nicknames, child profile assignments, Windows build version, device model, serial number, agent version, online/offline status, and last sync timestamp.
- **Health Classification**: Instant status categorization for every device:
  - `Healthy` (green): All diagnostics within normal operating parameters.
  - `Needs Attention` (amber): Impending issues (e.g. storage < 10 GB, battery low, updates pending).
  - `Offline` (slate): Laptop has not reported for > 24 hours.
- **Actionable Alerts**: Human-language notifications (e.g. *"Battery is at 12% and not charging"*, *"Only 6.4 GB of storage remains on C:"*, *"Microsoft Defender is turned off"*). Automatic 4-hour deduplication suppresses noisy repeat alerts.
- **Detailed Health Diagnostics**:
  - **Battery**: Charge percentage, charging state, estimated run-time, wear/health %, and cycle counts.
  - **Storage**: Per-drive capacity, free space, BitLocker encryption status, and S.M.A.R.T. health.
  - **Memory**: Total and used RAM in GB, usage percentage, and sustained high-memory detection.
  - **Connectivity**: Wi-Fi/Ethernet link type, SSID, signal strength, latency RTT, and last network change.
  - **Boot & OS**: Uptime, last boot timestamp, boot duration, unexpected shutdowns, and Windows Update pending status.
  - **Security**: Defender real-time protection, definition freshness, firewall status, BitLocker, and TPM presence.
  - **Reliability**: Application crash counts (last 24h), BSOD event history (last 30d), and failed system services.
  - **Peripherals**: Connected USB and Bluetooth peripherals with new-device detection.
- **Transparent Parental Controls**:
  - Bedtime schedules (configurable start/end hours and day-of-week recurrence).
  - Daily screen-time limits.
  - Process application blocking (e.g. `discord.exe`, `steam.exe`) utilizing native Windows AppLocker and Parental Control mechanisms.
  - Real-time policy state tracking: `active`, `pending`, `failed`, or `not_applied`.

---

## 2. Architecture Overview

```
┌────────────────────────────────────────────────────────┐
│               FamilyGuard Web Dashboard                │
│    (React 19 · Vite 8 · Tailwind CSS · Lucide Icons)   │
└───────────────────────────▲────────────────────────────┘
                            │ REST APIs & Server-Sent Events (SSE)
┌───────────────────────────▼────────────────────────────┐
│              FamilyGuard Backend Service               │
│     (Express · TypeScript · Alert Engine · SSE Stream) │
└─────────────▲────────────────────────────▲─────────────┘
              │ Bearer Auth & TLS          │ Optional Cloud Sync
┌─────────────▼──────────────┐ ┌───────────▼─────────────┐
│    Windows Native Agent    │ │   Supabase Cloud / RLS  │
│  (FamilyGuardAgent.exe)    │ │ (Parent Auth & Database)│
│  · WMI / CIM Collectors    │ └─────────────────────────┘
│  · Event Log & Power APIs  │
│  · Local Policy Cache      │
└────────────────────────────┘
```

- **Frontend (`src/`)**: Single-page application featuring Parent Overview, Device Health Inspector, Actionable Alert Feed, Enrollment Management, and Privacy Commitments.
- **Backend (`server/`)**: Express server providing family REST endpoints, Server-Sent Events (SSE) for live telemetry updates, deduplicated alert generation, and policy state machine.
- **Data Stores**:
  - In-memory reactive state with `.data/family-state.json` persistence for local and self-hosted deployments.
  - Supabase PostgreSQL schema with Row-Level Security (`supabase/schema.sql`) for authenticated parent cloud deployments.

---

## 3. Consent & Privacy Architecture

FamilyGuard is strictly engineered as a **family care and maintenance platform**, not a covert surveillance tool.

### What FamilyGuard Collects
- Battery wear, charge levels, and power state
- Storage capacity, disk usage, and BitLocker encryption status
- System RAM utilization and memory pressure
- Network interface type, Wi-Fi signal percentage, and ping latency
- Windows Update readiness, pending reboot state, and OS build version
- Microsoft Defender and Windows Firewall operational health
- System stability indicators (crash events, BSOD frequency, service failures)
- USB / Bluetooth peripheral connection notifications

### What FamilyGuard NEVER Collects
- ❌ **No Keystrokes or Passwords**: No keylogging or input interception.
- ❌ **No Camera or Microphone**: No audio or video capture capabilities.
- ❌ **No Screen Capture**: No remote screen viewing, recording, or live desktop streaming.
- ❌ **No Private Content**: No inspection of emails, chat messages, or personal documents.
- ❌ **No Web Browsing History**: No tracking of visited URLs, search queries, or incognito content.
- ❌ **No Covert GPS Tracking**: No covert location snooping.

### Transparency & Child Notice
1. **Visible Service**: The Windows agent installs as `FamilyGuardAgent.exe` and is visibly listed in Windows Services (`services.msc`) and Task Manager.
2. **Managed Device Indicator**: Upon enrollment, Windows displays a persistent system notification: *"This device is enrolled in FamilyGuard. System health and schedule policies are active."*
3. **Instant Unenrollment**: Parents can revoke registration at any time, immediately purging all telemetry and restoring default local Windows settings.

---

## 4. Device Registration & Enrollment Flow

Enrollment requires explicit physical or parent-approved access to the Windows device:

```
[ Parent Dashboard ]
        │  Generates one-time 8-char code (expires in 15 min)
        ▼
   "8F4B-92E1"
        │  Entered into Windows Agent installer
        ▼
[ Windows Agent ]
        │  POST /api/family/agent/enroll
        ▼
[ Backend Service ]
        │  Validates code, provisions unique cryptographic deviceToken
        ▼
[ Windows Agent ]
        │  Stores deviceToken securely in Windows DPAPI / Credential Vault
        │  Displays enrollment confirmation on child's desktop
```

---

## 5. Health Monitoring & Alert Engine

The backend evaluation engine checks every incoming snapshot against configurable rules and enforces a **4-hour deduplication window**:

| Rule ID | Condition | Severity | Actionable Message |
|---|---|---|---|
| `BAT-CRIT` | Battery < 5% & not charging | Critical | *“Battery at {n}% – device may shut down soon.”* |
| `BAT-LOW` | Battery < 15% & not charging | Warning | *“Battery is at {n}% and not charging.”* |
| `STOR-LOW` | Drive free space < 10 GB | Warning | *“Only {n} GB of storage remains on {drive}.”* |
| `SEC-DEF` | Defender real-time disabled | Critical | *“Microsoft Defender is turned off. The device may be at risk.”* |
| `SEC-FW` | Windows Firewall disabled | Warning | *“Windows Firewall is disabled.”* |
| `SEC-UPD` | Updates pending or failed | Warning | *“Windows security updates are pending.”* |
| `BSOD` | BSOD within last 7 days | Warning | *“A system crash (BSOD) occurred {n} days ago.”* |
| `MEM-HIGH` | Sustained RAM > 90% | Warning | *“Memory usage is critically high ({n}%).”* |
| `OFFLINE` | Last sync > 24 hours | Warning | *“This laptop has not checked in for {n} hours.”* |
| `USB-NEW` | New USB connected < 5m | Info | *“A new USB device was connected: {name}.”* |

---

## 6. Parental-Control Policy Management

Parental controls use transparent Windows APIs:

### Bedtime Schedules
- Configurable sleep window (e.g., `21:30` to `07:00`).
- Recurrence mask for school nights vs. weekends.
- Enforced via Windows Lock Screen and Scheduled Task hooks with safe recovery PIN.

### Application Restrictions
- Blocks specific process executables (e.g. `discord.exe`, `steam.exe`).
- Enforced transparently via Windows Software Restriction Policies / AppLocker.
- Child receives a standard Windows message: *"This app has been restricted by FamilyGuard policy."*

### Policy State Transitions
- `apply`: Parent saves changes in dashboard $\rightarrow$ Policy marked `pending`.
- `confirm`: Windows agent downloads and applies policy $\rightarrow$ Policy marked `active`.
- `fail`: Agent encounters conflict $\rightarrow$ Policy marked `failed` with diagnostic reason.
- `revoke`: Device unlinked $\rightarrow$ Policy reset to `not_applied`.

---

## 7. Windows Agent Integration Contract

### Agent Check-in Endpoint
- **Method**: `POST /api/family/agent/checkin`
- **Header**: `Authorization: Bearer <deviceToken>`
- **Content-Type**: `application/json`

#### Request Payload
```json
{
  "deviceToken": "fg-tok-98fa201b...",
  "snapshot": {
    "deviceId": "dev-3f2a1b0c",
    "collectedAt": 1732101000000,
    "battery": {
      "pct": 82,
      "charging": false,
      "estimatedMinutesRemaining": 240,
      "healthPct": 94,
      "cycleCount": 112
    },
    "memory": {
      "totalGb": 16.0,
      "usedGb": 7.4,
      "usedPct": 46.2,
      "sustainedHighPct": false
    },
    "storage": [
      {
        "label": "C:",
        "totalGb": 512,
        "freeGb": 184,
        "encrypted": true,
        "smartStatus": "healthy"
      }
    ],
    "connectivity": {
      "online": true,
      "type": "wifi",
      "ssid": "Home-5G",
      "signalPct": 88,
      "latencyMs": 18,
      "lastNetworkChangeAt": 1732085000000
    },
    "boot": {
      "lastBootAt": 1732014000000,
      "uptimeSeconds": 87000,
      "lastBootDurationMs": 14200,
      "unexpectedShutdownsLast30d": 0,
      "restartPendingForUpdate": false
    },
    "windowsHealth": {
      "version": "Windows 11 Home",
      "build": "26100.3775",
      "updateStatus": "up_to_date",
      "pendingRestart": false,
      "lastUpdateAt": 1731500000000,
      "activationStatus": "activated"
    },
    "security": {
      "defenderEnabled": true,
      "definitionDate": 1732098000000,
      "lastScanAt": 1732012000000,
      "firewallEnabled": true,
      "bitlockerEnabled": true,
      "tpmPresent": true
    },
    "reliability": {
      "appCrashes24h": 0,
      "bsodLast30d": 0,
      "lastBsodAt": null,
      "failedServicesCount": 0,
      "failedServiceNames": []
    },
    "peripherals": {
      "usb": [
        {
          "id": "usb-01",
          "name": "Logitech USB Receiver",
          "type": "usb",
          "connectedAt": 1732014000000,
          "trusted": true
        }
      ],
      "bluetooth": []
    }
  },
  "immediateEvents": []
}
```

#### Response Payload
```json
{
  "policy": {
    "deviceId": "dev-3f2a1b0c",
    "bedtime": {
      "enabled": true,
      "startTime": "21:30",
      "endTime": "07:00",
      "days": [0, 1, 2, 3, 4]
    },
    "screenTimeLimitMinutes": 120,
    "blockedApps": ["discord.exe", "steam.exe"],
    "allowedApps": null,
    "usbPolicy": "report",
    "state": "active",
    "lastAppliedAt": 1732101005000,
    "lastFailureReason": null
  },
  "commands": []
}
```

---

## 8. Getting Started & Local Testing

### Prerequisites
- Node.js 20+
- npm or pnpm

### Running the Platform
```powershell
# Install dependencies
npm install

# Start the full stack (API server + Vite frontend)
npm run dev
```

Visit `http://localhost:3000` to access the parent console.

### Running Automated Tests
```powershell
# Run the complete test suite (Alerts, Deduplication, Policies, Enrollment)
npm test

# Type-check TypeScript codebase
npm run lint
```

---

## 9. Database Schema & Cloud Authentication

To deploy with Supabase Cloud:
1. Create a Supabase project.
2. Execute `supabase/schema.sql` in the Supabase SQL Editor.
3. Configure `.env` with:
   ```env
   VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
   ```
4. Restart the server. The dashboard will automatically present the authenticated parent login gate and enforce PostgreSQL Row-Level Security.
