import { supabase } from '../supabase'
import { getPhotoUrls } from '../photos'

/**
 * loadReportSnapshot — pull everything we need to render a job's report PDF.
 *
 * Returns a fully resolved object so the report can render synchronously
 * (no async fetches inside @react-pdf components — those don't work).
 *
 * Includes:
 *   - job, tenant info
 *   - rooms with chamber names
 *   - readings (sorted, grouped helpers attached)
 *   - equipment events grouped by asset_label
 *   - monitoring visits
 *   - scope items
 *   - photos with signed URLs (smart-filtered to categories that have content)
 *   - settings: scope_library, materials, meters, equipment for label resolution
 */
export async function loadReportSnapshot(jobId) {
  const [
    jobRes, tenantRes,
    roomsRes, chambersRes,
    readingsRes,
    equipRes, visitsRes,
    scopeRes, photosRes,
    matsRes, metersRes, equipSetRes, scopeSetRes,
  ] = await Promise.all([
    supabase.from('jobs')
      .select('id, job_number, customer, loss_info, status, created_at, finalized_at')
      .eq('id', jobId).maybeSingle(),
    supabase.from('tenants').select('id, company_name, branding').limit(1).maybeSingle(),
    supabase.from('affected_rooms')
      .select('id, room_name, chamber_id, materials, actions, reasons, final_status, notes, created_at')
      .eq('job_id', jobId).order('created_at'),
    supabase.from('drying_chambers')
      .select('id, name, class_of_water, atmosphere_cuft, reference_room')
      .eq('job_id', jobId).order('created_at'),
    supabase.from('moisture_readings')
      .select('id, room_id, chamber_id, material_key, point_label, meter_type, unit, value, drying_goal, goal_source, is_reference, status, notes, captured_at')
      .eq('job_id', jobId).order('captured_at'),
    supabase.from('equipment_events')
      .select('id, chamber_id, room_id, event_type, equipment_type, asset_label, asset_id, purpose, notes, event_at')
      .eq('job_id', jobId).order('event_at'),
    supabase.from('monitoring_visits')
      .select('id, chamber_id, visit_at, ambient_temp_f, ambient_rh, ambient_gpp, dehu_intake_rh, dehu_intake_gpp, dehu_exhaust_gpp, grain_depression, hours_running, notes')
      .eq('job_id', jobId).order('visit_at'),
    supabase.from('scope_items')
      .select('id, room_id, scope_key, reason_template_key, reason_text, quantity, unit, created_at')
      .eq('job_id', jobId).order('created_at'),
    supabase.from('photos')
      .select('id, room_id, work_item_id, reading_id, category, storage_path, caption, taken_at')
      .eq('job_id', jobId).order('taken_at'),
    supabase.from('settings').select('data').eq('setting_type', 'materials').maybeSingle(),
    supabase.from('settings').select('data').eq('setting_type', 'meters').maybeSingle(),
    supabase.from('settings').select('data').eq('setting_type', 'equipment').maybeSingle(),
    supabase.from('settings').select('data').eq('setting_type', 'scope_library').maybeSingle(),
  ])

  if (jobRes.error || !jobRes.data) throw new Error(jobRes.error?.message || 'Job not found')

  const photos = photosRes.data ?? []
  // Resolve signed URLs for every photo so the PDF can embed images
  const urlMap = await getPhotoUrls(photos, 60 * 60 * 6)
  // Pre-fetch each image as a data URL — react-pdf needs the bytes, not just a URL,
  // because the rendering happens in Node-shaped code that can't fetch cross-origin.
  // Doing this client-side via fetch is fine because we're already in a browser.
  const photosWithData = []
  for (const p of photos) {
    const url = urlMap.get(p.id)
    if (!url) continue
    try {
      const blob = await fetch(url).then((r) => r.blob())
      const dataUrl = await new Promise((res, rej) => {
        const reader = new FileReader()
        reader.onload = () => res(reader.result)
        reader.onerror = rej
        reader.readAsDataURL(blob)
      })
      photosWithData.push({ ...p, dataUrl })
    } catch {
      // Skip a photo if fetch fails — don't blow up the whole report
      photosWithData.push({ ...p, dataUrl: null })
    }
  }

  return {
    job: jobRes.data,
    tenant: tenantRes.data,
    rooms: roomsRes.data ?? [],
    chambers: chambersRes.data ?? [],
    readings: readingsRes.data ?? [],
    equipmentEvents: equipRes.data ?? [],
    monitoringVisits: visitsRes.data ?? [],
    scopeItems: scopeRes.data ?? [],
    photos: photosWithData,
    settings: {
      materials:    matsRes.data?.data?.items ?? [],
      meters:       metersRes.data?.data?.items ?? [],
      equipment:    equipSetRes.data?.data?.items ?? [],
      scopeLibrary: scopeSetRes.data?.data?.items ?? [],
    },
    generatedAt: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Helpers used by report sections
// ---------------------------------------------------------------------------

export function labelLookup(items, key, fallback) {
  if (!key) return fallback ?? '—'
  const match = (items ?? []).find((it) => it.key === key)
  return match?.label || prettyKey(key)
}

export function prettyKey(key) {
  if (!key) return '—'
  return String(key).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function formatDate(iso, opts) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, opts || { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return '—'
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

/**
 * Group equipment events into "asset" rows (placement → removal pair) for
 * cleaner reporting. Returns array of { asset_label, equipment_type, placed_at,
 * removed_at, days_on_site, room_id, chamber_id, purpose }.
 */
export function buildEquipmentAssetList(events) {
  const byKey = new Map()
  for (const e of events) {
    const key = e.asset_label || `__${e.id}__`
    if (!byKey.has(key)) byKey.set(key, [])
    byKey.get(key).push(e)
  }
  const out = []
  for (const [key, list] of byKey) {
    const placed = list.find((e) => e.event_type === 'placed')
    const removed = list.find((e) => e.event_type === 'removed')
    const seed = placed || list[0]
    const placedAt = placed?.event_at || seed.event_at
    const removedAt = removed?.event_at || null
    const days = computeDays(placedAt, removedAt || new Date().toISOString())
    out.push({
      key,
      asset_label: seed.asset_label,
      asset_id:    seed.asset_id,
      equipment_type: seed.equipment_type,
      room_id:     seed.room_id,
      chamber_id:  seed.chamber_id,
      purpose:     seed.purpose,
      placed_at:   placedAt,
      removed_at:  removedAt,
      days_on_site: days,
    })
  }
  out.sort((a, b) => new Date(a.placed_at) - new Date(b.placed_at))
  return out
}

function computeDays(startIso, endIso) {
  const ms = new Date(endIso) - new Date(startIso)
  if (!Number.isFinite(ms) || ms < 0) return 0
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}
