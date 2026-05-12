import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth.jsx'
import {
  Header, BottomNav, Section, Button, Card, CardHeader, CardBody, CardTitle,
  Badge, EmptyState,
} from '../../ui'

/**
 * ScreeningDashboard — landing page for the canine mold screening workflow.
 *
 * Shows status of each step:
 *   1. Intake & Authorization (must be completed before walkthrough)
 *   2. Walkthrough (alerts captured)
 *   3. Sampling (optional; tracks lab-bound samples)
 *   4. Recommendations (AI-assisted plus quick-picks)
 *   5. Generate Report
 *
 * Click any tile to drill into that step.
 */
export default function ScreeningDashboard() {
  const { id: jobId } = useParams()
  const { profile } = useAuth()

  const [job, setJob] = useState(null)
  const [inspection, setInspection] = useState(null)
  const [authorization, setAuthorization] = useState(null)
  const [alertCount, setAlertCount] = useState(0)
  const [sampleCounts, setSampleCounts] = useState({ pending: 0, sent: 0, received: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true); setError(null)
      const [jobRes, inspRes, authRes] = await Promise.all([
        supabase.from('jobs')
          .select('id, job_number, customer, loss_info, status, screening_enabled, screening_only')
          .eq('id', jobId).maybeSingle(),
        supabase.from('screening_inspections').select('*').eq('job_id', jobId).maybeSingle(),
        supabase.from('screening_authorizations').select('*').eq('job_id', jobId).maybeSingle(),
      ])
      if (cancelled) return
      if (jobRes.error || !jobRes.data) {
        setError(jobRes.error?.message || 'Job not found')
        setLoading(false); return
      }
      setJob(jobRes.data)
      setInspection(inspRes.data)
      setAuthorization(authRes.data)

      // If we have an inspection, count alerts and samples
      if (inspRes.data) {
        const [alertRes, sampleRes] = await Promise.all([
          supabase.from('screening_alerts')
            .select('id', { count: 'exact', head: true })
            .eq('inspection_id', inspRes.data.id),
          supabase.from('screening_samples')
            .select('status')
            .eq('inspection_id', inspRes.data.id),
        ])
        if (cancelled) return
        setAlertCount(alertRes.count || 0)
        const counts = { pending: 0, sent: 0, received: 0 }
        for (const row of (sampleRes.data || [])) {
          if (counts[row.status] != null) counts[row.status]++
          if (row.status === 'reviewed') counts.received++
        }
        setSampleCounts(counts)
      }
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [jobId])

  // Create the inspection row on first visit if it doesn't exist
  async function startInspection() {
    setCreating(true); setError(null)
    try {
      const { data, error: err } = await supabase
        .from('screening_inspections')
        .insert({
          tenant_id: profile.tenant_id,
          job_id: jobId,
          status: 'in_progress',
          started_at: new Date().toISOString(),
          inspector_name: profile.full_name || '',
          dog_name: 'Spore',
          created_by: profile.id,
        })
        .select('*')
        .single()
      if (err) throw err
      setInspection(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setCreating(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-ink-50">
        <Header breadcrumb={[
          { label: 'Jobs', to: '/jobs' },
          { label: 'Job', to: `/jobs/${jobId}` },
          { label: 'Mold Screening' },
        ]} />
        <main className="max-w-4xl mx-auto p-4 sm:p-6 text-ink-500">Loading…</main>
      </div>
    )
  }

  if (error || !job) {
    return (
      <div className="min-h-screen bg-ink-50">
        <Header breadcrumb={[{ label: 'Jobs', to: '/jobs' }, { label: 'Mold Screening' }]} />
        <main className="max-w-4xl mx-auto p-4 sm:p-6">
          <p className="text-danger">{error || 'Job not found.'}</p>
        </main>
      </div>
    )
  }

  const customer = job.customer || {}

  return (
    <div className="min-h-screen bg-ink-50">
      <Header breadcrumb={[
        { label: 'Jobs', to: '/jobs' },
        { label: job.job_number || 'Job', to: `/jobs/${jobId}` },
        { label: 'Mold Screening' },
      ]} />

      <main className="max-w-4xl mx-auto p-4 sm:p-6 pb-24 space-y-5">
        {/* Hero */}
        <div>
          <p className="text-xs text-ink-500 uppercase tracking-wide font-semibold mb-1">
            1-800 WATER DAMAGE Mold Detection Services
          </p>
          <h1 className="font-condensed font-bold text-3xl sm:text-4xl text-ink-900 leading-none tracking-wide">
            {customer.name || 'Unnamed customer'}
          </h1>
          <p className="text-sm text-ink-600 mt-2">
            {customer.address || '—'}
          </p>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <Badge tone="blue">Spore canine inspection</Badge>
            {job.screening_only && <Badge tone="amber">Screening only</Badge>}
            {!job.screening_only && job.screening_enabled && <Badge tone="neutral">Combo job (mit + screening)</Badge>}
          </div>
        </div>

        {/* No inspection yet */}
        {!inspection ? (
          <Card accent="blue">
            <CardHeader>
              <CardTitle>Start the screening</CardTitle>
              <p className="text-sm text-ink-600 mt-1">
                Before walking through the property, the customer needs to sign the Mold Detection
                Dog Authorization Form. After that, you'll be ready to start documenting alerts.
              </p>
            </CardHeader>
            <CardBody>
              <Button onClick={startInspection} loading={creating} variant="accent" size="lg">
                Start screening
              </Button>
            </CardBody>
          </Card>
        ) : (
          <Section
            title="Screening workflow"
            description="Click each step to capture data. Steps don't need to be done in order, but the customer should sign the authorization first."
          >
            <ul className="grid sm:grid-cols-2 gap-3">
              <StepTile
                to={`/jobs/${jobId}/screening/authorization`}
                title="1. Intake & Authorization"
                subtitle={authorization?.signed_at
                  ? `Signed by ${authorization.customer_name} on ${formatDate(authorization.signed_at)}`
                  : 'Capture customer signature'}
                done={!!authorization?.signed_at}
                required
              />
              <StepTile
                to={`/jobs/${jobId}/screening/walkthrough`}
                title="2. Walkthrough"
                subtitle={alertCount === 0
                  ? 'Document Spore\'s alerts room by room'
                  : `${alertCount} alert${alertCount === 1 ? '' : 's'} recorded`}
                done={alertCount > 0}
              />
              <StepTile
                to={`/jobs/${jobId}/screening/samples`}
                title="3. Sampling"
                subtitle={sampleCounts.pending + sampleCounts.sent + sampleCounts.received === 0
                  ? 'Optional — track air, surface, or bulk samples'
                  : `${sampleCounts.received} received · ${sampleCounts.sent} pending lab · ${sampleCounts.pending} draft`}
                done={sampleCounts.received > 0 && sampleCounts.sent === 0 && sampleCounts.pending === 0}
              />
              <StepTile
                to={`/jobs/${jobId}/screening/recommendations`}
                title="4. Recommendations"
                subtitle="Quick-picks + AI-generated recommendations"
              />
              <StepTile
                to={`/jobs/${jobId}/screening/report`}
                title="5. Generate Report"
                subtitle="Branded PDF with photos, findings, recommendations"
                accent
              />
            </ul>
          </Section>
        )}
      </main>

      <BottomNav jobId={jobId} />
    </div>
  )
}

// -----------------------------------------------------------------------------

function StepTile({ to, title, subtitle, done = false, required = false, accent = false }) {
  return (
    <li>
      <Link
        to={to}
        className={`block bg-white border rounded-md p-4 transition-shadow hover:shadow-card-hover relative
          ${accent ? 'border-l-[3px] border-l-brand-yellow border-ink-200' : 'border-ink-200'}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-condensed font-bold text-brand-blue tracking-wide text-lg leading-tight">
              {title}
            </h3>
            <p className="text-xs text-ink-600 mt-1">{subtitle}</p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {done && <Badge tone="green">✓</Badge>}
            {required && !done && <Badge tone="red">Required</Badge>}
          </div>
        </div>
      </Link>
    </li>
  )
}

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
