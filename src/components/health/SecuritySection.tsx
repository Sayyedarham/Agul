import React from 'react';
import type { SecuritySnapshot, WindowsHealthSnapshot } from '../../types/family.ts';

interface Props {
  security: SecuritySnapshot;
  windowsHealth: WindowsHealthSnapshot;
}

type RowStatus = 'ok' | 'warn' | 'error';

interface StatusRow {
  label: string;
  status: RowStatus;
  description: string;
}

function formatDate(epochMs: number | null): string {
  if (epochMs == null) return 'Never';
  return new Date(epochMs).toLocaleDateString();
}

function daysSince(epochMs: number | null): number | null {
  if (epochMs == null) return null;
  return Math.floor((Date.now() - epochMs) / (1000 * 60 * 60 * 24));
}

const StatusIcon: React.FC<{ status: RowStatus }> = ({ status }) => {
  if (status === 'ok') return <span style={{ color: '#168458', fontSize: 16, fontWeight: 700 }}>✓</span>;
  if (status === 'error') return <span style={{ color: '#d14343', fontSize: 16, fontWeight: 700 }}>✗</span>;
  return <span style={{ color: '#a66a00', fontSize: 16, fontWeight: 700 }}>⚠</span>;
};

export const SecuritySection: React.FC<Props> = ({ security, windowsHealth }) => {
  const lastScanDays = daysSince(security.lastScanAt);
  const updatePendingDays = daysSince(windowsHealth.lastUpdateAt);

  const rows: StatusRow[] = [
    {
      label: 'Microsoft Defender',
      status: security.defenderEnabled ? 'ok' : 'error',
      description: security.defenderEnabled
        ? `Enabled · Last scan: ${formatDate(security.lastScanAt)}${lastScanDays != null ? ` (${lastScanDays}d ago)` : ''}`
        : 'Disabled – device may be at risk',
    },
    {
      label: 'Windows Firewall',
      status: security.firewallEnabled ? 'ok' : 'error',
      description: security.firewallEnabled ? 'Enabled' : 'Disabled – network traffic is unfiltered',
    },
    {
      label: 'BitLocker Encryption',
      status: security.bitlockerEnabled ? 'ok' : 'warn',
      description: security.bitlockerEnabled ? 'Drive encrypted' : 'Encryption not enabled',
    },
    {
      label: 'TPM',
      status: security.tpmPresent ? 'ok' : 'warn',
      description: security.tpmPresent ? 'TPM chip present' : 'No TPM detected',
    },
    {
      label: 'Windows Update',
      status:
        windowsHealth.updateStatus === 'up_to_date'
          ? 'ok'
          : windowsHealth.updateStatus === 'failed'
          ? 'error'
          : 'warn',
      description:
        windowsHealth.updateStatus === 'up_to_date'
          ? `Up to date · Last updated: ${formatDate(windowsHealth.lastUpdateAt)}`
          : windowsHealth.updateStatus === 'pending'
          ? `Updates pending${updatePendingDays != null ? ` (${updatePendingDays} days)` : ''}`
          : windowsHealth.updateStatus === 'downloading'
          ? 'Updates downloading…'
          : 'Update failed',
    },
  ];

  const hasIssues = rows.some((r) => r.status !== 'ok');

  return (
    <div className="panel" style={{ marginBottom: 14 }}>
      <div className="pt">
        <h3>Security</h3>
        <span className={`pill ${hasIssues ? 'amber' : 'green'}`}>
          {hasIssues ? 'Needs Attention' : 'Healthy'}
        </span>
      </div>

      <div style={{ paddingTop: 10 }}>
        {rows.map((row) => (
          <div
            key={row.label}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 0',
              borderBottom: '1px solid #eef1f3',
            }}
          >
            <StatusIcon status={row.status} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{row.label}</div>
              <div style={{ fontSize: 12, color: '#758296' }}>{row.description}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
