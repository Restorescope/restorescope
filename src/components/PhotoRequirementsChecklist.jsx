import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { Card, CardHeader, CardBody, CardTitle, Badge, Button } from '../ui'
import { computeJobRequirements, scoreTone, evaluateRoomCompletion } from '../lib/photoRequirements'
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
  const [roomCompletions, setRoomCompletions] = useState({}) // optimistic completion state per room.id

  const load = async (isInitial = false) => {
    if (isInitial) setLoading(true)
    setError(null)
    try {
      const [jobRes, photosRes, roomsRes, eqRes, catalogRes, overridesRes] = await Promise.all([
        supabase.from('jobs').select('id, loss_info, work_types_performed, photo_requirements_enabled').eq('id', jobId).single(),
        supabase.from('photos').select('id, category, caption, room_id').eq('job_id', jobId),
        supabase.from('affected_rooms').select('id, room_name, materials, actions, tech_complete_at, tech_completed_by, pm_complete_at, pm_completed_by').eq('job_id', jobId).order('created_at'),
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

  useEffect(() => { load(true) }, [jobId])

  // Realtime photo updates
  useEffect(() => {
    if (!jobId) return
    const channel = supabase
      .channel(`photos-${jobId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'photos', filter: `job_id=eq.${jobId}` }, () => load(false))
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [jobId])

  const result = useMemo(() => {
    if (!job) return null
    return computeJobRequirements({ job, photos, rooms, equipment, catalog, overrides })
  }, [job, photos, rooms, equipment, catalog, overrides])

  // After a photo is uploaded, optimistically add it to local state so the
  // checklist updates instantly. Then trigger a real refetch for safety.
  function onPhotoUploaded(photoRow) {
    if (photoRow) {
      setPhotos((prev) => {
        // Avoid duplicates if realtime already fired
        if (prev.some((p) => p.id === photoRow.id)) return prev
        return [...prev, photoRow]
      })
    }
    // Background refetch (no spinner) for full consistency
    load(false)
  }

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
              onUploaded={onPhotoUploaded}
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
            onPhotoUploaded={onPhotoUploaded}
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
            room={r.room}
            userRole={profile.role}
            tone={toneColors}
            onPhotoUploaded={onPhotoUploaded}
            onRoomUpdated={(updates) => {
              // Update local state so the lock banner appears immediately
              setRoomCompletions((rc) => ({ ...rc, [r.room.id]: { ...rc[r.room.id], ...updates } }))
              load(false)
            }}
            completion={roomCompletions[r.room.id] || {
              tech_complete_at: r.room.tech_complete_at,
              tech_completed_by: r.room.tech_completed_by,
              pm_complete_at: r.room.pm_complete_at,
              pm_completed_by: r.room.pm_completed_by,
            }}
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

function ChecklistSection({
  keyId, title, subtitle, score, metCount, totalCount,
  isOpen, onToggle, items, jobId, roomId, room, userRole, tone,
  onPhotoUploaded, onRoomUpdated, completion,
}) {
  const tn = scoreTone(score)
  const isRoom = !!roomId
  const techDone = !!completion?.tech_complete_at
  const pmDone   = !!completion?.pm_complete_at
  const fullyDone = isRoom && techDone && pmDone

  return (
    <div className={`border rounded ${fullyDone ? 'border-green-400 bg-green-50/30' : 'border-ink-200'}`}>
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
            {isRoom && techDone && <Badge tone="green">✓ Tech done</Badge>}
            {isRoom && pmDone && <Badge tone="green">✓ PM done</Badge>}
          </div>
          <p className="text-xs text-ink-500 mt-0.5">{subtitle}</p>
        </div>
        <span className="text-ink-400 text-lg">{isOpen ? '▾' : '▸'}</span>
      </button>
      {isOpen && (
        <div className="border-t border-ink-200 p-2 space-y-2">
          {/* Role completion controls — only on per-room sections */}
          {isRoom && room && (
            <RoomCompletionControls
              room={room}
              userRole={userRole}
              items={items}
              completion={completion}
              onRoomUpdated={onRoomUpdated}
            />
          )}
          {items.map((item) => (
            <RequirementRow key={item.req.key} item={item} jobId={jobId} roomId={roomId} onPhotoUploaded={onPhotoUploaded} />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * RoomCompletionControls — shows Tech complete + PM complete buttons.
 *
 * Tech-level user (role='technician'):
 *   - Can mark tech complete (only if no tech_required photos missing)
 *   - Cannot mark PM complete
 *   - Cannot override
 *
 * PM/Owner (role in 'pm','owner'):
 *   - Can mark both sides
 *   - Can override either side with typed reason
 */
function RoomCompletionControls({ room, userRole, items, completion, onRoomUpdated }) {
  const isOwnerOrPM = userRole === 'owner' || userRole === 'pm'
  const techDone = !!completion?.tech_complete_at
  const pmDone   = !!completion?.pm_complete_at

  const techCheck = useMemo(() => evaluateRoomCompletion({ room, items, side: 'tech' }), [room, items])
  const pmCheck   = useMemo(() => evaluateRoomCompletion({ room, items, side: 'pm' }), [room, items])

  return (
    <div className="bg-white border border-ink-200 rounded p-2 mb-2 space-y-2">
      <CompletionRow
        side="tech"
        label="Tech work complete"
        check={techCheck}
        done={techDone}
        canMark={true} // any tech can mark; PM/owner also can
        canOverride={isOwnerOrPM}
        room={room}
        onRoomUpdated={onRoomUpdated}
      />
      <CompletionRow
        side="pm"
        label="PM/Owner documentation complete"
        check={pmCheck}
        done={pmDone}
        canMark={isOwnerOrPM}
        canOverride={isOwnerOrPM}
        room={room}
        onRoomUpdated={onRoomUpdated}
      />
    </div>
  )
}

function CompletionRow({ side, label, check, done, canMark, canOverride, room, onRoomUpdated }) {
  const [busy, setBusy] = useState(false)
  const [showOverride, setShowOverride] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState(null)

  async function mark(overrideReason = null) {
    setBusy(true); setError(null)
    try {
      const stamp = new Date().toISOString()
      const { data: user } = await supabase.auth.getUser()
      const userId = user?.user?.id

      const updates = side === 'tech'
        ? { tech_complete_at: stamp, tech_completed_by: userId }
        : { pm_complete_at: stamp, pm_completed_by: userId }

      const { error: e } = await supabase.from('affected_rooms').update(updates).eq('id', room.id)
      if (e) throw e

      // If this was an override, log it
      if (overrideReason) {
        await supabase.from('room_completion_overrides').insert({
          tenant_id: room.tenant_id,
          job_id: room.job_id,
          room_id: room.id,
          side,
          reason: overrideReason,
          missing_keys: check.missing.map((m) => m.key),
          created_by: userId,
        })
      }
      onRoomUpdated?.(updates)
      setShowOverride(false)
      setReason('')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function unmark() {
    if (!confirm(`Unmark ${side === 'tech' ? 'tech' : 'PM'} complete? This will allow further edits to gate the room again.`)) return
    setBusy(true); setError(null)
    try {
      const updates = side === 'tech'
        ? { tech_complete_at: null, tech_completed_by: null }
        : { pm_complete_at: null, pm_completed_by: null }
      const { error: e } = await supabase.from('affected_rooms').update(updates).eq('id', room.id)
      if (e) throw e
      onRoomUpdated?.(updates)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-green-700 font-bold">✓</span>
          <span className="text-sm font-semibold text-ink-900">{label}</span>
        </div>
        {canMark && (
          <Button variant="ghost" size="sm" onClick={unmark} loading={busy}>Reopen</Button>
        )}
      </div>
    )
  }

  if (!canMark) {
    return (
      <div className="flex items-center gap-2 text-sm text-ink-500">
        <span>○ {label}</span>
        <Badge tone="neutral">{check.requirementCount} required</Badge>
        <span className="text-xs italic">PM/Owner only</span>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-ink-900">{label}</span>
          {check.requirementCount === 0 ? (
            <Badge tone="neutral">No required items</Badge>
          ) : check.ok ? (
            <Badge tone="green">All {check.requirementCount} required met</Badge>
          ) : (
            <Badge tone="red">{check.missing.length} missing</Badge>
          )}
        </div>
        <div className="flex gap-2">
          {check.ok ? (
            <Button onClick={() => mark()} loading={busy} size="sm">Mark complete</Button>
          ) : (
            <>
              <Button onClick={() => mark()} loading={busy} size="sm" disabled>Mark complete</Button>
              {canOverride && (
                <Button variant="ghost" size="sm" onClick={() => setShowOverride((s) => !s)}>
                  {showOverride ? 'Cancel override' : 'Override'}
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* List missing items */}
      {!check.ok && check.missing.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded p-2">
          <p className="text-xs font-semibold text-danger mb-1">Missing required:</p>
          <ul className="text-xs text-ink-900 list-disc pl-4 space-y-0.5">
            {check.missing.map((m) => (
              <li key={m.key}>{m.label}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Override flow */}
      {showOverride && canOverride && (
        <div className="bg-yellow-50 border border-yellow-200 rounded p-2 space-y-2">
          <p className="text-xs text-ink-900">
            Override the gate. Provide a reason — this is logged for audit.
          </p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="e.g. Customer locked property before demo photos could be retaken"
            className="w-full px-2 py-1.5 border border-ink-300 rounded text-sm"
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="accent"
              loading={busy}
              disabled={!reason.trim()}
              onClick={() => mark(reason.trim())}
            >
              Override & mark complete
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
}

function RequirementRow({ item, jobId, roomId, onPhotoUploaded }) {
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
          {req.required_role === 'tech_required' && (
            <Badge tone="blue">Tech</Badge>
          )}
          {req.required_role === 'pm_required' && (
            <Badge tone="amber">PM</Badge>
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
            onUploaded={onPhotoUploaded}
          />
        </div>
      )}
    </div>
  )
}
