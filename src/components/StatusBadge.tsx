import React from 'react';
import type { AuditSeverity, NodeStatus } from '../types/console.ts';

export const NodeStatusPill: React.FC<{ status: NodeStatus }> = ({ status }) => {
  const config: Record<
    NodeStatus,
    { label: string; bg: string; text: string; dot: string }
  > = {
    online: {
      label: 'Online',
      bg: 'bg-[#ECFDF5]',
      text: 'text-[#065F46]',
      dot: 'bg-[#10B981]',
    },
    degraded: {
      label: 'Degraded',
      bg: 'bg-[#FFFBEB]',
      text: 'text-[#92400E]',
      dot: 'bg-[#F59E0B]',
    },
    critical: {
      label: 'Critical',
      bg: 'bg-[#FFF1F2]',
      text: 'text-[#9F1239]',
      dot: 'bg-[#F43F5E]',
    },
    isolated: {
      label: 'Isolated',
      bg: 'bg-[#F1F5F9]',
      text: 'text-[#334155]',
      dot: 'bg-[#64748B]',
    },
  };

  const c = config[status];
  return (
    <span
      className={`inline-flex h-5 items-center gap-1.5 rounded-full px-2 font-mono text-[11px] font-medium whitespace-nowrap shrink-0 ${c.bg} ${c.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} aria-hidden="true" />
      {c.label}
    </span>
  );
};

export const SeverityBadge: React.FC<{ severity: AuditSeverity }> = ({ severity }) => {
  const styles: Record<AuditSeverity, { label: string; cls: string }> = {
    critical: {
      label: 'Critical',
      cls: 'bg-[#FFF1F2] text-[#9F1239] border-[#FECDD3]',
    },
    warning: {
      label: 'Warning',
      cls: 'bg-[#FFFBEB] text-[#92400E] border-[#FDE68A]',
    },
    info: {
      label: 'Info',
      cls: 'bg-[#F0F9FF] text-[#00476E] border-[#BAE6FD]',
    },
  };

  const s = styles[severity];
  return (
    <span
      className={`inline-flex h-5 items-center rounded-[6px] border px-1.5 font-mono text-[11px] font-medium whitespace-nowrap shrink-0 ${s.cls}`}
    >
      {s.label}
    </span>
  );
};

export const MonoBadge: React.FC<{ children: React.ReactNode; tone?: 'neutral' | 'sky' }> = ({
  children,
  tone = 'neutral',
}) => {
  const cls =
    tone === 'sky'
      ? 'bg-[#F0F9FF] text-[#0284C7] border-[#BAE6FD]'
      : 'bg-[#F1F5F9] text-[#334155] border-[#CBD5E1]';
  return (
    <span
      className={`inline-flex items-center rounded-[6px] border px-1.5 py-[1px] font-mono text-[11px] leading-[16px] whitespace-nowrap shrink-0 tnum ${cls}`}
    >
      {children}
    </span>
  );
};
