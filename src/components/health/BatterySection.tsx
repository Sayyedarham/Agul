import React from 'react';
import { BatteryCharging, Battery, BatteryLow, BatteryFull } from 'lucide-react';
import type { BatterySnapshot } from '../../types/family.ts';

interface Props {
  battery: BatterySnapshot;
}

export const BatterySection: React.FC<Props> = ({ battery }) => {
  const { pct, charging, estimatedMinutesRemaining, healthPct, cycleCount } = battery;

  const barColor =
    pct > 50 ? '#22c55e' : pct >= 20 ? '#f59e0b' : '#ef4444';

  const statusClass =
    pct > 50 ? 'green' : pct >= 20 ? 'amber' : 'red';

  const healthBadgeClass =
    pct >= 20 && (healthPct == null || healthPct >= 70) ? 'green' : 'amber';

  let statusLine: string;
  if (charging) {
    statusLine = 'Charging';
  } else if (pct < 15) {
    statusLine = 'Battery low – not charging';
  } else if (estimatedMinutesRemaining != null) {
    const h = Math.floor(estimatedMinutesRemaining / 60);
    const m = estimatedMinutesRemaining % 60;
    statusLine = h > 0 ? `Est. ${h}h ${m}m remaining` : `Est. ${m}m remaining`;
  } else {
    statusLine = 'Discharging';
  }

  const BatteryIcon =
    pct <= 20 ? BatteryLow : pct >= 90 ? BatteryFull : charging ? BatteryCharging : Battery;

  return (
    <div className="panel" style={{ marginBottom: 14 }}>
      <div className="pt">
        <h3>Battery</h3>
        <span className={`pill ${healthBadgeClass}`}>
          {pct >= 20 && (healthPct == null || healthPct >= 70) ? 'Healthy' : 'Needs Attention'}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 24, padding: '18px 0 12px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <BatteryIcon size={36} color={barColor} />
          <span style={{ fontSize: 28, fontWeight: 700, color: barColor }}>
            {pct}%
          </span>
        </div>

        <div style={{ flex: 1 }}>
          <div className="meter" style={{ height: 10, marginBottom: 8, borderRadius: 6 }}>
            <i style={{ width: `${pct}%`, background: barColor, borderRadius: 6 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {charging && <span className="pill blue">⚡ Charging</span>}
            <span style={{ fontSize: 13, color: '#536176' }}>{statusLine}</span>
          </div>

          {(healthPct != null || cycleCount != null) && (
            <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
              {healthPct != null && (
                <div>
                  <span style={{ fontSize: 11, color: '#758296' }}>Battery Health</span>
                  <div style={{ fontWeight: 700 }}>{healthPct}%</div>
                </div>
              )}
              {cycleCount != null && (
                <div>
                  <span style={{ fontSize: 11, color: '#758296' }}>Cycle Count</span>
                  <div style={{ fontWeight: 700 }}>{cycleCount}</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
