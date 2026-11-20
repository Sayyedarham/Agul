import React from 'react';
import type { HostTelemetry } from '../types/console.ts';
import { formatBytes, formatUptime } from '../utils/format.ts';
import { MonoBadge } from './StatusBadge.tsx';

interface HostHardwareCardProps {
  host: HostTelemetry;
}

export const HostHardwareCard: React.FC<HostHardwareCardProps> = ({ host }) => {
  const visibleInterfaces = host.interfaces.slice(0, 3);

  return (
    <section className="rounded-[10px] border border-[#E2E8F0] bg-[#FFFFFF] flex flex-col">
      <div className="h-11 px-4 border-b border-[#E2E8F0] flex items-center justify-between gap-2">
        <h2 className="text-[14px] font-semibold text-[#0F172A] truncate">
          Local Gateway Host
        </h2>
        <MonoBadge tone="sky">Live OS Telemetry</MonoBadge>
      </div>

      <div className="p-4 space-y-3.5 text-[12px]">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[#64748B]">Hostname</span>
          <span className="font-mono text-[#0F172A] font-medium truncate max-w-[200px]">
            {host.hostname}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-[#64748B]">Platform / Kernel</span>
          <span className="font-mono text-[#334155] truncate max-w-[200px]">
            {host.platform} · {host.release.split('-')[0]}
          </span>
        </div>

        <div className="pt-1 space-y-2 border-t border-[#E2E8F0]">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B]">
                CPU ({host.cpuCores} Cores)
              </span>
              <span className="font-mono text-[12px] font-medium text-[#0F172A] tnum">
                {host.cpuLoadPct.toFixed(1)}%
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-[#F1F5F9] overflow-hidden">
              <div
                className="h-full bg-[#0284C7] transition-all duration-300"
                style={{ width: `${Math.min(100, host.cpuLoadPct)}%` }}
              />
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px] text-[#64748B] font-mono tnum">
              <span className="truncate max-w-[170px]">{host.cpuModel}</span>
              <span>Load {host.loadAvg.join(' ')}</span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B]">
                Memory Allocation
              </span>
              <span className="font-mono text-[12px] font-medium text-[#0F172A] tnum">
                {formatBytes(host.memUsedBytes)} / {formatBytes(host.memTotalBytes)} (
                {host.memUsedPct.toFixed(1)}%)
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-[#F1F5F9] overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  host.memUsedPct > 85 ? 'bg-[#F59E0B]' : 'bg-[#10B981]'
                }`}
                style={{ width: `${Math.min(100, host.memUsedPct)}%` }}
              />
            </div>
          </div>
        </div>

        <div className="pt-2 border-t border-[#E2E8F0]">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B]">
              Bound Network Interfaces
            </span>
            <span className="font-mono text-[11px] text-[#64748B] tnum">
              Uptime {formatUptime(host.uptimeSeconds)}
            </span>
          </div>
          <div className="space-y-1.5">
            {visibleInterfaces.map((nic, idx) => (
              <div
                key={`${nic.name}-${nic.address}-${idx}`}
                className="flex items-center justify-between gap-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-[6px] px-2.5 py-1.5"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-[11px] font-medium text-[#0F172A]">
                    {nic.name}
                  </span>
                  <span className="font-mono text-[11px] text-[#475569] truncate tnum">
                    {nic.address}
                  </span>
                </div>
                <span className="font-mono text-[10px] text-[#64748B] shrink-0 tnum">
                  {nic.mac}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
