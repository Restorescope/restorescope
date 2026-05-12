import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth.jsx'
import {
  Header, BottomNav, Section, Button, Card, CardHeader, CardBody, CardTitle,
  Input, Select, Textarea, Badge, EmptyState,
} from '../../ui'

/**
 * ScreeningSamples — log samples taken during the screening and track them
 * through to lab results.
 *
 * Sample lifecycle:
 *   pending  — sample drafted/collected but not yet sent
 *   sent     — handed off to lab / shipped
 *   received — lab returned results
 *   reviewed — handler reviewed and the results are ready for the report
 *
 * Sample types: air, surface_tape, surface_swab, bulk, wall_cavity_air, outdoor_control
 *
 * Samples can be linked back to a specific alert (alert_id) so the report can
 * pair them with their alert in the findings table.
 */
export default function ScreeningSamples() {
  const { id: jobId } = useParams()
  const { profile } = useAuth()

  const [job, setJob] = useState(null)
  const [inspection, setInspection] = useState(null)
  const [samples, setSamples] = useState([])
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true); setError(null)
      const [jobRes, inspRes] = await Promise.all([
        supabase.from('jobs').select('id, job_number, customer').eq('id', jobId).maybeSingle(),
        supabase.from('screening_inspections').select('id').eq('job_id', jobId).maybeSingle(),
      ])
      if (cancelled) return
      if (jobRes.error || !jobRes.data) { setError(jobRes.error?.message || 'Job not found'); setLoading(false); return }
      setJob(jobRes.data)

      if (!inspRes.data) {
        setError('No screening inspection started. Go to the Screening dashboard and start one first.')
        setLoading(false); return
      }
      setInspection(inspRes.data)

      const [sampleRes, alertRes] = await Promise.all([
        supabase.from('screening_samples')
          .select('*')
          .eq('inspection_id', inspRes.data.id)
          .order('display_order', { nullsFirst: false })
          .order('created_at'),
        supabase.from('screening_alerts')
          .select('id, room_name, alert_location, alert_strength')
          .eq('inspection_id', inspRes.data.id),
      ])
      if (cancelled) return
      setSamples(sampleRes.data || [])
      setAlerts(alertRes.data || [])
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [jobId])

  async function addSample(form) {
    if (!form.sample_type || !form.location_label?.trim()) {
      setError('Sample type and location are required.')
      return
    }
    setError(null)
    try {
      const payload = {
        tenant_id: profile.tenant_id,
        inspection_id: inspection.id,
        job_id: jobId,
        alert_id: form.alert_id || null,
        sample_id_label: form.sample_id_label?.trim() || autoSampleLabel(samples.length, form.sample_type),
        sample_type: form.sample_type,
        location_label: form.location_label.trim(),
        collected_at: form.collected_at || new Date().toISOString(),
        lab_name: form.lab_name?.trim() || null,
        chain_of_custody_no: form.chain_of_custody_no?.trim() || null,
        shipped_at: form.shipped_at || null,
        status: form.status || 'pending',
        result_summary: form.result_summary?.trim() || null,
        result_notes: form.result_notes?.trim() || null,
        result_received_at: form.result_received_at || null,
        notes: form.notes?.trim() || null,
        display_order: samples.length,
      }
      const { data, error: err } = await supabase
        .from('screening_samples')
        .insert(payload)
        .select('*')
        .single()
      if (err) throw err
      setSamples((arr) => [...arr, data])
      setShowAddForm(false)
    } catch (e) {
      setError(e.message)
    }
  }

  async function updateSample(id, patch) {
    setError(null)
    try {
      const { error: err } = await supabase
        .from('screening_samples')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (err) throw err
      setSamples((arr) => arr.map((s) => s.id === id ? { ...s, ...patch } : s))
    } catch (e) {
      setError(e.message)
    }
  }

  async function removeSample(id) {
    if (!confirm('Remove this sample?')) return
    setError(null)
    try {
      const { error: err } = await supabase.from('screening_samples').delete().eq('id', id)
      if (err) throw err
      setSamples((arr) => arr.filter((s) => s.id !== id))
      if (editingId === id) setEditingId(null)
    } catch (e) {
      setError(e.message)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-ink-50">
        <Header breadcrumb={[
          { label: 'Jobs', to: '/jobs' },
          { label: 'Job', to: `/jobs/${jobId}` },
          { label: 'Screening', to: `/jobs/${jobId}/screening` },
          { label: 'Sampling' },
        ]} />
        <main className="max-w-4xl mx-auto p-4 sm:p-6 text-ink-500">Loading…</main>
      </div>
    )
  }

  if (error && !inspection) {
    return (
      <div className="min-h-screen bg-ink-50">
        <Header breadcrumb={[{ label: 'Jobs', to: '/jobs' }, { label: 'Sampling' }]} />
        <main className="max-w-4xl mx-auto p-4 sm:p-6 space-y-3">
          <div role="alert" className="bg-red-50 border border-red-200 text-danger rounded p-3 text-sm">{error}</div>
          <Link to={`/jobs/${jobId}/screening`}>
            <Button variant="secondary">← Back to Screening</Button>
          </Link>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-ink-50">
      <Header breadcrumb={[
        { label: 'Jobs', to: '/jobs' },
        { label: job?.job_number || 'Job', to: `/jobs/${jobId}` },
        { label: 'Screening', to: `/jobs/${jobId}/screening` },
        { label: 'Sampling' },
      ]} />

      <main className="max-w-4xl mx-auto p-4 sm:p-6 pb-24 space-y-4">
        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-danger rounded p-3 text-sm">
            {error}
          </div>
        )}

        <Section
          title="Lab samples"
          description="Log samples collected during the screening. Update status as they move through the lab."
          action={(
            <Button onClick={() => { setShowAddForm(true); setEditingId(null) }} variant="accent">
              + Add sample
            </Button>
          )}
        >
          {showAddForm && (
            <SampleForm
              alerts={alerts}
              onSave={addSample}
              onCancel={() => setShowAddForm(false)}
            />
          )}

          {samples.length === 0 && !showAddForm ? (
            <EmptyState
              title="No samples yet"
              body="Sampling is optional. If you collected lab samples during the screening, log them here so the lab results carry through to the final report."
            />
          ) : (
            <ul className="space-y-3 mt-3">
              {samples.map((sample) => (
                <SampleCard
                  key={sample.id}
                  sample={sample}
                  alerts={alerts}
                  isEditing={editingId === sample.id}
                  onStartEdit={() => setEditingId(sample.id)}
                  onCancelEdit={() => setEditingId(null)}
                  onSave={(patch) => { updateSample(sample.id, patch); setEditingId(null) }}
                  onRemove={() => removeSample(sample.id)}
                />
              ))}
            </ul>
          )}
        </Section>

        <div className="flex justify-between flex-wrap gap-2">
          <Link to={`/jobs/${jobId}/screening`}>
            <Button variant="secondary">← Back to Screening</Button>
          </Link>
          <Link to={`/jobs/${jobId}/screening/recommendations`}>
            <Button>Continue to Recommendations →</Button>
          </Link>
        </div>
      </main>

      <BottomNav jobId={jobId} />
    </div>
  )
}

// ============================================================================
// SampleCard — display + inline edit
// ============================================================================
function SampleCard({ sample, alerts, isEditing, onStartEdit, onCancelEdit, onSave, onRemove }) {
  if (isEditing) {
    return (
      <li>
        <SampleForm initial={sample} alerts={alerts} onSave={onSave} onCancel={onCancelEdit} existing />
      </li>
    )
  }

  const statusTone = {
    pending:  'neutral',
    sent:     'blue',
    received: 'amber',
    reviewed: 'green',
  }[sample.status] || 'neutral'

  return (
    <li className="bg-white border border-ink-200 rounded-md p-3">
      <div className="flex items-start justify-between gap-2 flex-wrap mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-condensed font-bold text-brand-blue tracking-wide">
              {sample.sample_id_label || 'Unlabeled sample'}
            </span>
            <Badge tone="blue">{labelType(sample.sample_type)}</Badge>
            <Badge tone={statusTone}>{labelStatus(sample.status)}</Badge>
          </div>
          <p className="text-sm text-ink-700 mt-1">{sample.location_label}</p>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={onStartEdit}>Edit</Button>
          <Button size="sm" variant="ghost" onClick={onRemove}>Remove</Button>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-2 text-xs text-ink-600">
        {sample.lab_name && <KV label="Lab">{sample.lab_name}</KV>}
        {sample.chain_of_custody_no && <KV label="COC #">{sample.chain_of_custody_no}</KV>}
        {sample.collected_at && <KV label="Collected">{formatDate(sample.collected_at)}</KV>}
        {sample.shipped_at && <KV label="Shipped">{formatDate(sample.shipped_at)}</KV>}
        {sample.result_received_at && <KV label="Results received">{formatDate(sample.result_received_at)}</KV>}
      </div>

      {sample.result_summary && (
        <div className="mt-2 border-t border-ink-100 pt-2">
          <p className="text-xs uppercase font-semibold text-ink-700">Result summary</p>
          <p className="text-sm text-ink-800 mt-0.5">{sample.result_summary}</p>
        </div>
      )}

      {sample.result_notes && (
        <p className="text-xs text-ink-600 italic mt-2">{sample.result_notes}</p>
      )}
    </li>
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

// ============================================================================
// SampleForm — add or edit
// ============================================================================
function SampleForm({ initial, alerts, onSave, onCancel, existing = false }) {
  const [form, setForm] = useState(() => ({
    sample_id_label: initial?.sample_id_label || '',
    sample_type: initial?.sample_type || '',
    location_label: initial?.location_label || '',
    alert_id: initial?.alert_id || '',
    collected_at: initial?.collected_at ? toLocalInput(initial.collected_at) : toLocalInput(new Date()),
    lab_name: initial?.lab_name || '',
    chain_of_custody_no: initial?.chain_of_custody_no || '',
    shipped_at: initial?.shipped_at ? toLocalInput(initial.shipped_at) : '',
    status: initial?.status || 'pending',
    result_summary: initial?.result_summary || '',
    result_notes: initial?.result_notes || '',
    result_received_at: initial?.result_received_at ? toLocalInput(initial.result_received_at) : '',
    notes: initial?.notes || '',
  }))

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })) }

  function save() {
    const out = { ...form }
    // Convert local input back to ISO
    for (const k of ['collected_at', 'shipped_at', 'result_received_at']) {
      out[k] = form[k] ? new Date(form[k]).toISOString() : null
    }
    onSave?.(out)
  }

  return (
    <Card accent="blue">
      <CardHeader>
        <CardTitle>{existing ? 'Edit sample' : 'New sample'}</CardTitle>
      </CardHeader>
      <CardBody className="space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <Input
            label="Sample label"
            placeholder="e.g. S-01 or AIR-MASTERBR"
            value={form.sample_id_label}
            onChange={(e) => set('sample_id_label', e.target.value)}
            hint="Auto-generated if blank"
          />
          <Select
            label="Sample type"
            required
            value={form.sample_type}
            onChange={(e) => set('sample_type', e.target.value)}
            placeholder="Pick a type…"
            options={[
              { key: 'air',             label: 'Air sample (indoor)' },
              { key: 'surface_tape',    label: 'Surface — tape lift' },
              { key: 'surface_swab',    label: 'Surface — swab' },
              { key: 'bulk',            label: 'Bulk material' },
              { key: 'wall_cavity_air', label: 'Wall cavity air' },
              { key: 'outdoor_control', label: 'Outdoor control' },
            ]}
          />
        </div>

        <Textarea
          label="Location"
          required
          rows={2}
          placeholder="e.g. Master closet, NE corner, 4ft up"
          value={form.location_label}
          onChange={(e) => set('location_label', e.target.value)}
        />

        {alerts.length > 0 && (
          <Select
            label="Linked alert (optional)"
            value={form.alert_id}
            onChange={(e) => set('alert_id', e.target.value)}
            placeholder="Not linked to a specific alert"
            options={alerts.map((a) => ({
              key: a.id,
              label: `${a.room_name || 'Unknown room'} — ${a.alert_location?.slice(0, 60) || a.alert_strength || 'alert'}`,
            }))}
          />
        )}

        <div className="grid sm:grid-cols-2 gap-3">
          <Input
            label="Collected at"
            type="datetime-local"
            value={form.collected_at}
            onChange={(e) => set('collected_at', e.target.value)}
          />
          <Input
            label="Shipped to lab at"
            type="datetime-local"
            value={form.shipped_at}
            onChange={(e) => set('shipped_at', e.target.value)}
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <Input
            label="Lab name"
            placeholder="e.g. EMSL Analytical"
            value={form.lab_name}
            onChange={(e) => set('lab_name', e.target.value)}
          />
          <Input
            label="Chain of custody #"
            value={form.chain_of_custody_no}
            onChange={(e) => set('chain_of_custody_no', e.target.value)}
          />
        </div>

        <Select
          label="Status"
          value={form.status}
          onChange={(e) => set('status', e.target.value)}
          options={[
            { key: 'pending',  label: 'Pending (collected, not yet sent)' },
            { key: 'sent',     label: 'Sent to lab' },
            { key: 'received', label: 'Results received' },
            { key: 'reviewed', label: 'Reviewed (ready for report)' },
          ]}
        />

        {(form.status === 'received' || form.status === 'reviewed') && (
          <>
            <Input
              label="Result summary"
              placeholder="e.g. Elevated Penicillium/Aspergillus, 3,400 spores/m³"
              value={form.result_summary}
              onChange={(e) => set('result_summary', e.target.value)}
            />
            <Textarea
              label="Result detail / interpretation"
              rows={3}
              placeholder="Full interpretation as it should appear in the report"
              value={form.result_notes}
              onChange={(e) => set('result_notes', e.target.value)}
            />
            <Input
              label="Results received at"
              type="datetime-local"
              value={form.result_received_at}
              onChange={(e) => set('result_received_at', e.target.value)}
            />
          </>
        )}

        <Textarea
          label="Internal notes (not in report)"
          rows={2}
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
        />

        <div className="flex gap-2">
          <Button onClick={save}>{existing ? 'Save changes' : 'Add sample'}</Button>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
      </CardBody>
    </Card>
  )
}

// ============================================================================
// Helpers
// ============================================================================
function labelType(t) {
  return {
    air:             'Air',
    surface_tape:    'Tape lift',
    surface_swab:    'Swab',
    bulk:            'Bulk',
    wall_cavity_air: 'Wall cavity',
    outdoor_control: 'Outdoor control',
  }[t] || t || 'Sample'
}

function labelStatus(s) {
  return {
    pending:  'Pending',
    sent:     'Sent to lab',
    received: 'Results received',
    reviewed: 'Reviewed',
  }[s] || s
}

function autoSampleLabel(idx, type) {
  const prefix = ({
    air: 'AIR', surface_tape: 'TAPE', surface_swab: 'SWAB',
    bulk: 'BULK', wall_cavity_air: 'WC', outdoor_control: 'OUT',
  }[type]) || 'S'
  return `${prefix}-${String(idx + 1).padStart(2, '0')}`
}

function toLocalInput(iso) {
  if (!iso) return ''
  const d = iso instanceof Date ? iso : new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
