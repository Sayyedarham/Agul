import React, { useEffect, useState } from 'react';
import type { ParentalPolicy } from '../types/family.ts';

interface Props {
  deviceId: string;
  initialPolicy?: ParentalPolicy | null;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatApplied(epochMs: number | null): string {
  if (epochMs == null) return 'Never';
  return new Date(epochMs).toLocaleString();
}

const policyStateClass: Record<string, string> = {
  active: 'green',
  pending: 'amber',
  failed: 'red',
  not_applied: '',
};

export const ParentalControls: React.FC<Props> = ({ deviceId, initialPolicy }) => {
  const defaultPolicy: ParentalPolicy = {
    deviceId,
    bedtime: { enabled: false, startTime: '22:00', endTime: '07:00', days: [0, 1, 2, 3, 4, 5, 6] },
    screenTimeLimitMinutes: null,
    blockedApps: [],
    allowedApps: null,
    usbPolicy: 'report',
    state: 'not_applied',
    lastAppliedAt: null,
    lastFailureReason: null,
  };

  const [policy, setPolicy] = useState<ParentalPolicy>(initialPolicy ?? defaultPolicy);
  const [screenLimitEnabled, setScreenLimitEnabled] = useState(policy.screenTimeLimitMinutes != null);
  const [screenMinutes, setScreenMinutes] = useState(policy.screenTimeLimitMinutes ?? 120);
  const [blockedAppsText, setBlockedAppsText] = useState(policy.blockedApps.join('\n'));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (initialPolicy) {
      setPolicy(initialPolicy);
      setScreenLimitEnabled(initialPolicy.screenTimeLimitMinutes != null);
      setScreenMinutes(initialPolicy.screenTimeLimitMinutes ?? 120);
      setBlockedAppsText(initialPolicy.blockedApps.join('\n'));
    }
  }, [initialPolicy]);

  const toggleDay = (day: number) => {
    const days = policy.bedtime.days.includes(day)
      ? policy.bedtime.days.filter((d) => d !== day)
      : [...policy.bedtime.days, day].sort((a, b) => a - b);
    setPolicy((p) => ({ ...p, bedtime: { ...p.bedtime, days } }));
  };

  const handleSave = async () => {
    setSaving(true);
    setNotice('');
    const updatedPolicy: ParentalPolicy = {
      ...policy,
      screenTimeLimitMinutes: screenLimitEnabled ? screenMinutes : null,
      blockedApps: blockedAppsText.split('\n').map((s) => s.trim()).filter(Boolean),
    };
    try {
      const res = await fetch(`/api/family/policies/${deviceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedPolicy),
      });
      if (!res.ok) throw new Error(await res.text());
      const saved: ParentalPolicy = await res.json();
      setPolicy(saved);
      setNotice('Policy saved. Status: pending — the agent will apply it on next sync.');
    } catch (err: any) {
      setNotice(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const hours = Math.floor(screenMinutes / 60);
  const mins = screenMinutes % 60;

  return (
    <div>
      {/* State Badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <span
          className={`pill ${policyStateClass[policy.state] ?? ''}`}
          style={{ fontSize: 12 }}
        >
          Policy: {policy.state.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
        </span>
        <span style={{ fontSize: 12, color: '#758296' }}>
          Last applied: {formatApplied(policy.lastAppliedAt)}
        </span>
      </div>

      {policy.state === 'failed' && policy.lastFailureReason && (
        <div className="toast" style={{ marginBottom: 16 }}>
          <span style={{ color: '#d14343' }}>⚠ Failure reason: {policy.lastFailureReason}</span>
        </div>
      )}

      {notice && (
        <div className="toast" style={{ marginBottom: 16 }}>
          {notice}
        </div>
      )}

      {/* Bedtime Schedule */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="pt">
          <h3>Bedtime Schedule</h3>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={policy.bedtime.enabled}
              onChange={(e) =>
                setPolicy((p) => ({ ...p, bedtime: { ...p.bedtime, enabled: e.target.checked } }))
              }
            />
            <span style={{ fontSize: 13 }}>Enabled</span>
          </label>
        </div>

        <div
          style={{
            paddingTop: 14,
            opacity: policy.bedtime.enabled ? 1 : 0.5,
            pointerEvents: policy.bedtime.enabled ? 'auto' : 'none',
          }}
        >
          <div style={{ display: 'flex', gap: 24, marginBottom: 14 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#536176' }}>
              Start time
              <input
                type="time"
                value={policy.bedtime.startTime}
                onChange={(e) =>
                  setPolicy((p) => ({ ...p, bedtime: { ...p.bedtime, startTime: e.target.value } }))
                }
                style={{ padding: '6px 10px', border: '1px solid #e0e4e9', borderRadius: 6, fontSize: 14, fontFamily: 'inherit' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#536176' }}>
              End time
              <input
                type="time"
                value={policy.bedtime.endTime}
                onChange={(e) =>
                  setPolicy((p) => ({ ...p, bedtime: { ...p.bedtime, endTime: e.target.value } }))
                }
                style={{ padding: '6px 10px', border: '1px solid #e0e4e9', borderRadius: 6, fontSize: 14, fontFamily: 'inherit' }}
              />
            </label>
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {DAYS.map((d, i) => (
              <button
                key={i}
                type="button"
                onClick={() => toggleDay(i)}
                className={`pill ${policy.bedtime.days.includes(i) ? 'blue' : ''}`}
                style={{ cursor: 'pointer', border: '1px solid #e0e4e9' }}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Screen Time */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="pt">
          <h3>Screen Time</h3>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={screenLimitEnabled}
              onChange={(e) => setScreenLimitEnabled(e.target.checked)}
            />
            <span style={{ fontSize: 13 }}>Enable daily limit</span>
          </label>
        </div>

        {screenLimitEnabled && (
          <div style={{ paddingTop: 14, display: 'flex', alignItems: 'center', gap: 14 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#536176' }}>
              Daily limit (minutes)
              <input
                type="number"
                min={15}
                max={1440}
                step={15}
                value={screenMinutes}
                onChange={(e) => setScreenMinutes(Number(e.target.value))}
                style={{ padding: '6px 10px', border: '1px solid #e0e4e9', borderRadius: 6, fontSize: 14, fontFamily: 'inherit', width: 100 }}
              />
            </label>
            <span style={{ fontSize: 13, color: '#536176', marginTop: 18 }}>
              = {hours}h {mins}m per day
            </span>
          </div>
        )}
      </div>

      {/* Application Controls */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="pt">
          <h3>Application Controls</h3>
        </div>
        <div style={{ paddingTop: 12 }}>
          <p style={{ fontSize: 13, color: '#536176', marginBottom: 10 }}>
            Uses Windows' built-in parental controls and AppLocker to restrict applications by process name.
          </p>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#536176' }}>
            Blocked app process names (one per line)
            <textarea
              rows={5}
              value={blockedAppsText}
              onChange={(e) => setBlockedAppsText(e.target.value)}
              placeholder="e.g. chrome.exe&#10;steam.exe&#10;discord.exe"
              style={{
                padding: '8px 10px',
                border: '1px solid #e0e4e9',
                borderRadius: 6,
                fontSize: 13,
                fontFamily: 'monospace',
                resize: 'vertical',
              }}
            />
          </label>
          <p style={{ fontSize: 11, color: '#8491a7', marginTop: 8 }}>
            These restrictions use Windows' built-in parental controls and are visible in Windows Settings.
          </p>
        </div>
      </div>

      {/* Connected Device Policy */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="pt">
          <h3>Connected Device Policy</h3>
        </div>
        <div style={{ paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
            <input
              type="radio"
              name="usbPolicy"
              value="report"
              checked={policy.usbPolicy === 'report'}
              onChange={() => setPolicy((p) => ({ ...p, usbPolicy: 'report' }))}
            />
            Report new devices (allow but notify)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
            <input
              type="radio"
              name="usbPolicy"
              value="block"
              checked={policy.usbPolicy === 'block'}
              onChange={() => setPolicy((p) => ({ ...p, usbPolicy: 'block' }))}
            />
            Block unrecognized devices
          </label>
          {policy.usbPolicy === 'block' && (
            <div className="toast" style={{ background: '#fff4db', borderColor: '#fde68a', color: '#a66a00' }}>
              ⚠ Ensure you have a recovery path before enabling blocking.
            </div>
          )}
        </div>
      </div>

      {/* Save */}
      <button
        className="primary"
        onClick={handleSave}
        disabled={saving}
        style={{ width: '100%', justifyContent: 'center', padding: '11px', fontSize: 14 }}
      >
        {saving ? 'Saving…' : 'Save Policy'}
      </button>
    </div>
  );
};
