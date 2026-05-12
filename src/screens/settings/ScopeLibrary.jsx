import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSetting } from '../../lib/settings'
import {
  Header, Section, Button, Card, CardHeader, CardBody, CardTitle,
  Input, Textarea, Badge, EmptyState,
} from '../../ui'
import { DEFAULT_SCOPE_LIBRARY } from '../../lib/defaults'

/**
 * SettingsScopeLibrary — each item has key, label, reasons[].
 * Each reason has key + text. Used by the Scope screen's reason picker.
 *
 * Layout:
 *   - Cards per scope item, expandable to show its reasons
 *   - Inside each, list of reason templates with edit-in-place
 *   - Add/remove reasons; add/remove items; reorder items
 */
export default function SettingsScopeLibrary() {
  const { data, save, loading } = useSetting('scope_library')
  const [items, setItems] = useState([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [savedAt, setSavedAt] = useState(null)
  const [expandedKey, setExpandedKey] = useState(null)

  useEffect(() => {
    if (data?.items) setItems(data.items)
  }, [data])

  function setItem(idx, patch) {
    setItems((arr) => arr.map((it, i) => i === idx ? { ...it, ...patch } : it))
    setDirty(true)
  }
  function removeItem(idx) {
    if (!confirm('Remove this scope item and all its reason templates?')) return
    setItems((arr) => arr.filter((_, i) => i !== idx))
    setDirty(true)
  }
  function addItem() {
    const next = { key: '', label: '', reasons: [] }
    setItems((arr) => [...arr, next])
    setExpandedKey('__new__' + Date.now())
    setDirty(true)
  }
  function moveItem(idx, dir) {
    setItems((arr) => {
      const j = idx + dir
      if (j < 0 || j >= arr.length) return arr
      const next = [...arr]
      ;[next[idx], next[j]] = [next[j], next[idx]]
      return next
    })
    setDirty(true)
  }

  function setReason(itemIdx, reasonIdx, patch) {
    setItems((arr) => arr.map((it, i) => {
      if (i !== itemIdx) return it
      const reasons = (it.reasons ?? []).map((r, j) => j === reasonIdx ? { ...r, ...patch } : r)
      return { ...it, reasons }
    }))
    setDirty(true)
  }
  function addReason(itemIdx) {
    setItems((arr) => arr.map((it, i) => {
      if (i !== itemIdx) return it
      const reasons = [...(it.reasons ?? []), { key: '', text: '' }]
      return { ...it, reasons }
    }))
    setDirty(true)
  }
  function removeReason(itemIdx, reasonIdx) {
    setItems((arr) => arr.map((it, i) => {
      if (i !== itemIdx) return it
      const reasons = (it.reasons ?? []).filter((_, j) => j !== reasonIdx)
      return { ...it, reasons }
    }))
    setDirty(true)
  }
  function moveReason(itemIdx, reasonIdx, dir) {
    setItems((arr) => arr.map((it, i) => {
      if (i !== itemIdx) return it
      const reasons = [...(it.reasons ?? [])]
      const j = reasonIdx + dir
      if (j < 0 || j >= reasons.length) return it
      ;[reasons[reasonIdx], reasons[j]] = [reasons[j], reasons[reasonIdx]]
      return { ...it, reasons }
    }))
    setDirty(true)
  }

  function restoreDefaults() {
    if (!confirm('Replace the entire scope library with defaults? Custom items and reasons will be lost.')) return
    setItems(DEFAULT_SCOPE_LIBRARY)
    setDirty(true)
  }

  async function onSave() {
    setError(null); setSaving(true)
    try {
      const seenKeys = new Set()
      const clean = items
        .filter((it) => (it.label ?? '').trim().length > 0)
        .map((it) => {
          let key = (it.key ?? '').trim() || slug(it.label)
          if (seenKeys.has(key)) {
            let i = 2
            while (seenKeys.has(`${key}_${i}`)) i++
            key = `${key}_${i}`
          }
          seenKeys.add(key)

          const seenReasonKeys = new Set()
          const reasons = (it.reasons ?? [])
            .filter((r) => (r.text ?? '').trim().length > 0)
            .map((r) => {
              let rk = (r.key ?? '').trim() || slug(r.text.split(/\s+/).slice(0, 4).join('_'))
              if (seenReasonKeys.has(rk)) {
                let i = 2
                while (seenReasonKeys.has(`${rk}_${i}`)) i++
                rk = `${rk}_${i}`
              }
              seenReasonKeys.add(rk)
              return { key: rk, text: r.text.trim() }
            })

          return { key, label: it.label.trim(), reasons }
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
        { label: 'Scope library' },
      ]} />
      <main className="max-w-3xl mx-auto p-4 sm:p-6 pb-24 space-y-5">

        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-danger rounded p-3 text-sm">
            {error}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Scope library</CardTitle>
            <p className="text-sm text-ink-600 mt-1">
              Each scope item maps to one or more reason templates. PMs pick a template (or write
              custom) when adding a scope item to a job. Wording flows directly into the final
              report's Scope Justification section.
            </p>
            <p className="text-xs text-ink-500 mt-2">
              <strong>Tone guidance:</strong> Professional, factual, adjuster-friendly, IICRC-aligned.
              Avoid words like "destroyed", "ruined", "catastrophic", "must", "failure to", or any legal threat language.
            </p>
          </CardHeader>
          <CardBody>
            {loading ? (
              <p className="text-ink-500 text-sm">Loading…</p>
            ) : items.length === 0 ? (
              <EmptyState
                title="No scope items yet"
                body="Add the actions you take on jobs (Remove drywall, Containment, Antimicrobial, etc.) along with reusable reason wording for each."
                action={<Button onClick={addItem}>+ Add scope item</Button>}
              />
            ) : (
              <ul className="space-y-3">
                {items.map((it, idx) => {
                  const itemKey = it.key || `__idx_${idx}__`
                  const expanded = expandedKey === itemKey
                  return (
                    <li key={idx} className="border border-ink-200 rounded">
                      <div className="flex items-center gap-2 p-3">
                        <span className="text-xs text-ink-400 font-mono w-6 text-right shrink-0">{idx + 1}</span>
                        <div className="flex-1 min-w-0">
                          <Input
                            placeholder="Scope item name (e.g. Remove drywall / flood cut)"
                            value={it.label ?? ''}
                            onChange={(e) => setItem(idx, { label: e.target.value })}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => setExpandedKey(expanded ? null : itemKey)}
                          className="h-9 px-2.5 rounded text-sm text-ink-700 hover:bg-ink-100 shrink-0"
                          aria-expanded={expanded}
                        >
                          {expanded ? 'Hide' : 'Reasons'} ({(it.reasons ?? []).length})
                        </button>
                        <button type="button" onClick={() => moveItem(idx, -1)} disabled={idx === 0}
                          className="h-9 w-9 rounded text-ink-500 hover:bg-ink-100 disabled:opacity-30" aria-label="Move up">↑</button>
                        <button type="button" onClick={() => moveItem(idx, +1)} disabled={idx === items.length - 1}
                          className="h-9 w-9 rounded text-ink-500 hover:bg-ink-100 disabled:opacity-30" aria-label="Move down">↓</button>
                        <button type="button" onClick={() => removeItem(idx)}
                          className="h-9 w-9 rounded text-danger hover:bg-red-50 text-xl" aria-label="Remove">×</button>
                      </div>

                      {expanded && (
                        <div className="border-t border-ink-200 bg-ink-50 p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-ink-700 uppercase tracking-wide">
                              Reason templates
                            </span>
                            <Button size="sm" variant="secondary" onClick={() => addReason(idx)}>
                              + Add reason
                            </Button>
                          </div>
                          {(it.reasons ?? []).length === 0 ? (
                            <p className="text-xs text-ink-500 italic">
                              No reasons yet. Without at least one reason template, PMs will need to type a custom one every time.
                            </p>
                          ) : (
                            <ul className="space-y-2">
                              {(it.reasons ?? []).map((r, rIdx) => (
                                <li key={rIdx} className="bg-white border border-ink-200 rounded p-2 flex gap-2">
                                  <div className="flex-1 space-y-1.5">
                                    <Input
                                      placeholder="Short key (e.g. flood_cut, non_salvageable)"
                                      value={r.key ?? ''}
                                      onChange={(e) => setReason(idx, rIdx, { key: e.target.value })}
                                    />
                                    <Textarea
                                      rows={2}
                                      placeholder="Reason text (this exact wording appears in the report)"
                                      value={r.text ?? ''}
                                      onChange={(e) => setReason(idx, rIdx, { text: e.target.value })}
                                    />
                                  </div>
                                  <div className="flex flex-col gap-0.5 shrink-0">
                                    <button type="button" onClick={() => moveReason(idx, rIdx, -1)} disabled={rIdx === 0}
                                      className="h-8 w-8 rounded text-ink-500 hover:bg-ink-100 disabled:opacity-30" aria-label="Move up">↑</button>
                                    <button type="button" onClick={() => moveReason(idx, rIdx, +1)} disabled={rIdx === (it.reasons.length - 1)}
                                      className="h-8 w-8 rounded text-ink-500 hover:bg-ink-100 disabled:opacity-30" aria-label="Move down">↓</button>
                                    <button type="button" onClick={() => removeReason(idx, rIdx)}
                                      className="h-8 w-8 rounded text-danger hover:bg-red-50" aria-label="Remove">×</button>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}

            <div className="flex flex-wrap gap-2 pt-4 mt-4 border-t border-ink-200">
              <Button onClick={addItem} variant="secondary">+ Add scope item</Button>
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
