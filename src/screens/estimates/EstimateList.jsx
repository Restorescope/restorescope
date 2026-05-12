import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth.jsx'
import {
  Header, BottomNav, Section, Button, Card, CardBody, Badge, EmptyState,
} from '../../ui'

/**
 * EstimateList — shows all estimates for a job in version order.
 *
 * Owner and PM can create new estimates; Technician sees read-only.
 * "New estimate" creates a fresh draft with the next version number.
 */
export default function EstimateList() {
  const { id: jobId } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()

  const [job, setJob] = useState(null)
  const [estimates, setEstimates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [creating, setCreating] = useState(false)

  const canEdit = profile?.role === 'owner' || profile?.role === 'pm'

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true); setError(null)
      const [jobRes, estRes] = await Promise.all([
        supabase.from('jobs')
          .select('id, job_number, customer, loss_info, status')
          .eq('id', jobId).maybeSingle(),
        supabase.from('estimates')
          .select('id, version, estimate_number, status, total, created_at, updated_at')
          .eq('job_id', jobId)
          .order('version', { ascending: false }),
      ])
      if (cancelled) return
      if (jobRes.error || !jobRes.data) {
        setError(jobRes.error?.message || 'Job not found')
        setLoading(false); return
      }
      setJob(jobRes.data)
      setEstimates(estRes.data || [])
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [jobId])

  async function createNew() {
    setCreating(true); setError(null)
    try {
      // Mark all previous as superseded (keeps a clean paper trail)
      if (estimates.length > 0) {
        await supabase
          .from('estimates')
          .update({ status: 'superseded' })
          .eq('job_id', jobId)
          .in('status', ['draft', 'sent'])
      }

      const nextVersion = estimates.length === 0 ? 1 : Math.max(...estimates.map((e) => e.version)) + 1
      const estimateNumber = `${job.job_number || 'EST'}-V${nextVersion}`
      const { data, error: err } = await supabase
        .from('estimates')
        .insert({
          tenant_id: profile.tenant_id,
          job_id: jobId,
          version: nextVersion,
          estimate_number: estimateNumber,
          status: 'draft',
          markup_pct: 0,
          contingency_pct: 10,
          tax_pct: 0,
          estimator_name: profile.full_name || '',
          created_by: profile.id,
        })
        .select('id')
        .single()
      if (err) throw err
      navigate(`/jobs/${jobId}/estimates/${data.id}`)
    } catch (e) {
      setError(e.message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="min-h-screen bg-ink-50">
      <Header breadcrumb={[
        { label: 'Jobs', to: '/jobs' },
        { label: job?.job_number || 'Job', to: `/jobs/${jobId}` },
        { label: 'Estimates' },
      ]} />
      <main className="max-w-4xl mx-auto p-4 sm:p-6 pb-24 space-y-5">
        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-danger rounded p-3 text-sm">
            {error}
          </div>
        )}

        <Section
          title="NTE estimates"
          description="Not-to-Exceed estimates for this job. Multiple versions allowed; the latest is shown first."
          action={canEdit && (
            <Button onClick={createNew} loading={creating} variant="accent">
              + New estimate
            </Button>
          )}
        >
          {loading ? (
            <p className="text-ink-500 text-sm">Loading…</p>
          ) : estimates.length === 0 ? (
            <EmptyState
              title="No estimates yet"
              body={canEdit
                ? 'Click "+ New estimate" to start your first NTE estimate for this job. Customer info auto-fills from the job.'
                : 'No estimates have been created for this job yet.'}
              action={canEdit && (
                <Button onClick={createNew} loading={creating}>+ Create first estimate</Button>
              )}
            />
          ) : (
            <ul className="space-y-2">
              {estimates.map((e) => (
                <EstimateCard key={e.id} jobId={jobId} estimate={e} />
              ))}
            </ul>
          )}
        </Section>
      </main>

      <BottomNav jobId={jobId} />
    </div>
  )
}

function EstimateCard({ jobId, estimate }) {
  return (
    <li>
      <Link
        to={`/jobs/${jobId}/estimates/${estimate.id}`}
        className="block bg-white border border-ink-200 border-l-[3px] border-l-brand-blue rounded-md p-4 hover:shadow-card-hover transition-shadow"
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-condensed font-bold text-brand-blue tracking-wide">
                {estimate.estimate_number || `Version ${estimate.version}`}
              </span>
              <EstimateStatusBadge status={estimate.status} />
            </div>
            <p className="text-xs text-ink-500">
              Created {formatDate(estimate.created_at)}
              {estimate.updated_at && estimate.updated_at !== estimate.created_at && (
                <> · updated {formatDate(estimate.updated_at)}</>
              )}
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs text-ink-500 uppercase tracking-wide">Total</div>
            <div className="font-condensed font-bold text-2xl text-ink-900">
              {formatCurrency(estimate.total)}
            </div>
          </div>
        </div>
      </Link>
    </li>
  )
}

function EstimateStatusBadge({ status }) {
  const map = {
    draft:      { tone: 'neutral', label: 'Draft' },
    sent:       { tone: 'blue',    label: 'Sent' },
    accepted:   { tone: 'green',   label: 'Accepted' },
    rejected:   { tone: 'red',     label: 'Rejected' },
    superseded: { tone: 'amber',   label: 'Superseded' },
  }
  const m = map[status] ?? { tone: 'neutral', label: status }
  return <Badge tone={m.tone}>{m.label}</Badge>
}

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatCurrency(n) {
  if (n == null) return '$0.00'
  return Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}
