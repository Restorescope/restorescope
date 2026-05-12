import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSetting } from '../../lib/settings'
import {
  Header, Section, Button, Card, CardHeader, CardBody, CardTitle,
  Input, Badge, EmptyState,
} from '../../ui'

/**
 * SimpleListSettings — reusable settings screen for any setting_type whose
 * payload is `{ items: [{ key, label }] }`.
 *
 * Used by: rooms, materials, equipment (and similar). For more complex
 * settings (scope library, qc rules, drying goals, meters with unit arrays)
 * we build dedicated screens.
 *
 * Props:
 *   - settingType    e.g. 'rooms'
 *   - title          page title
 *   - description    page description
 *   - itemNoun       singular noun for buttons ("room", "material")
 *   - defaultsBuilder  () => [{ key, label }]  if user hits "Restore defaults"
 *   - allowKeyEdit   whether to expose the key field (default false)
 */
export default function SimpleListSettings({
  settingType, title, description, itemNoun = 'item',
  defaultsBuilder, allowKeyEdit = false,
}) {
  const { data, save, loading } = useSetting(settingType)
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
    setItems((arr) => [...arr, { key: '', label: '' }])
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
  function restoreDefaults() {
    if (!defaultsBuilder) return
    if (!confirm('Replace the current list with defaults? Custom entries you added will be lost.')) return
    setItems(defaultsBuilder())
    setDirty(true)
  }

  async function onSave() {
    setError(null); setSaving(true)
    try {
      // Auto-generate keys for any rows missing one (from the label)
      const seen = new Set()
      const clean = items
        .filter((r) => (r.label ?? '').trim().length > 0)
        .map((r) => {
          let key = (r.key ?? '').trim() || slug(r.label)
          // Ensure uniqueness within this list
          if (seen.has(key)) {
            let i = 2
            while (seen.has(`${key}_${i}`)) i++
            key = `${key}_${i}`
          }
          seen.add(key)
          return { ...r, key, label: r.label.trim() }
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
        { label: title },
      ]} />
      <main className="max-w-3xl mx-auto p-4 sm:p-6 pb-24 space-y-5">

        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-danger rounded p-3 text-sm">
            {error}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            {description && <p className="text-sm text-ink-600 mt-1">{description}</p>}
          </CardHeader>
          <CardBody>
            {loading ? (
              <p className="text-ink-500 text-sm">Loading…</p>
            ) : items.length === 0 ? (
              <EmptyState
                title={`No ${itemNoun}s yet`}
                body={`Add the ${itemNoun}s you want to appear in dropdowns and pickers.`}
                action={<Button onClick={addRow}>+ Add {itemNoun}</Button>}
              />
            ) : (
              <ul className="space-y-2">
                {items.map((row, idx) => (
                  <li key={idx} className="flex items-center gap-2">
                    <span className="text-xs text-ink-400 font-mono w-6 text-right shrink-0">{idx + 1}</span>
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Input
                        placeholder="Display name"
                        value={row.label ?? ''}
                        onChange={(e) => setRow(idx, { label: e.target.value })}
                      />
                      {allowKeyEdit && (
                        <Input
                          placeholder="Key (auto if blank)"
                          value={row.key ?? ''}
                          onChange={(e) => setRow(idx, { key: e.target.value })}
                        />
                      )}
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => move(idx, -1)}
                        disabled={idx === 0}
                        className="h-9 w-9 rounded text-ink-500 hover:bg-ink-100 disabled:opacity-30"
                        aria-label="Move up"
                      >↑</button>
                      <button
                        type="button"
                        onClick={() => move(idx, +1)}
                        disabled={idx === items.length - 1}
                        className="h-9 w-9 rounded text-ink-500 hover:bg-ink-100 disabled:opacity-30"
                        aria-label="Move down"
                      >↓</button>
                      <button
                        type="button"
                        onClick={() => removeRow(idx)}
                        className="h-9 w-9 rounded text-danger hover:bg-red-50 text-xl"
                        aria-label="Remove"
                      >×</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap gap-2 pt-4 mt-4 border-t border-ink-200">
              <Button onClick={addRow} variant="secondary">+ Add {itemNoun}</Button>
              {defaultsBuilder && (
                <Button onClick={restoreDefaults} variant="ghost">Restore defaults</Button>
              )}
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
