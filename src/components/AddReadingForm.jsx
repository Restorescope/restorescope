import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useSetting } from '../lib/settings'
import { uploadJobPhoto } from '../lib/photos'
import { UNITS } from '../lib/defaults'
import {
  Button, Input, Select, Card, CardHeader, CardBody, CardTitle, Textarea, Badge,
} from '../ui'
import PhotoUploader from './PhotoUploader'

/**
 * AddReadingForm — capture one moisture reading.
 *
 * Drying-goal logic (locked + simple):
 *   - When a (room, material) combo gets its FIRST non-reference reading, the
 *     goal is pulled from Settings → Drying goals (if a value exists for that
 *     material) and saved with goal_locked=true on that reading.
 *   - Every subsequent reading for that same (room, material) inherits the
 *     same goal, even if Settings → Drying goals is later changed. This keeps
 *     the drying standard consistent for the entire job.
 *   - If no goal exists in Settings, the user can type a value once on the
 *     first reading; that value then locks for that room+material forever.
 *
 * Date/time:
 *   - captured_at defaults to "now" but is fully editable via a datetime-local
 *     input so users can backdate readings entered from a paper log.
 *
 * Reference readings:
 *   - Marked with is_reference=true; do not participate in goal-locking.
 *
 * Inline meter photo: user can attach a meter-face photo before saving;
 * we save the reading first, then upload + link the photo. After save we
 * also offer a second "+ Add meter photo" prompt.
 */
export default function AddReadingForm({
  jobId, tenantId, rooms = [], chambers = [],
  defaultRoomId, onSaved, onCancel,
}) {
  const { profile } = useAuth()
  const meters = useSetting('meters')
  const materials = useSetting('materials')
  const goalsSetting = useSetting('material_drying_goals')

  const [form, setForm] = useState({
    room_id:       defaultRoomId || '',
    chamber_id:    '',
    material_key:  '',
    point_label:   '',
    meter_type:    '',
    unit:          '',
    value:         '',
    drying_goal:   '',
    is_reference:  false,
    status:        'wet',
    notes:         '',
    captured_at:   toLocalInputValue(new Date()),
  })
  const [pendingPhoto, setPendingPhoto] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [savedReading, setSavedReading] = useState(null)
  const [lockedGoal, setLockedGoal] = useState(null)   // existing goal locked from prior reading
  const [goalCheckedKey, setGoalCheckedKey] = useState(null)
  const photoInputRef = useRef(null)

  // Auto-pull chamber from selected room
  useEffect(() => {
    if (!form.room_id) return
    const room = rooms.find((r) => r.id === form.room_id)
    if (room?.chamber_id && form.chamber_id !== room.chamber_id) {
      setForm((f) => ({ ...f, chamber_id: room.chamber_id }))
    }
  }, [form.room_id, rooms]) // eslint-disable-line react-hooks/exhaustive-deps

  function setMeter(key) {
    const m = (meters.data?.items ?? []).find((x) => x.key === key)
    setForm((f) => ({ ...f, meter_type: key, unit: m?.units?.[0] || '' }))
  }

  // When room+material change, look up the locked goal:
  //   1) Check existing readings for this (room, material) — first non-reference
  //      reading dictates the locked goal.
  //   2) If none exists yet, fall back to Settings → Drying goals for that material.
  //   3) Otherwise leave blank for user to enter.
  useEffect(() => {
    let cancelled = false
    async function lookup() {
      if (form.is_reference) {
        setLockedGoal(null)
        setGoalCheckedKey(null)
        return
      }
      if (!form.room_id || !form.material_key) {
        setLockedGoal(null)
        setGoalCheckedKey(null)
        return
      }
      const checkKey = `${form.room_id}::${form.material_key}`
      // 1) Existing readings for this room+material
      const { data: existing, error: lookupErr } = await supabase
        .from('moisture_readings')
        .select('drying_goal, captured_at')
        .eq('job_id', jobId)
        .eq('room_id', form.room_id)
        .eq('material_key', form.material_key)
        .eq('is_reference', false)
        .not('drying_goal', 'is', null)
        .order('captured_at', { ascending: true })
        .limit(1)
      if (cancelled) return
      if (!lookupErr && existing && existing.length > 0 && existing[0].drying_goal != null) {
        const goal = String(existing[0].drying_goal)
        setLockedGoal({ source: 'prior_reading', value: goal })
        setForm((f) => ({ ...f, drying_goal: goal }))
        setGoalCheckedKey(checkKey)
        return
      }
      // 2) Settings default
      const goalFromSettings = (goalsSetting.data?.items ?? [])
        .find((g) => g.material_key === form.material_key)?.goal_pct
      if (goalFromSettings != null) {
        const goal = String(goalFromSettings)
        setLockedGoal({ source: 'settings', value: goal })
        setForm((f) => ({ ...f, drying_goal: goal }))
        setGoalCheckedKey(checkKey)
        return
      }
      // 3) No prior, no setting — leave blank for user to type
      setLockedGoal({ source: 'none', value: null })
      setForm((f) => ({ ...f, drying_goal: '' }))
      setGoalCheckedKey(checkKey)
    }
    lookup()
    return () => { cancelled = true }
  }, [jobId, form.room_id, form.material_key, form.is_reference, goalsSetting.data])

  const availableUnits = useMemo(() => {
    const m = (meters.data?.items ?? []).find((x) => x.key === form.meter_type)
    return (m?.units ?? Object.keys(UNITS)).map((u) => ({ key: u, label: UNITS[u] || u }))
  }, [form.meter_type, meters.data])

  const goalIsLocked = lockedGoal?.source === 'prior_reading'
  const goalIsFromSettings = lockedGoal?.source === 'settings'

  function validate() {
    if (!form.room_id && !form.is_reference) return 'Pick a room or mark this as a reference reading.'
    if (!form.value.toString().trim()) return 'Reading value is required.'
    if (!form.meter_type) return 'Pick a meter.'
    if (!form.captured_at) return 'Capture date and time is required.'
    return null
  }

  function pickPhoto() { photoInputRef.current?.click() }
  function onPhotoFile(e) {
    const f = e.target.files?.[0]
    if (f) setPendingPhoto(f)
    e.target.value = ''
  }

  async function save() {
    const v = validate()
    if (v) { setError(v); return }
    setError(null); setSaving(true)
    try {
      // The goal_locked flag is true if this reading is the originator
      // (no prior locked reading existed for this room+material).
      const isOriginator = !goalIsLocked && !form.is_reference

      const payload = {
        tenant_id:    tenantId,
        job_id:       jobId,
        room_id:      form.room_id || null,
        chamber_id:   form.chamber_id || null,
        material_key: form.material_key || null,
        point_label:  form.point_label || null,
        meter_type:   form.meter_type,
        unit:         form.unit || null,
        value:        Number(form.value),
        drying_goal:  form.drying_goal === '' ? null : Number(form.drying_goal),
        goal_source:  form.is_reference
                        ? null
                        : goalIsLocked ? 'locked'
                        : goalIsFromSettings ? 'settings'
                        : 'manual',
        goal_locked:  isOriginator,
        is_reference: form.is_reference,
        status:       form.status,
        notes:        form.notes || null,
        captured_at:  fromLocalInputValue(form.captured_at),
        captured_by:  profile.id,
      }
      const { data, error: err } = await supabase
        .from('moisture_readings')
        .insert(payload)
        .select('*')
        .single()
      if (err) throw err

      if (pendingPhoto) {
        try {
          await uploadJobPhoto(pendingPhoto, {
            tenantId, jobId,
            roomId: data.room_id,
            readingId: data.id,
            category: 'moisture_readings',
            uploadedBy: profile.id,
          })
        } catch (photoErr) {
          // eslint-disable-next-line no-console
          console.warn('Inline meter photo upload failed:', photoErr)
        }
      }
      setSavedReading(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (savedReading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Reading saved ✓</CardTitle>
          <p className="text-xs text-ink-500 mt-1">
            {pendingPhoto
              ? 'Inline photo attached. You can add another or finish.'
              : 'Optional: snap a photo of the meter face for the report.'}
          </p>
        </CardHeader>
        <CardBody className="space-y-3">
          <PhotoUploader
            jobId={jobId}
            roomId={savedReading.room_id || null}
            readingId={savedReading.id}
            defaultCategory="moisture_readings"
            filterCategories={['moisture_readings', 'final_dry']}
            onUploaded={() => {}}
            label="+ Add meter photo"
          />
          <div className="flex gap-2 pt-1">
            <Button onClick={() => onSaved?.(savedReading)}>Done</Button>
          </div>
        </CardBody>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add moisture reading</CardTitle>
      </CardHeader>
      <CardBody className="space-y-3">
        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-danger rounded p-3 text-sm">
            {error}
          </div>
        )}

        <label className="flex items-center gap-2 select-none">
          <input
            type="checkbox"
            className="w-5 h-5 rounded border-ink-300"
            checked={form.is_reference}
            onChange={(e) => setForm((f) => ({ ...f, is_reference: e.target.checked }))}
          />
          <span className="text-sm font-semibold text-ink-700">
            This is an unaffected reference reading
          </span>
        </label>

        <div className="grid sm:grid-cols-2 gap-3">
          <Select
            label={form.is_reference ? 'Room (optional)' : 'Room'}
            placeholder={form.is_reference ? 'Whole job' : 'Pick a room…'}
            value={form.room_id}
            onChange={(e) => setForm((f) => ({ ...f, room_id: e.target.value }))}
            options={rooms.map((r) => ({ key: r.id, label: r.room_name }))}
            required={!form.is_reference}
          />
          <Select
            label="Drying chamber"
            placeholder="None"
            value={form.chamber_id}
            onChange={(e) => setForm((f) => ({ ...f, chamber_id: e.target.value }))}
            options={chambers.map((c) => ({ key: c.id, label: c.name }))}
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <Select
            label="Material"
            placeholder="Pick a material…"
            value={form.material_key}
            onChange={(e) => setForm((f) => ({ ...f, material_key: e.target.value }))}
            options={(materials.data?.items ?? []).map((m) => ({ key: m.key, label: m.label }))}
          />
          <Input
            label="Point label"
            placeholder="e.g. 1.1, 2.3"
            value={form.point_label}
            onChange={(e) => setForm((f) => ({ ...f, point_label: e.target.value }))}
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <Select
            label="Meter"
            required
            placeholder="Pick a meter…"
            value={form.meter_type}
            onChange={(e) => setMeter(e.target.value)}
            options={(meters.data?.items ?? []).map((m) => ({ key: m.key, label: m.label }))}
          />
          <Select
            label="Unit"
            placeholder="Pick a unit…"
            value={form.unit}
            onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
            options={availableUnits}
          />
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <Input
            label="Reading value"
            required
            type="number"
            step="0.1"
            inputMode="decimal"
            value={form.value}
            onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
          />
          <div>
            <Input
              label="Drying goal (standard)"
              type="number"
              step="0.1"
              inputMode="decimal"
              value={form.drying_goal}
              onChange={(e) => setForm((f) => ({ ...f, drying_goal: e.target.value }))}
              disabled={form.is_reference || goalIsLocked}
            />
            {!form.is_reference && (
              <GoalHint locked={goalIsLocked} fromSettings={goalIsFromSettings} />
            )}
          </div>
          <Select
            label="Status"
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
            options={[
              { key: 'wet',    label: 'Wet' },
              { key: 'drying', label: 'Drying' },
              { key: 'dry',    label: 'Dry standard met' },
            ]}
          />
        </div>

        <Input
          label="Captured at (date and time)"
          type="datetime-local"
          required
          value={form.captured_at}
          onChange={(e) => setForm((f) => ({ ...f, captured_at: e.target.value }))}
          hint="Defaults to now. Adjust if backdating from a paper log."
        />

        <Textarea
          label="Notes (optional)"
          rows={2}
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
        />

        {/* Inline photo */}
        <div className="bg-ink-50 border border-ink-200 rounded p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-ink-700">Meter photo</span>
            {pendingPhoto ? (
              <Badge tone="green">✓ Photo attached</Badge>
            ) : (
              <Button size="sm" variant="secondary" onClick={pickPhoto} type="button">
                + Attach photo
              </Button>
            )}
          </div>
          {pendingPhoto && (
            <p className="text-xs text-ink-600 mt-1 truncate">
              {pendingPhoto.name}
              <button
                type="button"
                onClick={() => setPendingPhoto(null)}
                className="ml-2 text-danger underline"
              >
                remove
              </button>
            </p>
          )}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            ref={photoInputRef}
            onChange={onPhotoFile}
            hidden
          />
        </div>

        <div className="flex gap-2 pt-1">
          <Button onClick={save} loading={saving}>Save reading</Button>
          {onCancel && <Button variant="ghost" onClick={onCancel}>Cancel</Button>}
        </div>
      </CardBody>
    </Card>
  )
}

// -----------------------------------------------------------------------------

function GoalHint({ locked, fromSettings }) {
  if (locked) {
    return (
      <p className="text-xs text-ink-600 mt-1">
        🔒 Locked — this matches the drying standard set on the first reading
        for this room and material.
      </p>
    )
  }
  if (fromSettings) {
    return (
      <p className="text-xs text-ink-600 mt-1">
        Pulled from Settings → Drying goals. Will lock once saved.
      </p>
    )
  }
  return (
    <p className="text-xs text-ink-500 mt-1">
      No drying standard set in Settings for this material — you can type one.
    </p>
  )
}

// Convert Date → "yyyy-MM-ddTHH:mm" (the format datetime-local expects)
function toLocalInputValue(d) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Convert "yyyy-MM-ddTHH:mm" back to ISO string for storage
function fromLocalInputValue(v) {
  if (!v) return new Date().toISOString()
  const d = new Date(v)
  return Number.isFinite(d.getTime()) ? d.toISOString() : new Date().toISOString()
}
