import { useEffect, useState, useCallback } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth.jsx'
import { useSetting } from '../../lib/settings'
import { evaluateJob } from '../../lib/qc'
import {
  Header, BottomNav, Section, Button, Card, CardHeader, CardBody, CardTitle,
  Badge, StatusPill,
} from '../../ui'

/**
 * ReviewScreen — runs QC against the current job state and shows results.
 *
 * Layout:
 *   1. Top status banner: "Ready for finalize" (all blocks clear) or "Blocked"
 *   2. Blocking issues section (if any) — red, with "Fix" deep-links
 *   3. Warnings section — amber, with deep-links
 *   4. Passing checks section — collapsible
 *   5. Action: "Mark ready for review" (PM) or "Finalize" (Owner+) when clear
 */
export default function ReviewScreen() {
  const { id: jobId } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const qcRules = useSetting('qc_rules')

  const [job, setJob] = useState(null)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [finalizing, setFinalizing] = useState(false)

  const run = useCallback(async () => {
    if (!qcRules.data?.rules) return
    setLoading(true); setError(null)
    try {
      const { snapshot, results } = await evaluateJob(jobId, qcRules.data.rules)
      setJob(snapshot.job)
      setResults(results)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [jobId, qcRules.data])

  useEffect(() => { run() }, [run])

  const blocks = results.filter((r) => !r.ok && r.level === 'block')
  const warns  = results.filter((r) => !r.ok && r.level === 'warn')
  const passes = results.filter((r) => r.ok)
  const canFinalize = blocks.length === 0 && job?.status !== 'finalized'

  async function markReadyForReview() {
    setError(null)
    try {
      const { error: err } = await supabase
        .from('jobs')
        .update({ status: 'ready_for_review' })
        .eq('id', jobId)
      if (err) throw err
      run()
    } catch (e) {
      setError(e.message)
    }
  }

  async function finalize() {
    if (!confirm('Finalize this job? It will be locked from edits until an Owner unlocks it.')) return
    setFinalizing(true); setError(null)
    try {
      const now = new Date().toISOString()
      const [jobRes, reportRes] = await Promise.all([
        supabase.from('jobs').update({ status: 'finalized', finalized_at: now }).eq('id', jobId),
        supabase.from('reports').insert({
          tenant_id: profile.tenant_id,
          job_id: jobId,
          status: 'finalized',
          finalized_at: now,
          generated_by: profile.id,
        }),
      ])
      if (jobRes.error) throw jobRes.error
      if (reportRes.error) throw reportRes.error
      run()
    } catch (e) {
      setError(e.message)
    } finally {
      setFinalizing(false)
    }
  }

  async function unlock() {
    if (!confirm('Unlock this job for editing? You can re-finalize after changes.')) return
    setError(null)
    try {
      const { error: err } = await supabase
        .from('jobs')
        .update({ status: 'unlocked' })
        .eq('id', jobId)
      if (err) throw err
      run()
    } catch (e) {
      setError(e.message)
    }
  }

  async function markPaid() {
    if (profile.role !== 'owner') {
      setError('Only the Owner can close out a paid job.')
      return
    }
    if (!confirm('Mark this job as paid and close it out? The job will be locked from edits.')) return
    setError(null)
    try {
      const { error: err } = await supabase
        .from('jobs')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', jobId)
      if (err) throw err
      run()
    } catch (e) {
      setError(e.message)
    }
  }

  async function reopenPaid() {
    if (profile.role !== 'owner') {
      setError('Only the Owner can reopen a paid job.')
      return
    }
    if (!confirm('Reopen this paid job back to finalized status?')) return
    setError(null)
    try {
      const { error: err } = await supabase
        .from('jobs')
        .update({ status: 'finalized', paid_at: null })
        .eq('id', jobId)
      if (err) throw err
      run()
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className="min-h-screen bg-ink-50">
      <Header breadcrumb={[
        { label: 'Jobs', to: '/jobs' },
        { label: 'Job', to: `/jobs/${jobId}` },
        { label: 'Review' },
      ]} />
      <main className="max-w-4xl mx-auto p-4 sm:p-6 pb-24 space-y-5">

        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-danger rounded p-3 text-sm">
            {error}
          </div>
        )}

        {loading || !job ? (
          <p className="text-ink-500 text-sm">Running QC checks…</p>
        ) : (
          <>
            {/* Status banner */}
            <Card>
              <CardBody>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-condensed font-bold text-2xl text-brand-blue tracking-wide">
                        {job.job_number}
                      </span>
                      <StatusPill status={job.status} />
                    </div>
                    <p className="text-sm text-ink-700">
                      {job.customer?.name || 'Unnamed customer'} · {job.customer?.address || '—'}
                    </p>
                  </div>
                  <FinalizeStatusPill blocks={blocks.length} warns={warns.length} jobStatus={job.status} />
                </div>
              </CardBody>
            </Card>

            {/* Blocks */}
            {blocks.length > 0 && (
              <Section title={`${blocks.length} blocking issue${blocks.length === 1 ? '' : 's'}`} description="Must be fixed before finalize.">
                <ul className="space-y-2">
                  {blocks.map((r) => (
                    <RuleResult key={r.rule_key} result={r} jobId={jobId} />
                  ))}
                </ul>
              </Section>
            )}

            {/* Warnings */}
            {warns.length > 0 && (
              <Section title={`${warns.length} warning${warns.length === 1 ? '' : 's'}`} description="Allowed to finalize, but consider addressing.">
                <ul className="space-y-2">
                  {warns.map((r) => (
                    <RuleResult key={r.rule_key} result={r} jobId={jobId} />
                  ))}
                </ul>
              </Section>
            )}

            {/* Passes */}
            {passes.length > 0 && (
              <Section title="Passing checks">
                <details>
                  <summary className="text-sm text-ink-600 cursor-pointer select-none">
                    Show {passes.length} passing check{passes.length === 1 ? '' : 's'}
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {passes.map((r) => (
                      <li key={r.rule_key} className="flex items-center gap-2 text-sm py-1">
                        <span className="text-success font-bold">✓</span>
                        <span className="text-ink-700">{r.label}</span>
                        <Badge tone={r.level === 'block' ? 'red' : 'amber'} className="ml-auto">{r.level}</Badge>
                      </li>
                    ))}
                  </ul>
                </details>
              </Section>
            )}

            {/* Actions */}
            <Card>
              <CardHeader>
                <CardTitle>
                  {job.status === 'paid' ? 'Closed out (paid)'
                    : job.status === 'finalized' ? 'Finalized'
                    : 'Next step'}
                </CardTitle>
              </CardHeader>
              <CardBody className="space-y-3">
                {job.status === 'paid' ? (
                  <>
                    <p className="text-sm text-ink-700">
                      This job was marked paid on {new Date(job.paid_at).toLocaleString()}.
                      It is closed out and locked from edits.
                    </p>
                    {profile.role === 'owner' && (
                      <Button onClick={reopenPaid} variant="secondary">Reopen to finalized</Button>
                    )}
                  </>
                ) : job.status === 'finalized' ? (
                  <>
                    <p className="text-sm text-ink-700">
                      This job was finalized on {new Date(job.finalized_at).toLocaleString()}.
                      It is locked from edits.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {profile.role === 'owner' && (
                        <>
                          <Button onClick={markPaid} variant="accent">
                            Mark as paid · close out
                          </Button>
                          <Button onClick={unlock} variant="secondary">Unlock for edits</Button>
                        </>
                      )}
                    </div>
                    {profile.role === 'owner' && (
                      <p className="text-xs text-ink-500">
                        Marking the job as paid closes it out. Use "Unlock" if changes are still needed.
                      </p>
                    )}
                  </>
                ) : blocks.length > 0 ? (
                  <p className="text-sm text-ink-700">
                    Fix the blocking issues above to unlock finalize.
                  </p>
                ) : (
                  <>
                    <p className="text-sm text-ink-700">
                      No blocking issues. {warns.length > 0 && `${warns.length} warning${warns.length === 1 ? '' : 's'} above — those are reminders, not blockers.`}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {(profile.role === 'pm' || profile.role === 'technician') && job.status !== 'ready_for_review' && (
                        <Button onClick={markReadyForReview} variant="secondary">
                          Mark ready for review
                        </Button>
                      )}
                      {(profile.role === 'owner' || profile.role === 'pm') && (
                        <Button onClick={finalize} loading={finalizing}>
                          Finalize job
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-ink-500">
                      Finalizing locks the job. After finalize, the Owner can mark it paid to close it out.
                    </p>
                  </>
                )}
              </CardBody>
            </Card>
          </>
        )}
      </main>

      <BottomNav jobId={jobId} />
    </div>
  )
}

// -----------------------------------------------------------------------------

function FinalizeStatusPill({ blocks, warns, jobStatus }) {
  if (jobStatus === 'paid') return <Badge tone="green">Paid · Closed ✓</Badge>
  if (jobStatus === 'finalized') return <Badge tone="green">Finalized ✓</Badge>
  if (blocks > 0) return <Badge tone="red">{blocks} blocking</Badge>
  if (warns > 0) return <Badge tone="amber">Ready · {warns} warning{warns === 1 ? '' : 's'}</Badge>
  return <Badge tone="green">Ready to finalize ✓</Badge>
}

function RuleResult({ result, jobId }) {
  const tone = result.level === 'block' ? 'red' : 'amber'
  const bgClass = result.level === 'block'
    ? 'bg-red-50 border-red-200'
    : 'bg-amber-50 border-amber-200'

  const fixUrl = result.fixSection ? sectionToUrl(result.fixSection, jobId) : null

  return (
    <li className={`border rounded p-3 ${bgClass}`}>
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge tone={tone}>{result.level}</Badge>
            <span className="font-semibold text-ink-900">{result.label}</span>
          </div>
          {result.detail && <p className="text-sm text-ink-700">{result.detail}</p>}
        </div>
        {fixUrl && (
          <Link to={fixUrl}>
            <Button size="sm" variant="secondary">Fix →</Button>
          </Link>
        )}
      </div>
    </li>
  )
}

function sectionToUrl(section, jobId) {
  switch (section) {
    case 'rooms':      return `/jobs/${jobId}/rooms`
    case 'photos':     return `/jobs/${jobId}/photos`
    case 'readings':   return `/jobs/${jobId}/readings`
    case 'equipment':  return `/jobs/${jobId}/equipment`
    case 'monitoring': return `/jobs/${jobId}/monitoring`
    case 'scope':      return `/jobs/${jobId}/scope`
    case 'intake':     return `/jobs/${jobId}` // dashboard until intake screen exists
    default:           return null
  }
}
