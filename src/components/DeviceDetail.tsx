import { useState } from 'react';
import {
  ArrowLeft, Shield, Cpu, HardDrive, Wifi, Zap, Settings2,
  Clock, Ban, Usb, BatteryCharging, RefreshCw, AlertTriangle,
} from 'lucide-react';
import type { FamilyDevice, DeviceAlert, ParentalPolicy, HealthSnapshot } from '../types/family.ts';
import { formatRelativeAge, formatUptime } from '../utils/format.ts';

interface Props {
  device: FamilyDevice;
  alerts: DeviceAlert[];
  policy: ParentalPolicy | null;
  onBack: () => void;
  onResolve: (alertId: string) => void;
  onSavePolicy: (p: ParentalPolicy) => Promise<void>;
}

type Tab = 'health' | 'policy' | 'events';

function MeterBar({ value, max = 100, label }: { value: number; max?: number; label: string }) {
  const pct = Math.min(100, (value / max) * 100);
  const color = pct >= 90 ? '#ef4444' : pct >= 75 ? '#f59e0b' : '#36b68b';
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#768398', marginBottom: 4 }}>
        <span>{label}</span>
        <span style={{ color: '#1a2636', fontWeight: 600 }}>{Math.round(pct)}%</span>
      </div>
      <div className="meter">
        <i style={{ width: pct + '%', background: color }} />
      </div>
    </div>
  );
}

function HealthTab({ snap, device }: { snap: HealthSnapshot; device: FamilyDevice }) {
  const sections = [
    {
      title: 'Battery',
      icon: <BatteryCharging size={16} />,
      content: (
        <div>
          <MeterBar value={snap.battery.pct} label={`Battery · ${snap.battery.charging ? 'Charging' : 'On battery'}`} />
          <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#8491a7' }}>
            {snap.battery.healthPct != null && <span>Health: {snap.battery.healthPct}%</span>}
            {snap.battery.cycleCount != null && <span>Cycles: {snap.battery.cycleCount}</span>}
            {snap.battery.estimatedMinutesRemaining != null && (
              <span>{Math.round(snap.battery.estimatedMinutesRemaining / 60)}h {snap.battery.estimatedMinutesRemaining % 60}m remaining</span>
            )}
          </div>
        </div>
      ),
    },
    {
      title: 'Memory',
      icon: <Cpu size={16} />,
      content: (
        <div>
          <MeterBar value={snap.memory.usedPct} label={`RAM · ${snap.memory.usedGb.toFixed(1)} / ${snap.memory.totalGb.toFixed(0)} GB used`} />
          {snap.memory.sustainedHighPct && (
            <div style={{ fontSize: 12, color: '#f59e0b' }}>⚠ Sustained high memory usage detected</div>
          )}
        </div>
      ),
    },
    {
      title: 'Storage',
      icon: <HardDrive size={16} />,
      content: (
        <div>
          {snap.storage.map(drive => {
            const used = drive.totalGb - drive.freeGb;
            const pct = (used / drive.totalGb) * 100;
            return (
              <div key={drive.label} style={{ marginBottom: 10 }}>
                <MeterBar value={pct} label={`${drive.label} · ${drive.freeGb.toFixed(0)} GB free of ${drive.totalGb.toFixed(0)} GB`} />
                <div style={{ fontSize: 11, color: '#8491a7', marginTop: -6 }}>
                  BitLocker: {drive.encrypted ? '✓ Encrypted' : '✗ Not encrypted'} ·
                  SMART: <span style={{ color: drive.smartStatus === 'healthy' ? '#32b984' : '#f59e0b' }}>{drive.smartStatus}</span>
                </div>
              </div>
            );
          })}
        </div>
      ),
    },
    {
      title: 'Network',
      icon: <Wifi size={16} />,
      content: (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13 }}>
          <div>Status: <strong style={{ color: snap.connectivity.online ? '#32b984' : '#ef5350' }}>{snap.connectivity.online ? 'Online' : 'Offline'}</strong></div>
          <div>Type: <strong>{snap.connectivity.type}</strong></div>
          {snap.connectivity.ssid && <div style={{ gridColumn: 'span 2' }}>SSID: <strong>{snap.connectivity.ssid}</strong></div>}
          {snap.connectivity.signalPct != null && <div>Signal: <strong>{snap.connectivity.signalPct}%</strong></div>}
          {snap.connectivity.latencyMs != null && <div>Latency: <strong>{snap.connectivity.latencyMs}ms</strong></div>}
        </div>
      ),
    },
    {
      title: 'Security',
      icon: <Shield size={16} />,
      content: (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13 }}>
          <div>Defender: <strong style={{ color: snap.security.defenderEnabled ? '#32b984' : '#ef5350' }}>{snap.security.defenderEnabled ? 'On' : 'Off'}</strong></div>
          <div>Firewall: <strong style={{ color: snap.security.firewallEnabled ? '#32b984' : '#ef5350' }}>{snap.security.firewallEnabled ? 'On' : 'Off'}</strong></div>
          <div>BitLocker: <strong>{snap.security.bitlockerEnabled ? 'Enabled' : 'Disabled'}</strong></div>
          <div>TPM: <strong>{snap.security.tpmPresent ? 'Present' : 'Not found'}</strong></div>
          <div>Windows Updates: <strong style={{ color: snap.windowsHealth.updateStatus === 'up_to_date' ? '#32b984' : '#f59e0b' }}>{snap.windowsHealth.updateStatus.replace('_', ' ')}</strong></div>
          <div>{snap.windowsHealth.pendingRestart ? '⚠ Restart pending' : '✓ No restart needed'}</div>
        </div>
      ),
    },
    {
      title: 'System',
      icon: <RefreshCw size={16} />,
      content: (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13 }}>
          <div>Uptime: <strong>{formatUptime(snap.boot.uptimeSeconds)}</strong></div>
          <div>Build: <strong>{snap.windowsHealth.build}</strong></div>
          <div>Crashes (24h): <strong style={{ color: snap.reliability.appCrashes24h > 0 ? '#f59e0b' : '#32b984' }}>{snap.reliability.appCrashes24h}</strong></div>
          <div>BSOD (30d): <strong style={{ color: snap.reliability.bsodLast30d > 0 ? '#ef5350' : '#32b984' }}>{snap.reliability.bsodLast30d}</strong></div>
          {snap.boot.unexpectedShutdownsLast30d > 0 && (
            <div style={{ gridColumn: 'span 2', color: '#f59e0b', fontSize: 12 }}>
              ⚠ {snap.boot.unexpectedShutdownsLast30d} unexpected shutdown(s) in last 30 days
            </div>
          )}
        </div>
      ),
    },
    ...(snap.cpu
      ? [
          {
            title: 'Performance',
            icon: <Cpu size={16} />,
            content: (
              <div>
                <div style={{ fontSize: 12, color: '#8491a7', marginBottom: 10 }}>
                  {snap.cpu.model} · {snap.cpu.cores} cores
                </div>
                <MeterBar value={snap.cpu.loadPct} label="CPU load" />
                <MeterBar
                  value={snap.memory.usedPct}
                  label={`RAM · ${snap.memory.usedGb.toFixed(1)} / ${snap.memory.totalGb.toFixed(0)} GB used`}
                />
              </div>
            ),
          },
        ]
      : []),
    ...(snap.processes && snap.processes.length > 0
      ? [
          {
            title: 'Top Processes',
            icon: <Zap size={16} />,
            content: (
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: '#768398', textAlign: 'left' }}>
                    <th style={{ padding: '3px 8px', fontWeight: 600 }}>Process</th>
                    <th style={{ padding: '3px 8px', fontWeight: 600, textAlign: 'right' }}>Memory</th>
                    <th style={{ padding: '3px 8px', fontWeight: 600, textAlign: 'right' }}>CPU</th>
                  </tr>
                </thead>
                <tbody>
                  {snap.processes.map((p) => (
                    <tr key={p.name} style={{ borderTop: '1px solid #eef0f2' }}>
                      <td style={{ padding: '4px 8px', color: '#1a2636', fontWeight: 600 }}>{p.name}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right', color: '#536176' }}>{Math.round(p.memMb)} MB</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right', color: '#536176' }}>{p.cpuPct.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ),
          },
        ]
      : []),
  ];

  return (
    <div>
      {sections.map(({ title, icon, content }) => (
        <div key={title} className="health-section">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, color: '#1a2636', fontWeight: 700, fontSize: 14 }}>
            <span style={{ color: '#36b68b' }}>{icon}</span>
            {title}
          </div>
          {content}
        </div>
      ))}
    </div>
  );
}

function PolicyTab({ device, policy, onSave }: { device: FamilyDevice; policy: ParentalPolicy | null; onSave: (p: ParentalPolicy) => Promise<void> }) {
  const defaultPolicy: ParentalPolicy = {
    deviceId: device.id,
    bedtime: { enabled: false, startTime: '22:00', endTime: '07:00', days: [0, 1, 2, 3, 4, 5, 6] },
    screenTimeLimitMinutes: null,
    blockedApps: [],
    allowedApps: null,
    usbPolicy: 'report',
    state: 'not_applied',
    lastAppliedAt: null,
    lastFailureReason: null,
  };

  const [p, setP] = useState<ParentalPolicy>(policy ?? defaultPolicy);
  const [saving, setSaving] = useState(false);
  const [blockedApp, setBlockedApp] = useState('');

  const save = async () => {
    setSaving(true);
    try { await onSave(p); } finally { setSaving(false); }
  };

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div>
      {/* State banner */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20,
        padding: '10px 14px', borderRadius: 8,
        background: p.state === 'active' ? '#f0fdf8' : p.state === 'failed' ? '#fff1f1' : '#f7f8fa',
        border: '1px solid ' + (p.state === 'active' ? '#bbf7d0' : p.state === 'failed' ? '#fecaca' : '#e6e9ee'),
        fontSize: 13, color: '#536176',
      }}>
        <Settings2 size={15} style={{ color: p.state === 'active' ? '#32b984' : p.state === 'failed' ? '#ef5350' : '#a0aab6' }} />
        Policy state: <strong style={{ marginLeft: 4 }}>{p.state.replace('_', ' ')}</strong>
        {p.lastFailureReason && <span style={{ color: '#ef5350', marginLeft: 8 }}> – {p.lastFailureReason}</span>}
      </div>

      {/* Bedtime */}
      <div className="health-section">
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
          <Clock size={15} style={{ color: '#36b68b', marginRight: 8 }} />
          <span style={{ fontWeight: 700, fontSize: 14, color: '#1a2636' }}>Bedtime Schedule</span>
          <label className="toggle" style={{ marginLeft: 'auto' }}>
            <input type="checkbox" checked={p.bedtime.enabled} onChange={e => setP({ ...p, bedtime: { ...p.bedtime, enabled: e.target.checked } })} />
            <span />
          </label>
        </div>
        {p.bedtime.enabled && (
          <div>
            <div style={{ display: 'flex', gap: 16, marginBottom: 12, alignItems: 'center' }}>
              <label style={{ fontSize: 13, color: '#536176' }}>
                Start
                <input className="time-input" type="time" value={p.bedtime.startTime} onChange={e => setP({ ...p, bedtime: { ...p.bedtime, startTime: e.target.value } })} />
              </label>
              <label style={{ fontSize: 13, color: '#536176' }}>
                End
                <input className="time-input" type="time" value={p.bedtime.endTime} onChange={e => setP({ ...p, bedtime: { ...p.bedtime, endTime: e.target.value } })} />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {days.map((day, i) => (
                <button
                  key={day}
                  onClick={() => {
                    const d = p.bedtime.days.includes(i) ? p.bedtime.days.filter(x => x !== i) : [...p.bedtime.days, i];
                    setP({ ...p, bedtime: { ...p.bedtime, days: d } });
                  }}
                  style={{
                    border: '1px solid ' + (p.bedtime.days.includes(i) ? '#36b68b' : '#e0e4e9'),
                    borderRadius: 6, padding: '4px 8px', fontSize: 12, cursor: 'pointer', fontWeight: 600,
                    background: p.bedtime.days.includes(i) ? '#f0fdf8' : '#fff',
                    color: p.bedtime.days.includes(i) ? '#146c5b' : '#8491a7',
                  }}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* USB Policy */}
      <div className="health-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Usb size={15} style={{ color: '#36b68b' }} />
          <span style={{ fontWeight: 700, fontSize: 14, color: '#1a2636' }}>USB Policy</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['report', 'block'] as const).map(opt => (
            <button
              key={opt}
              onClick={() => setP({ ...p, usbPolicy: opt })}
              style={{
                border: '1px solid ' + (p.usbPolicy === opt ? '#36b68b' : '#e0e4e9'),
                borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer', fontWeight: 600,
                background: p.usbPolicy === opt ? '#f0fdf8' : '#fff',
                color: p.usbPolicy === opt ? '#146c5b' : '#8491a7',
              }}
            >
              {opt === 'report' ? '📋 Report only' : '🚫 Block new USB'}
            </button>
          ))}
        </div>
      </div>

      {/* Blocked Apps */}
      <div className="health-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Ban size={15} style={{ color: '#36b68b' }} />
          <span style={{ fontWeight: 700, fontSize: 14, color: '#1a2636' }}>Blocked Apps</span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input
            value={blockedApp}
            onChange={e => setBlockedApp(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && blockedApp.trim()) {
                setP({ ...p, blockedApps: [...p.blockedApps, blockedApp.trim()] });
                setBlockedApp('');
              }
            }}
            placeholder="e.g. discord.exe (press Enter)"
            style={{ flex: 1, border: '1px solid #e0e4e9', borderRadius: 8, padding: '8px 10px', fontSize: 13 }}
          />
          <button className="primary" onClick={() => {
            if (blockedApp.trim()) {
              setP({ ...p, blockedApps: [...p.blockedApps, blockedApp.trim()] });
              setBlockedApp('');
            }
          }}>Add</button>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {p.blockedApps.map(app => (
            <span key={app} className="pill" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              {app}
              <button onClick={() => setP({ ...p, blockedApps: p.blockedApps.filter(a => a !== app) })}
                style={{ border: 0, background: 'transparent', cursor: 'pointer', color: '#ef5350', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
            </span>
          ))}
          {p.blockedApps.length === 0 && <span style={{ fontSize: 12, color: '#a0aab6' }}>No apps blocked</span>}
        </div>
      </div>

      <button className="primary" onClick={save} disabled={saving} style={{ marginTop: 4 }}>
        {saving ? 'Saving…' : 'Save Policy'}
      </button>
    </div>
  );
}

function EventsTab({ alerts, device }: { alerts: DeviceAlert[]; device: FamilyDevice }) {
  const deviceAlerts = alerts.filter(a => a.deviceId === device.id).sort((a, b) => b.createdAt - a.createdAt);

  if (deviceAlerts.length === 0) {
    return <div style={{ textAlign: 'center', padding: '40px', color: '#a0aab6' }}>No events recorded.</div>;
  }

  return (
    <div>
      {deviceAlerts.map(alert => (
        <div key={alert.id} className="incident" style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <span style={{
            width: 9, height: 9, borderRadius: '50%', marginTop: 4, flexShrink: 0,
            background: alert.severity === 'critical' ? '#ef5350' : alert.severity === 'warning' ? '#f5a623' : '#3b82f6',
          }} />
          <span style={{ flex: 1 }}>
            <strong style={{ fontSize: 13 }}>{alert.message}</strong>
            <small style={{ display: 'block', color: '#8491a7', marginTop: 3 }}>
              {alert.resolvedAt ? '✓ Resolved · ' : ''}
              {formatRelativeAge(alert.createdAt)}
            </small>
          </span>
          <span className={'pill ' + (alert.severity === 'critical' ? 'red' : alert.severity === 'warning' ? 'amber' : 'blue')}>
            {alert.severity}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function DeviceDetail({ device, alerts, policy, onBack, onResolve, onSavePolicy }: Props) {
  const [tab, setTab] = useState<Tab>('health');
  const snap = device.latestSnapshot;

  const initials = device.childProfile.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  const healthBadgeClass =
    device.healthClass === 'healthy' ? 'badge-healthy' :
    device.healthClass === 'needs_attention' ? 'badge-attention' : 'badge-offline';

  const tabs: { id: Tab; label: string }[] = [
    { id: 'health', label: 'Health' },
    { id: 'policy', label: 'Parental Controls' },
    { id: 'events', label: 'Events' },
  ];

  return (
    <div>
      <button className="back" onClick={onBack}>
        <ArrowLeft size={15} style={{ marginRight: 6 }} /> Back to dashboard
      </button>

      {/* Device header */}
      <section className="details" style={{ marginBottom: 24 }}>
        <div
          className="avatar"
          style={{ background: device.childProfile.avatarColor, width: 54, height: 54, fontSize: 20, flexShrink: 0 }}
        >
          {initials}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h2>{device.nickname}</h2>
            <span className={healthBadgeClass}>
              {device.healthClass === 'healthy' ? 'Healthy' : device.healthClass === 'needs_attention' ? 'Needs Attention' : 'Offline'}
            </span>
          </div>
          <p style={{ fontSize: 13, color: '#69778b', margin: '4px 0' }}>
            {device.deviceModel} · {device.childProfile.name} · {device.deviceName}
          </p>
          <small style={{ color: '#8d99a9' }}>
            Agent v{device.agentVersion} · Last sync {formatRelativeAge(device.lastSyncAt)} · Enrolled {new Date(device.enrolledAt).toLocaleDateString()}
          </small>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <i style={{ width: 10, height: 10, borderRadius: '50%', background: device.online ? '#32b984' : '#a0aab6' }} />
          <span style={{ fontSize: 13, color: device.online ? '#32b984' : '#a0aab6', fontWeight: 600 }}>
            {device.online ? 'Online' : 'Offline'}
          </span>
        </div>
      </section>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '2px solid #eef0f2', marginBottom: 24 }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              border: 0, background: 'transparent', cursor: 'pointer', padding: '10px 18px',
              fontSize: 13, fontWeight: 600, color: tab === t.id ? '#146c5b' : '#8491a7',
              borderBottom: tab === t.id ? '2px solid #146c5b' : '2px solid transparent',
              marginBottom: -2,
            }}
          >
            {t.label}
            {t.id === 'events' && alerts.filter(a => a.deviceId === device.id && !a.resolvedAt).length > 0 && (
              <em style={{ marginLeft: 6 }}>
                {alerts.filter(a => a.deviceId === device.id && !a.resolvedAt).length}
              </em>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'health' && (
        snap
          ? <HealthTab snap={snap} device={device} />
          : <div style={{ textAlign: 'center', padding: 40, color: '#a0aab6' }}>
              <AlertTriangle size={36} style={{ margin: '0 auto 12px' }} />
              <p>No health data received yet. The agent may not have checked in.</p>
            </div>
      )}
      {tab === 'policy' && <PolicyTab device={device} policy={policy} onSave={onSavePolicy} />}
      {tab === 'events' && <EventsTab alerts={alerts} device={device} />}
    </div>
  );
}
