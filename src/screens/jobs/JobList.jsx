import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Header, Section, EmptyState, Button, StatusPill, Badge } from '../../ui'

/**
 * JobList — landing page after sign in. Lists all jobs for the current tenant,
 * filtered by status. RLS automatically scopes to tenant_id.
 */
export default function JobList() {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('active')
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true); setError(null)
      let q = supabase
        .from('jobs')
        .select('id, job_number, customer, loss_info, status, created_at, updated_at')
        .order('updated_at', { ascending: false })
      if (filter === 'active') {
        q = q.in('status', ['draft', 'in_progress', 'ready_for_review', 'unlocked'])
      } else if (filter === 'finalized') {
        q = q.eq('status', 'finalized')
      } else if (filter === 'paid') {
        q = q.eq('status', 'paid')
      }
      const { data, error: err } = await q
      if (cancelled) return
      if (err) setError(err.message)
      else setJobs(data ?? [])
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [filter])

  return (
    <div className="min-h-screen bg-ink-50">
      <Header breadcrumb={[{ label: 'Jobs' }]} />
      <main className="max-w-7xl mx-auto p-4 sm:p-6 pb-24 sm:pb-6" data-tour="jobs-list">
        <Section
          title={filter === 'active' ? 'Active jobs' : filter === 'finalized' ? 'Finalized' : filter === 'paid' ? 'Paid · Closed' : 'All jobs'}
          description="Tap a job to continue documenting."
          action={
            <div className="flex gap-2 items-center">
              <FilterTab current={filter} value="active"    onClick={setFilter}>Active</FilterTab>
              <FilterTab current={filter} value="finalized" onClick={setFilter}>Finalized</FilterTab>
              <FilterTab current={filter} value="paid"      onClick={setFilter}>Paid</FilterTab>
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
          ) : jobs.length === 0 ? (
            <EmptyState
              title="No jobs yet"
              body="Create your first mitigation job. Once you've added rooms, readings, equipment, and photos, you can generate a full PDF report."
              action={
                <Link to="/jobs/new">
                  <Button size="lg">+ Create your first job</Button>
                </Link>
              }
            />
          ) : (
            <ul className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {jobs.map((job) => <JobCard key={job.id} job={job} />)}
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
  return (
    <li>
      <Link
        to={`/jobs/${job.id}`}
        className="block bg-white border border-ink-200 border-l-[3px] border-l-brand-blue rounded-md p-4 hover:shadow-card-hover transition-shadow"
      >
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="font-condensed font-bold text-brand-blue tracking-wide text-base">
            {job.job_number || '—'}
          </span>
          <StatusPill status={job.status} />
        </div>
        <h3 className="font-semibold text-ink-900 truncate">
          {customer.name || 'Unnamed customer'}
        </h3>
        <p className="text-sm text-ink-600 truncate">
          {customer.address || '—'}
        </p>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {loss.carrier   && <Badge tone="blue">{loss.carrier}</Badge>}
          {loss.category  && <Badge tone="neutral">Cat {loss.category}</Badge>}
          {loss.class_of_water && <Badge tone="neutral">Class {loss.class_of_water}</Badge>}
        </div>
      </Link>
    </li>
  )
}
