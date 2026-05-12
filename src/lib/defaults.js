// Default settings seeded into a new tenant when bootstrap_tenant succeeds.
// Owner can edit any of these in /settings/* screens.
// Keys are stable identifiers (don't change them after release); labels are display text.

export const DEFAULT_ROOMS = [
  'Kitchen','Living Room','Family Room','Dining Room','Master Bedroom','Bedroom',
  'Master Bath','Bathroom','Half Bath','Laundry','Hallway','Entry/Foyer','Stairs',
  'Basement','Garage','Office','Closet','Utility/Mechanical','Attic','Crawlspace',
]

export const DEFAULT_MATERIALS = [
  { key: 'carpet',           label: 'Carpet' },
  { key: 'carpet_pad',       label: 'Carpet pad' },
  { key: 'hardwood',         label: 'Hardwood' },
  { key: 'engineered_wood',  label: 'Engineered wood' },
  { key: 'laminate',         label: 'Laminate' },
  { key: 'lvp',              label: 'LVP / Vinyl plank' },
  { key: 'sheet_vinyl',      label: 'Sheet vinyl' },
  { key: 'tile',             label: 'Tile' },
  { key: 'drywall',          label: 'Drywall' },
  { key: 'plaster',          label: 'Plaster' },
  { key: 'baseboard',        label: 'Baseboard' },
  { key: 'trim',             label: 'Trim' },
  { key: 'door_casing',      label: 'Door / casing' },
  { key: 'cabinet_base',     label: 'Cabinet (base)' },
  { key: 'cabinet_upper',    label: 'Cabinet (upper)' },
  { key: 'vanity',           label: 'Vanity' },
  { key: 'countertop',       label: 'Countertop' },
  { key: 'insulation_batt',  label: 'Insulation (batt)' },
  { key: 'insulation_blown', label: 'Insulation (blown)' },
  { key: 'subfloor',         label: 'Subfloor' },
  { key: 'ceiling',          label: 'Ceiling' },
  { key: 'framing',          label: 'Framing' },
  { key: 'wood_sill_plate',  label: 'Wood sill plate' },
  { key: 'concrete',         label: 'Concrete' },
]

export const DEFAULT_ACTIONS = [
  { key: 'removed',           label: 'Removed' },
  { key: 'detached_reset',    label: 'Detached & reset' },
  { key: 'cleaned',           label: 'Cleaned' },
  { key: 'dried_in_place',    label: 'Dried in place' },
  { key: 'monitored',         label: 'Monitored' },
  { key: 'protected',         label: 'Protected / covered' },
  { key: 'antimicrobial',     label: 'Antimicrobial applied' },
  { key: 'hepa_vacuumed',     label: 'HEPA vacuumed' },
  { key: 'contained',         label: 'Contained' },
  { key: 'bagged_disposed',   label: 'Bagged & disposed' },
]

export const DEFAULT_REASONS = [
  { key: 'trapped_moisture',     label: 'Trapped moisture' },
  { key: 'drying_access',        label: 'Drying access' },
  { key: 'non_salvageable',      label: 'Non-salvageable material' },
  { key: 'contamination_cat23',  label: 'Contamination (Cat 2/3)' },
  { key: 'cosmetic_damage',      label: 'Cosmetic damage' },
  { key: 'mold_observed',        label: 'Mold growth observed' },
  { key: 'customer_requested',   label: 'Customer requested' },
  { key: 'iicrc_s500',           label: 'Per IICRC S500' },
]

export const DEFAULT_FINAL_STATUS = [
  { key: 'dry_standard_met',     label: 'Dry standard met' },
  { key: 'ready_for_rebuild',    label: 'Ready for rebuild' },
  { key: 'monitoring_continued', label: 'Monitoring continued' },
  { key: 'limitation_noted',     label: 'Limitation noted (customer refusal/access)' },
  { key: 'stopped_at_request',   label: 'Stopped at customer request' },
  { key: 'referred',             label: 'Referred to specialty trade' },
]

export const DEFAULT_METERS = [
  { key: 'protimeter_surveymaster', label: 'Protimeter Surveymaster (pin + non-invasive)', units: ['wme_pct','relative'] },
  { key: 'protimeter_mms2',         label: 'Protimeter MMS2',                              units: ['wme_pct','relative','rh_pct'] },
  { key: 'tramex_encounter',        label: 'Tramex Moisture Encounter Plus',               units: ['relative'] },
  { key: 'flir_thermal',            label: 'FLIR thermal camera',                           units: ['temp_f'] },
  { key: 'thermo_hygrometer',       label: 'Thermo-hygrometer (Temp/RH)',                   units: ['temp_f','rh_pct','gpp'] },
  { key: 'flir_mr277',              label: 'FLIR MR277',                                    units: ['wme_pct','relative','temp_f','rh_pct'] },
]

export const UNITS = {
  wme_pct:  '%WME',
  relative: 'relative',
  temp_f:   '°F',
  rh_pct:   '%RH',
  gpp:      'gpp',
}

export const DEFAULT_EQUIPMENT = [
  { key: 'lgr_dehu',           label: 'LGR dehumidifier' },
  { key: 'conventional_dehu',  label: 'Conventional dehumidifier' },
  { key: 'desiccant_dehu',     label: 'Desiccant dehumidifier' },
  { key: 'axial_air_mover',    label: 'Axial air mover' },
  { key: 'centrifugal_mover',  label: 'Centrifugal air mover' },
  { key: 'air_scrubber',       label: 'Air scrubber / AFD (HEPA)' },
  { key: 'hepa_vacuum',        label: 'HEPA vacuum' },
  { key: 'containment_fan',    label: 'Containment fan' },
  { key: 'heat_drying',        label: 'Heat drying system' },
  { key: 'injectidry',         label: 'Injectidry / wall cavity drying' },
]

export const DEFAULT_WORK_ITEM_TYPES = [
  { key: 'extraction',          label: 'Water extraction' },
  { key: 'containment',         label: 'Containment' },
  { key: 'ppe_setup',           label: 'PPE setup' },
  { key: 'floor_protection',    label: 'Floor protection' },
  { key: 'antimicrobial',       label: 'Antimicrobial application' },
  { key: 'holes_baseboards',    label: 'Holes behind baseboards' },
  { key: 'contents_protection', label: 'Contents protection' },
  { key: 'debris_removal',      label: 'Debris removal' },
  { key: 'mattress_wrap',       label: 'Mattress / contents wrap' },
]

export const DEFAULT_LOSS_SOURCES = [
  'Supply line','Appliance failure','Toilet overflow','Sewage backup',
  'Roof leak','Window/door leak','Foundation/groundwater','Sprinkler/fire suppression',
  'HVAC/condensate','Frozen pipe burst','Sump pump failure','Unknown/under investigation','Other',
]

export const DEFAULT_OCCUPANCY = [
  { key: 'owner_occupied',      label: 'Owner-occupied' },
  { key: 'tenant_occupied',     label: 'Tenant-occupied' },
  { key: 'vacant',              label: 'Vacant' },
  { key: 'commercial_occupied', label: 'Commercial-occupied' },
  { key: 'commercial_vacant',   label: 'Commercial-vacant' },
]

// Material drying goals (IICRC-aligned defaults — Owner can edit)
export const DEFAULT_DRYING_GOALS = [
  { material_key: 'drywall',          goal_pct: 15.3 },
  { material_key: 'framing',          goal_pct: 17.6 },
  { material_key: 'wood_sill_plate',  goal_pct: 18.3 },
  { material_key: 'hardwood',         goal_pct: 12.0 },
  { material_key: 'engineered_wood',  goal_pct: 12.0 },
  { material_key: 'subfloor',         goal_pct: 16.0 },
  { material_key: 'concrete',         goal_pct: 4.5  },
  { material_key: 'plaster',          goal_pct: 1.0  }, // relative scale baseline
]

// Photo categories — all 15 from the workbook
export const PHOTO_CATEGORIES = [
  { key: 'front_property',    label: 'Front of property',          job_required: true,  room_required: false },
  { key: 'source_area',       label: 'Source area',                 job_required: true,  room_required: false },
  { key: 'affected_overview', label: 'Affected area overview',      job_required: true,  room_required: true  },
  { key: 'moisture_readings', label: 'Moisture meter readings',     job_required: true,  room_required: true  },
  { key: 'before_removal',    label: 'Before material removal',     job_required: true,  room_required: false },
  { key: 'removal_progress',  label: 'Removal in progress',         job_required: true,  room_required: false },
  { key: 'exposed_after',     label: 'Exposed materials after',     job_required: true,  room_required: false },
  { key: 'cleaning',          label: 'Cleaning / antimicrobial',    job_required: true,  room_required: false },
  { key: 'equipment_placement', label: 'Equipment placement',       job_required: true,  room_required: true  },
  { key: 'daily_monitoring',  label: 'Daily monitoring',            job_required: true,  room_required: false },
  { key: 'final_dry',         label: 'Final dry readings',          job_required: true,  room_required: false },
  { key: 'final_condition',   label: 'Final condition',             job_required: true,  room_required: true  },
  { key: 'contents',          label: 'Contents / protection',       job_required: true,  room_required: false },
  { key: 'containment',       label: 'Containment / barriers',      job_required: true,  room_required: false },
  { key: 'debris',            label: 'Debris / load out',           job_required: true,  room_required: false },
  // ---- Mold Screening categories ----
  { key: 'screening_alert',   label: 'Screening — alert location',  job_required: true,  room_required: true  },
  { key: 'screening_thermal', label: 'Screening — thermal imaging', job_required: true,  room_required: true  },
  { key: 'screening_visible', label: 'Screening — visible signs',   job_required: true,  room_required: true  },
  { key: 'screening_sample',  label: 'Screening — sample collected',job_required: true,  room_required: true  },
  { key: 'screening_general', label: 'Screening — general',         job_required: true,  room_required: false },
]

// Scope library — each scope item maps to 2–3 reason templates
export const DEFAULT_SCOPE_LIBRARY = [
  {
    key: 'remove_baseboards',
    label: 'Remove baseboards',
    reasons: [
      { key: 'wicking',          text: 'Baseboards exhibited moisture wicking and required removal to allow proper wall drying.' },
      { key: 'non_salvageable',  text: 'Baseboards were non-salvageable due to swelling and saturation.' },
      { key: 'access',           text: 'Baseboards detached to provide access for cavity drying.' },
    ],
  },
  {
    key: 'remove_lvp',
    label: 'Remove laminate / LVP',
    reasons: [
      { key: 'trapped_moisture', text: 'Laminate / LVP removed due to trapped moisture beneath the floor system.' },
      { key: 'delamination',     text: 'Flooring exhibited delamination and was non-salvageable.' },
    ],
  },
  {
    key: 'remove_carpet_pad',
    label: 'Remove carpet pad',
    reasons: [
      { key: 'saturation',       text: 'Carpet pad was saturated and non-salvageable per IICRC S500.' },
      { key: 'cat23',            text: 'Carpet pad removed due to Category 2/3 water exposure.' },
    ],
  },
  {
    key: 'lift_carpet',
    label: 'Lift carpet for drying',
    reasons: [
      { key: 'in_place_dry',     text: 'Carpet detached and floated for in-place drying of subfloor.' },
    ],
  },
  {
    key: 'remove_drywall_flood_cut',
    label: 'Remove drywall / flood cut',
    reasons: [
      { key: 'access',           text: 'Flood cut performed for drying access to wall cavity.' },
      { key: 'non_salvageable',  text: 'Drywall non-salvageable due to Category 2/3 contamination.' },
      { key: 'trapped_insulation', text: 'Drywall removed to expose and remove trapped insulation moisture.' },
    ],
  },
  {
    key: 'remove_insulation',
    label: 'Remove insulation',
    reasons: [
      { key: 'saturation',       text: 'Insulation was saturated and could not be effectively dried in place.' },
      { key: 'cat23',            text: 'Insulation removed due to Category 2/3 contamination.' },
    ],
  },
  {
    key: 'detach_appliance',
    label: 'Detach / reset appliance',
    reasons: [
      { key: 'access',           text: 'Appliance detached to access affected area; reset upon completion.' },
    ],
  },
  {
    key: 'containment',
    label: 'Containment',
    reasons: [
      { key: 'cross_contam',     text: 'Containment installed to prevent cross-contamination of unaffected areas.' },
      { key: 'drying_chamber',   text: 'Containment installed to establish a drying chamber and improve dehumidification efficiency.' },
    ],
  },
  {
    key: 'air_scrubber',
    label: 'Air scrubber / AFD',
    reasons: [
      { key: 'particulates',     text: 'HEPA filtration deployed to capture airborne particulates during work.' },
      { key: 'cat23',            text: 'Air scrubbing required due to Category 2/3 water and contamination concerns.' },
    ],
  },
  {
    key: 'hepa_vacuum',
    label: 'HEPA vacuum',
    reasons: [
      { key: 'post_demo',        text: 'HEPA vacuumed exposed surfaces following demolition.' },
    ],
  },
  {
    key: 'clean_wet_wipe',
    label: 'Clean / wet wipe',
    reasons: [
      { key: 'surface_clean',    text: 'Surfaces cleaned and wet-wiped following exposure to source water.' },
    ],
  },
  {
    key: 'antimicrobial',
    label: 'Antimicrobial',
    reasons: [
      { key: 'cat23_treatment',  text: 'Antimicrobial applied to affected substrates following Category 2/3 exposure.' },
      { key: 'preventative',     text: 'Antimicrobial applied as a preventative measure on porous substrates.' },
    ],
  },
  {
    key: 'ppe',
    label: 'PPE',
    reasons: [
      { key: 'cat23',            text: 'PPE used during work due to Category 2/3 water conditions.' },
    ],
  },
  {
    key: 'debris_removal',
    label: 'Debris removal',
    reasons: [
      { key: 'haul_off',         text: 'Demolished material bagged, contained, and removed from the property.' },
    ],
  },
  {
    key: 'contents_manipulation',
    label: 'Contents manipulation',
    reasons: [
      { key: 'access',           text: 'Contents moved out and reset to allow access to affected areas.' },
    ],
  },
]

// QC rules — Owner picks block / warn / off per rule
export const DEFAULT_QC_RULES = [
  { key: 'no_rooms',                    label: 'No affected rooms added',                level: 'block' },
  { key: 'missing_source_photo',        label: 'Missing source area photo',              level: 'block' },
  { key: 'missing_final_dry',           label: 'Missing final dry readings',             level: 'block' },
  { key: 'equipment_no_placement_photo',label: 'Equipment used but no placement photo',  level: 'block' },
  { key: 'scope_without_reason',        label: 'Scope item selected with no reason',     level: 'block' },
  { key: 'no_work_authorization',       label: 'No work authorization on file',          level: 'block' },
  { key: 'missing_before_after_photos', label: 'Missing before/after material removal photos', level: 'warn' },
  { key: 'missing_daily_monitoring',    label: 'Missing daily monitoring photos',        level: 'warn' },
  { key: 'date_mismatch',               label: 'Dates do not line up',                   level: 'warn' },
  { key: 'no_completion_statement',     label: 'No completion statement written',        level: 'warn' },
  { key: 'equipment_no_removal_date',   label: 'Equipment used but no removal date',     level: 'warn' },
  { key: 'stalled_drying',              label: 'Readings not improving (3+ days)',       level: 'warn' },
  { key: 'long_equipment_stay',         label: 'Equipment on site 4+ days',              level: 'warn' },
]

// Default mold-screening recommendations — used as quick-pick buttons on the
// Recommendations step of the screening workflow. Tenant owners can edit
// this list in Settings → Mold Screening Recommendations.
//
// Each item is grouped into a category. Use {{room}} as a placeholder where
// the report should swap in a specific room name; the recommendations
// editor lets the user pick a target room when applying the quick-pick.
export const DEFAULT_SCREENING_RECOMMENDATIONS = [
  // Sampling
  { key: 'air_sample_room',       category: 'Sampling',     text: 'Air sampling recommended in {{room}} to identify spore types and concentrations.' },
  { key: 'surface_sample_alert',  category: 'Sampling',     text: 'Surface (tape lift) sampling recommended at the alert location to identify mold species.' },
  { key: 'wall_cavity_sample',    category: 'Sampling',     text: 'Wall cavity air sampling recommended in {{room}} to assess concealed contamination.' },
  { key: 'bulk_sample',           category: 'Sampling',     text: 'Bulk sampling recommended of suspect material at the alert location.' },
  { key: 'outdoor_control',       category: 'Sampling',     text: 'Outdoor control air sample recommended for comparison against indoor samples.' },

  // Source / cause
  { key: 'identify_source',       category: 'Source',       text: 'Moisture source must be identified and corrected before any remediation work begins.' },
  { key: 'roof_inspection',       category: 'Source',       text: 'Recommend roof and gutter inspection — possible water intrusion source.' },
  { key: 'plumbing_inspection',   category: 'Source',       text: 'Recommend plumbing inspection in {{room}} — possible leak source.' },
  { key: 'hvac_inspection',       category: 'Source',       text: 'Recommend HVAC inspection — possible cross-contamination pathway.' },
  { key: 'foundation_inspection', category: 'Source',       text: 'Recommend foundation and exterior grading inspection — possible groundwater intrusion.' },

  // Remediation
  { key: 'full_remediation',      category: 'Remediation',  text: 'Recommend full mold remediation per IICRC S520 standards in {{room}}.' },
  { key: 'containment_hepa',      category: 'Remediation',  text: 'Recommend containment and HEPA cleaning of {{room}}.' },
  { key: 'post_remediation',      category: 'Remediation',  text: 'Recommend post-remediation verification (clearance testing) after remediation is complete.' },
  { key: 'iep_consultation',      category: 'Remediation',  text: 'Recommend professional consultation with an IICRC-certified Indoor Environmental Professional (IEP).' },

  // Health / occupancy
  { key: 'physician_consultation',category: 'Health',       text: 'Occupants reporting health concerns should consult their physician and provide this report.' },
  { key: 'sensitive_occupants',   category: 'Health',       text: 'Sensitive occupants (children, elderly, immunocompromised) should avoid affected areas until remediation is complete.' },
  { key: 'hvac_isolation',        category: 'Health',       text: 'HVAC system should not be operated in affected areas until clearance testing confirms safe levels.' },

  // Clearance / no action
  { key: 'no_alerts',             category: 'Clearance',    text: 'No alerts were detected during screening — no further action recommended at this time.' },
  { key: 'reinspect_6_12',        category: 'Clearance',    text: 'Re-inspection recommended in 6-12 months as a precaution.' },
  { key: 'normal_environment',    category: 'Clearance',    text: 'Findings are consistent with a normal indoor environment — no remediation required.' },
]

// Default profile for Spore, the certified mold detection canine.
// Edit in Settings → Spore & Handler Profile.
export const DEFAULT_SPORE_PROFILE = {
  name:              'Spore',
  breed:             '',
  age_years:         '',
  certifying_body:   'Florida Canine Academy',
  certification_no:  '',                  // Fill in when cert arrives
  certified_date:    '',                  // Fill in when cert arrives
  photo_path:        '/brand/spore.png',  // Place your photo here when ready
  bio: 'Spore is a certified mold detection canine trained by the Florida Canine Academy. Canine scent detection is a non-invasive, presumptive method for identifying the possible presence of mold growth, including hidden growth that may not be visible to the naked eye. Spore is trained to alert on the volatile organic compounds (VOCs) produced by actively growing mold colonies.',
  tagline:           'Certified Mold Detection Canine',
}

// Default profile for the inspector/handler. Drives the handler credential
// page in the screening report. Edit in Settings → Spore & Handler Profile.
export const DEFAULT_HANDLER_PROFILE = {
  full_name:         '',                 // Auto-populated from user's profile on first load
  title:             'Certified Mold Detection Canine Handler',
  handler_cert_body: 'Florida Canine Academy',
  handler_cert_no:   '',
  handler_cert_date: '',
  // Industry credentials — free-text list of certifications and license numbers
  credentials: [
    // Example: { label: 'AHERA Building Inspector', number: '...' }
    // Example: { label: 'IICRC AMRT (Applied Microbial Remediation Tech)', number: '...' }
  ],
  years_experience: '',
  bio: 'Restoration professional certified in microbial assessment and remediation. Trained as a mold detection canine handler at the Florida Canine Academy. Member of the broader 1-800 WATER DAMAGE network and an experienced operator in the water mitigation and environmental services industries.',
}
