// FamilyGuard telemetry ingest. Called by the Python agent every 5 minutes
// with a Bearer device token. Writes the snapshot, evaluates alert rules
// with 4h dedup, and updates device health/liveness.

import { createClient } from 'npm:@supabase/supabase-js@2';
import type { HealthSnapshot } from './types.ts';
import { evaluateAlerts, classifyHealth, FOUR_HOURS_MS } from './alerts.ts';
import { sha256Hex } from './hash.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

function isValidSnapshot(body: unknown): body is HealthSnapshot {
  const s = body as Partial<HealthSnapshot>;
  if (!s || typeof s !== 'object') return false;
  if (typeof s.deviceId !== 'string' || s.deviceId.length === 0) return false;
  if (typeof s.collectedAt !== 'number' || !Number.isFinite(s.collectedAt)) return false;
  const battery = s.battery as Record<string, unknown> | undefined;
  const memory = s.memory as Record<string, unknown> | undefined;
  if (!battery || typeof battery.pct !== 'number') return false;
  if (!memory || typeof memory.totalGb !== 'number' || typeof memory.usedGb !== 'number') return false;
  if (!Array.isArray(s.storage)) return false;
  return true;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }
  if (request.method !== 'POST') {
    return Response.json({ error: 'method not allowed' }, { status: 405, headers: cors });
  }

  const auth = request.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) {
    return Response.json({ error: 'missing device token' }, { status: 401, headers: cors });
  }

  const body = await request.json().catch(() => null);
  if (!isValidSnapshot(body)) {
    return Response.json(
      { error: 'invalid snapshot: deviceId, collectedAt, battery, memory and storage are required' },
      { status: 400, headers: cors },
    );
  }

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) {
    return Response.json({ error: 'server misconfigured' }, { status: 500, headers: cors });
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const tokenHash = await sha256Hex(token);
  const { data: device } = await admin
    .from('family_devices')
    .select('id, family_id, last_sync_at, agent_version')
    .eq('device_token_hash', tokenHash)
    .maybeSingle();

  if (!device) {
    return Response.json({ error: 'unknown device token' }, { status: 401, headers: cors });
  }

  // Throttle: at most one snapshot per minute per device.
  const lastSyncMs = device.last_sync_at ? Date.parse(device.last_sync_at) : 0;
  if (Date.now() - lastSyncMs < 60_000) {
    return Response.json({ error: 'throttled, try again later' }, { status: 429, headers: cors });
  }

  const collectedAt = new Date(body.collectedAt).toISOString();

  // The authenticated device identity wins; deviceId from the body is ignored.
  const { error: snapErr } = await admin.from('health_snapshots').insert({
    device_id: device.id,
    snapshot: body,
    collected_at: collectedAt,
  });
  if (snapErr) {
    return Response.json({ error: snapErr.message }, { status: 500, headers: cors });
  }

  // Alert rules with 4h dedup against existing open alerts.
  const fourHoursAgo = new Date(Date.now() - FOUR_HOURS_MS).toISOString();
  const { data: openAlerts } = await admin
    .from('family_alerts')
    .select('dedup_key, created_at')
    .eq('device_id', device.id)
    .is('resolved_at', null)
    .gte('created_at', fourHoursAgo);

  const newAlerts = evaluateAlerts(
    device.id,
    body,
    (openAlerts ?? []).map((a) => ({
      dedupKey: a.dedup_key,
      createdAt: Date.parse(a.created_at),
    })),
  );

  if (newAlerts.length > 0) {
    const rows = newAlerts.map((a) => ({
      device_id: a.deviceId,
      rule_id: a.ruleId,
      severity: a.severity,
      message: a.message,
      dedup_key: a.dedupKey,
    }));
    await admin.from('family_alerts').insert(rows);
  }

  const update: Record<string, unknown> = {
    last_sync_at: new Date().toISOString(),
    online: true,
    health_class: classifyHealth(body),
  };
  if (typeof body.agentVersion === 'string' && body.agentVersion) {
    update.agent_version = body.agentVersion;
  }
  // Populate system info the parent sees on the dashboard, when the agent
  // reports it.
  const w = body.windowsHealth;
  if (w && typeof w.version === 'string') update.windows_version = w.version;
  if (w && typeof w.build === 'string') update.windows_build = w.build;
  if (body.deviceModel && typeof body.deviceModel === 'string') update.device_model = body.deviceModel;

  const { error: devErr } = await admin
    .from('family_devices')
    .update(update)
    .eq('id', device.id);
  if (devErr) {
    return Response.json({ error: devErr.message }, { status: 500, headers: cors });
  }

  return Response.json(
    { ok: true, serverTime: new Date().toISOString() },
    { headers: cors },
  );
});
