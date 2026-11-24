// ============================================================
// FamilyGuard – Server-side mock data store
// ============================================================
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import type {
  AgentCheckinPayload,
  AgentCheckinResponse,
  AgentCommand,
  BedtimeSchedule,
  DeviceAlert,
  EnrollmentCode,
  FamilyDevice,
  FamilyState,
  HealthSnapshot,
  ParentalPolicy,
} from '../src/types/family.ts';

// ------------------------------------------------------------------ paths ---
const DATA_DIR = path.resolve(process.cwd(), '.data');
const STATE_FILE = path.join(DATA_DIR, 'family-state.json');

// ------------------------------------------------------------ time helpers ---
const now = () => Date.now();
const daysAgo = (d: number) => now() - d * 86_400_000;
const hoursAgo = (h: number) => now() - h * 3_600_000;
const minutesAgo = (m: number) => now() - m * 60_000;

// ------------------------------------------------------- alert rule engine ---
interface AlertRule {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  dedupWindowMs: number;
  check: (snap: HealthSnapshot) => string | null;
}

const FOUR_HOURS = 4 * 60 * 60 * 1000;
const SEVEN_DAYS = 7 * 86_400_000;

const ALERT_RULES: AlertRule[] = [
  {
    id: 'BAT-CRIT',
    severity: 'critical',
    dedupWindowMs: FOUR_HOURS,
    check: (s) =>
      s.battery.pct < 5 && !s.battery.charging
        ? `Battery at ${s.battery.pct}% – device may shut down soon.`
        : null,
  },
  {
    id: 'BAT-LOW',
    severity: 'warning',
    dedupWindowMs: FOUR_HOURS,
    check: (s) =>
      s.battery.pct < 15 && s.battery.pct >= 5 && !s.battery.charging
        ? `Battery is at ${s.battery.pct}% and not charging.`
        : null,
  },
  {
    id: 'STOR-LOW',
    severity: 'warning',
    dedupWindowMs: FOUR_HOURS,
    check: (s) => {
      const drive = s.storage.find((d) => d.freeGb < 10);
      return drive
        ? `Only ${drive.freeGb.toFixed(1)} GB of storage remains on ${drive.label}.`
        : null;
    },
  },
  {
    id: 'SEC-DEF',
    severity: 'critical',
    dedupWindowMs: FOUR_HOURS,
    check: (s) =>
      !s.security.defenderEnabled
        ? 'Microsoft Defender is turned off. The device may be at risk.'
        : null,
  },
  {
    id: 'SEC-FW',
    severity: 'warning',
    dedupWindowMs: FOUR_HOURS,
    check: (s) =>
      !s.security.firewallEnabled ? 'Windows Firewall is disabled.' : null,
  },
  {
    id: 'SEC-UPD',
    severity: 'warning',
    dedupWindowMs: FOUR_HOURS,
    check: (s) =>
      s.windowsHealth.updateStatus === 'pending' ||
      s.windowsHealth.updateStatus === 'failed'
        ? 'Windows security updates are pending.'
        : null,
  },
  {
    id: 'BSOD',
    severity: 'warning',
    dedupWindowMs: FOUR_HOURS,
    check: (s) => {
      if (
        s.reliability.bsodLast30d > 0 &&
        s.reliability.lastBsodAt !== null &&
        now() - s.reliability.lastBsodAt < SEVEN_DAYS
      ) {
        const daysAgoN = Math.floor((now() - s.reliability.lastBsodAt) / 86_400_000);
        return `A system crash (BSOD) occurred ${daysAgoN} day(s) ago.`;
      }
      return null;
    },
  },
  {
    id: 'MEM-HIGH',
    severity: 'warning',
    dedupWindowMs: FOUR_HOURS,
    check: (s) =>
      s.memory.usedPct > 90
        ? `Memory usage is critically high (${s.memory.usedPct}%).`
        : null,
  },
  {
    id: 'USB-NEW',
    severity: 'info',
    dedupWindowMs: FOUR_HOURS,
    check: (s) => {
      const fresh = s.peripherals.usb.find(
        (u) => now() - u.connectedAt < 5 * 60_000,
      );
      return fresh ? `New USB device connected: "${fresh.name}".` : null;
    },
  },
];

function evaluateAlerts(
  device: FamilyDevice,
  snap: HealthSnapshot,
  existing: DeviceAlert[],
): DeviceAlert[] {
  const newAlerts: DeviceAlert[] = [];
  for (const rule of ALERT_RULES) {
    const message = rule.check(snap);
    if (!message) continue;
    const dedupKey = `${device.id}:${rule.id}`;
    const cutoff = now() - rule.dedupWindowMs;
    const dupe = existing.find(
      (a) =>
        a.dedupKey === dedupKey &&
        a.resolvedAt === null &&
        a.createdAt > cutoff,
    );
    if (dupe) continue;
    newAlerts.push({
      id: `alert-${randomUUID()}`,
      deviceId: device.id,
      ruleId: rule.id,
      severity: rule.severity,
      message,
      createdAt: now(),
      resolvedAt: null,
      dedupKey,
      acknowledged: false,
    });
  }
  return newAlerts;
}

function checkOfflineAlert(
  device: FamilyDevice,
  existing: DeviceAlert[],
): DeviceAlert | null {
  if (now() - device.lastSyncAt < 24 * 3_600_000) return null;
  const dedupKey = `${device.id}:OFFLINE`;
  const cutoff = now() - FOUR_HOURS;
  if (existing.find((a) => a.dedupKey === dedupKey && a.resolvedAt === null && a.createdAt > cutoff))
    return null;
  return {
    id: `alert-${randomUUID()}`,
    deviceId: device.id,
    ruleId: 'OFFLINE',
    severity: 'warning',
    message: `Device has not synced in over 24 hours.`,
    createdAt: now(),
    resolvedAt: null,
    dedupKey,
    acknowledged: false,
  };
}

// ---------------------------------------------------------- health classifier
function classifyHealth(device: FamilyDevice, snap: HealthSnapshot | null): import('../src/types/family.ts').HealthClass {
  if (!device.online || !snap) return 'offline';
  const hasC = ALERT_RULES.some(
    (r) => r.severity === 'critical' && r.check(snap),
  );
  if (hasC) return 'needs_attention';
  const hasW = ALERT_RULES.some(
    (r) => r.severity === 'warning' && r.check(snap),
  );
  return hasW ? 'needs_attention' : 'healthy';
}

// ----------------------------------------------------------------- seeding ---
function buildSnapshot(deviceId: string, overrides: Partial<HealthSnapshot> = {}): HealthSnapshot {
  const base: HealthSnapshot = {
    deviceId,
    collectedAt: now(),
    battery: {
      pct: 72,
      charging: false,
      estimatedMinutesRemaining: 190,
      healthPct: 91,
      cycleCount: 243,
    },
    memory: {
      totalGb: 16,
      usedGb: 7.4,
      usedPct: 46,
      sustainedHighPct: false,
    },
    storage: [
      {
        label: 'C:',
        totalGb: 512,
        freeGb: 148,
        encrypted: true,
        smartStatus: 'healthy',
      },
    ],
    connectivity: {
      online: true,
      type: 'wifi',
      ssid: 'HomeNetwork',
      signalPct: 78,
      latencyMs: 14,
      lastNetworkChangeAt: hoursAgo(3),
    },
    boot: {
      lastBootAt: hoursAgo(18),
      uptimeSeconds: 18 * 3600,
      lastBootDurationMs: 22_400,
      unexpectedShutdownsLast30d: 0,
      restartPendingForUpdate: false,
    },
    windowsHealth: {
      version: 'Windows 11 Home',
      build: '26100.3775',
      updateStatus: 'up_to_date',
      pendingRestart: false,
      lastUpdateAt: daysAgo(3),
      activationStatus: 'activated',
    },
    security: {
      defenderEnabled: true,
      definitionDate: daysAgo(1),
      lastScanAt: hoursAgo(6),
      firewallEnabled: true,
      bitlockerEnabled: true,
      tpmPresent: true,
    },
    reliability: {
      appCrashes24h: 0,
      bsodLast30d: 0,
      lastBsodAt: null,
      failedServicesCount: 0,
      failedServiceNames: [],
    },
    peripherals: {
      usb: [],
      bluetooth: [
        {
          id: 'bt-headphones',
          name: 'Sony WH-1000XM5',
          type: 'bluetooth',
          connectedAt: hoursAgo(2),
          trusted: true,
        },
      ],
    },
  };

  // Deep-merge overrides at top level (snapshot sections)
  return { ...base, ...overrides } as HealthSnapshot;
}

function buildSeedState(): FamilyState {
  const t = now();

  // ---- Children / User profiles ----
  const emma: import('../src/types/family.ts').ChildProfile = { id: 'child-emma', name: 'Emma', avatarColor: '#E91E8C' };
  const jake: import('../src/types/family.ts').ChildProfile = { id: 'child-jake', name: 'Jake', avatarColor: '#3F51B5' };
  const dad: import('../src/types/family.ts').ChildProfile = { id: 'parent-dad', name: 'Dad', avatarColor: '#009688' };
  const shared: import('../src/types/family.ts').ChildProfile = { id: 'shared-living', name: 'Shared', avatarColor: '#795548' };

  // ---- Snapshots ----
  // Device 1: Emma's Surface Pro – mostly healthy, low battery
  const snap1 = buildSnapshot('dev-emma-01', {
    battery: {
      pct: 12,
      charging: false,
      estimatedMinutesRemaining: 28,
      healthPct: 88,
      cycleCount: 312,
    },
    memory: { totalGb: 16, usedGb: 8.9, usedPct: 56, sustainedHighPct: false },
    storage: [
      { label: 'C:', totalGb: 256, freeGb: 64, encrypted: true, smartStatus: 'healthy' },
    ],
    connectivity: {
      online: true,
      type: 'wifi',
      ssid: 'HomeNetwork-5G',
      signalPct: 92,
      latencyMs: 11,
      lastNetworkChangeAt: hoursAgo(1),
    },
    boot: {
      lastBootAt: hoursAgo(6),
      uptimeSeconds: 6 * 3600,
      lastBootDurationMs: 18_200,
      unexpectedShutdownsLast30d: 1,
      restartPendingForUpdate: false,
    },
    windowsHealth: {
      version: 'Windows 11 Home',
      build: '26100.3775',
      updateStatus: 'up_to_date',
      pendingRestart: false,
      lastUpdateAt: daysAgo(5),
      activationStatus: 'activated',
    },
    security: {
      defenderEnabled: true,
      definitionDate: daysAgo(1),
      lastScanAt: hoursAgo(8),
      firewallEnabled: true,
      bitlockerEnabled: false,
      tpmPresent: true,
    },
    reliability: {
      appCrashes24h: 1,
      bsodLast30d: 0,
      lastBsodAt: null,
      failedServicesCount: 0,
      failedServiceNames: [],
    },
    peripherals: {
      usb: [
        {
          id: 'usb-stylus-dock',
          name: 'Surface Dock 2',
          type: 'usb',
          connectedAt: hoursAgo(5),
          trusted: true,
        },
      ],
      bluetooth: [
        {
          id: 'bt-em-earbuds',
          name: 'AirPods Pro',
          type: 'bluetooth',
          connectedAt: hoursAgo(1),
          trusted: true,
        },
      ],
    },
  });

  // Device 2: Jake's Gaming PC – degraded (storage almost full, Defender out of date)
  const snap2 = buildSnapshot('dev-jake-01', {
    battery: {
      pct: 100,
      charging: true,
      estimatedMinutesRemaining: null,
      healthPct: null,
      cycleCount: null,
    },
    memory: { totalGb: 32, usedGb: 28.6, usedPct: 89, sustainedHighPct: true },
    storage: [
      { label: 'C:', totalGb: 1000, freeGb: 7.4, encrypted: false, smartStatus: 'healthy' },
      { label: 'D:', totalGb: 2000, freeGb: 341, encrypted: false, smartStatus: 'healthy' },
    ],
    connectivity: {
      online: true,
      type: 'ethernet',
      ssid: null,
      signalPct: null,
      latencyMs: 4,
      lastNetworkChangeAt: daysAgo(2),
    },
    boot: {
      lastBootAt: daysAgo(1),
      uptimeSeconds: 86_400,
      lastBootDurationMs: 31_000,
      unexpectedShutdownsLast30d: 3,
      restartPendingForUpdate: true,
    },
    windowsHealth: {
      version: 'Windows 11 Home',
      build: '26100.2033',
      updateStatus: 'pending',
      pendingRestart: true,
      lastUpdateAt: daysAgo(14),
      activationStatus: 'activated',
    },
    security: {
      defenderEnabled: false,          // ← disabled (gamer turned it off)
      definitionDate: daysAgo(21),
      lastScanAt: daysAgo(14),
      firewallEnabled: true,
      bitlockerEnabled: false,
      tpmPresent: true,
    },
    reliability: {
      appCrashes24h: 4,
      bsodLast30d: 1,
      lastBsodAt: daysAgo(5),
      failedServicesCount: 1,
      failedServiceNames: ['wuauserv'],
    },
    peripherals: {
      usb: [
        {
          id: 'usb-rog-kb',
          name: 'ASUS ROG Strix Flare II Keyboard',
          type: 'usb',
          connectedAt: daysAgo(30),
          trusted: true,
        },
        {
          id: 'usb-rog-mouse',
          name: 'ASUS ROG Gladius III Mouse',
          type: 'usb',
          connectedAt: daysAgo(30),
          trusted: true,
        },
        {
          id: 'usb-capture-card',
          name: 'Elgato HD60 X Capture Card',
          type: 'usb',
          connectedAt: minutesAgo(3), // new! triggers USB-NEW alert
          trusted: false,
        },
      ],
      bluetooth: [
        {
          id: 'bt-steelseries-headset',
          name: 'SteelSeries Arctis Nova Pro',
          type: 'bluetooth',
          connectedAt: hoursAgo(4),
          trusted: true,
        },
      ],
    },
  });

  // Device 3: Dad's Work Laptop – healthy, online
  const snap3 = buildSnapshot('dev-dad-01', {
    battery: {
      pct: 68,
      charging: false,
      estimatedMinutesRemaining: 215,
      healthPct: 95,
      cycleCount: 112,
    },
    memory: { totalGb: 16, usedGb: 9.2, usedPct: 58, sustainedHighPct: false },
    storage: [
      { label: 'C:', totalGb: 512, freeGb: 203, encrypted: true, smartStatus: 'healthy' },
    ],
    connectivity: {
      online: true,
      type: 'ethernet',
      ssid: null,
      signalPct: null,
      latencyMs: 3,
      lastNetworkChangeAt: hoursAgo(8),
    },
    boot: {
      lastBootAt: hoursAgo(9),
      uptimeSeconds: 9 * 3600,
      lastBootDurationMs: 14_800,
      unexpectedShutdownsLast30d: 0,
      restartPendingForUpdate: false,
    },
    windowsHealth: {
      version: 'Windows 11 Pro',
      build: '26100.3775',
      updateStatus: 'up_to_date',
      pendingRestart: false,
      lastUpdateAt: daysAgo(2),
      activationStatus: 'activated',
    },
    security: {
      defenderEnabled: true,
      definitionDate: hoursAgo(12),
      lastScanAt: hoursAgo(2),
      firewallEnabled: true,
      bitlockerEnabled: true,
      tpmPresent: true,
    },
    reliability: {
      appCrashes24h: 0,
      bsodLast30d: 0,
      lastBsodAt: null,
      failedServicesCount: 0,
      failedServiceNames: [],
    },
    peripherals: {
      usb: [
        {
          id: 'usb-dock-tp',
          name: 'Lenovo ThinkPad Universal USB-C Dock',
          type: 'usb',
          connectedAt: hoursAgo(9),
          trusted: true,
        },
      ],
      bluetooth: [
        {
          id: 'bt-mx-keys',
          name: 'Logitech MX Keys S Keyboard',
          type: 'bluetooth',
          connectedAt: hoursAgo(9),
          trusted: true,
        },
      ],
    },
  });

  // Device 4: Living Room PC – offline (last seen 25 hours ago)
  const snap4: HealthSnapshot = {
    deviceId: 'dev-living-01',
    collectedAt: hoursAgo(25),
    battery: {
      pct: 100,
      charging: true,
      estimatedMinutesRemaining: null,
      healthPct: null,
      cycleCount: null,
    },
    memory: { totalGb: 8, usedGb: 3.1, usedPct: 39, sustainedHighPct: false },
    storage: [
      { label: 'C:', totalGb: 256, freeGb: 88, encrypted: false, smartStatus: 'healthy' },
    ],
    connectivity: {
      online: false,
      type: 'wifi',
      ssid: 'HomeNetwork',
      signalPct: 54,
      latencyMs: null,
      lastNetworkChangeAt: hoursAgo(25),
    },
    boot: {
      lastBootAt: hoursAgo(72),
      uptimeSeconds: 47 * 3600,
      lastBootDurationMs: 38_000,
      unexpectedShutdownsLast30d: 2,
      restartPendingForUpdate: false,
    },
    windowsHealth: {
      version: 'Windows 11 Home',
      build: '26100.3233',
      updateStatus: 'pending',
      pendingRestart: false,
      lastUpdateAt: daysAgo(10),
      activationStatus: 'activated',
    },
    security: {
      defenderEnabled: true,
      definitionDate: daysAgo(3),
      lastScanAt: daysAgo(3),
      firewallEnabled: true,
      bitlockerEnabled: false,
      tpmPresent: false,
    },
    reliability: {
      appCrashes24h: 0,
      bsodLast30d: 0,
      lastBsodAt: null,
      failedServicesCount: 0,
      failedServiceNames: [],
    },
    peripherals: {
      usb: [
        {
          id: 'usb-webcam-lr',
          name: 'Logitech C920 HD Webcam',
          type: 'usb',
          connectedAt: daysAgo(14),
          trusted: true,
        },
      ],
      bluetooth: [],
    },
  };

  // ---- Devices ----
  const devices: FamilyDevice[] = [
    {
      id: 'dev-emma-01',
      nickname: "Emma's Laptop",
      deviceName: 'EMMA-SURFACE',
      childProfile: emma,
      windowsVersion: 'Windows 11 Home',
      windowsBuild: '26100.3775',
      deviceModel: 'Microsoft Surface Pro 9',
      serialNumber: 'SN-SP9-00341',
      agentVersion: '1.4.2',
      enrolledAt: daysAgo(90),
      lastSyncAt: minutesAgo(4),
      online: true,
      healthClass: 'needs_attention',
      latestSnapshot: snap1,
    },
    {
      id: 'dev-jake-01',
      nickname: "Jake's Gaming PC",
      deviceName: 'JAKE-ROGPC',
      childProfile: jake,
      windowsVersion: 'Windows 11 Home',
      windowsBuild: '26100.2033',
      deviceModel: 'ASUS ROG Strix G16',
      serialNumber: 'SN-ROG-88712',
      agentVersion: '1.4.2',
      enrolledAt: daysAgo(120),
      lastSyncAt: minutesAgo(2),
      online: true,
      healthClass: 'needs_attention',
      latestSnapshot: snap2,
    },
    {
      id: 'dev-dad-01',
      nickname: "Dad's Work Laptop",
      deviceName: 'DAD-THINKPAD',
      childProfile: dad,
      windowsVersion: 'Windows 11 Pro',
      windowsBuild: '26100.3775',
      deviceModel: 'Lenovo ThinkPad X1 Carbon Gen 11',
      serialNumber: 'SN-X1C-55021',
      agentVersion: '1.4.2',
      enrolledAt: daysAgo(60),
      lastSyncAt: minutesAgo(1),
      online: true,
      healthClass: 'healthy',
      latestSnapshot: snap3,
    },
    {
      id: 'dev-living-01',
      nickname: 'Living Room PC',
      deviceName: 'LIVING-HP',
      childProfile: shared,
      windowsVersion: 'Windows 11 Home',
      windowsBuild: '26100.3233',
      deviceModel: 'HP EliteBook 840 G9',
      serialNumber: 'SN-HP840-10045',
      agentVersion: '1.3.9',
      enrolledAt: daysAgo(45),
      lastSyncAt: hoursAgo(25),
      online: false,
      healthClass: 'offline',
      latestSnapshot: snap4,
    },
  ];

  // ---- Policies ----
  const policies: ParentalPolicy[] = [
    {
      deviceId: 'dev-emma-01',
      bedtime: { enabled: true, startTime: '21:00', endTime: '07:00', days: [0, 1, 2, 3, 4, 5, 6] },
      screenTimeLimitMinutes: 180,
      blockedApps: ['Discord.exe', 'steam.exe'],
      allowedApps: null,
      usbPolicy: 'report',
      state: 'active',
      lastAppliedAt: daysAgo(1),
      lastFailureReason: null,
    },
    {
      deviceId: 'dev-jake-01',
      bedtime: { enabled: true, startTime: '23:00', endTime: '08:00', days: [0, 1, 2, 3, 4] },
      screenTimeLimitMinutes: 300,
      blockedApps: [],
      allowedApps: null,
      usbPolicy: 'report',
      state: 'pending',
      lastAppliedAt: daysAgo(3),
      lastFailureReason: null,
    },
    {
      deviceId: 'dev-dad-01',
      bedtime: { enabled: false, startTime: '00:00', endTime: '00:00', days: [] },
      screenTimeLimitMinutes: null,
      blockedApps: [],
      allowedApps: null,
      usbPolicy: 'report',
      state: 'active',
      lastAppliedAt: daysAgo(5),
      lastFailureReason: null,
    },
    {
      deviceId: 'dev-living-01',
      bedtime: { enabled: true, startTime: '22:00', endTime: '07:30', days: [0, 1, 2, 3, 4, 5, 6] },
      screenTimeLimitMinutes: 120,
      blockedApps: ['roblox.exe', 'tiktok.exe'],
      allowedApps: null,
      usbPolicy: 'block',
      state: 'not_applied',
      lastAppliedAt: null,
      lastFailureReason: null,
    },
  ];

  // ---- Initial alerts (seed) ----
  let alerts: DeviceAlert[] = [];
  for (const dev of devices) {
    if (dev.latestSnapshot) {
      alerts.push(...evaluateAlerts(dev, dev.latestSnapshot, alerts));
    }
    const offlineAlert = checkOfflineAlert(dev, alerts);
    if (offlineAlert) alerts.push(offlineAlert);
  }

  // ---- Health history ----
  const healthHistory: Record<string, HealthSnapshot[]> = {};
  for (const dev of devices) {
    if (!dev.latestSnapshot) continue;
    // Build 24 synthetic historical snapshots at 1-hour intervals
    healthHistory[dev.id] = Array.from({ length: 24 }, (_, idx) => ({
      ...dev.latestSnapshot!,
      collectedAt: dev.latestSnapshot!.collectedAt - (23 - idx) * 3_600_000,
      memory: {
        ...dev.latestSnapshot!.memory,
        usedPct: Math.min(
          99,
          Math.max(
            10,
            dev.latestSnapshot!.memory.usedPct + Math.round(Math.sin(idx * 0.4) * 8),
          ),
        ),
      },
    }));
  }

  return {
    devices,
    alerts,
    policies,
    enrollmentCodes: [],
    healthHistory,
  };
}

// ---------------------------------------------------------------- persisted-state shape ---
interface PersistedFamilyState {
  devices: FamilyDevice[];
  alerts: DeviceAlert[];
  policies: ParentalPolicy[];
  enrollmentCodes: EnrollmentCode[];
  healthHistory: Record<string, HealthSnapshot[]>;
}

// ===================================================================== engine ===
export class FamilyEngine extends EventEmitter {
  private state: FamilyState;
  private tickTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super();
    this.state = this.loadOrSeed();
    this.startTick();
  }

  // ----------------------------------------------------------------- persistence ---
  private persist(): void {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(STATE_FILE, JSON.stringify(this.state, null, 2), 'utf8');
    } catch {
      // non-fatal
    }
  }

  private loadOrSeed(): FamilyState {
    try {
      if (fs.existsSync(STATE_FILE)) {
        const raw = fs.readFileSync(STATE_FILE, 'utf8');
        const parsed = JSON.parse(raw) as PersistedFamilyState;
        // Validate minimal structure
        if (Array.isArray(parsed.devices) && parsed.devices.length > 0) {
          if (!Array.isArray(parsed.alerts) || parsed.alerts.length === 0) {
            const alerts: DeviceAlert[] = [];
            for (const dev of parsed.devices) {
              if (dev.latestSnapshot) {
                alerts.push(...evaluateAlerts(dev, dev.latestSnapshot, alerts));
              }
              const offAlert = checkOfflineAlert(dev, alerts);
              if (offAlert) alerts.push(offAlert);
            }
            parsed.alerts = alerts;
          }
          return parsed as FamilyState;
        }
      }
    } catch {
      // fall through to seed
    }
    const seeded = buildSeedState();
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(STATE_FILE, JSON.stringify(seeded, null, 2), 'utf8');
    } catch {
      // non-fatal
    }
    return seeded;
  }

  // ------------------------------------------------------------------- tick loop ---
  private startTick(): void {
    this.tickTimer = setInterval(() => this.tick(), 15_000);
    // allow Node to exit even if this timer is pending
    if (this.tickTimer.unref) this.tickTimer.unref();
  }

  private tick(): void {
    const t = now();

    for (const device of this.state.devices) {
      if (!device.latestSnapshot) continue;
      const snap = device.latestSnapshot;

      // ---- Minor metric drift ----
      const driftPct = (v: number, min: number, max: number, mag: number) =>
        Math.min(max, Math.max(min, v + (Math.random() - 0.5) * mag * 2));

      // Memory drift
      snap.memory.usedGb = parseFloat(
        driftPct(snap.memory.usedGb, 1, snap.memory.totalGb * 0.98, 0.3).toFixed(1),
      );
      snap.memory.usedPct = parseFloat(
        ((snap.memory.usedGb / snap.memory.totalGb) * 100).toFixed(1),
      );
      snap.memory.sustainedHighPct = snap.memory.usedPct > 85;

      // Battery drift (desktops stay at 100% charging)
      if (!snap.battery.charging && snap.battery.pct > 0) {
        snap.battery.pct = Math.max(1, snap.battery.pct - Math.random() * 0.3);
        snap.battery.pct = parseFloat(snap.battery.pct.toFixed(1));
        if (snap.battery.estimatedMinutesRemaining !== null) {
          snap.battery.estimatedMinutesRemaining = Math.max(
            0,
            snap.battery.estimatedMinutesRemaining - 0.25,
          );
        }
      }

      // Latency drift (online devices only)
      if (snap.connectivity.online && snap.connectivity.latencyMs !== null) {
        snap.connectivity.latencyMs = parseFloat(
          driftPct(snap.connectivity.latencyMs, 2, 300, 2).toFixed(1),
        );
      }

      // Uptime increment
      snap.boot.uptimeSeconds += 15;
      snap.collectedAt = t;

      // Online status jitter (Living Room PC stays offline)
      if (device.id !== 'dev-living-01') {
        device.online = true;
        device.lastSyncAt = t;
        snap.connectivity.online = true;
      }

      // Reclassify health
      device.healthClass = classifyHealth(device, snap);

      // Evaluate new alerts
      const newAlerts = evaluateAlerts(device, snap, this.state.alerts);
      if (newAlerts.length > 0) {
        this.state.alerts.unshift(...newAlerts);
        // cap alerts list
        if (this.state.alerts.length > 500) this.state.alerts.length = 500;
      }

      // Append snapshot to history (keep last 24)
      const hist = this.state.healthHistory[device.id] ?? [];
      hist.push({ ...snap });
      if (hist.length > 24) hist.shift();
      this.state.healthHistory[device.id] = hist;
    }

    this.persist();
    this.emit('family-tick', this.getState());
  }

  // ----------------------------------------------------------------- public API ---
  public getState(): FamilyState {
    return this.state;
  }

  public getDevice(id: string): FamilyDevice | undefined {
    return this.state.devices.find((d) => d.id === id);
  }

  public getLatestHealth(id: string): HealthSnapshot | null {
    return this.state.devices.find((d) => d.id === id)?.latestSnapshot ?? null;
  }

  public getHistory(id: string): HealthSnapshot[] {
    return this.state.healthHistory[id] ?? [];
  }

  public resolveAlert(alertId: string): boolean {
    const alert = this.state.alerts.find((a) => a.id === alertId);
    if (!alert) return false;
    alert.resolvedAt = now();
    alert.acknowledged = true;
    this.persist();
    return true;
  }

  public updatePolicy(deviceId: string, patch: Partial<ParentalPolicy>): ParentalPolicy | null {
    const idx = this.state.policies.findIndex((p) => p.deviceId === deviceId);
    if (idx === -1) return null;
    this.state.policies[idx] = {
      ...this.state.policies[idx],
      ...patch,
      deviceId,
    } as ParentalPolicy;
    this.persist();
    return this.state.policies[idx];
  }

  public generateEnrollCode(parentId: string): EnrollmentCode {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const code = Array.from({ length: 8 }, () =>
      chars[Math.floor(Math.random() * chars.length)],
    ).join('');

    const entry: EnrollmentCode = {
      code,
      createdAt: now(),
      expiresAt: now() + 24 * 3_600_000, // 24-hour window
      used: false,
      usedAt: null,
      usedByDeviceId: null,
      createdByParentId: parentId,
    };
    this.state.enrollmentCodes.push(entry);
    this.persist();
    return entry;
  }

  public enrollDevice(
    code: string,
    deviceName: string,
    nickname: string,
  ): FamilyDevice | { error: string } {
    const entry = this.state.enrollmentCodes.find(
      (c) => c.code === code.toUpperCase(),
    );
    if (!entry) return { error: 'Invalid enrollment code.' };
    if (entry.used) return { error: 'Enrollment code already used.' };
    if (now() > entry.expiresAt) return { error: 'Enrollment code expired.' };

    const deviceId = `dev-${randomUUID().slice(0, 8)}`;
    const snap = buildSnapshot(deviceId);
    const newDevice: FamilyDevice = {
      id: deviceId,
      nickname,
      deviceName,
      childProfile: {
        id: `child-${deviceId}`,
        name: nickname,
        avatarColor: '#607D8B',
      },
      windowsVersion: 'Windows 11 Home',
      windowsBuild: '26100.3775',
      deviceModel: 'Unknown',
      serialNumber: null,
      agentVersion: '1.4.2',
      enrolledAt: now(),
      lastSyncAt: now(),
      online: true,
      healthClass: 'healthy',
      latestSnapshot: snap,
    };

    const defaultPolicy: ParentalPolicy = {
      deviceId,
      bedtime: {
        enabled: false,
        startTime: '22:00',
        endTime: '07:00',
        days: [0, 1, 2, 3, 4, 5, 6],
      },
      screenTimeLimitMinutes: null,
      blockedApps: [],
      allowedApps: null,
      usbPolicy: 'report',
      state: 'not_applied',
      lastAppliedAt: null,
      lastFailureReason: null,
    };

    entry.used = true;
    entry.usedAt = now();
    entry.usedByDeviceId = deviceId;

    this.state.devices.push(newDevice);
    this.state.policies.push(defaultPolicy);
    this.state.healthHistory[deviceId] = [snap];
    this.persist();
    return newDevice;
  }

  public revokeDevice(id: string): boolean {
    const idx = this.state.devices.findIndex((d) => d.id === id);
    if (idx === -1) return false;
    this.state.devices.splice(idx, 1);
    this.state.policies = this.state.policies.filter((p) => p.deviceId !== id);
    this.state.alerts = this.state.alerts.filter((a) => a.deviceId !== id);
    delete this.state.healthHistory[id];
    this.persist();
    return true;
  }

  /**
   * Process an agent checkin (called from the API route).
   */
  public processCheckin(
    deviceId: string,
    payload: AgentCheckinPayload,
  ): AgentCheckinResponse {
    const device = this.getDevice(deviceId);
    if (!device) throw new Error(`Unknown device: ${deviceId}`);

    // Update snapshot
    device.latestSnapshot = payload.snapshot;
    device.lastSyncAt = now();
    device.online = true;
    device.healthClass = classifyHealth(device, payload.snapshot);

    // Handle immediate events → alerts
    for (const evt of payload.immediateEvents) {
      const alert: DeviceAlert = {
        id: `alert-${randomUUID()}`,
        deviceId,
        ruleId: evt.type.toUpperCase().replace('_', '-'),
        severity:
          evt.type === 'bsod' || evt.type === 'defender_off'
            ? 'critical'
            : evt.type === 'policy_failed' || evt.type === 'storage_low'
              ? 'warning'
              : 'info',
        message: `Agent event: ${evt.type}`,
        createdAt: evt.occurredAt,
        resolvedAt: null,
        dedupKey: `${deviceId}:${evt.type}`,
        acknowledged: false,
      };
      const cutoff = now() - FOUR_HOURS;
      const dupe = this.state.alerts.find(
        (a) =>
          a.dedupKey === alert.dedupKey &&
          a.resolvedAt === null &&
          a.createdAt > cutoff,
      );
      if (!dupe) this.state.alerts.unshift(alert);
    }

    // Run rule engine
    const newAlerts = evaluateAlerts(device, payload.snapshot, this.state.alerts);
    this.state.alerts.unshift(...newAlerts);

    // Append to history
    const hist = this.state.healthHistory[deviceId] ?? [];
    hist.push(payload.snapshot);
    if (hist.length > 24) hist.shift();
    this.state.healthHistory[deviceId] = hist;

    this.persist();

    // Build response
    const policy =
      this.state.policies.find((p) => p.deviceId === deviceId) ??
      ({
        deviceId,
        bedtime: { enabled: false, startTime: '22:00', endTime: '07:00', days: [] },
        screenTimeLimitMinutes: null,
        blockedApps: [],
        allowedApps: null,
        usbPolicy: 'report',
        state: 'not_applied',
        lastAppliedAt: null,
        lastFailureReason: null,
      } as ParentalPolicy);

    const commands: AgentCommand[] = [];
    if (policy.state === 'pending') {
      commands.push({
        id: randomUUID(),
        type: 'apply_policy',
        payload: { policy },
        issuedAt: now(),
      });
    }

    return { policy, commands };
  }
}

export const familyEngine = new FamilyEngine();
