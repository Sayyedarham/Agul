import type { ParentalPolicy, BedtimeSchedule } from '../src/types/family.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PolicyTransition =
  | 'apply'   // parent saves policy → state: pending
  | 'confirm' // agent confirms applied → state: active
  | 'fail'    // agent reports failure → state: failed
  | 'revoke'; // device unenrolled → state: not_applied

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

/**
 * Transition a ParentalPolicy to a new state given an event.
 * Returns a new (immutable) copy of the policy with the updated state.
 */
export function transitionPolicy(
  current: ParentalPolicy,
  event: PolicyTransition,
  meta?: { failureReason?: string; appliedAt?: number }
): ParentalPolicy {
  switch (event) {
    case 'apply':
      return {
        ...current,
        state: 'pending',
        lastFailureReason: null,
      };

    case 'confirm':
      return {
        ...current,
        state: 'active',
        lastAppliedAt: meta?.appliedAt ?? Date.now(),
        lastFailureReason: null,
      };

    case 'fail':
      return {
        ...current,
        state: 'failed',
        lastFailureReason: meta?.failureReason ?? 'Unknown error',
      };

    case 'revoke':
      return {
        ...current,
        state: 'not_applied',
        lastFailureReason: null,
      };

    default: {
      const _exhaustive: never = event;
      return current;
    }
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function isValidTime(t: string): boolean {
  return /^\d{2}:\d{2}$/.test(t) && (() => {
    const [h, m] = t.split(':').map(Number);
    return h >= 0 && h <= 23 && m >= 0 && m <= 59;
  })();
}

function isValidDays(days: number[]): boolean {
  if (!Array.isArray(days)) return false;
  return days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6);
}

/**
 * Validate a (partial) ParentalPolicy before it is saved.
 * Returns an array of human-readable error messages.
 * An empty array means the policy is valid.
 */
export function validatePolicy(policy: Partial<ParentalPolicy>): string[] {
  const errors: string[] = [];

  // --- Bedtime ---
  if (policy.bedtime !== undefined) {
    const bt: Partial<BedtimeSchedule> = policy.bedtime;

    if (bt.enabled !== undefined && typeof bt.enabled !== 'boolean') {
      errors.push('bedtime.enabled must be a boolean.');
    }

    if (bt.startTime !== undefined && !isValidTime(bt.startTime)) {
      errors.push('bedtime.startTime must be in HH:MM 24-hour format (e.g. "22:00").');
    }

    if (bt.endTime !== undefined && !isValidTime(bt.endTime)) {
      errors.push('bedtime.endTime must be in HH:MM 24-hour format (e.g. "07:00").');
    }

    if (bt.days !== undefined) {
      if (!isValidDays(bt.days as number[])) {
        errors.push('bedtime.days must be an array of integers 0–6 (0=Sunday … 6=Saturday).');
      } else if ((bt.days as number[]).length === 0 && bt.enabled) {
        errors.push('bedtime.days must include at least one day when bedtime is enabled.');
      }
    }
  }

  // --- Screen time ---
  if (policy.screenTimeLimitMinutes !== undefined && policy.screenTimeLimitMinutes !== null) {
    const v = policy.screenTimeLimitMinutes;
    if (!Number.isInteger(v) || v < 1 || v > 1440) {
      errors.push('screenTimeLimitMinutes must be an integer between 1 and 1440 (24 hours), or null to disable.');
    }
  }

  // --- Blocked apps ---
  if (policy.blockedApps !== undefined) {
    if (!Array.isArray(policy.blockedApps)) {
      errors.push('blockedApps must be an array of process name strings.');
    } else {
      const invalid = (policy.blockedApps as unknown[]).filter((a) => typeof a !== 'string');
      if (invalid.length > 0) {
        errors.push('blockedApps must contain only strings (process names, e.g. "chrome.exe").');
      }
    }
  }

  // --- Allowed apps ---
  if (policy.allowedApps !== undefined && policy.allowedApps !== null) {
    if (!Array.isArray(policy.allowedApps)) {
      errors.push('allowedApps must be an array of process name strings, or null to allow all.');
    }
  }

  // --- USB policy ---
  if (policy.usbPolicy !== undefined) {
    if (!['report', 'block'].includes(policy.usbPolicy as string)) {
      errors.push('usbPolicy must be "report" or "block".');
    }
  }

  // --- Conflict: blockedApps + allowedApps both set ---
  if (
    Array.isArray(policy.blockedApps) &&
    policy.blockedApps.length > 0 &&
    Array.isArray(policy.allowedApps) &&
    policy.allowedApps.length > 0
  ) {
    errors.push(
      'blockedApps and allowedApps cannot both be non-empty. Use one approach: either a blocklist or an allowlist.'
    );
  }

  return errors;
}
