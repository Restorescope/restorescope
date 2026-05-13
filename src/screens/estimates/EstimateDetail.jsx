import { useEffect, useState, useMemo, useCallback } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth.jsx'
import {
  Header, BottomNav, Button, Card, CardHeader, CardBody, CardTitle,
  Input, Select, Textarea, Badge, EmptyState,
} from '../../ui'

/**
 * EstimateDetail — three-tab editor for one NTE estimate.
 *
 * Tab 1: Job Info — auto-filled from the job, editable per-estimate
 * Tab 2: Build Estimate — searchable catalog left, line items right
 * Tab 3: Review — totals card, status, generate PDF
 *
 * Math:
 *   markup       = subtotal × markup%
 *   contingency  = (subtotal + markup) × contingency%
 *   taxable      = subtotal + markup + contingency
 *   tax          = taxable × tax%
 *   total        = taxable + tax
 *
 * Auto-saves every change. Line edits debounced via "blur" pattern; totals
 * recompute live from React state.
 */
export default function EstimateDetail() {
  const { id: jobId, estimateId } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()

  const canEdit = profile?.role === 'owner' || profile?.role === 'pm'

  const [tab, setTab] = useState('info')
  const [job, setJob] = useState(null)
  const [estimate, setEstimate] = useState(null)
  const [lines, setLines] = useState([])
  const [catalog, setCatalog] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [sectionFilter, setSectionFilter] = useState('all')

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const [jobRes, estRes, lineRes, catRes] = await Promise.all([
      supabase.from('jobs')
        .select('id, job_number, customer, loss_info')
        .eq('id', jobId).maybeSingle(),
      supabase.from('estimates').select('*').eq('id', estimateId).maybeSingle(),
      supabase.from('estimate_lines').select('*').eq('estimate_id', estimateId).order('display_order', { nullsFirst: false }).order('created_at'),
      supabase.from('rate_catalog').select('*').eq('active', true).order('display_order', { nullsFirst: false }).order('section').order('category').order('name'),
    ])
    if (jobRes.error || !jobRes.data) { setError(jobRes.error?.message || 'Job not found'); setLoading(false); return }
    if (estRes.error || !estRes.data) { setError(estRes.error?.message || 'Estimate not found'); setLoading(false); return }
    setJob(jobRes.data)
    setEstimate(estRes.data)
    setLines(lineRes.data || [])
    setCatalog(catRes.data || [])
    setLoading(false)
  }, [jobId, estimateId])

  useEffect(() => { load() }, [load])

  // ============ Live totals from current line state ============
  const totals = useMemo(() => {
    const sub = lines.reduce((s, l) => s + Number(l.line_subtotal || 0), 0)
    const markupPct = Number(estimate?.markup_pct || 0)
    const contPct = Number(estimate?.contingency_pct || 0)
    const taxPct = Number(estimate?.tax_pct || 0)
    const markup = sub * (markupPct / 100)
    const cont = (sub + markup) * (contPct / 100)
    const taxable = sub + markup + cont
    const tax = taxable * (taxPct / 100)
    const total = taxable + tax
    return { sub, markup, cont, tax, total }
  }, [lines, estimate?.markup_pct, estimate?.contingency_pct, estimate?.tax_pct])

  // Persist totals back to the estimate row whenever they change
  useEffect(() => {
    if (!estimate || loading) return
    const subChanged = Number(estimate.subtotal || 0) !== Number(totals.sub.toFixed(2))
    const totalChanged = Number(estimate.total || 0) !== Number(totals.total.toFixed(2))
    if (!subChanged && !totalChanged) return
    // Persist totals — fire and forget
    supabase.from('estimates').update({
      subtotal: Number(totals.sub.toFixed(2)),
      markup_amt: Number(totals.markup.toFixed(2)),
      contingency_amt: Number(totals.cont.toFixed(2)),
      tax_amt: Number(totals.tax.toFixed(2)),
      total: Number(totals.total.toFixed(2)),
      updated_at: new Date().toISOString(),
    }).eq('id', estimateId).then(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totals, estimateId])

  // ============ Field updates on the estimate row ============
  async function updateEstimate(patch) {
    if (!canEdit) return
    setSaving(true)
    const { error: err } = await supabase
      .from('estimates')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', estimateId)
    setSaving(false)
    if (err) { setError(err.message); return }
    setEstimate((e) => ({ ...e, ...patch }))
  }

  // ============ Line operations ============
  async function addLine(catalogItem) {
    if (!canEdit) return
    const newLine = {
      tenant_id: profile.tenant_id,
      estimate_id: estimateId,
      catalog_id: catalogItem.id,
      section: catalogItem.section,
      category: catalogItem.category,
      name: catalogItem.name,
      unit: catalogItem.unit,
      rate: catalogItem.rate,
      qty: 1,
      days: 1,
      line_subtotal: Number(catalogItem.rate),
      display_order: lines.length,
    }
    const { data, error: err } = await supabase
      .from('estimate_lines')
      .insert(newLine)
      .select('*')
      .single()
    if (err) { setError(err.message); return }
    setLines((l) => [...l, data])
  }

  async function updateLine(lineId, patch) {
    if (!canEdit) return
    setLines((arr) => arr.map((l) => {
      if (l.id !== lineId) return l
      const next = { ...l, ...patch }
      next.line_subtotal = computeLineSubtotal(next)
      return next
    }))
    // Persist to DB
    const updated = lines.find((l) => l.id === lineId)
    if (!updated) return
    const merged = { ...updated, ...patch }
    merged.line_subtotal = computeLineSubtotal(merged)
    const { error: err } = await supabase
      .from('estimate_lines')
      .update({
        qty: merged.qty,
        days: merged.days,
        rate: merged.rate,
        notes: merged.notes,
        line_subtotal: merged.line_subtotal,
      })
      .eq('id', lineId)
    if (err) setError(err.message)
  }

  async function removeLine(lineId) {
    if (!canEdit) return
    if (!confirm('Remove this line item from the estimate?')) return
    const { error: err } = await supabase.from('estimate_lines').delete().eq('id', lineId)
    if (err) { setError(err.message); return }
    setLines((arr) => arr.filter((l) => l.id !== lineId))
  }

  async function generatePDF() {
    // Mark as sent if currently draft
    if (estimate.status === 'draft') {
      await updateEstimate({ status: 'sent' })
    }
    navigate(`/jobs/${jobId}/estimates/${estimateId}/pdf`)
  }

  // ============ Filtered catalog for the picker ============
  const filteredCatalog = useMemo(() => {
    return catalog.filter((it) => {
      if (sectionFilter !== 'all' && it.section !== sectionFilter) return false
      if (search) {
        const s = search.toLowerCase()
        if (!it.name.toLowerCase().includes(s) && !it.category.toLowerCase().includes(s)) return false
      }
      return true
    })
  }, [catalog, search, sectionFilter])

  if (loading) {
    return (
      <div className="min-h-screen bg-ink-50">
        <Header breadcrumb={[
          { label: 'Jobs', to: '/jobs' },
          { label: 'Job', to: `/jobs/${jobId}` },
          { label: 'Estimates', to: `/jobs/${jobId}/estimates` },
          { label: 'Loading…' },
        ]} />
        <main className="max-w-5xl mx-auto p-4 sm:p-6 text-ink-500">Loading…</main>
      </div>
    )
  }

  if (error || !estimate) {
    return (
      <div className="min-h-screen bg-ink-50">
        <Header breadcrumb={[
          { label: 'Jobs', to: '/jobs' },
          { label: 'Estimates', to: `/jobs/${jobId}/estimates` },
          { label: 'Not found' },
        ]} />
        <main className="max-w-5xl mx-auto p-4 sm:p-6 space-y-3">
          <p className="text-danger">{error || 'Estimate not found.'}</p>
          <Link to={`/jobs/${jobId}/estimates`}>
            <Button variant="secondary">← Back to estimates</Button>
          </Link>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-ink-50">
      <Header breadcrumb={[
        { label: 'Jobs', to: '/jobs' },
        { label: job.job_number || 'Job', to: `/jobs/${jobId}` },
        { label: 'Estimates', to: `/jobs/${jobId}/estimates` },
        { label: estimate.estimate_number || `V${estimate.version}` },
      ]} />

      <main className="max-w-5xl mx-auto p-4 sm:p-6 pb-24 space-y-4">
        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-danger rounded p-3 text-sm">
            {error}
          </div>
        )}

        {/* Title row */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="font-condensed font-bold text-2xl sm:text-3xl text-ink-900 tracking-wide">
              {estimate.estimate_number || `Version ${estimate.version}`}
            </h1>
            <p className="text-sm text-ink-600">
              {job.customer?.name} · {job.customer?.address}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {saving && <Badge tone="amber">Saving…</Badge>}
            <Badge tone="blue">{totals.total.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</Badge>
            {estimate.customer_signed_at && (
              <Badge tone="green">✓ Signed by customer</Badge>
            )}
            {canEdit && !estimate.customer_signed_at && (
              <Link to={`/jobs/${jobId}/estimates/${estimateId}/sign`} data-tour="estimate-sign">
                <Button variant="accent" size="sm">Sign for acceptance</Button>
              </Link>
            )}
            {canEdit && (
              <Button onClick={generatePDF} variant="accent" size="sm" data-tour="estimate-pdf">
                Generate PDF
              </Button>
            )}
          </div>
        </div>

        {/* Tab strip */}
        <div className="flex gap-1 border-b border-ink-200" data-tour="estimate-tabs">
          <TabButton active={tab === 'info'}  onClick={() => setTab('info')}>Job Info</TabButton>
          <TabButton active={tab === 'build'} onClick={() => setTab('build')}>Build Estimate</TabButton>
          <TabButton active={tab === 'review'} onClick={() => setTab('review')}>Review</TabButton>
        </div>

        {/* Tab content */}
        {tab === 'info' && (
          <JobInfoTab
            estimate={estimate}
            updateEstimate={updateEstimate}
            canEdit={canEdit}
          />
        )}
        {tab === 'build' && (
          <BuildTab
            catalog={filteredCatalog}
            search={search}
            setSearch={setSearch}
            sectionFilter={sectionFilter}
            setSectionFilter={setSectionFilter}
            lines={lines}
            addLine={addLine}
            updateLine={updateLine}
            removeLine={removeLine}
            totals={totals}
            estimate={estimate}
            updateEstimate={updateEstimate}
            canEdit={canEdit}
          />
        )}
        {tab === 'review' && (
          <ReviewTab
            estimate={estimate}
            lines={lines}
            totals={totals}
            updateEstimate={updateEstimate}
            generatePDF={generatePDF}
            canEdit={canEdit}
          />
        )}
      </main>

      <BottomNav jobId={jobId} />
    </div>
  )
}

// ===========================================================================
// Tab 1 — Job Info
// ===========================================================================
function JobInfoTab({ estimate, updateEstimate, canEdit }) {
  const [form, setForm] = useState({
    estimate_number: estimate.estimate_number || '',
    estimator_name: estimate.estimator_name || '',
    scope_summary: estimate.scope_summary || '',
    notes: estimate.notes || '',
  })

  function blurField(field) {
    if (!canEdit) return
    if (form[field] !== (estimate[field] || '')) {
      updateEstimate({ [field]: form[field] })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Job info</CardTitle>
        <p className="text-sm text-ink-600 mt-1">
          Customer info auto-pulls from the job. The fields below are specific to this estimate version.
        </p>
      </CardHeader>
      <CardBody className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <Input
            label="Estimate number"
            value={form.estimate_number}
            onChange={(e) => setForm((f) => ({ ...f, estimate_number: e.target.value }))}
            onBlur={() => blurField('estimate_number')}
            disabled={!canEdit}
          />
          <Input
            label="Estimator name"
            value={form.estimator_name}
            onChange={(e) => setForm((f) => ({ ...f, estimator_name: e.target.value }))}
            onBlur={() => blurField('estimator_name')}
            disabled={!canEdit}
          />
        </div>

        <Textarea
          label="Scope summary"
          rows={4}
          placeholder="Example: Cat 2 water loss originating in upstairs bathroom. Affected areas: master bath, master bedroom, hallway. Scope includes water extraction, demo of saturated drywall and flooring, structural drying with air movers and dehumidifiers, antimicrobial treatment, and final HEPA cleaning."
          value={form.scope_summary}
          onChange={(e) => setForm((f) => ({ ...f, scope_summary: e.target.value }))}
          onBlur={() => blurField('scope_summary')}
          disabled={!canEdit}
        />

        <Textarea
          label="Internal notes (not shown to customer)"
          rows={2}
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          onBlur={() => blurField('notes')}
          disabled={!canEdit}
        />
      </CardBody>
    </Card>
  )
}

// ===========================================================================
// Tab 2 — Build estimate
// ===========================================================================
function BuildTab({
  catalog, search, setSearch, sectionFilter, setSectionFilter,
  lines, addLine, updateLine, removeLine,
  totals, estimate, updateEstimate, canEdit,
}) {
  // Group catalog by section/category
  const grouped = new Map()
  for (const it of catalog) {
    const k = `${it.section} / ${it.category}`
    if (!grouped.has(k)) grouped.set(k, [])
    grouped.get(k).push(it)
  }

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      {/* Catalog */}
      <Card data-tour="estimate-catalog">
        <CardHeader>
          <CardTitle>Catalog ({catalog.length})</CardTitle>
          <p className="text-xs text-ink-500 mt-1">Tap any item to add it to the estimate.</p>
        </CardHeader>
        <CardBody className="space-y-3">
          <Input
            placeholder="Search catalog…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="flex gap-2 flex-wrap">
            {['all', 'Labor', 'Equipment', 'Consumables'].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSectionFilter(s)}
                className={`px-3 h-8 rounded text-xs font-semibold border transition-colors
                  ${sectionFilter === s
                    ? 'bg-brand-blue text-white border-brand-blue'
                    : 'bg-white text-ink-700 border-ink-300 hover:bg-ink-100'}`}
              >
                {s === 'all' ? 'All' : s}
              </button>
            ))}
          </div>

          <div className="max-h-[500px] overflow-y-auto border border-ink-200 rounded">
            {[...grouped.entries()].map(([groupKey, items]) => (
              <div key={groupKey}>
                <div className="bg-ink-50 px-3 py-1.5 text-xs font-semibold text-ink-700 sticky top-0 border-b border-ink-200">
                  {groupKey}
                </div>
                {items.map((it) => (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => canEdit && addLine(it)}
                    disabled={!canEdit}
                    className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-ink-100 grid grid-cols-[1fr_auto_auto] gap-2 items-center disabled:opacity-50"
                  >
                    <div>
                      <div className="text-sm font-semibold text-ink-900">{it.name}</div>
                      <div className="text-xs text-ink-500">{it.unit}</div>
                    </div>
                    <div className="text-sm font-bold text-brand-blue">
                      ${Number(it.rate).toFixed(2)}
                    </div>
                    <div className="text-brand-blue font-bold">+</div>
                  </button>
                ))}
              </div>
            ))}
            {catalog.length === 0 && (
              <p className="text-center text-sm text-ink-500 p-6">No items match.</p>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Estimate lines + totals */}
      <Card data-tour="estimate-lines">
        <CardHeader>
          <CardTitle>Estimate lines ({lines.length})</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          {lines.length === 0 ? (
            <EmptyState
              title="No items added"
              body="Tap items from the catalog on the left to build your estimate."
            />
          ) : (
            <ul className="space-y-2">
              {lines.map((line) => (
                <LineRow
                  key={line.id}
                  line={line}
                  canEdit={canEdit}
                  onUpdate={(patch) => updateLine(line.id, patch)}
                  onRemove={() => removeLine(line.id)}
                />
              ))}
            </ul>
          )}

          {/* Adjustments */}
          <div className="border-t border-ink-200 pt-3 grid grid-cols-3 gap-2">
            <Input
              label="Markup %"
              type="number"
              step="0.5"
              min="0"
              value={String(estimate.markup_pct ?? 0)}
              onChange={(e) => updateEstimate({ markup_pct: Number(e.target.value) || 0 })}
              disabled={!canEdit}
            />
            <Input
              label="Contingency %"
              type="number"
              step="0.5"
              min="0"
              value={String(estimate.contingency_pct ?? 0)}
              onChange={(e) => updateEstimate({ contingency_pct: Number(e.target.value) || 0 })}
              disabled={!canEdit}
            />
            <Input
              label="Tax %"
              type="number"
              step="0.125"
              min="0"
              value={String(estimate.tax_pct ?? 0)}
              onChange={(e) => updateEstimate({ tax_pct: Number(e.target.value) || 0 })}
              disabled={!canEdit}
            />
          </div>

          {/* Totals card */}
          <TotalsCard totals={totals} estimate={estimate} />
        </CardBody>
      </Card>
    </div>
  )
}

function LineRow({ line, canEdit, onUpdate, onRemove }) {
  const [qty, setQty] = useState(String(line.qty ?? 1))
  const [days, setDays] = useState(String(line.days ?? 1))
  const secondLabel = secondFieldLabelFor(line.unit)

  return (
    <li className="border border-ink-200 rounded p-2.5 bg-white">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-ink-900 truncate">{line.name}</div>
          <div className="text-xs text-ink-500">{line.unit} · ${Number(line.rate).toFixed(2)}</div>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={onRemove}
            className="text-danger text-xl leading-none px-1.5 hover:bg-red-50 rounded"
            aria-label="Remove"
          >×</button>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2 items-end">
        <div>
          <label className="block text-[10px] uppercase text-ink-500 font-semibold mb-0.5">Quantity</label>
          <input
            type="number"
            step="0.5"
            min="0"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            onBlur={() => Number(qty) !== Number(line.qty) && onUpdate({ qty: Number(qty) || 0 })}
            disabled={!canEdit}
            className="w-full h-9 px-2 border border-ink-300 rounded text-sm"
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase text-ink-500 font-semibold mb-0.5">{secondLabel}</label>
          <input
            type="number"
            step="0.5"
            min="0"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            onBlur={() => Number(days) !== Number(line.days) && onUpdate({ days: Number(days) || 0 })}
            disabled={!canEdit}
            className="w-full h-9 px-2 border border-ink-300 rounded text-sm"
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase text-ink-500 font-semibold mb-0.5">Subtotal</label>
          <div className="h-9 flex items-center justify-end font-bold text-brand-blue">
            ${Number(line.line_subtotal).toFixed(2)}
          </div>
        </div>
      </div>
    </li>
  )
}

// Label for the secondary numeric input. The actual stored field is `days`
// regardless of label — the math is always qty × days × rate.
//   'Per Hour'      → 'Hours'         (4 techs × 8 hrs × rate)
//   'Per Pair'      → 'Pairs each'
//   'Gallon'        → 'Gallons each'
//   'Roll'          → 'Rolls each'
//   'Can'           → 'Cans each'
//   'Per Load'      → 'Loads each'
//   'Each'          → 'Each'
//   'Ea / Day'      → 'Days'           (5 air movers × 7 days × rate)
//   anything else   → 'Multiplier'
function secondFieldLabelFor(unit) {
  if (!unit) return 'Multiplier'
  const u = unit.toLowerCase()
  if (u.includes('day')) return 'Days'
  if (u.includes('hour')) return 'Hours'
  if (u.includes('pair')) return 'Pairs each'
  if (u.includes('gallon')) return 'Gallons each'
  if (u.includes('roll')) return 'Rolls each'
  if (u.includes('can')) return 'Cans each'
  if (u.includes('load')) return 'Loads each'
  if (u.includes('each')) return 'Each'
  return 'Multiplier'
}

function TotalsCard({ totals, estimate }) {
  return (
    <div className="bg-brand-blue text-white rounded-lg p-4 space-y-1.5">
      <Row label="Subtotal" value={totals.sub} />
      {(estimate.markup_pct > 0) && <Row label={`Markup (${estimate.markup_pct}%)`} value={totals.markup} />}
      {(estimate.contingency_pct > 0) && <Row label={`Contingency (${estimate.contingency_pct}%)`} value={totals.cont} />}
      {(estimate.tax_pct > 0) && <Row label={`Tax (${estimate.tax_pct}%)`} value={totals.tax} />}
      <div className="border-t border-white/30 pt-2 mt-2 flex justify-between items-baseline">
        <span className="font-condensed font-bold text-lg tracking-wide">TOTAL</span>
        <span className="font-condensed font-bold text-3xl text-brand-yellow">
          ${totals.total.toFixed(2)}
        </span>
      </div>
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between items-baseline text-sm">
      <span className="opacity-90">{label}</span>
      <span className="font-semibold">${value.toFixed(2)}</span>
    </div>
  )
}

// ===========================================================================
// Tab 3 — Review
// ===========================================================================
function ReviewTab({ estimate, lines, totals, updateEstimate, generatePDF, canEdit }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Review</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm font-semibold text-ink-700">Status:</span>
            <Select
              value={estimate.status}
              onChange={(e) => updateEstimate({ status: e.target.value })}
              disabled={!canEdit}
              options={[
                { key: 'draft',      label: 'Draft' },
                { key: 'sent',       label: 'Sent to customer' },
                { key: 'accepted',   label: 'Accepted' },
                { key: 'rejected',   label: 'Rejected' },
                { key: 'superseded', label: 'Superseded' },
              ]}
            />
          </div>

          <TotalsCard totals={totals} estimate={estimate} />

          <div className="text-sm text-ink-700">
            <strong>{lines.length}</strong> line item{lines.length === 1 ? '' : 's'} on this estimate.
          </div>

          {canEdit && (
            <div className="flex gap-2">
              <Button onClick={generatePDF} size="lg">
                Generate estimate PDF
              </Button>
            </div>
          )}

          <div className="text-xs text-ink-600 bg-ink-50 border border-ink-200 rounded p-3">
            <strong>NTE terms:</strong> The total cost of services will not exceed the amount stated above
            without prior written authorization from the customer. Final invoice will reflect actual labor
            hours, equipment days, and consumables used.
          </div>
        </CardBody>
      </Card>
    </div>
  )
}

// ===========================================================================
// Helpers
// ===========================================================================

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 h-10 text-sm font-semibold border-b-2 transition-colors
        ${active
          ? 'border-brand-blue text-brand-blue'
          : 'border-transparent text-ink-600 hover:text-ink-900'}`}
    >
      {children}
    </button>
  )
}

function computeLineSubtotal(line) {
  const qty = Number(line.qty) || 0
  const rate = Number(line.rate) || 0
  const second = Number(line.days) || 0
  return Number((qty * second * rate).toFixed(2))
}
