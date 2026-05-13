import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Header, Section, EmptyState, Button, StatusPill, Badge, Input } from '../../ui'

/**
 * JobList — landing page after sign in. Lists jobs for the current tenant,
 * filtered by status and an optional search query.
 *
 * Filters:
 *   active     — draft / in_progress / ready_for_review / unlocked
 *   finalized  — status = 'finalized'
 *   paid       — status = 'paid'
 *   archived   — archived_at IS NOT NULL (out-of-view jobs)
 *   all        — everything except deleted
 *
 * Deleted jobs (deleted_at IS NOT NULL) are always excluded.
 *
 * Search box filters on customer.name, customer.address, customer.phone,
 * customer.email, and job_number. Case-insensitive substring match in JS
 * after the DB query — fine at typical scale (small to mid hundreds of
 * jobs). Switch to server-side ilike if it ever becomes slow.
 */
export default function JobList() {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('active')
  const [search, setSearch] = useState('')
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true); setError(null)
      let q = supabase
        .from('jobs')
        .select('id, job_number, customer, loss_info, status, created_at, updated_at, archived_at, deleted_at, screening_enabled, screening_only')
        .order('updated_at', { ascending: false })

      // Always exclude deleted jobs
      q = q.is('deleted_at', null)

      if (filter === 'active') {
        q = q.is('archived_at', null).in('status', ['draft', 'in_progress', 'ready_for_review', 'unlocked'])
      } else if (filter === 'finalized') {
        q = q.is('archived_at', null).eq('status', 'finalized')
      } else if (filter === 'paid') {
        q = q.is('archived_at', null).eq('status', 'paid')
      } else if (filter === 'archived') {
        q = q.not('archived_at', 'is', null)
      }
      // 'all' adds no further filter

      const { data, error: err } = await q
      if (cancelled) return
      if (err) setError(err.message)
      else setJobs(data ?? [])
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [filter])

  // Client-side search across customer fields and job number
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return jobs
    return jobs.filter((j) => {
      const c = j.customer || {}
      const haystack = [
        j.job_number,
        c.name, c.address, c.phone, c.email,
      ].filter(Boolean).join(' ').toLowerCase()
      return haystack.includes(q)
    })
  }, [jobs, search])

  const filterLabel = ({
    active:    'Active jobs',
    finalized: 'Finalized',
    paid:      'Paid · Closed',
    archived:  'Archived',
    all:       'All jobs',
  })[filter] || 'Jobs'

  return (
    <div className="min-h-screen bg-ink-50">
      <Header breadcrumb={[{ label: 'Jobs' }]} />
      <main className="max-w-7xl mx-auto p-4 sm:p-6 pb-24 sm:pb-6" data-tour="jobs-list">
        {/* Search bar */}
        <div className="mb-4">
          <Input
            type="search"
            placeholder="Search by customer name, address, phone, or job number…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <p className="text-xs text-ink-500 mt-1">
              {filtered.length} {filtered.length === 1 ? 'match' : 'matches'} in {filterLabel.toLowerCase()}
            </p>
          )}
        </div>

        <Section
          title={filterLabel}
          description={
            filter === 'archived'
              ? 'Jobs moved out of your active workspace. Data is preserved. Open one to reactivate.'
              : 'Tap a job to continue documenting.'
          }
          action={
            <div className="flex gap-2 items-center flex-wrap">
              <FilterTab current={filter} value="active"    onClick={setFilter}>Active</FilterTab>
              <FilterTab current={filter} value="finalized" onClick={setFilter}>Finalized</FilterTab>
              <FilterTab current={filter} value="paid"      onClick={setFilter}>Paid</FilterTab>
              <FilterTab current={filter} value="archived"  onClick={setFilter}>Archived</FilterTab>
              <FilterTab current={filter} value="all"       onClick={setFilter}>All</FilterTab>
              <Link to="/jobs/new" className="hidden sm:inline-block ml-2" data-tour="new-job-button">
                <Button variant="accent" size="sm">+ New job</Button>
              </Link>
            </div>
          }
        >
          {error && <p className="text-sm text-danger mb-3">Couldn't load jobs: {error}</p>}

          {loading ? (
            <p className="text-ink-500 text-sm">Loading…</p>
          ) : filtered.length === 0 ? (
            search ? (
              <EmptyState
                title="No matches"
                body={`No jobs match "${search}" in ${filterLabel.toLowerCase()}. Try a different search or switch tabs.`}
              />
            ) : filter === 'archived' ? (
              <EmptyState
                title="No archived jobs"
                body="When you're done with a job and want to clear it from view, use the Archive button on the job dashboard."
              />
            ) : (
              <EmptyState
                title="No jobs yet"
                body="Create your first job. Once you've added rooms, readings, equipment, and photos, you can generate a full PDF report."
                action={
                  <Link to="/jobs/new">
                    <Button size="lg">+ Create your first job</Button>
                  </Link>
                }
              />
            )
          ) : (
            <ul className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {filtered.map((job) => <JobCard key={job.id} job={job} />)}
            </ul>
          )}
        </Section>
      </main>

      {/* Mobile floating action button */}
      <Link
        to="/jobs/new"
        className="sm:hidden fixed bottom-5 right-5 bg-brand-yellow text-brand-blue-dark
                   rounded-full h-14 w-14 flex items-center justify-center shadow-card-hover
                   font-bold text-2xl border border-brand-yellow-dark"
        aria-label="New job"
      >
        +
      </Link>
    </div>
  )
}

function FilterTab({ current, value, onClick, children }) {
  const active = current === value
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className={`px-3 h-9 text-sm font-semibold rounded border transition-colors
        ${active
          ? 'bg-brand-blue text-white border-brand-blue'
          : 'bg-white text-ink-700 border-ink-300 hover:bg-ink-100'}`}
    >
      {children}
    </button>
  )
}

function JobCard({ job }) {
  const customer = job.customer || {}
  const loss = job.loss_info || {}
  const isArchived = !!job.archived_at
  return (
    <li>
      <Link
        to={`/jobs/${job.id}`}
        className={`block bg-white border border-ink-200 border-l-[3px] rounded-md p-4 hover:shadow-card-hover transition-shadow
                    ${isArchived ? 'border-l-ink-400 opacity-75' : 'border-l-brand-blue'}`}
      >
        <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
          <span className="font-condensed font-bold text-brand-blue tracking-wide text-base">
            {job.job_number || '—'}
          </span>
          <div className="flex items-center gap-1 flex-wrap">
            {isArchived && <Badge tone="neutral">Archived</Badge>}
            <StatusPill status={job.status} />
          </div>
        </div>
        <h3 className="font-semibold text-ink-900 truncate">
          {customer.name || 'Unnamed customer'}
        </h3>
        <p className="text-sm text-ink-600 truncate">
          {customer.address || '—'}
        </p>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {job.screening_only && <Badge tone="yellow">Mold Screening</Badge>}
          {job.screening_enabled && !job.screening_only && <Badge tone="yellow">+ Screening</Badge>}
          {loss.carrier   && <Badge tone="blue">{loss.carrier}</Badge>}
          {loss.category  && <Badge tone="neutral">Cat {loss.category}</Badge>}
          {loss.class_of_water && <Badge tone="neutral">Class {loss.class_of_water}</Badge>}
        </div>
      </Link>
    </li>
  )
}
