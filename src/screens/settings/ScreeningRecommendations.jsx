import { useEffect, useState, useMemo } from 'react'
import { useSetting } from '../../lib/settings'
import {
  Header, Section, Button, Card, CardHeader, CardBody, CardTitle,
  Input, Select, EmptyState, Badge,
} from '../../ui'

/**
 * SettingsScreeningRecommendations — manages the quick-pick library used
 * on the screening Recommendations step.
 *
 * Each item has:
 *   - key (slug, used as React key)
 *   - category (Sampling / Source / Remediation / Health / Clearance / Custom)
 *   - text (the recommendation; may include {{room}} as a placeholder)
 *
 * Owner-only; gated at the route level.
 */
export default function SettingsScreeningRecommendations() {
  const recsSetting = useSetting('screening_recommendations')
  const [editedItems, setEditedItems] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [savingState, setSavingState] = useState('idle')
  const [error, setError] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [newItem, setNewItem] = useState({ category: 'Sampling', text: '' })
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (recsSetting.data?.items && editedItems === null) {
      setEditedItems(recsSetting.data.items)
    }
  }, [recsSetting.data, editedItems])

  const items = editedItems ?? []
  const filtered = useMemo(() => {
    if (!search) return items
    const s = search.toLowerCase()
    return items.filter((it) => it.text.toLowerCase().includes(s) || it.category.toLowerCase().includes(s))
  }, [items, search])

  // Group by category
  const grouped = useMemo(() => {
    const m = new Map()
    for (const it of filtered) {
      if (!m.has(it.category)) m.set(it.category, [])
      m.get(it.category).push(it)
    }
    return m
  }, [filtered])

  async function save() {
    if (!editedItems) return
    setSavingState('saving'); setError(null)
    const ok = await recsSetting.save({ items: editedItems })
    if (ok) {
      setSavingState('saved')
      setDirty(false)
      setTimeout(() => setSavingState('idle'), 1500)
    } else {
      setSavingState('error')
      setError(recsSetting.error || 'Save failed')
    }
  }

  function updateText(idx, newText) {
    setEditedItems((arr) => arr.map((it, i) => i === idx ? { ...it, text: newText } : it))
    setDirty(true)
  }

  function updateCategory(idx, newCat) {
    setEditedItems((arr) => arr.map((it, i) => i === idx ? { ...it, category: newCat } : it))
    setDirty(true)
  }

  function removeItem(idx) {
    const target = items[idx]
    if (!confirm(`Remove this recommendation?\n\n"${target.text.slice(0, 100)}..."`)) return
    setEditedItems((arr) => arr.filter((_, i) => i !== idx))
    setDirty(true)
  }

  function addItem() {
    if (!newItem.text.trim()) { setError('Recommendation text is required.'); return }
    setError(null)
    const key = `custom_${Date.now()}`
    setEditedItems((arr) => [...arr, { key, category: newItem.category, text: newItem.text.trim() }])
    setDirty(true)
    setNewItem({ category: 'Sampling', text: '' })
    setShowAdd(false)
  }

  function restoreDefaults() {
    if (!confirm('Restore the default recommendations list?\n\nYour custom items will be removed.')) return
    // Trigger a reload from defaults by setting items to the factory output
    import('../../lib/defaults').then((mod) => {
      setEditedItems(mod.DEFAULT_SCREENING_RECOMMENDATIONS)
      setDirty(true)
    })
  }

  return (
    <div className="min-h-screen bg-ink-50">
      <Header breadcrumb={[
        { label: 'Settings', to: '/settings' },
        { label: 'Mold Screening Recommendations' },
      ]} />
      <main className="max-w-4xl mx-auto p-4 sm:p-6 pb-24 space-y-5">
        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-danger rounded p-3 text-sm">
            {error}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Mold Screening Recommendations</CardTitle>
            <p className="text-sm text-ink-600 mt-1">
              These are the quick-pick recommendations available during the screening Recommendations step.
              Use <code className="bg-ink-100 px-1 rounded text-xs">{'{{room}}'}</code> as a placeholder for
              room names — the report will swap in the actual room when applied.
            </p>
          </CardHeader>
          <CardBody className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Input
                placeholder="Search recommendations…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 min-w-[200px]"
              />
              <Button onClick={() => setShowAdd(!showAdd)} variant="secondary">
                {showAdd ? 'Cancel' : '+ Add recommendation'}
              </Button>
              <Button onClick={restoreDefaults} variant="ghost">Restore defaults</Button>
              <Button onClick={save} loading={savingState === 'saving'} disabled={!dirty}>
                {savingState === 'saved' ? '✓ Saved' : 'Save changes'}
              </Button>
            </div>

            {showAdd && (
              <div className="bg-ink-50 border border-ink-200 rounded p-3 space-y-2">
                <Select
                  label="Category"
                  value={newItem.category}
                  onChange={(e) => setNewItem((n) => ({ ...n, category: e.target.value }))}
                  options={CATEGORY_OPTIONS}
                />
                <Input
                  label="Recommendation text"
                  placeholder="e.g. Recommend air sampling in {{room}} to confirm spore levels."
                  value={newItem.text}
                  onChange={(e) => setNewItem((n) => ({ ...n, text: e.target.value }))}
                />
                <div className="flex gap-2">
                  <Button onClick={addItem} size="sm">Add to library</Button>
                  <Button onClick={() => { setShowAdd(false); setNewItem({ category: 'Sampling', text: '' }) }} size="sm" variant="ghost">Cancel</Button>
                </div>
              </div>
            )}
          </CardBody>
        </Card>

        {recsSetting.loading || editedItems === null ? (
          <p className="text-ink-500 text-sm">Loading…</p>
        ) : grouped.size === 0 ? (
          <EmptyState
            title="No recommendations"
            body={search ? 'Try a different search term.' : 'Tap "+ Add recommendation" to create one, or "Restore defaults" to start from the standard list.'}
          />
        ) : (
          <div className="space-y-4">
            {[...grouped.entries()].map(([cat, list]) => (
              <Section key={cat} title={cat}>
                <ul className="space-y-2">
                  {list.map((it) => {
                    const realIdx = items.indexOf(it)
                    return (
                      <li key={it.key} className="bg-white border border-ink-200 rounded p-3 flex items-start gap-2 flex-wrap">
                        <div className="flex-1 min-w-[240px]">
                          <textarea
                            value={it.text}
                            onChange={(e) => updateText(realIdx, e.target.value)}
                            rows={2}
                            className="w-full px-2 py-1.5 border border-ink-300 rounded text-sm leading-snug resize-y"
                          />
                          <Select
                            value={it.category}
                            onChange={(e) => updateCategory(realIdx, e.target.value)}
                            options={CATEGORY_OPTIONS}
                            className="mt-2"
                          />
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => removeItem(realIdx)}>Remove</Button>
                      </li>
                    )
                  })}
                </ul>
              </Section>
            ))}
          </div>
        )}

        {dirty && (
          <div className="sticky bottom-4 bg-amber-50 border border-amber-200 rounded p-3 text-sm flex items-center justify-between gap-2">
            <span className="text-amber-800">Unsaved changes</span>
            <Button onClick={save} size="sm" loading={savingState === 'saving'}>Save now</Button>
          </div>
        )}
      </main>
    </div>
  )
}

const CATEGORY_OPTIONS = [
  { key: 'Sampling',    label: 'Sampling' },
  { key: 'Source',      label: 'Source / Cause' },
  { key: 'Remediation', label: 'Remediation' },
  { key: 'Health',      label: 'Health / Occupancy' },
  { key: 'Clearance',   label: 'Clearance / No Action' },
  { key: 'Custom',      label: 'Custom' },
]
