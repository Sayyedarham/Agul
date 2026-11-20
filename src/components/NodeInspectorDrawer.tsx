import React, { useState } from 'react';
import {
  Activity,
  RefreshCw,
  ShieldBan,
  ShieldCheck,
  Terminal,
  X,
} from 'lucide-react';
import type { FleetNode, SecurityEvent, SocketSession } from '../types/console.ts';
import { formatThroughput, formatTimeShort, formatUptime } from '../utils/format.ts';
import { MonoBadge, NodeStatusPill, SeverityBadge } from './StatusBadge.tsx';

interface NodeInspectorDrawerProps {
  node: FleetNode | null;
  sockets: SocketSession[];
  events: SecurityEvent[];
  onClose: () => void;
  onIsolate: (nodeId: string, reason: string) => Promise<void>;
  onRestore: (nodeId: string) => Promise<void>;
  onTerminateSocket: (socketId: string) => Promise<void>;
  onSweepNode: (nodeId: string) => Promise<void>;
  onProbeNode: (target: string, port: number) => void;
}

export const NodeInspectorDrawer: React.FC<NodeInspectorDrawerProps> = ({
  node,
  sockets,
  events,
  onClose,
  onIsolate,
  onRestore,
  onTerminateSocket,
  onSweepNode,
  onProbeNode,
}) => {
  const [confirmIsolate, setConfirmIsolate] = useState(false);
  const [isolationReason, setIsolationReason] = useState(
    'Anomalous socket egress / manual triage quarantine'
  );
  const [busyAction, setBusyAction] = useState<string | null>(null);

  if (!node) return null;

  const nodeSockets = sockets.filter((s) => s.nodeId === node.id);
  const nodeEvents = events.filter((e) => e.nodeId === node.id).slice(0, 6);

  const sparkW = 360;
  const sparkH = 56;
  const sparkPoints = node.cpuHistory
    .map((val, idx) => {
      const x =
        node.cpuHistory.length > 1
          ? (idx / (node.cpuHistory.length - 1)) * sparkW
          : 0;
      const y = sparkH - (Math.min(100, Math.max(0, val)) / 100) * (sparkH - 8) - 4;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <aside
      aria-label="Node Telemetry Inspector"
      className="w-full lg:w-[430px] shrink-0 border-l border-[#E2E8F0] bg-[#F8FAFC] flex flex-col h-full overflow-y-auto"
    >
      <div className="h-12 px-4 bg-[#FFFFFF] border-b border-[#E2E8F0] flex items-center justify-between gap-2 shrink-0 sticky top-0 z-10">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-[13px] font-semibold text-[#0F172A] truncate">
            {node.hostname}
          </span>
          <NodeStatusPill status={node.status} />
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close inspector"
          className="h-7 w-7 inline-flex items-center justify-center rounded-[6px] border border-[#E2E8F0] bg-[#FFFFFF] text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="p-4 space-y-4">
        <div className="rounded-[10px] border border-[#E2E8F0] bg-[#FFFFFF] p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B]">
              Hardware & Network Identity
            </span>
            <span className="text-[11px] text-[#64748B]">{node.rackLocation}</span>
          </div>

          <div className="grid grid-cols-2 gap-y-2 gap-x-3 text-[12px]">
            <div>
              <div className="text-[11px] text-[#64748B]">IPv4 Address</div>
              <div className="mt-0.5">
                <MonoBadge>{node.ipAddress}</MonoBadge>
              </div>
            </div>
            <div>
              <div className="text-[11px] text-[#64748B]">MAC Address</div>
              <div className="mt-0.5">
                <MonoBadge>{node.macAddress}</MonoBadge>
              </div>
            </div>
            <div>
              <div className="text-[11px] text-[#64748B]">VLAN / Subnet</div>
              <div className="mt-0.5 font-mono text-[11px] text-[#0F172A]">
                {node.vlan} · {node.subnet}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-[#64748B]">MTU / Uptime</div>
              <div className="mt-0.5 font-mono text-[11px] text-[#0F172A] tnum">
                {node.mtu} B · {formatUptime(node.uptimeSeconds)}
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-[#E2E8F0] flex items-center justify-between text-[11px]">
            <span className="text-[#64748B]">Kernel: {node.kernel}</span>
            <span className="font-mono text-[#334155]">
              Ports:{' '}
              {node.openPorts.length > 0
                ? node.openPorts.map((p) => `:${p}`).join(', ')
                : 'None (Quarantined)'}
            </span>
          </div>
        </div>

        {node.status === 'isolated' && node.isolationReason && (
          <div className="rounded-[10px] border border-[#FECDD3] bg-[#FFF1F2] p-3 text-[12px] text-[#9F1239]">
            <div className="font-semibold">Quarantine Enforcement Active</div>
            <div className="mt-0.5 text-[12px]">{node.isolationReason}</div>
          </div>
        )}

        <div className="rounded-[10px] border border-[#E2E8F0] bg-[#FFFFFF] p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B]">
              CPU Load Trend (24s)
            </span>
            <span className="font-mono text-[12px] font-semibold text-[#0F172A] tnum">
              {node.cpuPct.toFixed(1)}% · Mem {node.memPct.toFixed(1)}% ({node.memTotalGb} GB)
            </span>
          </div>
          <svg viewBox={`0 0 ${sparkW} ${sparkH}`} className="w-full h-14 bg-[#F8FAFC] rounded-[6px] border border-[#E2E8F0]">
            <polyline
              fill="none"
              stroke={node.cpuPct > 85 ? '#F43F5E' : '#0284C7'}
              strokeWidth={1.75}
              strokeLinejoin="round"
              points={sparkPoints}
            />
          </svg>
          <div className="flex items-center justify-between text-[11px] font-mono text-[#475569] tnum">
            <span>RX {formatThroughput(node.rxMbps)}</span>
            <span>TX {formatThroughput(node.txMbps)}</span>
            <span>Loss {node.packetLossPct.toFixed(1)}%</span>
          </div>
        </div>

        <div className="rounded-[10px] border border-[#E2E8F0] bg-[#FFFFFF] overflow-hidden">
          <div className="h-9 px-3.5 bg-[#F1F5F9] border-b border-[#E2E8F0] flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B]">
              Active Socket Sessions ({nodeSockets.length})
            </span>
          </div>
          {nodeSockets.length === 0 ? (
            <div className="p-3.5 text-[12px] text-[#64748B]">
              No active tracked socket sessions on this endpoint.
            </div>
          ) : (
            <div className="divide-y divide-[#E2E8F0]">
              {nodeSockets.map((sock) => (
                <div key={sock.id} className="p-3 text-[12px] space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <MonoBadge tone={sock.flagged ? 'neutral' : 'sky'}>
                        {sock.protocol} :{sock.localPort}
                      </MonoBadge>
                      <span className="font-mono text-[11px] text-[#0F172A] truncate tnum">
                        → {sock.remoteAddress}:{sock.remotePort}
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={busyAction === sock.id}
                      onClick={async () => {
                        setBusyAction(sock.id);
                        try {
                          await onTerminateSocket(sock.id);
                        } finally {
                          setBusyAction(null);
                        }
                      }}
                      className="h-6 px-2 rounded-[6px] border border-[#FECDD3] bg-[#FFF1F2] text-[11px] font-medium text-[#E11D48] hover:bg-[#FFE4E6] shrink-0 whitespace-nowrap"
                    >
                      {busyAction === sock.id ? 'Killing...' : 'Terminate'}
                    </button>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-[#64748B] font-mono tnum">
                    <span>
                      {sock.processName} (PID {sock.pid}) · {sock.state}
                    </span>
                    <span>{(sock.throughputKbps / 1000).toFixed(1)} Mbps</span>
                  </div>
                  {sock.flagged && sock.flagReason && (
                    <div className="text-[11px] text-[#9F1239] bg-[#FFF1F2] rounded-[4px] px-2 py-1">
                      {sock.flagReason}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-[10px] border border-[#E2E8F0] bg-[#FFFFFF] overflow-hidden">
          <div className="h-9 px-3.5 bg-[#F1F5F9] border-b border-[#E2E8F0] flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B]">
              Recent Endpoint Events
            </span>
          </div>
          {nodeEvents.length === 0 ? (
            <div className="p-3.5 text-[12px] text-[#64748B]">
              No recent audit events recorded for this endpoint.
            </div>
          ) : (
            <div className="divide-y divide-[#E2E8F0]">
              {nodeEvents.map((evt) => (
                <div key={evt.id} className="p-3 space-y-1 text-[12px]">
                  <div className="flex items-center justify-between gap-2">
                    <SeverityBadge severity={evt.severity} />
                    <span className="font-mono text-[11px] text-[#64748B] tnum">
                      {formatTimeShort(evt.timestamp)}
                    </span>
                  </div>
                  <div className="font-medium text-[#0F172A]">{evt.category}</div>
                  <div className="text-[11px] text-[#475569] leading-relaxed">
                    {evt.summary}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-[10px] border border-[#E2E8F0] bg-[#FFFFFF] p-3.5 space-y-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B]">
            Operator Safety Controls
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busyAction === 'sweep'}
              onClick={async () => {
                setBusyAction('sweep');
                try {
                  await onSweepNode(node.id);
                } finally {
                  setBusyAction(null);
                }
              }}
              className="h-8 px-3 inline-flex items-center justify-center gap-1.5 rounded-[8px] border border-[#CBD5E1] bg-[#FFFFFF] text-[12px] font-medium text-[#334155] hover:bg-[#F8FAFC] whitespace-nowrap"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${busyAction === 'sweep' ? 'animate-spin' : ''}`}
              />
              <span>Port Sweep</span>
            </button>

            <button
              type="button"
              onClick={() => onProbeNode(node.ipAddress, node.openPorts[0] || 22)}
              className="h-8 px-3 inline-flex items-center justify-center gap-1.5 rounded-[8px] border border-[#CBD5E1] bg-[#FFFFFF] text-[12px] font-medium text-[#334155] hover:bg-[#F8FAFC] whitespace-nowrap"
            >
              <Terminal className="h-3.5 w-3.5" />
              <span>Run TCP Probe</span>
            </button>
          </div>

          {node.isLocalController ? (
            <div className="text-[11px] text-[#64748B] flex items-center gap-1.5 pt-1">
              <Activity className="h-3.5 w-3.5 text-[#0284C7]" />
              <span>Primary safety controller cannot be isolated from itself.</span>
            </div>
          ) : node.status === 'isolated' ? (
            <button
              type="button"
              disabled={busyAction === 'restore'}
              onClick={async () => {
                setBusyAction('restore');
                try {
                  await onRestore(node.id);
                } finally {
                  setBusyAction(null);
                }
              }}
              className="w-full h-9 px-3 inline-flex items-center justify-center gap-1.5 rounded-[8px] border border-[#A7F3D0] bg-[#ECFDF5] text-[12px] font-medium text-[#065F46] hover:bg-[#D1FAE5]"
            >
              <ShieldCheck className="h-4 w-4" />
              <span>
                {busyAction === 'restore'
                  ? 'Restoring VLAN Access...'
                  : `Restore Access (${node.originalVlan})`}
              </span>
            </button>
          ) : !confirmIsolate ? (
            <button
              type="button"
              onClick={() => setConfirmIsolate(true)}
              className="w-full h-9 px-3 inline-flex items-center justify-center gap-1.5 rounded-[8px] border border-[#FECDD3] bg-[#FFF1F2] text-[12px] font-medium text-[#E11D48] hover:bg-[#FFE4E6]"
            >
              <ShieldBan className="h-4 w-4" />
              <span>Isolate Machine to VLAN-999</span>
            </button>
          ) : (
            <div className="space-y-2 pt-1 border-t border-[#E2E8F0]">
              <label className="block text-[11px] font-medium text-[#334155]">
                Quarantine Audit Reason
              </label>
              <input
                type="text"
                value={isolationReason}
                onChange={(e) => setIsolationReason(e.target.value)}
                className="w-full h-8 px-2.5 rounded-[8px] border border-[#CBD5E1] bg-[#FFFFFF] text-[12px] text-[#0F172A] focus:outline-none focus:border-[#0284C7]"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={busyAction === 'isolate'}
                  onClick={async () => {
                    setBusyAction('isolate');
                    try {
                      await onIsolate(node.id, isolationReason);
                      setConfirmIsolate(false);
                    } finally {
                      setBusyAction(null);
                    }
                  }}
                  className="flex-1 h-8 px-3 rounded-[8px] bg-[#E11D48] text-[#FFFFFF] text-[12px] font-medium hover:bg-[#BE123C]"
                >
                  {busyAction === 'isolate' ? 'Isolating...' : 'Confirm Isolate'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmIsolate(false)}
                  className="h-8 px-3 rounded-[8px] border border-[#CBD5E1] bg-[#FFFFFF] text-[12px] font-medium text-[#334155] hover:bg-[#F8FAFC]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
