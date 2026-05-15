-- Migration 0017 — Photo requirements: per-job and per-room scoping
--
-- The first photo requirements design (0016) only had job-level requirements
-- with per_room/per_equipment/per_day count multipliers. That's broken: a tech
-- could photo the kitchen 3 times and zero of the bathroom and still satisfy
-- "Affected overview, 3 required."
--
-- This migration adds a `scope` column with three values:
--   'job'                 — single requirement evaluated job-wide
--   'per_room'            — evaluated per affected_rooms row; one requirement instance per room
--   'per_room_if_action'  — same, but only fires when the room's materials/actions match
--
-- For per_room_if_action, the applies_when JSONB can include:
--   { "room_has_material": ["drywall"], "room_has_action": ["removed"] }
--
-- Photos get matched per room by their `room_id` for per_room scopes.

-- ----------------------------------------------------------------------------
-- 1. Add the scope column
-- ----------------------------------------------------------------------------
alter table photo_requirements
  add column if not exists scope text not null default 'job'
    check (scope in ('job','per_room','per_room_if_action'));

-- ----------------------------------------------------------------------------
-- 2. Clear existing system-default seed (tenant_id is null = system row)
-- ----------------------------------------------------------------------------
-- We're rewriting the seed completely so previous tenant overrides (none yet)
-- aren't touched. Only system defaults are deleted + re-inserted.

delete from photo_requirements where tenant_id is null;

-- ----------------------------------------------------------------------------
-- 3. Re-seed with proper scoping
-- ----------------------------------------------------------------------------
insert into photo_requirements (tenant_id, key, label, description, category, caption_keywords, min_count, per_room, per_equipment, per_day, severity, applies_when, scope, sort_order)
values
  -- ========== JOB-LEVEL (taken once per job) ==========
  (null, 'job_front_property',  'Front of property',          'Exterior shot of the building, street view, address visible if possible.',            'front_property',     '{}', 1, false, false, false, 'required',    '{"always": true}'::jsonb, 'job', 100),
  (null, 'job_source_area',     'Source area',                 'Photo of the actual leak/water entry point — appliance, pipe, ceiling, etc.',       'source_area',        '{}', 1, false, false, false, 'required',    '{"always": true}'::jsonb, 'job', 110),
  (null, 'job_signed_cos',      'Customer authorization (COS)','Photo of the signed scope of work or authorization document.',                      'front_property',     '{"cos","auth","signed","scope"}', 1, false, false, false, 'recommended', '{"always": true}'::jsonb, 'job', 105),
  (null, 'job_spider_box',      'Spider box / power distribution', 'Photo of the spider box in use.',                                              'equipment_placement','{"spider","box","power"}', 1, false, false, false, 'recommended', '{"always": true}'::jsonb, 'job', 145),
  (null, 'job_spider_cable',    'Spider box cable management', 'How cables are run from the spider box.',                                          'equipment_placement','{"cable","cord"}', 1, false, false, false, 'recommended', '{"always": true}'::jsonb, 'job', 146),
  (null, 'job_daily_monitoring','Daily monitoring readings',   'Per-day documentation of readings + ambient conditions.',                           'daily_monitoring',   '{}', 1, false, false, true,  'required',    '{"always": true}'::jsonb, 'job', 150),
  (null, 'job_ambient_rh',      'Ambient / RH readings',       'Thermo-hygrometer showing ambient temp + relative humidity.',                       'daily_monitoring',   '{"ambient","rh","humidity"}', 1, false, false, true, 'recommended', '{"always": true}'::jsonb, 'job', 151),
  (null, 'job_thermal',         'Thermal imaging (FLIR)',      'Thermal/IR camera shots if available.',                                             'daily_monitoring',   '{"thermal","flir","ir "}', 1, false, false, false, 'recommended', '{"always": true}'::jsonb, 'job', 152),
  (null, 'job_particulate',     'Particulate meter reading',   'Particulate counter reading on display.',                                           'daily_monitoring',   '{"particulate"}', 1, false, false, true, 'recommended', '{"water_category": ["2","3"]}'::jsonb, 'job', 603),
  (null, 'job_equipment_place', 'Equipment placement',         'Each piece of equipment in its placed location.',                                   'equipment_placement','{}', 1, false, true,  false, 'required',    '{"always": true}'::jsonb, 'job', 140),
  (null, 'job_asset_tags',      'Asset tag close-ups',         'Close-up of each equipment piece''s asset tag.',                                   'equipment_placement','{"asset","tag"}', 1, false, true, false, 'required',    '{"always": true}'::jsonb, 'job', 141),
  (null, 'job_pre_existing',    'Pre-existing damage',         'Damage NOT caused by this loss (cracks, stains).',                                  'front_property',     '{"pre-existing","prior"}', 1, false, false, false, 'recommended', '{"always": true}'::jsonb, 'job', 600),
  (null, 'job_protection',      'Surrounding area protection', 'Plastic/coverings protecting contents.',                                            'contents',           '{"protect","cover","plastic"}', 1, false, false, false, 'recommended', '{"always": true}'::jsonb, 'job', 601),

  -- Cat 3 (sewage) job-level
  (null, 'job_cat3_disposal',   'Affected material disposal',  'Bagged/contained materials being disposed.',                                        'debris',             '{}', 1, false, false, false, 'required',    '{"water_category": ["3"]}'::jsonb, 'job', 255),
  (null, 'job_cat3_hepa_scrubber', 'HEPA air scrubber placement', 'Each HEPA air scrubber placement.',                                            'equipment_placement','{"hepa","scrubber","afd"}', 1, false, false, false, 'required',    '{"water_category": ["3"]}'::jsonb, 'job', 252),
  (null, 'job_cat3_negative_air',  'Negative air machine setup', 'Negative air machine with ducting visible.',                                    'equipment_placement','{"negative","air","afd"}', 1, false, false, false, 'recommended', '{"water_category": ["3"]}'::jsonb, 'job', 253),

  -- Class 4 specialty drying — typically job-level since it's shared equipment
  (null, 'job_class4_specialty',  'Specialty drying equipment','Heat drying system, desiccant, or other specialty unit.',                         'equipment_placement','{"specialty","heat","desiccant"}', 1, false, false, false, 'required',    '{"water_class": ["4"]}'::jsonb, 'job', 350),

  -- ========== PER-ROOM (every affected room) ==========
  (null, 'room_overview',       'Affected area overview',      'Wide shot of this room from the doorway.',                                          'affected_overview',  '{}', 1, false, false, false, 'required', '{"always": true}'::jsonb, 'per_room', 120),
  (null, 'room_initial_reading','Initial moisture readings',   'Moisture meter readings on actual wet materials in this room.',                     'moisture_readings',  '{}', 1, false, false, false, 'required', '{"always": true}'::jsonb, 'per_room', 130),
  (null, 'room_final_dry',      'Final dry readings',          'Meter readings showing drying goals were met in this room.',                        'final_dry',          '{}', 1, false, false, false, 'required', '{"always": true}'::jsonb, 'per_room', 160),
  (null, 'room_final_condition','Final condition',             'Cleaned, dried room ready for handoff.',                                            'final_condition',    '{}', 1, false, false, false, 'required', '{"always": true}'::jsonb, 'per_room', 170),

  -- Cat 2+ per-room cleaning
  (null, 'room_cat2_antimicrobial_app',  'Antimicrobial application', 'Antimicrobial being sprayed or applied in this room.',                'cleaning', '{"antimicrobial","antimic"}', 1, false, false, false, 'required', '{"water_category": ["2","3"]}'::jsonb, 'per_room', 200),
  (null, 'room_cat2_hepa_vac',           'HEPA vacuuming',            'Tech using HEPA vacuum on affected surfaces in this room.',            'cleaning', '{"hepa","vacuum","vac"}', 1, false, false, false, 'required', '{"water_category": ["2","3"]}'::jsonb, 'per_room', 202),
  (null, 'room_cat2_detail_clean',       'Detail cleaning',           'Wiping/cleaning of affected surfaces in this room.',                   'cleaning', '{"detail","wipe","clean"}', 1, false, false, false, 'required', '{"water_category": ["2","3"]}'::jsonb, 'per_room', 203),
  (null, 'room_cat2_antimicrobial_label','Antimicrobial bottle/label','Photo showing the brand/SDS name of the chemical.',                    'cleaning', '{"antimicrobial","label","bottle"}', 1, false, false, false, 'required', '{"water_category": ["2","3"]}'::jsonb, 'per_room', 201),

  -- Cat 3 per-room
  (null, 'room_cat3_containment','Containment setup',  'Plastic sheeting or zipwalls for containment in this room.',                                   'containment',  '{}', 1, false, false, false, 'required', '{"water_category": ["3"]}'::jsonb, 'per_room', 250),
  (null, 'room_cat3_ppe_full',   'Full PPE (Tyvek + respirator)', 'Tech fully suited in Tyvek + respirator working in this room.',                    'containment',  '{"tyvek","respirator","ppe"}', 1, false, false, false, 'required', '{"water_category": ["3"]}'::jsonb, 'per_room', 251),
  (null, 'room_cat3_sanitization','Sanitization process','Final sanitizing/disinfection pass in this room.',                                          'cleaning',     '{"sanit","disinfect"}', 1, false, false, false, 'required', '{"water_category": ["3"]}'::jsonb, 'per_room', 254),
  (null, 'room_cat2_worker_ppe', 'Worker in PPE',       'Tech wearing proper personal protective gear in this room.',                                'cleaning',     '{"ppe","tyvek","respirator","gloves"}', 1, false, false, false, 'required', '{"water_category": ["2","3"]}'::jsonb, 'per_room', 204),

  -- Class 3/4 wall cavity (per room)
  (null, 'room_class3_cavity_reading', 'Wall cavity moisture readings', 'Meter reading inside wall cavity in this room.',                          'moisture_readings', '{"cavity","wall"}', 1, false, false, false, 'required',    '{"water_class": ["3","4"]}'::jsonb, 'per_room', 300),
  (null, 'room_class3_weep_hole',      'Drilled hole / weep hole',      'Drilled hole used for wall cavity drying access in this room.',          'moisture_readings', '{"weep","hole","drill"}', 1, false, false, false, 'recommended', '{"water_class": ["3","4"]}'::jsonb, 'per_room', 301),

  -- Class 4 per-room specialty
  (null, 'room_class4_drying_mat',  'Drying mat / Injectidry',         'Drying mat setup (Injectidry, RAMair, etc.) in this room.',               'equipment_placement', '{"mat","injectidry","ramair"}', 1, false, false, false, 'recommended', '{"water_class": ["4"]}'::jsonb, 'per_room', 351),
  (null, 'room_class4_cavity_tubes','Wall cavity drying tubes',        'Tubes installed in wall cavities for forced drying.',                     'equipment_placement', '{"tube","cavity"}', 1, false, false, false, 'recommended', '{"water_class": ["4"]}'::jsonb, 'per_room', 352),

  -- Visible microbial growth — per room because growth is room-specific
  (null, 'room_visible_growth', 'Microbial growth visible',  'Visible mold/staining in this room (if observed).',                                   'before_removal', '{"mold","growth","stain"}', 1, false, false, false, 'recommended', '{"always": true}'::jsonb, 'per_room', 602),

  -- ========== PER-ROOM IF ACTION (only fires when materials/actions match) ==========
  -- DRYWALL REMOVAL
  (null, 'work_drywall_before',  'Drywall before cut',           'Drywall in place with cut line marked.', 'before_removal', '{"drywall"}',          1, false, false, false, 'required',    '{"all_of": [{"room_has_material": ["drywall","sheetrock"]}, {"room_has_action": ["removed"]}]}'::jsonb, 'per_room_if_action', 400),
  (null, 'work_drywall_cut_line','Flood cut line visible',      'The cut line on the wall before cutting.', 'before_removal', '{"flood","cut","line"}', 1, false, false, false, 'recommended', '{"all_of": [{"room_has_material": ["drywall","sheetrock"]}, {"room_has_action": ["removed"]}]}'::jsonb, 'per_room_if_action', 401),
  (null, 'work_drywall_after',   'Drywall cavity exposed',       'Wall cavity after drywall has been removed.', 'exposed_after', '{"drywall","cavity"}', 1, false, false, false, 'required',    '{"all_of": [{"room_has_material": ["drywall","sheetrock"]}, {"room_has_action": ["removed"]}]}'::jsonb, 'per_room_if_action', 402),

  -- CARPET REMOVAL
  (null, 'work_carpet_before',          'Carpet before removal',    'Carpet in place.', 'before_removal', '{"carpet"}', 1, false, false, false, 'required', '{"all_of": [{"room_has_material": ["carpet"]}, {"room_has_action": ["removed"]}]}'::jsonb, 'per_room_if_action', 410),
  (null, 'work_pad_before',             'Carpet pad before removal','Carpet pad in place.', 'before_removal', '{"pad"}', 1, false, false, false, 'required', '{"all_of": [{"room_has_material": ["carpet","carpet_pad","pad"]}, {"room_has_action": ["removed"]}]}'::jsonb, 'per_room_if_action', 411),
  (null, 'work_pad_reading',            'Carpet pad moisture reading','Meter on saturated pad — proves it was wet.', 'moisture_readings', '{"pad"}', 1, false, false, false, 'required', '{"all_of": [{"room_has_material": ["carpet","carpet_pad","pad"]}, {"room_has_action": ["removed"]}]}'::jsonb, 'per_room_if_action', 412),
  (null, 'work_tack_strip',             'Tack strip removal',        'Tack strips being removed.', 'removal_progress', '{"tack","strip"}', 1, false, false, false, 'recommended', '{"all_of": [{"room_has_material": ["carpet"]}, {"room_has_action": ["removed"]}]}'::jsonb, 'per_room_if_action', 413),
  (null, 'work_subfloor_reading_carpet','Subfloor reading after pad pull','Subfloor moisture reading after pad removed.', 'moisture_readings', '{"subfloor"}', 1, false, false, false, 'required', '{"all_of": [{"room_has_material": ["carpet"]}, {"room_has_action": ["removed"]}]}'::jsonb, 'per_room_if_action', 414),
  (null, 'work_subfloor_exposed_carpet','Subfloor exposed',          'Subfloor after pad removed.', 'exposed_after', '{"subfloor"}', 1, false, false, false, 'required', '{"all_of": [{"room_has_material": ["carpet"]}, {"room_has_action": ["removed"]}]}'::jsonb, 'per_room_if_action', 415),

  -- BASEBOARD REMOVAL
  (null, 'work_baseboard_before','Baseboard before removal','Baseboard in place on wall.', 'before_removal', '{"baseboard"}', 1, false, false, false, 'required', '{"all_of": [{"room_has_material": ["baseboard"]}, {"room_has_action": ["removed"]}]}'::jsonb, 'per_room_if_action', 420),
  (null, 'work_baseboard_after', 'Baseboard removed',       'Wall behind baseboard exposed.', 'exposed_after',  '{"baseboard"}', 1, false, false, false, 'required', '{"all_of": [{"room_has_material": ["baseboard"]}, {"room_has_action": ["removed"]}]}'::jsonb, 'per_room_if_action', 421),

  -- CABINET REMOVAL
  (null, 'work_cabinet_before',  'Cabinet before removal',     'Cabinet in place.', 'before_removal', '{"cabinet"}', 1, false, false, false, 'required', '{"all_of": [{"room_has_material": ["cabinet","vanity"]}, {"room_has_action": ["removed"]}]}'::jsonb, 'per_room_if_action', 430),
  (null, 'work_cabinet_after',   'Cabinet removed',            'Wall behind cabinet exposed.', 'exposed_after',  '{"cabinet"}', 1, false, false, false, 'required', '{"all_of": [{"room_has_material": ["cabinet","vanity"]}, {"room_has_action": ["removed"]}]}'::jsonb, 'per_room_if_action', 431),
  (null, 'work_cabinet_dryout',  'Cabinet interior dry-out',   'Cabinet kept in place, interior being dried.', 'removal_progress', '{"cabinet","dry"}', 1, false, false, false, 'recommended', '{"room_has_material": ["cabinet"]}'::jsonb, 'per_room_if_action', 432),

  -- HARDWOOD REMOVAL
  (null, 'work_hardwood_before',         'Hardwood before removal','Hardwood floor in place.', 'before_removal', '{"hardwood","wood"}', 1, false, false, false, 'required', '{"all_of": [{"room_has_material": ["hardwood","wood_floor"]}, {"room_has_action": ["removed"]}]}'::jsonb, 'per_room_if_action', 440),
  (null, 'work_hardwood_after',          'Hardwood removed',       'Subfloor exposed after hardwood removal.', 'exposed_after', '{"hardwood","subfloor"}', 1, false, false, false, 'required', '{"all_of": [{"room_has_material": ["hardwood","wood_floor"]}, {"room_has_action": ["removed"]}]}'::jsonb, 'per_room_if_action', 441),
  (null, 'work_hardwood_subfloor_read',  'Subfloor reading (hardwood)','Moisture reading on subfloor.', 'moisture_readings', '{"subfloor"}', 1, false, false, false, 'required', '{"all_of": [{"room_has_material": ["hardwood","wood_floor"]}, {"room_has_action": ["removed"]}]}'::jsonb, 'per_room_if_action', 442),

  -- VINYL / LVP REMOVAL
  (null, 'work_vinyl_before',          'Vinyl/LVP before removal','Vinyl or LVP floor in place.', 'before_removal', '{"vinyl","lvp","laminate"}', 1, false, false, false, 'required', '{"all_of": [{"room_has_material": ["vinyl","lvp","laminate"]}, {"room_has_action": ["removed"]}]}'::jsonb, 'per_room_if_action', 450),
  (null, 'work_vinyl_after',           'Vinyl/LVP removed',      'Subfloor exposed after removal.', 'exposed_after', '{"vinyl","lvp","subfloor"}', 1, false, false, false, 'required', '{"all_of": [{"room_has_material": ["vinyl","lvp","laminate"]}, {"room_has_action": ["removed"]}]}'::jsonb, 'per_room_if_action', 451),
  (null, 'work_vinyl_subfloor_read',   'Subfloor reading (vinyl)','Moisture reading on subfloor.', 'moisture_readings', '{"subfloor"}', 1, false, false, false, 'required', '{"all_of": [{"room_has_material": ["vinyl","lvp","laminate"]}, {"room_has_action": ["removed"]}]}'::jsonb, 'per_room_if_action', 452),

  -- TILE REMOVAL
  (null, 'work_tile_before', 'Tile before removal',  'Tile in place.', 'before_removal', '{"tile"}', 1, false, false, false, 'required', '{"all_of": [{"room_has_material": ["tile"]}, {"room_has_action": ["removed"]}]}'::jsonb, 'per_room_if_action', 460),
  (null, 'work_tile_scraper','Tile scraper in use',  'Tile scraper / hammer drill removing tile.', 'removal_progress', '{"tile","scraper"}', 1, false, false, false, 'recommended', '{"all_of": [{"room_has_material": ["tile"]}, {"room_has_action": ["removed"]}]}'::jsonb, 'per_room_if_action', 461),
  (null, 'work_tile_after',  'Tile removed, substrate exposed','Substrate after tile removed.', 'exposed_after', '{"tile","substrate"}', 1, false, false, false, 'required', '{"all_of": [{"room_has_material": ["tile"]}, {"room_has_action": ["removed"]}]}'::jsonb, 'per_room_if_action', 462),

  -- CONCRETE GRINDING — typically not represented in materials, falls back to job work_types
  (null, 'work_concrete_before',  'Slab before grinding','Concrete slab before grinding starts.', 'before_removal', '{"slab","concrete"}', 1, false, false, false, 'required', '{"any_of": [{"room_has_material": ["concrete","slab"]}, {"has_work": ["concrete_grinding"]}]}'::jsonb, 'per_room_if_action', 470),
  (null, 'work_concrete_grinder', 'Concrete grinder in use','Grinder actively at work.', 'removal_progress', '{"concrete","grinder"}', 1, false, false, false, 'required', '{"any_of": [{"room_has_material": ["concrete","slab"]}, {"has_work": ["concrete_grinding"]}]}'::jsonb, 'per_room_if_action', 471),
  (null, 'work_concrete_after',   'Slab after grinding','Slab finished.', 'exposed_after', '{"slab","concrete"}', 1, false, false, false, 'required', '{"any_of": [{"room_has_material": ["concrete","slab"]}, {"has_work": ["concrete_grinding"]}]}'::jsonb, 'per_room_if_action', 472),

  -- SUBFLOOR REMOVAL
  (null, 'work_subfloor_before', 'Subfloor before removal',  'Subfloor exposed before removal.', 'before_removal', '{"subfloor"}', 1, false, false, false, 'required', '{"all_of": [{"room_has_material": ["subfloor"]}, {"room_has_action": ["removed"]}]}'::jsonb, 'per_room_if_action', 480),
  (null, 'work_subfloor_reading','Subfloor moisture reading','Subfloor moisture reading before removal.', 'moisture_readings', '{"subfloor"}', 1, false, false, false, 'required', '{"all_of": [{"room_has_material": ["subfloor"]}, {"room_has_action": ["removed"]}]}'::jsonb, 'per_room_if_action', 481),
  (null, 'work_subfloor_after',  'Subfloor removed',         'Subfloor removed, joists exposed.', 'exposed_after', '{"subfloor","joist"}', 1, false, false, false, 'required', '{"all_of": [{"room_has_material": ["subfloor"]}, {"room_has_action": ["removed"]}]}'::jsonb, 'per_room_if_action', 482),

  -- INSULATION REMOVAL
  (null, 'work_insul_before', 'Insulation before removal',  'Insulation in place.', 'before_removal', '{"insulation"}', 1, false, false, false, 'required', '{"all_of": [{"room_has_material": ["insulation"]}, {"room_has_action": ["removed"]}]}'::jsonb, 'per_room_if_action', 490),
  (null, 'work_insul_after',  'Insulation removed',         'Wall/ceiling cavity after insulation removed.', 'exposed_after', '{"insulation","cavity"}', 1, false, false, false, 'required', '{"all_of": [{"room_has_material": ["insulation"]}, {"room_has_action": ["removed"]}]}'::jsonb, 'per_room_if_action', 491),
  (null, 'work_insul_machine','Insulation machine in use',  'Insulation blow-in/out machine in operation.', 'removal_progress', '{"insulation","machine"}', 1, false, false, false, 'recommended', '{"any_of": [{"all_of": [{"room_has_material": ["insulation"]}, {"room_has_action": ["removed"]}]}, {"has_work": ["insulation_removal"]}]}'::jsonb, 'per_room_if_action', 492),

  -- CEILING REMOVAL
  (null, 'work_ceiling_before', 'Ceiling before removal',          'Ceiling before cut.', 'before_removal', '{"ceiling"}', 1, false, false, false, 'required', '{"all_of": [{"room_has_material": ["ceiling"]}, {"room_has_action": ["removed"]}]}'::jsonb, 'per_room_if_action', 500),
  (null, 'work_ceiling_after',  'Ceiling removed',                 'Ceiling cavity exposed.', 'exposed_after', '{"ceiling"}', 1, false, false, false, 'required', '{"all_of": [{"room_has_material": ["ceiling"]}, {"room_has_action": ["removed"]}]}'::jsonb, 'per_room_if_action', 501),
  (null, 'work_ceiling_reading','Above-ceiling moisture reading',  'Reading in ceiling cavity.', 'moisture_readings', '{"ceiling","cavity"}', 1, false, false, false, 'recommended', '{"all_of": [{"room_has_material": ["ceiling"]}, {"room_has_action": ["removed"]}]}'::jsonb, 'per_room_if_action', 502),

  -- TRIM / DOOR REMOVAL
  (null, 'work_trim_before','Trim/door before removal','Trim or door in place.', 'before_removal', '{"trim","door"}', 1, false, false, false, 'recommended', '{"all_of": [{"room_has_material": ["trim","door"]}, {"room_has_action": ["removed"]}]}'::jsonb, 'per_room_if_action', 510),
  (null, 'work_trim_after', 'Trim/door removed',       'Trim/door removed.', 'exposed_after',  '{"trim","door"}', 1, false, false, false, 'recommended', '{"all_of": [{"room_has_material": ["trim","door"]}, {"room_has_action": ["removed"]}]}'::jsonb, 'per_room_if_action', 511)
on conflict (tenant_id, key) do nothing;

-- ----------------------------------------------------------------------------
-- 4. Add room_id to overrides so per-room requirements can be overridden too
-- ----------------------------------------------------------------------------
alter table photo_requirement_overrides
  add column if not exists room_id uuid references affected_rooms(id) on delete cascade;

-- Need to recreate unique constraint to include room_id
alter table photo_requirement_overrides
  drop constraint if exists photo_requirement_overrides_job_id_requirement_key_key;
do $$ begin
  if not exists (
    select 1 from pg_indexes where indexname = 'photo_requirement_overrides_job_req_room_idx'
  ) then
    create unique index photo_requirement_overrides_job_req_room_idx
      on photo_requirement_overrides (job_id, requirement_key, coalesce(room_id, '00000000-0000-0000-0000-000000000000'::uuid));
  end if;
end $$;

comment on column photo_requirement_overrides.room_id is 'NULL for job-level overrides; UUID for per-room';

comment on column photo_requirements.scope is 'job | per_room | per_room_if_action';
