import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useSetting } from '../../lib/settings'
import {
  Header, BottomNav, Section, Button, Card, CardHeader, CardBody, CardTitle,
  Input, Select, Textarea, Badge,
} from '../../ui'
import ChipMultiSelect from '../../components/ChipMultiSelect'
import PhotoUploader from '../../components/PhotoUploader'
import PhotoGallery from '../../components/PhotoGallery'

/**
 * RoomDetail — edit a single affected room's materials / actions / reasons /
 * final status / notes / chamber assignment.
 *
 * Uses an unsaved-changes pattern: load the row into local state, edit freely,
 * tap Save to commit. Ctrl/Cmd+S also saves.
 */
export default function RoomDetail() {
  const { id: jobId, roomId } = useParams()
  const navigate = useNavigate()

  const materialsSetting = useSetting('materials')
  const actionsSetting   = useSetting('actions')
  const reasonsSetting   = useSetting('reasons')
  const statusSetting    = useSetting('final_statuses')

  const [room, setRoom] = useState(null)
  const [chambers, setChambers] = useState([])
  const [materialOptions, setMaterialOptions] = useState([]) // includes per-room customs
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [photos, setPhotos] = useState([])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const [roomRes, chambersRes, photosRes] = await Promise.all([
      supabase
        .from('affected_rooms')
        .select('id, room_name, chamber_id, materials, actions, reasons, final_status, notes')
        .eq('id', roomId)
        .maybeSingle(),
      supabase
        .from('drying_chambers')
        .select('id, name')
        .eq('job_id', jobId)
        .order('created_at'),
      supabase
        .from('photos')
        .select('id, room_id, work_item_id, reading_id, category, storage_path, taken_at')
        .eq('room_id', roomId)
        .order('taken_at', { ascending: true }),
    ])
    if (roomRes.error || !roomRes.data) {
      setError(roomRes.error?.message || 'Room not found')
      setLoading(false); return
    }
    setRoom({
      ...roomRes.data,
      materials: roomRes.data.materials ?? [],
      actions:   roomRes.data.actions ?? [],
      reasons:   roomRes.data.reasons ?? [],
    })
    setChambers(chambersRes.data ?? [])
    setPhotos(photosRes.data ?? [])
    setLoading(false)
  }, [roomId, jobId])

  useEffect(() => { load() }, [load])

  // Merge tenant materials with any custom keys this room already has
  useEffect(() => {
    if (!materialsSetting.data || !room) return
    const tenantOpts = materialsSetting.data.items ?? []
    const tenantKeys = new Set(tenantOpts.map((o) => o.key))
    const customs = (room.materials ?? [])
      .filter((m) => !tenantKeys.has(m.key))
      .map((m) => ({ key: m.key, label: m.custom_label || m.label || m.key }))
    setMaterialOptions([...tenantOpts, ...customs])
  }, [materialsSetting.data, room])

  function update(patch) {
    setRoom((r) => ({ ...r, ...patch }))
    setDirty(true)
  }

  function setMaterials(keys) {
    // Preserve any custom_label info on existing materials
    const next = keys.map((k) => {
      const existing = (room.materials ?? []).find((m) => m.key === k)
      return existing ?? { key: k }
    })
    update({ materials: next })
  }
  function setActions(keys) { update({ actions: keys.map((k) => ({ key: k })) }) }
  function setReasons(keys) { update({ reasons: keys.map((k) => ({ key: k })) }) }

  function addCustomMaterial(label) {
    const key = `custom_${slug(label)}`
    if (materialOptions.some((m) => m.key === key)) return
    setMaterialOptions((prev) => [...prev, { key, label }])
    update({ materials: [...(room.materials ?? []), { key, custom_label: label }] })
  }

  async function save() {
    setError(null); setSaving(true)
    try {
      const { error: err } = await supabase
        .from('affected_rooms')
        .update({
          room_name: room.room_name,
          chamber_id: room.chamber_id || null,
          materials: room.materials,
          actions:   room.actions,
          reasons:   room.reasons,
          final_status: room.final_status || null,
          notes: room.notes || null,
        })
        .eq('id', roomId)
      if (err) throw err
      setDirty(false)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setSaving(true); setError(null)
    try {
      const { error: err } = await supabase.from('affected_rooms').delete().eq('id', roomId)
      if (err) throw err
      navigate(`/jobs/${jobId}/rooms`)
    } catch (e) {
      setError(e.message); setSaving(false)
    }
  }

  // Cmd/Ctrl+S to save
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        if (dirty && !saving) save()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (loading) {
    return (
      <div className="min-h-screen bg-ink-50">
        <Header breadcrumb={[
          { label: 'Jobs', to: '/jobs' },
          { label: 'Job', to: `/jobs/${jobId}` },
          { label: 'Rooms', to: `/jobs/${jobId}/rooms` },
          { label: 'Loading…' },
        ]} />
        <main className="max-w-3xl mx-auto p-4 sm:p-6 text-ink-500">Loading…</main>
      </div>
    )
  }
  if (error && !room) {
    return (
      <div className="min-h-screen bg-ink-50">
        <Header breadcrumb={[
          { label: 'Jobs', to: '/jobs' },
          { label: 'Job', to: `/jobs/${jobId}` },
          { label: 'Rooms', to: `/jobs/${jobId}/rooms` },
          { label: 'Not found' },
        ]} />
        <main className="max-w-3xl mx-auto p-4 sm:p-6">
          <p className="text-danger mb-3">{error}</p>
          <Link to={`/jobs/${jobId}/rooms`}><Button>Back to rooms</Button></Link>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-ink-50">
      <Header breadcrumb={[
        { label: 'Jobs', to: '/jobs' },
        { label: 'Job', to: `/jobs/${jobId}` },
        { label: 'Rooms', to: `/jobs/${jobId}/rooms` },
        { label: room.room_name || 'Room' },
      ]} />
      <main className="max-w-3xl mx-auto p-4 sm:p-6 pb-32 space-y-5">
        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-danger rounded p-3 text-sm">
            {error}
          </div>
        )}

        <Card>
          <CardHeader><CardTitle>Basics</CardTitle></CardHeader>
          <CardBody className="space-y-3">
            <Input
              label="Room name"
              required
              value={room.room_name}
              onChange={(e) => update({ room_name: e.target.value })}
            />
            <Select
              label="Drying chamber"
              placeholder="Unassigned"
              value={room.chamber_id || ''}
              onChange={(e) => update({ chamber_id: e.target.value })}
              options={chambers.map((c) => ({ key: c.id, label: c.name }))}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>Materials affected</CardTitle></CardHeader>
          <CardBody>
            <ChipMultiSelect
              hint="Tap each material that's affected. Add custom items if needed."
              options={materialOptions}
              value={(room.materials ?? []).map((m) => m.key)}
              onChange={setMaterials}
              allowCustom
              onAddCustom={addCustomMaterial}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>Actions taken</CardTitle></CardHeader>
          <CardBody>
            <ChipMultiSelect
              hint="What did you do in this room?"
              options={actionsSetting.data?.items ?? []}
              value={(room.actions ?? []).map((a) => a.key)}
              onChange={setActions}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>Reasons for scope</CardTitle></CardHeader>
          <CardBody>
            <ChipMultiSelect
              hint="Why was this scope necessary? Pick all that apply."
              options={reasonsSetting.data?.items ?? []}
              value={(room.reasons ?? []).map((r) => r.key)}
              onChange={setReasons}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>Final status</CardTitle></CardHeader>
          <CardBody>
            <Select
              placeholder="Not set yet"
              value={room.final_status || ''}
              onChange={(e) => update({ final_status: e.target.value })}
              options={statusSetting.data?.items ?? []}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
          <CardBody>
            <Textarea
              rows={4}
              placeholder="Anything specific about this room — limitations, customer concerns, observations…"
              value={room.notes || ''}
              onChange={(e) => update({ notes: e.target.value })}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Photos</CardTitle>
            <p className="text-xs text-ink-500 mt-1">
              {photos.length} photo{photos.length === 1 ? '' : 's'} for this room.
              Required by default: affected area overview, moisture readings, equipment placement, final condition.
            </p>
          </CardHeader>
          <CardBody className="space-y-4">
            <PhotoUploader
              jobId={jobId}
              roomId={roomId}
              filterCategories={[
                'affected_overview', 'moisture_readings', 'equipment_placement',
                'final_condition', 'before_removal', 'removal_progress',
                'exposed_after', 'cleaning', 'final_dry',
              ]}
              onUploaded={(row) => setPhotos((p) => [...p, row])}
            />
            <PhotoGallery
              photos={photos}
              onDeleted={(id) => setPhotos((p) => p.filter((x) => x.id !== id))}
              emptyHint="No photos for this room yet."
            />
          </CardBody>
        </Card>

        <div className="pt-2">
          <Button
            variant="danger"
            type="button"
            onClick={handleDelete}
            loading={saving && confirmDelete}
          >
            {confirmDelete ? 'Tap again to confirm delete' : 'Delete room'}
          </Button>
        </div>
      </main>

      {/* Sticky save bar */}
      <div className="fixed bottom-0 inset-x-0 z-20 bg-white border-t border-ink-200 shadow-[0_-2px_8px_rgba(15,23,42,0.06)] sm:static sm:border-0 sm:shadow-none sm:bg-transparent">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <span className="text-sm text-ink-500 flex-1">
            {dirty ? <Badge tone="amber">Unsaved changes</Badge> : <Badge tone="green">Saved</Badge>}
          </span>
          <Button onClick={save} disabled={!dirty} loading={saving} size="lg">
            Save room
          </Button>
        </div>
      </div>

      <BottomNav jobId={jobId} />
    </div>
  )
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}
