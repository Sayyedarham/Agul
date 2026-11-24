// Alert rules + dedup, ported from server/alertEngine.ts as pure functions
// (no Node APIs) so both the Edge Function and tests can use them.

import type { AlertSeverity, HealthSnapshot } from './types.ts';

export const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export interface AlertRule {
  id: string;
  severity: AlertSeverity;
  dedupWindowMs: number;
  check: (snapshot: HealthSnapshot) => string | null;
}

export const ALERT_RULES: AlertRule[] = [
  // BAT-CRIT must come before BAT-LOW so the more-severe rule fires first
  {
    id: 'BAT-CRIT',
    severity: 'critical',
    dedupWindowMs: FOUR_HOURS_MS,
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
    dedupWindowMs: FOUR_HOURS_MS,
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
    dedupWindowMs: FOUR_HOURS_MS,
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
    dedupWindowMs: FOUR_HOURS_MS,
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
    dedupWindowMs: FOUR_HOURS_MS,
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
    dedupWindowMs: FOUR_HOURS_MS,
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
    dedupWindowMs: FOUR_HOURS_MS,
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
    dedupWindowMs: FOUR_HOURS_MS,
    check: (s) => {
      if (s.memory.usedPct > 90) {
        return `Memory usage is critically high (${s.memory.usedPct}%).`;
      }
      return null;
    },
  },
];

export interface ExistingAlert {
  dedupKey: string;
  createdAt: number;
}

export interface NewAlert {
  deviceId: string;
  ruleId: string;
  severity: AlertSeverity;
  message: string;
  dedupKey: string;
}

/**
 * Evaluate all alert rules against a snapshot and return the alerts that
 * pass the 4h dedup check against existing open alerts.
 */
export function evaluateAlerts(
  deviceId: string,
  snapshot: HealthSnapshot,
  existingAlerts: ExistingAlert[],
): NewAlert[] {
  const now = Date.now();
  const newAlerts: NewAlert[] = [];

  for (const rule of ALERT_RULES) {
    const message = rule.check(snapshot);
    if (message === null) continue;

    const dedupKey = `${deviceId}:${rule.id}`;
    const isDuped = existingAlerts.some(
      (a) =>
        a.dedupKey === dedupKey &&
        now - a.createdAt < rule.dedupWindowMs,
    );
    if (isDuped) continue;

    newAlerts.push({
      deviceId,
      ruleId: rule.id,
      severity: rule.severity,
      message,
      dedupKey,
    });
  }

  return newAlerts;
}

/** Health classification used when a new snapshot arrives. */
export function classifyHealth(
  snapshot: HealthSnapshot,
): 'healthy' | 'needs_attention' {
  for (const rule of ALERT_RULES) {
    if (rule.check(snapshot)) return 'needs_attention';
  }
  return 'healthy';
}
