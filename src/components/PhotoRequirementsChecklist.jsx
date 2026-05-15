import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { Card, CardHeader, CardBody, CardTitle, Badge, Button } from '../ui'
import { computeJobRequirements, scoreTone } from '../lib/photoRequirements'

/**
 * PhotoRequirementsChecklist
 *
 * Live checklist of required photos for a job. Shown on the Photos screen
 * (and on the Job dashboard's documentation summary).
 *
 * Props:
 *   jobId
 *   compact   — show compact summary instead of full checklist (for dashboards)
 *
 * Internally fetches:
 *   - jobs row (for loss_info, work_types_performed, photo_requirements_enabled)
 *   - photos for this job
 *   - affected_rooms for this job
 *   - equipment (count, types)
 *   - photo_requirements catalog (system + tenant)
 *   - photo_requirement_overrides for this job
 *
 * Subscribes to photo changes via supabase realtime so the checklist
 * updates live as techs upload photos.
 */
export default function PhotoRequirementsChecklist({ jobId, compact = false }) {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [job, setJob] = useState(null)
  const [photos, setPhotos] = useState([])
  const [rooms, setRooms] = useState([])
  const [equipment, setEquipment] = useState([])
  const [catalog, setCatalog] = useState([])
  const [overrides, setOverrides] = useState([])
  const [expanded, setExpanded] = useState(!compact)
  const [enabling, setEnabling] = useState(false)

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const [jobRes, photosRes, roomsRes, eqRes, catalogRes, overridesRes] = await Promise.all([
        supabase.from('jobs').select('id, loss_info, work_types_performed, photo_requirements_enabled').eq('id', jobId).single(),
        supabase.from('photos').select('id, category, caption').eq('job_id', jobId),
        supabase.from('affected_rooms').select('id, materials, actions').eq('job_id', jobId),
        supabase.from('equipment').select('id').eq('job_id', jobId),
        supabase.from('photo_requirements').select('*').or(`tenant_id.is.null,tenant_id.eq.${profile.tenant_id}`).eq('active', true),
        supabase.from('photo_requirement_overrides').select('*').eq('job_id', jobId),
      ])
      if (jobRes.error) throw jobRes.error
      setJob(jobRes.data)
      setPhotos(photosRes.data || [])
      setRooms(roomsRes.data || [])
      setEquipment(eqRes.data || [])
      setCatalog(catalogRes.data || [])
      setOverrides(overridesRes.data || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [jobId])

  // Realtime subscription on photos so the checklist auto-updates
  useEffect(() => {
    if (!jobId) return
    const channel = supabase
      .channel(`photos-${jobId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'photos', filter: `job_id=eq.${jobId}` }, () => load())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [jobId])

  const result = useMemo(() => {
    if (!job) return null
    return computeJobRequirements({ job, photos, rooms, equipment, catalog, overrides })
  }, [job, photos, rooms, equipment, catalog, overrides])

  async function enableForJob() {
    setEnabling(true)
    try {
      const { error: e } = await supabase.from('jobs').update({ photo_requirements_enabled: true }).eq('id', jobId)
      if (e) throw e
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setEnabling(false)
    }
  }

  if (loading) return null
  if (error) return <p className="text-xs text-danger">Couldn't load photo requirements: {error}</p>

  // Job has requirements turned off — offer to enable
  if (result?.disabled) {
    if (compact) return null
    return (
      <Card>
        <CardBody className="flex items-center gap-3 flex-wrap">
          <div className="flex-1">
            <p className="text-sm font-semibold text-ink-900">Photo requirements disabled for this job</p>
            <p className="text-xs text-ink-600 mt-0.5">Enable to see a checklist of required photos and a documentation health score.</p>
          </div>
          <Button onClick={enableForJob} loading={enabling} variant="ghost" size="sm">Enable</Button>
        </CardBody>
      </Card>
    )
  }

  if (!result || result.requirements.length === 0) return null
  const tone = scoreTone(result.score)
  const toneColors = {
    green:  'bg-green-50 border-green-300 text-green-900',
    yellow: 'bg-yellow-50 border-yellow-300 text-yellow-900',
    red:    'bg-red-50 border-red-300 text-red-900',
    gray:   'bg-ink-50 border-ink-300 text-ink-900',
  }

  // Compact mode: just the score badge + summary line
  if (compact) {
    return (
      <span className={`inline-flex items-center gap-2 px-2 py-1 rounded border text-xs font-semibold ${toneColors[tone]}`}>
        <span>Doc score: {result.score}</span>
        <span className="opacity-70">· {result.requiredMetCount}/{result.requiredTotalCount} required</span>
      </span>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle>Photo requirements</CardTitle>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded border text-sm font-semibold ${toneColors[tone]}`}>
              <span>Score: {result.score}</span>
              <span className="opacity-70 text-xs">· {result.requiredMetCount}/{result.requiredTotalCount} required met</span>
            </span>
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="text-xs text-brand-blue underline hover:no-underline"
            >
              {expanded ? 'Collapse' : 'Show details'}
            </button>
          </div>
        </div>
        <p className="text-xs text-ink-500 mt-1">
          Required photos based on this job's category, class, and work performed. Updates live as you upload.
        </p>
      </CardHeader>
      {expanded && (
        <CardBody className="space-y-2">
          {result.requirements.map((item) => (
            <RequirementRow key={item.req.key} item={item} />
          ))}
        </CardBody>
      )}
    </Card>
  )
}

function RequirementRow({ item }) {
  const { req, status, photosMatched, photosNeeded } = item
  const iconByStatus = {
    met: '✓',
    partial: '◐',
    missing: '✗',
    overridden: '—',
  }
  const colorByStatus = {
    met: 'text-green-700',
    partial: 'text-yellow-700',
    missing: req.severity === 'required' ? 'text-danger' : 'text-ink-500',
    overridden: 'text-ink-500',
  }
  const bgByStatus = {
    met: 'bg-green-50/30',
    partial: 'bg-yellow-50/40',
    missing: req.severity === 'required' ? 'bg-red-50/30' : 'bg-ink-50/30',
    overridden: 'bg-ink-50/30',
  }
  return (
    <div className={`flex items-start gap-3 p-2 rounded ${bgByStatus[status]}`}>
      <div className={`text-lg font-bold ${colorByStatus[status]} mt-0.5 w-5 text-center`}>
        {iconByStatus[status]}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-ink-900">{req.label}</span>
          {req.severity === 'recommended' && (
            <Badge tone="neutral">Recommended</Badge>
          )}
          <span className={`text-xs font-mono ${colorByStatus[status]}`}>
            {photosMatched}/{photosNeeded}
          </span>
        </div>
        {req.description && (
          <p className="text-xs text-ink-500 mt-0.5">{req.description}</p>
        )}
        {status === 'overridden' && item.override?.reason && (
          <p className="text-xs text-ink-500 italic mt-0.5">Overridden: {item.override.reason}</p>
        )}
      </div>
    </div>
  )
}
