import React from 'react';
import { RefreshCw } from 'lucide-react';
import type { BootSnapshot } from '../../types/family.ts';

interface Props {
  boot: BootSnapshot;
}

function formatDate(epochMs: number): string {
  return new Date(epochMs).toLocaleString();
}

function timeAgo(epochMs: number): string {
  const diff = Date.now() - epochMs;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  return `${minutes}m ago`;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  return parts.join(' ') || '<1m';
}

export const BootSection: React.FC<Props> = ({ boot }) => {
  const {
    lastBootAt,
    uptimeSeconds,
    lastBootDurationMs,
    unexpectedShutdownsLast30d,
    restartPendingForUpdate,
  } = boot;

  return (
    <div className="panel" style={{ marginBottom: 14 }}>
      <div className="pt">
        <h3>Boot &amp; Performance</h3>
        {restartPendingForUpdate && (
          <span className="pill amber">
            <RefreshCw size={11} style={{ display: 'inline', marginRight: 4 }} />
            Restart pending
          </span>
        )}
      </div>

      <div style={{ paddingTop: 14, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
        <div>
          <div style={{ fontSize: 11, color: '#758296', marginBottom: 2 }}>Last Boot</div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{formatDate(lastBootAt)}</div>
          <div style={{ fontSize: 12, color: '#758296' }}>{timeAgo(lastBootAt)}</div>
        </div>

        <div>
          <div style={{ fontSize: 11, color: '#758296', marginBottom: 2 }}>Uptime</div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{formatUptime(uptimeSeconds)}</div>
        </div>

        {lastBootDurationMs != null && (
          <div>
            <div style={{ fontSize: 11, color: '#758296', marginBottom: 2 }}>Boot Duration</div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>
              {lastBootDurationMs >= 1000
                ? `${(lastBootDurationMs / 1000).toFixed(1)}s`
                : `${lastBootDurationMs}ms`}
            </div>
          </div>
        )}

        <div>
          <div style={{ fontSize: 11, color: '#758296', marginBottom: 2 }}>Unexpected shutdowns (30d)</div>
          <div
            style={{
              fontWeight: 600,
              fontSize: 13,
              color: unexpectedShutdownsLast30d > 0 ? '#d14343' : '#168458',
            }}
          >
            {unexpectedShutdownsLast30d}
          </div>
        </div>
      </div>

      {restartPendingForUpdate && (
        <p style={{ marginTop: 12, fontSize: 12, color: '#a66a00' }}>
          A Windows update is waiting. The device must be restarted to complete installation.
        </p>
      )}
    </div>
  );
};
