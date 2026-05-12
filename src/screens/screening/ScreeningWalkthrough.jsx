import { useEffect, useState, useMemo, useCallback } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth.jsx'
import { useSetting } from '../../lib/settings'
import { getPhotoUrls } from '../../lib/photos'
import {
  Header, BottomNav, Section, Button, Card, CardHeader, CardBody, CardTitle,
  Input, Select, Textarea, Badge, EmptyState,
} from '../../ui'
import PhotoUploader from '../../components/PhotoUploader'

/**
 * ScreeningWalkthrough — captures Spore's alerts room by room.
 *
 * For each alert:
 *   - Room (from existing affected_rooms or a quick "+ Add room" pattern)
 *   - Alert strength (strong / moderate / weak / negative)
 *   - Alert location description ("northeast corner of master closet…")
 *   - Visible signs (staining, water damage, musty odor, none)
 *   - Optional moisture reading (value + unit)
 *   - Optional thermal observation notes
 *   - Optional wall cavity test result
 *   - Photo(s) uploaded via existing PhotoUploader (screening_alert category)
 *
 * Alerts are stored in screening_alerts; photos use the existing job_photos
 * pipeline (linked by room + reading_id-style — we link them by uploading
 * with category='screening_alert' and matching room_id).
 */
export default function ScreeningWalkthrough() {
  const { id: jobId } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const meters = useSetting('meters')

  const [job, setJob] = useState(null)
  const [inspection, setInspection] = useState(null)
  const [alerts, setAlerts] = useState([])
  const [rooms, setRooms] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [authorized, setAuthorized] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true); setError(null)
      const [jobRes, inspRes, authRes, roomsRes] = await Promise.all([
        supabase.from('jobs')
          .select('id, job_number, customer, screening_enabled, screening_only')
          .eq('id', jobId).maybeSingle(),
        supabase.from('screening_inspections').select('*').eq('job_id', jobId).maybeSingle(),
        supabase.from('screening_authorizations').select('id, signed_at').eq('job_id', jobId).maybeSingle(),
        supabase.from('affected_rooms')
          .select('id, room_name')
          .eq('job_id', jobId)
          .order('created_at'),
      ])
      if (cancelled) return
      if (jobRes.error || !jobRes.data) { setError(jobRes.error?.message || 'Job not found'); setLoading(false); return }
      setJob(jobRes.data)

      if (!inspRes.data) {
        setError('No screening inspection started. Go to the Screening dashboard and start one first.')
        setLoading(false); return
      }
      setInspection(inspRes.data)
      setAuthorized(!!authRes.data?.signed_at)
      setRooms(roomsRes.data || [])

      const { data: alertData } = await supabase.from('screening_alerts')
        .select('*')
        .eq('inspection_id', inspRes.data.id)
        .order('display_order', { nullsFirst: false })
        .order('recorded_at')
      if (cancelled) return
      setAlerts(alertData || [])
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [jobId])

  async function addAlert(form) {
    setError(null)
    try {
      const payload = {
        tenant_id: profile.tenant_id,
        inspection_id: inspection.id,
        job_id: jobId,
        room_id: form.room_id || null,
        room_name: form.room_name || rooms.find((r) => r.id === form.room_id)?.room_name || null,
        alert_strength: form.alert_strength || null,
        alert_location: form.alert_location || null,
        visible_signs: form.visible_signs || null,
        moisture_value: form.moisture_value ? Number(form.moisture_value) : null,
        moisture_unit: form.moisture_unit || null,
        thermal_observation: form.thermal_observation || null,
        wall_cavity_test_result: form.wall_cavity_test_result || null,
        notes: form.notes || null,
        display_order: alerts.length,
        recorded_at: new Date().toISOString(),
        recorded_by: profile.id,
      }
      const { data, error: err } = await supabase
        .from('screening_alerts')
        .insert(payload)
        .select('*')
        .single()
      if (err) throw err
      setAlerts((arr) => [...arr, data])
      setShowAddForm(false)
    } catch (e) {
      setError(e.message)
    }
  }

  async function updateAlert(id, patch) {
    setError(null)
    try {
      const { error: err } = await supabase
        .from('screening_alerts')
        .update(patch)
        .eq('id', id)
      if (err) throw err
      setAlerts((arr) => arr.map((a) => a.id === id ? { ...a, ...patch } : a))
    } catch (e) {
      setError(e.message)
    }
  }

  async function removeAlert(id) {
    if (!confirm('Remove this alert?')) return
    setError(null)
    try {
      const { error: err } = await supabase.from('screening_alerts').delete().eq('id', id)
      if (err) throw err
      setAlerts((arr) => arr.filter((a) => a.id !== id))
      if (editingId === id) setEditingId(null)
    } catch (e) {
      setError(e.message)
    }
  }

  // Add a room to affected_rooms — quick path so users don't have to bail to the
  // rooms screen mid-walkthrough.
  async function quickAddRoom(roomName) {
    if (!roomName.trim()) return null
    try {
      const { data, error: err } = await supabase
        .from('affected_rooms')
        .insert({
          tenant_id: profile.tenant_id,
          job_id: jobId,
          room_name: roomName.trim(),
        })
        .select('id, room_name')
        .single()
      if (err) throw err
      setRooms((arr) => [...arr, data])
      return data
    } catch (e) {
      setError(`Couldn't create room: ${e.message}`)
      return null
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-ink-50">
        <Header breadcrumb={[
          { label: 'Jobs', to: '/jobs' },
          { label: 'Job', to: `/jobs/${jobId}` },
          { label: 'Screening', to: `/jobs/${jobId}/screening` },
          { label: 'Walkthrough' },
        ]} />
        <main className="max-w-4xl mx-auto p-4 sm:p-6 text-ink-500">Loading…</main>
      </div>
    )
  }

  if (error && !inspection) {
    return (
      <div className="min-h-screen bg-ink-50">
        <Header breadcrumb={[{ label: 'Jobs', to: '/jobs' }, { label: 'Walkthrough' }]} />
        <main className="max-w-4xl mx-auto p-4 sm:p-6 space-y-3">
          <div role="alert" className="bg-red-50 border border-red-200 text-danger rounded p-3 text-sm">{error}</div>
          <Link to={`/jobs/${jobId}/screening`}>
            <Button variant="secondary">← Back to Screening</Button>
          </Link>
        </main>
      </div>
    )
  }

  const alertCount = alerts.filter((a) => a.alert_strength && a.alert_strength !== 'negative').length

  return (
    <div className="min-h-screen bg-ink-50">
      <Header breadcrumb={[
        { label: 'Jobs', to: '/jobs' },
        { label: job?.job_number || 'Job', to: `/jobs/${jobId}` },
        { label: 'Screening', to: `/jobs/${jobId}/screening` },
        { label: 'Walkthrough' },
      ]} />

      <main className="max-w-4xl mx-auto p-4 sm:p-6 pb-24 space-y-4">
        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-danger rounded p-3 text-sm">
            {error}
          </div>
        )}

        {!authorized && (
          <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-900">
            <strong>Authorization not yet signed.</strong> You can record alerts in the field, but
            the customer must sign the authorization form before the screening report is generated.
            <div className="mt-2">
              <Link to={`/jobs/${jobId}/screening/authorization`}>
                <Button size="sm" variant="secondary">Go to authorization →</Button>
              </Link>
            </div>
          </div>
        )}

        <Section
          title="Walkthrough alerts"
          description={`Capture Spore's alerts as you go. ${alertCount} positive alert${alertCount === 1 ? '' : 's'} so far.`}
          action={(
            <Button onClick={() => { setShowAddForm(true); setEditingId(null) }} variant="accent">
              + Record alert
            </Button>
          )}
        >
          {showAddForm && (
            <AlertForm
              rooms={rooms}
              meters={meters.data?.items ?? []}
              onSave={addAlert}
              onCancel={() => setShowAddForm(false)}
              onQuickAddRoom={quickAddRoom}
              defaultInspectorName={inspection?.inspector_name}
            />
          )}

          {alerts.length === 0 && !showAddForm ? (
            <EmptyState
              title="No alerts recorded yet"
              body="Tap '+ Record alert' to log Spore's first hit. If you complete the walkthrough with no alerts, you can record a 'negative' alert for documentation."
            />
          ) : (
            <ul className="space-y-3 mt-3">
              {alerts.map((alert) => (
                <AlertCard
                  key={alert.id}
                  alert={alert}
                  rooms={rooms}
                  meters={meters.data?.items ?? []}
                  jobId={jobId}
                  tenantId={profile.tenant_id}
                  isEditing={editingId === alert.id}
                  onStartEdit={() => setEditingId(alert.id)}
                  onCancelEdit={() => setEditingId(null)}
                  onSave={(patch) => { updateAlert(alert.id, patch); setEditingId(null) }}
                  onRemove={() => removeAlert(alert.id)}
                />
              ))}
            </ul>
          )}
        </Section>

        <div className="flex justify-between flex-wrap gap-2">
          <Link to={`/jobs/${jobId}/screening`}>
            <Button variant="secondary">← Back to Screening</Button>
          </Link>
          {alerts.length > 0 && (
            <Link to={`/jobs/${jobId}/screening/recommendations`}>
              <Button>Continue to Recommendations →</Button>
            </Link>
          )}
        </div>
      </main>

      <BottomNav jobId={jobId} />
    </div>
  )
}

// ============================================================================
// AlertCard — display + inline edit
// ============================================================================
function AlertCard({ alert, rooms, meters, jobId, tenantId, isEditing, onStartEdit, onCancelEdit, onSave, onRemove }) {
  if (isEditing) {
    return (
      <li>
        <AlertForm
          initial={alert}
          rooms={rooms}
          meters={meters}
          onSave={onSave}
          onCancel={onCancelEdit}
          existing
        />
      </li>
    )
  }

  const strengthTone = {
    strong:   'red',
    moderate: 'amber',
    weak:     'yellow',
    negative: 'green',
  }[alert.alert_strength] || 'neutral'

  return (
    <li className="bg-white border border-ink-200 border-l-[3px] border-l-brand-blue rounded-md p-3">
      <div className="flex items-start justify-between gap-2 flex-wrap mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-condensed font-bold text-brand-blue tracking-wide">
              {alert.room_name || 'Unspecified room'}
            </span>
            <Badge tone={strengthTone}>
              {labelStrength(alert.alert_strength)}
            </Badge>
          </div>
          {alert.alert_location && (
            <p className="text-sm text-ink-700 mt-1">{alert.alert_location}</p>
          )}
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={onStartEdit}>Edit</Button>
          <Button size="sm" variant="ghost" onClick={onRemove}>Remove</Button>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-2 text-xs text-ink-600">
        {alert.visible_signs && <KV label="Visible signs">{alert.visible_signs}</KV>}
        {alert.moisture_value != null && (
          <KV label="Moisture">{alert.moisture_value} {alert.moisture_unit || ''}</KV>
        )}
        {alert.thermal_observation && <KV label="Thermal">{alert.thermal_observation}</KV>}
        {alert.wall_cavity_test_result && <KV label="Wall cavity">{alert.wall_cavity_test_result}</KV>}
      </div>

      {alert.notes && (
        <p className="text-xs text-ink-600 italic mt-2 border-t border-ink-100 pt-2">{alert.notes}</p>
      )}

      <div className="mt-3 border-t border-ink-100 pt-3">
        <p className="text-xs text-ink-500 mb-1 uppercase font-semibold">Photos</p>
        <AlertPhotos
          jobId={jobId}
          roomId={alert.room_id || null}
        />
      </div>
    </li>
  )
}

/**
 * AlertPhotos — loads existing screening photos for this room, shows
 * thumbnail strip, and an upload button that refreshes the strip after
 * each upload.
 */
function AlertPhotos({ jobId, roomId }) {
  const [photos, setPhotos] = useState([])
  const [urls, setUrls] = useState(new Map())
  const [loading, setLoading] = useState(true)
  const SCREENING_CATEGORIES = ['screening_alert', 'screening_thermal', 'screening_visible', 'screening_sample', 'screening_general']

  const loadPhotos = useCallback(async () => {
    setLoading(true)
    let query = supabase.from('photos')
      .select('id, category, storage_path, caption, uploaded_at, room_id')
      .eq('job_id', jobId)
      .in('category', SCREENING_CATEGORIES)
      .order('uploaded_at', { ascending: false })
    if (roomId) {
      query = query.eq('room_id', roomId)
    } else {
      query = query.is('room_id', null)
    }
    const { data, error: err } = await query
    if (!err && data) {
      setPhotos(data)
      const urlMap = await getPhotoUrls(data)
      setUrls(urlMap)
    }
    setLoading(false)
  }, [jobId, roomId])

  useEffect(() => { loadPhotos() }, [loadPhotos])

  return (
    <div>
      {!loading && photos.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-2">
          {photos.map((p) => {
            const url = urls.get(p.id)
            if (!url) return null
            return (
              <a
                key={p.id}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="block aspect-square bg-ink-100 rounded overflow-hidden border border-ink-200 hover:border-brand-blue transition-colors"
              >
                <img
                  src={url}
                  alt={p.caption || 'Screening photo'}
                  className="w-full h-full object-cover"
                />
              </a>
            )
          })}
        </div>
      )}
      <PhotoUploader
        jobId={jobId}
        roomId={roomId}
        defaultCategory="screening_alert"
        filterCategories={['screening_alert', 'screening_thermal', 'screening_visible', 'screening_sample', 'screening_general']}
        onUploaded={loadPhotos}
        label="+ Add photo"
      />
    </div>
  )
}

function KV({ label, children }) {
  return (
    <div>
      <span className="font-semibold text-ink-700">{label}:</span>{' '}
      <span>{children}</span>
    </div>
  )
}

function labelStrength(s) {
  return {
    strong:   'Strong alert',
    moderate: 'Moderate alert',
    weak:     'Weak alert',
    negative: 'No alert (negative)',
  }[s] || s || 'Not classified'
}

// ============================================================================
// AlertForm — add or edit
// ============================================================================
function AlertForm({ initial, rooms, meters, onSave, onCancel, onQuickAddRoom, existing = false }) {
  const [form, setForm] = useState(() => ({
    room_id: initial?.room_id || '',
    room_name: initial?.room_name || '',
    alert_strength: initial?.alert_strength || '',
    alert_location: initial?.alert_location || '',
    visible_signs: initial?.visible_signs || '',
    moisture_value: initial?.moisture_value ?? '',
    moisture_unit: initial?.moisture_unit || '',
    thermal_observation: initial?.thermal_observation || '',
    wall_cavity_test_result: initial?.wall_cavity_test_result || '',
    notes: initial?.notes || '',
  }))
  const [quickRoomMode, setQuickRoomMode] = useState(false)
  const [quickRoomName, setQuickRoomName] = useState('')

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })) }

  function pickRoom(roomId) {
    const room = rooms.find((r) => r.id === roomId)
    set('room_id', roomId)
    set('room_name', room?.room_name || '')
  }

  async function handleQuickAdd() {
    const room = await onQuickAddRoom?.(quickRoomName)
    if (room) {
      set('room_id', room.id)
      set('room_name', room.room_name)
      setQuickRoomMode(false)
      setQuickRoomName('')
    }
  }

  function save() {
    onSave?.(form)
  }

  return (
    <Card accent="blue">
      <CardHeader>
        <CardTitle>{existing ? 'Edit alert' : 'Record alert'}</CardTitle>
      </CardHeader>
      <CardBody className="space-y-3">
        {/* Room picker */}
        {!quickRoomMode ? (
          <div className="flex gap-2 items-end">
            <Select
              label="Room"
              value={form.room_id}
              onChange={(e) => pickRoom(e.target.value)}
              options={rooms.map((r) => ({ key: r.id, label: r.room_name }))}
              placeholder="Pick a room…"
              className="flex-1"
            />
            {!existing && onQuickAddRoom && (
              <Button size="sm" variant="secondary" onClick={() => setQuickRoomMode(true)}>+ New room</Button>
            )}
          </div>
        ) : (
          <div className="bg-ink-50 border border-ink-200 rounded p-3 space-y-2">
            <Input
              label="New room name"
              placeholder="e.g. Master Bath"
              value={quickRoomName}
              onChange={(e) => setQuickRoomName(e.target.value)}
              autoFocus
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleQuickAdd}>Add</Button>
              <Button size="sm" variant="ghost" onClick={() => { setQuickRoomMode(false); setQuickRoomName('') }}>Cancel</Button>
            </div>
          </div>
        )}

        <Select
          label="Alert strength"
          value={form.alert_strength}
          onChange={(e) => set('alert_strength', e.target.value)}
          options={[
            { key: 'strong',   label: 'Strong alert' },
            { key: 'moderate', label: 'Moderate alert' },
            { key: 'weak',     label: 'Weak alert' },
            { key: 'negative', label: 'No alert (negative — documenting clean room)' },
          ]}
          placeholder="Classify the alert…"
        />

        <Textarea
          label="Alert location"
          rows={2}
          placeholder="e.g. Northeast corner of master closet, behind hanging clothes, at floor level"
          value={form.alert_location}
          onChange={(e) => set('alert_location', e.target.value)}
        />

        <Input
          label="Visible signs (optional)"
          placeholder="e.g. Staining on baseboard, musty odor, no visible damage"
          value={form.visible_signs}
          onChange={(e) => set('visible_signs', e.target.value)}
        />

        <div className="grid sm:grid-cols-3 gap-2">
          <Input
            label="Moisture value (optional)"
            type="number"
            step="0.1"
            inputMode="decimal"
            value={form.moisture_value}
            onChange={(e) => set('moisture_value', e.target.value)}
          />
          <Select
            label="Unit"
            value={form.moisture_unit}
            onChange={(e) => set('moisture_unit', e.target.value)}
            placeholder="—"
            options={[
              { key: 'WME', label: 'WME %' },
              { key: 'MC',  label: '%MC' },
              { key: 'rh',  label: '%RH' },
              { key: 'imp', label: 'Relative' },
            ]}
          />
          <div></div>
        </div>

        <Input
          label="Thermal imaging observation (optional)"
          placeholder="e.g. Cold spot consistent with moisture intrusion"
          value={form.thermal_observation}
          onChange={(e) => set('thermal_observation', e.target.value)}
        />

        <Input
          label="Wall cavity test result (optional)"
          placeholder="e.g. Elevated moisture detected in wall cavity"
          value={form.wall_cavity_test_result}
          onChange={(e) => set('wall_cavity_test_result', e.target.value)}
        />

        <Textarea
          label="Additional notes (optional)"
          rows={2}
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
        />

        <div className="flex gap-2">
          <Button onClick={save}>{existing ? 'Save changes' : 'Save alert'}</Button>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
      </CardBody>
    </Card>
  )
}
