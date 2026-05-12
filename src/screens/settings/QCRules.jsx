import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSetting } from '../../lib/settings'
import {
  Header, Section, Button, Card, CardHeader, CardBody, CardTitle,
  Badge, EmptyState,
} from '../../ui'
import { DEFAULT_QC_RULES } from '../../lib/defaults'

const LEVELS = [
  { key: 'block', label: 'Block',  hint: 'Must be fixed before finalize',  tone: 'red' },
  { key: 'warn',  label: 'Warn',   hint: 'Yellow banner, allows finalize', tone: 'amber' },
  { key: 'off',   label: 'Off',    hint: 'No check',                       tone: 'neutral' },
]

/**
 * SettingsQCRules — owner-configurable QC rules. Each rule has key, label,
 * level ∈ block|warn|off. Defaults match the recommended sets from Batch 8.
 *
 * Used by the QC engine (Step 16) and the Review screen at finalize time.
 */
export default function SettingsQCRules() {
  const { data, save, loading } = useSetting('qc_rules')
  const [rules, setRules] = useState([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [savedAt, setSavedAt] = useState(null)

  useEffect(() => {
    if (data?.rules) setRules(data.rules)
  }, [data])

  function setLevel(key, level) {
    setRules((arr) => arr.map((r) => r.key === key ? { ...r, level } : r))
    setDirty(true)
  }
  function setAll(level) {
    setRules((arr) => arr.map((r) => ({ ...r, level })))
    setDirty(true)
  }
  function restoreDefaults() {
    if (!confirm('Restore all QC rules to recommended defaults?')) return
    setRules(DEFAULT_QC_RULES)
    setDirty(true)
  }

  async function onSave() {
    setError(null); setSaving(true)
    try {
      await save({ rules })
      setDirty(false)
      setSavedAt(new Date())
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  // Group rules by their default level for cleaner display
  const groups = [
    { level: 'block', label: 'Currently blocking finalization' },
    { level: 'warn',  label: 'Currently warning only' },
    { level: 'off',   label: 'Currently disabled' },
  ]

  return (
    <div className="min-h-screen bg-ink-50">
      <Header breadcrumb={[
        { label: 'Settings', to: '/settings' },
        { label: 'QC rules' },
      ]} />
      <main className="max-w-3xl mx-auto p-4 sm:p-6 pb-24 space-y-5">

        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-danger rounded p-3 text-sm">
            {error}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>QC rules</CardTitle>
            <p className="text-sm text-ink-600 mt-1">
              Each rule runs against a job at finalize time. Set the level to control how it behaves:
            </p>
            <ul className="text-sm text-ink-700 mt-2 space-y-1">
              <li className="flex items-center gap-2"><Badge tone="red">Block</Badge> Job cannot be finalized until fixed.</li>
              <li className="flex items-center gap-2"><Badge tone="amber">Warn</Badge> Banner shown, but finalize is allowed.</li>
              <li className="flex items-center gap-2"><Badge tone="neutral">Off</Badge> Rule is disabled — won't be checked.</li>
            </ul>
          </CardHeader>
          <CardBody>
            {loading ? (
              <p className="text-ink-500 text-sm">Loading…</p>
            ) : rules.length === 0 ? (
              <EmptyState
                title="No QC rules"
                body="Click 'Restore defaults' to load the recommended rule set."
                action={<Button onClick={restoreDefaults}>Restore defaults</Button>}
              />
            ) : (
              <div className="space-y-5">
                {groups.map(({ level, label }) => {
                  const groupRules = rules.filter((r) => r.level === level)
                  if (groupRules.length === 0) return null
                  return (
                    <div key={level}>
                      <h3 className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2">{label}</h3>
                      <ul className="space-y-2">
                        {groupRules.map((r) => (
                          <RuleRow key={r.key} rule={r} onChange={setLevel} />
                        ))}
                      </ul>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-4 mt-4 border-t border-ink-200">
              <Button onClick={() => setAll('block')} variant="ghost" size="sm">All Block</Button>
              <Button onClick={() => setAll('warn')}  variant="ghost" size="sm">All Warn</Button>
              <Button onClick={() => setAll('off')}   variant="ghost" size="sm">All Off</Button>
              <Button onClick={restoreDefaults} variant="ghost" size="sm">Restore defaults</Button>
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

function RuleRow({ rule, onChange }) {
  return (
    <li className="bg-white border border-ink-200 rounded p-3 flex items-center gap-3 flex-wrap">
      <div className="flex-1 min-w-[200px]">
        <p className="text-sm font-semibold text-ink-900">{rule.label}</p>
        <p className="text-xs text-ink-500 font-mono">{rule.key}</p>
      </div>
      <div className="flex gap-1 shrink-0" role="radiogroup" aria-label={`Level for ${rule.label}`}>
        {LEVELS.map((l) => {
          const selected = rule.level === l.key
          const toneClass = selected ? selectedClass(l.tone) : 'bg-white text-ink-700 border-ink-300 hover:bg-ink-100'
          return (
            <button
              key={l.key}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(rule.key, l.key)}
              className={`px-3 h-9 rounded border text-sm font-semibold transition-colors ${toneClass}`}
              title={l.hint}
            >
              {l.label}
            </button>
          )
        })}
      </div>
    </li>
  )
}

function selectedClass(tone) {
  switch (tone) {
    case 'red':    return 'bg-danger text-white border-danger'
    case 'amber':  return 'bg-amber-500 text-white border-amber-600'
    case 'neutral':
    default:       return 'bg-ink-700 text-white border-ink-700'
  }
}
