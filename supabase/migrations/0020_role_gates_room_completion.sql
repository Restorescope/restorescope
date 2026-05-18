-- Migration 0020 — Role-aware photo requirements + per-room completion gates
--
-- Adds role responsibility to photo requirements and per-room completion
-- tracking so the app can BLOCK techs from marking a room "done" if their
-- required photos are missing.
--
-- Two completion buckets per affected room:
--   tech_complete_at / tech_completed_by  — tech-required work is done
--   pm_complete_at   / pm_completed_by    — PM/Owner-required docs are done
--
-- Both must be set for the JOB to be eligible for "ready for review".
--
-- Override support: tenant members with role pm/owner can override a missing
-- requirement with a typed reason. Tech alone cannot override.

-- ----------------------------------------------------------------------------
-- 1. Add required_role to photo_requirements
-- ----------------------------------------------------------------------------
alter table photo_requirements
  add column if not exists required_role text not null default 'any'
    check (required_role in ('any', 'tech_required', 'pm_required'));

comment on column photo_requirements.required_role is
  '''any'' = anyone can satisfy (counts toward all completion buckets), '
  '''tech_required'' = blocks tech_complete only, '
  '''pm_required'' = blocks pm_complete only';

-- ----------------------------------------------------------------------------
-- 2. Assign roles to existing system requirements
-- ----------------------------------------------------------------------------
-- TECH-REQUIRED: demo/removal sequence + cleaning
update photo_requirements
  set required_role = 'tech_required'
  where tenant_id is null
    and key in (
      'work_drywall_before', 'work_drywall_cut_line', 'work_drywall_after',
      'work_carpet_before', 'work_pad_before', 'work_tack_strip',
      'work_subfloor_exposed_carpet', 'work_baseboard_before', 'work_baseboard_after',
      'work_cabinet_before', 'work_cabinet_after', 'work_cabinet_dryout',
      'work_hardwood_before', 'work_hardwood_after',
      'work_vinyl_before', 'work_vinyl_after',
      'work_tile_before', 'work_tile_scraper', 'work_tile_after',
      'work_concrete_before', 'work_concrete_grinder', 'work_concrete_after',
      'work_subfloor_before', 'work_subfloor_after',
      'work_insul_before', 'work_insul_after', 'work_insul_machine',
      'work_ceiling_before', 'work_ceiling_after',
      'work_trim_before', 'work_trim_after',
      'room_cat2_antimicrobial_app', 'room_cat2_hepa_vac',
      'room_cat2_detail_clean', 'room_cat2_antimicrobial_label',
      'room_cat3_containment', 'room_cat3_ppe_full', 'room_cat3_sanitization',
      'room_cat2_worker_ppe'
    );

-- PM-REQUIRED: property docs, overviews, readings docs, pre-existing, debris
update photo_requirements
  set required_role = 'pm_required'
  where tenant_id is null
    and key in (
      'job_front_property',
      'job_signed_cos',
      'room_overview',
      'room_initial_reading',
      'room_final_dry',
      'room_final_condition',
      'work_pad_reading', 'work_subfloor_reading_carpet',
      'work_hardwood_subfloor_read', 'work_vinyl_subfloor_read',
      'work_subfloor_reading', 'work_ceiling_reading',
      'room_class3_cavity_reading', 'room_class3_weep_hole',
      'cond_pre_existing',
      'job_cat3_disposal'
    );

-- Everything else remains 'any' (default): daily monitoring, equipment placement,
-- spider box, asset tags, thermal, particulate, ambient RH, specialty drying, etc.
-- These can be captured by anyone and don't gate either role's completion.

-- ----------------------------------------------------------------------------
-- 3. Add completion tracking to affected_rooms
-- ----------------------------------------------------------------------------
alter table affected_rooms
  add column if not exists tech_complete_at   timestamptz,
  add column if not exists tech_completed_by  uuid references users(id),
  add column if not exists pm_complete_at     timestamptz,
  add column if not exists pm_completed_by    uuid references users(id);

create index if not exists idx_rooms_tech_complete on affected_rooms(job_id) where tech_complete_at is not null;
create index if not exists idx_rooms_pm_complete   on affected_rooms(job_id) where pm_complete_at is not null;

-- ----------------------------------------------------------------------------
-- 4. Override log — typed-reason audit trail
-- ----------------------------------------------------------------------------
create table if not exists room_completion_overrides (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  job_id          uuid not null references jobs(id) on delete cascade,
  room_id         uuid not null references affected_rooms(id) on delete cascade,
  side            text not null check (side in ('tech', 'pm')),  -- which bucket was overridden
  reason          text not null,
  missing_keys    text[] default '{}'::text[],                   -- requirement keys skipped
  created_by      uuid references users(id),
  created_at      timestamptz not null default now()
);

create index if not exists idx_room_overrides_job on room_completion_overrides(job_id, created_at desc);

alter table room_completion_overrides enable row level security;

drop policy if exists "Tenant members read room_completion_overrides" on room_completion_overrides;
create policy "Tenant members read room_completion_overrides"
on room_completion_overrides for select to authenticated
using (tenant_id = current_tenant_id());

drop policy if exists "Tenant PM/Owner write room_completion_overrides" on room_completion_overrides;
create policy "Tenant PM/Owner write room_completion_overrides"
on room_completion_overrides for all to authenticated
using (
  tenant_id = current_tenant_id()
  and exists (select 1 from users where users.id = auth.uid() and users.role in ('owner','pm'))
)
with check (
  tenant_id = current_tenant_id()
  and exists (select 1 from users where users.id = auth.uid() and users.role in ('owner','pm'))
);

comment on table room_completion_overrides is
  'Audit trail of overrides used when a room was marked complete despite missing required photos. PM/Owner only.';
