import { useState } from 'react';
import { CheckCircle, BellOff } from 'lucide-react';
import type { FamilyDevice, DeviceAlert } from '../types/family.ts';
import { formatRelativeAge } from '../utils/format.ts';

interface Props {
  alerts: DeviceAlert[];
  devices: FamilyDevice[];
  onResolve: (alertId: string) => void;
}

type Filter = 'all' | 'unresolved';

function SeverityDot({ severity }: { severity: DeviceAlert['severity'] }) {
  const color =
    severity === 'critical' ? '#ef5350' : severity === 'warning' ? '#f5a623' : '#3b82f6';
  return (
    <span style={{
      width: 9, height: 9, borderRadius: '50%', background: color,
      flexShrink: 0, marginTop: 4, display: 'inline-block',
    }} />
  );
}

export default function AlertFeed({ alerts, devices, onResolve }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const [deviceFilter, setDeviceFilter] = useState<string>('all');

  const deviceName = (id: string) =>
    devices.find(d => d.id === id)?.nickname ?? id;

  let shown = alerts;
  if (filter === 'unresolved') shown = shown.filter(a => !a.resolvedAt);
  if (deviceFilter !== 'all') shown = shown.filter(a => a.deviceId === deviceFilter);

  // Sort: unresolved first, then by time desc
  shown = [...shown].sort((a, b) => {
    if (!a.resolvedAt && b.resolvedAt) return -1;
    if (a.resolvedAt && !b.resolvedAt) return 1;
    return b.createdAt - a.createdAt;
  });

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 4, background: '#f1f3f5', borderRadius: 8, padding: 3 }}>
          {(['all', 'unresolved'] as Filter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                border: 0, borderRadius: 6, padding: '5px 12px',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: filter === f ? '#fff' : 'transparent',
                color: filter === f ? '#1a2636' : '#768398',
                boxShadow: filter === f ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              {f === 'all' ? 'All' : 'Unresolved'}
            </button>
          ))}
        </div>

        {devices.length > 0 && (
          <select
            value={deviceFilter}
            onChange={e => setDeviceFilter(e.target.value)}
            style={{
              border: '1px solid #e0e4e9', borderRadius: 8, padding: '6px 10px',
              fontSize: 12, color: '#536176', background: '#fff', cursor: 'pointer',
            }}
          >
            <option value="all">All Devices</option>
            {devices.map(d => (
              <option key={d.id} value={d.id}>{d.nickname}</option>
            ))}
          </select>
        )}

        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#8491a7' }}>
          {shown.length} alert{shown.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Alert list */}
      {shown.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '56px 24px' }}>
          <BellOff size={40} style={{ color: '#a0aab6', margin: '0 auto 16px' }} />
          <p style={{ color: '#768398', fontWeight: 600, marginBottom: 6 }}>All clear! No active alerts.</p>
          <p style={{ color: '#a0aab6', fontSize: 12 }}>
            {filter === 'unresolved' ? 'All alerts are resolved.' : 'No alerts have been generated yet.'}
          </p>
        </div>
      ) : (
        <div className="panel" style={{ padding: 0 }}>
          {shown.map((alert, idx) => (
            <div
              key={alert.id}
              className="timeline-item"
              style={{
                borderBottom: idx < shown.length - 1 ? '1px solid #edf0f2' : 'none',
                borderRadius: idx === 0 ? '10px 10px 0 0' : idx === shown.length - 1 ? '0 0 10px 10px' : 0,
              }}
            >
              <SeverityDot severity={alert.severity} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: '#1a2636', marginBottom: 2 }}>
                  {alert.message}
                </div>
                <div style={{ fontSize: 11, color: '#8491a7' }}>
                  <span className={'pill ' + (alert.severity === 'critical' ? 'red' : alert.severity === 'warning' ? 'amber' : 'blue')}>
                    {alert.severity}
                  </span>
                  <span style={{ marginLeft: 8 }}>{deviceName(alert.deviceId)}</span>
                  <span style={{ marginLeft: 8 }}>·</span>
                  <span style={{ marginLeft: 8 }}>{formatRelativeAge(alert.createdAt)}</span>
                </div>
              </div>
              {alert.resolvedAt ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#32b984' }}>
                  <CheckCircle size={14} /> Resolved
                </span>
              ) : (
                <button
                  className="quiet"
                  onClick={() => onResolve(alert.id)}
                  style={{ fontSize: 12, padding: '6px 10px', whiteSpace: 'nowrap' }}
                >
                  Resolve
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
