-- Run once in Supabase SQL Editor. Every row belongs to an institution.
create extension if not exists pgcrypto;

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);
create table if not exists organization_members (
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','operator','viewer')),
  primary key (organization_id, user_id)
);
create table if not exists devices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  hostname text not null,
  operating_system text,
  ip_address inet,
  mac_address macaddr,
  department text,
  lab text,
  room text,
  custodian text,
  owner_name text,
  asset_tag text,
  notes text,
  lifecycle_status text not null default 'active' check (lifecycle_status in ('active','maintenance','retired')),
  status text not null default 'pending' check (status in ('pending','online','offline')),
  cpu_percent numeric(5,2),
  memory_percent numeric(5,2),
  disk_percent numeric(5,2),
  uptime_seconds bigint,
  last_heartbeat_at timestamptz,
  reporting_token_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists enrollment_tokens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists telemetry (
  id bigint generated always as identity primary key,
  device_id uuid not null references devices(id) on delete cascade,
  cpu_percent numeric(5,2) not null,
  memory_percent numeric(5,2) not null,
  disk_percent numeric(5,2) not null,
  uptime_seconds bigint not null,
  network_rx_bytes bigint,
  network_tx_bytes bigint,
  collected_at timestamptz not null default now()
);
create table if not exists incidents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  device_id uuid references devices(id) on delete set null,
  severity text not null check (severity in ('critical','warning','info')),
  kind text not null,
  message text not null,
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users(id),
  assigned_to uuid references auth.users(id),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id),
  resolution_note text,
  created_at timestamptz not null default now()
);
create table if not exists audit_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  device_id uuid references devices(id) on delete set null,
  incident_id uuid references incidents(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null check (entity_type in ('device','incident','enrollment','organization')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Safe upgrades for projects that installed the first version of this schema.
alter table devices add column if not exists lab text;
alter table devices add column if not exists room text;
alter table devices add column if not exists custodian text;
alter table devices add column if not exists notes text;
alter table devices add column if not exists lifecycle_status text not null default 'active';
alter table incidents add column if not exists assigned_to uuid references auth.users(id);
alter table incidents add column if not exists resolved_at timestamptz;
alter table incidents add column if not exists resolved_by uuid references auth.users(id);
alter table incidents add column if not exists resolution_note text;
create index if not exists telemetry_device_collected_idx on telemetry(device_id, collected_at desc);
create index if not exists devices_org_status_idx on devices(organization_id, status);
create index if not exists audit_events_org_created_idx on audit_events(organization_id, created_at desc);

alter table organizations enable row level security;
alter table organization_members enable row level security;
alter table devices enable row level security;
alter table telemetry enable row level security;
alter table incidents enable row level security;
alter table enrollment_tokens enable row level security;
alter table audit_events enable row level security;

create or replace function member_of(org uuid) returns boolean language sql stable as $$
  select exists(select 1 from organization_members where organization_id = org and user_id = auth.uid())
$$;
create policy "members read devices" on devices for select using (member_of(organization_id));
create policy "operators update devices" on devices for update using (member_of(organization_id) and exists (select 1 from organization_members m where m.organization_id = devices.organization_id and m.user_id = auth.uid() and m.role in ('admin','operator')));
create policy "members read telemetry" on telemetry for select using (
  exists(select 1 from devices d where d.id = telemetry.device_id and member_of(d.organization_id))
);
create policy "members read incidents" on incidents for select using (member_of(organization_id));
create policy "operators update incidents" on incidents for update using (member_of(organization_id) and exists (select 1 from organization_members m where m.organization_id = incidents.organization_id and m.user_id = auth.uid() and m.role in ('admin','operator')));
create policy "members read audit events" on audit_events for select using (member_of(organization_id));
create policy "members write audit events" on audit_events for insert with check (member_of(organization_id) and actor_id = auth.uid());
create policy "admins manage enrollment tokens" on enrollment_tokens for all using (member_of(organization_id) and exists (select 1 from organization_members m where m.organization_id = enrollment_tokens.organization_id and m.user_id = auth.uid() and m.role = 'admin')) with check (member_of(organization_id));

alter publication supabase_realtime add table devices, incidents;


-- ============================================================================
-- FamilyGuard Platform Extensions (Windows Family Device Health & Parental Controls)
-- ============================================================================

create table if not exists family_accounts (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references auth.users(id) on delete cascade,
  family_name text not null default 'My Family',
  created_at timestamptz not null default now()
);

create table if not exists family_devices (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references family_accounts(id) on delete cascade,
  nickname text not null,
  device_name text not null,
  child_name text not null,
  child_avatar_color text not null default '#3b82f6',
  windows_version text,
  windows_build text,
  device_model text,
  serial_number text,
  agent_version text not null default '1.0.0',
  online boolean not null default false,
  health_class text not null default 'healthy' check (health_class in ('healthy','needs_attention','offline')),
  device_token_hash text not null,
  enrolled_at timestamptz not null default now(),
  last_sync_at timestamptz not null default now()
);

create table if not exists parental_policies (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references family_devices(id) on delete cascade unique,
  bedtime_enabled boolean not null default false,
  bedtime_start text not null default '21:30',
  bedtime_end text not null default '07:00',
  bedtime_days integer[] not null default array[0,1,2,3,4,5,6],
  screen_time_limit_minutes integer,
  blocked_apps text[] not null default array[]::text[],
  allowed_apps text[],
  usb_policy text not null default 'report' check (usb_policy in ('report','block')),
  state text not null default 'not_applied' check (state in ('active','pending','failed','not_applied')),
  last_applied_at timestamptz,
  last_failure_reason text,
  updated_at timestamptz not null default now()
);

create table if not exists health_snapshots (
  id bigint generated always as identity primary key,
  device_id uuid not null references family_devices(id) on delete cascade,
  snapshot jsonb not null,
  collected_at timestamptz not null default now()
);

create table if not exists family_alerts (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references family_devices(id) on delete cascade,
  rule_id text not null,
  severity text not null check (severity in ('critical','warning','info')),
  message text not null,
  dedup_key text not null,
  acknowledged boolean not null default false,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists family_enrollment_codes (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references family_accounts(id) on delete cascade,
  code text not null unique,
  expires_at timestamptz not null,
  used boolean not null default false,
  used_at timestamptz,
  used_by_device_id uuid references family_devices(id) on delete set null,
  created_at timestamptz not null default now()
);

-- RLS for Family tables
alter table family_accounts enable row level security;
alter table family_devices enable row level security;
alter table parental_policies enable row level security;
alter table health_snapshots enable row level security;
alter table family_alerts enable row level security;
alter table family_enrollment_codes enable row level security;

create policy "parents manage family account" on family_accounts
  for all using (parent_id = auth.uid()) with check (parent_id = auth.uid());

create policy "parents manage family devices" on family_devices
  for all using (
    exists (select 1 from family_accounts fa where fa.id = family_devices.family_id and fa.parent_id = auth.uid())
  ) with check (
    exists (select 1 from family_accounts fa where fa.id = family_devices.family_id and fa.parent_id = auth.uid())
  );

create policy "parents manage parental policies" on parental_policies
  for all using (
    exists (
      select 1 from family_devices fd
      join family_accounts fa on fa.id = fd.family_id
      where fd.id = parental_policies.device_id and fa.parent_id = auth.uid()
    )
  );

create policy "parents read health snapshots" on health_snapshots
  for select using (
    exists (
      select 1 from family_devices fd
      join family_accounts fa on fa.id = fd.family_id
      where fd.id = health_snapshots.device_id and fa.parent_id = auth.uid()
    )
  );

create policy "parents manage family alerts" on family_alerts
  for all using (
    exists (
      select 1 from family_devices fd
      join family_accounts fa on fa.id = fd.family_id
      where fd.id = family_alerts.device_id and fa.parent_id = auth.uid()
    )
  );

create policy "parents manage enrollment codes" on family_enrollment_codes
  for all using (
    exists (select 1 from family_accounts fa where fa.id = family_enrollment_codes.family_id and fa.parent_id = auth.uid())
  );

alter publication supabase_realtime add table family_devices, family_alerts, parental_policies;
