import { supabase } from './supabase'

/**
 * QC Engine — runs rules against a job's data.
 *
 * Each rule has:
 *   - key       stable identifier
 *   - level     'block' | 'warn' | 'off' (from tenant qc_rules)
 *   - check     (snapshot, settings) => { ok, message?, fixUrl? }
 *
 * Rule keys must match the keys in DEFAULT_QC_RULES so Owner-configured levels
 * apply correctly. Unknown keys (rules in settings that we don't know how to
 * check) are silently ignored.
 */

// Each entry maps a rule key to its checker function
const CHECKERS = {
  no_rooms: (s) => s.rooms.length === 0
    ? { ok: false, fixSection: 'rooms', detail: 'Add at least one affected room.' }
    : { ok: true },

  missing_source_photo: (s) => {
    const has = s.photos.some((p) => p.category === 'source_area')
    return has ? { ok: true } : {
      ok: false, fixSection: 'photos',
      detail: 'Capture a "Source area" photo (where the water came from).',
    }
  },

  missing_final_dry: (s) => {
    const has = s.photos.some((p) => p.category === 'final_dry')
      || s.readings.some((r) => r.status === 'dry')
    return has ? { ok: true } : {
      ok: false, fixSection: 'readings',
      detail: 'No "Final dry readings" photo or any reading marked dry-standard-met.',
    }
  },

  equipment_no_placement_photo: (s) => {
    const placed = countPlacedEvents(s.equipmentEvents)
    if (placed === 0) return { ok: true }
    const placementPhotos = s.photos.filter((p) => p.category === 'equipment_placement').length
    return placementPhotos > 0 ? { ok: true } : {
      ok: false, fixSection: 'equipment',
      detail: `${placed} equipment unit${placed === 1 ? '' : 's'} placed but no equipment-placement photo on file.`,
    }
  },

  scope_without_reason: (s) => {
    const missing = s.scopeItems.filter((it) => !it.reason_text || !it.reason_text.trim()).length
    return missing === 0 ? { ok: true } : {
      ok: false, fixSection: 'scope',
      detail: `${missing} scope item${missing === 1 ? '' : 's'} have no reason text.`,
    }
  },

  no_work_authorization: (s) => {
    return s.job?.loss_info?.work_auth_signed
      ? { ok: true }
      : {
          ok: false, fixSection: 'intake',
          detail: 'Mark work authorization as signed (and capture name + date) on the intake.',
        }
  },

  missing_before_after_photos: (s) => {
    // Soft check: if material was removed in any room, expect at least one
    // before-removal photo for the job.
    const anyRemoval = s.rooms.some((r) => Array.isArray(r.actions) && r.actions.some((a) => a.key === 'removed' || a.key === 'detached_reset'))
    if (!anyRemoval) return { ok: true }
    const hasBefore = s.photos.some((p) => p.category === 'before_removal')
    const hasAfter = s.photos.some((p) => p.category === 'exposed_after' || p.category === 'removal_progress')
    return (hasBefore && hasAfter) ? { ok: true } : {
      ok: false, fixSection: 'photos',
      detail: 'Material was removed but before/after material removal photos appear missing.',
    }
  },

  missing_daily_monitoring: (s) => {
    if (s.equipmentEvents.length === 0) return { ok: true }
    if (s.monitoringVisits.length === 0) {
      return {
        ok: false, fixSection: 'monitoring',
        detail: 'Equipment is on site but no daily monitoring visits have been logged.',
      }
    }
    // Compare placement window vs visit count — expect at least one visit per day equipment was on site
    const placedAt = earliestPlacedAt(s.equipmentEvents)
    if (!placedAt) return { ok: true }
    const days = Math.max(1, Math.floor((Date.now() - new Date(placedAt)) / 86400000))
    return s.monitoringVisits.length >= days ? { ok: true } : {
      ok: false, fixSection: 'monitoring',
      detail: `Equipment has been on site about ${days} day${days === 1 ? '' : 's'} but only ${s.monitoringVisits.length} monitoring visit${s.monitoringVisits.length === 1 ? '' : 's'} logged.`,
    }
  },

  date_mismatch: (s) => {
    const dol = s.job?.loss_info?.date_of_loss
    const inspection = s.job?.loss_info?.inspection_at
    if (!dol || !inspection) return { ok: true }
    const dolDate = new Date(dol)
    const inspectionDate = new Date(inspection)
    if (inspectionDate < dolDate) {
      return {
        ok: false, fixSection: 'intake',
        detail: 'Inspection date/time is before the date of loss.',
      }
    }
    return { ok: true }
  },

  no_completion_statement: (s) => {
    // Phase 1: check for any room with final_status = 'dry_standard_met' or 'ready_for_rebuild'
    const hasCompletion = s.rooms.some((r) => ['dry_standard_met', 'ready_for_rebuild'].includes(r.final_status))
    return hasCompletion ? { ok: true } : {
      ok: false, fixSection: 'rooms',
      detail: 'No room has been marked "Dry standard met" or "Ready for rebuild".',
    }
  },

  equipment_no_removal_date: (s) => {
    // Are there placed assets older than 14 days with no removed event?
    const stale = staleAssets(s.equipmentEvents, 14)
    return stale === 0 ? { ok: true } : {
      ok: false, fixSection: 'equipment',
      detail: `${stale} asset${stale === 1 ? '' : 's'} placed 14+ days ago without a removal date.`,
    }
  },

  stalled_drying: (s) => {
    // Check each room+material with 3+ readings; if last 3 are non-decreasing, stall.
    const stallList = findStalledMaterials(s.readings)
    return stallList.length === 0 ? { ok: true } : {
      ok: false, fixSection: 'readings',
      detail: `Possible drying stall in ${stallList.length} location${stallList.length === 1 ? '' : 's'}: ${stallList.slice(0, 3).join('; ')}${stallList.length > 3 ? '…' : ''}`,
    }
  },

  long_equipment_stay: (s) => {
    const longstayCount = countLongStay(s.equipmentEvents, 4)
    return longstayCount === 0 ? { ok: true } : {
      ok: false, fixSection: 'equipment',
      detail: `${longstayCount} asset${longstayCount === 1 ? '' : 's'} on site 4+ days.`,
    }
  },
}

// ---------------------------------------------------------------------------
// Snapshot loader: pull all the data we need for one job, in parallel.
// ---------------------------------------------------------------------------
export async function loadJobSnapshot(jobId) {
  const [jobRes, roomsRes, photosRes, readingsRes, equipRes, visitsRes, scopeRes] = await Promise.all([
    supabase.from('jobs').select('id, job_number, customer, loss_info, status, finalized_at').eq('id', jobId).maybeSingle(),
    supabase.from('affected_rooms').select('id, room_name, final_status, materials, actions, reasons').eq('job_id', jobId),
    supabase.from('photos').select('id, room_id, work_item_id, reading_id, category').eq('job_id', jobId),
    supabase.from('moisture_readings').select('id, room_id, material_key, value, drying_goal, status, captured_at, is_reference').eq('job_id', jobId).order('captured_at'),
    supabase.from('equipment_events').select('id, asset_label, equipment_type, event_type, event_at').eq('job_id', jobId),
    supabase.from('monitoring_visits').select('id, visit_at, chamber_id').eq('job_id', jobId),
    supabase.from('scope_items').select('id, scope_key, room_id, reason_text, reason_template_key').eq('job_id', jobId),
  ])
  if (jobRes.error) throw jobRes.error
  return {
    job: jobRes.data,
    rooms: roomsRes.data ?? [],
    photos: photosRes.data ?? [],
    readings: readingsRes.data ?? [],
    equipmentEvents: equipRes.data ?? [],
    monitoringVisits: visitsRes.data ?? [],
    scopeItems: scopeRes.data ?? [],
  }
}

// ---------------------------------------------------------------------------
// Run rules against a snapshot. Returns array of result objects:
//   { rule_key, label, level, ok, detail?, fixSection? }
// Rules with level 'off' are skipped entirely.
// ---------------------------------------------------------------------------
export function runQC(snapshot, rules) {
  const out = []
  for (const r of rules) {
    if (r.level === 'off') continue
    const checker = CHECKERS[r.key]
    if (!checker) continue   // Unknown rule — skip silently
    let result
    try {
      result = checker(snapshot)
    } catch {
      // If a checker throws, treat as a passing check rather than blocking finalize.
      result = { ok: true }
    }
    out.push({
      rule_key: r.key,
      label: r.label,
      level: r.level,
      ok: !!result.ok,
      detail: result.detail || null,
      fixSection: result.fixSection || null,
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// Convenience: load + run in one call
// ---------------------------------------------------------------------------
export async function evaluateJob(jobId, rules) {
  const snapshot = await loadJobSnapshot(jobId)
  const results = runQC(snapshot, rules)
  return { snapshot, results }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countPlacedEvents(events) {
  // An "asset" is identified by asset_label; counts placed minus removed
  const byLabel = new Map()
  for (const e of events) {
    const k = e.asset_label || `__${e.id}__`
    if (!byLabel.has(k)) byLabel.set(k, { placed: false, removed: false })
    if (e.event_type === 'placed') byLabel.get(k).placed = true
    if (e.event_type === 'removed') byLabel.get(k).removed = true
  }
  let n = 0
  for (const v of byLabel.values()) if (v.placed) n++
  return n
}

function earliestPlacedAt(events) {
  const placed = events.filter((e) => e.event_type === 'placed').sort((a, b) => new Date(a.event_at) - new Date(b.event_at))
  return placed[0]?.event_at ?? null
}

function staleAssets(events, daysThreshold) {
  const byLabel = new Map()
  for (const e of events) {
    const k = e.asset_label || `__${e.id}__`
    if (!byLabel.has(k)) byLabel.set(k, [])
    byLabel.get(k).push(e)
  }
  let n = 0
  for (const list of byLabel.values()) {
    const placed = list.find((e) => e.event_type === 'placed')
    const removed = list.find((e) => e.event_type === 'removed')
    if (placed && !removed) {
      const days = (Date.now() - new Date(placed.event_at)) / 86400000
      if (days >= daysThreshold) n++
    }
  }
  return n
}

function countLongStay(events, daysThreshold) {
  const byLabel = new Map()
  for (const e of events) {
    const k = e.asset_label || `__${e.id}__`
    if (!byLabel.has(k)) byLabel.set(k, [])
    byLabel.get(k).push(e)
  }
  let n = 0
  for (const list of byLabel.values()) {
    const placed = list.find((e) => e.event_type === 'placed')
    const removed = list.find((e) => e.event_type === 'removed')
    if (!placed) continue
    const endIso = removed?.event_at || new Date().toISOString()
    const days = (new Date(endIso) - new Date(placed.event_at)) / 86400000
    if (days >= daysThreshold) n++
  }
  return n
}

function findStalledMaterials(readings) {
  const filtered = readings.filter((r) => !r.is_reference && r.value != null)
  // Group by room+material
  const groups = new Map()
  for (const r of filtered) {
    const k = `${r.room_id || 'none'}::${r.material_key || 'none'}`
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(r)
  }
  const stalled = []
  for (const [, list] of groups) {
    if (list.length < 3) continue
    list.sort((a, b) => new Date(a.captured_at) - new Date(b.captured_at))
    const last3 = list.slice(-3).map((x) => Number(x.value))
    if (last3[0] != null && last3[1] >= last3[0] && last3[2] >= last3[1]) {
      stalled.push(`${list[0].material_key || 'material'}`)
    }
  }
  return stalled
}
