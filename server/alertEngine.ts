import type { FamilyDevice, DeviceAlert, HealthSnapshot } from '../src/types/family.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AlertRule {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  dedupWindowMs: number;
  check: (snapshot: HealthSnapshot) => string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function newId(): string {
  return `alert-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function isDuped(
  dedupKey: string,
  dedupWindowMs: number,
  existingAlerts: DeviceAlert[]
): boolean {
  const now = Date.now();
  return existingAlerts.some(
    (a) =>
      a.dedupKey === dedupKey &&
      a.resolvedAt === null &&
      now - a.createdAt < dedupWindowMs
  );
}

function makeAlert(
  deviceId: string,
  rule: AlertRule,
  message: string
): DeviceAlert {
  const dedupKey = `${deviceId}:${rule.id}`;
  return {
    id: newId(),
    deviceId,
    ruleId: rule.id,
    severity: rule.severity,
    message,
    createdAt: Date.now(),
    resolvedAt: null,
    dedupKey,
    acknowledged: false,
  };
}

// ---------------------------------------------------------------------------
// Rule definitions
// ---------------------------------------------------------------------------

const FOUR_HOURS = 4 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export const ALERT_RULES: AlertRule[] = [
  // BAT-CRIT must come before BAT-LOW so the more-severe rule fires first
  {
    id: 'BAT-CRIT',
    severity: 'critical',
    dedupWindowMs: FOUR_HOURS,
    check: (s) => {
      if (s.battery.pct < 5 && !s.battery.charging) {
        return `Battery at ${s.battery.pct}% – device may shut down soon.`;
      }
      return null;
    },
  },
  {
    id: 'BAT-LOW',
    severity: 'warning',
    dedupWindowMs: FOUR_HOURS,
    check: (s) => {
      if (s.battery.pct < 15 && !s.battery.charging) {
        return `Battery is at ${s.battery.pct}% and not charging.`;
      }
      return null;
    },
  },
  {
    id: 'STOR-LOW',
    severity: 'warning',
    dedupWindowMs: FOUR_HOURS,
    check: (s) => {
      for (const drive of s.storage) {
        if (drive.freeGb < 10) {
          return `Only ${drive.freeGb.toFixed(1)} GB of storage remains on ${drive.label}.`;
        }
      }
      return null;
    },
  },
  {
    id: 'SEC-DEF',
    severity: 'critical',
    dedupWindowMs: FOUR_HOURS,
    check: (s) => {
      if (!s.security.defenderEnabled) {
        return 'Microsoft Defender is turned off. The device may be at risk.';
      }
      return null;
    },
  },
  {
    id: 'SEC-FW',
    severity: 'warning',
    dedupWindowMs: FOUR_HOURS,
    check: (s) => {
      if (!s.security.firewallEnabled) {
        return 'Windows Firewall is disabled.';
      }
      return null;
    },
  },
  {
    id: 'SEC-UPD',
    severity: 'warning',
    dedupWindowMs: FOUR_HOURS,
    check: (s) => {
      if (s.windowsHealth.updateStatus === 'pending' || s.windowsHealth.updateStatus === 'failed') {
        return 'Windows security updates are pending.';
      }
      return null;
    },
  },
  {
    id: 'BSOD',
    severity: 'warning',
    dedupWindowMs: FOUR_HOURS,
    check: (s) => {
      if (
        s.reliability.bsodLast30d > 0 &&
        s.reliability.lastBsodAt !== null &&
        Date.now() - s.reliability.lastBsodAt < SEVEN_DAYS_MS
      ) {
        const daysAgo = Math.floor((Date.now() - s.reliability.lastBsodAt) / (24 * 60 * 60 * 1000));
        return `A system crash (BSOD) occurred ${daysAgo} day${daysAgo !== 1 ? 's' : ''} ago.`;
      }
      return null;
    },
  },
  {
    id: 'MEM-HIGH',
    severity: 'critical',
    dedupWindowMs: FOUR_HOURS,
    check: (s) => {
      if (s.memory.usedPct > 90) {
        return `Memory usage is critically high (${s.memory.usedPct}%).`;
      }
      return null;
    },
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate all alert rules against a snapshot and return any NEW alerts
 * that pass the dedup check (not already tracked within dedupWindowMs).
 */
export function evaluateAlerts(
  device: FamilyDevice,
  snapshot: HealthSnapshot,
  existingAlerts: DeviceAlert[]
): DeviceAlert[] {
  const newAlerts: DeviceAlert[] = [];

  for (const rule of ALERT_RULES) {
    const message = rule.check(snapshot);
    if (message === null) continue;

    const dedupKey = `${device.id}:${rule.id}`;
    if (isDuped(dedupKey, rule.dedupWindowMs, existingAlerts)) continue;

    newAlerts.push(makeAlert(device.id, rule, message));
  }

  return newAlerts;
}

/**
 * Check whether a device has gone offline (lastSyncAt > 24 h ago).
 * Returns a new DeviceAlert if one should be created, or null.
 */
export function checkOffline(
  device: FamilyDevice,
  existingAlerts: DeviceAlert[]
): DeviceAlert | null {
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  const sinceSync = Date.now() - device.lastSyncAt;

  if (sinceSync < TWENTY_FOUR_HOURS) return null;

  const offlineRule: AlertRule = {
    id: 'OFFLINE',
    severity: 'warning',
    dedupWindowMs: FOUR_HOURS,
    check: () => null, // not used here
  };

  const dedupKey = `${device.id}:OFFLINE`;
  if (isDuped(dedupKey, offlineRule.dedupWindowMs, existingAlerts)) return null;

  const hoursAgo = Math.floor(sinceSync / (60 * 60 * 1000));
  return {
    id: newId(),
    deviceId: device.id,
    ruleId: 'OFFLINE',
    severity: 'warning',
    message: `This laptop has not checked in for ${hoursAgo} hours.`,
    createdAt: Date.now(),
    resolvedAt: null,
    dedupKey,
    acknowledged: false,
  };
}
