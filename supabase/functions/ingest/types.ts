// Shared types for the FamilyGuard ingest function. Mirrors the canonical
// shapes in src/types/family.ts.

export type HealthClass = 'healthy' | 'needs_attention' | 'offline';
export type AlertSeverity = 'critical' | 'warning' | 'info';
export type UpdateStatus = 'up_to_date' | 'pending' | 'downloading' | 'failed';

export interface BatterySnapshot {
  pct: number;
  charging: boolean;
  estimatedMinutesRemaining: number | null;
  healthPct: number | null;
  cycleCount: number | null;
}

export interface MemorySnapshot {
  totalGb: number;
  usedGb: number;
  usedPct: number;
  sustainedHighPct: boolean;
}

export interface DriveHealth {
  label: string;
  totalGb: number;
  freeGb: number;
  encrypted: boolean;
  smartStatus: 'healthy' | 'caution' | 'failing' | 'unknown';
}

export interface ConnectivitySnapshot {
  online: boolean;
  type: 'wifi' | 'ethernet' | 'cellular' | 'none';
  ssid: string | null;
  signalPct: number | null;
  latencyMs: number | null;
  lastNetworkChangeAt: number;
}

export interface BootSnapshot {
  lastBootAt: number;
  uptimeSeconds: number;
  lastBootDurationMs: number | null;
  unexpectedShutdownsLast30d: number;
  restartPendingForUpdate: boolean;
}

export interface WindowsHealthSnapshot {
  version: string;
  build: string;
  updateStatus: UpdateStatus;
  pendingRestart: boolean;
  lastUpdateAt: number | null;
  activationStatus: 'activated' | 'not_activated' | 'unknown';
}

export interface SecuritySnapshot {
  defenderEnabled: boolean;
  definitionDate: number | null;
  lastScanAt: number | null;
  firewallEnabled: boolean;
  bitlockerEnabled: boolean;
  tpmPresent: boolean;
}

export interface ReliabilitySnapshot {
  appCrashes24h: number;
  bsodLast30d: number;
  lastBsodAt: number | null;
  failedServicesCount: number;
  failedServiceNames: string[];
}

export interface PeripheralDevice {
  id: string;
  name: string;
  type: 'usb' | 'bluetooth';
  connectedAt: number;
  trusted: boolean;
}

export interface PeripheralsSnapshot {
  usb: PeripheralDevice[];
  bluetooth: PeripheralDevice[];
}

export interface CpuSnapshot {
  model: string;
  cores: number;
  loadPct: number;
}

export interface ProcessInfo {
  name: string;
  memMb: number;
  cpuPct: number;
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
  cpu?: CpuSnapshot;
  processes?: ProcessInfo[];
  // Optional extras reported by the Python agent, stored on the device row.
  agentVersion?: string;
  deviceModel?: string;
}

export interface FamilyDeviceRow {
  id: string;
  nickname: string;
  device_name: string;
  agent_version: string;
  online: boolean;
  health_class: HealthClass;
  enrolled_at: string;
  last_sync_at: string;
}
