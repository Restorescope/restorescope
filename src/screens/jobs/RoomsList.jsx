import { useEffect, useState, useCallback } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth.jsx'
import { useSetting } from '../../lib/settings'
import {
  Header, BottomNav, Section, Button, Card, CardHeader, CardBody, CardTitle,
  Input, Select, Badge, EmptyState, StatusPill,
} from '../../ui'

/**
 * RoomsList — list of affected rooms for one job, grouped by drying chamber.
 *
 * Quick-add at the top: pick from defaults or type a custom name. Tap a row to
 * open the room detail screen.
 */
export default function RoomsList() {
  const { id: jobId } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()

  const roomsSetting = useSetting('rooms')

  const [rooms, setRooms] = useState([])
  const [chambers, setChambers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [adding, setAdding] = useState(false)
  const [newRoomName, setNewRoomName] = useState('')
  const [newRoomChamber, setNewRoomChamber] = useState('')
  const [showAddChamber, setShowAddChamber] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const [roomsRes, chambersRes] = await Promise.all([
      supabase
        .from('affected_rooms')
        .select('id, room_name, chamber_id, materials, actions, reasons, final_status, notes, created_at')
        .eq('job_id', jobId)
        .order('created_at', { ascending: true }),
      supabase
        .from('drying_chambers')
        .select('id, name, class_of_water, atmosphere_cuft, reference_room')
        .eq('job_id', jobId)
        .order('created_at', { ascending: true }),
    ])
    if (roomsRes.error)    setError(roomsRes.error.message)
    else if (chambersRes.error) setError(chambersRes.error.message)
    else {
      setRooms(roomsRes.data ?? [])
      setChambers(chambersRes.data ?? [])
    }
    setLoading(false)
  }, [jobId])

  useEffect(() => { load() }, [load])

  async function handleAddRoom(e) {
    e.preventDefault()
    if (!newRoomName.trim()) return
    setAdding(true); setError(null)
    try {
      const { data, error: err } = await supabase
        .from('affected_rooms')
        .insert({
          tenant_id: profile.tenant_id,
          job_id: jobId,
          room_name: newRoomName.trim(),
          chamber_id: newRoomChamber || null,
        })
        .select('id')
        .single()
      if (err) throw err
      setNewRoomName('')
      // Jump straight into editing the new room
      navigate(`/jobs/${jobId}/rooms/${data.id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setAdding(false)
    }
  }

  // Group rooms by chamber for display
  const grouped = groupByChamber(rooms, chambers)

  return (
    <div className="min-h-screen bg-ink-50">
      <Header breadcrumb={[
        { label: 'Jobs', to: '/jobs' },
        { label: 'Job', to: `/jobs/${jobId}` },
        { label: 'Affected rooms' },
      ]} />
      <main className="max-w-4xl mx-auto p-4 sm:p-6 pb-24 space-y-5">

        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-danger rounded p-3 text-sm">
            {error}
          </div>
        )}

        {/* Quick-add */}
        <Card>
          <CardHeader><CardTitle>Add a room</CardTitle></CardHeader>
          <CardBody>
            <form onSubmit={handleAddRoom} className="space-y-3">
              <RoomNameField
                value={newRoomName}
                onChange={setNewRoomName}
                presets={roomsSetting.data?.items ?? []}
              />
              <Select
                label="Drying chamber"
                placeholder="No chamber yet"
                value={newRoomChamber}
                onChange={(e) => setNewRoomChamber(e.target.value)}
                options={chambers.map((c) => ({ key: c.id, label: c.name }))}
                hint="Optional — group rooms drying together."
              />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" loading={adding} disabled={!newRoomName.trim()}>
                  + Add room
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowAddChamber(true)}
                >
                  + New chamber
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>

        {showAddChamber && (
          <NewChamberInline
            jobId={jobId}
            tenantId={profile.tenant_id}
            onClose={() => setShowAddChamber(false)}
            onCreated={(c) => {
              setChambers((prev) => [...prev, c])
              setNewRoomChamber(c.id)
              setShowAddChamber(false)
            }}
          />
        )}

        {/* Rooms list */}
        <Section title="Rooms" description={`${rooms.length} room${rooms.length === 1 ? '' : 's'} on this job.`}>
          {loading ? (
            <p className="text-ink-500 text-sm">Loading…</p>
          ) : rooms.length === 0 ? (
            <EmptyState
              title="No rooms added yet"
              body="Use the form above to add the first affected room. You can always add more later."
            />
          ) : (
            <div className="space-y-4">
              {grouped.map(({ chamber, items }) => (
                <ChamberGroup key={chamber?.id ?? 'unassigned'} chamber={chamber}>
                  <ul className="space-y-2">
                    {items.map((r) => <RoomRow key={r.id} room={r} jobId={jobId} />)}
                  </ul>
                </ChamberGroup>
              ))}
            </div>
          )}
        </Section>
      </main>

      <BottomNav jobId={jobId} />
    </div>
  )
}

// -----------------------------------------------------------------------------

function RoomNameField({ value, onChange, presets }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-ink-700 mb-1">
        Room name <span className="text-danger">*</span>
      </label>
      <input
        list="room-presets"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Pick from list or type a custom name"
        className="w-full h-11 px-3 rounded border bg-white text-ink-900 placeholder:text-ink-400
                   border-ink-300 focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/30 focus:outline-none"
      />
      <datalist id="room-presets">
        {presets.map((p) => (
          <option key={p.key} value={p.label} />
        ))}
      </datalist>
      <span className="block text-xs text-ink-500 mt-1">
        Suggestions appear as you type. Anything custom is fine — type it in.
      </span>
    </div>
  )
}

function NewChamberInline({ jobId, tenantId, onClose, onCreated }) {
  const [name, setName] = useState('')
  const [classOfWater, setClassOfWater] = useState('')
  const [refRoom, setRefRoom] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  async function save(e) {
    e.preventDefault()
    setErr(null); setSaving(true)
    try {
      const { data, error } = await supabase
        .from('drying_chambers')
        .insert({
          tenant_id: tenantId,
          job_id: jobId,
          name: name.trim() || `Chamber ${Date.now() % 100}`,
          class_of_water: classOfWater || null,
          reference_room: refRoom.trim() || null,
        })
        .select('id, name, class_of_water, atmosphere_cuft, reference_room')
        .single()
      if (error) throw error
      onCreated(data)
    } catch (e) {
      setErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle>New drying chamber</CardTitle></CardHeader>
      <CardBody>
        <form onSubmit={save} className="space-y-3">
          {err && <p className="text-sm text-danger">{err}</p>}
          <Input label="Name" required placeholder="e.g. Chamber 1" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="grid sm:grid-cols-2 gap-3">
            <Select
              label="Class of water"
              placeholder="—"
              value={classOfWater}
              onChange={(e) => setClassOfWater(e.target.value)}
              options={[
                { key: '1', label: 'Class 1' },
                { key: '2', label: 'Class 2' },
                { key: '3', label: 'Class 3' },
                { key: '4', label: 'Class 4' },
              ]}
            />
            <Input
              label="Reference (unaffected) room"
              placeholder="e.g. Entryway"
              value={refRoom}
              onChange={(e) => setRefRoom(e.target.value)}
              hint="Used as the dry comparison area."
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" loading={saving}>Create chamber</Button>
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </CardBody>
    </Card>
  )
}

function ChamberGroup({ chamber, children }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <h3 className="font-condensed text-lg font-bold tracking-wide text-ink-700">
          {chamber ? chamber.name.toUpperCase() : 'UNASSIGNED'}
        </h3>
        {chamber?.class_of_water && <Badge tone="amber">Class {chamber.class_of_water}</Badge>}
        {chamber?.reference_room && <Badge tone="neutral">Ref: {chamber.reference_room}</Badge>}
      </div>
      {children}
    </div>
  )
}

function RoomRow({ room, jobId }) {
  const matCount = (room.materials ?? []).length
  const hasStatus = !!room.final_status
  return (
    <li>
      <Link
        to={`/jobs/${jobId}/rooms/${room.id}`}
        className="flex items-center justify-between gap-3 bg-white rounded-lg border border-ink-200/60 shadow-card p-3 hover:shadow-card-hover transition-shadow"
      >
        <div className="min-w-0">
          <p className="font-semibold text-ink-900 truncate">{room.room_name}</p>
          <p className="text-xs text-ink-500 mt-0.5">
            {matCount > 0 ? `${matCount} material${matCount === 1 ? '' : 's'} affected` : 'No materials yet'}
            {room.notes && ' · has notes'}
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          {hasStatus
            ? <Badge tone="green">{prettyStatus(room.final_status)}</Badge>
            : <Badge tone="neutral">Open</Badge>}
        </div>
      </Link>
    </li>
  )
}

// -----------------------------------------------------------------------------

function groupByChamber(rooms, chambers) {
  const byId = new Map(chambers.map((c) => [c.id, c]))
  const groups = new Map()
  for (const r of rooms) {
    const key = r.chamber_id || '__unassigned__'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(r)
  }
  // Order: each chamber in its creation order, unassigned last
  const ordered = []
  for (const c of chambers) {
    if (groups.has(c.id)) ordered.push({ chamber: c, items: groups.get(c.id) })
  }
  if (groups.has('__unassigned__')) {
    ordered.push({ chamber: null, items: groups.get('__unassigned__') })
  }
  return ordered
}

function prettyStatus(key) {
  const map = {
    dry_standard_met: 'Dry standard met',
    ready_for_rebuild: 'Ready for rebuild',
    monitoring_continued: 'Monitoring',
    limitation_noted: 'Limitation noted',
    stopped_at_request: 'Stopped',
    referred: 'Referred',
  }
  return map[key] ?? key
}
