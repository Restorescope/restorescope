/**
 * photoRequirements.js
 *
 * Pure functions that take a job + its photos + rooms + equipment + work types
 * and compute:
 *
 *   1) the list of REQUIREMENTS that apply to this job (filtered from the catalog)
 *   2) for each requirement, how it's currently satisfied (met/partial/missing)
 *   3) an overall DOCUMENTATION HEALTH SCORE (0-100)
 *
 * No DB calls. Caller fetches inputs and passes them in.
 *
 * Inputs:
 *   job              — jobs row (loss_info has category/class_of_water, work_types_performed[], photo_requirements_enabled)
 *   photos           — array of photo rows ({ category, caption })
 *   rooms            — array of affected_rooms rows ({ materials[], actions[] })
 *   equipment        — array of equipment rows
 *   catalog          — array of photo_requirements rows (already RLS-filtered)
 *   overrides        — array of photo_requirement_overrides rows for this job
 *   daysOnSite       — int, optional (defaults to 1)
 */

const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()

/**
 * Auto-detect work types from affected_rooms.materials + actions.
 * Returns a Set of work_type strings like 'drywall_removal', 'carpet_removal'.
 *
 * Mapping rules (each material's action key === 'removed' means that material was removed):
 *   drywall, sheetrock → drywall_removal
 *   carpet → carpet_removal
 *   baseboard → baseboard_removal
 *   cabinet, vanity → cabinet_removal
 *   hardwood, wood_floor → hardwood_removal
 *   vinyl, lvp, laminate → vinyl_removal
 *   tile → tile_removal
 *   subfloor → subfloor_removal
 *   insulation → insulation_removal
 *   ceiling → ceiling_removal
 *   trim, door → trim_removal
 */
const MATERIAL_TO_WORK_TYPE = {
  drywall: 'drywall_removal',
  sheetrock: 'drywall_removal',
  carpet: 'carpet_removal',
  carpet_pad: 'carpet_removal',
  pad: 'carpet_removal',
  baseboard: 'baseboard_removal',
  cabinet: 'cabinet_removal',
  vanity: 'cabinet_removal',
  hardwood: 'hardwood_removal',
  wood_floor: 'hardwood_removal',
  vinyl: 'vinyl_removal',
  lvp: 'vinyl_removal',
  laminate: 'vinyl_removal',
  tile: 'tile_removal',
  subfloor: 'subfloor_removal',
  insulation: 'insulation_removal',
  ceiling: 'ceiling_removal',
  trim: 'trim_removal',
  door: 'trim_removal',
}

export function autoDetectWorkTypes(rooms = []) {
  const types = new Set()
  for (const room of rooms) {
    const actions = (room.actions || []).map((a) => (a.key || a.action || '').toLowerCase())
    const hasRemoval = actions.includes('removed') || actions.includes('removal')
    if (!hasRemoval) continue
    const materials = (room.materials || []).map((m) => (m.key || m.material || '').toLowerCase())
    for (const m of materials) {
      const mapped = MATERIAL_TO_WORK_TYPE[m]
      if (mapped) types.add(mapped)
    }
  }
  return types
}

/**
 * Combine auto-detected work types with manually-checked ones on the job.
 */
export function getJobWorkTypes(job, rooms = []) {
  const manual = new Set(job.work_types_performed || [])
  const auto = autoDetectWorkTypes(rooms)
  for (const t of auto) manual.add(t)
  return manual
}

/**
 * Evaluate an applies_when clause against job context.
 * Supports: always, water_category, water_class, has_work, any_of, all_of.
 */
export function evalApplies(clause, ctx) {
  if (!clause || clause.always === true) return true
  if (clause.any_of) return clause.any_of.some((c) => evalApplies(c, ctx))
  if (clause.all_of) return clause.all_of.every((c) => evalApplies(c, ctx))
  if (clause.water_category) {
    if (!clause.water_category.map(String).includes(String(ctx.waterCategory))) return false
  }
  if (clause.water_class) {
    if (!clause.water_class.map(String).includes(String(ctx.waterClass))) return false
  }
  if (clause.has_work) {
    if (!clause.has_work.some((w) => ctx.workTypes.has(w))) return false
  }
  return true
}

/**
 * Count how many photos satisfy a requirement.
 *   - Must be in the right category
 *   - If caption_keywords are set, the caption must contain at least one keyword
 *     (case-insensitive, partial match)
 *   - If no caption_keywords, any photo in the category counts
 */
export function countMatches(req, photos) {
  const cat = req.category
  const keywords = (req.caption_keywords || []).map(norm).filter(Boolean)
  let count = 0
  for (const p of photos) {
    if (p.category !== cat) continue
    if (keywords.length === 0) {
      count++
      continue
    }
    const caption = norm(p.caption)
    if (keywords.some((kw) => caption.includes(kw))) count++
  }
  return count
}

/**
 * Compute the minimum number of photos needed for this requirement given
 * its per_room / per_equipment / per_day modifiers.
 */
export function computeMinCount(req, ctx) {
  let n = req.min_count || 1
  if (req.per_room) n = Math.max(n, ctx.roomCount * (req.min_count || 1))
  if (req.per_equipment) n = Math.max(n, ctx.equipmentCount * (req.min_count || 1))
  if (req.per_day) n = Math.max(n, ctx.daysOnSite * (req.min_count || 1))
  return Math.max(n, 1)
}

/**
 * The main calculation. Returns:
 *   {
 *     requirements: [{ req, status, photosMatched, photosNeeded, isOverridden }, ...],
 *     score: 0-100,
 *     metCount, totalCount, requiredMetCount, requiredTotalCount
 *   }
 */
export function computeJobRequirements({ job, photos = [], rooms = [], equipment = [], catalog = [], overrides = [], daysOnSite = 1 }) {
  if (!job?.photo_requirements_enabled) {
    return { requirements: [], score: null, metCount: 0, totalCount: 0, requiredMetCount: 0, requiredTotalCount: 0, disabled: true }
  }

  const ctx = {
    waterCategory: job.loss_info?.category,
    waterClass: job.loss_info?.class_of_water,
    workTypes: getJobWorkTypes(job, rooms),
    roomCount: Math.max(rooms.length, 1),
    equipmentCount: Math.max(equipment.length, 1),
    daysOnSite: Math.max(daysOnSite, 1),
  }
  const overrideKeys = new Set(overrides.map((o) => o.requirement_key))

  const items = []
  for (const req of catalog) {
    if (!req.active) continue
    if (!evalApplies(req.applies_when, ctx)) continue
    const photosNeeded = computeMinCount(req, ctx)
    const photosMatched = countMatches(req, photos)
    const isOverridden = overrideKeys.has(req.key)
    let status
    if (isOverridden) status = 'overridden'
    else if (photosMatched >= photosNeeded) status = 'met'
    else if (photosMatched > 0) status = 'partial'
    else status = 'missing'
    items.push({
      req, status, photosMatched, photosNeeded, isOverridden,
      override: isOverridden ? overrides.find((o) => o.requirement_key === req.key) : null,
    })
  }

  // Sort by severity then sort_order
  items.sort((a, b) => {
    const sa = a.req.severity === 'required' ? 0 : 1
    const sb = b.req.severity === 'required' ? 0 : 1
    if (sa !== sb) return sa - sb
    return (a.req.sort_order || 100) - (b.req.sort_order || 100)
  })

  const required = items.filter((i) => i.req.severity === 'required')
  const requiredMet = required.filter((i) => i.status === 'met' || i.status === 'overridden').length
  const score = required.length > 0 ? Math.round((requiredMet / required.length) * 100) : 100

  return {
    requirements: items,
    score,
    metCount: items.filter((i) => i.status === 'met' || i.status === 'overridden').length,
    totalCount: items.length,
    requiredMetCount: requiredMet,
    requiredTotalCount: required.length,
    disabled: false,
  }
}

/**
 * Score → color tone for the badge.
 *  >= 80   green
 *  50-79   yellow
 *  < 50    red
 */
export function scoreTone(score) {
  if (score == null) return 'gray'
  if (score >= 80) return 'green'
  if (score >= 50) return 'yellow'
  return 'red'
}
