import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type {
  BatterySnapshot,
  DeviceAlert,
  FamilyDevice,
  HealthSnapshot,
  ParentalPolicy,
} from '../types/family.ts';

import {
  evaluateAlerts,
  checkOffline,
  ALERT_RULES,
} from '../../server/alertEngine.ts';

import {
  validatePolicy,
  transitionPolicy,
} from '../../server/policyEngine.ts';

import { FamilyEngine } from '../../server/familyStore.ts';

// ---------------------------------------------------------------------------
// Helpers to build test fixtures
// ---------------------------------------------------------------------------

function makeMinimalSnapshot(overrides?: Partial<HealthSnapshot>): HealthSnapshot {
  return {
    deviceId: 'test-device-01',
    collectedAt: Date.now(),
    battery: {
      pct: 85,
      charging: true,
      estimatedMinutesRemaining: null,
      healthPct: 98,
      cycleCount: 42,
    },
    memory: {
      totalGb: 16,
      usedGb: 6.2,
      usedPct: 38.75,
      sustainedHighPct: false,
    },
    storage: [
      {
        label: 'C:',
        totalGb: 512,
        freeGb: 280,
        encrypted: true,
        smartStatus: 'healthy',
      },
    ],
    connectivity: {
      online: true,
      type: 'wifi',
      ssid: 'Home-5G',
      signalPct: 92,
      latencyMs: 14,
      lastNetworkChangeAt: Date.now() - 3600000,
    },
    boot: {
      lastBootAt: Date.now() - 86400000,
      uptimeSeconds: 86400,
      lastBootDurationMs: 12400,
      unexpectedShutdownsLast30d: 0,
      restartPendingForUpdate: false,
    },
    windowsHealth: {
      version: 'Windows 11 Home',
      build: '26100.3775',
      updateStatus: 'up_to_date',
      pendingRestart: false,
      lastUpdateAt: Date.now() - 86400000 * 2,
      activationStatus: 'activated',
    },
    security: {
      defenderEnabled: true,
      definitionDate: Date.now() - 3600000,
      lastScanAt: Date.now() - 86400000,
      firewallEnabled: true,
      bitlockerEnabled: true,
      tpmPresent: true,
    },
    reliability: {
      appCrashes24h: 0,
      bsodLast30d: 0,
      lastBsodAt: null,
      failedServicesCount: 0,
      failedServiceNames: [],
    },
    peripherals: {
      usb: [],
      bluetooth: [],
    },
    ...overrides,
  };
}

function makeTestDevice(overrides?: Partial<FamilyDevice>): FamilyDevice {
  return {
    id: 'test-device-01',
    nickname: "Test Child's Laptop",
    deviceName: 'LAPTOP-TEST01',
    childProfile: {
      id: 'child-01',
      name: 'Test Child',
      avatarColor: '#3b82f6',
    },
    windowsVersion: 'Windows 11 Home',
    windowsBuild: '26100.3775',
    deviceModel: 'Surface Pro 9',
    serialNumber: 'TEST-12345',
    agentVersion: '1.2.0',
    enrolledAt: Date.now() - 86400000 * 30,
    lastSyncAt: Date.now() - 60000,
    online: true,
    healthClass: 'healthy',
    latestSnapshot: makeMinimalSnapshot(),
    ...overrides,
  };
}

// ===========================================================================
// Test Suite 1: Alert Thresholds & Evaluation
// ===========================================================================

describe('Alert Engine Thresholds', () => {
  it('triggers BAT-LOW warning when battery is below 15% and not charging', () => {
    const dev = makeTestDevice();
    const snap = makeMinimalSnapshot({
      battery: {
        pct: 12,
        charging: false,
        estimatedMinutesRemaining: 35,
        healthPct: 90,
        cycleCount: 150,
      },
    });

    const alerts = evaluateAlerts(dev, snap, []);
    const batAlert = alerts.find((a) => a.ruleId === 'BAT-LOW');
    assert.ok(batAlert, 'BAT-LOW alert should trigger');
    assert.equal(batAlert?.severity, 'warning');
    assert.match(batAlert?.message || '', /Battery is at 12% and not charging/);
  });

  it('triggers BAT-CRIT critical when battery is below 5% and not charging', () => {
    const dev = makeTestDevice();
    const snap = makeMinimalSnapshot({
      battery: {
        pct: 4,
        charging: false,
        estimatedMinutesRemaining: 8,
        healthPct: 90,
        cycleCount: 150,
      },
    });

    const alerts = evaluateAlerts(dev, snap, []);
    const batAlert = alerts.find((a) => a.ruleId === 'BAT-CRIT');
    assert.ok(batAlert, 'BAT-CRIT alert should trigger');
    assert.equal(batAlert?.severity, 'critical');
    assert.match(batAlert?.message || '', /may shut down soon/);
  });

  it('does NOT trigger battery alert when low battery is actively charging', () => {
    const dev = makeTestDevice();
    const snap = makeMinimalSnapshot({
      battery: {
        pct: 8,
        charging: true, // Charging!
        estimatedMinutesRemaining: null,
        healthPct: 90,
        cycleCount: 150,
      },
    });

    const alerts = evaluateAlerts(dev, snap, []);
    const batAlert = alerts.find(
      (a) => a.ruleId === 'BAT-LOW' || a.ruleId === 'BAT-CRIT'
    );
    assert.equal(batAlert, undefined, 'No alert when device is charging');
  });

  it('triggers STOR-LOW when drive free space is under 10 GB', () => {
    const dev = makeTestDevice();
    const snap = makeMinimalSnapshot({
      storage: [
        {
          label: 'C:',
          totalGb: 256,
          freeGb: 6.4,
          encrypted: true,
          smartStatus: 'healthy',
        },
      ],
    });

    const alerts = evaluateAlerts(dev, snap, []);
    const storAlert = alerts.find((a) => a.ruleId === 'STOR-LOW');
    assert.ok(storAlert, 'STOR-LOW alert should trigger');
    assert.equal(storAlert?.severity, 'warning');
    assert.match(storAlert?.message || '', /Only 6.4 GB of storage remains/);
  });

  it('triggers SEC-DEF critical alert when Defender is disabled', () => {
    const dev = makeTestDevice();
    const snap = makeMinimalSnapshot({
      security: {
        defenderEnabled: false,
        definitionDate: null,
        lastScanAt: null,
        firewallEnabled: true,
        bitlockerEnabled: true,
        tpmPresent: true,
      },
    });

    const alerts = evaluateAlerts(dev, snap, []);
    const defAlert = alerts.find((a) => a.ruleId === 'SEC-DEF');
    assert.ok(defAlert, 'SEC-DEF alert should trigger');
    assert.equal(defAlert?.severity, 'critical');
  });

  it('triggers SEC-UPD when Windows update is pending or failed', () => {
    const dev = makeTestDevice();
    const snap = makeMinimalSnapshot({
      windowsHealth: {
        version: 'Windows 11 Home',
        build: '26100.2000',
        updateStatus: 'pending',
        pendingRestart: true,
        lastUpdateAt: Date.now() - 86400000 * 14,
        activationStatus: 'activated',
      },
    });

    const alerts = evaluateAlerts(dev, snap, []);
    const updAlert = alerts.find((a) => a.ruleId === 'SEC-UPD');
    assert.ok(updAlert, 'SEC-UPD alert should trigger');
  });
});

// ===========================================================================
// Test Suite 2: Deduplication Engine
// ===========================================================================

describe('Alert Deduplication', () => {
  it('deduplicates recurring alerts within the 4-hour window', () => {
    const dev = makeTestDevice();
    const snap = makeMinimalSnapshot({
      battery: {
        pct: 10,
        charging: false,
        estimatedMinutesRemaining: 25,
        healthPct: 90,
        cycleCount: 150,
      },
    });

    const existingAlert: DeviceAlert = {
      id: 'existing-alert-01',
      deviceId: dev.id,
      ruleId: 'BAT-LOW',
      severity: 'warning',
      message: 'Battery is at 10% and not charging.',
      createdAt: Date.now() - 3600000, // 1 hour ago (within 4-hour window)
      resolvedAt: null,
      dedupKey: `${dev.id}:BAT-LOW`,
      acknowledged: false,
    };

    const newAlerts = evaluateAlerts(dev, snap, [existingAlert]);
    assert.equal(
      newAlerts.length,
      0,
      'Should suppress duplicate alert within 4-hour dedup window'
    );
  });

  it('allows new alert if prior alert has been resolved', () => {
    const dev = makeTestDevice();
    const snap = makeMinimalSnapshot({
      battery: {
        pct: 10,
        charging: false,
        estimatedMinutesRemaining: 25,
        healthPct: 90,
        cycleCount: 150,
      },
    });

    const resolvedAlert: DeviceAlert = {
      id: 'resolved-alert-01',
      deviceId: dev.id,
      ruleId: 'BAT-LOW',
      severity: 'warning',
      message: 'Battery was low previously.',
      createdAt: Date.now() - 1800000,
      resolvedAt: Date.now() - 60000, // Resolved!
      dedupKey: `${dev.id}:BAT-LOW`,
      acknowledged: true,
    };

    const newAlerts = evaluateAlerts(dev, snap, [resolvedAlert]);
    assert.equal(
      newAlerts.length,
      1,
      'Should generate alert when previous one was resolved'
    );
  });

  it('detects offline devices when last sync exceeds 24 hours', () => {
    const offlineDev = makeTestDevice({
      lastSyncAt: Date.now() - (25 * 3600000), // 25 hours ago
      online: false,
    });

    const offlineAlert = checkOffline(offlineDev, []);
    assert.ok(offlineAlert, 'Offline alert should be generated');
    assert.equal(offlineAlert?.ruleId, 'OFFLINE');
    assert.match(offlineAlert?.message || '', /not checked in for \d+ hours/i);
  });
});

// ===========================================================================
// Test Suite 3: Policy Validation & State Transitions
// ===========================================================================

describe('Parental Policy State Machine', () => {
  const basePolicy: ParentalPolicy = {
    deviceId: 'test-device-01',
    bedtime: {
      enabled: true,
      startTime: '21:30',
      endTime: '07:00',
      days: [0, 1, 2, 3, 4],
    },
    screenTimeLimitMinutes: 120,
    blockedApps: ['discord.exe', 'steam.exe', 'epicgameslauncher.exe'],
    allowedApps: null,
    usbPolicy: 'report',
    state: 'active',
    lastAppliedAt: Date.now() - 86400000,
    lastFailureReason: null,
  };

  it('validates bedtime format and screen time limits correctly', () => {
    // Valid policy
    const errorsValid = validatePolicy(basePolicy);
    assert.equal(errorsValid.length, 0, 'Base policy should have zero validation errors');

    // Invalid bedtime format
    const errorsInvalidTime = validatePolicy({
      ...basePolicy,
      bedtime: { ...basePolicy.bedtime, startTime: '25:99' },
    });
    assert.ok(errorsInvalidTime.length > 0, 'Should reject invalid HH:MM format');

    // Negative screen time limit
    const errorsNegScreenTime = validatePolicy({
      ...basePolicy,
      screenTimeLimitMinutes: -15,
    });
    assert.ok(errorsNegScreenTime.length > 0, 'Should reject negative screen time limit');
  });

  it('transitions state cleanly: apply -> pending -> confirm -> active', () => {
    // Parent saves policy
    const pending = transitionPolicy(basePolicy, 'apply');
    assert.equal(pending.state, 'pending');

    // Windows agent acknowledges application
    const appliedTime = Date.now();
    const confirmed = transitionPolicy(pending, 'confirm', { appliedAt: appliedTime });
    assert.equal(confirmed.state, 'active');
    assert.equal(confirmed.lastAppliedAt, appliedTime);
    assert.equal(confirmed.lastFailureReason, null);
  });

  it('handles agent policy failure with descriptive reason', () => {
    const pending = transitionPolicy(basePolicy, 'apply');
    const failed = transitionPolicy(pending, 'fail', {
      failureReason: 'Windows AppLocker policy service rejected process hash',
    });
    assert.equal(failed.state, 'failed');
    assert.equal(
      failed.lastFailureReason,
      'Windows AppLocker policy service rejected process hash'
    );
  });

  it('resets state to not_applied when device is revoked', () => {
    const revoked = transitionPolicy(basePolicy, 'revoke');
    assert.equal(revoked.state, 'not_applied');
  });
});

// ===========================================================================
// Test Suite 4: Device Enrollment & Unenrollment (Family Store)
// ===========================================================================

describe('Device Enrollment & Revocation', () => {
  it('generates a one-time 8-character uppercase enrollment code', () => {
    const engine = new FamilyEngine();
    const code = engine.generateEnrollCode('parent-admin-01');

    assert.equal(code.code.length, 8);
    assert.equal(code.code, code.code.toUpperCase());
    assert.equal(code.used, false);
    assert.ok(code.expiresAt > Date.now());
  });

  it('enrolls a new Windows device with valid code and initializes defaults', () => {
    const engine = new FamilyEngine();
    const code = engine.generateEnrollCode('parent-admin-01');

    const result = engine.enrollDevice(
      code.code,
      'DESKTOP-JANE',
      "Jane's Study Laptop"
    );

    assert.ok(!('error' in result), 'Enrollment should succeed without error');
    const enrolled = result as FamilyDevice;
    assert.equal(enrolled.deviceName, 'DESKTOP-JANE');
    assert.equal(enrolled.nickname, "Jane's Study Laptop");
    assert.equal(enrolled.childProfile.name, "Jane's Study Laptop");

    // Code is now marked as used
    const codeRecord = engine.getState().enrollmentCodes.find((c) => c.code === code.code);
    assert.equal(codeRecord?.used, true);

    // Initial policy is created
    const policy = engine.getState().policies.find((p) => p.deviceId === enrolled.id);
    assert.ok(policy, 'Default policy must be initialized for enrolled device');
  });

  it('prevents re-use of an already used enrollment code', () => {
    const engine = new FamilyEngine();
    const code = engine.generateEnrollCode('parent-admin-01');

    // First use
    engine.enrollDevice(code.code, 'DEV-1', 'Laptop 1');

    // Second use attempt returns error object
    const result = engine.enrollDevice(code.code, 'DEV-2', 'Laptop 2');
    assert.ok('error' in result, 'Should return error object');
    assert.match((result as { error: string }).error, /already used/i);
  });

  it('revokes device cleanly and removes associated policy', () => {
    const engine = new FamilyEngine();
    const initialCount = engine.getState().devices.length;
    const deviceToRevoke = engine.getState().devices[0];

    const revoked = engine.revokeDevice(deviceToRevoke.id);
    assert.equal(revoked, true);

    const remainingDevices = engine.getState().devices;
    assert.equal(remainingDevices.length, initialCount - 1);
    assert.equal(
      remainingDevices.some((d) => d.id === deviceToRevoke.id),
      false
    );

    // Associated policy is purged
    const remainingPolicy = engine.getState().policies.find(
      (p) => p.deviceId === deviceToRevoke.id
    );
    assert.equal(remainingPolicy, undefined, 'Policy must be purged on revocation');
  });
});
