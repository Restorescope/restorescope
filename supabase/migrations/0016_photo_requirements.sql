-- Migration 0016 — Photo requirements engine
--
-- Establishes a server-side definition of "what photos are required for this
-- job" so the app can show techs a real-time checklist + compute documentation
-- health scores.
--
-- Two tables:
--   photo_requirements         -- catalog of requirements (system + per-tenant)
--   photo_requirement_overrides -- per-job overrides ("not applicable" with reason)
--
-- Plus a tiny per-job state column:
--   jobs.work_types_performed  -- text[] of manually-checked work types
--   jobs.photo_requirements_enabled -- bool toggle (default true for new jobs)

-- ----------------------------------------------------------------------------
-- 1. Per-job state: which work types and whether requirements are enforced
-- ----------------------------------------------------------------------------
alter table jobs
  add column if not exists work_types_performed text[] default '{}'::text[],
  add column if not exists photo_requirements_enabled boolean default true;

-- Existing jobs default to false so they don't get flagged retroactively.
-- New jobs created from now on default to true (via the column default).
update jobs set photo_requirements_enabled = false
where photo_requirements_enabled is null
   or created_at < now() - interval '1 minute';

-- ----------------------------------------------------------------------------
-- 2. photo_requirements catalog
-- ----------------------------------------------------------------------------
-- Each row is one requirement. The applies_when JSONB controls when the
-- requirement fires for a given job:
--   { "always": true }                          // universal
--   { "water_category": [2, 3] }                // fires if cat IS 2 or 3
--   { "water_class": [3, 4] }                   // fires if class IS 3 or 4
--   { "has_work": ["drywall_removal"] }         // fires if work performed includes drywall_removal
--   { "any_of": [{...}, {...}] }                // logical OR of nested conditions
--   { "all_of": [{...}, {...}] }                // logical AND
--
-- min_count is the BASE minimum. Modifiers:
--   per_room: true                              // multiply by # affected rooms
--   per_equipment: true                         // multiply by # equipment units
--   per_day: true                               // multiply by # days on site (later)
--
-- caption_keywords is used to discriminate within a category. For example,
-- both "HEPA vacuuming" and "antimicrobial" go under category 'cleaning',
-- but they need different captions to be matched as different requirements.

create table if not exists photo_requirements (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid references tenants(id) on delete cascade,    -- null = system default
  key               text not null,                                     -- 'universal_source_area'
  label             text not null,                                     -- "Source area photo"
  description       text,                                              -- helper text for techs
  category          text not null,                                     -- one of PHOTO_CATEGORIES keys
  caption_keywords  text[] default '{}'::text[],                       -- ['hepa', 'vacuum'] (lowercase)
  min_count         int  not null default 1,
  per_room          boolean default false,
  per_equipment     boolean default false,
  per_day           boolean default false,
  severity          text not null default 'required' check (severity in ('required','recommended')),
  applies_when      jsonb not null default '{"always": true}'::jsonb,
  sort_order        int  not null default 100,
  active            boolean default true,
  created_at        timestamptz not null default now(),
  unique (tenant_id, key)
);

create index if not exists idx_photoreq_tenant on photo_requirements(tenant_id) where active;
create index if not exists idx_photoreq_category on photo_requirements(category);

-- RLS — tenant members read tenant + system rows; owners can write their tenant rows
alter table photo_requirements enable row level security;

drop policy if exists "Tenant members read photo_requirements" on photo_requirements;
create policy "Tenant members read photo_requirements"
on photo_requirements for select to authenticated
using (tenant_id is null or tenant_id = current_tenant_id());

drop policy if exists "Tenant owners write photo_requirements" on photo_requirements;
create policy "Tenant owners write photo_requirements"
on photo_requirements for all to authenticated
using (
  tenant_id = current_tenant_id()
  and exists (select 1 from users where users.id = auth.uid() and users.role = 'owner')
)
with check (
  tenant_id = current_tenant_id()
  and exists (select 1 from users where users.id = auth.uid() and users.role = 'owner')
);

-- ----------------------------------------------------------------------------
-- 3. photo_requirement_overrides — per-job "not applicable" exceptions
-- ----------------------------------------------------------------------------
create table if not exists photo_requirement_overrides (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  job_id            uuid not null references jobs(id) on delete cascade,
  requirement_key   text not null,                            -- matches photo_requirements.key
  reason            text not null,                            -- mandatory explanation
  created_by        uuid references users(id),
  created_at        timestamptz not null default now(),
  unique (job_id, requirement_key)
);

create index if not exists idx_reqoverride_job on photo_requirement_overrides(job_id);

alter table photo_requirement_overrides enable row level security;

drop policy if exists "Tenant members read overrides" on photo_requirement_overrides;
create policy "Tenant members read overrides"
on photo_requirement_overrides for select to authenticated
using (tenant_id = current_tenant_id());

drop policy if exists "Tenant members write overrides" on photo_requirement_overrides;
create policy "Tenant members write overrides"
on photo_requirement_overrides for all to authenticated
using (tenant_id = current_tenant_id())
with check (tenant_id = current_tenant_id());

-- ----------------------------------------------------------------------------
-- 4. Seed the system requirements (tenant_id = null = global default)
-- ----------------------------------------------------------------------------
-- Note: severity='required' means counts against the doc score;
-- 'recommended' shows in the checklist but doesn't drop the score.

insert into photo_requirements (tenant_id, key, label, description, category, caption_keywords, min_count, per_room, per_equipment, per_day, severity, applies_when, sort_order)
values
  -- UNIVERSAL (every water mit job)
  (null, 'universal_front_property', 'Front of property', 'Exterior shot of the building, street view, address visible if possible.', 'front_property', '{}', 1, false, false, false, 'required', '{"always": true}'::jsonb, 100),
  (null, 'universal_source_area', 'Source area', 'Photo of the actual leak/water entry point — appliance, pipe, ceiling, etc.', 'source_area', '{}', 1, false, false, false, 'required', '{"always": true}'::jsonb, 110),
  (null, 'universal_affected_overview', 'Affected area overview', 'Wide shot of each affected room taken from the doorway.', 'affected_overview', '{}', 1, true, false, false, 'required', '{"always": true}'::jsonb, 120),
  (null, 'universal_initial_readings', 'Initial moisture readings', 'Moisture meter readings on actual wet materials. One per affected room minimum.', 'moisture_readings', '{}', 1, true, false, false, 'required', '{"always": true}'::jsonb, 130),
  (null, 'universal_equipment_placement', 'Equipment placement', 'Each piece of equipment in its placed location.', 'equipment_placement', '{}', 1, false, true, false, 'required', '{"always": true}'::jsonb, 140),
  (null, 'universal_asset_tags', 'Asset tag close-ups', 'Close-up of each equipment piece''s asset tag.', 'equipment_placement', '{"asset","tag"}', 1, false, true, false, 'required', '{"always": true}'::jsonb, 141),
  (null, 'universal_spider_box', 'Spider box / power distribution', 'Photo of the spider box in use.', 'equipment_placement', '{"spider","box","power"}', 1, false, false, false, 'recommended', '{"always": true}'::jsonb, 145),
  (null, 'universal_spider_cable', 'Spider box cable management', 'How cables are run from the spider box.', 'equipment_placement', '{"cable","cord"}', 1, false, false, false, 'recommended', '{"always": true}'::jsonb, 146),
  (null, 'universal_daily_monitoring', 'Daily monitoring readings', 'Per-day documentation of readings + ambient conditions.', 'daily_monitoring', '{}', 1, false, false, true, 'required', '{"always": true}'::jsonb, 150),
  (null, 'universal_ambient_rh', 'Ambient / RH readings', 'Thermo-hygrometer showing ambient temp + relative humidity.', 'daily_monitoring', '{"ambient","rh","humidity"}', 1, false, false, true, 'recommended', '{"always": true}'::jsonb, 151),
  (null, 'universal_thermal', 'Thermal imaging (FLIR)', 'Thermal/IR camera shots if available.', 'daily_monitoring', '{"thermal","flir","ir "}', 1, false, false, false, 'recommended', '{"always": true}'::jsonb, 152),
  (null, 'universal_final_dry', 'Final dry readings', 'Meter readings showing drying goals were met.', 'final_dry', '{}', 1, true, false, false, 'required', '{"always": true}'::jsonb, 160),
  (null, 'universal_final_condition', 'Final condition', 'Cleaned, dried room ready for handoff.', 'final_condition', '{}', 1, true, false, false, 'required', '{"always": true}'::jsonb, 170),
  (null, 'universal_signed_cos', 'Customer authorization (COS)', 'Photo of the signed scope of work or authorization document.', 'front_property', '{"cos","auth","signed","scope"}', 1, false, false, false, 'recommended', '{"always": true}'::jsonb, 105),

  -- CATEGORY 2 (gray water)
  (null, 'cat2_antimicrobial_app', 'Antimicrobial application', 'Antimicrobial being sprayed or applied.', 'cleaning', '{"antimicrobial","antimic"}', 1, false, false, false, 'required', '{"water_category": ["2","3"]}'::jsonb, 200),
  (null, 'cat2_antimicrobial_label', 'Antimicrobial bottle/label', 'Photo showing the brand/SDS name of the chemical.', 'cleaning', '{"antimicrobial","label","bottle"}', 1, false, false, false, 'required', '{"water_category": ["2","3"]}'::jsonb, 201),
  (null, 'cat2_hepa_vac', 'HEPA vacuuming', 'Tech using HEPA vacuum on affected surfaces.', 'cleaning', '{"hepa","vacuum","vac"}', 1, false, false, false, 'required', '{"water_category": ["2","3"]}'::jsonb, 202),
  (null, 'cat2_detail_clean', 'Detail cleaning', 'Wiping/cleaning of affected surfaces.', 'cleaning', '{"detail","wipe","clean"}', 1, false, false, false, 'required', '{"water_category": ["2","3"]}'::jsonb, 203),
  (null, 'cat2_worker_ppe', 'Worker in PPE', 'Tech wearing proper personal protective gear.', 'cleaning', '{"ppe","tyvek","respirator","gloves"}', 1, false, false, false, 'required', '{"water_category": ["2","3"]}'::jsonb, 204),

  -- CATEGORY 3 (sewage / black water)
  (null, 'cat3_containment', 'Containment setup', 'Plastic sheeting or zipwalls for containment zone.', 'containment', '{}', 1, false, false, false, 'required', '{"water_category": ["3"]}'::jsonb, 250),
  (null, 'cat3_ppe_full', 'Full PPE (Tyvek + respirator)', 'Tech fully suited in Tyvek + respirator.', 'containment', '{"tyvek","respirator","ppe"}', 1, false, false, false, 'required', '{"water_category": ["3"]}'::jsonb, 251),
  (null, 'cat3_hepa_scrubber', 'HEPA air scrubber placement', 'Each HEPA air scrubber placement.', 'equipment_placement', '{"hepa","scrubber","afd"}', 1, false, false, false, 'required', '{"water_category": ["3"]}'::jsonb, 252),
  (null, 'cat3_negative_air', 'Negative air machine setup', 'Negative air machine with ducting visible.', 'equipment_placement', '{"negative","air","afd"}', 1, false, false, false, 'recommended', '{"water_category": ["3"]}'::jsonb, 253),
  (null, 'cat3_sanitization', 'Sanitization process', 'Final sanitizing/disinfection pass.', 'cleaning', '{"sanit","disinfect"}', 1, false, false, false, 'required', '{"water_category": ["3"]}'::jsonb, 254),
  (null, 'cat3_disposal', 'Affected material disposal', 'Bagged/contained materials being disposed.', 'debris', '{}', 1, false, false, false, 'required', '{"water_category": ["3"]}'::jsonb, 255),

  -- CLASS 3
  (null, 'class3_wall_cavity', 'Wall cavity moisture readings', 'Meter reading inside wall cavity through weep/drilled hole.', 'moisture_readings', '{"cavity","wall"}', 1, false, false, false, 'required', '{"water_class": ["3","4"]}'::jsonb, 300),
  (null, 'class3_weep_hole', 'Drilled hole / weep hole', 'Drilled hole used for wall cavity drying access.', 'moisture_readings', '{"weep","hole","drill"}', 1, false, false, false, 'recommended', '{"water_class": ["3","4"]}'::jsonb, 301),

  -- CLASS 4
  (null, 'class4_specialty_drying', 'Specialty drying equipment', 'Heat drying system, desiccant, or other specialty unit.', 'equipment_placement', '{"specialty","heat","desiccant"}', 1, false, false, false, 'required', '{"water_class": ["4"]}'::jsonb, 350),
  (null, 'class4_drying_mat', 'Drying mat / Injectidry', 'Drying mat setup (Injectidry, RAMair, etc.).', 'equipment_placement', '{"mat","injectidry","ramair"}', 1, false, false, false, 'recommended', '{"water_class": ["4"]}'::jsonb, 351),
  (null, 'class4_cavity_tubes', 'Wall cavity drying tubes', 'Tubes installed in wall cavities for forced drying.', 'equipment_placement', '{"tube","cavity"}', 1, false, false, false, 'recommended', '{"water_class": ["4"]}'::jsonb, 352),

  -- DRYWALL REMOVAL
  (null, 'work_drywall_before', 'Drywall before cut', 'Drywall in place with cut line marked.', 'before_removal', '{"drywall"}', 1, false, false, false, 'required', '{"has_work": ["drywall_removal"]}'::jsonb, 400),
  (null, 'work_drywall_cut_line', 'Flood cut line visible', 'The cut line on the wall before cutting.', 'before_removal', '{"flood","cut","line"}', 1, false, false, false, 'recommended', '{"has_work": ["drywall_removal"]}'::jsonb, 401),
  (null, 'work_drywall_after', 'Drywall cavity exposed', 'Wall cavity after drywall has been removed.', 'exposed_after', '{"drywall","cavity"}', 1, false, false, false, 'required', '{"has_work": ["drywall_removal"]}'::jsonb, 402),

  -- CARPET REMOVAL
  (null, 'work_carpet_before', 'Carpet before removal', 'Carpet in place.', 'before_removal', '{"carpet"}', 1, false, false, false, 'required', '{"has_work": ["carpet_removal"]}'::jsonb, 410),
  (null, 'work_pad_before', 'Carpet pad before removal', 'Carpet pad in place.', 'before_removal', '{"pad"}', 1, false, false, false, 'required', '{"has_work": ["carpet_removal"]}'::jsonb, 411),
  (null, 'work_pad_reading', 'Carpet pad moisture reading', 'Meter on saturated pad — proves it was wet.', 'moisture_readings', '{"pad"}', 1, false, false, false, 'required', '{"has_work": ["carpet_removal"]}'::jsonb, 412),
  (null, 'work_tack_strip', 'Tack strip removal', 'Tack strips being removed (if applicable).', 'removal_progress', '{"tack","strip"}', 1, false, false, false, 'recommended', '{"has_work": ["carpet_removal"]}'::jsonb, 413),
  (null, 'work_subfloor_reading_carpet', 'Subfloor reading after pad pull', 'Subfloor moisture reading after pad removed.', 'moisture_readings', '{"subfloor"}', 1, false, false, false, 'required', '{"has_work": ["carpet_removal"]}'::jsonb, 414),
  (null, 'work_subfloor_exposed_carpet', 'Subfloor exposed', 'Subfloor after pad removed.', 'exposed_after', '{"subfloor"}', 1, false, false, false, 'required', '{"has_work": ["carpet_removal"]}'::jsonb, 415),

  -- BASEBOARD REMOVAL
  (null, 'work_baseboard_before', 'Baseboard before removal', 'Baseboard in place on wall.', 'before_removal', '{"baseboard"}', 1, false, false, false, 'required', '{"has_work": ["baseboard_removal"]}'::jsonb, 420),
  (null, 'work_baseboard_after', 'Baseboard removed', 'Wall behind baseboard exposed.', 'exposed_after', '{"baseboard"}', 1, false, false, false, 'required', '{"has_work": ["baseboard_removal"]}'::jsonb, 421),

  -- CABINET REMOVAL
  (null, 'work_cabinet_before', 'Cabinet before removal', 'Cabinet in place.', 'before_removal', '{"cabinet"}', 1, false, false, false, 'required', '{"has_work": ["cabinet_removal"]}'::jsonb, 430),
  (null, 'work_cabinet_after', 'Cabinet removed', 'Wall behind cabinet exposed.', 'exposed_after', '{"cabinet"}', 1, false, false, false, 'required', '{"has_work": ["cabinet_removal"]}'::jsonb, 431),
  (null, 'work_cabinet_dryout', 'Cabinet interior dry-out', 'Cabinet kept in place, interior being dried.', 'removal_progress', '{"cabinet","dry"}', 1, false, false, false, 'recommended', '{"has_work": ["cabinet_removal"]}'::jsonb, 432),

  -- HARDWOOD REMOVAL
  (null, 'work_hardwood_before', 'Hardwood before removal', 'Hardwood floor in place.', 'before_removal', '{"hardwood","wood"}', 1, false, false, false, 'required', '{"has_work": ["hardwood_removal"]}'::jsonb, 440),
  (null, 'work_hardwood_after', 'Hardwood removed', 'Subfloor exposed after hardwood removal.', 'exposed_after', '{"hardwood","subfloor"}', 1, false, false, false, 'required', '{"has_work": ["hardwood_removal"]}'::jsonb, 441),
  (null, 'work_hardwood_subfloor_read', 'Subfloor reading (hardwood)', 'Moisture reading on subfloor.', 'moisture_readings', '{"subfloor"}', 1, false, false, false, 'required', '{"has_work": ["hardwood_removal"]}'::jsonb, 442),

  -- VINYL / LVP REMOVAL
  (null, 'work_vinyl_before', 'Vinyl/LVP before removal', 'Vinyl or LVP floor in place.', 'before_removal', '{"vinyl","lvp","laminate"}', 1, false, false, false, 'required', '{"has_work": ["vinyl_removal"]}'::jsonb, 450),
  (null, 'work_vinyl_after', 'Vinyl/LVP removed', 'Subfloor exposed after removal.', 'exposed_after', '{"vinyl","lvp","subfloor"}', 1, false, false, false, 'required', '{"has_work": ["vinyl_removal"]}'::jsonb, 451),
  (null, 'work_vinyl_subfloor_read', 'Subfloor reading (vinyl)', 'Moisture reading on subfloor.', 'moisture_readings', '{"subfloor"}', 1, false, false, false, 'required', '{"has_work": ["vinyl_removal"]}'::jsonb, 452),

  -- TILE REMOVAL
  (null, 'work_tile_before', 'Tile before removal', 'Tile in place.', 'before_removal', '{"tile"}', 1, false, false, false, 'required', '{"has_work": ["tile_removal"]}'::jsonb, 460),
  (null, 'work_tile_scraper', 'Tile scraper in use', 'Tile scraper / hammer drill removing tile.', 'removal_progress', '{"tile","scraper"}', 1, false, false, false, 'recommended', '{"has_work": ["tile_removal"]}'::jsonb, 461),
  (null, 'work_tile_after', 'Tile removed, substrate exposed', 'Substrate after tile removed.', 'exposed_after', '{"tile","substrate"}', 1, false, false, false, 'required', '{"has_work": ["tile_removal"]}'::jsonb, 462),

  -- CONCRETE GRINDING
  (null, 'work_concrete_before', 'Slab before grinding', 'Concrete slab before grinding starts.', 'before_removal', '{"slab","concrete"}', 1, false, false, false, 'required', '{"has_work": ["concrete_grinding"]}'::jsonb, 470),
  (null, 'work_concrete_grinder', 'Concrete grinder in use', 'Grinder actively at work.', 'removal_progress', '{"concrete","grinder"}', 1, false, false, false, 'required', '{"has_work": ["concrete_grinding"]}'::jsonb, 471),
  (null, 'work_concrete_after', 'Slab after grinding', 'Slab finished.', 'exposed_after', '{"slab","concrete"}', 1, false, false, false, 'required', '{"has_work": ["concrete_grinding"]}'::jsonb, 472),

  -- SUBFLOOR REMOVAL
  (null, 'work_subfloor_before', 'Subfloor before removal', 'Subfloor exposed before removal.', 'before_removal', '{"subfloor"}', 1, false, false, false, 'required', '{"has_work": ["subfloor_removal"]}'::jsonb, 480),
  (null, 'work_subfloor_reading', 'Subfloor moisture reading', 'Subfloor moisture reading before removal.', 'moisture_readings', '{"subfloor"}', 1, false, false, false, 'required', '{"has_work": ["subfloor_removal"]}'::jsonb, 481),
  (null, 'work_subfloor_after', 'Subfloor removed', 'Subfloor removed, joists exposed.', 'exposed_after', '{"subfloor","joist"}', 1, false, false, false, 'required', '{"has_work": ["subfloor_removal"]}'::jsonb, 482),

  -- INSULATION REMOVAL
  (null, 'work_insul_before', 'Insulation before removal', 'Insulation in place.', 'before_removal', '{"insulation"}', 1, false, false, false, 'required', '{"has_work": ["insulation_removal"]}'::jsonb, 490),
  (null, 'work_insul_after', 'Insulation removed', 'Wall/ceiling cavity after insulation removed.', 'exposed_after', '{"insulation","cavity"}', 1, false, false, false, 'required', '{"has_work": ["insulation_removal"]}'::jsonb, 491),
  (null, 'work_insul_machine', 'Insulation machine in use', 'Insulation blow-in/out machine in operation.', 'removal_progress', '{"insulation","machine"}', 1, false, false, false, 'recommended', '{"has_work": ["insulation_removal"]}'::jsonb, 492),

  -- CEILING REMOVAL
  (null, 'work_ceiling_before', 'Ceiling before removal', 'Ceiling before cut.', 'before_removal', '{"ceiling"}', 1, false, false, false, 'required', '{"has_work": ["ceiling_removal"]}'::jsonb, 500),
  (null, 'work_ceiling_after', 'Ceiling removed', 'Ceiling cavity exposed.', 'exposed_after', '{"ceiling"}', 1, false, false, false, 'required', '{"has_work": ["ceiling_removal"]}'::jsonb, 501),
  (null, 'work_ceiling_reading', 'Above-ceiling moisture reading', 'Reading in ceiling cavity.', 'moisture_readings', '{"ceiling","cavity"}', 1, false, false, false, 'recommended', '{"has_work": ["ceiling_removal"]}'::jsonb, 502),

  -- TRIM / DOOR REMOVAL
  (null, 'work_trim_before', 'Trim/door before removal', 'Trim or door in place.', 'before_removal', '{"trim","door"}', 1, false, false, false, 'recommended', '{"has_work": ["trim_removal"]}'::jsonb, 510),
  (null, 'work_trim_after', 'Trim/door removed', 'Trim/door removed.', 'exposed_after', '{"trim","door"}', 1, false, false, false, 'recommended', '{"has_work": ["trim_removal"]}'::jsonb, 511),

  -- CONDITIONAL
  (null, 'cond_pre_existing', 'Pre-existing damage', 'Damage NOT caused by this loss (cracks, stains).', 'front_property', '{"pre-existing","prior"}', 1, false, false, false, 'recommended', '{"always": true}'::jsonb, 600),
  (null, 'cond_protection', 'Surrounding area protection', 'Plastic/coverings protecting contents.', 'contents', '{"protect","cover","plastic"}', 1, false, false, false, 'recommended', '{"always": true}'::jsonb, 601),
  (null, 'cond_visible_growth', 'Microbial growth visible', 'Visible mold/staining if observed.', 'before_removal', '{"mold","growth","stain"}', 1, false, false, false, 'recommended', '{"always": true}'::jsonb, 602),
  (null, 'cond_particulate', 'Particulate meter reading', 'Particulate counter reading on display.', 'daily_monitoring', '{"particulate"}', 1, false, false, true, 'recommended', '{"water_category": ["2","3"]}'::jsonb, 603)
on conflict (tenant_id, key) do nothing;

comment on table photo_requirements is 'Catalog of required-photo rules. tenant_id null = system defaults. Per-tenant rows override or extend.';
comment on table photo_requirement_overrides is 'Per-job exemptions ("not applicable") with required reason.';
