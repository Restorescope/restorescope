import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth.jsx'
import {
  Header, BottomNav, Section, Button, Card, CardHeader, CardBody, CardTitle,
  Input, Textarea, Select, Badge,
} from '../../ui'
import SignaturePad from '../../components/SignaturePad'

/**
 * ScreeningAuthorization — captures the Mold Detection Dog Authorization Form
 * with on-screen signature, plus pre-screening intake details.
 *
 * Two parts:
 *   A. Intake — reason for screening, history, customer concerns, scope
 *   B. Authorization form — customer name, acknowledgment checkbox, signature, date
 *
 * Saves to:
 *   - screening_inspections (intake fields)
 *   - screening_authorizations (signature data)
 */

const REASON_OPTIONS = [
  { key: 'post_remediation', label: 'Post-remediation verification' },
  { key: 'illness_symptoms', label: 'Illness symptoms in home/workplace' },
  { key: 'real_estate', label: 'Real estate transaction' },
  { key: 'musty_smell', label: 'Musty smell / odor concern' },
  { key: 'water_history', label: 'Past water damage / leak concern' },
  { key: 'visible_mold', label: 'Visible mold growth' },
  { key: 'pre_purchase', label: 'Pre-purchase inspection' },
  { key: 'curiosity', label: 'General curiosity / peace of mind' },
  { key: 'other', label: 'Other' },
]

export default function ScreeningAuthorization() {
  const { id: jobId } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()

  const [job, setJob] = useState(null)
  const [inspection, setInspection] = useState(null)
  const [auth, setAuth] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  // Form state
  const [intakeForm, setIntakeForm] = useState({
    reason_for_screening: '',
    customer_concerns: '',
    reported_history: '',
    scope: '',
    ambient_conditions: '',
    inspector_name: '',
  })
  const [authForm, setAuthForm] = useState({
    customer_name: '',
    acknowledged: false,
    signature_data: null,
  })

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true); setError(null)
      const [jobRes, inspRes, authRes] = await Promise.all([
        supabase.from('jobs')
          .select('id, job_number, customer, loss_info')
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

      if (!inspRes.data) {
        setError('No screening inspection has been started for this job. Go back to the Screening dashboard and click "Start screening".')
        setLoading(false); return
      }
      setInspection(inspRes.data)
      setIntakeForm({
        reason_for_screening: inspRes.data.reason_for_screening || '',
        customer_concerns: inspRes.data.customer_concerns || '',
        reported_history: inspRes.data.reported_history || '',
        scope: inspRes.data.scope || '',
        ambient_conditions: inspRes.data.ambient_conditions || '',
        inspector_name: inspRes.data.inspector_name || profile.full_name || '',
      })

      if (authRes.data) {
        setAuth(authRes.data)
        setAuthForm({
          customer_name: authRes.data.customer_name || '',
          acknowledged: !!authRes.data.acknowledged,
          signature_data: authRes.data.customer_signature_data || null,
        })
      } else {
        // Pre-populate customer name from job
        setAuthForm((f) => ({
          ...f,
          customer_name: jobRes.data.customer?.name || '',
        }))
      }
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [jobId, profile.full_name])

  async function saveIntake() {
    if (!inspection) return
    setSaving(true); setError(null); setSuccess(null)
    try {
      const { error: err } = await supabase
        .from('screening_inspections')
        .update({
          reason_for_screening: intakeForm.reason_for_screening,
          customer_concerns: intakeForm.customer_concerns,
          reported_history: intakeForm.reported_history,
          scope: intakeForm.scope,
          ambient_conditions: intakeForm.ambient_conditions,
          inspector_name: intakeForm.inspector_name,
          updated_at: new Date().toISOString(),
        })
        .eq('id', inspection.id)
      if (err) throw err
      setSuccess('Intake details saved.')
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function saveAuthorization() {
    if (!inspection) return
    if (!authForm.customer_name.trim()) {
      setError('Customer printed name is required.')
      return
    }
    if (!authForm.acknowledged) {
      setError('Customer must acknowledge "I have read and understand" before signing.')
      return
    }
    if (!authForm.signature_data) {
      setError('Customer signature is required.')
      return
    }
    setSaving(true); setError(null); setSuccess(null)
    try {
      const payload = {
        tenant_id: profile.tenant_id,
        job_id: jobId,
        inspection_id: inspection.id,
        customer_name: authForm.customer_name.trim(),
        customer_signature_data: authForm.signature_data,
        acknowledged: authForm.acknowledged,
        signed_at: new Date().toISOString(),
        user_agent: navigator.userAgent.slice(0, 500),
        form_version: '1.1',
      }
      const upsertRes = await supabase
        .from('screening_authorizations')
        .upsert(payload, { onConflict: 'job_id' })
        .select('*')
        .single()
      if (upsertRes.error) throw upsertRes.error
      setAuth(upsertRes.data)
      setSuccess('Authorization signed and saved. You can now begin the walkthrough.')
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
          { label: 'Intake & Authorization' },
        ]} />
        <main className="max-w-3xl mx-auto p-4 sm:p-6 text-ink-500">Loading…</main>
      </div>
    )
  }

  if (error && !inspection) {
    return (
      <div className="min-h-screen bg-ink-50">
        <Header breadcrumb={[
          { label: 'Jobs', to: '/jobs' },
          { label: 'Screening', to: `/jobs/${jobId}/screening` },
          { label: 'Intake' },
        ]} />
        <main className="max-w-3xl mx-auto p-4 sm:p-6 space-y-3">
          <div role="alert" className="bg-red-50 border border-red-200 text-danger rounded p-3 text-sm">
            {error}
          </div>
          <Link to={`/jobs/${jobId}/screening`}>
            <Button variant="secondary">← Back to Screening</Button>
          </Link>
        </main>
      </div>
    )
  }

  const isSigned = !!auth?.signed_at

  return (
    <div className="min-h-screen bg-ink-50">
      <Header breadcrumb={[
        { label: 'Jobs', to: '/jobs' },
        { label: job?.job_number || 'Job', to: `/jobs/${jobId}` },
        { label: 'Screening', to: `/jobs/${jobId}/screening` },
        { label: 'Intake & Authorization' },
      ]} />

      <main className="max-w-3xl mx-auto p-4 sm:p-6 pb-24 space-y-5">
        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-danger rounded p-3 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div role="status" className="bg-green-50 border border-green-200 text-green-800 rounded p-3 text-sm">
            {success}
          </div>
        )}

        {/* Part A — Intake details */}
        <Card>
          <CardHeader>
            <CardTitle>Part A — Pre-screening intake</CardTitle>
            <p className="text-sm text-ink-600 mt-1">
              Capture context for the screening. This information appears in the final report.
            </p>
          </CardHeader>
          <CardBody className="space-y-4">
            <Select
              label="Reason for screening"
              placeholder="Select reason…"
              value={intakeForm.reason_for_screening}
              onChange={(e) => setIntakeForm((f) => ({ ...f, reason_for_screening: e.target.value }))}
              options={REASON_OPTIONS}
            />
            <Textarea
              label="Customer's stated concerns"
              rows={3}
              placeholder="What does the customer think might be going on? Specific rooms, symptoms, smells, etc."
              value={intakeForm.customer_concerns}
              onChange={(e) => setIntakeForm((f) => ({ ...f, customer_concerns: e.target.value }))}
            />
            <Textarea
              label="Property history"
              rows={3}
              placeholder="Prior leaks, prior remediation, age of home, occupancy duration, recent weather events, etc."
              value={intakeForm.reported_history}
              onChange={(e) => setIntakeForm((f) => ({ ...f, reported_history: e.target.value }))}
            />
            <div className="grid sm:grid-cols-2 gap-4">
              <Input
                label="Scope of inspection"
                placeholder="e.g. Whole home / Master bedroom and bath / Basement"
                value={intakeForm.scope}
                onChange={(e) => setIntakeForm((f) => ({ ...f, scope: e.target.value }))}
              />
              <Input
                label="Inspector / handler name"
                value={intakeForm.inspector_name}
                onChange={(e) => setIntakeForm((f) => ({ ...f, inspector_name: e.target.value }))}
              />
            </div>
            <Input
              label="Ambient conditions (optional)"
              placeholder="e.g. 72°F, 45% RH, sunny outdoors, HVAC running"
              value={intakeForm.ambient_conditions}
              onChange={(e) => setIntakeForm((f) => ({ ...f, ambient_conditions: e.target.value }))}
            />
            <Button onClick={saveIntake} loading={saving} variant="secondary">
              Save intake details
            </Button>
          </CardBody>
        </Card>

        {/* Part B — Authorization form */}
        <Card accent="yellow">
          <CardHeader>
            <CardTitle>Part B — Mold Detection Dog Authorization</CardTitle>
            <p className="text-sm text-ink-600 mt-1">
              Customer reads, acknowledges, and signs to authorize the screening.
            </p>
            {isSigned && (
              <div className="mt-2">
                <Badge tone="green">
                  ✓ Signed by {auth.customer_name} on {new Date(auth.signed_at).toLocaleString()}
                </Badge>
              </div>
            )}
          </CardHeader>
          <CardBody className="space-y-4">
            {/* Authorization language */}
            <div className="bg-ink-50 border border-ink-200 rounded p-4 text-sm text-ink-800 leading-relaxed space-y-3 max-h-64 overflow-y-auto">
              <p className="font-semibold text-ink-900">Authorization to perform mold detection canine screening</p>
              <p>
                I, the undersigned, authorize 1-800 WATER DAMAGE of North Dakota and its certified
                mold detection canine team to perform a non-invasive screening of the property at
                the address on file. I understand and acknowledge that:
              </p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>
                  Canine screening is a presumptive method of indicating the possible presence of mold
                  and is not a substitute for laboratory analysis or a full mold assessment.
                </li>
                <li>
                  An "alert" by the canine indicates a scent the dog has been trained to detect; further
                  laboratory sampling is required to confirm species and concentration.
                </li>
                <li>
                  An absence of alerts in an area does not guarantee that no mold is present —
                  it indicates only that the canine did not detect scent compounds at the levels
                  and locations tested.
                </li>
                <li>
                  The screening is limited to areas and conditions agreed upon at the time of inspection.
                  Areas not accessible (locked rooms, crawlspaces, sealed cavities, areas with
                  obstructions, etc.) cannot be screened.
                </li>
                <li>
                  The resulting report represents the handler's professional findings from the canine
                  screening, supplemented by laboratory data where applicable. It does NOT constitute
                  a guarantee or warranty against future mold growth, a substitute for professional
                  remediation services, or medical advice.
                </li>
                <li>
                  No demolition, invasive testing, or remediation will be performed under this screening
                  authorization. Any further work would require a separate agreement.
                </li>
                <li>
                  Photographs may be taken of alert locations and will be included in the screening report.
                </li>
                <li>
                  I represent that I am the property owner or an authorized representative with the
                  right to permit this screening.
                </li>
              </ul>
              <p>
                I have had the opportunity to ask questions and have all of my questions answered to
                my satisfaction. I agree to pay the fees disclosed to me prior to the screening and
                acknowledge that the report is for informational purposes regarding the canine screening
                only. Decisions about further investigation, remediation, or medical consultation are
                my responsibility and the responsibility of qualified professionals I engage.
              </p>
            </div>

            <label className="flex items-start gap-2 select-none cursor-pointer">
              <input
                type="checkbox"
                className="w-5 h-5 rounded border-ink-300 mt-0.5 shrink-0"
                checked={authForm.acknowledged}
                onChange={(e) => setAuthForm((f) => ({ ...f, acknowledged: e.target.checked }))}
                disabled={isSigned}
              />
              <span className="text-sm font-semibold text-ink-800">
                I have read and understand the terms above, and I authorize this screening.
              </span>
            </label>

            <Input
              label="Customer printed name"
              required
              value={authForm.customer_name}
              onChange={(e) => setAuthForm((f) => ({ ...f, customer_name: e.target.value }))}
              disabled={isSigned}
            />

            <div>
              <label className="block text-sm font-semibold text-ink-700 mb-1">
                Customer signature <span className="text-danger">*</span>
              </label>
              <SignaturePad
                value={authForm.signature_data}
                onChange={(dataUrl) => setAuthForm((f) => ({ ...f, signature_data: dataUrl }))}
                disabled={isSigned}
              />
            </div>

            {!isSigned && (
              <div className="flex gap-2">
                <Button onClick={saveAuthorization} loading={saving} size="lg">
                  Sign &amp; save authorization
                </Button>
              </div>
            )}

            {isSigned && (
              <div className="bg-green-50 border border-green-200 rounded p-3 text-sm text-green-800">
                Authorization is on file. You can now proceed to the walkthrough.
                <div className="mt-3 flex gap-2">
                  <Link to={`/jobs/${jobId}/screening/walkthrough`}>
                    <Button>Start walkthrough →</Button>
                  </Link>
                  <Link to={`/jobs/${jobId}/screening`}>
                    <Button variant="secondary">Back to screening</Button>
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
