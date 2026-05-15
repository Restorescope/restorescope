import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth.jsx'
import { useSetting } from '../../lib/settings'
import { evaluateJob } from '../../lib/qc'
import {
  Header, BottomNav, Section, Button, Card, CardBody, StatusPill, Badge,
} from '../../ui'
import QCBanner from '../../components/QCBanner'
import PhotoRequirementsChecklist from '../../components/PhotoRequirementsChecklist'

/**
 * JobDashboard — single job overview, redesigned per locked mockup.
 *
 * Layout (top → bottom):
 *   1. Header with breadcrumb "Jobs / WD-2026-0042"
 *   2. Customer name as page hero (Barlow Condensed)
 *   3. Address + phone
 *   4. Status pill (top right)
 *   5. Five stat cards: Claim, Carrier, Source, Cat/Class, Days since loss
 *   6. Quick badges: Work auth, Emergency
 *   7. QC card (blue left border) with passing/warning/blocking pills + open review
 *   8. DOCUMENTATION eyebrow + section tiles with friendly subtitles
 */
export default function JobDashboard() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const qcRules = useSetting('qc_rules')
  const [job, setJob] = useState(null)
  const [counts, setCounts] = useState({})
  const [extras, setExtras] = useState({ rooms: [], dryReadingCount: 0, equipDaysOnSite: 0, monitoringTrend: null, scopeMissingReasons: 0, photoCategoryCount: 0 })
  const [qcResults, setQcResults] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showDuplicate, setShowDuplicate] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const [newJobNumber, setNewJobNumber] = useState('')
  const [showArchive, setShowArchive] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true); setError(null)
      const { data: j, error: jErr } = await supabase
        .from('jobs')
        .select('id, job_number, customer, loss_info, status, created_at, updated_at, finalized_at, paid_at, archived_at, deleted_at, screening_enabled, screening_only, work_types_performed, photo_requirements_enabled')
        .eq('id', id)
        .maybeSingle()
      if (cancelled) return
      if (jErr || !j) { setError(jErr?.message || 'Job not found'); setLoading(false); return }
      setJob(j)

      // Counts (head-only) for tile badges
      const [rooms, readings, equip, visits, photos, scope] = await Promise.all([
        supabase.from('affected_rooms').select('id, room_name, chamber_id', { count: 'exact' }).eq('job_id', id),
        supabase.from('moisture_readings').select('id, status, ambient_rh, captured_at', { count: 'exact' }).eq('job_id', id),
        supabase.from('equipment_events').select('event_type, event_at', { count: 'exact' }).eq('job_id', id),
        supabase.from('monitoring_visits').select('ambient_rh, visit_at', { count: 'exact' }).eq('job_id', id),
        supabase.from('photos').select('category', { count: 'exact' }).eq('job_id', id),
        supabase.from('scope_items').select('id, reason_text', { count: 'exact' }).eq('job_id', id),
      ])
      if (cancelled) return
      setCounts({
        rooms: rooms.count ?? 0,
        readings: readings.count ?? 0,
        equipment: equip.count ?? 0,
        monitoring: visits.count ?? 0,
        photos: photos.count ?? 0,
        scope: scope.count ?? 0,
      })

      // Friendly subtitles & threshold logic
      const dryReadingCount = (readings.data || []).filter((r) => r.status === 'dry').length
      const equipDaysOnSite = computeEquipmentDays(equip.data || [])
      const monitoringTrend = computeRhTrend(visits.data || [])
      const scopeMissingReasons = (scope.data || []).filter((s) => !s.reason_text || !s.reason_text.trim()).length
      const photoCategoryCount = new Set((photos.data || []).map((p) => p.category)).size
      setExtras({
        rooms: rooms.data || [],
        dryReadingCount,
        equipDaysOnSite,
        monitoringTrend,
        scopeMissingReasons,
        photoCategoryCount,
      })
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [id])

  // Run QC engine after qc_rules + job loaded; re-run when counts change
  useEffect(() => {
    if (!qcRules.data?.rules || !job) return
    let cancelled = false
    evaluateJob(id, qcRules.data.rules)
      .then(({ results }) => { if (!cancelled) setQcResults(results) })
      .catch(() => {})
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, qcRules.data, counts])

  /**
   * duplicateJob — creates a fresh draft job with the same customer info
   * and job-type flags. Claim/loss info, status, dates, and number reset.
   * After successful insert, navigates to the new job's dashboard.
   */
  async function duplicateJob() {
    if (!newJobNumber.trim()) {
      setError('New job number is required.')
      return
    }
    setDuplicating(true); setError(null)
    try {
      const payload = {
        tenant_id: profile.tenant_id,
        job_number: newJobNumber.trim(),
        customer: job.customer,
        loss_info: {
          source_key: job.loss_info?.source_key || null,
          category: job.loss_info?.category || null,
          class: job.loss_info?.class || null,
          // Reset claim-specific fields
          claim_number: '',
          carrier: '',
          date_of_loss: '',
          inspection_at: '',
        },
        screening_enabled: job.screening_enabled || false,
        screening_only: job.screening_only || false,
        status: 'active',
      }
      const { data, error: err } = await supabase
        .from('jobs')
        .insert(payload)
        .select('id')
        .single()
      if (err) {
        if (err.message?.includes('duplicate') || err.code === '23505') {
          throw new Error(`Job number "${newJobNumber.trim()}" already exists. Try a different one.`)
        }
        throw err
      }
      // Navigate to new job
      setShowDuplicate(false)
      navigate(`/jobs/${data.id}`)
    } catch (e) {
      setError(e.message)
    } finally {
      setDuplicating(false)
    }
  }

  /**
   * archiveJob — marks the job as archived. Reversible from the archived
   * filter on the jobs list. Doesn't delete any data — just hides from
   * default views. Both Owner and PM can run this.
   */
  async function archiveJob() {
    setArchiving(true); setError(null)
    try {
      const { error: err } = await supabase
        .from('jobs')
        .update({
          archived_at: new Date().toISOString(),
          archived_by: profile.id,
        })
        .eq('id', id)
      if (err) throw err
      setShowArchive(false)
      navigate('/jobs')
    } catch (e) {
      setError(e.message)
    } finally {
      setArchiving(false)
    }
  }

  /**
   * deleteJob — Owner-only. Marks the job as deleted (soft delete). Customer
   * must type the job number to confirm; this prevents accidental deletion.
   * Data is preserved in the DB but excluded from all UI views.
   */
  async function deleteJob() {
    if (deleteConfirmInput.trim() !== job.job_number) {
      setError(`To confirm deletion, type the job number exactly: ${job.job_number}`)
      return
    }
    setDeleting(true); setError(null)
    try {
      const { error: err } = await supabase
        .from('jobs')
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: profile.id,
        })
        .eq('id', id)
      if (err) throw err
      setShowDelete(false)
      navigate('/jobs')
    } catch (e) {
      setError(e.message)
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-ink-50">
        <Header breadcrumb={[{ label: 'Jobs', to: '/jobs' }, { label: 'Loading…' }]} />
        <main className="max-w-5xl mx-auto p-4 sm:p-6 text-ink-500">Loading…</main>
      </div>
    )
  }
  if (error || !job) {
    return (
      <div className="min-h-screen bg-ink-50">
        <Header breadcrumb={[{ label: 'Jobs', to: '/jobs' }, { label: 'Not found' }]} />
        <main className="max-w-5xl mx-auto p-4 sm:p-6">
          <p className="text-danger mb-3">{error || 'Job not found.'}</p>
          <Button onClick={() => navigate('/jobs')}>Back to jobs</Button>
        </main>
      </div>
    )
  }

  const customer = job.customer || {}
  const loss = job.loss_info || {}
  const daysSinceLoss = loss.date_of_loss ? daysBetween(loss.date_of_loss) : null
  const isFinalized = job.status === 'finalized' || job.status === 'paid'

  // QC summary for banner
  const blocks = qcResults.filter((r) => !r.ok && r.level === 'block')
  const warns  = qcResults.filter((r) => !r.ok && r.level === 'warn')
  const passes = qcResults.filter((r) => r.ok)

  return (
    <div className="min-h-screen bg-ink-50">
      <Header breadcrumb={[
        { label: 'Jobs', to: '/jobs' },
        { label: job.job_number || 'Job' },
      ]} />

      <main className="max-w-5xl mx-auto p-4 sm:p-6 pb-24 sm:pb-6">

        {/* Archived banner */}
        {job.archived_at && (
          <div className="bg-amber-50 border border-amber-200 rounded p-3 mb-4 flex items-start gap-3 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <p className="font-semibold text-amber-900 text-sm">📦 This job is archived</p>
              <p className="text-xs text-amber-800 mt-0.5">
                Archived on {new Date(job.archived_at).toLocaleDateString()}. Hidden from the active jobs list, but all data is preserved.
              </p>
            </div>
            {(profile?.role === 'owner' || profile?.role === 'pm') && (
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  setError(null)
                  const { error: err } = await supabase
                    .from('jobs')
                    .update({ archived_at: null, archived_by: null })
                    .eq('id', id)
                  if (err) setError(err.message)
                  else window.location.reload()
                }}
              >
                Reactivate
              </Button>
            )}
          </div>
        )}

        {/* Page hero */}
        <div className="flex justify-between items-start gap-3 mb-1">
          <div>
            <h1 className="font-condensed font-bold text-3xl sm:text-4xl text-ink-900 leading-none tracking-wide">
              {customer.name || 'Unnamed customer'}
            </h1>
            <p className="text-sm text-ink-600 mt-2">
              {customer.address || '—'}
              {customer.phone && <span className="ml-2">· {customer.phone}</span>}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            <StatusPill status={job.status} />
            {(profile?.role === 'owner' || profile?.role === 'pm') && (
              <Link to={`/jobs/${id}/edit`}>
                <Button variant="secondary" size="sm">Edit info</Button>
              </Link>
            )}
            {(profile?.role === 'owner' || profile?.role === 'pm') && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowDuplicate(true)}
              >
                Duplicate
              </Button>
            )}
            {(profile?.role === 'owner' || profile?.role === 'pm') && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowArchive(true)}
              >
                Archive
              </Button>
            )}
            {profile?.role === 'owner' && (
              <Button
                size="sm"
                onClick={() => setShowDelete(true)}
                className="!bg-red-600 hover:!bg-red-700 !text-white !border-red-600"
              >
                Delete
              </Button>
            )}
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mt-4 mb-3">
          <StatCard label="Claim #" value={loss.claim_number || '—'} mono />
          <StatCard label="Carrier" value={loss.carrier || '—'} />
          <StatCard label="Source" value={prettyKey(loss.source_key) || '—'} />
          <StatCard label="Cat / Class" value={catClass(loss)} />
          {!isFinalized && daysSinceLoss != null && (
            <StatCard label="Days since loss" value={daysSinceLoss.toString()} mono />
          )}
          {isFinalized && job.status === 'paid' && job.paid_at && (
            <StatCard label="Paid · closed" value={shortDate(job.paid_at)} />
          )}
          {isFinalized && job.status === 'finalized' && job.finalized_at && (
            <StatCard label="Finalized" value={shortDate(job.finalized_at)} />
          )}
        </div>

        {/* Quick badges */}
        <div className="flex flex-wrap gap-2 mb-5">
          {loss.work_auth_signed
            ? <Badge tone="green">✓ Work auth signed</Badge>
            : <Badge tone="red">✕ Work auth missing</Badge>}
          {loss.emergency_service && <Badge tone="amber">⚡ Emergency service</Badge>}
          {loss.adjuster_name && <Badge tone="neutral">Adjuster: {loss.adjuster_name}</Badge>}
        </div>

        {/* QC card */}
        <Card accent="blue" className="mb-5">
          <CardBody>
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="text-base font-semibold text-ink-900">Quality control</h2>
              <Link to={`/jobs/${id}/review`} className="text-sm text-brand-blue font-semibold hover:underline">
                Open review →
              </Link>
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              {blocks.length > 0 && <Badge tone="red">{blocks.length} blocking</Badge>}
              {warns.length  > 0 && <Badge tone="amber">{warns.length} warning{warns.length === 1 ? '' : 's'}</Badge>}
              {passes.length > 0 && <Badge tone="green">{passes.length} passing</Badge>}
              {qcResults.length === 0 && <Badge tone="neutral">Loading checks…</Badge>}
            </div>
            <QCBanner issues={[
              ...blocks.slice(0, 3).map((b) => ({ key: b.rule_key, level: b.level, label: b.detail || b.label })),
              ...(blocks.length === 0 ? warns.slice(0, 2).map((w) => ({ key: w.rule_key, level: w.level, label: w.detail || w.label })) : []),
            ]} />
          </CardBody>
        </Card>

        {/* Photo documentation */}
        <Card accent="yellow" className="mb-5">
          <CardBody>
            <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
              <h2 className="text-base font-semibold text-ink-900">📸 Photo documentation</h2>
              <Link to={`/jobs/${id}/photos`} className="text-sm text-brand-blue font-semibold hover:underline">
                Open photos →
              </Link>
            </div>
            <WorkTypesPicker job={job} onSaved={(updates) => setJob((j) => ({ ...j, ...updates }))} />
            <div className="mt-3">
              <PhotoRequirementsChecklist jobId={id} compact />
            </div>
          </CardBody>
        </Card>

        {/* Documentation tiles */}
        <Section title="Documentation" description="Tap a section to add or edit." eyebrow>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            <SectionTile
              to={`/jobs/${id}/rooms`}
              title="Affected rooms"
              count={counts.rooms}
              subtitle={roomsSubtitle(extras.rooms)}
            />
            <SectionTile
              to={`/jobs/${id}/readings`}
              title="Moisture readings"
              count={counts.readings}
              subtitle={readingsSubtitle(counts.readings, extras.dryReadingCount)}
            />
            <SectionTile
              to={`/jobs/${id}/equipment`}
              title="Equipment"
              count={counts.equipment}
              subtitle={equipmentSubtitle(counts.equipment, extras.equipDaysOnSite)}
              warning={extras.equipDaysOnSite >= 4}
              warningValue={`${extras.equipDaysOnSite}d`}
            />
            <SectionTile
              to={`/jobs/${id}/monitoring`}
              title="Daily monitoring"
              count={counts.monitoring}
              subtitle={monitoringSubtitle(counts.monitoring, extras.monitoringTrend)}
            />
            <SectionTile
              to={`/jobs/${id}/photos`}
              title="Photos"
              count={counts.photos}
              subtitle={photosSubtitle(counts.photos, extras.photoCategoryCount)}
            />
            <SectionTile
              to={`/jobs/${id}/voice-notes`}
              title="🎙️ Voice notes"
              subtitle="Hands-free note capture with AI transcription"
            />
            <SectionTile
              to={`/jobs/${id}/scope`}
              title="Scope"
              count={counts.scope}
              subtitle={scopeSubtitle(counts.scope, extras.scopeMissingReasons)}
              warning={extras.scopeMissingReasons > 0}
              warningValue={`${extras.scopeMissingReasons} missing`}
            />
            <SectionTile
              to={`/jobs/${id}/estimates`}
              title="Estimates"
              subtitle="NTE pricing for the customer"
            />
            <SectionTile
              to={`/jobs/${id}/screening`}
              title="Mold Screening"
              subtitle="Spore canine inspection"
            />
            <SectionTile
              to={`/jobs/${id}/review`}
              title="Review"
              subtitle={blocks.length > 0 ? `${blocks.length} blocking` : warns.length > 0 ? `${warns.length} warnings` : 'Ready to finalize'}
              warning={blocks.length > 0}
            />
            <SectionTile
              to={`/jobs/${id}/report`}
              title="Report"
              subtitle="Generate PDF"
            />
          </ul>
        </Section>

      </main>

      <BottomNav jobId={id} />

      {/* Duplicate-job confirmation modal */}
      {showDuplicate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-4 space-y-3">
            <h3 className="font-condensed font-bold text-brand-blue text-lg tracking-wide">
              Duplicate this job?
            </h3>
            <p className="text-sm text-ink-700">
              A new job will be created with the same customer info and job type.
              The claim number, date of loss, and inspection date will be blank for you to fill in.
            </p>
            <div className="bg-ink-50 border border-ink-200 rounded p-3 text-xs text-ink-700 space-y-1">
              <div><strong>Customer:</strong> {job.customer?.name || '—'}</div>
              <div><strong>Address:</strong> {job.customer?.address || '—'}</div>
              <div><strong>Phone:</strong> {job.customer?.phone || '—'}</div>
              <div className="text-ink-500 italic mt-1">
                {job.screening_only ? 'Mold screening only' : job.screening_enabled ? 'Water mit + screening' : 'Water mitigation only'}
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-ink-700 mb-1">
                New job number <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                value={newJobNumber}
                onChange={(e) => setNewJobNumber(e.target.value)}
                placeholder="e.g. WD-2026-0099"
                className="w-full px-3 py-2 border border-ink-300 rounded text-sm"
                autoFocus
              />
              <p className="text-xs text-ink-500 mt-1">Must be unique.</p>
            </div>
            {error && (
              <div role="alert" className="bg-red-50 border border-red-200 text-danger rounded p-2 text-xs">
                {error}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="ghost"
                onClick={() => { setShowDuplicate(false); setNewJobNumber(''); setError(null) }}
              >
                Cancel
              </Button>
              <Button onClick={duplicateJob} loading={duplicating}>
                Create duplicate
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Archive confirmation modal */}
      {showArchive && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-4 space-y-3">
            <h3 className="font-condensed font-bold text-brand-blue text-lg tracking-wide">
              Archive this job?
            </h3>
            <p className="text-sm text-ink-700">
              Archive removes this job from your active jobs list so it doesn't clutter your view.
              All data is preserved — you can find it later under the <strong>Archived</strong> filter
              tab and reactivate it anytime.
            </p>
            <div className="bg-ink-50 border border-ink-200 rounded p-3 text-xs text-ink-700 space-y-1">
              <div><strong>Job:</strong> {job.job_number}</div>
              <div><strong>Customer:</strong> {job.customer?.name || '—'}</div>
              <div><strong>Status:</strong> {job.status}</div>
            </div>
            {error && (
              <div role="alert" className="bg-red-50 border border-red-200 text-danger rounded p-2 text-xs">
                {error}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => { setShowArchive(false); setError(null) }}>
                Cancel
              </Button>
              <Button onClick={archiveJob} loading={archiving}>
                Archive job
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal (Owner-only) */}
      {showDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-4 space-y-3 border-2 border-red-200">
            <h3 className="font-condensed font-bold text-red-700 text-lg tracking-wide">
              ⚠ Permanently delete this job?
            </h3>
            <p className="text-sm text-ink-800">
              This removes the job from view as if it never existed. Use this for jobs that
              shouldn't have been created — customer backed out, test jobs, duplicates.
            </p>
            <p className="text-sm text-ink-700">
              <strong>For finished jobs you just want to clear from view, use Archive instead.</strong>
            </p>
            <div className="bg-red-50 border border-red-200 rounded p-3 text-xs text-red-900 space-y-1">
              <div><strong>Job:</strong> {job.job_number}</div>
              <div><strong>Customer:</strong> {job.customer?.name || '—'}</div>
              <div><strong>Status:</strong> {job.status}</div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-ink-800 mb-1">
                To confirm, type the job number: <span className="font-mono text-red-700">{job.job_number}</span>
              </label>
              <input
                type="text"
                value={deleteConfirmInput}
                onChange={(e) => setDeleteConfirmInput(e.target.value)}
                placeholder={job.job_number}
                className="w-full px-3 py-2 border border-red-300 rounded text-sm font-mono"
                autoFocus
              />
            </div>
            {error && (
              <div role="alert" className="bg-red-50 border border-red-200 text-danger rounded p-2 text-xs">
                {error}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => {
                setShowDelete(false); setDeleteConfirmInput(''); setError(null)
              }}>
                Cancel
              </Button>
              <Button
                onClick={deleteJob}
                loading={deleting}
                disabled={deleteConfirmInput.trim() !== job.job_number}
                className="!bg-red-600 hover:!bg-red-700 !text-white"
              >
                Delete permanently
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// =========================================================================
// Stat card
// =========================================================================

function StatCard({ label, value, mono = false }) {
  return (
    <div className="bg-white border border-ink-200 rounded-md px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold text-ink-900 truncate ${mono ? 'font-condensed text-base text-brand-blue tracking-wide' : ''}`}>
        {value}
      </div>
    </div>
  )
}

// =========================================================================
// Section tile (locked mockup pattern)
// =========================================================================

function SectionTile({ to, title, count, subtitle, warning = false, warningValue }) {
  const accentClass = warning ? 'border-l-brand-yellow' : 'border-l-brand-blue'
  const badgeClass = warning
    ? 'bg-brand-yellow text-brand-blue-dark'
    : 'bg-brand-blue text-white'
  return (
    <li>
      <Link
        to={to}
        className={`block bg-white border border-ink-200 border-l-[3px] ${accentClass}
                    rounded-md px-3.5 py-3 hover:shadow-card-hover transition-shadow`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-semibold text-ink-900 text-sm">{title}</div>
            <div className="text-xs text-ink-500 mt-0.5 truncate">{subtitle || '\u00A0'}</div>
          </div>
          {(count != null || warningValue) && (
            <span className={`shrink-0 px-2 py-0.5 rounded text-xs font-semibold ${badgeClass}`}>
              {warning && warningValue ? warningValue : count}
            </span>
          )}
        </div>
      </Link>
    </li>
  )
}

// =========================================================================
// Subtitle generators
// =========================================================================

function roomsSubtitle(rooms) {
  if (!rooms.length) return 'No rooms yet'
  const names = rooms.slice(0, 2).map((r) => r.room_name).filter(Boolean)
  const more = rooms.length - names.length
  return more > 0 ? `${names.join(' · ')} · ${more} more` : names.join(' · ')
}
function readingsSubtitle(total, dry) {
  if (total === 0) return 'No readings yet'
  if (dry > 0) return `${total} captured · ${dry} dry`
  return `${total} captured`
}
function equipmentSubtitle(total, days) {
  if (total === 0) return 'None placed'
  return `${total} events · ${days}d on site`
}
function monitoringSubtitle(total, trend) {
  if (total === 0) return 'No visits yet'
  if (trend === 'improving') return `${total} visits · improving`
  if (trend === 'worsening') return `${total} visits · worsening`
  return `${total} visit${total === 1 ? '' : 's'}`
}
function photosSubtitle(total, categories) {
  if (total === 0) return 'No photos yet'
  return `${total} captured · ${categories} categor${categories === 1 ? 'y' : 'ies'}`
}
function scopeSubtitle(total, missing) {
  if (total === 0) return 'No items yet'
  if (missing > 0) return `${total} items · ${missing} missing reason`
  return `${total} item${total === 1 ? '' : 's'}`
}

// =========================================================================
// Helpers
// =========================================================================

function prettyKey(key) {
  if (!key) return null
  return String(key).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
function catClass(loss) {
  if (!loss) return '—'
  const cat = loss.category ? `Cat ${loss.category}` : null
  const cls = loss.class_of_water ? `Class ${loss.class_of_water}` : null
  if (cat && cls) return `${cat} · ${cls}`
  return cat || cls || '—'
}
function daysBetween(iso) {
  const a = new Date(iso)
  if (!Number.isFinite(a.getTime())) return null
  const ms = Date.now() - a.getTime()
  return Math.max(0, Math.floor(ms / 86400000))
}
function shortDate(iso) {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
function computeEquipmentDays(events) {
  const placed = events.filter((e) => e.event_type === 'placed')
  if (placed.length === 0) return 0
  const earliest = placed.reduce((min, e) => {
    const t = new Date(e.event_at).getTime()
    return t < min ? t : min
  }, Infinity)
  if (!Number.isFinite(earliest)) return 0
  return Math.floor((Date.now() - earliest) / 86400000)
}
function computeRhTrend(visits) {
  const withRh = visits.filter((v) => v.ambient_rh != null)
  if (withRh.length < 2) return null
  withRh.sort((a, b) => new Date(a.visit_at) - new Date(b.visit_at))
  const first = withRh[0].ambient_rh
  const last = withRh[withRh.length - 1].ambient_rh
  if (last < first - 2) return 'improving'
  if (last > first + 2) return 'worsening'
  return 'stable'
}

// ============================================================================
// Work types picker — manual multi-select for which work was performed.
// Used by the photo requirements engine to fire work-type-specific requirements.
// ============================================================================
const WORK_TYPE_OPTIONS = [
  { key: 'drywall_removal',    label: 'Drywall removal' },
  { key: 'carpet_removal',     label: 'Carpet / pad removal' },
  { key: 'baseboard_removal',  label: 'Baseboard removal' },
  { key: 'cabinet_removal',    label: 'Cabinet / vanity removal' },
  { key: 'hardwood_removal',   label: 'Hardwood removal' },
  { key: 'vinyl_removal',      label: 'Vinyl / LVP / laminate removal' },
  { key: 'tile_removal',       label: 'Tile removal' },
  { key: 'subfloor_removal',   label: 'Subfloor removal' },
  { key: 'insulation_removal', label: 'Insulation removal' },
  { key: 'ceiling_removal',    label: 'Ceiling material removal' },
  { key: 'concrete_grinding',  label: 'Concrete grinding' },
  { key: 'trim_removal',       label: 'Trim / door removal' },
]

function WorkTypesPicker({ job, onSaved }) {
  const [selected, setSelected] = useState(new Set(job.work_types_performed || []))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState(false)

  async function toggle(key) {
    const next = new Set(selected)
    if (next.has(key)) next.delete(key); else next.add(key)
    setSelected(next)
    setSaving(true); setError(null)
    try {
      const arr = Array.from(next)
      const { error: e } = await supabase
        .from('jobs')
        .update({ work_types_performed: arr })
        .eq('id', job.id)
      if (e) throw e
      onSaved?.({ work_types_performed: arr })
    } catch (e) {
      setError(e.message)
      setSelected(new Set(job.work_types_performed || []))
    } finally {
      setSaving(false)
    }
  }

  const summary = selected.size === 0
    ? 'No work types selected — only universal requirements will apply'
    : `${selected.size} work type${selected.size === 1 ? '' : 's'} selected`

  return (
    <div className="border border-ink-200 rounded p-3 bg-white">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-ink-900">Work performed on this job</p>
          <p className="text-xs text-ink-500 mt-0.5">{summary}</p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="text-xs text-brand-blue underline hover:no-underline"
        >
          {expanded ? 'Hide' : 'Edit'}
        </button>
      </div>
      {expanded && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {WORK_TYPE_OPTIONS.map((wt) => (
            <label key={wt.key} className="flex items-start gap-2 text-sm cursor-pointer p-1.5 rounded hover:bg-ink-50">
              <input
                type="checkbox"
                checked={selected.has(wt.key)}
                onChange={() => toggle(wt.key)}
                disabled={saving}
                className="mt-0.5"
              />
              <span>{wt.label}</span>
            </label>
          ))}
        </div>
      )}
      {error && <p className="text-xs text-danger mt-2">{error}</p>}
    </div>
  )
}
