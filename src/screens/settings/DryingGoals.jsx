import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSetting } from '../../lib/settings'
import {
  Header, Section, Button, Card, CardHeader, CardBody, CardTitle,
  Input, Select, Badge, EmptyState,
} from '../../ui'
import { DEFAULT_DRYING_GOALS } from '../../lib/defaults'

/**
 * SettingsDryingGoals — Owner-editable drying goals per material.
 *
 * Defaults are IICRC-aligned but most regions need overrides. Goals here are
 * used as the auto-fill source on the Add Reading form. Each reading still
 * snapshots the goal at capture time, so changes here don't retroactively
 * affect past readings.
 */
export default function SettingsDryingGoals() {
  const { data, save, refresh, loading: settingLoading } = useSetting('material_drying_goals')
  const materials = useSetting('materials')

  const [items, setItems] = useState([])  // [{ material_key, goal_pct, unit }]
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
    setItems((arr) => [...arr, { material_key: '', goal_pct: '' }])
    setDirty(true)
  }
  function restoreDefaults() {
    if (!confirm('Replace all drying goals with the IICRC defaults? Your current values will be lost.')) return
    setItems([...DEFAULT_DRYING_GOALS])
    setDirty(true)
  }

  async function onSave() {
    setError(null); setSaving(true)
    try {
      // Strip empty rows, normalize numbers
      const clean = items
        .filter((r) => r.material_key && r.goal_pct !== '' && r.goal_pct != null)
        .map((r) => ({
          material_key: r.material_key,
          goal_pct: Number(r.goal_pct),
          ...(r.unit ? { unit: r.unit } : {}),
        }))
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

  // Materials options for the dropdowns — keep all available (don't filter
  // already-used ones; user might want to override before deleting old)
  const materialOptions = (materials.data?.items ?? []).map((m) => ({ key: m.key, label: m.label }))

  return (
    <div className="min-h-screen bg-ink-50">
      <Header breadcrumb={[
        { label: 'Settings', to: '/settings' },
        { label: 'Drying goals' },
      ]} />
      <main className="max-w-3xl mx-auto p-4 sm:p-6 pb-24 space-y-5">

        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-danger rounded p-3 text-sm">
            {error}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Material drying goals</CardTitle>
            <p className="text-sm text-ink-600 mt-1">
              Used as the default goal when capturing a reading for that material. PMs can still
              override on a per-reading basis. Goals shipped as IICRC-aligned defaults — adjust
              for your region (e.g. North Dakota winter values).
            </p>
          </CardHeader>
          <CardBody>
            {settingLoading ? (
              <p className="text-ink-500 text-sm">Loading…</p>
            ) : items.length === 0 ? (
              <EmptyState
                title="No drying goals set"
                body="Add the materials you most commonly track, with the value where you consider them dry."
                action={<Button onClick={addRow}>+ Add material</Button>}
              />
            ) : (
              <ul className="space-y-2">
                {items.map((row, idx) => (
                  <li key={idx} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-12 sm:col-span-6">
                      <Select
                        label={idx === 0 ? 'Material' : null}
                        placeholder="Pick a material…"
                        value={row.material_key}
                        onChange={(e) => setRow(idx, { material_key: e.target.value })}
                        options={materialOptions}
                      />
                    </div>
                    <div className="col-span-7 sm:col-span-3">
                      <Input
                        label={idx === 0 ? 'Goal value' : null}
                        type="number"
                        step="0.1"
                        inputMode="decimal"
                        value={row.goal_pct ?? ''}
                        onChange={(e) => setRow(idx, { goal_pct: e.target.value })}
                      />
                    </div>
                    <div className="col-span-3 sm:col-span-2">
                      <Input
                        label={idx === 0 ? 'Unit' : null}
                        placeholder="%WME"
                        value={row.unit ?? ''}
                        onChange={(e) => setRow(idx, { unit: e.target.value })}
                      />
                    </div>
                    <div className="col-span-2 sm:col-span-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => removeRow(idx)}
                        className="h-11 w-11 rounded text-danger hover:bg-red-50 text-xl"
                        aria-label="Remove row"
                      >
                        ×
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap gap-2 pt-4 mt-4 border-t border-ink-200">
              <Button onClick={addRow} variant="secondary">+ Add material</Button>
              <Button onClick={restoreDefaults} variant="ghost">Restore IICRC defaults</Button>
              <div className="flex-1" />
              {savedAt && !dirty && <Badge tone="green">Saved</Badge>}
              {dirty && <Badge tone="amber">Unsaved changes</Badge>}
              <Button onClick={onSave} loading={saving} disabled={!dirty}>Save</Button>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>How drying goals work</CardTitle></CardHeader>
          <CardBody className="text-sm text-ink-700 space-y-2">
            <p>When a PM adds a reading, the goal is set in one of three ways:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>From settings</strong> — value pulled from this list (the default). The reading shows an "auto" badge.</li>
              <li><strong>Manual entry</strong> — PM types a custom goal for that reading. Reading shows a "manual" badge.</li>
              <li><strong>From reference reading</strong> — PM picks an unaffected baseline reading; its value becomes the goal. Reading shows a "reference" badge.</li>
            </ul>
            <p>
              Each reading snapshots its goal at capture time, so editing this list later doesn't
              change past readings.
            </p>
          </CardBody>
        </Card>
      </main>
    </div>
  )
}
