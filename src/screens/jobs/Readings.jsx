import { useEffect, useState, useCallback, useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth.jsx'
import { useSetting } from '../../lib/settings'
import { UNITS } from '../../lib/defaults'
import {
  Header, BottomNav, Section, Button, Card, CardHeader, CardBody, CardTitle,
  Badge, EmptyState, StatusPill,
} from '../../ui'
import AddReadingForm from '../../components/AddReadingForm'
import ReadingTrend from '../../components/ReadingTrend'

/**
 * ReadingsScreen — list and capture moisture readings for a job.
 *
 * Layout:
 *   - "Add reading" call-to-action that expands to the form
 *   - Reference readings strip (unaffected baseline)
 *   - Per-room → per-material grouped tables, each with a small trend chart
 */
export default function ReadingsScreen() {
  const { id: jobId } = useParams()
  const { profile } = useAuth()
  const materials = useSetting('materials')

  const [readings, setReadings] = useState([])
  const [rooms, setRooms] = useState([])
  const [chambers, setChambers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)

  const matLabel = useMemo(() => {
    const map = new Map((materials.data?.items ?? []).map((m) => [m.key, m.label]))
    return (key) => map.get(key) || key || '—'
  }, [materials.data])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const [rRes, roomRes, chRes] = await Promise.all([
      supabase.from('moisture_readings')
        .select('id, room_id, chamber_id, material_key, point_label, meter_type, unit, value, drying_goal, goal_source, reference_reading_id, is_reference, status, notes, captured_at')
        .eq('job_id', jobId)
        .order('captured_at', { ascending: true }),
      supabase.from('affected_rooms').select('id, room_name, chamber_id').eq('job_id', jobId).order('created_at'),
      supabase.from('drying_chambers').select('id, name').eq('job_id', jobId).order('created_at'),
    ])
    if (rRes.error) setError(rRes.error.message)
    else if (roomRes.error) setError(roomRes.error.message)
    else if (chRes.error) setError(chRes.error.message)
    else {
      setReadings(rRes.data ?? [])
      setRooms(roomRes.data ?? [])
      setChambers(chRes.data ?? [])
    }
    setLoading(false)
  }, [jobId])

  useEffect(() => { load() }, [load])

  function onSaved(r) {
    setReadings((arr) => [...arr, r])
    setShowForm(false)
  }

  const referenceReadings = readings.filter((r) => r.is_reference)
  const affected = readings.filter((r) => !r.is_reference)

  // Group affected readings: room → material → readings[]
  const groupedByRoom = useMemo(() => {
    const map = new Map()
    for (const r of affected) {
      const rk = r.room_id || '__unassigned__'
      if (!map.has(rk)) map.set(rk, new Map())
      const mk = r.material_key || '__nomat__'
      if (!map.get(rk).has(mk)) map.get(rk).set(mk, [])
      map.get(rk).get(mk).push(r)
    }
    // Build ordered output: rooms in their list order, then unassigned
    const orderedRooms = [...rooms.map((r) => r.id), '__unassigned__']
      .filter((id) => map.has(id))
      .map((id) => ({
        room: rooms.find((rr) => rr.id === id) || null,
        materials: [...map.get(id).entries()].map(([mk, rs]) => ({
          material_key: mk === '__nomat__' ? null : mk,
          readings: rs,
        })),
      }))
    return orderedRooms
  }, [affected, rooms])

  return (
    <div className="min-h-screen bg-ink-50">
      <Header breadcrumb={[
        { label: 'Jobs', to: '/jobs' },
        { label: 'Job', to: `/jobs/${jobId}` },
        { label: 'Readings' },
      ]} />
      <main className="max-w-5xl mx-auto p-4 sm:p-6 pb-24 space-y-5">

        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-danger rounded p-3 text-sm">
            {error}
          </div>
        )}

        {/* Add reading */}
        {showForm ? (
          <AddReadingForm
            jobId={jobId}
            tenantId={profile.tenant_id}
            rooms={rooms}
            chambers={chambers}
            referenceReadings={referenceReadings}
            onSaved={onSaved}
            onCancel={() => setShowForm(false)}
          />
        ) : (
          <div className="flex justify-between items-center">
            <p className="text-sm text-ink-600">
              {readings.length} reading{readings.length === 1 ? '' : 's'} captured
              {referenceReadings.length > 0 && ` · ${referenceReadings.length} reference`}
            </p>
            <Button onClick={() => setShowForm(true)} variant="accent">+ Add reading</Button>
          </div>
        )}

        {/* Reference readings */}
        {referenceReadings.length > 0 && (
          <Section title="Reference (unaffected)" description="Daily baseline from the unaffected area.">
            <Card>
              <CardBody>
                <ul className="divide-y divide-ink-100">
                  {referenceReadings.map((r) => (
                    <ReadingRow key={r.id} reading={r} matLabel={matLabel} compact />
                  ))}
                </ul>
              </CardBody>
            </Card>
          </Section>
        )}

        {/* Affected per-room/per-material with trends */}
        <Section title="Affected readings" description="Grouped by room and material.">
          {loading ? (
            <p className="text-ink-500 text-sm">Loading…</p>
          ) : groupedByRoom.length === 0 ? (
            <EmptyState
              title="No readings yet"
              body="Tap '+ Add reading' above to capture your first moisture reading."
            />
          ) : (
            <div className="space-y-4">
              {groupedByRoom.map(({ room, materials: mats }) => (
                <Card key={room?.id ?? 'unassigned'}>
                  <CardHeader>
                    <CardTitle>{room ? room.room_name : 'Unassigned readings'}</CardTitle>
                  </CardHeader>
                  <CardBody className="space-y-4">
                    {mats.map(({ material_key, readings }) => (
                      <MaterialBlock
                        key={material_key ?? 'no-material'}
                        materialKey={material_key}
                        materialLabel={material_key ? matLabel(material_key) : 'Unspecified material'}
                        readings={readings}
                      />
                    ))}
                  </CardBody>
                </Card>
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

function MaterialBlock({ materialKey, materialLabel, readings }) {
  // The drying goal is snapshotted on each reading; use the most recent one
  const sorted = [...readings].sort((a, b) => new Date(a.captured_at) - new Date(b.captured_at))
  const lastWithGoal = [...sorted].reverse().find((r) => r.drying_goal != null)
  const goal = lastWithGoal?.drying_goal
  const unit = sorted[0]?.unit
  const latest = sorted[sorted.length - 1]

  return (
    <div className="border border-ink-200 rounded p-3">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <h4 className="font-semibold text-ink-900">{materialLabel}</h4>
          <p className="text-xs text-ink-500 mt-0.5">
            {sorted.length} reading{sorted.length === 1 ? '' : 's'}
            {goal != null && ` · goal ${goal}${unit ? ` ${UNITS[unit] || unit}` : ''}`}
          </p>
        </div>
        {latest && <StatusPill status={latest.status} />}
      </div>
      <div className="mb-2">
        <ReadingTrend
          readings={sorted}
          goal={goal}
          unit={unit ? (UNITS[unit] || unit) : ''}
          height={70}
          width={280}
        />
      </div>
      <details>
        <summary className="text-xs text-ink-500 cursor-pointer select-none">
          Show {sorted.length} reading{sorted.length === 1 ? '' : 's'}
        </summary>
        <ul className="mt-2 divide-y divide-ink-100">
          {sorted.map((r) => <ReadingRow key={r.id} reading={r} />)}
        </ul>
      </details>
    </div>
  )
}

function ReadingRow({ reading, compact = false, matLabel }) {
  const date = new Date(reading.captured_at)
  return (
    <li className="py-1.5 flex items-center gap-3 text-sm flex-wrap">
      <span className="text-xs text-ink-500 font-mono w-32 shrink-0">
        {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </span>
      {!compact && reading.point_label && (
        <Badge tone="neutral">{reading.point_label}</Badge>
      )}
      <span className="font-semibold text-ink-900">
        {reading.value}{reading.unit ? ` ${UNITS[reading.unit] || reading.unit}` : ''}
      </span>
      {compact && matLabel && reading.material_key && (
        <span className="text-xs text-ink-500">{matLabel(reading.material_key)}</span>
      )}
      <StatusPill status={reading.status} />
      <GoalSourceBadge source={reading.goal_source} />
      {reading.notes && <span className="text-xs text-ink-500 truncate flex-1">{reading.notes}</span>}
    </li>
  )
}

function GoalSourceBadge({ source }) {
  if (!source) return null
  const map = {
    auto:      { tone: 'blue',    label: 'auto goal' },
    manual:    { tone: 'amber',   label: 'manual goal' },
    reference: { tone: 'neutral', label: 'ref-based goal' },
  }
  const cfg = map[source]
  if (!cfg) return null
  return <Badge tone={cfg.tone}>{cfg.label}</Badge>
}
