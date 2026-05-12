import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSetting } from '../../lib/settings'
import {
  Header, Section, Button, Card, CardHeader, CardBody, CardTitle,
  Input, Badge, EmptyState,
} from '../../ui'
import { DEFAULT_METERS, UNITS } from '../../lib/defaults'

const ALL_UNIT_OPTIONS = Object.entries(UNITS).map(([key, label]) => ({ key, label: `${key} (${label})` }))

/**
 * SettingsMeters — meter types and the units each one supports.
 */
export default function SettingsMeters() {
  const { data, save, loading } = useSetting('meters')
  const [items, setItems] = useState([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [savedAt, setSavedAt] = useState(null)

  useEffect(() => {
    if (data?.items) setItems(data.items)
  }, [data])

  function setRow(idx, patch) {
    setItems((arr) => arr.map((it, i) => i === idx ? { ...it, ...patch } : it))
    setDirty(true)
  }
  function removeRow(idx) {
    setItems((arr) => arr.filter((_, i) => i !== idx))
    setDirty(true)
  }
  function addRow() {
    setItems((arr) => [...arr, { key: '', label: '', units: ['wme_pct'] }])
    setDirty(true)
  }
  function move(idx, dir) {
    setItems((arr) => {
      const j = idx + dir
      if (j < 0 || j >= arr.length) return arr
      const next = [...arr]
      ;[next[idx], next[j]] = [next[j], next[idx]]
      return next
    })
    setDirty(true)
  }
  function toggleUnit(idx, unitKey) {
    setItems((arr) => arr.map((it, i) => {
      if (i !== idx) return it
      const set = new Set(it.units || [])
      if (set.has(unitKey)) set.delete(unitKey); else set.add(unitKey)
      return { ...it, units: [...set] }
    }))
    setDirty(true)
  }
  function restoreDefaults() {
    if (!confirm('Replace meters list with defaults?')) return
    setItems(DEFAULT_METERS)
    setDirty(true)
  }

  async function onSave() {
    setError(null); setSaving(true)
    try {
      const seen = new Set()
      const clean = items
        .filter((r) => (r.label ?? '').trim().length > 0)
        .map((r) => {
          let key = (r.key ?? '').trim() || slug(r.label)
          if (seen.has(key)) {
            let i = 2
            while (seen.has(`${key}_${i}`)) i++
            key = `${key}_${i}`
          }
          seen.add(key)
          return {
            key,
            label: r.label.trim(),
            units: Array.isArray(r.units) && r.units.length > 0 ? r.units : ['wme_pct'],
          }
        })
      await save({ items: clean })
      setItems(clean)
      setDirty(false)
      setSavedAt(new Date())
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-ink-50">
      <Header breadcrumb={[
        { label: 'Settings', to: '/settings' },
        { label: 'Meters' },
      ]} />
      <main className="max-w-3xl mx-auto p-4 sm:p-6 pb-24 space-y-5">

        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-danger rounded p-3 text-sm">
            {error}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Meters</CardTitle>
            <p className="text-sm text-ink-600 mt-1">
              Meters in the Add Reading dropdown, each with the units they support. The Reading
              form will narrow the unit picker based on which meter you select.
            </p>
          </CardHeader>
          <CardBody>
            {loading ? (
              <p className="text-ink-500 text-sm">Loading…</p>
            ) : items.length === 0 ? (
              <EmptyState
                title="No meters yet"
                body="Add the moisture meters and atmospheric instruments your team uses in the field."
                action={<Button onClick={addRow}>+ Add meter</Button>}
              />
            ) : (
              <ul className="space-y-3">
                {items.map((row, idx) => (
                  <li key={idx} className="border border-ink-200 rounded p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <span className="text-xs text-ink-400 font-mono w-6 text-right shrink-0 pt-3">{idx + 1}</span>
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <Input
                          placeholder="Meter name (e.g. Protimeter Surveymaster)"
                          value={row.label ?? ''}
                          onChange={(e) => setRow(idx, { label: e.target.value })}
                        />
                        <Input
                          placeholder="Key (auto if blank)"
                          value={row.key ?? ''}
                          onChange={(e) => setRow(idx, { key: e.target.value })}
                        />
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button type="button" onClick={() => move(idx, -1)} disabled={idx === 0}
                          className="h-9 w-9 rounded text-ink-500 hover:bg-ink-100 disabled:opacity-30" aria-label="Move up">↑</button>
                        <button type="button" onClick={() => move(idx, +1)} disabled={idx === items.length - 1}
                          className="h-9 w-9 rounded text-ink-500 hover:bg-ink-100 disabled:opacity-30" aria-label="Move down">↓</button>
                        <button type="button" onClick={() => removeRow(idx)}
                          className="h-9 w-9 rounded text-danger hover:bg-red-50 text-xl" aria-label="Remove">×</button>
                      </div>
                    </div>
                    <div className="ml-8">
                      <span className="block text-xs font-semibold text-ink-700 mb-1">Supported units</span>
                      <ul className="flex flex-wrap gap-1.5">
                        {ALL_UNIT_OPTIONS.map((u) => {
                          const selected = (row.units || []).includes(u.key)
                          return (
                            <li key={u.key}>
                              <button
                                type="button"
                                onClick={() => toggleUnit(idx, u.key)}
                                aria-pressed={selected}
                                className={`px-2 h-8 rounded-full text-xs font-medium border transition-colors
                                  ${selected
                                    ? 'bg-brand-blue text-white border-brand-blue'
                                    : 'bg-white text-ink-700 border-ink-300 hover:bg-ink-100'}`}
                              >
                                {selected && <span aria-hidden className="mr-1">✓</span>}
                                {u.label}
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap gap-2 pt-4 mt-4 border-t border-ink-200">
              <Button onClick={addRow} variant="secondary">+ Add meter</Button>
              <Button onClick={restoreDefaults} variant="ghost">Restore defaults</Button>
              <div className="flex-1" />
              {savedAt && !dirty && <Badge tone="green">Saved</Badge>}
              {dirty && <Badge tone="amber">Unsaved changes</Badge>}
              <Button onClick={onSave} loading={saving} disabled={!dirty}>Save</Button>
            </div>
          </CardBody>
        </Card>
      </main>
    </div>
  )
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}
