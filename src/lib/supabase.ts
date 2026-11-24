import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Undefined in local demo mode. The dashboard deliberately keeps its labelled
// simulation when cloud credentials have not been configured.
export const supabase = url && key ? createClient(url, key) : null;

export type CloudDevice = {
  id: string;
  hostname: string;
  ip_address: string | null;
  mac_address: string | null;
  operating_system: string | null;
  cpu_percent: number | null;
  memory_percent: number | null;
  disk_percent: number | null;
  last_heartbeat_at: string | null;
  status: 'pending' | 'online' | 'offline';
  department: string | null;
  lab: string | null;
  room: string | null;
  custodian: string | null;
  owner_name: string | null;
  asset_tag: string | null;
  notes: string | null;
  lifecycle_status: 'active' | 'maintenance' | 'retired';
};

export async function writeAuditEvent(event: {
  organizationId: string;
  action: string;
  entityType: 'device' | 'incident' | 'enrollment' | 'organization';
  deviceId?: string;
  incidentId?: string;
  details?: Record<string, unknown>;
}) {
  if (!supabase) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  // The RLS policy requires the signed-in actor and a membership in this org.
  await supabase.from('audit_events').insert({
    organization_id: event.organizationId, actor_id: user.id, action: event.action,
    entity_type: event.entityType, device_id: event.deviceId ?? null,
    incident_id: event.incidentId ?? null, details: event.details ?? {},
  });
}
