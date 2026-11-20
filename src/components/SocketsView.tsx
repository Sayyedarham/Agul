import React, { useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { FleetNode, SocketSession } from '../types/console.ts';
import { formatRelativeAge } from '../utils/format.ts';
import { MonoBadge } from './StatusBadge.tsx';

interface SocketsViewProps {
  sockets: SocketSession[];
  nodes: FleetNode[];
  searchQuery: string;
  onTerminateSocket: (socketId: string) => Promise<void>;
  onSelectNode: (nodeId: string) => void;
}

export const SocketsView: React.FC<SocketsViewProps> = ({
  sockets,
  nodes,
  searchQuery,
  onTerminateSocket,
  onSelectNode,
}) => {
  const [filterMode, setFilterMode] = useState<'all' | 'flagged' | 'TLS' | 'TCP'>('all');
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return sockets.filter((s) => {
      if (filterMode === 'flagged' && !s.flagged) return false;
      if (filterMode === 'TLS' && s.protocol !== 'TLS') return false;
      if (filterMode === 'TCP' && s.protocol !== 'TCP') return false;
      if (!q) return true;
      return (
        s.nodeHostname.toLowerCase().includes(q) ||
        s.localAddress.includes(q) ||
        s.remoteAddress.includes(q) ||
        s.processName.toLowerCase().includes(q) ||
        String(s.localPort).includes(q)
      );
    });
  }, [sockets, filterMode, searchQuery]);

  const vlanSummary = useMemo(() => {
    const map = new Map<string, { vlan: string; nodes: number; rx: number; tx: number }>();
    for (const n of nodes) {
      const curr = map.get(n.vlan) || { vlan: n.vlan, nodes: 0, rx: 0, tx: 0 };
      curr.nodes += 1;
      curr.rx += n.rxMbps;
      curr.tx += n.txMbps;
      map.set(n.vlan, curr);
    }
    return Array.from(map.values()).sort((a, b) => a.vlan.localeCompare(b.vlan));
  }, [nodes]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {vlanSummary.map((v) => (
          <div
            key={v.vlan}
            className="rounded-[10px] border border-[#E2E8F0] bg-[#FFFFFF] p-3.5"
          >
            <div className="flex items-center justify-between">
              <MonoBadge tone={v.vlan === 'VLAN-999' ? 'neutral' : 'sky'}>
                {v.vlan}
              </MonoBadge>
              <span className="font-mono text-[11px] text-[#64748B] tnum">
                {v.nodes} node(s)
              </span>
            </div>
            <div className="mt-2 font-mono text-[12px] text-[#0F172A] tnum">
              RX {v.rx.toFixed(0)} · TX {v.tx.toFixed(0)} Mbps
            </div>
          </div>
        ))}
      </div>

      <section className="rounded-[10px] border border-[#E2E8F0] bg-[#FFFFFF] overflow-hidden">
        <div className="h-11 px-4 border-b border-[#E2E8F0] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-[14px] font-semibold text-[#0F172A]">
              Active Fleet Socket Sessions
            </h2>
            <span className="font-mono text-[11px] text-[#64748B] tnum">
              {filtered.length} open
            </span>
          </div>

          <div className="flex items-center gap-1 p-0.5 bg-[#F1F5F9] rounded-[8px]">
            {[
              { id: 'all', label: 'All Sockets' },
              { id: 'flagged', label: 'Flagged' },
              { id: 'TLS', label: 'TLS' },
              { id: 'TCP', label: 'TCP' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterMode(tab.id as typeof filterMode)}
                className={`px-2.5 py-1 rounded-[6px] text-[12px] font-medium transition-colors whitespace-nowrap ${
                  filterMode === tab.id
                    ? 'bg-[#FFFFFF] text-[#0F172A] shadow-xs'
                    : 'text-[#475569] hover:text-[#0F172A]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-10 text-center text-[13px] text-[#64748B]">
            No active sockets match your current filter criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="h-8 bg-[#F1F5F9] border-b border-[#E2E8F0] text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B]">
                  <th className="px-4">Endpoint Host</th>
                  <th className="px-3">Proto / State</th>
                  <th className="px-3">Local Bind</th>
                  <th className="px-3">Remote Peer</th>
                  <th className="px-3">Process / PID</th>
                  <th className="px-3 text-right">Rate</th>
                  <th className="px-3 text-right">Age</th>
                  <th className="px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((sock) => (
                  <tr
                    key={sock.id}
                    className={`h-10 border-b border-[#E2E8F0] last:border-b-0 ${
                      sock.flagged ? 'bg-[#FFF1F2]/40' : 'bg-[#FFFFFF] hover:bg-[#F8FAFC]'
                    }`}
                  >
                    <td className="px-4 py-1.5">
                      <button
                        type="button"
                        onClick={() => onSelectNode(sock.nodeId)}
                        className="text-[13px] font-medium text-[#0284C7] hover:underline text-left"
                      >
                        {sock.nodeHostname}
                      </button>
                      {sock.flagged && sock.flagReason && (
                        <div className="text-[11px] text-[#9F1239]">{sock.flagReason}</div>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <MonoBadge tone={sock.flagged ? 'neutral' : 'sky'}>
                          {sock.protocol}
                        </MonoBadge>
                        <span className="font-mono text-[11px] text-[#475569]">
                          {sock.state}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-1.5 font-mono text-[11px] text-[#0F172A] tnum">
                      {sock.localAddress}:{sock.localPort}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-[11px] text-[#334155] tnum">
                      {sock.remoteAddress}:{sock.remotePort}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-[11px] text-[#334155] tnum">
                      {sock.processName} ({sock.pid})
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-[12px] text-[#0F172A] tnum">
                      {(sock.throughputKbps / 1000).toFixed(1)} Mbps
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-[11px] text-[#64748B] tnum">
                      {formatRelativeAge(sock.openedAt)}
                    </td>
                    <td className="px-4 py-1.5 text-right">
                      <button
                        type="button"
                        disabled={busyId === sock.id}
                        onClick={async () => {
                          setBusyId(sock.id);
                          try {
                            await onTerminateSocket(sock.id);
                          } finally {
                            setBusyId(null);
                          }
                        }}
                        className="h-7 px-2.5 inline-flex items-center gap-1 rounded-[6px] border border-[#FECDD3] bg-[#FFF1F2] text-[11px] font-medium text-[#E11D48] hover:bg-[#FFE4E6] whitespace-nowrap"
                      >
                        <Trash2 className="h-3 w-3" />
                        <span>{busyId === sock.id ? 'Terminating...' : 'Terminate Socket'}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
