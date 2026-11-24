import React from 'react';
import { Wifi, Network, Signal } from 'lucide-react';
import type { ConnectivitySnapshot } from '../../types/family.ts';

interface Props {
  connectivity: ConnectivitySnapshot;
}

function formatTimestamp(epochMs: number): string {
  return new Date(epochMs).toLocaleString();
}

export const ConnectivitySection: React.FC<Props> = ({ connectivity }) => {
  const { online, type, ssid, signalPct, latencyMs, lastNetworkChangeAt } = connectivity;

  const latencyClass =
    latencyMs == null ? '' : latencyMs < 50 ? 'green' : latencyMs < 150 ? 'amber' : 'red';

  return (
    <div className="panel" style={{ marginBottom: 14 }}>
      <div className="pt">
        <h3>Connectivity</h3>
        <span className={`pill ${online ? 'green' : 'red'}`}>
          {online ? '● Online' : '● Offline'}
        </span>
      </div>

      <div style={{ paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {type === 'wifi' ? (
            <Wifi size={16} color="#146c5b" />
          ) : type === 'ethernet' ? (
            <Network size={16} color="#146c5b" />
          ) : (
            <Signal size={16} color="#758296" />
          )}
          <span style={{ fontWeight: 600, fontSize: 13 }}>
            {type === 'wifi' ? 'Wi-Fi' : type === 'ethernet' ? 'Ethernet' : type === 'cellular' ? 'Cellular' : 'No Connection'}
          </span>
          {ssid && type === 'wifi' && (
            <span className="pill blue">{ssid}</span>
          )}
        </div>

        {type === 'wifi' && signalPct != null && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#758296', marginBottom: 4 }}>
              <span>Signal Strength</span>
              <span>{signalPct}%</span>
            </div>
            <div className="meter" style={{ height: 6, borderRadius: 4 }}>
              <i style={{
                width: `${signalPct}%`,
                background: signalPct >= 70 ? '#22c55e' : signalPct >= 40 ? '#f59e0b' : '#ef4444',
                borderRadius: 4
              }} />
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {latencyMs != null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: '#758296' }}>Latency</span>
              <span className={`pill ${latencyClass}`}>{latencyMs} ms</span>
            </div>
          )}
        </div>

        <div style={{ fontSize: 12, color: '#758296' }}>
          Last network change: {formatTimestamp(lastNetworkChangeAt)}
        </div>
      </div>
    </div>
  );
};
