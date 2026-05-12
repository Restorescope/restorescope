import { supabase } from '../supabase'
import { getPhotoUrls } from '../photos'

/**
 * loadScreeningSnapshot — pull everything needed to render a screening report PDF.
 *
 * Returns a fully resolved object so the PDF renders synchronously.
 *
 * Contents:
 *   job, tenant
 *   inspection (intake + recommendations)
 *   authorization
 *   alerts (with photos linked by room)
 *   samples (lab data)
 *   photos (signed URLs)
 *   sporeProfile, handlerProfile (from app_settings)
 *   roomsByName (for ordering)
 */
export async function loadScreeningSnapshot(jobId, tenantId) {
  if (!tenantId) {
    throw new Error('Tenant ID required to load screening data.')
  }
  const [
    jobRes, tenantRes,
    inspectionRes, authRes,
    alertsRes, samplesRes,
    roomsRes,
    sporeSettingRes, handlerSettingRes,
  ] = await Promise.all([
    supabase.from('jobs')
      .select('id, job_number, customer, loss_info, status, created_at, screening_enabled, screening_only')
      .eq('id', jobId).maybeSingle(),
    supabase.from('tenants').select('id, company_name').limit(1).maybeSingle(),
    supabase.from('screening_inspections').select('*').eq('job_id', jobId).maybeSingle(),
    supabase.from('screening_authorizations').select('*').eq('job_id', jobId).maybeSingle(),
    supabase.from('screening_alerts').select('*').eq('job_id', jobId)
      .order('display_order', { nullsFirst: false }).order('recorded_at'),
    supabase.from('screening_samples').select('*').eq('job_id', jobId)
      .order('display_order', { nullsFirst: false }).order('created_at'),
    supabase.from('affected_rooms').select('id, room_name').eq('job_id', jobId),
    supabase.from('settings').select('data').eq('setting_type', 'spore_profile').eq('tenant_id', tenantId).maybeSingle(),
    supabase.from('settings').select('data').eq('setting_type', 'handler_profile').eq('tenant_id', tenantId).maybeSingle(),
  ])

  if (jobRes.error || !jobRes.data) {
    throw new Error(jobRes.error?.message || 'Job not found')
  }
  if (inspectionRes.error || !inspectionRes.data) {
    throw new Error('No screening inspection has been started. Go to the Screening dashboard and start one first.')
  }

  const job = jobRes.data
  const tenant = tenantRes.data
  const inspection = inspectionRes.data
  const authorization = authRes.data || null
  const alerts = alertsRes.data || []
  const samples = samplesRes.data || []
  const rooms = roomsRes.data || []
  const sporeProfile = sporeSettingRes.data?.data || null
  const handlerProfile = handlerSettingRes.data?.data || null

  // Load photos for screening categories
  const screeningCategories = [
    'screening_alert',
    'screening_thermal',
    'screening_visible',
    'screening_sample',
    'screening_general',
  ]
  const { data: photoRows } = await supabase.from('photos')
    .select('id, room_id, category, storage_path, caption, uploaded_at')
    .eq('job_id', jobId)
    .in('category', screeningCategories)
    .order('uploaded_at')

  // getPhotoUrls returns a Map of id → signed URL. Merge into each photo row.
  const urlMap = await getPhotoUrls(photoRows || [])
  const photos = (photoRows || []).map((p) => ({
    ...p,
    url: urlMap.get(p.id),
  })).filter((p) => p.url) // drop any without a resolved URL

  // Group alerts by room name (preserving order)
  const alertsByRoom = new Map()
  for (const alert of alerts) {
    const key = alert.room_name || 'Unspecified'
    if (!alertsByRoom.has(key)) alertsByRoom.set(key, [])
    alertsByRoom.get(key).push(alert)
  }

  // Photos by room
  const roomById = new Map(rooms.map((r) => [r.id, r.room_name]))
  const photosByRoom = new Map()
  for (const photo of photos) {
    const roomName = roomById.get(photo.room_id) || 'Unassigned'
    if (!photosByRoom.has(roomName)) photosByRoom.set(roomName, [])
    photosByRoom.get(roomName).push(photo)
  }

  // Counts for cover
  const positiveAlerts = alerts.filter((a) => a.alert_strength && a.alert_strength !== 'negative')
  const negativeAlerts = alerts.filter((a) => a.alert_strength === 'negative')

  // Samples filtered to those with results
  const samplesWithResults = samples.filter((s) => s.result_summary || s.result_notes)
  const samplesPending = samples.filter((s) => !s.result_summary && !s.result_notes)

  return {
    job,
    tenant,
    tenantName: tenant?.company_name || '1-800 WATER DAMAGE of North Dakota',
    inspection,
    authorization,
    alerts,
    alertsByRoom,
    positiveAlerts,
    negativeAlerts,
    samples,
    samplesWithResults,
    samplesPending,
    rooms,
    photos,
    photosByRoom,
    sporeProfile,
    handlerProfile,
    generatedAt: new Date().toISOString(),
  }
}
