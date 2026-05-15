import { useEffect, useState, useCallback, useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth.jsx'
import {
  Header, BottomNav, Section, Button, Card, CardHeader, CardBody, CardTitle,
  Input, Select, Textarea, Badge, EmptyState,
} from '../../ui'
import { gppFromTempRh } from '../../lib/psychrometrics'

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
  const [dehuReadings, setDehuReadings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [defaultChamberId, setDefaultChamberId] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const [vRes, chRes, eqRes, drRes] = await Promise.all([
      supabase
        .from('monitoring_visits')
        .select('id, chamber_id, visit_at, ambient_temp_f, ambient_rh, ambient_gpp, hours_running, notes, outside_temp_f, outside_rh, outside_gpp, weather_conditions, unaffected_temp_f, unaffected_rh, unaffected_gpp')
        .eq('job_id', jobId)
        .order('visit_at', { ascending: false }),
      supabase.from('drying_chambers').select('id, name, class_of_water').eq('job_id', jobId).order('created_at'),
      supabase.from('equipment_events').select('chamber_id, equipment_type, event_type, asset_label, event_at').eq('job_id', jobId).order('event_at', { ascending: true }),
      supabase.from('monitoring_dehu_readings').select('id, visit_id, dehu_asset_label, reading_at, exhaust_temp_f, exhaust_rh, exhaust_gpp').eq('job_id', jobId).order('reading_at', { ascending: false }),
    ])
    if (vRes.error) setError(vRes.error.message)
    else if (chRes.error) setError(chRes.error.message)
    else if (eqRes.error) setError(eqRes.error.message)
    else if (drRes.error) setError(drRes.error.message)
    else {
      setVisits(vRes.data ?? [])
      setChambers(chRes.data ?? [])
      setEquipment(eqRes.data ?? [])
      setDehuReadings(drRes.data ?? [])
    }
    setLoading(false)
  }, [jobId])

  useEffect(() => { load() }, [load])

  function onSaved(v) {
    setVisits((arr) => [v, ...arr])
    setShowForm(false)
    setDefaultChamberId('')
    // Refresh dehu readings to pick up rows just inserted
    supabase.from('monitoring_dehu_readings')
      .select('id, visit_id, dehu_asset_label, reading_at, exhaust_temp_f, exhaust_rh, exhaust_gpp')
      .eq('job_id', jobId)
      .order('reading_at', { ascending: false })
      .then(({ data }) => { if (data) setDehuReadings(data) })
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

  // List of currently-placed dehus across the WHOLE job (not per-chamber).
  // Identified by their asset_label. Used for the per-dehu OUT readings.
  // A dehu counts as "still placed" if it has a 'placed' event with no later 'removed' for the same label.
  const jobDehus = useMemo(() => {
    const byLabel = new Map() // label -> { lastEventType, equipmentType }
    for (const e of equipment) {
      if (!isDehu(e.equipment_type)) continue
      const label = e.asset_label || '(unlabeled dehu)'
      const existing = byLabel.get(label) || { label, equipment_type: e.equipment_type, lastEvent: null }
      // events are sorted ascending, so the last assignment wins
      existing.lastEvent = e.event_type
      byLabel.set(label, existing)
    }
    return Array.from(byLabel.values())
      .filter((d) => d.lastEvent !== 'removed')
      .map((d) => ({ asset_label: d.label, equipment_type: d.equipment_type }))
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
            jobDehus={jobDehus}
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
                  dehuReadings={dehuReadings}
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

function AddVisitForm({ jobId, tenantId, chambers, chamberHasDehu, jobDehus, defaultChamberId, onSaved, onCancel }) {
  const { profile } = useAuth()
  const [form, setForm] = useState(() => ({
    chamber_id:        defaultChamberId || (chambers[0]?.id || ''),
    visit_at:          localDatetimeNow(),
    // Chamber/ambient (auto-GPP)
    ambient_temp_f:    '',
    ambient_rh:        '',
    // Outside
    outside_at:        localDatetimeNow(),
    outside_temp_f:    '',
    outside_rh:        '',
    weather_conditions:'',
    // Unaffected
    unaffected_at:     localDatetimeNow(),
    unaffected_temp_f: '',
    unaffected_rh:     '',
    // Other
    hours_running:     '',
    notes:             '',
  }))
  // Per-dehu OUT readings: { [asset_label]: { reading_at, exhaust_temp_f, exhaust_rh } }
  const [dehuRows, setDehuRows] = useState(() => {
    const init = {}
    for (const d of (jobDehus || [])) {
      init[d.asset_label] = { reading_at: localDatetimeNow(), exhaust_temp_f: '', exhaust_rh: '' }
    }
    return init
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Auto-computed GPP values (live)
  const ambientGpp    = useMemo(() => gppFromTempRh(form.ambient_temp_f, form.ambient_rh), [form.ambient_temp_f, form.ambient_rh])
  const outsideGpp    = useMemo(() => gppFromTempRh(form.outside_temp_f, form.outside_rh), [form.outside_temp_f, form.outside_rh])
  const unaffectedGpp = useMemo(() => gppFromTempRh(form.unaffected_temp_f, form.unaffected_rh), [form.unaffected_temp_f, form.unaffected_rh])

  function setDehuField(label, key, val) {
    setDehuRows((d) => ({ ...d, [label]: { ...d[label], [key]: val } }))
  }

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
        ambient_temp_f:    numOrNull(form.ambient_temp_f),
        ambient_rh:        numOrNull(form.ambient_rh),
        ambient_gpp:       ambientGpp,
        outside_temp_f:    numOrNull(form.outside_temp_f),
        outside_rh:        numOrNull(form.outside_rh),
        outside_gpp:       outsideGpp,
        weather_conditions: form.weather_conditions || null,
        unaffected_temp_f: numOrNull(form.unaffected_temp_f),
        unaffected_rh:     numOrNull(form.unaffected_rh),
        unaffected_gpp:    unaffectedGpp,
        hours_running:     numOrNull(form.hours_running),
        notes: form.notes || null,
        created_by: profile.id,
      }
      const { data: visitRow, error: err } = await supabase
        .from('monitoring_visits')
        .insert(payload)
        .select('*')
        .single()
      if (err) throw err

      // Insert per-dehu OUT readings (only those with temp or RH entered)
      const dehuPayload = []
      for (const [label, row] of Object.entries(dehuRows)) {
        const temp = numOrNull(row.exhaust_temp_f)
        const rh   = numOrNull(row.exhaust_rh)
        if (temp == null && rh == null) continue
        dehuPayload.push({
          tenant_id: tenantId,
          job_id: jobId,
          visit_id: visitRow.id,
          dehu_asset_label: label,
          reading_at: new Date(row.reading_at || form.visit_at).toISOString(),
          exhaust_temp_f: temp,
          exhaust_rh: rh,
          exhaust_gpp: gppFromTempRh(temp, rh),
          created_by: profile.id,
        })
      }
      if (dehuPayload.length > 0) {
        const { error: dehuErr } = await supabase.from('monitoring_dehu_readings').insert(dehuPayload)
        if (dehuErr) throw dehuErr
      }

      onSaved(visitRow)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Log monitoring visit</CardTitle>
      </CardHeader>
      <CardBody className="space-y-4">
        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-danger rounded p-2 text-sm">
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

        {/* CHAMBER AMBIENT — auto GPP */}
        <div className="border-t border-ink-200 pt-3">
          <p className="text-sm font-semibold text-ink-700 mb-3">Chamber ambient</p>
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
            <ReadOnlyGpp label="Grains per pound" value={ambientGpp} hint="Auto from temp + RH" />
          </div>
        </div>

        {/* OUTSIDE */}
        <div className="border-t border-ink-200 pt-3">
          <p className="text-sm font-semibold text-ink-700 mb-3">Outside</p>
          <div className="grid sm:grid-cols-2 gap-3 mb-3">
            <Input
              label="Reading time"
              type="datetime-local"
              value={form.outside_at}
              onChange={(e) => setForm((f) => ({ ...f, outside_at: e.target.value }))}
            />
            <Input
              label="Weather conditions"
              type="text"
              placeholder="e.g. Sunny, 65°F, calm"
              value={form.weather_conditions}
              onChange={(e) => setForm((f) => ({ ...f, weather_conditions: e.target.value }))}
            />
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <Input
              label="Temperature"
              type="number"
              step="0.1"
              inputMode="decimal"
              value={form.outside_temp_f}
              onChange={(e) => setForm((f) => ({ ...f, outside_temp_f: e.target.value }))}
              hint="°F"
            />
            <Input
              label="Relative humidity"
              type="number"
              step="0.1"
              inputMode="decimal"
              value={form.outside_rh}
              onChange={(e) => setForm((f) => ({ ...f, outside_rh: e.target.value }))}
              hint="% RH"
            />
            <ReadOnlyGpp label="Grains per pound" value={outsideGpp} hint="Auto from temp + RH" />
          </div>
        </div>

        {/* UNAFFECTED */}
        <div className="border-t border-ink-200 pt-3">
          <p className="text-sm font-semibold text-ink-700 mb-3">Unaffected area</p>
          <div className="grid sm:grid-cols-2 gap-3 mb-3">
            <Input
              label="Reading time"
              type="datetime-local"
              value={form.unaffected_at}
              onChange={(e) => setForm((f) => ({ ...f, unaffected_at: e.target.value }))}
            />
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <Input
              label="Temperature"
              type="number"
              step="0.1"
              inputMode="decimal"
              value={form.unaffected_temp_f}
              onChange={(e) => setForm((f) => ({ ...f, unaffected_temp_f: e.target.value }))}
              hint="°F"
            />
            <Input
              label="Relative humidity"
              type="number"
              step="0.1"
              inputMode="decimal"
              value={form.unaffected_rh}
              onChange={(e) => setForm((f) => ({ ...f, unaffected_rh: e.target.value }))}
              hint="% RH"
            />
            <ReadOnlyGpp label="Grains per pound" value={unaffectedGpp} hint="Auto from temp + RH" />
          </div>
        </div>

        {/* PER-DEHU OUT READINGS */}
        {jobDehus && jobDehus.length > 0 && (
          <div className="border-t border-ink-200 pt-3">
            <p className="text-sm font-semibold text-ink-700 mb-1">Dehumidifier exhaust (OUT)</p>
            <p className="text-xs text-ink-500 mb-3">One reading per dehu. Leave fields empty to skip.</p>
            <div className="space-y-4">
              {jobDehus.map((d) => (
                <DehuRow
                  key={d.asset_label}
                  label={d.asset_label}
                  equipmentType={d.equipment_type}
                  row={dehuRows[d.asset_label] || { reading_at: form.visit_at, exhaust_temp_f: '', exhaust_rh: '' }}
                  onChange={(k, v) => setDehuField(d.asset_label, k, v)}
                />
              ))}
            </div>
          </div>
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

function ReadOnlyGpp({ label, value, hint }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-ink-700 mb-1">{label}</label>
      <div className="w-full px-2 py-1.5 border border-ink-200 rounded bg-ink-50 text-sm text-ink-900 min-h-[34px] flex items-center">
        {value != null ? value : <span className="text-ink-400 italic">—</span>}
      </div>
      {hint && <p className="text-xs text-ink-500 mt-1">{hint}</p>}
    </div>
  )
}

function DehuRow({ label, equipmentType, row, onChange }) {
  const gpp = useMemo(() => gppFromTempRh(row.exhaust_temp_f, row.exhaust_rh), [row.exhaust_temp_f, row.exhaust_rh])
  return (
    <div className="bg-ink-50/50 border border-ink-200 rounded p-3">
      <p className="text-sm font-semibold text-ink-900 mb-2">{label}{equipmentType ? <span className="text-xs text-ink-500 font-normal ml-2">{equipmentType}</span> : null}</p>
      <div className="grid sm:grid-cols-2 gap-3 mb-3">
        <Input
          label="Reading time"
          type="datetime-local"
          value={row.reading_at}
          onChange={(e) => onChange('reading_at', e.target.value)}
        />
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        <Input
          label="Exhaust temp"
          type="number"
          step="0.1"
          inputMode="decimal"
          value={row.exhaust_temp_f}
          onChange={(e) => onChange('exhaust_temp_f', e.target.value)}
          hint="°F"
        />
        <Input
          label="Exhaust RH"
          type="number"
          step="0.1"
          inputMode="decimal"
          value={row.exhaust_rh}
          onChange={(e) => onChange('exhaust_rh', e.target.value)}
          hint="% RH"
        />
        <ReadOnlyGpp label="Exhaust GPP" value={gpp} hint="Auto" />
      </div>
    </div>
  )
}

// ===========================================================================
// ===========================================================================
// Chamber history card
// ===========================================================================

function ChamberHistoryCard({ chamber, visits, dehuReadings = [], onAddVisit }) {
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

  // Group dehu readings by visit_id for inline display
  const dehuByVisit = useMemo(() => {
    const m = new Map()
    for (const r of dehuReadings) {
      if (!m.has(r.visit_id)) m.set(r.visit_id, [])
      m.get(r.visit_id).push(r)
    }
    return m
  }, [dehuReadings])

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
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="text-left text-xs text-ink-500 uppercase tracking-wide border-b border-ink-200">
                <th className="py-1.5 pr-3 font-semibold">When</th>
                <th className="py-1.5 pr-3 font-semibold">Chamber<br/>T / RH / GPP</th>
                <th className="py-1.5 pr-3 font-semibold">Outside<br/>T / RH / GPP</th>
                <th className="py-1.5 pr-3 font-semibold">Unaffected<br/>T / RH / GPP</th>
                <th className="py-1.5 pr-3 font-semibold">Dehu OUT<br/>(per dehu)</th>
                <th className="py-1.5 pr-3 font-semibold">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {visits.map((v) => {
                const dehus = dehuByVisit.get(v.id) || []
                return (
                  <tr key={v.id}>
                    <td className="py-1.5 pr-3 font-mono text-xs align-top">{formatDateShort(v.visit_at)}</td>
                    <td className="py-1.5 pr-3 align-top">{tripletCell(v.ambient_temp_f, v.ambient_rh, v.ambient_gpp)}</td>
                    <td className="py-1.5 pr-3 align-top">
                      {tripletCell(v.outside_temp_f, v.outside_rh, v.outside_gpp)}
                      {v.weather_conditions && <div className="text-[10px] text-ink-500 mt-0.5 italic">{v.weather_conditions}</div>}
                    </td>
                    <td className="py-1.5 pr-3 align-top">{tripletCell(v.unaffected_temp_f, v.unaffected_rh, v.unaffected_gpp)}</td>
                    <td className="py-1.5 pr-3 align-top text-xs">
                      {dehus.length === 0 ? <span className="text-ink-400">—</span> : (
                        <div className="space-y-1">
                          {dehus.map((r) => (
                            <div key={r.id}>
                              <span className="font-semibold">{r.dehu_asset_label}:</span>{' '}
                              {r.exhaust_temp_f != null && `${r.exhaust_temp_f}°F`}
                              {r.exhaust_rh != null && ` / ${r.exhaust_rh}%`}
                              {r.exhaust_gpp != null && ` / ${r.exhaust_gpp} gpp`}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-1.5 pr-3 text-xs text-ink-600 truncate max-w-[180px] align-top">{v.notes || ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  )
}

function tripletCell(t, rh, gpp) {
  const parts = []
  if (t != null) parts.push(`${t}°F`)
  if (rh != null) parts.push(`${rh}%`)
  if (gpp != null) parts.push(`${gpp} gpp`)
  if (parts.length === 0) return <span className="text-ink-400">—</span>
  return <div className="text-xs">{parts.join(' / ')}</div>
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
