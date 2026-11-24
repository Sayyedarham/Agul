import React from 'react';
import type { ReliabilitySnapshot } from '../../types/family.ts';

interface Props {
  reliability: ReliabilitySnapshot;
}

function formatDate(epochMs: number | null): string {
  if (epochMs == null) return 'N/A';
  return new Date(epochMs).toLocaleDateString();
}

export const ReliabilitySection: React.FC<Props> = ({ reliability }) => {
  const { appCrashes24h, bsodLast30d, lastBsodAt, failedServicesCount, failedServiceNames } = reliability;

  const hasIssues = appCrashes24h > 0 || bsodLast30d > 0 || failedServicesCount > 0;

  return (
    <div className="panel" style={{ marginBottom: 14 }}>
      <div className="pt">
        <h3>Reliability</h3>
        <span className={`pill ${hasIssues ? 'amber' : 'green'}`}>
          {hasIssues ? 'Needs Attention' : 'Healthy'}
        </span>
      </div>

      <div style={{ paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 24 }}>
          <div>
            <div style={{ fontSize: 11, color: '#758296', marginBottom: 2 }}>App crashes (24h)</div>
            <div style={{ fontWeight: 700, fontSize: 20, color: appCrashes24h > 0 ? '#d14343' : '#168458' }}>
              {appCrashes24h}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#758296', marginBottom: 2 }}>BSODs (30d)</div>
            <div style={{ fontWeight: 700, fontSize: 20, color: bsodLast30d > 0 ? '#d14343' : '#168458' }}>
              {bsodLast30d}
            </div>
          </div>
        </div>

        {bsodLast30d > 0 && lastBsodAt != null && (
          <div style={{ fontSize: 12, color: '#758296' }}>
            Last BSOD: {formatDate(lastBsodAt)}
          </div>
        )}

        <div>
          <div style={{ fontSize: 11, color: '#758296', marginBottom: 4 }}>
            Failed Windows Services ({failedServicesCount})
          </div>
          {failedServiceNames.length === 0 ? (
            <span style={{ fontSize: 13, color: '#168458' }}>None</span>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {failedServiceNames.map((name) => (
                <span key={name} className="pill red" style={{ fontFamily: 'monospace' }}>
                  {name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
