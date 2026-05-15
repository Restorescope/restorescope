/**
 * photoRequirements.js — engine for job-level + per-room photo requirements.
 *
 * Returns:
 *   {
 *     job: { items, score, requiredMetCount, requiredTotalCount },
 *     rooms: [
 *       { room, items, score, requiredMetCount, requiredTotalCount },
 *       ...
 *     ],
 *     score: <combined overall score 0-100>,
 *     requiredMetCount, requiredTotalCount,
 *     disabled: bool
 *   }
 *
 * Each "item" in items is:
 *   { req, status, photosMatched, photosNeeded, isOverridden, roomId? }
 *
 * Scopes:
 *   'job'                 — evaluated once. Photos with any room_id can count (back-compat).
 *   'per_room'            — one instance per affected_rooms row. Photo's room_id must match.
 *   'per_room_if_action'  — same as per_room, BUT only fires for rooms whose materials/actions
 *                           match the applies_when clauses (room_has_material, room_has_action).
 */

const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()

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
    if (!actions.includes('removed') && !actions.includes('removal')) continue
    const materials = (room.materials || []).map((m) => (m.key || m.material || '').toLowerCase())
    for (const m of materials) {
      const mapped = MATERIAL_TO_WORK_TYPE[m]
      if (mapped) types.add(mapped)
    }
  }
  return types
}

export function getJobWorkTypes(job, rooms = []) {
  const manual = new Set(job.work_types_performed || [])
  const auto = autoDetectWorkTypes(rooms)
  for (const t of auto) manual.add(t)
  return manual
}

function roomMaterials(room) {
  return new Set((room.materials || []).map((m) => (m.key || m.material || '').toLowerCase()))
}
function roomActions(room) {
  return new Set((room.actions || []).map((a) => (a.key || a.action || '').toLowerCase()))
}

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
  if (clause.room_has_material) {
    if (!ctx.roomMaterials) return false
    if (!clause.room_has_material.some((m) => ctx.roomMaterials.has(m))) return false
  }
  if (clause.room_has_action) {
    if (!ctx.roomActions) return false
    if (!clause.room_has_action.some((a) => ctx.roomActions.has(a))) return false
  }
  return true
}

/**
 * roomId argument:
 *   null    — only count photos with room_id IS NULL (strict job-level matching)
 *   'any'   — count any photo regardless of room_id (back-compat for job-level)
 *   <uuid>  — only count photos with room_id === uuid (per-room)
 */
export function countMatches(req, photos, roomId = 'any') {
  const cat = req.category
  const keywords = (req.caption_keywords || []).map(norm).filter(Boolean)
  let count = 0
  for (const p of photos) {
    if (p.category !== cat) continue
    if (roomId === null) {
      if (p.room_id != null) continue
    } else if (roomId !== 'any') {
      if (p.room_id !== roomId) continue
    }
    if (keywords.length === 0) {
      count++
      continue
    }
    const caption = norm(p.caption)
    if (keywords.some((kw) => caption.includes(kw))) count++
  }
  return count
}

export function computeMinCount(req, ctx) {
  let n = req.min_count || 1
  if (req.per_equipment) n = Math.max(n, ctx.equipmentCount * (req.min_count || 1))
  if (req.per_day) n = Math.max(n, ctx.daysOnSite * (req.min_count || 1))
  return Math.max(n, 1)
}

export function computeJobRequirements({ job, photos = [], rooms = [], equipment = [], catalog = [], overrides = [], daysOnSite = 1 }) {
  if (!job?.photo_requirements_enabled) {
    return { job: null, rooms: [], score: null, requiredMetCount: 0, requiredTotalCount: 0, disabled: true }
  }

  const baseCtx = {
    waterCategory: job.loss_info?.category,
    waterClass: job.loss_info?.class_of_water,
    workTypes: getJobWorkTypes(job, rooms),
    equipmentCount: Math.max(equipment.length, 1),
    daysOnSite: Math.max(daysOnSite, 1),
  }
  const overrideKeysJob = new Set(overrides.filter((o) => !o.room_id).map((o) => o.requirement_key))

  // JOB-LEVEL
  const jobItems = []
  for (const req of catalog) {
    if (!req.active) continue
    if (req.scope !== 'job') continue
    if (!evalApplies(req.applies_when, baseCtx)) continue
    const photosNeeded = computeMinCount(req, baseCtx)
    const photosMatched = countMatches(req, photos, 'any')
    const isOverridden = overrideKeysJob.has(req.key)
    const status = isOverridden ? 'overridden'
      : photosMatched >= photosNeeded ? 'met'
      : photosMatched > 0 ? 'partial'
      : 'missing'
    jobItems.push({
      req, status, photosMatched, photosNeeded, isOverridden,
      override: isOverridden ? overrides.find((o) => o.requirement_key === req.key && !o.room_id) : null,
    })
  }
  jobItems.sort(sortItems)
  const jobRequired = jobItems.filter((i) => i.req.severity === 'required')
  const jobRequiredMet = jobRequired.filter((i) => i.status === 'met' || i.status === 'overridden').length
  const jobScore = jobRequired.length > 0 ? Math.round((jobRequiredMet / jobRequired.length) * 100) : 100

  // PER-ROOM
  const perRoom = []
  for (const room of rooms) {
    const roomCtx = {
      ...baseCtx,
      roomMaterials: roomMaterials(room),
      roomActions: roomActions(room),
    }
    const overrideKeysRoom = new Set(overrides.filter((o) => o.room_id === room.id).map((o) => o.requirement_key))
    const items = []
    for (const req of catalog) {
      if (!req.active) continue
      if (req.scope === 'job') continue
      if (!evalApplies(req.applies_when, roomCtx)) continue
      const photosNeeded = computeMinCount(req, roomCtx)
      const photosMatched = countMatches(req, photos, room.id)
      const isOverridden = overrideKeysRoom.has(req.key)
      const status = isOverridden ? 'overridden'
        : photosMatched >= photosNeeded ? 'met'
        : photosMatched > 0 ? 'partial'
        : 'missing'
      items.push({
        req, status, photosMatched, photosNeeded, isOverridden, roomId: room.id,
        override: isOverridden ? overrides.find((o) => o.requirement_key === req.key && o.room_id === room.id) : null,
      })
    }
    items.sort(sortItems)
    const required = items.filter((i) => i.req.severity === 'required')
    const requiredMet = required.filter((i) => i.status === 'met' || i.status === 'overridden').length
    const score = required.length > 0 ? Math.round((requiredMet / required.length) * 100) : 100
    perRoom.push({
      room,
      items,
      score,
      requiredMetCount: requiredMet,
      requiredTotalCount: required.length,
    })
  }

  // OVERALL
  let totalRequired = jobRequired.length
  let totalRequiredMet = jobRequiredMet
  for (const r of perRoom) {
    totalRequired += r.requiredTotalCount
    totalRequiredMet += r.requiredMetCount
  }
  const overall = totalRequired > 0 ? Math.round((totalRequiredMet / totalRequired) * 100) : 100

  return {
    job: { items: jobItems, score: jobScore, requiredMetCount: jobRequiredMet, requiredTotalCount: jobRequired.length },
    rooms: perRoom,
    score: overall,
    requiredMetCount: totalRequiredMet,
    requiredTotalCount: totalRequired,
    disabled: false,
  }
}

function sortItems(a, b) {
  const sa = a.req.severity === 'required' ? 0 : 1
  const sb = b.req.severity === 'required' ? 0 : 1
  if (sa !== sb) return sa - sb
  return (a.req.sort_order || 100) - (b.req.sort_order || 100)
}

export function scoreTone(score) {
  if (score == null) return 'gray'
  if (score >= 80) return 'green'
  if (score >= 50) return 'yellow'
  return 'red'
}
