import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth.jsx'
import {
  Header, BottomNav, Section, Card, CardHeader, CardBody, CardTitle, Button, Input, Textarea,
} from '../../ui'

/**
 * Property History — captures structured info about the property before
 * Spore walks it. Helps the handler know what to expect AND feeds AI
 * screening recommendations with context.
 *
 * Route: /jobs/:id/screening/property-history
 *
 * Each category is a yes/no toggle + a notes field. Plus year_built,
 * construction_type, and a catch-all "other_notes".
 */

const HISTORY_CATEGORIES = [
  { key: 'prior_water_damage',  label: 'Prior water damage or leaks',     hint: 'Past loss events, recurring leaks, slow drips' },
  { key: 'exterior_issues',     label: 'Exterior issues',                  hint: 'Damaged siding, cracks, failed caulking' },
  { key: 'roofing_issues',      label: 'Roofing issues',                   hint: 'Age of roof, missing shingles, prior leaks' },
  { key: 'grade_problems',      label: 'Grade / drainage problems',        hint: 'Negative slope toward foundation, pooling water' },
  { key: 'foundation_issues',   label: 'Foundation issues',                hint: 'Cracks, settlement, water intrusion at slab' },
  { key: 'hvac_issues',         label: 'HVAC issues',                      hint: 'Old system, neglected ducts, condensation problems' },
  { key: 'plumbing_issues',     label: 'Plumbing issues',                  hint: 'Old pipes, prior burst, slow drains' },
  { key: 'ventilation_issues', label: 'Ventilation issues',                hint: 'Inadequate bath/kitchen exhaust, no attic ventilation' },
  { key: 'previous_remediation', label: 'Previous mold remediation',       hint: 'Prior remediation work, by whom, date if known' },
]

function emptyHistory() {
  const obj = {
    year_built: '',
    construction_type: '',
    other_notes: '',
  }
  for (const c of HISTORY_CATEGORIES) {
    obj[c.key] = false
    obj[`${c.key}_notes`] = ''
  }
  return obj
}

export default function PropertyHistoryScreen() {
  const { id: jobId } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [inspection, setInspection] = useState(null)
  const [form, setForm] = useState(emptyHistory())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true); setError(null)
      const { data: insp, error: err } = await supabase
        .from('screening_inspections')
        .select('id, property_history')
        .eq('job_id', jobId)
        .maybeSingle()
      if (cancelled) return
      if (err) { setError(err.message); setLoading(false); return }

      if (!insp) {
        // No screening inspection yet — create one on first save
        setInspection(null)
        setForm(emptyHistory())
      } else {
        setInspection(insp)
        setForm({ ...emptyHistory(), ...(insp.property_history || {}) })
      }
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [jobId])

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function save() {
    setSaving(true); setError(null); setSuccess(null)
    try {
      if (inspection) {
        const { error: updErr } = await supabase
          .from('screening_inspections')
          .update({ property_history: form })
          .eq('id', inspection.id)
        if (updErr) throw updErr
      } else {
        // Create a minimal screening_inspections row with just history
        const { data, error: insErr } = await supabase
          .from('screening_inspections')
          .insert({
            tenant_id: profile.tenant_id,
            job_id: jobId,
            property_history: form,
            created_by: profile.id,
          })
          .select('id, property_history')
          .single()
        if (insErr) throw insErr
        setInspection(data)
      }
      setSuccess('Property history saved.')
      setTimeout(() => setSuccess(null), 3000)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-ink-50">
        <Header breadcrumb={[
          { label: 'Jobs', to: '/jobs' },
          { label: 'Screening', to: `/jobs/${jobId}/screening` },
          { label: 'Property History' },
        ]} />
        <main className="max-w-3xl mx-auto p-4 sm:p-6 text-ink-500">Loading…</main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-ink-50">
      <Header breadcrumb={[
        { label: 'Jobs', to: '/jobs' },
        { label: 'Screening', to: `/jobs/${jobId}/screening` },
        { label: 'Property History' },
      ]} />
      <main className="max-w-3xl mx-auto p-4 sm:p-6 pb-24 space-y-4">

        <Section
          title="Property history"
          description="Context about the property — prior damage, structural issues, system concerns. Used by Spore's handler to know what to expect, included in the screening report, and fed to AI recommendations for smarter suggestions."
        />

        {/* Building info */}
        <Card>
          <CardHeader><CardTitle>Building info</CardTitle></CardHeader>
          <CardBody className="space-y-3">
            <Input
              label="Year built (approx)"
              value={form.year_built}
              onChange={(e) => update('year_built', e.target.value)}
              placeholder="e.g. 1985, or 'approx 1990s'"
              hint="Free text — approximations are fine"
            />
            <Input
              label="Construction type"
              value={form.construction_type}
              onChange={(e) => update('construction_type', e.target.value)}
              placeholder="e.g. wood frame, block, slab on grade"
            />
          </CardBody>
        </Card>

        {/* Categories */}
        <Card>
          <CardHeader>
            <CardTitle>History & known issues</CardTitle>
            <p className="text-xs text-ink-500 mt-1">Toggle each that applies. Add notes for specifics.</p>
          </CardHeader>
          <CardBody className="space-y-3">
            {HISTORY_CATEGORIES.map((c) => (
              <HistoryRow
                key={c.key}
                label={c.label}
                hint={c.hint}
                checked={!!form[c.key]}
                onCheck={(v) => update(c.key, v)}
                notes={form[`${c.key}_notes`] || ''}
                onNotesChange={(v) => update(`${c.key}_notes`, v)}
              />
            ))}
          </CardBody>
        </Card>

        {/* Other */}
        <Card>
          <CardHeader><CardTitle>Other observations</CardTitle></CardHeader>
          <CardBody>
            <Textarea
              label="Anything else worth noting"
              value={form.other_notes}
              onChange={(e) => update('other_notes', e.target.value)}
              rows={3}
              placeholder="Anything that doesn't fit the categories above. Recent renovations, occupant concerns, pets, etc."
            />
          </CardBody>
        </Card>

        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-danger rounded p-3 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div role="status" className="bg-green-50 border border-green-200 text-green-800 rounded p-3 text-sm">
            ✓ {success}
          </div>
        )}

        <div className="sticky bottom-0 bg-ink-50 py-3 -mx-4 sm:mx-0 px-4 sm:px-0 border-t sm:border-0 border-ink-200 flex gap-2 justify-end">
          <Button variant="ghost" onClick={() => navigate(`/jobs/${jobId}/screening`)}>
            Back to screening
          </Button>
          <Button onClick={save} loading={saving} size="lg">Save history</Button>
        </div>
      </main>

      <BottomNav jobId={jobId} />
    </div>
  )
}

function HistoryRow({ label, hint, checked, onCheck, notes, onNotesChange }) {
  return (
    <div className="border border-ink-200 rounded p-3 space-y-2">
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onCheck(e.target.checked)}
          className="mt-1"
        />
        <div className="flex-1">
          <div className="text-sm font-semibold text-ink-900">{label}</div>
          <p className="text-xs text-ink-500 mt-0.5">{hint}</p>
        </div>
      </label>
      {checked && (
        <Textarea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          rows={2}
          placeholder="Add details (optional but helpful)"
          className="mt-2"
        />
      )}
    </div>
  )
}
