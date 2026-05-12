-- Migration 0007 — Mold Screening module (corrected references)

-- Add screening flags to jobs
alter table jobs
  add column if not exists screening_enabled boolean not null default false;

alter table jobs
  add column if not exists screening_only boolean not null default false;

-- ============================================================================
-- screening_inspections
-- ============================================================================
create table if not exists screening_inspections (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  job_id          uuid not null references jobs(id) on delete cascade,
  scheduled_at    timestamptz,
  started_at      timestamptz,
  completed_at    timestamptz,
  reason_for_screening text,
  customer_concerns    text,
  reported_history     text,
  ambient_conditions   text,
  visual_inspection_notes text,
  scope            text,
  inspector_name   text,
  dog_name         text default 'Spore',
  status           text not null default 'scheduled' check (status in ('scheduled','in_progress','completed')),
  notes            text,
  created_by       uuid references users(id),
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),
  unique (job_id)
);

create index if not exists idx_screening_inspections_tenant on screening_inspections(tenant_id);
create index if not exists idx_screening_inspections_job on screening_inspections(job_id);

alter table screening_inspections enable row level security;

drop policy if exists "screening_inspections_select" on screening_inspections;
drop policy if exists "screening_inspections_insert" on screening_inspections;
drop policy if exists "screening_inspections_update" on screening_inspections;
drop policy if exists "screening_inspections_delete" on screening_inspections;

create policy "screening_inspections_select" on screening_inspections
  for select to authenticated using (tenant_id = current_tenant_id());
create policy "screening_inspections_insert" on screening_inspections
  for insert to authenticated with check (tenant_id = current_tenant_id());
create policy "screening_inspections_update" on screening_inspections
  for update to authenticated using (tenant_id = current_tenant_id());
create policy "screening_inspections_delete" on screening_inspections
  for delete to authenticated using (tenant_id = current_tenant_id());

-- ============================================================================
-- screening_alerts
-- ============================================================================
create table if not exists screening_alerts (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenants(id) on delete cascade,
  inspection_id      uuid not null references screening_inspections(id) on delete cascade,
  job_id             uuid not null references jobs(id) on delete cascade,
  room_id            uuid references affected_rooms(id) on delete set null,
  room_name          text,
  alert_strength     text check (alert_strength in ('strong','moderate','weak','negative')),
  alert_location     text,
  visible_signs      text,
  moisture_value     numeric(5,1),
  moisture_unit      text,
  thermal_observation text,
  wall_cavity_test_result text,
  notes              text,
  display_order      integer,
  recorded_at        timestamptz default now(),
  recorded_by        uuid references users(id),
  created_at         timestamptz default now()
);

create index if not exists idx_screening_alerts_inspection on screening_alerts(inspection_id);
create index if not exists idx_screening_alerts_job on screening_alerts(job_id);

alter table screening_alerts enable row level security;

drop policy if exists "screening_alerts_select" on screening_alerts;
drop policy if exists "screening_alerts_insert" on screening_alerts;
drop policy if exists "screening_alerts_update" on screening_alerts;
drop policy if exists "screening_alerts_delete" on screening_alerts;

create policy "screening_alerts_select" on screening_alerts
  for select to authenticated using (tenant_id = current_tenant_id());
create policy "screening_alerts_insert" on screening_alerts
  for insert to authenticated with check (tenant_id = current_tenant_id());
create policy "screening_alerts_update" on screening_alerts
  for update to authenticated using (tenant_id = current_tenant_id());
create policy "screening_alerts_delete" on screening_alerts
  for delete to authenticated using (tenant_id = current_tenant_id());

-- ============================================================================
-- screening_samples
-- ============================================================================
create table if not exists screening_samples (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenants(id) on delete cascade,
  inspection_id      uuid not null references screening_inspections(id) on delete cascade,
  job_id             uuid not null references jobs(id) on delete cascade,
  alert_id           uuid references screening_alerts(id) on delete set null,
  sample_id_label    text,
  sample_type        text not null check (sample_type in ('air','surface_tape','surface_swab','bulk','wall_cavity_air','outdoor_control')),
  location_label     text,
  collected_at       timestamptz,
  lab_name           text,
  chain_of_custody_no text,
  shipped_at         timestamptz,
  status             text not null default 'pending' check (status in ('pending','sent','received','reviewed')),
  result_summary     text,
  result_notes       text,
  result_received_at timestamptz,
  notes              text,
  display_order      integer,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

create index if not exists idx_screening_samples_inspection on screening_samples(inspection_id);

alter table screening_samples enable row level security;

drop policy if exists "screening_samples_select" on screening_samples;
drop policy if exists "screening_samples_insert" on screening_samples;
drop policy if exists "screening_samples_update" on screening_samples;
drop policy if exists "screening_samples_delete" on screening_samples;

create policy "screening_samples_select" on screening_samples
  for select to authenticated using (tenant_id = current_tenant_id());
create policy "screening_samples_insert" on screening_samples
  for insert to authenticated with check (tenant_id = current_tenant_id());
create policy "screening_samples_update" on screening_samples
  for update to authenticated using (tenant_id = current_tenant_id());
create policy "screening_samples_delete" on screening_samples
  for delete to authenticated using (tenant_id = current_tenant_id());

-- ============================================================================
-- screening_authorizations
-- ============================================================================
create table if not exists screening_authorizations (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenants(id) on delete cascade,
  inspection_id      uuid references screening_inspections(id) on delete cascade,
  job_id             uuid not null references jobs(id) on delete cascade,
  customer_name      text not null,
  customer_signature_data text,
  acknowledged       boolean not null default false,
  signed_at          timestamptz,
  ip_address         text,
  user_agent         text,
  form_version       text default '1.0',
  notes              text,
  created_at         timestamptz default now(),
  unique (job_id)
);

create index if not exists idx_screening_authorizations_inspection on screening_authorizations(inspection_id);

alter table screening_authorizations enable row level security;

drop policy if exists "screening_authorizations_select" on screening_authorizations;
drop policy if exists "screening_authorizations_insert" on screening_authorizations;
drop policy if exists "screening_authorizations_update" on screening_authorizations;
drop policy if exists "screening_authorizations_delete" on screening_authorizations;

create policy "screening_authorizations_select" on screening_authorizations
  for select to authenticated using (tenant_id = current_tenant_id());
create policy "screening_authorizations_insert" on screening_authorizations
  for insert to authenticated with check (tenant_id = current_tenant_id());
create policy "screening_authorizations_update" on screening_authorizations
  for update to authenticated using (tenant_id = current_tenant_id());
create policy "screening_authorizations_delete" on screening_authorizations
  for delete to authenticated using (tenant_id = current_tenant_id());