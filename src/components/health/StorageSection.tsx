import React from 'react';
import { HardDrive } from 'lucide-react';
import type { DriveHealth } from '../../types/family.ts';

interface Props {
  drives: DriveHealth[];
}

export const StorageSection: React.FC<Props> = ({ drives }) => {
  return (
    <div className="panel" style={{ marginBottom: 14 }}>
      <div className="pt">
        <h3>Storage</h3>
      </div>

      <div style={{ paddingTop: 12 }}>
        {drives.length === 0 && (
          <p style={{ color: '#758296', fontSize: 13 }}>No drive data available.</p>
        )}
        {drives.map((drive) => {
          const usedGb = drive.totalGb - drive.freeGb;
          const usedPct = drive.totalGb > 0 ? Math.round((usedGb / drive.totalGb) * 100) : 0;
          const barColor =
            drive.freeGb < 5 ? '#ef4444' : drive.freeGb < 10 ? '#f59e0b' : '#22c55e';
          const smartClass =
            drive.smartStatus === 'healthy'
              ? 'green'
              : drive.smartStatus === 'caution'
              ? 'amber'
              : drive.smartStatus === 'failing'
              ? 'red'
              : '';

          return (
            <div
              key={drive.label}
              style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid #eef1f3' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <HardDrive size={15} color="#768398" />
                <span style={{ fontWeight: 600, fontSize: 14 }}>{drive.label}</span>
                <span className={`pill ${drive.encrypted ? 'green' : 'red'}`} style={{ marginLeft: 'auto' }}>
                  {drive.encrypted ? '🔒 BitLocker On' : 'BitLocker Off'}
                </span>
                <span className={`pill ${smartClass}`}>
                  SMART: {drive.smartStatus.charAt(0).toUpperCase() + drive.smartStatus.slice(1)}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#758296', marginBottom: 4 }}>
                <span>{usedGb.toFixed(1)} GB used</span>
                <span>{drive.freeGb.toFixed(1)} GB free / {drive.totalGb} GB total</span>
              </div>

              <div className="meter" style={{ height: 8, borderRadius: 6 }}>
                <i style={{ width: `${usedPct}%`, background: barColor, borderRadius: 6 }} />
              </div>

              {drive.freeGb < 10 && (
                <div style={{ marginTop: 6 }}>
                  <span className="pill amber">⚠ Low disk space</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
