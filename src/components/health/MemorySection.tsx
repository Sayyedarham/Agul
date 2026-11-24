import React from 'react';
import type { MemorySnapshot } from '../../types/family.ts';

interface Props {
  memory: MemorySnapshot;
}

export const MemorySection: React.FC<Props> = ({ memory }) => {
  const { totalGb, usedGb, usedPct, sustainedHighPct } = memory;
  const barColor =
    usedPct >= 90 ? '#ef4444' : usedPct >= 75 ? '#f59e0b' : '#22c55e';

  return (
    <div className="panel" style={{ marginBottom: 14 }}>
      <div className="pt">
        <h3>Memory</h3>
        {sustainedHighPct && (
          <span className="pill amber">⚠ Sustained high usage</span>
        )}
      </div>

      <div style={{ paddingTop: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
          <span>
            <strong>{usedGb.toFixed(1)} GB</strong>
            <span style={{ color: '#758296' }}> / {totalGb.toFixed(1)} GB used</span>
          </span>
          <span style={{ fontWeight: 700, color: barColor }}>{usedPct}%</span>
        </div>

        <div className="meter" style={{ height: 10, borderRadius: 6 }}>
          <i style={{ width: `${usedPct}%`, background: barColor, borderRadius: 6 }} />
        </div>

        {sustainedHighPct && (
          <p style={{ marginTop: 10, fontSize: 12, color: '#a66a00' }}>
            Memory has been above 85% for more than 15 minutes. Consider closing unused applications.
          </p>
        )}
      </div>
    </div>
  );
};
