import { useState, useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth.jsx'
import { useSetting } from '../../lib/settings'
import {
  Header, Section, Button, Input, Select, Textarea, Card, CardHeader, CardBody, CardTitle,
} from '../../ui'

/**
 * JobForm — create OR edit a job's intake info.
 *
 * Mode is determined by the presence of `:id` in the URL:
 *   /jobs/new          → create mode
 *   /jobs/:id/edit     → edit mode (loads existing job, allows updates)
 *
 * Strict-required per Batch 2 lock-in (same in both modes):
 *   customer name, address, phone, claim #, carrier, DOL, category, class.
 *
 * Edit mode rules:
 *   - Owner and PM can edit
 *   - Technician cannot
 *   - Cannot edit if job is finalized or paid (must unlock first)
 *   - Job number cannot be changed once set (it's the system identifier)
 */
export default function JobForm() {
  const navigate = useNavigate()
  const { id: jobId } = useParams()
  const { profile } = useAuth()
  const isEdit = !!jobId

  const lossSources = useSetting('loss_sources')
  const occupancyOptions = useSetting('occupancy')

  const [submitting, setSubmitting] = useState(false)
  const [loadingJob, setLoadingJob] = useState(isEdit)
  const [error, setError] = useState(null)
  const [permissionError, setPermissionError] = useState(null)
  const [originalStatus, setOriginalStatus] = useState(null)
  const [form, setForm] = useState(() => emptyForm())

  // Load existing job in edit mode
  useEffect(() => {
    if (!isEdit) return
    let cancelled = false
    async function load() {
      setLoadingJob(true); setError(null); setPermissionError(null)

      // Permission check first
      if (profile.role === 'technician') {
        setPermissionError('Technicians cannot edit job info. Ask an Owner or PM.')
        setLoadingJob(false)
        return
      }

      const { data, error: err } = await supabase
        .from('jobs')
        .select('id, job_number, customer, loss_info, status, screening_enabled, screening_only')
        .eq('id', jobId)
        .maybeSingle()

      if (cancelled) return
      if (err || !data) {
        setError(err?.message || 'Job not found')
        setLoadingJob(false)
        return
      }

      // Lock from edits when finalized or paid
      if (data.status === 'finalized' || data.status === 'paid') {
        setPermissionError(
          data.status === 'paid'
            ? 'This job is closed out (paid). Reopen it on the Review screen before editing.'
            : 'This job is finalized. Unlock it on the Review screen before editing.'
        )
      }

      setOriginalStatus(data.status)
      setForm({
        job_number: data.job_number || '',
        customer: { ...emptyForm().customer, ...(data.customer || {}) },
        loss_info: { ...emptyForm().loss_info, ...(data.loss_info || {}) },
        screening_enabled: !!data.screening_enabled,
        screening_only: !!data.screening_only,
      })
      setLoadingJob(false)
    }
    load()
    return () => { cancelled = true }
  }, [isEdit, jobId, profile.role])

  function setCust(k, v) { setForm((f) => ({ ...f, customer: { ...f.customer, [k]: v } })) }
  function setLoss(k, v) { setForm((f) => ({ ...f, loss_info: { ...f.loss_info, [k]: v } })) }

  function validate() {
    const errs = []
    if (!isEdit && !form.job_number.trim()) errs.push('Job number is required')
    if (!form.customer.name.trim()) errs.push('Customer name is required')
    if (!form.customer.address.trim()) errs.push('Property address is required')
    if (!form.customer.phone.trim()) errs.push('Customer phone is required')
    // Water-mit specific fields are required only if NOT a screening-only job
    if (!form.screening_only) {
      if (!form.loss_info.claim_number.trim()) errs.push('Claim number is required')
      if (!form.loss_info.carrier.trim()) errs.push('Insurance carrier is required')
      if (!form.loss_info.date_of_loss) errs.push('Date of loss is required')
      if (!form.loss_info.category) errs.push('Category of water is required')
      if (!form.loss_info.class_of_water) errs.push('Class of water is required')
    }
    return errs
  }

  async function onSubmit(e) {
    e.preventDefault()
    setError(null)
    if (permissionError) {
      setError(permissionError)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    const errs = validate()
    if (errs.length) {
      setError(errs.join(' · '))
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    setSubmitting(true)
    try {
      if (isEdit) {
        // Update — job_number is intentionally excluded; it's the identifier.
        const { error: err } = await supabase
          .from('jobs')
          .update({
            customer: form.customer,
            loss_info: form.loss_info,
            screening_enabled: form.screening_enabled || form.screening_only,
            screening_only: form.screening_only,
          })
          .eq('id', jobId)
        if (err) throw err
        navigate(`/jobs/${jobId}`)
      } else {
        // Create
        const { data, error: err } = await supabase
          .from('jobs')
          .insert({
            tenant_id: profile.tenant_id,
            job_number: form.job_number.trim(),
            customer: form.customer,
            loss_info: form.loss_info,
            status: 'draft',
            screening_enabled: form.screening_enabled || form.screening_only,
            screening_only: form.screening_only,
            created_by: profile.id,
          })
          .select('id')
          .single()
        if (err) {
          if (err.code === '23505') {
            throw new Error(`Job number "${form.job_number}" already exists. Try a different one.`)
          }
          throw err
        }
        navigate(`/jobs/${data.id}`)
      }
    } catch (err) {
      setError(err.message || (isEdit ? 'Failed to save changes.' : 'Failed to create job.'))
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } finally {
      setSubmitting(false)
    }
  }

  const breadcrumb = isEdit
    ? [
        { label: 'Jobs', to: '/jobs' },
        { label: form.job_number || 'Job', to: `/jobs/${jobId}` },
        { label: 'Edit info' },
      ]
    : [
        { label: 'Jobs', to: '/jobs' },
        { label: 'New job' },
      ]

  if (loadingJob) {
    return (
      <div className="min-h-screen bg-ink-50">
        <Header breadcrumb={breadcrumb} />
        <main className="max-w-3xl mx-auto p-4 sm:p-6 text-ink-500">Loading…</main>
      </div>
    )
  }

  if (permissionError) {
    return (
      <div className="min-h-screen bg-ink-50">
        <Header breadcrumb={breadcrumb} />
        <main className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4">
          <div role="alert" className="bg-amber-50 border border-amber-200 text-amber-800 rounded p-3 text-sm">
            {permissionError}
          </div>
          <Link to={isEdit ? `/jobs/${jobId}` : '/jobs'}>
            <Button variant="secondary">← Back to job</Button>
          </Link>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-ink-50">
      <Header breadcrumb={breadcrumb} />
      <main className="max-w-3xl mx-auto p-4 sm:p-6 pb-24">
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          {error && (
            <div role="alert" className="bg-red-50 border border-red-200 text-danger rounded p-3 text-sm">
              {error}
            </div>
          )}

          <Card data-tour="job-number">
            <CardHeader><CardTitle>Job number</CardTitle></CardHeader>
            <CardBody>
              <Input
                label="Job number"
                required={!isEdit}
                placeholder="e.g. WD-2026-0042"
                value={form.job_number}
                onChange={(e) => !isEdit && setForm((f) => ({ ...f, job_number: e.target.value }))}
                disabled={isEdit}
                hint={isEdit
                  ? 'Job number cannot be changed after creation.'
                  : 'Manual entry. Must be unique.'}
              />
            </CardBody>
          </Card>

          <Card data-tour="customer-block">
            <CardHeader><CardTitle>Customer</CardTitle></CardHeader>
            <CardBody className="space-y-4">
              <Input label="Customer name" required value={form.customer.name} onChange={(e) => setCust('name', e.target.value)} />
              <Input label="Property address" required value={form.customer.address} onChange={(e) => setCust('address', e.target.value)} />
              <div className="grid sm:grid-cols-2 gap-4">
                <Input label="Phone" type="tel" required value={form.customer.phone} onChange={(e) => setCust('phone', e.target.value)} />
                <Input label="Email" type="email" value={form.customer.email} onChange={(e) => setCust('email', e.target.value)} />
              </div>
            </CardBody>
          </Card>

          <Card data-tour="job-type">
            <CardHeader><CardTitle>Job type</CardTitle></CardHeader>
            <CardBody className="space-y-2">
              <p className="text-xs text-ink-600 mb-2">
                Pick what kind of work this job is. You can change this later if needed.
              </p>

              <label className="flex items-start gap-2 select-none cursor-pointer p-2.5 rounded border-2 transition-colors"
                style={{ borderColor: (!form.screening_only && !form.screening_enabled) ? '#0061AF' : '#e5e7eb' }}
              >
                <input
                  type="radio"
                  name="job_type"
                  className="w-5 h-5 mt-0.5 shrink-0"
                  checked={!form.screening_only && !form.screening_enabled}
                  onChange={() => setForm((f) => ({ ...f, screening_only: false, screening_enabled: false }))}
                />
                <div>
                  <div className="text-sm font-semibold text-ink-800">Water mitigation only</div>
                  <div className="text-xs text-ink-600">Standard water-loss restoration job. No canine mold screening.</div>
                </div>
              </label>

              <label className="flex items-start gap-2 select-none cursor-pointer p-2.5 rounded border-2 transition-colors"
                style={{ borderColor: form.screening_only ? '#0061AF' : '#e5e7eb' }}
              >
                <input
                  type="radio"
                  name="job_type"
                  className="w-5 h-5 mt-0.5 shrink-0"
                  checked={form.screening_only}
                  onChange={() => setForm((f) => ({ ...f, screening_only: true, screening_enabled: true }))}
                />
                <div>
                  <div className="text-sm font-semibold text-ink-800">Mold screening only</div>
                  <div className="text-xs text-ink-600">Stand-alone canine inspection with Spore. Claim/carrier/category fields become optional.</div>
                </div>
              </label>

              <label className="flex items-start gap-2 select-none cursor-pointer p-2.5 rounded border-2 transition-colors"
                style={{ borderColor: (!form.screening_only && form.screening_enabled) ? '#0061AF' : '#e5e7eb' }}
              >
                <input
                  type="radio"
                  name="job_type"
                  className="w-5 h-5 mt-0.5 shrink-0"
                  checked={!form.screening_only && form.screening_enabled}
                  onChange={() => setForm((f) => ({ ...f, screening_only: false, screening_enabled: true }))}
                />
                <div>
                  <div className="text-sm font-semibold text-ink-800">Water mitigation + mold screening</div>
                  <div className="text-xs text-ink-600">Both flows on one job (e.g. post-remediation clearance screening).</div>
                </div>
              </label>
            </CardBody>
          </Card>

          <Card>
            <CardHeader><CardTitle>Claim &amp; insurance</CardTitle></CardHeader>
            <CardBody className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <Input label="Claim number" required value={form.loss_info.claim_number} onChange={(e) => setLoss('claim_number', e.target.value)} />
                <Input label="Insurance carrier" required value={form.loss_info.carrier} onChange={(e) => setLoss('carrier', e.target.value)} />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <Input label="Adjuster name" value={form.loss_info.adjuster_name} onChange={(e) => setLoss('adjuster_name', e.target.value)} />
                <Input label="Adjuster phone" type="tel" value={form.loss_info.adjuster_phone} onChange={(e) => setLoss('adjuster_phone', e.target.value)} />
              </div>
              <Input label="Adjuster email" type="email" value={form.loss_info.adjuster_email} onChange={(e) => setLoss('adjuster_email', e.target.value)} />
            </CardBody>
          </Card>

          <Card data-tour="loss-info">
            <CardHeader><CardTitle>Loss information</CardTitle></CardHeader>
            <CardBody className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <Input label="Date of loss" type="date" required value={form.loss_info.date_of_loss} onChange={(e) => setLoss('date_of_loss', e.target.value)} />
                <Input label="Date/time of inspection" type="datetime-local" value={form.loss_info.inspection_at} onChange={(e) => setLoss('inspection_at', e.target.value)} />
              </div>
              <Select
                label="Reported source of loss"
                placeholder="Select source"
                value={form.loss_info.source_key}
                onChange={(e) => setLoss('source_key', e.target.value)}
                options={lossSources.data?.items ?? []}
              />
              <Textarea
                label="Source notes"
                rows={2}
                placeholder="e.g. reported by customer/plumber; not verified or repaired by 1-800 WATER DAMAGE of North Dakota."
                value={form.loss_info.source_notes}
                onChange={(e) => setLoss('source_notes', e.target.value)}
              />
              <div className="grid sm:grid-cols-3 gap-4">
                <Select label="Category" required value={form.loss_info.category} onChange={(e) => setLoss('category', e.target.value)} placeholder="—" options={[
                  { key: '1', label: 'Cat 1 (Clean)' },
                  { key: '2', label: 'Cat 2 (Gray)' },
                  { key: '3', label: 'Cat 3 (Black)' },
                ]}/>
                <Select label="Class" required value={form.loss_info.class_of_water} onChange={(e) => setLoss('class_of_water', e.target.value)} placeholder="—" options={[
                  { key: '1', label: 'Class 1' },
                  { key: '2', label: 'Class 2' },
                  { key: '3', label: 'Class 3' },
                  { key: '4', label: 'Class 4' },
                ]}/>
                <Select label="Occupancy" value={form.loss_info.occupancy_key} onChange={(e) => setLoss('occupancy_key', e.target.value)} placeholder="—" options={occupancyOptions.data?.items ?? []}/>
              </div>
              <label className="flex items-center gap-2 select-none">
                <input
                  type="checkbox"
                  className="w-5 h-5 rounded border-ink-300"
                  checked={form.loss_info.emergency_service}
                  onChange={(e) => setLoss('emergency_service', e.target.checked)}
                />
                <span className="text-sm text-ink-700">Emergency service requested</span>
              </label>
            </CardBody>
          </Card>

          <Card>
            <CardHeader><CardTitle>Work authorization</CardTitle></CardHeader>
            <CardBody className="space-y-4">
              <label className="flex items-center gap-2 select-none">
                <input
                  type="checkbox"
                  className="w-5 h-5 rounded border-ink-300"
                  checked={form.loss_info.work_auth_signed}
                  onChange={(e) => setLoss('work_auth_signed', e.target.checked)}
                />
                <span className="text-sm font-semibold text-ink-700">Work authorization signed</span>
              </label>
              {form.loss_info.work_auth_signed && (
                <div className="grid sm:grid-cols-2 gap-4">
                  <Input label="Signed by" value={form.loss_info.work_auth_signed_by} onChange={(e) => setLoss('work_auth_signed_by', e.target.value)} />
                  <Input label="Signed date" type="date" value={form.loss_info.work_auth_signed_at} onChange={(e) => setLoss('work_auth_signed_at', e.target.value)} />
                </div>
              )}
            </CardBody>
          </Card>

          <div className="flex gap-3 sticky bottom-0 sm:static bg-ink-50 sm:bg-transparent py-3 sm:py-0 -mx-4 sm:mx-0 px-4 sm:px-0 border-t sm:border-0 border-ink-200">
            <Link to={isEdit ? `/jobs/${jobId}` : '/jobs'} className="flex-1 sm:flex-none">
              <Button variant="secondary" className="w-full">Cancel</Button>
            </Link>
            <Button type="submit" size="lg" loading={submitting} className="flex-1 sm:flex-none" data-tour="submit-job">
              {isEdit ? 'Save changes' : 'Create job'}
            </Button>
          </div>
        </form>
      </main>
    </div>
  )
}

function emptyForm() {
  return {
    job_number: '',
    screening_enabled: false,
    screening_only: false,
    customer: {
      name: '',
      phone: '',
      email: '',
      address: '',
    },
    loss_info: {
      claim_number: '',
      carrier: '',
      adjuster_name: '',
      adjuster_phone: '',
      adjuster_email: '',
      date_of_loss: '',
      inspection_at: '',
      source_key: '',
      source_notes: '',
      category: '',
      class_of_water: '',
      occupancy_key: '',
      emergency_service: false,
      work_auth_signed: false,
      work_auth_signed_by: '',
      work_auth_signed_at: '',
    },
  }
}
