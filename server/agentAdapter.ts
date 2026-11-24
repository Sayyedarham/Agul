import type {
  AgentCheckinPayload,
  AgentCheckinResponse,
  AgentCommand,
  HealthSnapshot,
  ParentalPolicy,
} from '../src/types/family.ts';
import { familyEngine } from './familyStore.ts';
import { evaluateAlerts } from './alertEngine.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

// ---------------------------------------------------------------------------
// Token → deviceId map for the demo tier.
// In production these would be stored hashed in a database.
// ---------------------------------------------------------------------------

const DEMO_TOKEN_PREFIX = 'demo-token-';

// Map of token → deviceId (populated from family store on first use)
const tokenMap = new Map<string, string>();

// Seed with well-known demo tokens bound to the seeded device ids.
// These device ids match the ones created in familyStore.ts.
const DEMO_DEVICE_TOKENS: Record<string, string> = {
  'demo-token-d1': 'device-emma-01',
  'demo-token-d2': 'device-jake-02',
  'demo-token-d3': 'device-dad-03',
  'demo-token-d4': 'device-living-04',
};
for (const [token, deviceId] of Object.entries(DEMO_DEVICE_TOKENS)) {
  tokenMap.set(token, deviceId);
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface IAgentAdapter {
  registerDeviceToken(token: string, deviceId: string): void;
  validateToken(token: string): Promise<string | null>;
  processCheckin(deviceId: string, payload: AgentCheckinPayload): Promise<AgentCheckinResponse>;
}

// ---------------------------------------------------------------------------
// Mock implementation
// ---------------------------------------------------------------------------

export class MockAgentAdapter implements IAgentAdapter {
  registerDeviceToken(token: string, deviceId: string): void {
    tokenMap.set(token, deviceId);
  }

  /**
   * Validate a bearer token.
   * Returns the deviceId that owns the token, or null if invalid.
   *
   * Demo: any token that matches 'demo-token-<suffix>' is accepted and
   * resolved to the mapped device. Unknown tokens are looked up in the
   * in-memory map only (no network/DB in demo mode).
   */
  async validateToken(token: string): Promise<string | null> {
    // Check static or registered demo token map first
    if (tokenMap.has(token)) {
      return tokenMap.get(token) ?? null;
    }

    // Support token prefix fg-tok-<deviceId>-...
    if (token.startsWith('fg-tok-')) {
      const devices = familyEngine.getState().devices;
      const matched = devices.find((d) => token.includes(d.id));
      if (matched) {
        tokenMap.set(token, matched.id);
        return matched.id;
      }
    }

    // Accept any demo-token-xxx and map it to the first device for flexibility
    if (token.startsWith(DEMO_TOKEN_PREFIX)) {
      const devices = familyEngine.getState().devices;
      if (devices.length > 0) {
        const deviceId = devices[0].id;
        tokenMap.set(token, deviceId);
        return deviceId;
      }
    }

    return null;
  }

  /**
   * Process an agent check-in:
   * 1. Update device last-seen / snapshot in the family store
   * 2. Run alert evaluation on the new snapshot
   * 3. Build and return the current policy + pending commands for the device
   */
  async processCheckin(
    deviceId: string,
    payload: AgentCheckinPayload
  ): Promise<AgentCheckinResponse> {
    const { snapshot, immediateEvents } = payload;

    // --- Update the store with fresh snapshot data ---
    const state = familyEngine.getState();
    const device = familyEngine.getDevice(deviceId);

    if (device) {
      // Evaluate alerts based on the incoming snapshot
      const newAlerts = evaluateAlerts(device, snapshot, state.alerts);
      // Inject new alerts into the engine (use internal method via cast)
      (familyEngine as unknown as { _injectAlerts(alerts: typeof newAlerts): void })
        ._injectAlerts?.(newAlerts);

      // Handle immediate events (e.g. policy_applied, policy_failed)
      for (const event of immediateEvents ?? []) {
        if (event.type === 'policy_applied') {
          const policy = state.policies.find((p) => p.deviceId === deviceId);
          if (policy) {
            familyEngine.updatePolicy(deviceId, {
              ...policy,
              state: 'active',
              lastAppliedAt: event.occurredAt,
              lastFailureReason: null,
            });
          }
        } else if (event.type === 'policy_failed') {
          const policy = state.policies.find((p) => p.deviceId === deviceId);
          if (policy) {
            familyEngine.updatePolicy(deviceId, {
              ...policy,
              state: 'failed',
              lastFailureReason: String(event.payload.reason ?? 'Unknown error'),
            });
          }
        }
      }

      // Update the device snapshot through the engine's internal mutator
      (familyEngine as unknown as { _updateSnapshot(deviceId: string, snapshot: HealthSnapshot): void })
        ._updateSnapshot?.(deviceId, snapshot);
    }

    // --- Build response ---
    const freshState = familyEngine.getState();
    const policy = freshState.policies.find((p) => p.deviceId === deviceId);

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

    const commands: AgentCommand[] = [];

    // If policy is pending, issue an apply_policy command
    if (policy?.state === 'pending') {
      commands.push({
        id: newId(),
        type: 'apply_policy',
        payload: { policy },
        issuedAt: Date.now(),
      });
    }

    return {
      policy: policy ?? defaultPolicy,
      commands,
    };
  }
}

// ---------------------------------------------------------------------------
// Token generator
// ---------------------------------------------------------------------------

/**
 * Generate a random device bearer token.
 * In production: cryptographically random bytes, stored as an argon2 hash.
 */
export function generateDeviceToken(): string {
  const bytes = new Uint8Array(24);
  // Node 19+ has globalThis.crypto; fall back to Math.random for older runtimes
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return 'dgt-' + Buffer.from(bytes).toString('base64url');
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const agentAdapter = new MockAgentAdapter();
