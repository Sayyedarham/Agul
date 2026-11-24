// Supabase data layer for the FamilyGuard admin UI. Every function returns
// the canonical TS shapes from src/types/family.ts and degrades to empty
// results when Supabase is not configured (demo mode).

import { supabase } from './supabase.ts';
import type {
  DeviceAlert,
  EnrollmentCode,
  FamilyDevice,
  HealthSnapshot,
  ParentalPolicy,
} from '../types/family.ts';

// ------------------------------------------------------------------ mappers ---

const toEpoch = (v: string | null | undefined): number => (v ? Date.parse(v) : 0);

interface DeviceRow {
  id: string;
  nickname: string;
  device_name: string;
  child_name: string;
  child_avatar_color: string;
  windows_version: string | null;
  windows_build: string | null;
  device_model: string | null;
  serial_number: string | null;
  agent_version: string;
  is_online: boolean;
  effective_health_class: FamilyDevice['healthClass'];
  enrolled_at: string;
  last_sync_at: string;
  latest_snapshot: HealthSnapshot | null;
}

function mapDevice(row: DeviceRow): FamilyDevice {
  return {
    id: row.id,
    nickname: row.nickname,
    deviceName: row.device_name,
    childProfile: {
      id: row.id,
      name: row.child_name,
      avatarColor: row.child_avatar_color,
    },
    windowsVersion: row.windows_version ?? '',
    windowsBuild: row.windows_build ?? '',
    deviceModel: row.device_model ?? '',
    serialNumber: row.serial_number,
    agentVersion: row.agent_version,
    enrolledAt: toEpoch(row.enrolled_at),
    lastSyncAt: toEpoch(row.last_sync_at),
    online: row.is_online,
    healthClass: row.effective_health_class,
    latestSnapshot: row.latest_snapshot,
  };
}

interface AlertRow {
  id: string;
  device_id: string;
  rule_id: string;
  severity: DeviceAlert['severity'];
  message: string;
  dedup_key: string;
  acknowledged: boolean;
  resolved_at: string | null;
  created_at: string;
}

function mapAlert(row: AlertRow): DeviceAlert {
  return {
    id: row.id,
    deviceId: row.device_id,
    ruleId: row.rule_id,
    severity: row.severity,
    message: row.message,
    createdAt: toEpoch(row.created_at),
    resolvedAt: row.resolved_at ? Date.parse(row.resolved_at) : null,
    dedupKey: row.dedup_key,
    acknowledged: row.acknowledged,
  };
}

interface PolicyRow {
  device_id: string;
  bedtime_enabled: boolean;
  bedtime_start: string;
  bedtime_end: string;
  bedtime_days: number[];
  screen_time_limit_minutes: number | null;
  blocked_apps: string[];
  allowed_apps: string[] | null;
  usb_policy: ParentalPolicy['usbPolicy'];
  state: ParentalPolicy['state'];
  last_applied_at: string | null;
  last_failure_reason: string | null;
}

function mapPolicy(row: PolicyRow): ParentalPolicy {
  return {
    deviceId: row.device_id,
    bedtime: {
      enabled: row.bedtime_enabled,
      startTime: row.bedtime_start,
      endTime: row.bedtime_end,
      days: row.bedtime_days ?? [],
    },
    screenTimeLimitMinutes: row.screen_time_limit_minutes,
    blockedApps: row.blocked_apps ?? [],
    allowedApps: row.allowed_apps,
    usbPolicy: row.usb_policy,
    state: row.state,
    lastAppliedAt: row.last_applied_at ? Date.parse(row.last_applied_at) : null,
    lastFailureReason: row.last_failure_reason,
  };
}

interface CodeRow {
  family_id: string;
  code: string;
  created_at: string;
  expires_at: string;
  used: boolean;
  used_at: string | null;
  used_by_device_id: string | null;
}

function mapCode(row: CodeRow): EnrollmentCode {
  return {
    code: row.code,
    createdAt: toEpoch(row.created_at),
    expiresAt: toEpoch(row.expires_at),
    used: row.used,
    usedAt: row.used_at ? Date.parse(row.used_at) : null,
    usedByDeviceId: row.used_by_device_id,
    createdByParentId: row.family_id,
  };
}

// ------------------------------------------------------------------- reads ---

export async function fetchDevices(): Promise<FamilyDevice[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('family_device_overview')
    .select('*')
    .order('enrolled_at', { ascending: true });
  if (error) throw error;
  return (data as DeviceRow[]).map(mapDevice);
}

export async function fetchAlerts(): Promise<DeviceAlert[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('family_alerts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data as AlertRow[]).map(mapAlert);
}

export async function fetchPolicies(): Promise<ParentalPolicy[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('parental_policies').select('*');
  if (error) throw error;
  return (data as PolicyRow[]).map(mapPolicy);
}

export async function fetchEnrollmentCodes(): Promise<EnrollmentCode[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('family_enrollment_codes')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data as CodeRow[]).map(mapCode);
}

export async function fetchHistory(deviceId: string): Promise<HealthSnapshot[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('health_snapshots')
    .select('snapshot, collected_at')
    .eq('device_id', deviceId)
    .order('collected_at', { ascending: false })
    .limit(24);
  if (error) throw error;
  return (data as { snapshot: HealthSnapshot }[])
    .map((r) => r.snapshot)
    .reverse();
}

export async function ensureFamily(): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc('ensure_family');
  if (error) throw error;
}

// ------------------------------------------------------------------ writes ---

export async function resolveAlert(alertId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('family_alerts')
    .update({ resolved_at: new Date().toISOString(), acknowledged: true })
    .eq('id', alertId);
  if (error) throw error;
}

export async function savePolicy(
  deviceId: string,
  policy: ParentalPolicy,
): Promise<ParentalPolicy> {
  if (!supabase) return policy;
  const { error } = await supabase.from('parental_policies').upsert(
    {
      device_id: deviceId,
      bedtime_enabled: policy.bedtime.enabled,
      bedtime_start: policy.bedtime.startTime,
      bedtime_end: policy.bedtime.endTime,
      bedtime_days: policy.bedtime.days,
      screen_time_limit_minutes: policy.screenTimeLimitMinutes,
      blocked_apps: policy.blockedApps,
      allowed_apps: policy.allowedApps,
      usb_policy: policy.usbPolicy,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'device_id' },
  );
  if (error) throw error;
  const { data, error: readErr } = await supabase
    .from('parental_policies')
    .select('*')
    .eq('device_id', deviceId)
    .single();
  if (readErr || !data) return policy;
  return mapPolicy(data as PolicyRow);
}

export async function createEnrollmentCode(): Promise<EnrollmentCode> {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase.rpc('create_enrollment_code');
  if (error) throw error;
  return mapCode(data as CodeRow);
}

export async function revokeDevice(deviceId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('family_devices')
    .delete()
    .eq('id', deviceId);
  if (error) throw error;
}
