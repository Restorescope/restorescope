import { useEffect, useState, useCallback, useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth.jsx'
import {
  Header, BottomNav, Section, Button, Card, CardHeader, CardBody, CardTitle,
  Input, Select, Textarea, Badge, EmptyState,
} from '../../ui'

/**
 * MonitoringScreen — daily chamber visits.
 *
 * Each visit captures:
 *   - chamber + visit time
 *   - ambient: temp °F, RH %, GPP
 *   - dehu performance: intake RH, intake GPP, exhaust GPP, hours running
 *   - grain depression = intake_gpp - exhaust_gpp (auto-computed, but stored)
 *   - notes
 *
 * Per Batch 6: each visit is a separate timestamped event. Stall detection
 * (3+ days no improvement) and long-stay warnings (4+ days) are computed
 * elsewhere — this screen is just capture + history.
 */
export default function MonitoringScreen() {
  const { id: jobId } = useParams()
  const { profile } = useAuth()

  const [visits, setVisits] = useState([])
  const [chambers, setChambers] = useState([])
  const [equipment, setEquipment] = useState([])  // for figuring out which chambers have dehus
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [defaultChamberId, setDefaultChamberId] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const [vRes, chRes, eqRes] = await Promise.all([
      supabase
        .from('monitoring_visits')
        .select('id, chamber_id, visit_at, ambient_temp_f, ambient_rh, ambient_gpp, dehu_intake_rh, dehu_intake_gpp, dehu_exhaust_gpp, grain_depression, hours_running, notes')
        .eq('job_id', jobId)
        .order('visit_at', { ascending: false }),
      supabase.from('drying_chambers').select('id, name, class_of_water').eq('job_id', jobId).order('created_at'),
      supabase.from('equipment_events').select('chamber_id, equipment_type, event_type, asset_label').eq('job_id', jobId),
    ])
    if (vRes.error) setError(vRes.error.message)
    else if (chRes.error) setError(chRes.error.message)
    else if (eqRes.error) setError(eqRes.error.message)
    else {
      setVisits(vRes.data ?? [])
      setChambers(chRes.data ?? [])
      setEquipment(eqRes.data ?? [])
    }
    setLoading(false)
  }, [jobId])

  useEffect(() => { load() }, [load])

  function onSaved(v) {
    setVisits((arr) => [v, ...arr])
    setShowForm(false)
    setDefaultChamberId('')
  }

  // Group visits by chamber, sorted reverse-chronologically within each
  const byChamber = useMemo(() => {
    const map = new Map()
    for (const v of visits) {
      const key = v.chamber_id || '__none__'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(v)
    }
    const ordered = []
    for (const c of chambers) {
      if (map.has(c.id)) ordered.push({ chamber: c, visits: map.get(c.id) })
    }
    if (map.has('__none__')) ordered.push({ chamber: null, visits: map.get('__none__') })
    return ordered
  }, [visits, chambers])

  // For each chamber, figure out if it has any dehus currently placed.
  // (Helps decide whether to require dehu performance fields.)
  const chamberDehuMap = useMemo(() => {
    const placed = new Map() // chamber_id -> Set of asset_labels with dehu
    const removed = new Map()
    for (const e of equipment) {
      if (!e.chamber_id) continue
      if (!isDehu(e.equipment_type)) continue
      const m = e.event_type === 'placed' ? placed : e.event_type === 'removed' ? removed : null
      if (!m) continue
      if (!m.has(e.chamber_id)) m.set(e.chamber_id, new Set())
      m.get(e.chamber_id).add(e.asset_label || '__unlabeled__')
    }
    const result = new Map()
    for (const [chId, labels] of placed) {
      const removedLabels = removed.get(chId) ?? new Set()
      const stillThere = [...labels].filter((l) => !removedLabels.has(l))
      result.set(chId, stillThere.length > 0)
    }
    return result
  }, [equipment])

  return (
    <div className="min-h-screen bg-ink-50">
      <Header breadcrumb={[
        { label: 'Jobs', to: '/jobs' },
        { label: 'Job', to: `/jobs/${jobId}` },
        { label: 'Daily monitoring' },
      ]} />
      <main className="max-w-5xl mx-auto p-4 sm:p-6 pb-24 space-y-5">

        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-danger rounded p-3 text-sm">
            {error}
          </div>
        )}

        {showForm ? (
          <AddVisitForm
            jobId={jobId}
            tenantId={profile.tenant_id}
            chambers={chambers}
            chamberHasDehu={chamberDehuMap}
            defaultChamberId={defaultChamberId}
            onSaved={onSaved}
            onCancel={() => { setShowForm(false); setDefaultChamberId('') }}
          />
        ) : (
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm text-ink-600">
              {visits.length} visit{visits.length === 1 ? '' : 's'} logged
              {chambers.length > 0 && ` across ${chambers.length} chamber${chambers.length === 1 ? '' : 's'}`}
            </p>
            <Button
              onClick={() => {
                if (chambers.length === 1) setDefaultChamberId(chambers[0].id)
                setShowForm(true)
              }}
              variant="accent"
            >
              + Log visit
            </Button>
          </div>
        )}

        {chambers.length === 0 && !loading && (
          <Card>
            <CardBody>
              <p className="text-sm text-ink-700">
                <strong>No chambers yet.</strong> Daily monitoring is tracked per drying chamber.
                Go to <Link to={`/jobs/${jobId}/rooms`} className="text-brand-blue font-semibold underline">Affected rooms</Link>{' '}
                to create your first chamber, then come back here to log visits.
              </p>
            </CardBody>
          </Card>
        )}

        {loading ? (
          <p className="text-ink-500 text-sm">Loading…</p>
        ) : visits.length === 0 && chambers.length > 0 ? (
          <EmptyState
            title="No monitoring visits yet"
            body="Log your first daily visit. Capture ambient conditions and any active dehumidifier performance numbers."
          />
        ) : (
          <Section title="Visit history" description="Most recent first, grouped by chamber.">
            <div className="space-y-4">
              {byChamber.map(({ chamber, visits }) => (
                <ChamberHistoryCard
                  key={chamber?.id ?? 'unassigned'}
                  chamber={chamber}
                  visits={visits}
                  onAddVisit={() => {
                    if (chamber) setDefaultChamberId(chamber.id)
                    setShowForm(true)
                  }}
                />
              ))}
            </div>
          </Section>
        )}
      </main>

      <BottomNav jobId={jobId} />
    </div>
  )
}

// ===========================================================================
// Add visit form
// ===========================================================================

function AddVisitForm({ jobId, tenantId, chambers, chamberHasDehu, defaultChamberId, onSaved, onCancel }) {
  const { profile } = useAuth()
  const [form, setForm] = useState(() => ({
    chamber_id:        defaultChamberId || (chambers[0]?.id || ''),
    visit_at:          localDatetimeNow(),
    ambient_temp_f:    '',
    ambient_rh:        '',
    ambient_gpp:       '',
    dehu_intake_rh:    '',
    dehu_intake_gpp:   '',
    dehu_exhaust_gpp:  '',
    hours_running:     '',
    notes:             '',
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Live grain depression preview
  const grainDepression = useMemo(() => {
    const intake = parseFloat(form.dehu_intake_gpp)
    const exhaust = parseFloat(form.dehu_exhaust_gpp)
    if (Number.isFinite(intake) && Number.isFinite(exhaust)) return intake - exhaust
    return null
  }, [form.dehu_intake_gpp, form.dehu_exhaust_gpp])

  const showDehuFields = form.chamber_id && (chamberHasDehu.get(form.chamber_id) ?? false)

  async function save() {
    setError(null)
    if (!form.chamber_id) { setError('Pick a chamber.'); return }
    setSaving(true)
    try {
      const payload = {
        tenant_id: tenantId,
        job_id: jobId,
        chamber_id: form.chamber_id,
        visit_at: new Date(form.visit_at).toISOString(),
        ambient_temp_f:   numOrNull(form.ambient_temp_f),
        ambient_rh:       numOrNull(form.ambient_rh),
        ambient_gpp:      numOrNull(form.ambient_gpp),
        dehu_intake_rh:   numOrNull(form.dehu_intake_rh),
        dehu_intake_gpp:  numOrNull(form.dehu_intake_gpp),
        dehu_exhaust_gpp: numOrNull(form.dehu_exhaust_gpp),
        grain_depression: grainDepression,
        hours_running:    numOrNull(form.hours_running),
        notes: form.notes || null,
        created_by: profile.id,
      }
      const { data, error: err } = await supabase
        .from('monitoring_visits')
        .insert(payload)
        .select('*')
        .single()
      if (err) throw err
      onSaved(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle>Log a monitoring visit</CardTitle></CardHeader>
      <CardBody className="space-y-4">
        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-danger rounded p-3 text-sm">
            {error}
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-3">
          <Select
            label="Chamber"
            required
            placeholder="Pick a chamber…"
            value={form.chamber_id}
            onChange={(e) => setForm((f) => ({ ...f, chamber_id: e.target.value }))}
            options={chambers.map((c) => ({ key: c.id, label: c.class_of_water ? `${c.name} (Class ${c.class_of_water})` : c.name }))}
          />
          <Input
            label="Visit date/time"
            type="datetime-local"
            value={form.visit_at}
            onChange={(e) => setForm((f) => ({ ...f, visit_at: e.target.value }))}
          />
        </div>

        <div className="border-t border-ink-200 pt-3">
          <p className="text-sm font-semibold text-ink-700 mb-3">Ambient (chamber air)</p>
          <div className="grid sm:grid-cols-3 gap-3">
            <Input
              label="Temperature"
              type="number"
              step="0.1"
              inputMode="decimal"
              suffix="°F"
              value={form.ambient_temp_f}
              onChange={(e) => setForm((f) => ({ ...f, ambient_temp_f: e.target.value }))}
              hint="°F"
            />
            <Input
              label="Relative humidity"
              type="number"
              step="0.1"
              inputMode="decimal"
              value={form.ambient_rh}
              onChange={(e) => setForm((f) => ({ ...f, ambient_rh: e.target.value }))}
              hint="% RH"
            />
            <Input
              label="Grains per pound"
              type="number"
              step="0.1"
              inputMode="decimal"
              value={form.ambient_gpp}
              onChange={(e) => setForm((f) => ({ ...f, ambient_gpp: e.target.value }))}
              hint="GPP"
            />
          </div>
        </div>

        {(showDehuFields || form.dehu_intake_gpp || form.dehu_exhaust_gpp) && (
          <div className="border-t border-ink-200 pt-3">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-ink-700">Dehumidifier performance</p>
              {grainDepression != null && (
                <Badge tone={grainDepression > 10 ? 'green' : grainDepression > 5 ? 'amber' : 'red'}>
                  Grain depression {grainDepression.toFixed(1)} GPP
                </Badge>
              )}
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <Input
                label="Intake RH"
                type="number"
                step="0.1"
                inputMode="decimal"
                value={form.dehu_intake_rh}
                onChange={(e) => setForm((f) => ({ ...f, dehu_intake_rh: e.target.value }))}
                hint="% RH at the dehu intake"
              />
              <Input
                label="Hours running"
                type="number"
                step="0.5"
                inputMode="decimal"
                value={form.hours_running}
                onChange={(e) => setForm((f) => ({ ...f, hours_running: e.target.value }))}
                hint="Since last check"
              />
              <Input
                label="Intake GPP"
                type="number"
                step="0.1"
                inputMode="decimal"
                value={form.dehu_intake_gpp}
                onChange={(e) => setForm((f) => ({ ...f, dehu_intake_gpp: e.target.value }))}
                hint="GPP at the intake"
              />
              <Input
                label="Exhaust GPP"
                type="number"
                step="0.1"
                inputMode="decimal"
                value={form.dehu_exhaust_gpp}
                onChange={(e) => setForm((f) => ({ ...f, dehu_exhaust_gpp: e.target.value }))}
                hint="GPP at the exhaust"
              />
            </div>
            <p className="text-xs text-ink-500 mt-2">
              Grain depression auto-computed as intake GPP − exhaust GPP. Healthy LGRs typically deliver &gt; 10 GPP depression.
            </p>
          </div>
        )}

        {!showDehuFields && form.chamber_id && (
          <p className="text-xs text-ink-500 italic">
            No dehumidifier currently placed in this chamber. Dehu performance fields hidden — type any GPP value above to show them anyway.
          </p>
        )}

        <Textarea
          label="Notes"
          rows={2}
          placeholder="Anything observed on this visit"
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
        />

        <div className="flex gap-2 pt-1">
          <Button onClick={save} loading={saving}>Save visit</Button>
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        </div>
      </CardBody>
    </Card>
  )
}

// ===========================================================================
// Chamber history card
// ===========================================================================

function ChamberHistoryCard({ chamber, visits, onAddVisit }) {
  // Trend: ambient RH over time (most recent on right) — drying should trend down
  const trend = useMemo(() => {
    const rhs = visits.map((v) => v.ambient_rh).filter((v) => v != null)
    if (rhs.length < 2) return null
    const oldest = visits[visits.length - 1].ambient_rh
    const newest = visits[0].ambient_rh
    if (oldest == null || newest == null) return null
    const diff = newest - oldest
    return { diff, oldest, newest, trending: diff < -2 ? 'improving' : diff > 2 ? 'worsening' : 'stable' }
  }, [visits])

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle>{chamber ? chamber.name : 'Unassigned'}</CardTitle>
          <div className="flex items-center gap-2">
            {trend && (
              <Badge tone={trend.trending === 'improving' ? 'green' : trend.trending === 'worsening' ? 'red' : 'neutral'}>
                RH {trend.trending} ({trend.diff > 0 ? '+' : ''}{trend.diff.toFixed(1)} %)
              </Badge>
            )}
            <Badge tone="blue">{visits.length} visit{visits.length === 1 ? '' : 's'}</Badge>
            <Button size="sm" variant="secondary" onClick={onAddVisit}>+ Visit</Button>
          </div>
        </div>
      </CardHeader>
      <CardBody>
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-xs text-ink-500 uppercase tracking-wide border-b border-ink-200">
                <th className="py-1.5 pr-3 font-semibold">When</th>
                <th className="py-1.5 pr-3 font-semibold">Temp</th>
                <th className="py-1.5 pr-3 font-semibold">RH</th>
                <th className="py-1.5 pr-3 font-semibold">GPP</th>
                <th className="py-1.5 pr-3 font-semibold">Dehu intake RH/GPP</th>
                <th className="py-1.5 pr-3 font-semibold">Exhaust GPP</th>
                <th className="py-1.5 pr-3 font-semibold">Δ Grain</th>
                <th className="py-1.5 pr-3 font-semibold">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {visits.map((v) => (
                <tr key={v.id}>
                  <td className="py-1.5 pr-3 font-mono text-xs">{formatDateShort(v.visit_at)}</td>
                  <td className="py-1.5 pr-3">{v.ambient_temp_f != null ? `${v.ambient_temp_f}°F` : '—'}</td>
                  <td className="py-1.5 pr-3">{v.ambient_rh != null ? `${v.ambient_rh}%` : '—'}</td>
                  <td className="py-1.5 pr-3">{v.ambient_gpp != null ? `${v.ambient_gpp}` : '—'}</td>
                  <td className="py-1.5 pr-3 text-xs">
                    {v.dehu_intake_rh != null && `${v.dehu_intake_rh}% / `}
                    {v.dehu_intake_gpp != null ? `${v.dehu_intake_gpp}` : (v.dehu_intake_rh == null ? '—' : '')}
                  </td>
                  <td className="py-1.5 pr-3">{v.dehu_exhaust_gpp != null ? `${v.dehu_exhaust_gpp}` : '—'}</td>
                  <td className="py-1.5 pr-3">
                    {v.grain_depression != null ? (
                      <span className={`font-semibold ${v.grain_depression > 10 ? 'text-success' : v.grain_depression > 5 ? 'text-warning' : 'text-danger'}`}>
                        {v.grain_depression.toFixed(1)}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="py-1.5 pr-3 text-xs text-ink-600 truncate max-w-[180px]">{v.notes || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  )
}

// ===========================================================================
// Helpers
// ===========================================================================

function isDehu(equipmentType) {
  if (!equipmentType) return false
  const t = equipmentType.toLowerCase()
  return t.includes('dehu')
}

function numOrNull(s) {
  if (s === '' || s == null) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function localDatetimeNow() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatDateShort(iso) {
  const d = new Date(iso)
  return `${d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}
