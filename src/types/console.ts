export type NodeStatus = 'online' | 'degraded' | 'critical' | 'isolated';

export type ConsoleSection =
  | 'overview'
  | 'nodes'
  | 'sockets'
  | 'audits'
  | 'diagnostics';

export interface NetworkInterfaceInfo {
  name: string;
  address: string;
  mac: string;
  family: string;
  cidr: string | null;
  internal: boolean;
}

export interface HostTelemetry {
  hostname: string;
  platform: string;
  release: string;
  arch: string;
  cpuModel: string;
  cpuCores: number;
  cpuLoadPct: number;
  loadAvg: [number, number, number];
  memTotalBytes: number;
  memUsedBytes: number;
  memUsedPct: number;
  uptimeSeconds: number;
  interfaces: NetworkInterfaceInfo[];
  pid: number;
  nodeVersion: string;
  timestamp: number;
}

export interface FleetNode {
  id: string;
  hostname: string;
  role: string;
  rackLocation: string;
  ipAddress: string;
  macAddress: string;
  vlan: string;
  originalVlan: string;
  subnet: string;
  mtu: number;
  status: NodeStatus;
  isLocalController: boolean;
  cpuPct: number;
  memPct: number;
  memTotalGb: number;
  latencyMs: number;
  packetLossPct: number;
  rxMbps: number;
  txMbps: number;
  uptimeSeconds: number;
  kernel: string;
  openPorts: number[];
  cpuHistory: number[];
  lastHeartbeat: number;
  isolationReason?: string;
}

export interface SocketSession {
  id: string;
  nodeId: string;
  nodeHostname: string;
  protocol: 'TCP' | 'UDP' | 'TLS';
  localAddress: string;
  localPort: number;
  remoteAddress: string;
  remotePort: number;
  processName: string;
  pid: number;
  state: 'ESTABLISHED' | 'LISTEN' | 'SYN_RECV' | 'CLOSE_WAIT';
  throughputKbps: number;
  flagged: boolean;
  flagReason?: string;
  openedAt: number;
}

export type AuditSeverity = 'critical' | 'warning' | 'info';

export interface SecurityEvent {
  id: string;
  timestamp: number;
  severity: AuditSeverity;
  nodeId: string;
  nodeHostname: string;
  ruleId: string;
  category: string;
  summary: string;
  sourceIp: string;
  disposition: 'Blocked' | 'Quarantined' | 'Flagged' | 'Operator Action';
  acknowledged: boolean;
  acknowledgedBy?: string;
}

export interface TelemetryPoint {
  timestamp: number;
  rxMbps: number;
  txMbps: number;
  meanLatencyMs: number;
  packetDropRate: number;
}

export interface ProbeResult {
  target: string;
  port: number;
  resolvedIp: string | null;
  reachable: boolean;
  latencyMs: number | null;
  dnsLookupMs: number | null;
  error: string | null;
  checkedAt: number;
}

export interface FleetSnapshot {
  nodes: FleetNode[];
  sockets: SocketSession[];
  events: SecurityEvent[];
  hostTelemetry: HostTelemetry;
  telemetryHistory: TelemetryPoint[];
  lastSweepAt: number;
}
