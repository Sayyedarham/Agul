// ============================================================
// FamilyGuard – shared TypeScript types
// ============================================================

// Health classification
export type HealthClass = 'healthy' | 'needs_attention' | 'offline';
export type AlertSeverity = 'critical' | 'warning' | 'info';
export type PolicyState = 'active' | 'pending' | 'failed' | 'not_applied';
export type UsbPolicy = 'report' | 'block';
export type ConnectivityType = 'wifi' | 'ethernet' | 'cellular' | 'none';
export type UpdateStatus = 'up_to_date' | 'pending' | 'downloading' | 'failed';

export interface ChildProfile {
  id: string;
  name: string;
  avatarColor: string; // hex color
}

export interface DriveHealth {
  label: string; // e.g. "C:" or "D:"
  totalGb: number;
  freeGb: number;
  encrypted: boolean;
  smartStatus: 'healthy' | 'caution' | 'failing' | 'unknown';
}

export interface BatterySnapshot {
  pct: number; // 0-100
  charging: boolean;
  estimatedMinutesRemaining: number | null; // null if charging or unknown
  healthPct: number | null; // 0-100 or null if unavailable
  cycleCount: number | null;
}

export interface MemorySnapshot {
  totalGb: number;
  usedGb: number;
  usedPct: number; // 0-100
  sustainedHighPct: boolean; // true if >85% for >15 min
}

export interface ConnectivitySnapshot {
  online: boolean;
  type: ConnectivityType;
  ssid: string | null;
  signalPct: number | null; // 0-100 for wifi
  latencyMs: number | null;
  lastNetworkChangeAt: number; // epoch ms
}

export interface BootSnapshot {
  lastBootAt: number; // epoch ms
  uptimeSeconds: number;
  lastBootDurationMs: number | null;
  unexpectedShutdownsLast30d: number;
  restartPendingForUpdate: boolean;
}

export interface WindowsHealthSnapshot {
  version: string; // e.g. "Windows 11 Pro"
  build: string; // e.g. "26100.3775"
  updateStatus: UpdateStatus;
  pendingRestart: boolean;
  lastUpdateAt: number | null; // epoch ms
  activationStatus: 'activated' | 'not_activated' | 'unknown';
}

export interface SecuritySnapshot {
  defenderEnabled: boolean;
  definitionDate: number | null; // epoch ms
  lastScanAt: number | null; // epoch ms
  firewallEnabled: boolean;
  bitlockerEnabled: boolean;
  tpmPresent: boolean;
}

export interface ReliabilitySnapshot {
  appCrashes24h: number;
  bsodLast30d: number;
  lastBsodAt: number | null; // epoch ms
  failedServicesCount: number;
  failedServiceNames: string[];
}

export interface PeripheralDevice {
  id: string;
  name: string;
  type: 'usb' | 'bluetooth';
  connectedAt: number; // epoch ms
  trusted: boolean;
}

export interface PeripheralsSnapshot {
  usb: PeripheralDevice[];
  bluetooth: PeripheralDevice[];
}

export interface HealthSnapshot {
  deviceId: string;
  collectedAt: number; // epoch ms
  battery: BatterySnapshot;
  memory: MemorySnapshot;
  storage: DriveHealth[];
  connectivity: ConnectivitySnapshot;
  boot: BootSnapshot;
  windowsHealth: WindowsHealthSnapshot;
  security: SecuritySnapshot;
  reliability: ReliabilitySnapshot;
  peripherals: PeripheralsSnapshot;
  // Optional performance extras reported by the Python agent.
  cpu?: {
    model: string;
    cores: number;
    loadPct: number; // 0-100
  };
  processes?: {
    name: string;
    memMb: number;
    cpuPct: number;
  }[];
}

export interface FamilyDevice {
  id: string;
  nickname: string; // parent-given friendly name
  deviceName: string; // Windows hostname
  childProfile: ChildProfile;
  windowsVersion: string;
  windowsBuild: string;
  deviceModel: string;
  serialNumber: string | null;
  agentVersion: string;
  enrolledAt: number; // epoch ms
  lastSyncAt: number; // epoch ms
  online: boolean;
  healthClass: HealthClass;
  latestSnapshot: HealthSnapshot | null;
}

export interface DeviceAlert {
  id: string;
  deviceId: string;
  ruleId: string;
  severity: AlertSeverity;
  message: string;
  createdAt: number; // epoch ms
  resolvedAt: number | null;
  dedupKey: string;
  acknowledged: boolean;
}

export interface BedtimeSchedule {
  enabled: boolean;
  startTime: string; // "HH:MM" 24h
  endTime: string; // "HH:MM" 24h
  days: number[]; // 0=Sun ... 6=Sat
}

export interface ParentalPolicy {
  deviceId: string;
  bedtime: BedtimeSchedule;
  screenTimeLimitMinutes: number | null; // null = no limit
  blockedApps: string[]; // process names
  allowedApps: string[] | null; // null = all allowed
  usbPolicy: UsbPolicy;
  state: PolicyState;
  lastAppliedAt: number | null;
  lastFailureReason: string | null;
}

export interface EnrollmentCode {
  code: string; // 8-char uppercase
  createdAt: number;
  expiresAt: number;
  used: boolean;
  usedAt: number | null;
  usedByDeviceId: string | null;
  createdByParentId: string;
}

export interface FamilyState {
  devices: FamilyDevice[];
  alerts: DeviceAlert[];
  policies: ParentalPolicy[];
  enrollmentCodes: EnrollmentCode[];
  healthHistory: Record<string, HealthSnapshot[]>; // deviceId -> last 24 snapshots
}

// Agent checkin payload (what the Windows agent POSTs)
export interface AgentCheckinPayload {
  deviceToken: string;
  snapshot: HealthSnapshot;
  immediateEvents: AgentEvent[];
}

export interface AgentEvent {
  type:
    | 'battery_low'
    | 'defender_off'
    | 'usb_connected'
    | 'storage_low'
    | 'bsod'
    | 'policy_applied'
    | 'policy_failed';
  payload: Record<string, unknown>;
  occurredAt: number;
}

// API response types
export interface AgentCheckinResponse {
  policy: ParentalPolicy;
  commands: AgentCommand[];
}

export interface AgentCommand {
  id: string;
  type: 'apply_policy' | 'lock_screen' | 'show_notification';
  payload: Record<string, unknown>;
  issuedAt: number;
}
