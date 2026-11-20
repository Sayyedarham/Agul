import dns from 'node:dns';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type {
  FleetNode,
  FleetSnapshot,
  HostTelemetry,
  NetworkInterfaceInfo,
  NodeStatus,
  ProbeResult,
  SecurityEvent,
  SocketSession,
  TelemetryPoint,
} from '../src/types/console.ts';

const DATA_DIR = path.resolve(process.cwd(), '.data');
const STATE_FILE = path.join(DATA_DIR, 'fleet-state.json');

interface PersistedState {
  nodes: FleetNode[];
  sockets: SocketSession[];
  events: SecurityEvent[];
  lastSweepAt: number;
}

let prevCpuTotals: { idle: number; total: number } | null = null;

function sampleCpuUsagePct(): number {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    idle += cpu.times.idle;
    total +=
      cpu.times.user +
      cpu.times.nice +
      cpu.times.sys +
      cpu.times.idle +
      cpu.times.irq;
  }

  if (!prevCpuTotals) {
    prevCpuTotals = { idle, total };
    const load = os.loadavg()[0] || 0.25;
    return Number(Math.min(98, Math.max(4, (load / Math.max(1, cpus.length)) * 100)).toFixed(1));
  }

  const idleDelta = idle - prevCpuTotals.idle;
  const totalDelta = total - prevCpuTotals.total;
  prevCpuTotals = { idle, total };

  if (totalDelta <= 0) return 12.4;
  const pct = (1 - idleDelta / totalDelta) * 100;
  return Number(Math.min(99.5, Math.max(1.2, pct)).toFixed(1));
}

export function collectHostTelemetry(): HostTelemetry {
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = Math.max(0, totalMem - freeMem);
  const memUsedPct = Number(((usedMem / Math.max(1, totalMem)) * 100).toFixed(1));
  const cpuLoadPct = sampleCpuUsagePct();
  const loadAvg = os.loadavg() as [number, number, number];

  const rawIfaces = os.networkInterfaces();
  const interfaces: NetworkInterfaceInfo[] = [];

  for (const [name, list] of Object.entries(rawIfaces)) {
    if (!list) continue;
    for (const item of list) {
      if (item.family === 'IPv4' || (!item.internal && item.family === 'IPv6')) {
        interfaces.push({
          name,
          address: item.address,
          mac: item.mac || '00:00:00:00:00:00',
          family: item.family,
          cidr: item.cidr ?? null,
          internal: item.internal,
        });
      }
    }
  }

  return {
    hostname: os.hostname(),
    platform: `${os.platform()} ${os.arch()}`,
    release: os.release(),
    arch: os.arch(),
    cpuModel: cpus[0]?.model?.trim() || 'Virtual x86_64 Core',
    cpuCores: cpus.length,
    cpuLoadPct,
    loadAvg: [
      Number(loadAvg[0].toFixed(2)),
      Number(loadAvg[1].toFixed(2)),
      Number(loadAvg[2].toFixed(2)),
    ],
    memTotalBytes: totalMem,
    memUsedBytes: usedMem,
    memUsedPct,
    uptimeSeconds: Math.floor(os.uptime()),
    interfaces,
    pid: process.pid,
    nodeVersion: process.version,
    timestamp: Date.now(),
  };
}

function buildSeedState(host: HostTelemetry): PersistedState {
  const now = Date.now();
  const primaryNic =
    host.interfaces.find((i) => !i.internal && i.family === 'IPv4') ||
    host.interfaces[0];

  const controllerIp = primaryNic?.address || '10.24.10.2';
  const controllerMac =
    primaryNic?.mac && primaryNic.mac !== '00:00:00:00:00:00'
      ? primaryNic.mac.toUpperCase()
      : '02:42:AC:11:00:02';

  const makeHistory = (base: number, jitter: number): number[] =>
    Array.from({ length: 24 }, (_, idx) =>
      Number(
        Math.min(
          98,
          Math.max(2, base + Math.sin(idx * 0.6) * jitter + ((idx % 3) - 1) * 1.4)
        ).toFixed(1)
      )
    );

  const nodes: FleetNode[] = [
    {
      id: 'node-ctrl-01',
      hostname: host.hostname || 'ctrl-gw-01.lab.internal',
      role: 'Primary Safety Controller',
      rackLocation: 'Rack A1 · U02',
      ipAddress: controllerIp,
      macAddress: controllerMac,
      vlan: 'VLAN-10',
      originalVlan: 'VLAN-10',
      subnet: '10.24.10.0/24',
      mtu: 1500,
      status: 'online',
      isLocalController: true,
      cpuPct: host.cpuLoadPct,
      memPct: host.memUsedPct,
      memTotalGb: Number((host.memTotalBytes / 1024 ** 3).toFixed(1)),
      latencyMs: 0.4,
      packetLossPct: 0.0,
      rxMbps: 412.6,
      txMbps: 389.2,
      uptimeSeconds: host.uptimeSeconds,
      kernel: `Linux ${host.release}`,
      openPorts: [22, 443, 3000, 9100],
      cpuHistory: makeHistory(host.cpuLoadPct, 4),
      lastHeartbeat: now,
    },
    {
      id: 'node-core-02',
      hostname: 'core-sw-east.lab.internal',
      role: 'L3 Spine Aggregator',
      rackLocation: 'Rack A1 · U06',
      ipAddress: '10.24.10.1',
      macAddress: 'A4:BF:01:8C:19:01',
      vlan: 'VLAN-10',
      originalVlan: 'VLAN-10',
      subnet: '10.24.10.0/24',
      mtu: 9000,
      status: 'online',
      isLocalController: false,
      cpuPct: 24.8,
      memPct: 41.2,
      memTotalGb: 64,
      latencyMs: 0.8,
      packetLossPct: 0.0,
      rxMbps: 1840.4,
      txMbps: 1792.1,
      uptimeSeconds: 4831200,
      kernel: 'SONiC 202405.2',
      openPorts: [22, 161, 179, 8080],
      cpuHistory: makeHistory(25, 3),
      lastHeartbeat: now - 400,
    },
    {
      id: 'node-comp-01',
      hostname: 'gpu-infer-01.compute.internal',
      role: 'Inference Worker A100',
      rackLocation: 'Rack B2 · U12',
      ipAddress: '10.24.20.14',
      macAddress: '0C:42:A1:3F:88:10',
      vlan: 'VLAN-20',
      originalVlan: 'VLAN-20',
      subnet: '10.24.20.0/24',
      mtu: 9000,
      status: 'online',
      isLocalController: false,
      cpuPct: 68.4,
      memPct: 74.1,
      memTotalGb: 512,
      latencyMs: 1.9,
      packetLossPct: 0.0,
      rxMbps: 924.8,
      txMbps: 618.3,
      uptimeSeconds: 1924400,
      kernel: 'Linux 6.8.0-45-generic',
      openPorts: [22, 8000, 9100, 9400],
      cpuHistory: makeHistory(68, 7),
      lastHeartbeat: now - 600,
    },
    {
      id: 'node-comp-02',
      hostname: 'gpu-infer-02.compute.internal',
      role: 'Inference Worker A100',
      rackLocation: 'Rack B2 · U16',
      ipAddress: '10.24.20.15',
      macAddress: '0C:42:A1:3F:88:14',
      vlan: 'VLAN-20',
      originalVlan: 'VLAN-20',
      subnet: '10.24.20.0/24',
      mtu: 9000,
      status: 'degraded',
      isLocalController: false,
      cpuPct: 89.2,
      memPct: 86.5,
      memTotalGb: 512,
      latencyMs: 38.4,
      packetLossPct: 1.2,
      rxMbps: 642.0,
      txMbps: 510.7,
      uptimeSeconds: 842100,
      kernel: 'Linux 6.8.0-45-generic',
      openPorts: [22, 8000, 9100, 9400],
      cpuHistory: makeHistory(86, 6),
      lastHeartbeat: now - 1100,
    },
    {
      id: 'node-comp-03',
      hostname: 'batch-runner-04.compute.internal',
      role: 'Distributed Job Runner',
      rackLocation: 'Rack B3 · U04',
      ipAddress: '10.24.20.28',
      macAddress: 'B8:CE:F6:12:4A:09',
      vlan: 'VLAN-20',
      originalVlan: 'VLAN-20',
      subnet: '10.24.20.0/24',
      mtu: 1500,
      status: 'online',
      isLocalController: false,
      cpuPct: 52.1,
      memPct: 61.8,
      memTotalGb: 256,
      latencyMs: 2.1,
      packetLossPct: 0.0,
      rxMbps: 318.2,
      txMbps: 284.5,
      uptimeSeconds: 3120400,
      kernel: 'Linux 6.8.0-45-generic',
      openPorts: [22, 6379, 9100],
      cpuHistory: makeHistory(52, 5),
      lastHeartbeat: now - 500,
    },
    {
      id: 'node-stor-01',
      hostname: 'ceph-osd-01.storage.internal',
      role: 'NVMe Object Vault',
      rackLocation: 'Rack C1 · U08',
      ipAddress: '10.24.40.11',
      macAddress: 'E4:3D:1A:90:22:C0',
      vlan: 'VLAN-40',
      originalVlan: 'VLAN-40',
      subnet: '10.24.40.0/24',
      mtu: 9000,
      status: 'online',
      isLocalController: false,
      cpuPct: 31.6,
      memPct: 68.4,
      memTotalGb: 256,
      latencyMs: 1.4,
      packetLossPct: 0.0,
      rxMbps: 1420.0,
      txMbps: 1210.8,
      uptimeSeconds: 7420900,
      kernel: 'Linux 6.6.32-lts',
      openPorts: [22, 3300, 6789, 6800],
      cpuHistory: makeHistory(31, 4),
      lastHeartbeat: now - 300,
    },
    {
      id: 'node-stor-02',
      hostname: 'ceph-osd-02.storage.internal',
      role: 'NVMe Object Vault',
      rackLocation: 'Rack C1 · U12',
      ipAddress: '10.24.40.12',
      macAddress: 'E4:3D:1A:90:22:C4',
      vlan: 'VLAN-40',
      originalVlan: 'VLAN-40',
      subnet: '10.24.40.0/24',
      mtu: 9000,
      status: 'online',
      isLocalController: false,
      cpuPct: 29.4,
      memPct: 65.2,
      memTotalGb: 256,
      latencyMs: 1.5,
      packetLossPct: 0.0,
      rxMbps: 1380.4,
      txMbps: 1190.2,
      uptimeSeconds: 7420850,
      kernel: 'Linux 6.6.32-lts',
      openPorts: [22, 3300, 6789, 6800],
      cpuHistory: makeHistory(29, 3),
      lastHeartbeat: now - 350,
    },
    {
      id: 'node-edge-01',
      hostname: 'ingress-proxy-01.edge.internal',
      role: 'Zero-Trust TLS Gateway',
      rackLocation: 'Rack D1 · U02',
      ipAddress: '10.24.30.5',
      macAddress: '3C:EC:EF:74:11:82',
      vlan: 'VLAN-30',
      originalVlan: 'VLAN-30',
      subnet: '10.24.30.0/24',
      mtu: 1500,
      status: 'online',
      isLocalController: false,
      cpuPct: 37.9,
      memPct: 44.0,
      memTotalGb: 128,
      latencyMs: 3.2,
      packetLossPct: 0.0,
      rxMbps: 890.5,
      txMbps: 860.1,
      uptimeSeconds: 2611000,
      kernel: 'Linux 6.8.0-45-generic',
      openPorts: [80, 443, 8443, 9100],
      cpuHistory: makeHistory(38, 6),
      lastHeartbeat: now - 700,
    },
    {
      id: 'node-edge-02',
      hostname: 'dmz-relay-07.edge.internal',
      role: 'External Telemetry Relay',
      rackLocation: 'Rack D1 · U06',
      ipAddress: '10.24.30.19',
      macAddress: '3C:EC:EF:74:11:9A',
      vlan: 'VLAN-30',
      originalVlan: 'VLAN-30',
      subnet: '10.24.30.0/24',
      mtu: 1500,
      status: 'critical',
      isLocalController: false,
      cpuPct: 94.6,
      memPct: 91.2,
      memTotalGb: 64,
      latencyMs: 112.8,
      packetLossPct: 4.8,
      rxMbps: 118.4,
      txMbps: 492.9,
      uptimeSeconds: 412000,
      kernel: 'Linux 6.8.0-45-generic',
      openPorts: [22, 443, 4444, 8080],
      cpuHistory: makeHistory(90, 5),
      lastHeartbeat: now - 2100,
    },
    {
      id: 'node-lab-01',
      hostname: 'telemetry-daq-03.lab.internal',
      role: 'Bench Instrument Controller',
      rackLocation: 'Lab Bay 3 · Bench A',
      ipAddress: '10.24.10.42',
      macAddress: '70:85:C2:5E:30:11',
      vlan: 'VLAN-10',
      originalVlan: 'VLAN-10',
      subnet: '10.24.10.0/24',
      mtu: 1500,
      status: 'online',
      isLocalController: false,
      cpuPct: 16.2,
      memPct: 32.8,
      memTotalGb: 32,
      latencyMs: 1.1,
      packetLossPct: 0.0,
      rxMbps: 64.2,
      txMbps: 58.9,
      uptimeSeconds: 1290400,
      kernel: 'Linux 6.6.21-rt',
      openPorts: [22, 502, 4840, 9100],
      cpuHistory: makeHistory(16, 2),
      lastHeartbeat: now - 450,
    },
    {
      id: 'node-lab-02',
      hostname: 'sandbox-runner-09.lab.internal',
      role: 'Untrusted Payload Sandbox',
      rackLocation: 'Lab Bay 4 · Cage B',
      ipAddress: '10.24.99.9',
      macAddress: '52:54:00:D8:12:09',
      vlan: 'VLAN-999',
      originalVlan: 'VLAN-20',
      subnet: '10.24.99.0/24',
      mtu: 1500,
      status: 'isolated',
      isLocalController: false,
      cpuPct: 4.1,
      memPct: 18.4,
      memTotalGb: 64,
      latencyMs: 0.0,
      packetLossPct: 0.0,
      rxMbps: 0.0,
      txMbps: 0.0,
      uptimeSeconds: 98400,
      kernel: 'Linux 6.8.0-45-generic',
      openPorts: [],
      cpuHistory: makeHistory(5, 1),
      lastHeartbeat: now - 900,
      isolationReason: 'Outbound C2 beacon signature matched IDS-4092',
    },
    {
      id: 'node-iam-01',
      hostname: 'vault-kms-01.core.internal',
      role: 'Hardware HSM & Secrets Vault',
      rackLocation: 'Rack A2 · U01',
      ipAddress: '10.24.10.10',
      macAddress: '00:1B:21:BB:41:08',
      vlan: 'VLAN-10',
      originalVlan: 'VLAN-10',
      subnet: '10.24.10.0/24',
      mtu: 1500,
      status: 'online',
      isLocalController: false,
      cpuPct: 14.3,
      memPct: 38.9,
      memTotalGb: 128,
      latencyMs: 0.9,
      packetLossPct: 0.0,
      rxMbps: 142.7,
      txMbps: 138.4,
      uptimeSeconds: 9120000,
      kernel: 'Linux 6.6.32-hardened',
      openPorts: [443, 8200, 8201],
      cpuHistory: makeHistory(14, 2),
      lastHeartbeat: now - 250,
    },
  ];

  const sockets: SocketSession[] = [
    {
      id: 'sock-101',
      nodeId: 'node-edge-02',
      nodeHostname: 'dmz-relay-07.edge.internal',
      protocol: 'TCP',
      localAddress: '10.24.30.19',
      localPort: 4444,
      remoteAddress: '185.220.101.47',
      remotePort: 51922,
      processName: 'relay-worker',
      pid: 28419,
      state: 'ESTABLISHED',
      throughputKbps: 48200,
      flagged: true,
      flagReason: 'Unexpected high-volume egress on non-standard port :4444',
      openedAt: now - 420_000,
    },
    {
      id: 'sock-102',
      nodeId: 'node-edge-02',
      nodeHostname: 'dmz-relay-07.edge.internal',
      protocol: 'TCP',
      localAddress: '10.24.30.19',
      localPort: 22,
      remoteAddress: '198.51.100.83',
      remotePort: 49210,
      processName: 'sshd',
      pid: 1142,
      state: 'SYN_RECV',
      throughputKbps: 640,
      flagged: true,
      flagReason: 'Repeated SSH handshake brute-force probe',
      openedAt: now - 115_000,
    },
    {
      id: 'sock-103',
      nodeId: 'node-comp-02',
      nodeHostname: 'gpu-infer-02.compute.internal',
      protocol: 'TLS',
      localAddress: '10.24.20.15',
      localPort: 8000,
      remoteAddress: '10.24.30.5',
      remotePort: 54120,
      processName: 'tritonserver',
      pid: 9304,
      state: 'ESTABLISHED',
      throughputKbps: 184200,
      flagged: false,
      openedAt: now - 1_840_000,
    },
    {
      id: 'sock-104',
      nodeId: 'node-comp-01',
      nodeHostname: 'gpu-infer-01.compute.internal',
      protocol: 'TLS',
      localAddress: '10.24.20.14',
      localPort: 8000,
      remoteAddress: '10.24.30.5',
      remotePort: 54088,
      processName: 'tritonserver',
      pid: 8812,
      state: 'ESTABLISHED',
      throughputKbps: 242100,
      flagged: false,
      openedAt: now - 2_900_000,
    },
    {
      id: 'sock-105',
      nodeId: 'node-stor-01',
      nodeHostname: 'ceph-osd-01.storage.internal',
      protocol: 'TCP',
      localAddress: '10.24.40.11',
      localPort: 6800,
      remoteAddress: '10.24.20.14',
      remotePort: 43102,
      processName: 'ceph-osd',
      pid: 4102,
      state: 'ESTABLISHED',
      throughputKbps: 312800,
      flagged: false,
      openedAt: now - 6_400_000,
    },
    {
      id: 'sock-106',
      nodeId: 'node-ctrl-01',
      nodeHostname: host.hostname || 'ctrl-gw-01.lab.internal',
      protocol: 'TLS',
      localAddress: controllerIp,
      localPort: 3000,
      remoteAddress: '10.24.10.1',
      remotePort: 39114,
      processName: 'sentinel-console',
      pid: process.pid,
      state: 'LISTEN',
      throughputKbps: 1840,
      flagged: false,
      openedAt: now - host.uptimeSeconds * 1000,
    },
    {
      id: 'sock-107',
      nodeId: 'node-iam-01',
      nodeHostname: 'vault-kms-01.core.internal',
      protocol: 'TLS',
      localAddress: '10.24.10.10',
      localPort: 8200,
      remoteAddress: '10.24.10.2',
      remotePort: 50822,
      processName: 'vault',
      pid: 2201,
      state: 'ESTABLISHED',
      throughputKbps: 420,
      flagged: false,
      openedAt: now - 5_100_000,
    },
    {
      id: 'sock-108',
      nodeId: 'node-edge-01',
      nodeHostname: 'ingress-proxy-01.edge.internal',
      protocol: 'TLS',
      localAddress: '10.24.30.5',
      localPort: 443,
      remoteAddress: '172.64.155.12',
      remotePort: 41098,
      processName: 'envoy',
      pid: 3310,
      state: 'ESTABLISHED',
      throughputKbps: 128400,
      flagged: false,
      openedAt: now - 920_000,
    },
  ];

  const events: SecurityEvent[] = [
    {
      id: 'evt-9001',
      timestamp: now - 48_000,
      severity: 'critical',
      nodeId: 'node-edge-02',
      nodeHostname: 'dmz-relay-07.edge.internal',
      ruleId: 'NET-EGRESS-4444',
      category: 'Anomalous Egress',
      summary: 'Sustained outbound TLS-unwrapped stream to 185.220.101.47:51922 from PID 28419.',
      sourceIp: '185.220.101.47',
      disposition: 'Flagged',
      acknowledged: false,
    },
    {
      id: 'evt-9002',
      timestamp: now - 140_000,
      severity: 'warning',
      nodeId: 'node-comp-02',
      nodeHostname: 'gpu-infer-02.compute.internal',
      ruleId: 'LAT-SLA-25MS',
      category: 'Mesh Latency Drift',
      summary: 'RTT exceeded 25ms SLA threshold (current 38.4ms, 1.2% packet drop on NIC ens5f0).',
      sourceIp: '10.24.20.15',
      disposition: 'Flagged',
      acknowledged: false,
    },
    {
      id: 'evt-9003',
      timestamp: now - 280_000,
      severity: 'warning',
      nodeId: 'node-edge-02',
      nodeHostname: 'dmz-relay-07.edge.internal',
      ruleId: 'AUTH-SSH-SYN',
      category: 'Credential Probe',
      summary: '42 incomplete SSH SYN_RECV handshakes observed from 198.51.100.83 within 60s.',
      sourceIp: '198.51.100.83',
      disposition: 'Blocked',
      acknowledged: false,
    },
    {
      id: 'evt-9004',
      timestamp: now - 1_900_000,
      severity: 'critical',
      nodeId: 'node-lab-02',
      nodeHostname: 'sandbox-runner-09.lab.internal',
      ruleId: 'IDS-4092',
      category: 'Quarantine Enforcement',
      summary: 'Node moved to VLAN-999 Quarantine after outbound C2 beacon signature match.',
      sourceIp: '10.24.99.9',
      disposition: 'Quarantined',
      acknowledged: true,
      acknowledgedBy: 'secops-auto',
    },
    {
      id: 'evt-9005',
      timestamp: now - 3_600_000,
      severity: 'info',
      nodeId: 'node-iam-01',
      nodeHostname: 'vault-kms-01.core.internal',
      ruleId: 'TLS-ROTATE-01',
      category: 'Certificate Audit',
      summary: 'mTLS fleet leaf certificates rotated cleanly across 11 active endpoints.',
      sourceIp: '10.24.10.10',
      disposition: 'Operator Action',
      acknowledged: true,
      acknowledgedBy: 'admin@lab.internal',
    },
  ];

  return {
    nodes,
    sockets,
    events,
    lastSweepAt: now - 180_000,
  };
}

class FleetEngine extends EventEmitter {
  private state: PersistedState;
  private telemetryHistory: TelemetryPoint[] = [];
  private tickTimer: NodeJS.Timeout | null = null;
  private tickCount = 0;

  constructor() {
    super();
    const host = collectHostTelemetry();
    this.state = this.loadOrInitState(host);
    this.seedTelemetryHistory();
    this.startLoop();
  }

  private loadOrInitState(host: HostTelemetry): PersistedState {
    try {
      if (fs.existsSync(STATE_FILE)) {
        const raw = fs.readFileSync(STATE_FILE, 'utf-8');
        const parsed = JSON.parse(raw) as PersistedState;
        if (Array.isArray(parsed.nodes) && parsed.nodes.length > 0) {
          // Refresh local controller node metadata with current runtime OS info
          const localNode = parsed.nodes.find((n) => n.isLocalController);
          if (localNode) {
            localNode.hostname = host.hostname || localNode.hostname;
            localNode.cpuPct = host.cpuLoadPct;
            localNode.memPct = host.memUsedPct;
            localNode.memTotalGb = Number((host.memTotalBytes / 1024 ** 3).toFixed(1));
            localNode.uptimeSeconds = host.uptimeSeconds;
          }
          return parsed;
        }
      }
    } catch {
      // Fallback to fresh seed state
    }
    const seed = buildSeedState(host);
    this.persist(seed);
    return seed;
  }

  private persist(nextState: PersistedState = this.state): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(STATE_FILE, JSON.stringify(nextState, null, 2), 'utf-8');
    } catch {
      // Ignore write errors in read-only edge cases
    }
  }

  private seedTelemetryHistory(): void {
    const now = Date.now();
    const points: TelemetryPoint[] = [];
    for (let i = 59; i >= 0; i--) {
      const ts = now - i * 1000;
      const wave = Math.sin(i * 0.25) * 240 + Math.cos(i * 0.11) * 140;
      const rx = Number(Math.max(1200, 6800 + wave).toFixed(1));
      const tx = Number(Math.max(900, 5900 + wave * 0.82).toFixed(1));
      const lat = Number(Math.max(1.2, 13.8 + Math.sin(i * 0.3) * 2.1).toFixed(2));
      points.push({
        timestamp: ts,
        rxMbps: rx,
        txMbps: tx,
        meanLatencyMs: lat,
        packetDropRate: Number((0.18 + Math.abs(Math.sin(i * 0.2)) * 0.24).toFixed(2)),
      });
    }
    this.telemetryHistory = points;
  }

  private startLoop(): void {
    if (this.tickTimer) return;
    this.tickTimer = setInterval(() => {
      this.stepTelemetry();
    }, 1000);
  }

  private stepTelemetry(): void {
    this.tickCount += 1;
    const now = Date.now();
    const host = collectHostTelemetry();

    let totalRx = 0;
    let totalTx = 0;
    let latSum = 0;
    let activeLatCount = 0;
    let dropSum = 0;

    for (const node of this.state.nodes) {
      if (node.isLocalController) {
        node.cpuPct = host.cpuLoadPct;
        node.memPct = host.memUsedPct;
        node.uptimeSeconds = host.uptimeSeconds;
        node.lastHeartbeat = now;
        if (node.status !== 'isolated') {
          node.rxMbps = Number(
            Math.max(180, node.rxMbps + (Math.random() - 0.5) * 28).toFixed(1)
          );
          node.txMbps = Number(
            Math.max(160, node.txMbps + (Math.random() - 0.5) * 24).toFixed(1)
          );
          node.latencyMs = Number(
            Math.max(0.2, 0.35 + Math.random() * 0.25).toFixed(2)
          );
        }
      } else if (node.status === 'isolated') {
        node.cpuPct = Number(Math.max(1.5, Math.min(8, node.cpuPct + (Math.random() - 0.5) * 0.8)).toFixed(1));
        node.rxMbps = 0;
        node.txMbps = 0;
        node.latencyMs = 0;
        node.lastHeartbeat = now - 500;
      } else {
        const cpuDelta = (Math.random() - 0.49) * 3.6;
        const memDelta = (Math.random() - 0.5) * 0.6;
        const baseFloor = node.status === 'critical' ? 78 : node.status === 'degraded' ? 72 : 10;
        node.cpuPct = Number(
          Math.min(98.4, Math.max(baseFloor, node.cpuPct + cpuDelta)).toFixed(1)
        );
        node.memPct = Number(
          Math.min(96.0, Math.max(16.0, node.memPct + memDelta)).toFixed(1)
        );
        node.rxMbps = Number(
          Math.max(24, node.rxMbps + (Math.random() - 0.5) * (node.rxMbps * 0.06)).toFixed(1)
        );
        node.txMbps = Number(
          Math.max(18, node.txMbps + (Math.random() - 0.5) * (node.txMbps * 0.06)).toFixed(1)
        );
        const targetLat =
          node.status === 'critical' ? 110 : node.status === 'degraded' ? 36 : 1.8;
        node.latencyMs = Number(
          Math.max(
            0.4,
            node.latencyMs * 0.7 + (targetLat + (Math.random() - 0.5) * 4.5) * 0.3
          ).toFixed(1)
        );
        node.uptimeSeconds += 1;
        node.lastHeartbeat = now - Math.floor(Math.random() * 600);
      }

      node.cpuHistory = [...node.cpuHistory.slice(-23), node.cpuPct];

      if (node.status !== 'isolated') {
        totalRx += node.rxMbps;
        totalTx += node.txMbps;
        latSum += node.latencyMs;
        activeLatCount += 1;
        dropSum += node.packetLossPct;
      }
    }

    const point: TelemetryPoint = {
      timestamp: now,
      rxMbps: Number(totalRx.toFixed(1)),
      txMbps: Number(totalTx.toFixed(1)),
      meanLatencyMs: Number(
        (activeLatCount > 0 ? latSum / activeLatCount : 0).toFixed(2)
      ),
      packetDropRate: Number(
        (activeLatCount > 0 ? dropSum / activeLatCount : 0).toFixed(2)
      ),
    };

    this.telemetryHistory = [...this.telemetryHistory.slice(-179), point];

    // Periodically persist every 15 seconds to keep uptime/history warm without disk thrash
    if (this.tickCount % 15 === 0) {
      this.persist();
    }

    this.emit('tick', {
      point,
      nodes: this.state.nodes,
      hostTelemetry: host,
    });
  }

  public getSnapshot(): FleetSnapshot {
    return {
      nodes: this.state.nodes,
      sockets: this.state.sockets,
      events: this.state.events,
      hostTelemetry: collectHostTelemetry(),
      telemetryHistory: this.telemetryHistory,
      lastSweepAt: this.state.lastSweepAt,
    };
  }

  public addNode(input: {
    hostname: string;
    role: string;
    ipAddress: string;
    macAddress: string;
    vlan: string;
    rackLocation: string;
    memTotalGb: number;
  }): FleetNode {
    const now = Date.now();
    const cleanVlan = input.vlan.startsWith('VLAN-') ? input.vlan : `VLAN-${input.vlan}`;
    const octets = input.ipAddress.split('.');
    const subnet =
      octets.length === 4 ? `${octets[0]}.${octets[1]}.${octets[2]}.0/24` : '10.24.20.0/24';

    const newNode: FleetNode = {
      id: `node-${now.toString(36)}`,
      hostname: input.hostname.trim(),
      role: input.role.trim() || 'Managed Worker Node',
      rackLocation: input.rackLocation.trim() || 'Rack B4 · U01',
      ipAddress: input.ipAddress.trim(),
      macAddress: input.macAddress.trim().toUpperCase(),
      vlan: cleanVlan,
      originalVlan: cleanVlan,
      subnet,
      mtu: 1500,
      status: 'online',
      isLocalController: false,
      cpuPct: 18.4,
      memPct: 34.2,
      memTotalGb: input.memTotalGb || 64,
      latencyMs: 1.7,
      packetLossPct: 0,
      rxMbps: 145.2,
      txMbps: 112.8,
      uptimeSeconds: 120,
      kernel: 'Linux 6.8.0-45-generic',
      openPorts: [22, 443, 9100],
      cpuHistory: Array.from({ length: 24 }, () => 18.4),
      lastHeartbeat: now,
    };

    this.state.nodes.unshift(newNode);
    this.state.events.unshift({
      id: `evt-${now}`,
      timestamp: now,
      severity: 'info',
      nodeId: newNode.id,
      nodeHostname: newNode.hostname,
      ruleId: 'FLEET-ENROLL',
      category: 'Node Enrollment',
      summary: `Enrolled managed endpoint ${newNode.ipAddress} (${newNode.macAddress}) into ${newNode.vlan}.`,
      sourceIp: newNode.ipAddress,
      disposition: 'Operator Action',
      acknowledged: true,
      acknowledgedBy: 'console-operator',
    });

    this.persist();
    return newNode;
  }

  public isolateNode(id: string, reason?: string): FleetNode | null {
    const node = this.state.nodes.find((n) => n.id === id);
    if (!node || node.isLocalController) return null;

    const now = Date.now();
    node.status = 'isolated';
    node.vlan = 'VLAN-999';
    node.rxMbps = 0;
    node.txMbps = 0;
    node.latencyMs = 0;
    node.isolationReason =
      reason?.trim() || 'Manual safety isolation enacted from Fleet Console';

    // Terminate active non-listening external sockets for this node
    const droppedCount = this.state.sockets.filter((s) => s.nodeId === id).length;
    this.state.sockets = this.state.sockets.filter((s) => s.nodeId !== id);

    this.state.events.unshift({
      id: `evt-${now}`,
      timestamp: now,
      severity: 'critical',
      nodeId: node.id,
      nodeHostname: node.hostname,
      ruleId: 'SEC-ISOLATE',
      category: 'Quarantine Enforcement',
      summary: `Node isolated to VLAN-999 (${droppedCount} active socket sessions terminated). Reason: ${node.isolationReason}.`,
      sourceIp: node.ipAddress,
      disposition: 'Quarantined',
      acknowledged: false,
    });

    this.persist();
    return node;
  }

  public restoreNode(id: string): FleetNode | null {
    const node = this.state.nodes.find((n) => n.id === id);
    if (!node) return null;

    const now = Date.now();
    node.status = 'online';
    node.vlan = node.originalVlan || 'VLAN-20';
    node.rxMbps = 124.5;
    node.txMbps = 98.4;
    node.latencyMs = 1.9;
    node.packetLossPct = 0;
    node.cpuPct = Math.min(node.cpuPct, 42.0);
    delete node.isolationReason;

    this.state.events.unshift({
      id: `evt-${now}`,
      timestamp: now,
      severity: 'info',
      nodeId: node.id,
      nodeHostname: node.hostname,
      ruleId: 'SEC-RESTORE',
      category: 'Quarantine Lifted',
      summary: `Node access restored to ${node.vlan} following safety verification.`,
      sourceIp: node.ipAddress,
      disposition: 'Operator Action',
      acknowledged: true,
      acknowledgedBy: 'console-operator',
    });

    this.persist();
    return node;
  }

  public terminateSocket(socketId: string): SocketSession | null {
    const idx = this.state.sockets.findIndex((s) => s.id === socketId);
    if (idx === -1) return null;
    const [removed] = this.state.sockets.splice(idx, 1);

    const now = Date.now();
    this.state.events.unshift({
      id: `evt-${now}`,
      timestamp: now,
      severity: removed.flagged ? 'warning' : 'info',
      nodeId: removed.nodeId,
      nodeHostname: removed.nodeHostname,
      ruleId: 'NET-SOCK-KILL',
      category: 'Socket Terminated',
      summary: `Terminated ${removed.protocol} socket ${removed.localAddress}:${removed.localPort} -> ${removed.remoteAddress}:${removed.remotePort} (PID ${removed.pid} ${removed.processName}).`,
      sourceIp: removed.remoteAddress,
      disposition: 'Operator Action',
      acknowledged: true,
      acknowledgedBy: 'console-operator',
    });

    this.persist();
    return removed;
  }

  public acknowledgeEvent(eventId: string): SecurityEvent | null {
    const evt = this.state.events.find((e) => e.id === eventId);
    if (!evt) return null;
    evt.acknowledged = true;
    evt.acknowledgedBy = 'console-operator';
    this.persist();
    return evt;
  }

  public runFleetSweep(nodeId?: string): {
    sweptNodes: number;
    timestamp: number;
    findings: string[];
  } {
    const now = Date.now();
    this.state.lastSweepAt = now;
    const targets = nodeId
      ? this.state.nodes.filter((n) => n.id === nodeId)
      : this.state.nodes;

    const findings: string[] = [];
    for (const node of targets) {
      node.lastHeartbeat = now;
      if (node.status === 'critical') {
        findings.push(`${node.hostname}: elevated packet drop (${node.packetLossPct}%) & high RTT (${node.latencyMs}ms)`);
      } else if (node.status === 'degraded') {
        findings.push(`${node.hostname}: CPU utilization elevated at ${node.cpuPct}%`);
      }
    }

    this.state.events.unshift({
      id: `evt-${now}`,
      timestamp: now,
      severity: findings.length > 0 ? 'warning' : 'info',
      nodeId: nodeId || 'node-ctrl-01',
      nodeHostname: nodeId
        ? targets[0]?.hostname || 'fleet-sweep'
        : 'fleet-wide-sweep',
      ruleId: 'FLEET-SWEEP',
      category: 'Active Integrity Sweep',
      summary: `Completed integrity & port sweep across ${targets.length} endpoint(s). ${findings.length} anomaly notice(s) logged.`,
      sourceIp: '10.24.10.2',
      disposition: 'Operator Action',
      acknowledged: findings.length === 0,
      acknowledgedBy: findings.length === 0 ? 'console-operator' : undefined,
    });

    this.persist();
    return {
      sweptNodes: targets.length,
      timestamp: now,
      findings,
    };
  }

  public async runLiveProbe(target: string, port: number): Promise<ProbeResult> {
    const cleanTarget = target.trim();
    const startDns = performance.now();
    let resolvedIp: string | null = null;
    let dnsLookupMs: number | null = null;

    // Check if target matches an internal fleet hostname or IP first
    const matchedNode = this.state.nodes.find(
      (n) =>
        n.hostname.toLowerCase() === cleanTarget.toLowerCase() ||
        n.ipAddress === cleanTarget
    );

    if (matchedNode && !matchedNode.isLocalController) {
      const dnsMs = Number((Math.random() * 1.4 + 0.4).toFixed(2));
      const portOpen =
        matchedNode.status !== 'isolated' &&
        (matchedNode.openPorts.includes(port) || port === 22);
      return {
        target: cleanTarget,
        port,
        resolvedIp: matchedNode.ipAddress,
        reachable: portOpen,
        latencyMs: portOpen ? matchedNode.latencyMs : null,
        dnsLookupMs: dnsMs,
        error:
          matchedNode.status === 'isolated'
            ? `Connection dropped by VLAN-999 quarantine ACL`
            : portOpen
              ? null
              : `Connection refused on ${matchedNode.ipAddress}:${port}`,
        checkedAt: Date.now(),
      };
    }

    // Otherwise execute real Node.js DNS lookup + TCP socket connect
    try {
      if (net.isIP(cleanTarget)) {
        resolvedIp = cleanTarget;
        dnsLookupMs = 0.1;
      } else {
        const lookup = await dns.promises.lookup(cleanTarget);
        resolvedIp = lookup.address;
        dnsLookupMs = Number((performance.now() - startDns).toFixed(2));
      }
    } catch (err) {
      return {
        target: cleanTarget,
        port,
        resolvedIp: null,
        reachable: false,
        latencyMs: null,
        dnsLookupMs: Number((performance.now() - startDns).toFixed(2)),
        error: err instanceof Error ? err.message : 'DNS resolution failed',
        checkedAt: Date.now(),
      };
    }

    return new Promise<ProbeResult>((resolve) => {
      const socket = new net.Socket();
      const startTcp = performance.now();
      let settled = false;

      const finish = (reachable: boolean, error: string | null) => {
        if (settled) return;
        settled = true;
        const latencyMs = reachable
          ? Number((performance.now() - startTcp).toFixed(2))
          : null;
        socket.destroy();
        resolve({
          target: cleanTarget,
          port,
          resolvedIp,
          reachable,
          latencyMs,
          dnsLookupMs,
          error,
          checkedAt: Date.now(),
        });
      };

      socket.setTimeout(2500);
      socket.once('connect', () => finish(true, null));
      socket.once('timeout', () => finish(false, 'TCP handshake timed out (2500ms)'));
      socket.once('error', (err) => finish(false, err.message));
      socket.connect(port, resolvedIp || cleanTarget);
    });
  }

  public exportAuditCsv(): string {
    const header = [
      'id',
      'timestamp_iso',
      'severity',
      'node_hostname',
      'rule_id',
      'category',
      'source_ip',
      'disposition',
      'acknowledged',
      'summary',
    ].join(',');

    const escapeCsv = (val: string) => `"${val.replaceAll('"', '""')}"`;

    const rows = this.state.events.map((e) =>
      [
        e.id,
        new Date(e.timestamp).toISOString(),
        e.severity,
        e.nodeHostname,
        e.ruleId,
        e.category,
        e.sourceIp,
        e.disposition,
        String(e.acknowledged),
        escapeCsv(e.summary),
      ].join(',')
    );

    return [header, ...rows].join('\n');
  }
}

export const fleetEngine = new FleetEngine();
