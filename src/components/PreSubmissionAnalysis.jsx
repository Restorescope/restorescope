import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { Card, CardHeader, CardBody, CardTitle, Badge, Button } from '../ui'

/**
 * PreSubmissionAnalysis
 *
 * Shown on the Review screen. Runs AI analysis on the job and displays
 * findings grouped by severity + section.
 *
 * Auto-runs once when the job status is 'ready_for_review' and there's no
 * existing analysis. User can manually re-run anytime via the button.
 *
 * Findings stay internal — they do NOT appear in any customer-facing PDF.
 */
export default function PreSubmissionAnalysis({ jobId, jobStatus, autoRun = false }) {
  const { profile } = useAuth()
  const [run, setRun] = useState(null)         // latest run row
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState(null)
  const [openSections, setOpenSections] = useState({ critical: true, warning: true, pass: false })

  const loadLatest = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const { data, error: err } = await supabase
        .from('pre_submission_runs')
        .select('*')
        .eq('job_id', jobId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (err) throw err
      setRun(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [jobId])

  useEffect(() => { loadLatest() }, [loadLatest])

  // Auto-run logic — only if explicitly requested AND no existing run for this status
  useEffect(() => {
    if (!autoRun) return
    if (loading) return
    if (run) return
    if (jobStatus !== 'ready_for_review') return
    runAnalysis()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun, loading, run, jobStatus])

  async function runAnalysis() {
    setRunning(true); setError(null)
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('pre-submission-analysis', {
        body: { job_id: jobId },
      })
      if (fnErr) throw new Error(fnErr.message)
      if (data?.error) throw new Error(data.error)
      // Reload latest run from DB (the edge function persisted it)
      await loadLatest()
    } catch (e) {
      setError(e.message)
    } finally {
      setRunning(false)
    }
  }

  if (loading) return null

  // Group findings
  const findings = run?.findings || []
  const critical = findings.filter((f) => f.severity === 'critical')
  const warning  = findings.filter((f) => f.severity === 'warning')
  const pass     = findings.filter((f) => f.severity === 'pass')

  return (
    <Card accent="blue">
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle>🤖 Pre-Submission AI Analysis</CardTitle>
          <div className="flex items-center gap-2">
            {run && (
              <span className="text-xs text-ink-500">
                Last run: {new Date(run.created_at).toLocaleString()}
              </span>
            )}
            <Button onClick={runAnalysis} loading={running} variant="accent" size="sm">
              {run ? 'Re-run' : 'Run analysis'}
            </Button>
          </div>
        </div>
        <DisclaimerBlock />
      </CardHeader>
      <CardBody className="space-y-3">
        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-danger rounded p-2 text-sm">
            {error}
          </div>
        )}

        {!run && !running && (
          <div className="text-sm text-ink-600">
            <p>No analysis has been run yet. Click "Run analysis" to have AI review this job for S500 compliance and predict adjuster pushback.</p>
            <p className="text-xs text-ink-500 mt-2">Costs ~$0.10-0.20 per run.</p>
          </div>
        )}

        {running && (
          <p className="text-sm text-ink-600">
            ✨ AI is reviewing the job data… this takes 10-30 seconds.
          </p>
        )}

        {run && (
          <>
            {run.summary && (
              <div className="bg-ink-50 rounded p-3 border border-ink-200">
                <p className="text-xs uppercase tracking-wide text-ink-500 font-semibold mb-1">Summary</p>
                <p className="text-sm text-ink-900">{run.summary}</p>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 text-center">
              <StatPill count={critical.length} label="Critical" tone="red" />
              <StatPill count={warning.length}  label="Warnings" tone="yellow" />
              <StatPill count={pass.length}     label="Passed"   tone="green" />
            </div>

            {critical.length > 0 && (
              <FindingsSection
                title="🔴 Critical — likely claim denial"
                tone="red"
                isOpen={openSections.critical}
                onToggle={() => setOpenSections((s) => ({ ...s, critical: !s.critical }))}
                findings={critical}
              />
            )}
            {warning.length > 0 && (
              <FindingsSection
                title="🟡 Warnings — likely adjuster questions"
                tone="yellow"
                isOpen={openSections.warning}
                onToggle={() => setOpenSections((s) => ({ ...s, warning: !s.warning }))}
                findings={warning}
              />
            )}
            {pass.length > 0 && (
              <FindingsSection
                title="🟢 Passed checks"
                tone="green"
                isOpen={openSections.pass}
                onToggle={() => setOpenSections((s) => ({ ...s, pass: !s.pass }))}
                findings={pass}
              />
            )}
          </>
        )}
      </CardBody>
    </Card>
  )
}

function DisclaimerBlock() {
  return (
    <p className="text-xs text-ink-600 mt-2 bg-yellow-50 border border-yellow-200 rounded p-2">
      <strong>⚠️ Disclaimer:</strong> These are AI suggestions for review by certified professionals, NOT a guarantee of S500 compliance. AI may be wrong. The certified inspector remains responsible for verifying compliance against actual standards and adjuster requirements. AI findings are internal QA only and do not appear in customer or insurance reports.
    </p>
  )
}

function StatPill({ count, label, tone }) {
  const colors = {
    red: 'bg-red-50 border-red-300 text-red-900',
    yellow: 'bg-yellow-50 border-yellow-300 text-yellow-900',
    green: 'bg-green-50 border-green-300 text-green-900',
  }
  return (
    <div className={`rounded border p-2 ${colors[tone]}`}>
      <div className="text-2xl font-bold">{count}</div>
      <div className="text-xs uppercase tracking-wider">{label}</div>
    </div>
  )
}

function FindingsSection({ title, tone, isOpen, onToggle, findings }) {
  const sectionColors = {
    red: 'border-red-200 bg-red-50/30',
    yellow: 'border-yellow-200 bg-yellow-50/30',
    green: 'border-green-200 bg-green-50/30',
  }
  // Group by section
  const sections = {}
  for (const f of findings) {
    const key = f.section || 'overall'
    if (!sections[key]) sections[key] = []
    sections[key].push(f)
  }
  return (
    <div className={`border rounded ${sectionColors[tone]}`}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-2 p-3 hover:bg-black/5 text-left"
      >
        <span className="text-sm font-semibold text-ink-900">{title} ({findings.length})</span>
        <span className="text-ink-400 text-lg">{isOpen ? '▾' : '▸'}</span>
      </button>
      {isOpen && (
        <div className="border-t border-ink-200 p-2 space-y-3">
          {Object.entries(sections).map(([sectionKey, items]) => (
            <div key={sectionKey}>
              <p className="text-xs uppercase tracking-wider text-ink-500 font-semibold mb-1 ml-1">
                {prettySection(sectionKey)}
              </p>
              <div className="space-y-2">
                {items.map((f, idx) => (
                  <FindingRow key={idx} finding={f} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function FindingRow({ finding }) {
  return (
    <div className="bg-white border border-ink-200 rounded p-2">
      <p className="text-sm font-semibold text-ink-900">{finding.title}</p>
      {finding.body && <p className="text-xs text-ink-700 mt-1">{finding.body}</p>}
      {finding.fix && (
        <p className="text-xs text-ink-900 mt-1 italic">
          <strong>Suggested fix:</strong> {finding.fix}
        </p>
      )}
      {finding.reference && (
        <p className="text-[10px] text-ink-500 mt-1 uppercase tracking-wide">
          Ref: {finding.reference}
        </p>
      )}
    </div>
  )
}

function prettySection(key) {
  const map = {
    overall: 'Overall',
    rooms: 'Rooms',
    readings: 'Readings',
    equipment: 'Equipment',
    scope: 'Scope of work',
    photos: 'Photo documentation',
    monitoring: 'Daily monitoring',
  }
  return map[key] || key
}
