-- FamilyGuard MVP: Supabase-hosted family device health platform.
-- Additive over supabase/schema.sql (which may or may not have been run),
-- so every statement is idempotent and fresh local DBs work out of the box.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- tables ---
-- Re-declared from supabase/schema.sql so a fresh `supabase db reset` works.
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

-- A device that has never reported telemetry must not count as "just synced",
-- otherwise the very first ingest (moments after enrollment) would be throttled.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'family_devices'
      and column_name = 'last_sync_at' and column_default is not null
  ) then
    alter table family_devices alter column last_sync_at drop default;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'family_devices'
      and column_name = 'last_sync_at' and is_nullable = 'NO'
  ) then
    alter table family_devices alter column last_sync_at drop not null;
  end if;
end $$;

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

-- One family row per parent (needed by ensure_family).
create unique index if not exists family_accounts_parent_unique on family_accounts(parent_id);

-- ---------------------------------------------------------------- indexes ---
create index if not exists health_snapshots_device_collected_idx
  on health_snapshots(device_id, collected_at desc);
create index if not exists family_alerts_device_dedup_created_idx
  on family_alerts(device_id, dedup_key, created_at desc);

-- ------------------------------------------------------------------ view ---
-- Admin read model. security_invoker so RLS on the underlying tables is
-- enforced for whatever role queries it (an authenticated parent only ever
-- sees rows for their own family). device_token_hash is intentionally
-- not exposed.
create or replace view family_device_overview
with (security_invoker = true) as
select
  d.id,
  d.family_id,
  d.nickname,
  d.device_name,
  d.child_name,
  d.child_avatar_color,
  d.windows_version,
  d.windows_build,
  d.device_model,
  d.serial_number,
  d.agent_version,
  d.online,
  d.health_class,
  d.enrolled_at,
  d.last_sync_at,
  (now() - d.last_sync_at < interval '20 minutes') as is_online,
  case
    when (now() - d.last_sync_at < interval '20 minutes') then d.health_class
    else 'offline'::text
  end as effective_health_class,
  ls.snapshot as latest_snapshot,
  ls.collected_at as latest_snapshot_at
from family_devices d
left join lateral (
  select s.snapshot, s.collected_at
  from health_snapshots s
  where s.device_id = d.id
  order by s.collected_at desc
  limit 1
) ls on true;

-- ------------------------------------------------------------------ RPCs ---
-- Called by the admin frontend (user JWT).
create or replace function ensure_family()
returns family_accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row family_accounts;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  insert into family_accounts (parent_id)
  values (auth.uid())
  on conflict (parent_id) do nothing;
  select * into v_row from family_accounts where parent_id = auth.uid() limit 1;
  return v_row;
end;
$$;

create or replace function create_enrollment_code()
returns family_enrollment_codes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family family_accounts;
  v_code text := '';
  v_row family_enrollment_codes;
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  select * into v_family from family_accounts where parent_id = auth.uid() limit 1;
  if v_family.id is null then
    raise exception 'family not found for this user';
  end if;
  loop
    v_code := '';
    for i in 1..8 loop
      v_code := v_code || substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1);
    end loop;
    exit when not exists (select 1 from family_enrollment_codes where code = v_code);
  end loop;
  insert into family_enrollment_codes (family_id, code, expires_at)
  values (v_family.id, v_code, now() + interval '15 minutes')
  returning * into v_row;
  return v_row;
end;
$$;

-- Called by the enroll Edge Function (service role): atomically validates and
-- claims the code, creates the device, links the code to it. The
-- update-returning claim takes a row lock, so two PCs can never consume the
-- same code.
create or replace function enroll_device(
  p_code text,
  p_device_name text,
  p_nickname text,
  p_token_hash text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code family_enrollment_codes;
  v_device family_devices;
begin
  update family_enrollment_codes
     set used = true,
         used_at = now()
   where code = upper(trim(p_code))
     and used = false
     and expires_at > now()
  returning * into v_code;

  if v_code.id is null then
    raise exception 'invalid, used or expired enrollment code';
  end if;

  insert into family_devices (family_id, nickname, device_name, child_name, device_token_hash)
  values (
    v_code.family_id,
    coalesce(nullif(trim(p_nickname), ''), p_device_name),
    p_device_name,
    coalesce(nullif(trim(p_nickname), ''), p_device_name),
    p_token_hash
  )
  returning * into v_device;

  insert into parental_policies (device_id) values (v_device.id);

  update family_enrollment_codes
     set used_by_device_id = v_device.id
   where id = v_code.id;

  return json_build_object('device_id', v_device.id, 'family_id', v_code.family_id);
end;
$$;

-- Execute grants: authenticated users only (anon gets nothing). The enroll
-- Edge Function runs as service_role, which needs execute on enroll_device.
revoke execute on function ensure_family() from public;
revoke execute on function create_enrollment_code() from public;
revoke execute on function enroll_device(text, text, text, text) from public;
grant execute on function ensure_family() to authenticated;
grant execute on function create_enrollment_code() to authenticated;
grant execute on function enroll_device(text, text, text, text) to authenticated;
grant execute on function enroll_device(text, text, text, text) to service_role;

-- ------------------------------------------------------------------- RLS ---
alter table family_accounts enable row level security;
alter table family_devices enable row level security;
alter table parental_policies enable row level security;
alter table health_snapshots enable row level security;
alter table family_alerts enable row level security;
alter table family_enrollment_codes enable row level security;

drop policy if exists "parents manage family account" on family_accounts;
create policy "parents manage family account" on family_accounts
  for all using (parent_id = auth.uid()) with check (parent_id = auth.uid());

drop policy if exists "parents manage family devices" on family_devices;
create policy "parents manage family devices" on family_devices
  for all
  using (
    exists (select 1 from family_accounts fa where fa.id = family_devices.family_id and fa.parent_id = auth.uid())
  )
  with check (
    exists (select 1 from family_accounts fa where fa.id = family_devices.family_id and fa.parent_id = auth.uid())
  );

drop policy if exists "parents manage parental policies" on parental_policies;
create policy "parents manage parental policies" on parental_policies
  for all
  using (
    exists (
      select 1 from family_devices fd
      join family_accounts fa on fa.id = fd.family_id
      where fd.id = parental_policies.device_id and fa.parent_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from family_devices fd
      join family_accounts fa on fa.id = fd.family_id
      where fd.id = parental_policies.device_id and fa.parent_id = auth.uid()
    )
  );

-- Snapshots are append-only telemetry: parents may read, but only the
-- service-role ingest Edge Function writes. Deliberately NO insert/update/
-- delete policy here.
drop policy if exists "parents read health snapshots" on health_snapshots;
create policy "parents read health snapshots" on health_snapshots
  for select using (
    exists (
      select 1 from family_devices fd
      join family_accounts fa on fa.id = fd.family_id
      where fd.id = health_snapshots.device_id and fa.parent_id = auth.uid()
    )
  );

drop policy if exists "parents manage family alerts" on family_alerts;
create policy "parents manage family alerts" on family_alerts
  for all
  using (
    exists (
      select 1 from family_devices fd
      join family_accounts fa on fa.id = fd.family_id
      where fd.id = family_alerts.device_id and fa.parent_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from family_devices fd
      join family_accounts fa on fa.id = fd.family_id
      where fd.id = family_alerts.device_id and fa.parent_id = auth.uid()
    )
  );

drop policy if exists "parents manage enrollment codes" on family_enrollment_codes;
create policy "parents manage enrollment codes" on family_enrollment_codes
  for all
  using (
    exists (select 1 from family_accounts fa where fa.id = family_enrollment_codes.family_id and fa.parent_id = auth.uid())
  )
  with check (
    exists (select 1 from family_accounts fa where fa.id = family_enrollment_codes.family_id and fa.parent_id = auth.uid())
  );

-- ------------------------------------------------------------- realtime ---
-- Parity with supabase/schema.sql (guarded: may already be a member).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table family_devices, family_alerts, parental_policies;
    exception when duplicate_object then
      null;
    end;
  end if;
end;
$$;

-- ------------------------------------------------------------- cleanup ---
-- Free tier DB is 500 MB; ~3-5 MB/day of snapshots for a few devices, so
-- prune anything older than 30 days nightly. Skipped automatically when
-- pg_cron is not enabled on the hosted project.
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron unavailable, skipping snapshot cleanup job: %', sqlerrm;
  end;
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and not exists (select 1 from cron.job where jobname = 'familyguard-snapshot-cleanup') then
    perform cron.schedule(
      'familyguard-snapshot-cleanup',
      '0 3 * * *',
      $cmd$delete from health_snapshots where collected_at < now() - interval '30 days'$cmd$
    );
  end if;
end;
$$;
