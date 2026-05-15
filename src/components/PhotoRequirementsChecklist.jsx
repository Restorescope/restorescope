import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { Card, CardHeader, CardBody, CardTitle, Badge, Button } from '../ui'
import { computeJobRequirements, scoreTone } from '../lib/photoRequirements'
import RequirementPhotoButton from './RequirementPhotoButton'

/**
 * PhotoRequirementsChecklist
 *
 * Two display modes:
 *   compact=true  — used on Job Dashboard: shows overall score, per-room mini-scores,
 *                   and a single "Take next photo" button for the highest-priority missing
 *   compact=false — used on Photos screen: full checklists grouped by scope/room
 *
 * Subscribes to photo realtime so checklists update live.
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
  const [enabling, setEnabling] = useState(false)
  const [openSections, setOpenSections] = useState({}) // collapsible state, keys: 'job' or room.id

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const [jobRes, photosRes, roomsRes, eqRes, catalogRes, overridesRes] = await Promise.all([
        supabase.from('jobs').select('id, loss_info, work_types_performed, photo_requirements_enabled').eq('id', jobId).single(),
        supabase.from('photos').select('id, category, caption, room_id').eq('job_id', jobId),
        supabase.from('affected_rooms').select('id, room_name, materials, actions').eq('job_id', jobId).order('created_at'),
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

  // Realtime photo updates
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

  function toggleSection(key) {
    setOpenSections((s) => ({ ...s, [key]: !s[key] }))
  }

  if (loading) return null
  if (error) return <p className="text-xs text-danger">Couldn't load photo requirements: {error}</p>

  // Disabled
  if (result?.disabled) {
    if (compact) {
      return (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-2 px-2 py-1 rounded border text-xs font-semibold bg-ink-50 border-ink-300 text-ink-600">
            Photo requirements disabled
          </span>
          <Button onClick={enableForJob} loading={enabling} variant="ghost" size="sm">Enable for this job</Button>
        </div>
      )
    }
    return (
      <Card>
        <CardBody className="flex items-center gap-3 flex-wrap">
          <div className="flex-1">
            <p className="text-sm font-semibold text-ink-900">Photo requirements disabled for this job</p>
            <p className="text-xs text-ink-600 mt-0.5">Enable to see required photos and a documentation health score.</p>
          </div>
          <Button onClick={enableForJob} loading={enabling} variant="ghost" size="sm">Enable</Button>
        </CardBody>
      </Card>
    )
  }

  if (!result) return null
  const hasAny = (result.job?.items?.length || 0) + (result.rooms.reduce((s, r) => s + r.items.length, 0)) > 0
  if (!hasAny) {
    if (compact) {
      return (
        <span className="inline-flex items-center gap-2 px-2 py-1 rounded border text-xs font-semibold bg-ink-50 border-ink-300 text-ink-600">
          No requirements yet — set category/class in loss info
        </span>
      )
    }
    return null
  }

  const tone = scoreTone(result.score)
  const toneColors = {
    green:  'bg-green-50 border-green-300 text-green-900',
    yellow: 'bg-yellow-50 border-yellow-300 text-yellow-900',
    red:    'bg-red-50 border-red-300 text-red-900',
    gray:   'bg-ink-50 border-ink-300 text-ink-900',
  }

  // ============================ COMPACT ============================
  if (compact) {
    // Find next missing required (job-level first, then by room)
    const nextMissing = findNextMissing(result)
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center gap-2 px-2 py-1 rounded border text-xs font-semibold ${toneColors[tone]}`}>
            <span>Doc score: {result.score}</span>
            <span className="opacity-70">· {result.requiredMetCount}/{result.requiredTotalCount} required</span>
          </span>
          {nextMissing && (
            <RequirementPhotoButton
              jobId={jobId}
              roomId={nextMissing.roomId}
              requirement={nextMissing.req}
              size="sm"
              label={`Take "${nextMissing.req.label}"${nextMissing.roomLabel ? ` (${nextMissing.roomLabel})` : ''}`}
            />
          )}
        </div>
        {/* Per-room mini scores */}
        {result.rooms.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${toneColors[scoreTone(result.job.score)]}`}>
              Job-level: {result.job.score}
            </span>
            {result.rooms.map((r) => (
              <span key={r.room.id} className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${toneColors[scoreTone(r.score)]}`}>
                {r.room.room_name}: {r.score}
              </span>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ============================ FULL ============================
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle>Photo requirements</CardTitle>
          <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded border text-sm font-semibold ${toneColors[tone]}`}>
            <span>Score: {result.score}</span>
            <span className="opacity-70 text-xs">· {result.requiredMetCount}/{result.requiredTotalCount} required met</span>
          </span>
        </div>
        <p className="text-xs text-ink-500 mt-1">
          Required photos based on this job's category, class, work performed, and each room's materials/actions.
          Updates live as you upload.
        </p>
      </CardHeader>
      <CardBody className="space-y-2">

        {/* JOB-LEVEL SECTION */}
        {result.job && result.job.items.length > 0 && (
          <ChecklistSection
            keyId="job"
            title="Job-level photos"
            subtitle="Taken once for the whole job"
            score={result.job.score}
            metCount={result.job.requiredMetCount}
            totalCount={result.job.requiredTotalCount}
            isOpen={openSections.job ?? true}
            onToggle={() => toggleSection('job')}
            items={result.job.items}
            jobId={jobId}
            roomId={null}
            tone={toneColors}
          />
        )}

        {/* PER-ROOM SECTIONS */}
        {result.rooms.map((r) => (
          <ChecklistSection
            key={r.room.id}
            keyId={r.room.id}
            title={r.room.room_name}
            subtitle={`Per-room photos for ${r.room.room_name}`}
            score={r.score}
            metCount={r.requiredMetCount}
            totalCount={r.requiredTotalCount}
            isOpen={openSections[r.room.id] ?? false}
            onToggle={() => toggleSection(r.room.id)}
            items={r.items}
            jobId={jobId}
            roomId={r.room.id}
            tone={toneColors}
          />
        ))}

      </CardBody>
    </Card>
  )
}

function findNextMissing(result) {
  // Job-level first
  if (result.job) {
    const found = result.job.items.find((i) => (i.status === 'missing' || i.status === 'partial') && i.req.severity === 'required')
    if (found) return { req: found.req, roomId: null }
  }
  // Then each room in order
  for (const r of result.rooms) {
    const found = r.items.find((i) => (i.status === 'missing' || i.status === 'partial') && i.req.severity === 'required')
    if (found) return { req: found.req, roomId: r.room.id, roomLabel: r.room.room_name }
  }
  return null
}

function ChecklistSection({ keyId, title, subtitle, score, metCount, totalCount, isOpen, onToggle, items, jobId, roomId, tone }) {
  const tn = scoreTone(score)
  return (
    <div className="border border-ink-200 rounded">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 p-3 hover:bg-ink-50 text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-ink-900">{title}</p>
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${tone[tn]}`}>
              {score} · {metCount}/{totalCount}
            </span>
          </div>
          <p className="text-xs text-ink-500 mt-0.5">{subtitle}</p>
        </div>
        <span className="text-ink-400 text-lg">{isOpen ? '▾' : '▸'}</span>
      </button>
      {isOpen && (
        <div className="border-t border-ink-200 p-2 space-y-2">
          {items.map((item) => (
            <RequirementRow key={item.req.key} item={item} jobId={jobId} roomId={roomId} />
          ))}
        </div>
      )}
    </div>
  )
}

function RequirementRow({ item, jobId, roomId }) {
  const { req, status, photosMatched, photosNeeded } = item
  const iconByStatus = { met: '✓', partial: '◐', missing: '✗', overridden: '—' }
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
  const showTakeButton = (status === 'missing' || status === 'partial') && jobId
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
      {showTakeButton && (
        <div className="shrink-0">
          <RequirementPhotoButton
            jobId={jobId}
            roomId={roomId}
            requirement={req}
            size="sm"
          />
        </div>
      )}
    </div>
  )
}
