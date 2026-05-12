import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth.jsx'
import {
  Header, BottomNav, Button, Card, CardHeader, CardBody, CardTitle,
  Input, Badge,
} from '../../ui'
import SignaturePad from '../../components/SignaturePad'

/**
 * EstimateSign — customer acceptance signature for an NTE estimate.
 *
 * Flow:
 *   1. Owner/PM opens this screen on a phone or tablet, hands it to the customer
 *   2. Customer reads the acceptance terms, checks the acknowledgment
 *   3. Customer types their printed name and signs
 *   4. Save sets estimate.status='accepted', stores signature image, timestamp
 *
 * Once signed, the estimate is locked from line edits (it's been formally
 * accepted). The estimate PDF includes the signature on the cover.
 */
export default function EstimateSign() {
  const { id: jobId, estimateId } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()

  const [job, setJob] = useState(null)
  const [estimate, setEstimate] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const [form, setForm] = useState({
    customer_name: '',
    acknowledged: false,
    signature_data: null,
  })

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true); setError(null)
      const [jobRes, estRes] = await Promise.all([
        supabase.from('jobs').select('id, job_number, customer').eq('id', jobId).maybeSingle(),
        supabase.from('estimates').select('*').eq('id', estimateId).maybeSingle(),
      ])
      if (cancelled) return
      if (jobRes.error || !jobRes.data) { setError(jobRes.error?.message || 'Job not found'); setLoading(false); return }
      if (estRes.error || !estRes.data) { setError(estRes.error?.message || 'Estimate not found'); setLoading(false); return }
      setJob(jobRes.data)
      setEstimate(estRes.data)

      // Pre-populate
      if (estRes.data.customer_signed_at) {
        // Already signed — just show the existing signature
        setForm({
          customer_name: estRes.data.customer_signature_name || '',
          acknowledged: !!estRes.data.customer_acknowledged,
          signature_data: estRes.data.customer_signature_data || null,
        })
      } else {
        setForm((f) => ({ ...f, customer_name: jobRes.data.customer?.name || '' }))
      }
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [jobId, estimateId])

  async function save() {
    if (!form.customer_name.trim()) {
      setError('Customer printed name is required.')
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    if (!form.acknowledged) {
      setError('Customer must acknowledge acceptance before signing.')
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    if (!form.signature_data) {
      setError('Customer signature is required.')
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    setSaving(true); setError(null)
    try {
      const { error: err } = await supabase
        .from('estimates')
        .update({
          customer_signature_data: form.signature_data,
          customer_signature_name: form.customer_name.trim(),
          customer_signed_at: new Date().toISOString(),
          customer_acknowledged: form.acknowledged,
          status: 'accepted',
          updated_at: new Date().toISOString(),
        })
        .eq('id', estimateId)
      if (err) throw err
      navigate(`/jobs/${jobId}/estimates/${estimateId}`)
    } catch (e) {
      setError(e.message)
      window.scrollTo({ top: 0, behavior: 'smooth' })
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
          { label: 'Estimates', to: `/jobs/${jobId}/estimates` },
          { label: 'Sign' },
        ]} />
        <main className="max-w-3xl mx-auto p-4 sm:p-6 text-ink-500">Loading…</main>
      </div>
    )
  }

  if (error && !estimate) {
    return (
      <div className="min-h-screen bg-ink-50">
        <Header breadcrumb={[{ label: 'Jobs', to: '/jobs' }, { label: 'Sign' }]} />
        <main className="max-w-3xl mx-auto p-4 sm:p-6 space-y-3">
          <div role="alert" className="bg-red-50 border border-red-200 text-danger rounded p-3 text-sm">{error}</div>
          <Link to={`/jobs/${jobId}/estimates/${estimateId}`}>
            <Button variant="secondary">← Back to estimate</Button>
          </Link>
        </main>
      </div>
    )
  }

  const isSigned = !!estimate.customer_signed_at
  const totalDisplay = Number(estimate.total ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

  return (
    <div className="min-h-screen bg-ink-50">
      <Header breadcrumb={[
        { label: 'Jobs', to: '/jobs' },
        { label: job?.job_number || 'Job', to: `/jobs/${jobId}` },
        { label: 'Estimates', to: `/jobs/${jobId}/estimates` },
        { label: estimate.estimate_number || `V${estimate.version}`, to: `/jobs/${jobId}/estimates/${estimateId}` },
        { label: 'Customer acceptance' },
      ]} />

      <main className="max-w-3xl mx-auto p-4 sm:p-6 pb-24 space-y-5">
        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-danger rounded p-3 text-sm">
            {error}
          </div>
        )}

        {/* Summary card */}
        <Card accent="blue">
          <CardHeader>
            <CardTitle>{estimate.estimate_number || `Estimate V${estimate.version}`}</CardTitle>
            <p className="text-sm text-ink-600 mt-1">
              {job.customer?.name} · {job.customer?.address}
            </p>
          </CardHeader>
          <CardBody>
            <div className="bg-brand-blue text-white rounded p-4 flex justify-between items-baseline">
              <span className="font-condensed font-bold tracking-wide">NOT-TO-EXCEED TOTAL</span>
              <span className="font-condensed font-bold text-3xl text-brand-yellow">{totalDisplay}</span>
            </div>
          </CardBody>
        </Card>

        {/* Acceptance form */}
        <Card accent="yellow">
          <CardHeader>
            <CardTitle>Customer acceptance &amp; signature</CardTitle>
            <p className="text-sm text-ink-600 mt-1">
              Customer reviews terms, acknowledges, and signs to formally accept this estimate.
            </p>
            {isSigned && (
              <div className="mt-2">
                <Badge tone="green">
                  ✓ Signed by {estimate.customer_signature_name} on {new Date(estimate.customer_signed_at).toLocaleString()}
                </Badge>
              </div>
            )}
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="bg-ink-50 border border-ink-200 rounded p-4 text-sm text-ink-800 leading-relaxed space-y-3 max-h-72 overflow-y-auto">
              <p className="font-semibold text-ink-900">Customer acceptance of NTE estimate</p>
              <p>
                I, the undersigned customer (or authorized representative), have reviewed the
                Not-to-Exceed (NTE) estimate above and authorize 1-800 WATER DAMAGE of North Dakota
                to proceed with the scope of work described.
              </p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>
                  The total cost of services will not exceed the amount stated above
                  ({totalDisplay}) without prior written authorization from me.
                </li>
                <li>
                  The final invoice will reflect actual labor hours, equipment days, and consumables
                  used. If the project requires less than estimated, I will be billed only for the
                  actual amount.
                </li>
                <li>
                  Pricing conforms to the 1-800 WATER DAMAGE 2026 National Rate Schedule.
                </li>
                <li>
                  This estimate is exclusive of any federal, state, or local taxes and the costs of
                  any required permits, approvals, or licenses unless explicitly stated.
                </li>
                <li>
                  Work is performed in accordance with IICRC S500 and S520 standards as applicable.
                </li>
                <li>
                  I represent that I am the property owner or an authorized representative with the
                  right to authorize this work.
                </li>
              </ul>
              <p>
                I have had the opportunity to ask questions and have all of my questions answered to
                my satisfaction. By signing below, I authorize 1-800 WATER DAMAGE of North Dakota to
                proceed with the scope of work described in this estimate on a Not-to-Exceed basis.
              </p>
            </div>

            <label className="flex items-start gap-2 select-none cursor-pointer">
              <input
                type="checkbox"
                className="w-5 h-5 rounded border-ink-300 mt-0.5 shrink-0"
                checked={form.acknowledged}
                onChange={(e) => setForm((f) => ({ ...f, acknowledged: e.target.checked }))}
                disabled={isSigned}
              />
              <span className="text-sm font-semibold text-ink-800">
                I have read and understand the terms above, and I authorize this work on a
                Not-to-Exceed basis.
              </span>
            </label>

            <Input
              label="Customer printed name"
              required
              value={form.customer_name}
              onChange={(e) => setForm((f) => ({ ...f, customer_name: e.target.value }))}
              disabled={isSigned}
            />

            <div>
              <label className="block text-sm font-semibold text-ink-700 mb-1">
                Customer signature <span className="text-danger">*</span>
              </label>
              <SignaturePad
                value={form.signature_data}
                onChange={(dataUrl) => setForm((f) => ({ ...f, signature_data: dataUrl }))}
                disabled={isSigned}
              />
            </div>

            {!isSigned ? (
              <div className="flex gap-2">
                <Button onClick={save} loading={saving} size="lg">
                  Sign &amp; accept estimate
                </Button>
                <Link to={`/jobs/${jobId}/estimates/${estimateId}`}>
                  <Button variant="ghost">Cancel</Button>
                </Link>
              </div>
            ) : (
              <div className="bg-green-50 border border-green-200 rounded p-3 text-sm text-green-800">
                Estimate is accepted and on file. The signed estimate PDF can be generated from the
                estimate screen.
                <div className="mt-3 flex gap-2">
                  <Link to={`/jobs/${jobId}/estimates/${estimateId}`}>
                    <Button>Back to estimate →</Button>
                  </Link>
                  <Link to={`/jobs/${jobId}/estimates/${estimateId}/pdf`}>
                    <Button variant="secondary">Generate signed PDF</Button>
                  </Link>
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      </main>

      <BottomNav jobId={jobId} />
    </div>
  )
}
