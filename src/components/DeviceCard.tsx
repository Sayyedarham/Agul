import { BatteryCharging, BatteryFull, BatteryLow, BatteryMedium, Zap } from 'lucide-react';
import type { FamilyDevice, DeviceAlert } from '../types/family.ts';
import { formatRelativeAge } from '../utils/format.ts';

interface Props {
  device: FamilyDevice;
  alerts: DeviceAlert[];
  onClick: () => void;
}

function BatteryIcon({ pct, charging }: { pct: number; charging: boolean }) {
  if (charging) return <BatteryCharging size={14} className="text-green-400" />;
  if (pct <= 15) return <BatteryLow size={14} className="text-red-400" />;
  if (pct <= 40) return <BatteryMedium size={14} className="text-amber-400" />;
  return <BatteryFull size={14} className="text-green-400" />;
}

export default function DeviceCard({ device, alerts, onClick }: Props) {
  const snap = device.latestSnapshot;
  const topAlert = alerts.find(a => a.deviceId === device.id && !a.resolvedAt);
  const cDrive = snap?.storage.find(d => d.label === 'C:') ?? snap?.storage[0];
  const storageUsedPct = cDrive
    ? Math.round(((cDrive.totalGb - cDrive.freeGb) / cDrive.totalGb) * 100)
    : null;

  const healthBadgeClass =
    device.healthClass === 'healthy'
      ? 'badge-healthy'
      : device.healthClass === 'needs_attention'
      ? 'badge-attention'
      : 'badge-offline';

  const healthLabel =
    device.healthClass === 'healthy'
      ? 'Healthy'
      : device.healthClass === 'needs_attention'
      ? 'Needs Attention'
      : 'Offline';

  const initials = device.childProfile.name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <button className="health-card" onClick={onClick}>
      {/* Top row: avatar + name + status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div
          className="avatar"
          style={{ background: device.childProfile.avatarColor }}
          title={device.childProfile.name}
        >
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#e8edf5', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {device.nickname}
          </div>
          <div style={{ fontSize: 11, color: '#8491a7', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {device.deviceModel}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <i style={{
            width: 8, height: 8, borderRadius: '50%',
            background: device.online ? '#32b984' : '#a0aab6',
            flexShrink: 0,
          }} />
          <span className={healthBadgeClass}>{healthLabel}</span>
        </div>
      </div>

      {/* Last sync */}
      <div style={{ fontSize: 11, color: '#8491a7', marginBottom: 10 }}>
        Last sync: {formatRelativeAge(device.lastSyncAt)}
      </div>

      {/* Battery row */}
      {snap && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <BatteryIcon pct={snap.battery.pct} charging={snap.battery.charging} />
          <span style={{ fontSize: 12, color: '#aab5c6' }}>
            {snap.battery.pct}%
            {snap.battery.charging && (
              <span style={{ color: '#32b984', marginLeft: 4 }}>
                <Zap size={10} style={{ display: 'inline' }} /> Charging
              </span>
            )}
          </span>
        </div>
      )}

      {/* Storage bar */}
      {cDrive !== undefined && storageUsedPct !== null && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#8491a7', marginBottom: 4 }}>
            <span>{cDrive.label} storage</span>
            <span>{cDrive.freeGb.toFixed(0)} GB free</span>
          </div>
          <div className="meter">
            <i style={{
              width: storageUsedPct + '%',
              background: storageUsedPct >= 90 ? '#ef4444' : storageUsedPct >= 75 ? '#f59e0b' : '#36b68b',
            }} />
          </div>
        </div>
      )}

      {/* Top alert */}
      {topAlert && (
        <div className="timeline-item" style={{ marginTop: 8, borderRadius: 6, padding: '7px 10px', fontSize: 11 }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
            background: topAlert.severity === 'critical' ? '#ef5350' : topAlert.severity === 'warning' ? '#f5a623' : '#3b82f6',
            display: 'inline-block', marginRight: 7,
          }} />
          <span style={{ color: '#d4dae5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {topAlert.message}
          </span>
        </div>
      )}
    </button>
  );
}
