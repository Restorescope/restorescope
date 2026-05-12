import { useEffect, useState, useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth.jsx'
import { useSetting } from '../../lib/settings'
import {
  Header, BottomNav, Section, Button, Card, CardHeader, CardBody, CardTitle,
  Textarea, Select, Badge, EmptyState,
} from '../../ui'

/**
 * ScreeningRecommendations — choose recommendations for the screening report.
 *
 * Three ways to populate:
 *   1. Quick-pick — tap a button from Settings → Screening Recommendations.
 *      If the rec includes {{room}}, prompt for which room to apply.
 *   2. AI generate — calls the Supabase Edge Function which uses Anthropic
 *      Claude to write IICRC-aligned recommendations based on the screening
 *      data. User reviews and can edit.
 *   3. Free-text — just type into the textarea.
 *
 * All approaches produce a single text body (one recommendation per line)
 * that the report PDF renders as a bulleted list.
 */
export default function ScreeningRecommendationsScreen() {
  const { id: jobId } = useParams()
  const { profile } = useAuth()
  const quickPicks = useSetting('screening_recommendations')

  const [job, setJob] = useState(null)
  const [inspection, setInspection] = useState(null)
  const [alerts, setAlerts] = useState([])
  const [samples, setSamples] = useState([])
  const [rooms, setRooms] = useState([])
  const [text, setText] = useState('')
  const [originalText, setOriginalText] = useState('')
  const [generatedBy, setGeneratedBy] = useState('manual')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [aiRunning, setAIRunning] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [roomPickerOpen, setRoomPickerOpen] = useState(null) // holds pending {{room}} rec text
  const [savedAt, setSavedAt] = useState(null)

  // Load all the data
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true); setError(null)
      const [jobRes, inspRes, alertRes, sampleRes, roomsRes] = await Promise.all([
        supabase.from('jobs').select('id, job_number, customer').eq('id', jobId).maybeSingle(),
        supabase.from('screening_inspections').select('*').eq('job_id', jobId).maybeSingle(),
        supabase.from('screening_alerts').select('*').eq('job_id', jobId).order('display_order'),
        supabase.from('screening_samples').select('*').eq('job_id', jobId),
        supabase.from('affected_rooms').select('id, room_name').eq('job_id', jobId),
      ])
      if (cancelled) return
      if (jobRes.error || !jobRes.data) { setError(jobRes.error?.message || 'Job not found'); setLoading(false); return }
      setJob(jobRes.data)
      if (!inspRes.data) { setError('No screening started for this job.'); setLoading(false); return }
      setInspection(inspRes.data)
      setAlerts(alertRes.data || [])
      setSamples(sampleRes.data || [])
      setRooms(roomsRes.data || [])
      setText(inspRes.data.recommendations_text || '')
      setOriginalText(inspRes.data.recommendations_text || '')
      setGeneratedBy(inspRes.data.recommendations_generated_by || 'manual')
      setSavedAt(inspRes.data.recommendations_updated_at)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [jobId])

  const dirty = text !== originalText
  const picks = quickPicks.data?.items ?? []

  // Group quick-picks by category
  const grouped = useMemo(() => {
    const filtered = categoryFilter === 'all' ? picks : picks.filter((p) => p.category === categoryFilter)
    const m = new Map()
    for (const p of filtered) {
      if (!m.has(p.category)) m.set(p.category, [])
      m.get(p.category).push(p)
    }
    return m
  }, [picks, categoryFilter])

  function appendLine(line) {
    if (!line) return
    setText((cur) => {
      const trimmed = cur.replace(/\s+$/, '')
      if (!trimmed) return line
      return `${trimmed}\n${line}`
    })
  }

  function applyQuickPick(pick) {
    // If the pick references {{room}}, prompt the user to pick a room first
    if (pick.text.includes('{{room}}')) {
      if (rooms.length === 0) {
        // No rooms yet — append with a placeholder note and let user edit
        appendLine(pick.text.replace(/\{\{room\}\}/g, '[room name]'))
      } else {
        setRoomPickerOpen({ pick })
      }
      return
    }
    appendLine(pick.text)
  }

  function applyQuickPickToRoom(pick, roomName) {
    const line = pick.text.replace(/\{\{room\}\}/g, roomName)
    appendLine(line)
    setRoomPickerOpen(null)
  }

  async function generateAI() {
    setAIRunning(true); setError(null)
    try {
      // Build minimal payload — strip metadata we don't need server-side
      const payload = {
        intake: {
          reason_for_screening: inspection.reason_for_screening,
          customer_concerns:    inspection.customer_concerns,
          reported_history:     inspection.reported_history,
          scope:                inspection.scope,
        },
        alerts: alerts.map((a) => ({
          room_name:               a.room_name,
          alert_strength:          a.alert_strength,
          alert_location:          a.alert_location,
          visible_signs:           a.visible_signs,
          moisture_value:          a.moisture_value,
          moisture_unit:           a.moisture_unit,
          thermal_observation:     a.thermal_observation,
          wall_cavity_test_result: a.wall_cavity_test_result,
          notes:                   a.notes,
        })),
        samples: samples.map((s) => ({
          sample_id_label: s.sample_id_label,
          sample_type:     s.sample_type,
          location_label:  s.location_label,
          status:          s.status,
          result_summary:  s.result_summary,
          result_notes:    s.result_notes,
        })),
      }

      const { data, error: err } = await supabase.functions.invoke('generate-screening-recommendations', {
        body: payload,
      })
      if (err) throw err
      if (data?.error) throw new Error(data.error)
      const generated = (data?.recommendations || '').trim()
      if (!generated) throw new Error('AI returned an empty response. Try again or write recommendations manually.')

      // Replace or append — confirm with user
      if (text.trim()) {
        const choice = confirm('Replace your current recommendations with the AI-generated ones?\n\nOK = replace · Cancel = append below existing')
        if (choice) {
          setText(generated)
          setGeneratedBy('ai')
        } else {
          setText((cur) => `${cur.replace(/\s+$/, '')}\n\n${generated}`)
          setGeneratedBy('mixed')
        }
      } else {
        setText(generated)
        setGeneratedBy('ai')
      }
    } catch (e) {
      setError(`AI generation failed: ${e.message}`)
    } finally {
      setAIRunning(false)
    }
  }

  async function save() {
    setSaving(true); setError(null)
    try {
      // Determine generated_by: if user has edited AI output, mark as 'mixed'
      let finalGenBy = generatedBy
      if (generatedBy === 'ai' && text !== originalText && originalText) {
        finalGenBy = 'mixed'
      } else if (generatedBy === 'manual' && text.trim()) {
        finalGenBy = 'manual'
      }
      const { error: err } = await supabase
        .from('screening_inspections')
        .update({
          recommendations_text: text,
          recommendations_generated_by: finalGenBy,
          recommendations_updated_at: new Date().toISOString(),
        })
        .eq('id', inspection.id)
      if (err) throw err
      setOriginalText(text)
      setGeneratedBy(finalGenBy)
      setSavedAt(new Date().toISOString())
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
          { label: 'Job', to: `/jobs/${jobId}` },
          { label: 'Screening', to: `/jobs/${jobId}/screening` },
          { label: 'Recommendations' },
        ]} />
        <main className="max-w-4xl mx-auto p-4 sm:p-6 text-ink-500">Loading…</main>
      </div>
    )
  }

  if (error && !inspection) {
    return (
      <div className="min-h-screen bg-ink-50">
        <Header breadcrumb={[{ label: 'Jobs', to: '/jobs' }, { label: 'Recommendations' }]} />
        <main className="max-w-4xl mx-auto p-4 sm:p-6 space-y-3">
          <div role="alert" className="bg-red-50 border border-red-200 text-danger rounded p-3 text-sm">{error}</div>
          <Link to={`/jobs/${jobId}/screening`}>
            <Button variant="secondary">← Back to Screening</Button>
          </Link>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-ink-50">
      <Header breadcrumb={[
        { label: 'Jobs', to: '/jobs' },
        { label: job?.job_number || 'Job', to: `/jobs/${jobId}` },
        { label: 'Screening', to: `/jobs/${jobId}/screening` },
        { label: 'Recommendations' },
      ]} />

      <main className="max-w-4xl mx-auto p-4 sm:p-6 pb-24 space-y-4">
        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-danger rounded p-3 text-sm">
            {error}
          </div>
        )}

        {/* Editor + AI generate */}
        <Card accent="blue">
          <CardHeader>
            <CardTitle>Recommendations for the report</CardTitle>
            <p className="text-sm text-ink-600 mt-1">
              These appear on the screening report's recommendations page. Use quick-picks below,
              generate with AI, or write your own. One recommendation per line.
            </p>
          </CardHeader>
          <CardBody className="space-y-3">
            <Textarea
              rows={10}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Recommendations will appear here. One per line."
              className="font-mono"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={save} loading={saving} disabled={!dirty}>
                {dirty ? 'Save recommendations' : '✓ Saved'}
              </Button>
              <Button onClick={generateAI} loading={aiRunning} variant="accent">
                ✨ Generate with AI
              </Button>
              {generatedBy === 'ai' && !dirty && (
                <Badge tone="blue">AI-generated · review before sending</Badge>
              )}
              {generatedBy === 'mixed' && !dirty && (
                <Badge tone="amber">Mixed (AI + edits)</Badge>
              )}
              {savedAt && !dirty && (
                <span className="text-xs text-ink-500">
                  Last saved {new Date(savedAt).toLocaleString()}
                </span>
              )}
            </div>
            <p className="text-xs text-ink-500">
              AI uses the screening data (alerts, samples, intake) to draft IICRC-aligned recommendations
              in plain language. Always review before delivering to the customer.
            </p>
          </CardBody>
        </Card>

        {/* Quick-pick library */}
        <Section
          title="Quick-pick library"
          description="Tap any item to append it to the recommendations above. Items with {{room}} will prompt you to pick a room."
          action={(
            <Select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              options={[
                { key: 'all',         label: 'All categories' },
                { key: 'Sampling',    label: 'Sampling' },
                { key: 'Source',      label: 'Source / Cause' },
                { key: 'Remediation', label: 'Remediation' },
                { key: 'Health',      label: 'Health / Occupancy' },
                { key: 'Clearance',   label: 'Clearance / No Action' },
                { key: 'Custom',      label: 'Custom' },
              ]}
            />
          )}
        >
          {quickPicks.loading ? (
            <p className="text-ink-500 text-sm">Loading quick-picks…</p>
          ) : grouped.size === 0 ? (
            <EmptyState
              title="No quick-picks"
              body="Go to Settings → Screening recommendations to add some."
            />
          ) : (
            <div className="space-y-3">
              {[...grouped.entries()].map(([cat, items]) => (
                <div key={cat}>
                  <p className="text-xs font-semibold uppercase text-ink-600 mb-2">{cat}</p>
                  <ul className="grid sm:grid-cols-2 gap-2">
                    {items.map((p) => (
                      <li key={p.key}>
                        <button
                          type="button"
                          onClick={() => applyQuickPick(p)}
                          className="w-full text-left bg-white border border-ink-200 rounded p-2.5 hover:bg-blue-50 hover:border-brand-blue transition-colors"
                        >
                          <span className="text-sm text-ink-800 leading-snug block">{p.text}</span>
                          {p.text.includes('{{room}}') && (
                            <span className="text-xs text-ink-500 italic mt-0.5 block">prompts for room</span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Section>

        {roomPickerOpen && (
          <RoomPicker
            rooms={rooms}
            onPick={(roomName) => applyQuickPickToRoom(roomPickerOpen.pick, roomName)}
            onCancel={() => setRoomPickerOpen(null)}
            pickText={roomPickerOpen.pick.text}
          />
        )}

        <div className="flex justify-between flex-wrap gap-2">
          <Link to={`/jobs/${jobId}/screening`}>
            <Button variant="secondary">← Back to Screening</Button>
          </Link>
          <Link to={`/jobs/${jobId}/screening/report`}>
            <Button>Continue to Report →</Button>
          </Link>
        </div>
      </main>

      <BottomNav jobId={jobId} />
    </div>
  )
}

// ============================================================================
// RoomPicker modal — prompts for room when quick-pick has {{room}}
// ============================================================================
function RoomPicker({ rooms, onPick, onCancel, pickText }) {
  const [customRoom, setCustomRoom] = useState('')

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full p-4 space-y-3">
        <h3 className="font-condensed font-bold text-brand-blue text-lg tracking-wide">Pick a room</h3>
        <p className="text-xs text-ink-600 italic">
          "{pickText}"
        </p>
        <p className="text-sm text-ink-700">Which room should this recommendation reference?</p>
        <ul className="space-y-1 max-h-64 overflow-y-auto">
          {rooms.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onPick(r.room_name)}
                className="w-full text-left bg-ink-50 hover:bg-blue-50 px-3 py-2 rounded border border-ink-200 text-sm"
              >
                {r.room_name}
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t border-ink-200 pt-3">
          <p className="text-xs text-ink-500 mb-1">Or type a custom room name:</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={customRoom}
              onChange={(e) => setCustomRoom(e.target.value)}
              placeholder="e.g. Master Bath"
              className="flex-1 px-2 py-1.5 border border-ink-300 rounded text-sm"
            />
            <Button size="sm" onClick={() => customRoom.trim() && onPick(customRoom.trim())}>Use</Button>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    </div>
  )
}
