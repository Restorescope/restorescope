-- ============================================================================
-- RestoreScope Mitigation — Phase 1 Schema
-- 1-800 WATER DAMAGE of North Dakota
-- ============================================================================
-- Run this in the Supabase SQL editor for a fresh project.
-- Idempotent where reasonable; drop/recreate policies if rerunning.
-- ============================================================================

create extension if not exists "uuid-ossp";

-- ----------------------------------------------------------------------------
-- TENANTS
-- ----------------------------------------------------------------------------
create table if not exists tenants (
  id            uuid primary key default uuid_generate_v4(),
  company_name  text not null,
  branding      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- USERS (profile rows mirroring auth.users — keep tenant + role here)
-- ----------------------------------------------------------------------------
create table if not exists users (
  id          uuid primary key references auth.users(id) on delete cascade,
  tenant_id   uuid not null references tenants(id) on delete cascade,
  email       text not null,
  role        text not null check (role in ('owner','pm','technician')),
  full_name   text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_users_tenant on users(tenant_id);

-- Helper: current user's tenant_id (used in every RLS policy)
create or replace function current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from users where id = auth.uid();
$$;

create or replace function current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from users where id = auth.uid();
$$;

-- ----------------------------------------------------------------------------
-- SETTINGS (one row per tenant per setting_type, JSONB payload)
-- ----------------------------------------------------------------------------
create table if not exists settings (
  id            uuid primary key default uuid_generate_v4(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  setting_type  text not null,
  data          jsonb not null default '{}'::jsonb,
  updated_at    timestamptz not null default now(),
  unique (tenant_id, setting_type)
);
create index if not exists idx_settings_tenant on settings(tenant_id);

-- ----------------------------------------------------------------------------
-- JOBS
-- ----------------------------------------------------------------------------
create table if not exists jobs (
  id           uuid primary key default uuid_generate_v4(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  job_number   text not null,
  customer     jsonb not null default '{}'::jsonb,    -- name, phone, email, address...
  loss_info    jsonb not null default '{}'::jsonb,    -- claim#, carrier, DOL, category, class, source...
  status       text not null default 'draft' check (status in ('draft','in_progress','ready_for_review','finalized','unlocked')),
  created_by   uuid references users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  finalized_at timestamptz,
  unique (tenant_id, job_number)
);
create index if not exists idx_jobs_tenant on jobs(tenant_id);
create index if not exists idx_jobs_status on jobs(tenant_id, status);

-- ----------------------------------------------------------------------------
-- DRYING CHAMBERS
-- ----------------------------------------------------------------------------
create table if not exists drying_chambers (
  id              uuid primary key default uuid_generate_v4(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  job_id          uuid not null references jobs(id) on delete cascade,
  name            text not null,                       -- "Chamber 1"
  class_of_water  text check (class_of_water in ('1','2','3','4')),
  atmosphere_cuft numeric,
  reference_room  text,                                -- name of unaffected reference area
  created_at      timestamptz not null default now()
);
create index if not exists idx_chambers_job on drying_chambers(job_id);

-- ----------------------------------------------------------------------------
-- AFFECTED ROOMS
-- ----------------------------------------------------------------------------
create table if not exists affected_rooms (
  id            uuid primary key default uuid_generate_v4(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  job_id        uuid not null references jobs(id) on delete cascade,
  chamber_id    uuid references drying_chambers(id) on delete set null,
  room_name     text not null,
  materials     jsonb not null default '[]'::jsonb,    -- [{key, custom_label?}]
  actions       jsonb not null default '[]'::jsonb,    -- [{key, custom_label?}]
  reasons       jsonb not null default '[]'::jsonb,    -- [{key}]
  final_status  text,
  notes         text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_rooms_job on affected_rooms(job_id);

-- ----------------------------------------------------------------------------
-- WORK ITEMS (job-level activities not tied to a single room)
-- ----------------------------------------------------------------------------
create table if not exists work_items (
  id          uuid primary key default uuid_generate_v4(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  job_id      uuid not null references jobs(id) on delete cascade,
  work_type   text not null,                           -- 'extraction', 'containment', 'debris_removal', etc.
  title       text not null,                           -- "Holes behind baseboards"
  steps       jsonb not null default '[]'::jsonb,      -- ["Drill holes...", "..."]
  notes       text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_workitems_job on work_items(job_id);

-- ----------------------------------------------------------------------------
-- MOISTURE READINGS
-- ----------------------------------------------------------------------------
create table if not exists moisture_readings (
  id            uuid primary key default uuid_generate_v4(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  job_id        uuid not null references jobs(id) on delete cascade,
  room_id       uuid references affected_rooms(id) on delete cascade,
  chamber_id    uuid references drying_chambers(id) on delete set null,
  material_key  text,                                  -- 'drywall', 'framing', 'wood_sill_plate'...
  point_label   text,                                  -- "1.1", "2.2"
  meter_type    text,
  unit          text,                                  -- 'wme_pct', 'relative', 'temp_f', 'rh_pct', 'gpp'
  value         numeric,
  drying_goal   numeric,                               -- snapshotted from settings at capture
  is_reference  boolean not null default false,        -- unaffected dry comparison
  status        text check (status in ('wet','drying','dry')),
  notes         text,
  captured_at   timestamptz not null default now(),
  captured_by   uuid references users(id),
  created_at    timestamptz not null default now()
);
create index if not exists idx_readings_job on moisture_readings(job_id);
create index if not exists idx_readings_room on moisture_readings(room_id);

-- ----------------------------------------------------------------------------
-- EQUIPMENT EVENTS (placement / monitoring / removal as separate events)
-- ----------------------------------------------------------------------------
create table if not exists equipment_events (
  id              uuid primary key default uuid_generate_v4(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  job_id          uuid not null references jobs(id) on delete cascade,
  chamber_id      uuid references drying_chambers(id) on delete set null,
  room_id         uuid references affected_rooms(id) on delete set null,
  event_type      text not null check (event_type in ('placed','monitoring','removed')),
  equipment_type  text not null,                       -- 'lgr_dehu', 'axial_air_mover'...
  asset_label     text,                                -- friendly: "AIR MOVER 7"
  asset_id        text,                                -- serial number
  purpose         text,
  notes           text,
  event_at        timestamptz not null default now(),
  created_by      uuid references users(id),
  created_at      timestamptz not null default now()
);
create index if not exists idx_equip_job on equipment_events(job_id);
create index if not exists idx_equip_asset on equipment_events(job_id, asset_label);

-- ----------------------------------------------------------------------------
-- MONITORING VISITS (per-chamber daily checks with dehu performance)
-- ----------------------------------------------------------------------------
create table if not exists monitoring_visits (
  id                uuid primary key default uuid_generate_v4(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  job_id            uuid not null references jobs(id) on delete cascade,
  chamber_id        uuid references drying_chambers(id) on delete set null,
  visit_at          timestamptz not null default now(),
  ambient_temp_f    numeric,
  ambient_rh        numeric,
  ambient_gpp       numeric,
  dehu_intake_rh    numeric,
  dehu_intake_gpp   numeric,
  dehu_exhaust_gpp  numeric,
  grain_depression  numeric,                           -- intake_gpp - exhaust_gpp
  hours_running     numeric,
  notes             text,
  created_by        uuid references users(id),
  created_at        timestamptz not null default now()
);
create index if not exists idx_visits_job on monitoring_visits(job_id);

-- ----------------------------------------------------------------------------
-- PHOTOS
-- ----------------------------------------------------------------------------
create table if not exists photos (
  id             uuid primary key default uuid_generate_v4(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  job_id         uuid not null references jobs(id) on delete cascade,
  room_id        uuid references affected_rooms(id) on delete set null,
  work_item_id   uuid references work_items(id) on delete set null,
  reading_id     uuid references moisture_readings(id) on delete set null,
  category       text not null,                        -- 'source_area', 'final_dry_readings', etc.
  storage_path   text not null,                        -- bucket path
  caption        text,
  taken_at       timestamptz,
  uploaded_at    timestamptz not null default now(),
  uploaded_by    uuid references users(id)
);
create index if not exists idx_photos_job on photos(job_id);
create index if not exists idx_photos_room on photos(room_id);
create index if not exists idx_photos_category on photos(job_id, category);

-- ----------------------------------------------------------------------------
-- SCOPE ITEMS (justification per scope action, optionally per room)
-- ----------------------------------------------------------------------------
create table if not exists scope_items (
  id                    uuid primary key default uuid_generate_v4(),
  tenant_id             uuid not null references tenants(id) on delete cascade,
  job_id                uuid not null references jobs(id) on delete cascade,
  room_id               uuid references affected_rooms(id) on delete set null,
  scope_key             text not null,                 -- 'remove_drywall_flood_cut'
  reason_template_key   text,                          -- which preset reason
  reason_text           text,                          -- final wording (after picker / edit)
  quantity              numeric,
  unit                  text,
  created_at            timestamptz not null default now()
);
create index if not exists idx_scope_job on scope_items(job_id);

-- ----------------------------------------------------------------------------
-- REPORTS
-- ----------------------------------------------------------------------------
create table if not exists reports (
  id            uuid primary key default uuid_generate_v4(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  job_id        uuid not null references jobs(id) on delete cascade,
  status        text not null default 'draft' check (status in ('draft','finalized','unlocked')),
  pdf_path      text,
  generated_by  uuid references users(id),
  finalized_at  timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists idx_reports_job on reports(job_id);

-- ----------------------------------------------------------------------------
-- updated_at trigger
-- ----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_jobs_updated on jobs;
create trigger trg_jobs_updated before update on jobs
for each row execute function set_updated_at();

drop trigger if exists trg_settings_updated on settings;
create trigger trg_settings_updated before update on settings
for each row execute function set_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY — every table gates by tenant_id
-- ============================================================================
alter table tenants            enable row level security;
alter table users              enable row level security;
alter table settings           enable row level security;
alter table jobs               enable row level security;
alter table drying_chambers    enable row level security;
alter table affected_rooms     enable row level security;
alter table work_items         enable row level security;
alter table moisture_readings  enable row level security;
alter table equipment_events   enable row level security;
alter table monitoring_visits  enable row level security;
alter table photos             enable row level security;
alter table scope_items        enable row level security;
alter table reports            enable row level security;

-- TENANTS: a user can read/update only their own tenant
drop policy if exists tenants_select on tenants;
create policy tenants_select on tenants for select
  using (id = current_tenant_id());

drop policy if exists tenants_update on tenants;
create policy tenants_update on tenants for update
  using (id = current_tenant_id() and current_user_role() = 'owner');

-- USERS: users can see all users in their tenant; owner can manage
drop policy if exists users_select on users;
create policy users_select on users for select
  using (tenant_id = current_tenant_id());

drop policy if exists users_self_update on users;
create policy users_self_update on users for update
  using (id = auth.uid());

drop policy if exists users_owner_manage on users;
create policy users_owner_manage on users for all
  using (tenant_id = current_tenant_id() and current_user_role() = 'owner')
  with check (tenant_id = current_tenant_id() and current_user_role() = 'owner');

-- Generic per-tenant policy generator pattern. For each business table:
-- SELECT/INSERT/UPDATE/DELETE limited to current tenant. Technicians have
-- restricted finalize ability enforced at app layer; reads are tenant-wide.

-- Macro-ish: write policies for each table. Repetition is cheaper than abstraction here.

do $$
declare t text;
begin
  for t in select unnest(array[
    'settings','jobs','drying_chambers','affected_rooms','work_items',
    'moisture_readings','equipment_events','monitoring_visits',
    'photos','scope_items','reports'
  ]) loop
    execute format('drop policy if exists %I_tenant_all on %I', t, t);
    execute format($f$
      create policy %I_tenant_all on %I for all
      using (tenant_id = current_tenant_id())
      with check (tenant_id = current_tenant_id())
    $f$, t, t);
  end loop;
end$$;

-- ============================================================================
-- SIGNUP FLOW: when a new user signs up they create a tenant + owner user row.
-- We expose an RPC to keep the client simple and atomic.
-- ============================================================================
create or replace function bootstrap_tenant(
  p_company_name text,
  p_full_name    text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_email     text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  -- Refuse if this user already has a tenant
  if exists (select 1 from users where id = auth.uid()) then
    raise exception 'User already provisioned';
  end if;

  select email into v_email from auth.users where id = auth.uid();

  insert into tenants (company_name, branding)
  values (p_company_name, jsonb_build_object(
    'primary_color', '#0061AF',
    'accent_color',  '#FFF200',
    'phone',         '701-670-2022',
    'website',       '1800waterdamage.com/north-dakota',
    'tagline',       'Restoring What Matters Most™'
  ))
  returning id into v_tenant_id;

  insert into users (id, tenant_id, email, role, full_name)
  values (auth.uid(), v_tenant_id, v_email, 'owner', p_full_name);

  -- Seed default settings rows. Payload definitions live client-side in
  -- src/lib/defaults.js; we just create empty containers here so RLS reads work.
  insert into settings (tenant_id, setting_type, data) values
    (v_tenant_id, 'rooms',                 '{"items":[]}'::jsonb),
    (v_tenant_id, 'materials',             '{"items":[]}'::jsonb),
    (v_tenant_id, 'meters',                '{"items":[]}'::jsonb),
    (v_tenant_id, 'equipment',             '{"items":[]}'::jsonb),
    (v_tenant_id, 'work_item_types',       '{"items":[]}'::jsonb),
    (v_tenant_id, 'scope_library',         '{"items":[]}'::jsonb),
    (v_tenant_id, 'loss_sources',          '{"items":[]}'::jsonb),
    (v_tenant_id, 'material_drying_goals', '{"items":[]}'::jsonb),
    (v_tenant_id, 'qc_rules',              '{"rules":[]}'::jsonb);

  return v_tenant_id;
end;
$$;

grant execute on function bootstrap_tenant(text, text) to authenticated;

-- ============================================================================
-- STORAGE BUCKETS
-- ============================================================================
-- Run in Supabase dashboard or via supabase-js admin: create the following
-- private buckets:
--   job-photos
--   reading-photos
--   reports
--   tenant-assets
--
-- Then add storage policies (one set per bucket, all gated by tenant prefix):
--
-- create policy "tenant read" on storage.objects for select
--   using (bucket_id in ('job-photos','reading-photos','reports','tenant-assets')
--          and (storage.foldername(name))[1] = current_tenant_id()::text);
--
-- create policy "tenant write" on storage.objects for insert
--   with check (bucket_id in ('job-photos','reading-photos','reports','tenant-assets')
--               and (storage.foldername(name))[1] = current_tenant_id()::text);
--
-- create policy "tenant delete" on storage.objects for delete
--   using (bucket_id in ('job-photos','reading-photos','reports','tenant-assets')
--          and (storage.foldername(name))[1] = current_tenant_id()::text);
