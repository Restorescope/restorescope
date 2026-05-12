import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth.jsx'
import { useSetting } from '../../lib/settings'
import { uploadJobPhoto } from '../../lib/photos'
import {
  Header, BottomNav, Section, Button, Card, CardHeader, CardBody, CardTitle,
  Input, Select, Textarea, Badge, EmptyState,
} from '../../ui'

/**
 * EquipmentScreen — manage equipment lifecycle for a job.
 *
 * Data model:
 *   Each piece of equipment is identified by an asset_label (e.g. "AIR MOVER 7").
 *   We don't have a separate `equipment` table — we derive each unit from its
 *   timestamped events (placed / monitoring / removed). The asset_label is the
 *   grouping key.
 *
 * Phase 1 lifecycle:
 *   - "Place equipment" form creates one or more 'placed' events
 *   - Each asset shows up as a row with placed time, removed time (if any),
 *     and days-on-site
 *   - Tap an asset to remove it (creates a 'removed' event)
 *   - Long-stay warning ≥ 4 days
 *
 * "Monitoring" events come from the Daily Monitoring screen (Step 13) — we
 * just count them here.
 */
export default function EquipmentScreen() {
  const { id: jobId } = useParams()
  const { profile } = useAuth()
  const equipmentSetting = useSetting('equipment')

  const [events, setEvents] = useState([])
  const [rooms, setRooms] = useState([])
  const [chambers, setChambers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [selectedKeys, setSelectedKeys] = useState(new Set())
  const [bulkRemoving, setBulkRemoving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const [evRes, roomRes, chRes] = await Promise.all([
      supabase
        .from('equipment_events')
        .select('id, chamber_id, room_id, event_type, equipment_type, asset_label, asset_id, purpose, notes, event_at')
        .eq('job_id', jobId)
        .order('event_at', { ascending: true }),
      supabase.from('affected_rooms').select('id, room_name, chamber_id').eq('job_id', jobId),
      supabase.from('drying_chambers').select('id, name').eq('job_id', jobId),
    ])
    if (evRes.error) setError(evRes.error.message)
    else if (roomRes.error) setError(roomRes.error.message)
    else if (chRes.error) setError(chRes.error.message)
    else {
      setEvents(evRes.data ?? [])
      setRooms(roomRes.data ?? [])
      setChambers(chRes.data ?? [])
    }
    setLoading(false)
  }, [jobId])

  useEffect(() => { load() }, [load])

  // Build the asset list — group events by asset_label, find placed/removed pair.
  const assets = useMemo(() => buildAssetList(events, rooms, chambers, equipmentSetting.data), [events, rooms, chambers, equipmentSetting.data])

  function onPlaced() { load() }
  async function onRemove(assetKey, asset) {
    const ok = confirm(`Mark "${asset.label}" as removed now?`)
    if (!ok) return
    try {
      const { error: err } = await supabase.from('equipment_events').insert({
        tenant_id: profile.tenant_id,
        job_id: jobId,
        chamber_id: asset.chamber_id || null,
        room_id: asset.room_id || null,
        event_type: 'removed',
        equipment_type: asset.equipment_type,
        asset_label: asset.asset_label,
        asset_id: asset.asset_id,
        event_at: new Date().toISOString(),
        created_by: profile.id,
      })
      if (err) throw err
      load()
    } catch (e) {
      alert(`Couldn't remove: ${e.message}`)
    }
  }

  // Build the on-site list (used by the bulk-remove handlers and for "Select all")
  const onSiteAssets = useMemo(() => assets.filter((a) => !a.removed_at), [assets])

  function toggleSelect(key) {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }
  function selectAll() {
    setSelectedKeys(new Set(onSiteAssets.map((a) => a.key)))
  }
  function clearSelection() {
    setSelectedKeys(new Set())
  }

  async function bulkRemove(assetList) {
    if (assetList.length === 0) return
    const noun = assetList.length === 1 ? '1 asset' : `${assetList.length} assets`
    const ok = confirm(`Remove ${noun} now? This will create a 'removed' event with the current time for each.`)
    if (!ok) return
    setBulkRemoving(true); setError(null)
    try {
      const now = new Date().toISOString()
      const rows = assetList.map((a) => ({
        tenant_id: profile.tenant_id,
        job_id: jobId,
        chamber_id: a.chamber_id || null,
        room_id: a.room_id || null,
        event_type: 'removed',
        equipment_type: a.equipment_type,
        asset_label: a.asset_label,
        asset_id: a.asset_id,
        event_at: now,
        created_by: profile.id,
      }))
      const { error: err } = await supabase.from('equipment_events').insert(rows)
      if (err) throw err
      clearSelection()
      load()
    } catch (e) {
      setError(`Bulk remove failed: ${e.message}`)
    } finally {
      setBulkRemoving(false)
    }
  }

  function removeAll() {
    bulkRemove(onSiteAssets)
  }
  function removeSelected() {
    const list = onSiteAssets.filter((a) => selectedKeys.has(a.key))
    bulkRemove(list)
  }

  return (
    <div className="min-h-screen bg-ink-50">
      <Header breadcrumb={[
        { label: 'Jobs', to: '/jobs' },
        { label: 'Job', to: `/jobs/${jobId}` },
        { label: 'Equipment' },
      ]} />
      <main className="max-w-5xl mx-auto p-4 sm:p-6 pb-24 space-y-5">

        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-danger rounded p-3 text-sm">
            {error}
          </div>
        )}

        {showForm ? (
          <PlaceEquipmentForm
            jobId={jobId}
            tenantId={profile.tenant_id}
            rooms={rooms}
            chambers={chambers}
            existingAssetLabels={Array.from(new Set(events.map((e) => e.asset_label).filter(Boolean)))}
            onPlaced={() => { setShowForm(false); onPlaced() }}
            onCancel={() => setShowForm(false)}
          />
        ) : (
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm text-ink-600">
              {onSiteAssets.length} on site
              {' · '}
              {assets.length} total tracked
            </p>
            <div className="flex gap-2 flex-wrap">
              <Link to={`/jobs/${jobId}/monitoring`}>
                <Button variant="secondary">Daily monitoring</Button>
              </Link>
              {onSiteAssets.length > 0 && (
                <Button onClick={removeAll} variant="secondary" loading={bulkRemoving}>
                  Remove all ({onSiteAssets.length})
                </Button>
              )}
              <Button onClick={() => setShowForm(true)} variant="accent">+ Place equipment</Button>
            </div>
          </div>
        )}

        <Section title="On site" description="Equipment currently placed at the property.">
          {loading ? (
            <p className="text-ink-500 text-sm">Loading…</p>
          ) : onSiteAssets.length === 0 ? (
            <EmptyState
              title="No equipment on site"
              body="Tap '+ Place equipment' to log when equipment was placed."
            />
          ) : (
            <>
              {/* Selection toolbar */}
              <div className="bg-white border border-ink-200 rounded p-2 flex items-center justify-between gap-2 flex-wrap mb-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-ink-700 select-none cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-5 h-5 rounded border-ink-300"
                    checked={selectedKeys.size > 0 && selectedKeys.size === onSiteAssets.length}
                    ref={(el) => {
                      if (el) el.indeterminate = selectedKeys.size > 0 && selectedKeys.size < onSiteAssets.length
                    }}
                    onChange={() => {
                      if (selectedKeys.size === onSiteAssets.length) clearSelection()
                      else selectAll()
                    }}
                  />
                  {selectedKeys.size === 0
                    ? 'Select all'
                    : `${selectedKeys.size} of ${onSiteAssets.length} selected`}
                </label>
                {selectedKeys.size > 0 && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={clearSelection}>
                      Clear
                    </Button>
                    <Button size="sm" onClick={removeSelected} loading={bulkRemoving}>
                      Remove selected ({selectedKeys.size})
                    </Button>
                  </div>
                )}
              </div>

              <ul className="space-y-2">
                {onSiteAssets.map((a) => (
                  <AssetRow
                    key={a.key}
                    asset={a}
                    selected={selectedKeys.has(a.key)}
                    onToggleSelect={() => toggleSelect(a.key)}
                    onRemove={() => onRemove(a.key, a)}
                  />
                ))}
              </ul>
            </>
          )}
        </Section>

        {assets.some((a) => a.removed_at) && (
          <Section title="Removed" description="Equipment that has been picked up.">
            <ul className="space-y-2">
              {assets.filter((a) => a.removed_at).map((a) => (
                <AssetRow key={a.key} asset={a} removed />
              ))}
            </ul>
          </Section>
        )}
      </main>

      <BottomNav jobId={jobId} />
    </div>
  )
}

// ===========================================================================
// Place equipment form
// ===========================================================================

function PlaceEquipmentForm({ jobId, tenantId, rooms, chambers, existingAssetLabels, onPlaced, onCancel }) {
  const equipmentSetting = useSetting('equipment')
  const { profile } = useAuth()

  const [form, setForm] = useState({
    equipment_type: '',
    quantity: 1,
    starting_label_number: '',
    chamber_id: '',
    room_id: '',
    asset_id: '',
    purpose: '',
    notes: '',
    event_at: localDatetimeNow(),
  })
  const [pendingPhoto, setPendingPhoto] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const photoInputRef = useRef(null)

  const equipmentOptions = (equipmentSetting.data?.items ?? []).map((e) => ({ key: e.key, label: e.label }))

  // Auto-suggest the next asset label based on existing labels for the same type
  const suggestedStartNumber = useMemo(() => {
    if (!form.equipment_type) return ''
    const prefix = labelPrefix(form.equipment_type, equipmentSetting.data)
    if (!prefix) return ''
    const usedNumbers = existingAssetLabels
      .filter((l) => l && l.toUpperCase().startsWith(prefix.toUpperCase()))
      .map((l) => parseInt(l.replace(/\D/g, ''), 10))
      .filter((n) => Number.isFinite(n))
    const next = usedNumbers.length === 0 ? 1 : Math.max(...usedNumbers) + 1
    return String(next)
  }, [form.equipment_type, existingAssetLabels, equipmentSetting.data])

  // When equipment type changes, prefill suggested starting label
  useEffect(() => {
    setForm((f) => ({ ...f, starting_label_number: suggestedStartNumber }))
  }, [suggestedStartNumber])

  function pickPhoto() { photoInputRef.current?.click() }
  function onPhotoFile(e) {
    const f = e.target.files?.[0]
    if (f) setPendingPhoto(f)
    e.target.value = ''
  }

  async function save() {
    setError(null)
    if (!form.equipment_type) { setError('Pick an equipment type.'); return }
    const qty = parseInt(form.quantity, 10)
    if (!Number.isFinite(qty) || qty < 1) { setError('Quantity must be at least 1.'); return }
    setSaving(true)
    try {
      const prefix = labelPrefix(form.equipment_type, equipmentSetting.data)
      const startNum = parseInt(form.starting_label_number, 10) || 1

      // Build N events, one per unit
      const rows = []
      for (let i = 0; i < qty; i++) {
        const num = startNum + i
        const asset_label = prefix ? `${prefix} ${num}` : null
        rows.push({
          tenant_id: tenantId,
          job_id: jobId,
          chamber_id: form.chamber_id || null,
          room_id: form.room_id || null,
          event_type: 'placed',
          equipment_type: form.equipment_type,
          asset_label,
          asset_id: qty === 1 ? (form.asset_id || null) : null,  // serial only meaningful for single unit
          purpose: form.purpose || null,
          notes: form.notes || null,
          event_at: new Date(form.event_at).toISOString(),
          created_by: profile.id,
        })
      }
      const { data, error: err } = await supabase.from('equipment_events').insert(rows).select('id, asset_label, room_id')
      if (err) throw err

      // If a photo was attached, link it to the FIRST asset (most common case: one photo per place op)
      if (pendingPhoto && data?.[0]) {
        try {
          await uploadJobPhoto(pendingPhoto, {
            tenantId, jobId,
            roomId: data[0].room_id,
            category: 'equipment_placement',
            uploadedBy: profile.id,
          })
        } catch (photoErr) {
          // eslint-disable-next-line no-console
          console.warn('Equipment placement photo upload failed:', photoErr)
        }
      }
      onPlaced(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  // Preview labels
  const labels = useMemo(() => {
    const prefix = labelPrefix(form.equipment_type, equipmentSetting.data)
    const start = parseInt(form.starting_label_number, 10) || 1
    const qty = parseInt(form.quantity, 10) || 1
    if (!prefix) return []
    return Array.from({ length: Math.min(qty, 8) }, (_, i) => `${prefix} ${start + i}`)
  }, [form.equipment_type, form.starting_label_number, form.quantity, equipmentSetting.data])

  return (
    <Card>
      <CardHeader><CardTitle>Place equipment</CardTitle></CardHeader>
      <CardBody className="space-y-4">
        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-danger rounded p-3 text-sm">
            {error}
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-3">
          <Select
            label="Equipment type"
            required
            placeholder="Pick a type…"
            value={form.equipment_type}
            onChange={(e) => setForm((f) => ({ ...f, equipment_type: e.target.value }))}
            options={equipmentOptions}
          />
          <Input
            label="Quantity"
            required
            type="number"
            min="1"
            inputMode="numeric"
            value={form.quantity}
            onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
            hint="How many of this type are you placing right now?"
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <Input
            label="Starting label number"
            type="number"
            inputMode="numeric"
            value={form.starting_label_number}
            onChange={(e) => setForm((f) => ({ ...f, starting_label_number: e.target.value }))}
            hint={labels.length > 0 ? `Will create: ${labels.join(', ')}${parseInt(form.quantity, 10) > 8 ? '…' : ''}` : 'Auto-suggested.'}
          />
          <Input
            label="Date/time placed"
            type="datetime-local"
            value={form.event_at}
            onChange={(e) => setForm((f) => ({ ...f, event_at: e.target.value }))}
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <Select
            label="Drying chamber"
            placeholder="None"
            value={form.chamber_id}
            onChange={(e) => setForm((f) => ({ ...f, chamber_id: e.target.value }))}
            options={chambers.map((c) => ({ key: c.id, label: c.name }))}
          />
          <Select
            label="Room"
            placeholder="Whole chamber / unassigned"
            value={form.room_id}
            onChange={(e) => setForm((f) => ({ ...f, room_id: e.target.value }))}
            options={rooms.map((r) => ({ key: r.id, label: r.room_name }))}
          />
        </div>

        {parseInt(form.quantity, 10) === 1 && (
          <Input
            label="Serial / asset ID"
            placeholder="Optional"
            value={form.asset_id}
            onChange={(e) => setForm((f) => ({ ...f, asset_id: e.target.value }))}
            hint="Useful if you track which physical unit is at which job."
          />
        )}

        <Input
          label="Purpose / reason"
          placeholder="e.g. Drying access for affected wall cavity"
          value={form.purpose}
          onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))}
        />

        <Textarea
          label="Notes"
          rows={2}
          placeholder="Optional"
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
        />

        <div className="bg-white border border-ink-200 rounded p-3">
          <p className="text-sm font-semibold text-ink-700 mb-2">Placement photo (optional)</p>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={onPhotoFile}
          />
          {pendingPhoto ? (
            <div className="flex items-center gap-3">
              <Badge tone="green">📷 {pendingPhoto.name}</Badge>
              <Button type="button" variant="ghost" size="sm" onClick={() => setPendingPhoto(null)}>
                Remove
              </Button>
            </div>
          ) : (
            <Button type="button" variant="secondary" size="sm" onClick={pickPhoto}>
              + Attach placement photo
            </Button>
          )}
          <p className="text-xs text-ink-500 mt-1">
            Tagged "equipment_placement". Required by default for finalization (Owner can change in QC settings).
          </p>
        </div>

        <div className="flex gap-2 pt-1">
          <Button onClick={save} loading={saving}>
            Place {parseInt(form.quantity, 10) || 1} unit{parseInt(form.quantity, 10) === 1 ? '' : 's'}
          </Button>
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        </div>
      </CardBody>
    </Card>
  )
}

// ===========================================================================
// Asset row
// ===========================================================================

function AssetRow({ asset, onRemove, removed = false, selected = false, onToggleSelect }) {
  return (
    <li className={`bg-white rounded-lg border shadow-card p-3 flex items-center gap-3 flex-wrap transition-colors
      ${selected ? 'border-brand-blue bg-brand-blue/5' : 'border-ink-200/60'}`}>
      {!removed && onToggleSelect && (
        <label className="select-none cursor-pointer flex items-center shrink-0">
          <input
            type="checkbox"
            className="w-5 h-5 rounded border-ink-300"
            checked={selected}
            onChange={onToggleSelect}
            aria-label={`Select ${asset.asset_label || 'asset'} for bulk action`}
          />
        </label>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-condensed font-bold text-brand-blue tracking-wide">
            {asset.asset_label || asset.equipment_label || '—'}
          </span>
          <Badge tone={removed ? 'neutral' : 'blue'}>
            {asset.equipment_label || asset.equipment_type}
          </Badge>
          {!removed && asset.days_on_site >= 4 && (
            <Badge tone="amber">on site {asset.days_on_site}d</Badge>
          )}
          {!removed && asset.days_on_site < 4 && asset.days_on_site > 0 && (
            <Badge tone="neutral">{asset.days_on_site}d</Badge>
          )}
          {asset.asset_id && <Badge tone="neutral">SN {asset.asset_id}</Badge>}
        </div>
        <p className="text-xs text-ink-500 mt-0.5">
          {asset.location_label && <>{asset.location_label} · </>}
          placed {formatDate(asset.placed_at)}
          {asset.removed_at && <> · removed {formatDate(asset.removed_at)}</>}
        </p>
        {asset.purpose && <p className="text-xs text-ink-600 mt-1 italic">{asset.purpose}</p>}
      </div>
      {!removed && onRemove && (
        <Button variant="secondary" size="sm" onClick={onRemove}>Mark removed</Button>
      )}
    </li>
  )
}

// ===========================================================================
// Helpers
// ===========================================================================

function labelPrefix(equipmentTypeKey, equipmentSettingData) {
  if (!equipmentTypeKey) return ''
  const item = (equipmentSettingData?.items ?? []).find((e) => e.key === equipmentTypeKey)
  if (!item) return ''
  const lower = item.label.toLowerCase()
  if (lower.includes('air mover'))     return 'AIR MOVER'
  if (lower.includes('dehumidifier'))  return 'DEHUMIDIFIER'
  if (lower.includes('air scrubber'))  return 'AIR SCRUBBER'
  if (lower.includes('hepa vacuum'))   return 'HEPA VACUUM'
  if (lower.includes('containment fan')) return 'CONTAINMENT FAN'
  if (lower.includes('heat'))          return 'HEAT'
  if (lower.includes('injectidry'))    return 'INJECTIDRY'
  // Fallback: first two words uppercased
  return item.label.split(/\s+/).slice(0, 2).join(' ').toUpperCase()
}

function buildAssetList(events, rooms, chambers, equipmentSettingData) {
  const roomById = new Map(rooms.map((r) => [r.id, r]))
  const chamberById = new Map(chambers.map((c) => [c.id, c]))
  const equipById = new Map((equipmentSettingData?.items ?? []).map((e) => [e.key, e]))

  // Group events by a stable key. Prefer asset_label; fall back to id of first placed event.
  const byKey = new Map()
  for (const ev of events) {
    const key = ev.asset_label || `__${ev.id}__`
    if (!byKey.has(key)) byKey.set(key, [])
    byKey.get(key).push(ev)
  }

  const assets = []
  for (const [key, evs] of byKey) {
    const placed = evs.find((e) => e.event_type === 'placed')
    const removed = [...evs].reverse().find((e) => e.event_type === 'removed')
    const seed = placed || evs[0]
    const placed_at = placed?.event_at || seed.event_at
    const removed_at = removed?.event_at || null
    const days_on_site = computeDays(placed_at, removed_at || new Date().toISOString())

    const room = seed.room_id ? roomById.get(seed.room_id) : null
    const chamber = seed.chamber_id ? chamberById.get(seed.chamber_id) : null
    const equip = equipById.get(seed.equipment_type)

    assets.push({
      key,
      asset_label:    seed.asset_label,
      asset_id:       seed.asset_id,
      equipment_type: seed.equipment_type,
      equipment_label: equip?.label,
      room_id:        seed.room_id,
      chamber_id:     seed.chamber_id,
      location_label: [chamber?.name, room?.room_name].filter(Boolean).join(' / ') || null,
      purpose:        seed.purpose,
      placed_at,
      removed_at,
      days_on_site,
    })
  }
  // Sort: on-site first (oldest first within group), then removed (most recent first)
  assets.sort((a, b) => {
    if (!!a.removed_at !== !!b.removed_at) return a.removed_at ? 1 : -1
    if (!a.removed_at) return new Date(a.placed_at) - new Date(b.placed_at)
    return new Date(b.removed_at) - new Date(a.removed_at)
  })
  return assets
}

function computeDays(startIso, endIso) {
  const ms = new Date(endIso) - new Date(startIso)
  if (!Number.isFinite(ms) || ms < 0) return 0
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

function localDatetimeNow() {
  // datetime-local format: "YYYY-MM-DDTHH:MM" in local time
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
