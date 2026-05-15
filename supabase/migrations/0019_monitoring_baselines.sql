-- Migration 0019 — Daily monitoring: outside, unaffected, dehu-out readings
--
-- Adds capture for the three baseline comparison readings industry-standard
-- for proving a drying chamber is actually drying:
--   - Outside: ambient outdoor temp/RH (with weather conditions)
--   - Unaffected: temp/RH from an unaffected area of the property
--   - Dehu-out: temp/RH at each dehumidifier's exhaust (one row per dehu per visit)
--
-- Outside + unaffected are one-per-visit (single value); stored on monitoring_visits.
-- Dehu-out readings are one-per-dehu-per-visit; need their own table.
--
-- All readings include auto-computed GPP from temp + RH (computed client-side).

-- ----------------------------------------------------------------------------
-- 1. Add outside + unaffected reading columns to monitoring_visits
-- ----------------------------------------------------------------------------
alter table monitoring_visits
  add column if not exists outside_temp_f       numeric,
  add column if not exists outside_rh           numeric,
  add column if not exists outside_gpp          numeric,
  add column if not exists weather_conditions   text,
  add column if not exists unaffected_temp_f    numeric,
  add column if not exists unaffected_rh        numeric,
  add column if not exists unaffected_gpp       numeric;

-- ----------------------------------------------------------------------------
-- 2. New table: monitoring_dehu_readings (one per dehu per visit)
-- ----------------------------------------------------------------------------
create table if not exists monitoring_dehu_readings (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  visit_id            uuid not null references monitoring_visits(id) on delete cascade,
  job_id              uuid not null references jobs(id) on delete cascade,
  -- Which dehu — identified by asset_label (e.g. "DEHU 1") since equipment_events
  -- doesn't have a single "equipment" record per asset; the label is the stable handle
  dehu_asset_label    text not null,
  reading_at          timestamptz not null default now(),
  exhaust_temp_f      numeric,
  exhaust_rh          numeric,
  exhaust_gpp         numeric,
  notes               text,
  created_by          uuid references users(id),
  created_at          timestamptz not null default now()
);

create index if not exists idx_dehu_readings_visit on monitoring_dehu_readings(visit_id);
create index if not exists idx_dehu_readings_job on monitoring_dehu_readings(job_id, reading_at desc);

alter table monitoring_dehu_readings enable row level security;

drop policy if exists "Tenant members read monitoring_dehu_readings" on monitoring_dehu_readings;
create policy "Tenant members read monitoring_dehu_readings"
on monitoring_dehu_readings for select to authenticated
using (tenant_id = current_tenant_id());

drop policy if exists "Tenant members write monitoring_dehu_readings" on monitoring_dehu_readings;
create policy "Tenant members write monitoring_dehu_readings"
on monitoring_dehu_readings for all to authenticated
using (tenant_id = current_tenant_id())
with check (tenant_id = current_tenant_id());

comment on table monitoring_dehu_readings is 'Per-dehu exhaust temp/RH/GPP readings, one per dehu per visit';
