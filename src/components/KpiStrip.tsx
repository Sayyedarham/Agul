import React from 'react';
import type { FleetNode, SecurityEvent, TelemetryPoint } from '../types/console.ts';
import { formatThroughput } from '../utils/format.ts';

interface KpiStripProps {
  nodes: FleetNode[];
  events: SecurityEvent[];
  latestPoint: TelemetryPoint | undefined;
  onJumpToAudits: () => void;
  onFilterStatus: (status: string) => void;
}

export const KpiStrip: React.FC<KpiStripProps> = ({
  nodes,
  events,
  latestPoint,
  onJumpToAudits,
  onFilterStatus,
}) => {
  const onlineCount = nodes.filter((n) => n.status === 'online').length;
  const degradedOrCrit = nodes.filter(
    (n) => n.status === 'degraded' || n.status === 'critical'
  ).length;
  const isolatedCount = nodes.filter((n) => n.status === 'isolated').length;

  const totalRx = latestPoint?.rxMbps ?? nodes.reduce((acc, n) => acc + n.rxMbps, 0);
  const totalTx = latestPoint?.txMbps ?? nodes.reduce((acc, n) => acc + n.txMbps, 0);
  const meanLat = latestPoint?.meanLatencyMs ?? 0;
  const dropRate = latestPoint?.packetDropRate ?? 0;

  const unackEvents = events.filter((e) => !e.acknowledged);
  const criticalUnack = unackEvents.filter((e) => e.severity === 'critical').length;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      <button
        type="button"
        onClick={() => onFilterStatus('all')}
        className="text-left rounded-[10px] border border-[#E2E8F0] bg-[#FFFFFF] p-4 hover:border-[#CBD5E1] transition-colors"
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B]">
            Fleet Availability
          </span>
          <span className="font-mono text-[11px] text-[#065F46] bg-[#ECFDF5] px-1.5 py-0.5 rounded-[6px] tnum">
            {onlineCount}/{nodes.length} Nominal
          </span>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="font-display text-[24px] font-semibold tracking-[-0.03em] text-[#0F172A] tnum">
            {nodes.length - isolatedCount}
          </span>
          <span className="text-[12px] text-[#64748B]">active endpoints</span>
        </div>
        <div className="mt-1.5 text-[12px] text-[#475569] tnum">
          {degradedOrCrit} degraded/alert · {isolatedCount} quarantined
        </div>
      </button>

      <div className="rounded-[10px] border border-[#E2E8F0] bg-[#FFFFFF] p-4">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B]">
            Aggregate Bandwidth
          </span>
          <span className="font-mono text-[11px] text-[#0284C7] bg-[#F0F9FF] px-1.5 py-0.5 rounded-[6px] tnum">
            RX + TX
          </span>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="font-display text-[24px] font-semibold tracking-[-0.03em] text-[#0F172A] tnum">
            {formatThroughput(totalRx + totalTx)}
          </span>
        </div>
        <div className="mt-1.5 font-mono text-[11px] text-[#475569] tnum">
          Ingress {formatThroughput(totalRx)} · Egress {formatThroughput(totalTx)}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onFilterStatus('degraded')}
        className="text-left rounded-[10px] border border-[#E2E8F0] bg-[#FFFFFF] p-4 hover:border-[#CBD5E1] transition-colors"
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B]">
            Mean Mesh Latency
          </span>
          <span
            className={`font-mono text-[11px] px-1.5 py-0.5 rounded-[6px] tnum ${
              meanLat > 25
                ? 'bg-[#FFFBEB] text-[#92400E]'
                : 'bg-[#ECFDF5] text-[#065F46]'
            }`}
          >
            {meanLat > 25 ? 'SLA Drift' : 'Within SLA'}
          </span>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="font-display text-[24px] font-semibold tracking-[-0.03em] text-[#0F172A] tnum">
            {meanLat.toFixed(1)} ms
          </span>
        </div>
        <div className="mt-1.5 font-mono text-[11px] text-[#475569] tnum">
          Mean packet drop {dropRate.toFixed(2)}% across active links
        </div>
      </button>

      <button
        type="button"
        onClick={onJumpToAudits}
        className="text-left rounded-[10px] border border-[#E2E8F0] bg-[#FFFFFF] p-4 hover:border-[#CBD5E1] transition-colors"
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B]">
            Unacknowledged Alerts
          </span>
          <span
            className={`font-mono text-[11px] px-1.5 py-0.5 rounded-[6px] tnum ${
              criticalUnack > 0
                ? 'bg-[#FFF1F2] text-[#9F1239]'
                : unackEvents.length > 0
                  ? 'bg-[#FFFBEB] text-[#92400E]'
                  : 'bg-[#ECFDF5] text-[#065F46]'
            }`}
          >
            {criticalUnack > 0 ? `${criticalUnack} Critical` : 'Clear'}
          </span>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="font-display text-[24px] font-semibold tracking-[-0.03em] text-[#0F172A] tnum">
            {unackEvents.length}
          </span>
          <span className="text-[12px] text-[#64748B]">open incidents</span>
        </div>
        <div className="mt-1.5 text-[12px] text-[#475569] tnum">
          {events.length} total logged · Click to review audit log
        </div>
      </button>
    </div>
  );
};
