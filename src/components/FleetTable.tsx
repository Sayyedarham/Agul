import React, { useMemo, useState } from 'react';
import { ArrowUpDown, Eye, ShieldBan, ShieldCheck } from 'lucide-react';
import type { FleetNode, NodeStatus } from '../types/console.ts';
import { formatRelativeAge } from '../utils/format.ts';
import { MonoBadge, NodeStatusPill } from './StatusBadge.tsx';

interface FleetTableProps {
  nodes: FleetNode[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onIsolateNode: (nodeId: string) => void;
  onRestoreNode: (nodeId: string) => void;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  vlanFilter: string;
  onVlanFilterChange: (vlan: string) => void;
}

type SortKey = 'hostname' | 'cpuPct' | 'memPct' | 'latencyMs';

export const FleetTable: React.FC<FleetTableProps> = ({
  nodes,
  selectedNodeId,
  onSelectNode,
  onIsolateNode,
  onRestoreNode,
  statusFilter,
  onStatusFilterChange,
  vlanFilter,
  onVlanFilterChange,
}) => {
  const [sortKey, setSortKey] = useState<SortKey>('hostname');
  const [sortAsc, setSortAsc] = useState(true);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(key === 'hostname');
    }
  };

  const sortedNodes = useMemo(() => {
    return [...nodes].sort((a, b) => {
      const mul = sortAsc ? 1 : -1;
      if (sortKey === 'hostname') {
        return a.hostname.localeCompare(b.hostname) * mul;
      }
      return (a[sortKey] - b[sortKey]) * mul;
    });
  }, [nodes, sortKey, sortAsc]);

  const statuses: { id: string; label: string }[] = [
    { id: 'all', label: 'All Nodes' },
    { id: 'online', label: 'Online' },
    { id: 'degraded', label: 'Degraded' },
    { id: 'critical', label: 'Critical' },
    { id: 'isolated', label: 'Isolated' },
  ];

  const countByStatus = (st: NodeStatus) =>
    nodes.filter((n) => n.status === st).length;

  return (
    <section className="rounded-[10px] border border-[#E2E8F0] bg-[#FFFFFF] overflow-hidden">
      <div className="min-h-11 px-4 py-2 border-b border-[#E2E8F0] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-[14px] font-semibold text-[#0F172A]">
            Managed Fleet Telemetry
          </h2>
          <span className="font-mono text-[11px] text-[#64748B] tnum">
            {sortedNodes.length} visible
          </span>
          {vlanFilter !== 'all' && (
            <button
              type="button"
              onClick={() => onVlanFilterChange('all')}
              className="font-mono text-[11px] text-[#0284C7] bg-[#F0F9FF] border border-[#BAE6FD] rounded-[6px] px-2 py-0.5 hover:bg-[#E0F2FE] whitespace-nowrap"
            >
              {vlanFilter} ×
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 p-0.5 bg-[#F1F5F9] rounded-[8px] overflow-x-auto">
          {statuses.map((st) => {
            const active = statusFilter === st.id;
            return (
              <button
                key={st.id}
                type="button"
                onClick={() => onStatusFilterChange(st.id)}
                className={`px-2.5 py-1 rounded-[6px] text-[12px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-[#FFFFFF] text-[#0F172A] shadow-xs'
                    : 'text-[#475569] hover:text-[#0F172A]'
                }`}
              >
                {st.label}
                {st.id !== 'all' && (
                  <span className="ml-1 font-mono text-[11px] text-[#64748B] tnum">
                    {countByStatus(st.id as NodeStatus)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {sortedNodes.length === 0 ? (
        <div className="p-10 text-center">
          <p className="text-[14px] font-medium text-[#0F172A]">
            No fleet endpoints match the current filters
          </p>
          <p className="mt-1 text-[12px] text-[#64748B]">
            Clear your search query or reset VLAN and status filters to view all registered nodes.
          </p>
          <button
            type="button"
            onClick={() => {
              onStatusFilterChange('all');
              onVlanFilterChange('all');
            }}
            className="mt-3 h-8 px-3 rounded-[8px] border border-[#CBD5E1] bg-[#FFFFFF] text-[12px] font-medium text-[#334155] hover:bg-[#F8FAFC]"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="h-8 bg-[#F1F5F9] border-b border-[#E2E8F0] text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B]">
                <th className="px-4 font-semibold">
                  <button
                    type="button"
                    onClick={() => handleSort('hostname')}
                    className="inline-flex items-center gap-1 hover:text-[#0F172A]"
                  >
                    Hostname & Role
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-3 font-semibold">IPv4 / MAC</th>
                <th className="px-3 font-semibold">VLAN</th>
                <th className="px-3 font-semibold">Status</th>
                <th className="px-3 font-semibold text-right">
                  <button
                    type="button"
                    onClick={() => handleSort('cpuPct')}
                    className="inline-flex items-center gap-1 hover:text-[#0F172A] ml-auto"
                  >
                    CPU
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-3 font-semibold text-right">
                  <button
                    type="button"
                    onClick={() => handleSort('memPct')}
                    className="inline-flex items-center gap-1 hover:text-[#0F172A] ml-auto"
                  >
                    Mem
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-3 font-semibold text-right">
                  <button
                    type="button"
                    onClick={() => handleSort('latencyMs')}
                    className="inline-flex items-center gap-1 hover:text-[#0F172A] ml-auto"
                  >
                    RTT
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-3 font-semibold text-right">Heartbeat</th>
                <th className="px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedNodes.map((node) => {
                const isSelected = selectedNodeId === node.id;
                return (
                  <tr
                    key={node.id}
                    onClick={() => onSelectNode(node.id)}
                    className={`h-10 border-b border-[#E2E8F0] last:border-b-0 cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-[#F0F9FF]/70'
                        : 'bg-[#FFFFFF] hover:bg-[#F8FAFC]'
                    }`}
                  >
                    <td className="px-4 py-1.5">
                      <div className="flex items-center gap-2 min-w-[200px]">
                        <span className="text-[13px] font-medium text-[#0F172A] truncate">
                          {node.hostname}
                        </span>
                        {node.isLocalController && (
                          <MonoBadge tone="sky">Controller</MonoBadge>
                        )}
                      </div>
                      <div className="text-[11px] text-[#64748B] truncate">
                        {node.role} · {node.rackLocation}
                      </div>
                    </td>

                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <MonoBadge>{node.ipAddress}</MonoBadge>
                        <span className="font-mono text-[11px] text-[#64748B] hidden xl:inline tnum">
                          {node.macAddress}
                        </span>
                      </div>
                    </td>

                    <td className="px-3 py-1.5">
                      <MonoBadge tone={node.vlan === 'VLAN-999' ? 'neutral' : 'sky'}>
                        {node.vlan}
                      </MonoBadge>
                    </td>

                    <td className="px-3 py-1.5">
                      <NodeStatusPill status={node.status} />
                    </td>

                    <td className="px-3 py-1.5 text-right font-mono text-[12px] text-[#0F172A] tnum">
                      <span
                        className={
                          node.cpuPct >= 85
                            ? 'text-[#E11D48] font-medium'
                            : node.cpuPct >= 70
                              ? 'text-[#D97706]'
                              : ''
                        }
                      >
                        {node.cpuPct.toFixed(1)}%
                      </span>
                    </td>

                    <td className="px-3 py-1.5 text-right font-mono text-[12px] text-[#334155] tnum">
                      {node.memPct.toFixed(1)}%
                    </td>

                    <td className="px-3 py-1.5 text-right font-mono text-[12px] text-[#0F172A] tnum">
                      {node.status === 'isolated' ? (
                        <span className="text-[#64748B]">--</span>
                      ) : (
                        <span
                          className={
                            node.latencyMs > 50
                              ? 'text-[#E11D48] font-medium'
                              : node.latencyMs > 20
                                ? 'text-[#D97706]'
                                : ''
                          }
                        >
                          {node.latencyMs.toFixed(1)} ms
                        </span>
                      )}
                    </td>

                    <td className="px-3 py-1.5 text-right font-mono text-[11px] text-[#64748B] tnum whitespace-nowrap">
                      {formatRelativeAge(node.lastHeartbeat)}
                    </td>

                    <td
                      className="px-4 py-1.5 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => onSelectNode(node.id)}
                          title="Inspect node telemetry"
                          className="h-7 px-2 inline-flex items-center gap-1 rounded-[6px] border border-[#CBD5E1] bg-[#FFFFFF] text-[11px] font-medium text-[#334155] hover:bg-[#F8FAFC] whitespace-nowrap"
                        >
                          <Eye className="h-3 w-3" />
                          <span>Inspect</span>
                        </button>

                        {!node.isLocalController && node.status !== 'isolated' && (
                          <button
                            type="button"
                            onClick={() => onIsolateNode(node.id)}
                            className="h-7 px-2 inline-flex items-center gap-1 rounded-[6px] border border-[#FECDD3] bg-[#FFF1F2] text-[11px] font-medium text-[#E11D48] hover:bg-[#FFE4E6] whitespace-nowrap"
                          >
                            <ShieldBan className="h-3 w-3" />
                            <span>Isolate</span>
                          </button>
                        )}

                        {node.status === 'isolated' && (
                          <button
                            type="button"
                            onClick={() => onRestoreNode(node.id)}
                            className="h-7 px-2 inline-flex items-center gap-1 rounded-[6px] border border-[#A7F3D0] bg-[#ECFDF5] text-[11px] font-medium text-[#065F46] hover:bg-[#D1FAE5] whitespace-nowrap"
                          >
                            <ShieldCheck className="h-3 w-3" />
                            <span>Restore</span>
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
