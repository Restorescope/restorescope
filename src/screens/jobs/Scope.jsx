import { useEffect, useState, useCallback, useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth.jsx'
import { useSetting } from '../../lib/settings'
import {
  Header, BottomNav, Section, Button, Card, CardHeader, CardBody, CardTitle,
  Input, Select, Textarea, Badge, EmptyState,
} from '../../ui'

/**
 * ScopeScreen — capture the scope of work performed on a job, with IICRC-aligned
 * reasoning attached to each line item.
 *
 * Workflow:
 *   1. PM picks a scope item from the library (Remove drywall, Containment, etc.)
 *   2. Picks one of the pre-written reason templates, OR types a custom reason
 *   3. Optionally scopes to a specific room (otherwise it's job-level)
 *   4. Optionally adds quantity + unit (e.g., "20 LF baseboard")
 *
 * The final report will read these out per-room or per-job.
 */
export default function ScopeScreen() {
  const { id: jobId } = useParams()
  const { profile } = useAuth()
  const scopeLibrary = useSetting('scope_library')

  const [items, setItems] = useState([])
  const [rooms, setRooms] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const [iRes, rRes] = await Promise.all([
      supabase
        .from('scope_items')
        .select('id, room_id, scope_key, reason_template_key, reason_text, quantity, unit, created_at')
        .eq('job_id', jobId)
        .order('created_at', { ascending: true }),
      supabase.from('affected_rooms').select('id, room_name').eq('job_id', jobId).order('created_at'),
    ])
    if (iRes.error) setError(iRes.error.message)
    else if (rRes.error) setError(rRes.error.message)
    else {
      setItems(iRes.data ?? [])
      setRooms(rRes.data ?? [])
    }
    setLoading(false)
  }, [jobId])

  useEffect(() => { load() }, [load])

  function onSaved(item, isEdit) {
    if (isEdit) {
      setItems((arr) => arr.map((x) => x.id === item.id ? item : x))
    } else {
      setItems((arr) => [...arr, item])
    }
    setShowForm(false)
    setEditingId(null)
  }

  async function onDelete(item) {
    if (!confirm('Delete this scope item?')) return
    try {
      const { error: err } = await supabase.from('scope_items').delete().eq('id', item.id)
      if (err) throw err
      setItems((arr) => arr.filter((x) => x.id !== item.id))
    } catch (e) {
      alert(`Couldn't delete: ${e.message}`)
    }
  }

  // Index for quick lookups
  const scopeByKey = useMemo(() => {
    const map = new Map()
    for (const s of (scopeLibrary.data?.items ?? [])) map.set(s.key, s)
    return map
  }, [scopeLibrary.data])
  const roomById = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms])

  // Group items: per room, then job-level at the end
  const grouped = useMemo(() => {
    const byRoom = new Map()
    for (const it of items) {
      const k = it.room_id || '__job__'
      if (!byRoom.has(k)) byRoom.set(k, [])
      byRoom.get(k).push(it)
    }
    const ordered = []
    for (const r of rooms) {
      if (byRoom.has(r.id)) ordered.push({ room: r, items: byRoom.get(r.id) })
    }
    if (byRoom.has('__job__')) ordered.push({ room: null, items: byRoom.get('__job__') })
    return ordered
  }, [items, rooms])

  const editingItem = items.find((i) => i.id === editingId)

  return (
    <div className="min-h-screen bg-ink-50">
      <Header breadcrumb={[
        { label: 'Jobs', to: '/jobs' },
        { label: 'Job', to: `/jobs/${jobId}` },
        { label: 'Scope' },
      ]} />
      <main className="max-w-5xl mx-auto p-4 sm:p-6 pb-24 space-y-5">

        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-danger rounded p-3 text-sm">
            {error}
          </div>
        )}

        {showForm || editingItem ? (
          <ScopeItemForm
            jobId={jobId}
            tenantId={profile.tenant_id}
            rooms={rooms}
            scopeLibrary={scopeLibrary.data?.items ?? []}
            existingItem={editingItem}
            onSaved={onSaved}
            onCancel={() => { setShowForm(false); setEditingId(null) }}
          />
        ) : (
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm text-ink-600">
              {items.length} scope item{items.length === 1 ? '' : 's'}
              {' · '}
              IICRC-aligned wording from your library
            </p>
            <Button onClick={() => setShowForm(true)} variant="accent">+ Add scope item</Button>
          </div>
        )}

        <Section
          title="Scope items"
          description="Each item appears in the final report's Scope Justification section."
        >
          {loading ? (
            <p className="text-ink-500 text-sm">Loading…</p>
          ) : items.length === 0 ? (
            <EmptyState
              title="No scope items yet"
              body="Tap '+ Add scope item' to log the actions taken on this job, with IICRC-aligned justification."
            />
          ) : (
            <div className="space-y-4">
              {grouped.map(({ room, items: groupItems }) => (
                <Card key={room?.id ?? '__job__'}>
                  <CardHeader>
                    <CardTitle>{room ? room.room_name : 'Job-wide'}</CardTitle>
                    <p className="text-xs text-ink-500 mt-0.5">
                      {groupItems.length} item{groupItems.length === 1 ? '' : 's'}
                    </p>
                  </CardHeader>
                  <CardBody>
                    <ul className="space-y-3">
                      {groupItems.map((it) => (
                        <ScopeRow
                          key={it.id}
                          item={it}
                          scope={scopeByKey.get(it.scope_key)}
                          onEdit={() => setEditingId(it.id)}
                          onDelete={() => onDelete(it)}
                        />
                      ))}
                    </ul>
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

// ===========================================================================
// Scope item form — add or edit
// ===========================================================================

function ScopeItemForm({ jobId, tenantId, rooms, scopeLibrary, existingItem, onSaved, onCancel }) {
  const isEdit = !!existingItem

  const [form, setForm] = useState(() => existingItem ? {
    scope_key: existingItem.scope_key,
    reason_template_key: existingItem.reason_template_key || '',
    reason_text: existingItem.reason_text || '',
    room_id: existingItem.room_id || '',
    quantity: existingItem.quantity ?? '',
    unit: existingItem.unit || '',
    customMode: !existingItem.reason_template_key && !!existingItem.reason_text,
  } : {
    scope_key: '',
    reason_template_key: '',
    reason_text: '',
    room_id: '',
    quantity: '',
    unit: '',
    customMode: false,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const selectedScope = useMemo(
    () => scopeLibrary.find((s) => s.key === form.scope_key) || null,
    [scopeLibrary, form.scope_key]
  )

  // When scope changes, clear reason; when reason template changes, fill text
  function setScope(key) {
    setForm((f) => ({
      ...f,
      scope_key: key,
      reason_template_key: '',
      reason_text: '',
      customMode: false,
    }))
  }
  function pickTemplate(reasonKey) {
    const reason = selectedScope?.reasons?.find((r) => r.key === reasonKey)
    setForm((f) => ({
      ...f,
      reason_template_key: reasonKey,
      reason_text: reason?.text || '',
      customMode: false,
    }))
  }
  function enableCustomMode() {
    setForm((f) => ({
      ...f,
      reason_template_key: '',
      customMode: true,
      // keep current reason_text if any (so they can edit a template they liked)
    }))
  }

  async function save() {
    setError(null)
    if (!form.scope_key) { setError('Pick a scope item.'); return }
    if (!form.reason_text.trim()) { setError('Reason is required (pick a template or type a custom one).'); return }
    setSaving(true)
    try {
      const payload = {
        tenant_id: tenantId,
        job_id: jobId,
        room_id: form.room_id || null,
        scope_key: form.scope_key,
        reason_template_key: form.customMode ? null : (form.reason_template_key || null),
        reason_text: form.reason_text.trim(),
        quantity: form.quantity === '' ? null : Number(form.quantity),
        unit: form.unit || null,
      }
      let res
      if (isEdit) {
        res = await supabase.from('scope_items').update(payload).eq('id', existingItem.id).select('*').single()
      } else {
        res = await supabase.from('scope_items').insert(payload).select('*').single()
      }
      if (res.error) throw res.error
      onSaved(res.data, isEdit)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle>{isEdit ? 'Edit scope item' : 'Add scope item'}</CardTitle></CardHeader>
      <CardBody className="space-y-4">
        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-danger rounded p-3 text-sm">
            {error}
          </div>
        )}

        <Select
          label="Scope item"
          required
          placeholder="Pick a scope item…"
          value={form.scope_key}
          onChange={(e) => setScope(e.target.value)}
          options={scopeLibrary.map((s) => ({ key: s.key, label: s.label }))}
          hint="Edit the full library in Settings → Scope library."
        />

        {selectedScope && (
          <div className="bg-ink-50 border border-ink-200 rounded p-3 space-y-3">
            <p className="text-sm font-semibold text-ink-700">Reason / justification</p>

            <ul className="space-y-2">
              {(selectedScope.reasons ?? []).map((r) => {
                const selected = !form.customMode && form.reason_template_key === r.key
                return (
                  <li key={r.key}>
                    <button
                      type="button"
                      onClick={() => pickTemplate(r.key)}
                      className={`w-full text-left p-3 rounded border text-sm transition-colors
                        ${selected
                          ? 'bg-brand-blue text-white border-brand-blue'
                          : 'bg-white text-ink-800 border-ink-300 hover:bg-ink-100'}`}
                    >
                      <span className={`block text-xs font-semibold mb-0.5 ${selected ? 'text-white/80' : 'text-ink-500'}`}>
                        Template: {r.key}
                      </span>
                      {r.text}
                    </button>
                  </li>
                )
              })}
              <li>
                <button
                  type="button"
                  onClick={enableCustomMode}
                  className={`w-full text-left p-3 rounded border text-sm transition-colors
                    ${form.customMode
                      ? 'bg-amber-500 text-white border-amber-600'
                      : 'bg-white text-ink-800 border-ink-300 hover:bg-ink-100'}`}
                >
                  <span className={`block text-xs font-semibold mb-0.5 ${form.customMode ? 'text-white/80' : 'text-ink-500'}`}>
                    Custom reason
                  </span>
                  Write your own reason — useful for region-specific or unusual situations.
                </button>
              </li>
            </ul>

            {(form.reason_template_key || form.customMode) && (
              <Textarea
                label={form.customMode ? 'Your custom reason' : 'Reason text (you can edit before saving)'}
                rows={3}
                value={form.reason_text}
                onChange={(e) => setForm((f) => ({ ...f, reason_text: e.target.value }))}
                hint="This exact wording appears in the final report."
              />
            )}
          </div>
        )}

        <div className="grid sm:grid-cols-3 gap-3">
          <Select
            label="Room (optional)"
            placeholder="Job-wide"
            value={form.room_id}
            onChange={(e) => setForm((f) => ({ ...f, room_id: e.target.value }))}
            options={rooms.map((r) => ({ key: r.id, label: r.room_name }))}
            hint="Leave blank for job-wide scope items."
            containerClassName="sm:col-span-1"
          />
          <Input
            label="Quantity (optional)"
            type="number"
            step="0.01"
            inputMode="decimal"
            value={form.quantity}
            onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
          />
          <UnitPicker
            value={form.unit}
            onChange={(unit) => setForm((f) => ({ ...f, unit }))}
          />
        </div>

        <div className="flex gap-2 pt-1">
          <Button onClick={save} loading={saving}>
            {isEdit ? 'Save changes' : 'Add scope item'}
          </Button>
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        </div>
      </CardBody>
    </Card>
  )
}

// ===========================================================================
// Scope row
// ===========================================================================

function ScopeRow({ item, scope, onEdit, onDelete }) {
  const isCustom = !item.reason_template_key
  return (
    <li className="border border-ink-200 rounded p-3 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className="font-semibold text-ink-900">{scope?.label || item.scope_key}</span>
          {item.quantity != null && (
            <Badge tone="neutral">
              {item.quantity}{item.unit ? ` ${item.unit}` : ''}
            </Badge>
          )}
          {isCustom
            ? <Badge tone="amber">custom reason</Badge>
            : <Badge tone="blue">template: {item.reason_template_key}</Badge>}
        </div>
        <p className="text-sm text-ink-700 italic">"{item.reason_text}"</p>
      </div>
      <div className="flex flex-col gap-1 shrink-0">
        <Button variant="ghost" size="sm" onClick={onEdit}>Edit</Button>
        <Button variant="ghost" size="sm" onClick={onDelete}>
          <span className="text-danger">Delete</span>
        </Button>
      </div>
    </li>
  )
}

// ===========================================================================
// UnitPicker — dropdown of standard restoration units with "Other…" fallback
// ===========================================================================

const STANDARD_UNITS = [
  { key: 'LF',  label: 'LF — Linear feet' },
  { key: 'SF',  label: 'SF — Square feet' },
  { key: 'SY',  label: 'SY — Square yards' },
  { key: 'CF',  label: 'CF — Cubic feet' },
  { key: 'CY',  label: 'CY — Cubic yards' },
  { key: 'EA',  label: 'EA — Each' },
  { key: 'HR',  label: 'HR — Hours' },
  { key: 'DA',  label: 'DA — Days' },
  { key: 'BX',  label: 'BX — Box' },
  { key: 'GAL', label: 'GAL — Gallons' },
  { key: 'LB',  label: 'LB — Pounds' },
  { key: 'ROLL', label: 'ROLL — Rolls' },
]
const STANDARD_KEYS = new Set(STANDARD_UNITS.map((u) => u.key))

function UnitPicker({ value, onChange }) {
  const isCustom = value && !STANDARD_KEYS.has(value)
  // Internal "mode": use a sentinel value '__custom__' in the select to flip to custom input
  const selectValue = !value
    ? ''
    : isCustom
      ? '__custom__'
      : value

  function onSelectChange(e) {
    const v = e.target.value
    if (v === '__custom__') {
      // Switch to custom mode but keep any existing custom text
      onChange(isCustom ? value : '')
    } else {
      onChange(v)
    }
  }

  return (
    <div>
      <label className="block">
        <span className="block text-sm font-semibold text-ink-700 mb-1">Unit (optional)</span>
        <select
          value={selectValue}
          onChange={onSelectChange}
          className="w-full h-11 px-3 rounded border bg-white text-ink-900
                     border-ink-300 focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/30 focus:outline-none"
        >
          <option value="">—</option>
          {STANDARD_UNITS.map((u) => (
            <option key={u.key} value={u.key}>{u.label}</option>
          ))}
          <option value="__custom__">Other (type your own)…</option>
        </select>
      </label>
      {selectValue === '__custom__' && (
        <input
          type="text"
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type custom unit"
          className="mt-1 w-full h-11 px-3 rounded border bg-white text-ink-900 placeholder:text-ink-400
                     border-ink-300 focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/30 focus:outline-none"
        />
      )}
    </div>
  )
}
