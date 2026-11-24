import React, { useEffect, useMemo, useState } from 'react';
import {
  BellRing,
  Laptop,
  LayoutDashboard,
  PlusCircle,
  QrCode,
  Search,
  ShieldCheck,
  Trash2,
  Lock,
  EyeOff,
  UserCheck,
  CheckCircle,
} from 'lucide-react';
import './index.css';
import { supabase } from './lib/supabase.ts';
import * as api from './lib/api.ts';
import type {
  DeviceAlert,
  EnrollmentCode,
  FamilyDevice,
  ParentalPolicy,
} from './types/family.ts';
import Dashboard from './components/Dashboard.tsx';
import DeviceDetail from './components/DeviceDetail.tsx';
import AlertFeed from './components/AlertFeed.tsx';
import EnrollModal from './components/EnrollModal.tsx';

type NavPage = 'dashboard' | 'device' | 'alerts' | 'enrollment' | 'privacy';

export default function App() {
  const [page, setPage] = useState<NavPage>('dashboard');
  const [session, setSession] = useState<any>(null);
  const [devices, setDevices] = useState<FamilyDevice[]>([]);
  const [alerts, setAlerts] = useState<DeviceAlert[]>([]);
  const [policies, setPolicies] = useState<Record<string, ParentalPolicy>>({});
  const [codes, setCodes] = useState<EnrollmentCode[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<FamilyDevice | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const cloud = !!supabase;

  // Notice helper
  const showToast = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 4500);
  };

  // Auth state management when Supabase is configured
  useEffect(() => {
    if (!supabase) return;
    const ensure = (s: any) => {
      if (s) api.ensureFamily().catch(() => {});
    };
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      ensure(data.session);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      ensure(s);
    });
    return () => subscription.unsubscribe();
  }, [cloud]);

  // Initial data loading
  const loadFamilyData = async () => {
    if (supabase) {
      if (!session) {
        setDevices([]);
        setAlerts([]);
        setPolicies({});
        setCodes([]);
        return;
      }
      try {
        const [devs, alts, pols, codeList] = await Promise.all([
          api.fetchDevices(),
          api.fetchAlerts(),
          api.fetchPolicies(),
          api.fetchEnrollmentCodes(),
        ]);
        setDevices(devs);
        setAlerts(alts);
        const polMap: Record<string, ParentalPolicy> = {};
        pols.forEach((p) => {
          polMap[p.deviceId] = p;
        });
        setPolicies(polMap);
        setCodes(codeList);
      } catch {
        // Ignore transient fetch errors; the 30 s poll will retry
      }
      return;
    }

    try {
      const [devRes, alertRes] = await Promise.all([
        fetch('/api/family/devices'),
        fetch('/api/family/alerts'),
      ]);

      if (devRes.ok) {
        const devData: FamilyDevice[] = await devRes.json();
        setDevices(devData);

        // Fetch policy for each device
        devData.forEach(async (d) => {
          try {
            const pRes = await fetch(`/api/family/policies/${d.id}`);
            if (pRes.ok) {
              const pol: ParentalPolicy = await pRes.json();
              setPolicies((prev) => ({ ...prev, [d.id]: pol }));
            }
          } catch {
            // Ignore fetch error
          }
        });
      }

      if (alertRes.ok) {
        const alertData: DeviceAlert[] = await alertRes.json();
        setAlerts(alertData);
      }
    } catch {
      // Fallback: server may still be initializing
    }
  };

  useEffect(() => {
    loadFamilyData();
    // Poll fallback every 30 seconds
    const interval = setInterval(loadFamilyData, 30_000);
    return () => clearInterval(interval);
  }, [cloud, session]);

  // SSE Real-time streaming (demo mode only; cloud mode polls)
  useEffect(() => {
    if (supabase) return;
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/telemetry/stream');
      es.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'family-tick' && payload.family) {
            const fState = payload.family;
            if (Array.isArray(fState.devices)) setDevices(fState.devices);
            if (Array.isArray(fState.alerts)) setAlerts(fState.alerts);
            if (Array.isArray(fState.policies)) {
              const polMap: Record<string, ParentalPolicy> = {};
              fState.policies.forEach((p: ParentalPolicy) => {
                polMap[p.deviceId] = p;
              });
              setPolicies(polMap);
            }
            if (Array.isArray(fState.enrollmentCodes)) {
              setCodes(fState.enrollmentCodes);
            }
          }
        } catch {
          // Ignore parse errors on ping events
        }
      };
    } catch {
      // SSE not supported or blocked
    }

    return () => {
      es?.close();
    };
  }, []);

  // Keep selected device synced with updated device in list
  useEffect(() => {
    if (selectedDevice) {
      const updated = devices.find((d) => d.id === selectedDevice.id);
      if (updated) setSelectedDevice(updated);
    }
  }, [devices]);

  // Filtered devices based on search query
  const filteredDevices = useMemo(() => {
    if (!searchQuery.trim()) return devices;
    const q = searchQuery.toLowerCase();
    return devices.filter(
      (d) =>
        d.nickname.toLowerCase().includes(q) ||
        d.deviceName.toLowerCase().includes(q) ||
        d.childProfile.name.toLowerCase().includes(q) ||
        d.deviceModel.toLowerCase().includes(q)
    );
  }, [devices, searchQuery]);

  const unresolvedAlertCount = useMemo(
    () => alerts.filter((a) => !a.resolvedAt).length,
    [alerts]
  );

  // Actions
  const handleSelectDevice = (device: FamilyDevice) => {
    setSelectedDevice(device);
    setPage('device');
  };

  const handleResolveAlert = async (alertId: string) => {
    if (supabase) {
      try {
        await api.resolveAlert(alertId);
        setAlerts((prev) =>
          prev.map((a) =>
            a.id === alertId
              ? { ...a, resolvedAt: Date.now(), acknowledged: true }
              : a
          )
        );
        showToast('Alert resolved.');
      } catch {
        showToast('Failed to resolve alert.');
      }
      return;
    }
    try {
      const res = await fetch(`/api/family/alerts/${alertId}/resolve`, {
        method: 'POST',
      });
      if (res.ok) {
        setAlerts((prev) =>
          prev.map((a) =>
            a.id === alertId ? { ...a, resolvedAt: Date.now() } : a
          )
        );
        showToast('Alert resolved.');
      }
    } catch {
      showToast('Failed to resolve alert.');
    }
  };

  const handleSavePolicy = async (policy: ParentalPolicy) => {
    if (supabase) {
      try {
        const updated = await api.savePolicy(policy.deviceId, policy);
        setPolicies((prev) => ({ ...prev, [policy.deviceId]: updated }));
        showToast('Policy saved. Enforcement on the device is not yet active.');
      } catch {
        showToast('Network error while saving policy.');
      }
      return;
    }
    try {
      const res = await fetch(`/api/family/policies/${policy.deviceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(policy),
      });
      if (res.ok) {
        const updated: ParentalPolicy = await res.json();
        setPolicies((prev) => ({ ...prev, [policy.deviceId]: updated }));
        showToast('Parental policy updated and queued for Windows agent.');
      } else {
        const err = await res.json();
        showToast(`Policy error: ${err.errors?.join(', ') || 'Failed to update'}`);
      }
    } catch {
      showToast('Network error while saving policy.');
    }
  };

  const handleGenerateCode = async () => {
    if (supabase) {
      try {
        const newCode = await api.createEnrollmentCode();
        setCodes((prev) => [newCode, ...prev]);
        showToast(`New enrollment code generated: ${newCode.code}`);
      } catch {
        showToast('Failed to generate enrollment code.');
      }
      return;
    }
    try {
      const res = await fetch('/api/family/enrollment/codes', {
        method: 'POST',
      });
      if (res.ok) {
        const newCode: EnrollmentCode = await res.json();
        setCodes((prev) => [newCode, ...prev]);
        showToast(`New enrollment code generated: ${newCode.code}`);
      }
    } catch {
      showToast('Failed to generate enrollment code.');
    }
  };

  const handleRevokeDevice = async (deviceId: string) => {
    if (
      !window.confirm(
        'Revoke device registration? All health records and policies will be permanently unlinked.'
      )
    ) {
      return;
    }
    if (supabase) {
      try {
        await api.revokeDevice(deviceId);
        setDevices((prev) => prev.filter((d) => d.id !== deviceId));
        setSelectedDevice(null);
        setPage('dashboard');
        showToast('Device unlinked and revoked successfully.');
      } catch {
        showToast('Failed to revoke device.');
      }
      return;
    }
    try {
      const res = await fetch(`/api/family/devices/${deviceId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setDevices((prev) => prev.filter((d) => d.id !== deviceId));
        setSelectedDevice(null);
        setPage('dashboard');
        showToast('Device unlinked and revoked successfully.');
      }
    } catch {
      showToast('Failed to revoke device.');
    }
  };

  // Sign in when Supabase cloud is configured
  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) showToast(error.message);
  };

  if (cloud && !session) {
    return (
      <div className="shell">
        <main style={{ maxWidth: 460, margin: '60px auto' }}>
          <header>
            <div>
              <p>FAMILYGUARD PORTAL</p>
              <h1>Parent Sign In</h1>
            </div>
          </header>
          <section className="panel">
            <h3>Authorized Family Administrator</h3>
            <p style={{ color: '#768398', fontSize: 13, marginBottom: 16 }}>
              Protected by parental role verification and authenticated encryption.
            </p>
            <form className="authform" onSubmit={signIn}>
              <input
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Parent Email"
              />
              <input
                required
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
              />
              <button className="primary" style={{ marginTop: 12 }}>
                Sign In to Dashboard
              </button>
            </form>
          </section>
        </main>
      </div>
    );
  }

  const currentPolicy = selectedDevice
    ? policies[selectedDevice.id] ?? null
    : null;

  return (
    <div className="shell">
      {/* Sidebar Rail */}
      <aside>
        <div className="brand" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ShieldCheck size={22} color="#38bdf8" />
          <span>FamilyGuard</span>
        </div>
        <div className="tenant">
          {cloud ? 'SUPABASE CLOUD' : 'SIMULATED FLEET'}
          <b>{cloud ? 'Authenticated Parent' : '4 Windows Laptops Managed'}</b>
        </div>

        <nav>
          <button
            className={page === 'dashboard' ? 'active' : ''}
            onClick={() => setPage('dashboard')}
          >
            <LayoutDashboard size={17} />
            Dashboard
          </button>

          {selectedDevice && (
            <button
              className={page === 'device' ? 'active' : ''}
              onClick={() => setPage('device')}
            >
              <Laptop size={17} />
              {selectedDevice.nickname}
            </button>
          )}

          <button
            className={page === 'alerts' ? 'active' : ''}
            onClick={() => setPage('alerts')}
          >
            <BellRing size={17} />
            Alerts
            {unresolvedAlertCount > 0 && <em>{unresolvedAlertCount}</em>}
          </button>

          <button
            className={page === 'enrollment' ? 'active' : ''}
            onClick={() => setPage('enrollment')}
          >
            <QrCode size={17} />
            Enroll Device
          </button>

          <button
            className={page === 'privacy' ? 'active' : ''}
            onClick={() => setPage('privacy')}
          >
            <ShieldCheck size={17} />
            Privacy & Trust
          </button>
        </nav>

        <div className="side">
          <span className="pill green">● Consent-First Care</span>
          <small>
            Transparent Windows service. No covert monitoring, no keystroke or camera capture.
          </small>
        </div>
      </aside>

      {/* Main viewport */}
      <main>
        <header>
          <div>
            <p>WINDOWS FAMILY DEVICE HEALTH & PARENTAL CONTROLS</p>
            <h1>
              {page === 'dashboard' && 'Parent Overview'}
              {page === 'device' && (selectedDevice?.nickname ?? 'Device Health')}
              {page === 'alerts' && 'Actionable Health & Policy Alerts'}
              {page === 'enrollment' && 'Device Registration & Enrollment'}
              {page === 'privacy' && 'Consent & Privacy Architecture'}
            </h1>
          </div>

          <div className="actions">
            {page === 'dashboard' && (
              <label>
                <Search size={16} />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search laptops..."
                />
              </label>
            )}

            <button
              className="primary"
              onClick={() => {
                handleGenerateCode();
                setShowEnrollModal(true);
              }}
            >
              <PlusCircle size={15} />
              Enroll Laptop
            </button>

            {cloud && (
              <button className="quiet" onClick={() => supabase?.auth.signOut()}>
                Sign Out
              </button>
            )}
          </div>
        </header>

        {notice && (
          <div className="toast">
            <span>{notice}</span>
            <button onClick={() => setNotice(null)}>✕</button>
          </div>
        )}

        {/* Dashboard page */}
        {page === 'dashboard' && (
          <Dashboard
            devices={filteredDevices}
            alerts={alerts}
            onSelectDevice={handleSelectDevice}
            onEnroll={() => {
              handleGenerateCode();
              setShowEnrollModal(true);
            }}
          />
        )}

        {/* Device detail page */}
        {page === 'device' && selectedDevice && (
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16,
              }}
            >
              <button
                className="quiet"
                onClick={() => setPage('dashboard')}
                style={{ fontSize: 13 }}
              >
                ← Back to Dashboard
              </button>

              <button
                className="quiet"
                style={{ color: '#ef5350', borderColor: '#fca5a5' }}
                onClick={() => handleRevokeDevice(selectedDevice.id)}
              >
                <Trash2 size={14} />
                Unenroll Device
              </button>
            </div>

            <DeviceDetail
              device={selectedDevice}
              alerts={alerts}
              policy={currentPolicy}
              onBack={() => setPage('dashboard')}
              onResolve={handleResolveAlert}
              onSavePolicy={handleSavePolicy}
            />
          </div>
        )}

        {/* Alerts page */}
        {page === 'alerts' && (
          <div className="panel">
            <h3 style={{ marginBottom: 14 }}>Actionable Event Timeline</h3>
            <p style={{ color: '#768398', fontSize: 13, marginBottom: 20 }}>
              Human-language notifications prioritized by urgency. Redundant alerts are
              automatically deduplicated.
            </p>
            <AlertFeed
              alerts={alerts}
              devices={devices}
              onResolve={handleResolveAlert}
            />
          </div>
        )}

        {/* Enrollment Management page */}
        {page === 'enrollment' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 20 }}>
            <div className="panel">
              <div className="pt" style={{ marginBottom: 16 }}>
                <h3>Active Enrollment Codes</h3>
                <button className="primary" onClick={handleGenerateCode}>
                  <PlusCircle size={14} />
                  New Code
                </button>
              </div>

              <p style={{ color: '#768398', fontSize: 13, marginBottom: 20 }}>
                Enrollment codes are one-time use and expire after 15 minutes. Enter this code into
                the FamilyGuard Windows Agent installer.
              </p>

              {codes.length === 0 ? (
                <div style={{ padding: '32px 0', textAlign: 'center', color: '#8491a7' }}>
                  No codes generated yet. Click "New Code" above.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {codes.map((c) => (
                    <div
                      key={c.code}
                      style={{
                        padding: '14px 18px',
                        border: '1px solid #e6e9ee',
                        borderRadius: 10,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: c.used ? '#f8fafc' : '#ffffff',
                      }}
                    >
                      <div>
                        <span
                          style={{
                            fontFamily: 'monospace',
                            fontSize: 22,
                            fontWeight: 700,
                            letterSpacing: 4,
                            color: c.used ? '#94a3b8' : '#0f172a',
                          }}
                        >
                          {c.code}
                        </span>
                        <div style={{ fontSize: 11, color: '#8491a7', marginTop: 4 }}>
                          Created {new Date(c.createdAt).toLocaleTimeString()}
                        </div>
                      </div>

                      <span
                        className={`pill ${
                          c.used ? 'slate' : c.expiresAt < Date.now() ? 'red' : 'green'
                        }`}
                      >
                        {c.used
                          ? 'Used'
                          : c.expiresAt < Date.now()
                          ? 'Expired'
                          : 'Valid (15m)'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="panel">
              <h3 style={{ marginBottom: 14 }}>Consent-First Windows Enrollment</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontSize: 13, color: '#475569' }}>
                <div style={{ display: 'flex', gap: 10 }}>
                  <UserCheck size={20} color="#146c5b" style={{ flexShrink: 0 }} />
                  <div>
                    <b>1. Visible Child Notice</b>
                    <p style={{ margin: '4px 0 0', color: '#64748b' }}>
                      Upon enrollment, Windows displays a persistent notification stating that this device
                      is managed by family policy.
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <Lock size={20} color="#146c5b" style={{ flexShrink: 0 }} />
                  <div>
                    <b>2. Cryptographic Device Identity</b>
                    <p style={{ margin: '4px 0 0', color: '#64748b' }}>
                      The agent generates a unique RSA-4096 / TLS keypair stored in Windows DPAPI /
                      Credential Manager.
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <ShieldCheck size={20} color="#146c5b" style={{ flexShrink: 0 }} />
                  <div>
                    <b>3. Standard Windows Service</b>
                    <p style={{ margin: '4px 0 0', color: '#64748b' }}>
                      FamilyGuard runs as an unhidden Windows service (<code>FamilyGuardAgent.exe</code>)
                      visible in Task Manager and Services.msc.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Privacy & Trust page */}
        {page === 'privacy' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="panel">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <ShieldCheck size={28} color="#146c5b" />
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 700 }}>Privacy & Child Safety Commitments</h2>
                  <p style={{ color: '#768398', fontSize: 13 }}>
                    Strict architectural boundaries preventing surveillance, covert capture, or private content collection.
                  </p>
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 16,
                  marginTop: 20,
                }}
              >
                <div
                  style={{
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    borderRadius: 10,
                    padding: 16,
                  }}
                >
                  <h4 style={{ color: '#166534', display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 10px' }}>
                    <CheckCircle size={18} />
                    What FamilyGuard Collects (Health Only)
                  </h4>
                  <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#14532d', lineHeight: 1.8 }}>
                    <li>Battery health, percentage, cycle counts, charging state</li>
                    <li>Drive capacity, free disk space, BitLocker encryption status</li>
                    <li>RAM utilization and sustained high memory indicators</li>
                    <li>Network type (Wi-Fi/Ethernet), signal quality, latency</li>
                    <li>Windows Defender real-time protection and firewall status</li>
                    <li>Windows Update pending status and unexpected crash events (BSOD)</li>
                    <li>Connected peripheral device names (USB / Bluetooth notifications)</li>
                  </ul>
                </div>

                <div
                  style={{
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: 10,
                    padding: 16,
                  }}
                >
                  <h4 style={{ color: '#991b1b', display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 10px' }}>
                    <EyeOff size={18} />
                    What FamilyGuard NEVER Collects
                  </h4>
                  <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#7f1d1d', lineHeight: 1.8 }}>
                    <li>Keystrokes, keylogging, or password inputs</li>
                    <li>Webcam or microphone audio/video streams</li>
                    <li>Private chat messages, emails, or personal files</li>
                    <li>Browser history, incognito contents, or search terms</li>
                    <li>Screen recordings, screenshots, or live remote desktop</li>
                    <li>Covert background GPS tracking</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="panel">
              <h3 style={{ marginBottom: 12 }}>Unenrollment & Data Retention</h3>
              <p style={{ color: '#475569', fontSize: 13, lineHeight: 1.6 }}>
                Parents or system administrators may unregister any device at any time. When a device
                is unenrolled:
              </p>
              <ul style={{ color: '#475569', fontSize: 13, lineHeight: 1.8, marginTop: 8 }}>
                <li>The device's bearer credentials and TLS client keys are revoked immediately.</li>
                <li>All historical telemetry, boot records, and device metrics are purged from the database.</li>
                <li>The Windows agent on the endpoint enters a dormant state and restores default Windows policies.</li>
              </ul>
            </div>
          </div>
        )}
      </main>

      {/* Enroll Modal */}
      {showEnrollModal && (
        <EnrollModal
          codes={codes}
          onGenerate={handleGenerateCode}
          onClose={() => setShowEnrollModal(false)}
        />
      )}
    </div>
  );
}
