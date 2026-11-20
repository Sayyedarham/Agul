import React from 'react';
import {
  Activity,
  Network,
  Radar,
  Server,
  ShieldAlert,
  Terminal,
} from 'lucide-react';
import type { ConsoleSection, FleetNode, SecurityEvent } from '../types/console.ts';

interface SidebarRailProps {
  activeSection: ConsoleSection;
  onSelectSection: (section: ConsoleSection) => void;
  nodes: FleetNode[];
  events: SecurityEvent[];
  selectedVlanFilter: string;
  onSelectVlanFilter: (vlan: string) => void;
  streamConnected: boolean;
}

export const SidebarRail: React.FC<SidebarRailProps> = ({
  activeSection,
  onSelectSection,
  nodes,
  events,
  selectedVlanFilter,
  onSelectVlanFilter,
  streamConnected,
}) => {
  const unackCount = events.filter((e) => !e.acknowledged).length;
  const isolatedCount = nodes.filter((n) => n.status === 'isolated').length;

  const navItems: {
    id: ConsoleSection;
    label: string;
    icon: React.ReactNode;
    count?: number;
  }[] = [
    { id: 'overview', label: 'Overview', icon: <Activity className="h-4 w-4" /> },
    {
      id: 'nodes',
      label: 'Fleet Nodes',
      icon: <Server className="h-4 w-4" />,
      count: nodes.length,
    },
    {
      id: 'sockets',
      label: 'Network & Sockets',
      icon: <Network className="h-4 w-4" />,
    },
    {
      id: 'audits',
      label: 'Security Audits',
      icon: <ShieldAlert className="h-4 w-4" />,
      count: unackCount > 0 ? unackCount : undefined,
    },
    {
      id: 'diagnostics',
      label: 'Live Diagnostics',
      icon: <Terminal className="h-4 w-4" />,
    },
  ];

  const vlanGroups = [
    { id: 'all', label: 'All Subnets', count: nodes.length },
    {
      id: 'VLAN-10',
      label: 'VLAN-10 Core',
      count: nodes.filter((n) => n.vlan === 'VLAN-10').length,
    },
    {
      id: 'VLAN-20',
      label: 'VLAN-20 Compute',
      count: nodes.filter((n) => n.vlan === 'VLAN-20').length,
    },
    {
      id: 'VLAN-30',
      label: 'VLAN-30 Edge',
      count: nodes.filter((n) => n.vlan === 'VLAN-30').length,
    },
    {
      id: 'VLAN-40',
      label: 'VLAN-40 Storage',
      count: nodes.filter((n) => n.vlan === 'VLAN-40').length,
    },
    {
      id: 'VLAN-999',
      label: 'VLAN-999 Quarantine',
      count: isolatedCount,
    },
  ];

  return (
    <aside className="w-[240px] shrink-0 border-r border-[#E2E8F0] bg-[#F8FAFC] flex flex-col justify-between select-none">
      <div>
        <div className="h-12 px-4 border-b border-[#E2E8F0] flex items-center gap-2.5 bg-[#FFFFFF]">
          <div className="h-6 w-6 rounded-[6px] bg-[#0F172A] text-[#FFFFFF] flex items-center justify-center shrink-0">
            <Radar className="h-3.5 w-3.5" />
          </div>
          <span className="font-display text-[14px] font-semibold tracking-tight text-[#0F172A] whitespace-nowrap">
            SentinelOps
          </span>
        </div>

        <div className="px-3 pt-4 pb-2">
          <div className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B]">
            Console Views
          </div>
          <nav className="space-y-0.5" aria-label="Console navigation">
            {navItems.map((item) => {
              const active = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectSection(item.id)}
                  className={`w-full flex items-center justify-between px-2.5 h-8 rounded-[8px] text-[13px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-[#FFFFFF] text-[#0F172A] border border-[#E2E8F0]'
                      : 'text-[#334155] hover:bg-[#F1F5F9] hover:text-[#0F172A] border border-transparent'
                  }`}
                >
                  <span className="flex items-center gap-2.5 truncate">
                    <span className={active ? 'text-[#0284C7]' : 'text-[#64748B]'}>
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </span>
                  {item.count !== undefined && (
                    <span
                      className={`font-mono text-[11px] tnum ${
                        item.id === 'audits' && unackCount > 0
                          ? 'text-[#E11D48] font-semibold'
                          : 'text-[#64748B]'
                      }`}
                    >
                      {item.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="px-3 pt-4 pb-2 border-t border-[#E2E8F0] mt-2">
          <div className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B]">
            VLAN Segments
          </div>
          <div className="space-y-0.5">
            {vlanGroups.map((vlan) => {
              const selected = selectedVlanFilter === vlan.id;
              return (
                <button
                  key={vlan.id}
                  type="button"
                  onClick={() => {
                    onSelectVlanFilter(vlan.id);
                    if (activeSection !== 'overview' && activeSection !== 'nodes') {
                      onSelectSection('nodes');
                    }
                  }}
                  className={`w-full flex items-center justify-between px-2.5 h-7 rounded-[6px] text-[12px] transition-colors whitespace-nowrap ${
                    selected
                      ? 'bg-[#F0F9FF] text-[#0284C7] font-medium'
                      : 'text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A]'
                  }`}
                >
                  <span className="truncate font-mono text-[11px]">{vlan.label}</span>
                  <span className="font-mono text-[11px] tnum text-[#64748B]">
                    {vlan.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="p-3 border-t border-[#E2E8F0] bg-[#FFFFFF]">
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-[#334155] font-medium truncate">Cluster East-Lab</span>
          <span
            className={`inline-flex items-center gap-1.5 font-mono text-[11px] ${
              streamConnected ? 'text-[#065F46]' : 'text-[#92400E]'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                streamConnected ? 'bg-[#10B981]' : 'bg-[#F59E0B]'
              }`}
              aria-hidden="true"
            />
            {streamConnected ? 'SSE Live' : 'Reconnecting'}
          </span>
        </div>
        <div className="mt-1 text-[11px] text-[#64748B] font-mono tnum">
          10.24.0.0/16 · 1 Hz stream
        </div>
      </div>
    </aside>
  );
};
