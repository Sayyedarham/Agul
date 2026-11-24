import { Monitor, Wifi, AlertTriangle, BellRing, PlusCircle } from 'lucide-react';
import type { FamilyDevice, DeviceAlert } from '../types/family.ts';
import DeviceCard from './DeviceCard.tsx';

interface Props {
  devices: FamilyDevice[];
  alerts: DeviceAlert[];
  onSelectDevice: (device: FamilyDevice) => void;
  onEnroll: () => void;
}

export default function Dashboard({ devices, alerts, onSelectDevice, onEnroll }: Props) {
  const online = devices.filter(d => d.online).length;
  const needsAttention = devices.filter(d => d.healthClass === 'needs_attention').length;
  const unresolvedAlerts = alerts.filter(a => !a.resolvedAt).length;

  const kpi = [
    { label: 'Total Devices', value: devices.length, Icon: Monitor, color: '#3b82f6' },
    { label: 'Online Now', value: online, Icon: Wifi, color: '#32b984' },
    { label: 'Needs Attention', value: needsAttention, Icon: AlertTriangle, color: '#f59e0b' },
    { label: 'Unresolved Alerts', value: unresolvedAlerts, Icon: BellRing, color: '#ef5350' },
  ];

  return (
    <div>
      {/* KPI strip */}
      <section className="stats" style={{ marginBottom: 28 }}>
        {kpi.map(({ label, value, Icon, color }) => (
          <div className="stat" key={label}>
            <div><Icon size={18} style={{ color }} /></div>
            <small>{label}</small>
            <b style={{ color }}>{value}</b>
          </div>
        ))}
      </section>

      {/* Device grid header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1a2636' }}>Family Devices</h3>
        <button className="primary" onClick={onEnroll}>
          <PlusCircle size={15} />
          Add Device
        </button>
      </div>

      {devices.length === 0 ? (
        <div className="panel" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <Monitor size={40} style={{ color: '#a0aab6', margin: '0 auto 16px' }} />
          <p style={{ color: '#768398', marginBottom: 16 }}>No devices enrolled yet.</p>
          <button className="primary" onClick={onEnroll}>
            <PlusCircle size={15} />
            Enroll First Device
          </button>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 16,
        }}>
          {devices.map(device => (
            <DeviceCard
              key={device.id}
              device={device}
              alerts={alerts}
              onClick={() => onSelectDevice(device)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
