import React, { useMemo, useState } from 'react';
import { Check, ShieldBan } from 'lucide-react';
import type { FleetNode, SecurityEvent } from '../types/console.ts';
import { formatTimeShort } from '../utils/format.ts';
import { MonoBadge, SeverityBadge } from './StatusBadge.tsx';

interface SecurityAuditsViewProps {
  events: SecurityEvent[];
  nodes: FleetNode[];
  searchQuery: string;
  onAcknowledgeEvent: (eventId: string) => Promise<void>;
  onIsolateNode: (nodeId: string, reason: string) => Promise<void>;
  onSelectNode: (nodeId: string) => void;
}

export const SecurityAuditsView: React.FC<SecurityAuditsViewProps> = ({
  events,
  nodes,
  searchQuery,
  onAcknowledgeEvent,
  onIsolateNode,
  onSelectNode,
}) => {
  const [severityFilter, setSeverityFilter] = useState<'all' | 'critical' | 'warning' | 'info'>('all');
  const [onlyOpen, setOnlyOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return events.filter((e) => {
      if (severityFilter !== 'all' && e.severity !== severityFilter) return false;
      if (onlyOpen && e.acknowledged) return false;
      if (!q) return true;
      return (
        e.nodeHostname.toLowerCase().includes(q) ||
        e.ruleId.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q) ||
        e.summary.toLowerCase().includes(q) ||
        e.sourceIp.includes(q)
      );
    });
  }, [events, severityFilter, onlyOpen, searchQuery]);

  return (
    <section className="rounded-[10px] border border-[#E2E8F0] bg-[#FFFFFF] overflow-hidden">
      <div className="min-h-11 px-4 py-2 border-b border-[#E2E8F0] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-[14px] font-semibold text-[#0F172A]">
            Security & Safety Audit Trail
          </h2>
          <span className="font-mono text-[11px] text-[#64748B] tnum">
            {filtered.length} events
          </span>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <label className="inline-flex items-center gap-1.5 text-[12px] text-[#334155] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={onlyOpen}
              onChange={(e) => setOnlyOpen(e.target.checked)}
              className="rounded border-[#CBD5E1] text-[#0284C7] focus:ring-[#0284C7]"
            />
            <span>Unacknowledged only</span>
          </label>

          <div className="flex items-center gap-1 p-0.5 bg-[#F1F5F9] rounded-[8px]">
            {(['all', 'critical', 'warning', 'info'] as const).map((sev) => (
              <button
                key={sev}
                type="button"
                onClick={() => setSeverityFilter(sev)}
                className={`px-2.5 py-1 rounded-[6px] text-[12px] font-medium capitalize transition-colors whitespace-nowrap ${
                  severityFilter === sev
                    ? 'bg-[#FFFFFF] text-[#0F172A] shadow-xs'
                    : 'text-[#475569] hover:text-[#0F172A]'
                }`}
              >
                {sev}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="p-10 text-center text-[13px] text-[#64748B]">
          No audit events match the active filters.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="h-8 bg-[#F1F5F9] border-b border-[#E2E8F0] text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B]">
                <th className="px-4">Time</th>
                <th className="px-3">Severity</th>
                <th className="px-3">Rule ID</th>
                <th className="px-3">Endpoint</th>
                <th className="px-3">Summary & Source</th>
                <th className="px-3">Disposition</th>
                <th className="px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((evt) => {
                const targetNode = nodes.find((n) => n.id === evt.nodeId);
                const canIsolate =
                  targetNode &&
                  !targetNode.isLocalController &&
                  targetNode.status !== 'isolated';

                return (
                  <tr
                    key={evt.id}
                    className="border-b border-[#E2E8F0] last:border-b-0 bg-[#FFFFFF] hover:bg-[#F8FAFC]"
                  >
                    <td className="px-4 py-2.5 font-mono text-[11px] text-[#64748B] tnum whitespace-nowrap">
                      {formatTimeShort(evt.timestamp)}
                    </td>
                    <td className="px-3 py-2.5">
                      <SeverityBadge severity={evt.severity} />
                    </td>
                    <td className="px-3 py-2.5">
                      <MonoBadge>{evt.ruleId}</MonoBadge>
                    </td>
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => targetNode && onSelectNode(targetNode.id)}
                        className="text-[12px] font-medium text-[#0284C7] hover:underline text-left whitespace-nowrap"
                      >
                        {evt.nodeHostname}
                      </button>
                      <div className="text-[11px] text-[#64748B]">{evt.category}</div>
                    </td>
                    <td className="px-3 py-2.5 max-w-md">
                      <div className="text-[12px] text-[#0F172A] leading-snug">
                        {evt.summary}
                      </div>
                      <div className="mt-0.5 font-mono text-[11px] text-[#64748B] tnum">
                        Source: {evt.sourceIp}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="font-mono text-[11px] text-[#334155] whitespace-nowrap">
                        {evt.disposition}
                      </span>
                      {evt.acknowledged && (
                        <div className="text-[11px] text-[#64748B]">
                          Ack: {evt.acknowledgedBy || 'operator'}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {!evt.acknowledged && (
                          <button
                            type="button"
                            onClick={() => onAcknowledgeEvent(evt.id)}
                            className="h-7 px-2.5 inline-flex items-center gap-1 rounded-[6px] border border-[#CBD5E1] bg-[#FFFFFF] text-[11px] font-medium text-[#334155] hover:bg-[#F8FAFC] whitespace-nowrap"
                          >
                            <Check className="h-3 w-3 text-[#10B981]" />
                            <span>Acknowledge</span>
                          </button>
                        )}
                        {canIsolate && (
                          <button
                            type="button"
                            onClick={() =>
                              onIsolateNode(
                                targetNode.id,
                                `Quarantined via ${evt.ruleId} (${evt.category})`
                              )
                            }
                            className="h-7 px-2.5 inline-flex items-center gap-1 rounded-[6px] border border-[#FECDD3] bg-[#FFF1F2] text-[11px] font-medium text-[#E11D48] hover:bg-[#FFE4E6] whitespace-nowrap"
                          >
                            <ShieldBan className="h-3 w-3" />
                            <span>Isolate Node</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
