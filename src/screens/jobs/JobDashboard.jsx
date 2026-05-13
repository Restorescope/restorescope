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

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true); setError(null)
      const { data: j, error: jErr } = await supabase
        .from('jobs')
        .select('id, job_number, customer, loss_info, status, created_at, updated_at, finalized_at, paid_at')
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
          <div className="flex items-center gap-2 shrink-0">
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
