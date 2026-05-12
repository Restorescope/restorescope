import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { pdf } from '@react-pdf/renderer'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth.jsx'
import { loadReportSnapshot } from '../../lib/pdf/snapshot'
import Report from '../../lib/pdf/Report'
import {
  Header, BottomNav, Section, Button, Card, CardHeader, CardBody, CardTitle,
  Badge,
} from '../../ui'

/**
 * ReportScreen — generates a branded PDF mitigation report for the current job.
 *
 * Flow:
 *   1. User lands here, sees "Generate report" button + summary of what'll be in it
 *   2. Click Generate → loads full snapshot (with photo dataURLs), renders PDF
 *   3. PDF is offered as download AND uploaded to the `reports` storage bucket
 *   4. A row is inserted in the `reports` table for the report history
 */
export default function ReportScreen() {
  const { id: jobId } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [job, setJob] = useState(null)
  const [reports, setReports] = useState([])
  const [error, setError] = useState(null)
  const [progress, setProgress] = useState(null)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [jobRes, reportsRes] = await Promise.all([
        supabase.from('jobs').select('id, job_number, customer, status, finalized_at').eq('id', jobId).maybeSingle(),
        supabase.from('reports').select('id, status, finalized_at, generated_at, storage_path').eq('job_id', jobId).order('generated_at', { ascending: false }),
      ])
      if (cancelled) return
      if (jobRes.error || !jobRes.data) {
        setError(jobRes.error?.message || 'Job not found')
        return
      }
      setJob(jobRes.data)
      setReports(reportsRes.data || [])
    }
    load()
    return () => { cancelled = true }
  }, [jobId])

  async function generate() {
    setError(null); setGenerating(true)
    try {
      setProgress('Loading job data…')
      const snapshot = await loadReportSnapshot(jobId)

      setProgress(`Rendering report (${snapshot.photos.length} photos)…`)
      const blob = await pdf(<Report snapshot={snapshot} />).toBlob()

      const filename = `${job.job_number || 'report'}-${new Date().toISOString().slice(0,10)}.pdf`

      // Trigger download for the user
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      // Store in Supabase
      setProgress('Uploading to report archive…')
      const storagePath = `${profile.tenant_id}/${jobId}/${filename}`
      const { error: upErr } = await supabase.storage
        .from('reports')
        .upload(storagePath, blob, { contentType: 'application/pdf', upsert: true })
      if (upErr) {
        // Surface as warning but don't block download
        console.warn('Report archive upload failed:', upErr.message)
      } else {
        await supabase.from('reports').insert({
          tenant_id: profile.tenant_id,
          job_id: jobId,
          status: job.status === 'finalized' ? 'finalized' : 'draft',
          generated_by: profile.id,
          generated_at: new Date().toISOString(),
          storage_path: storagePath,
        })
        // Reload list
        const reportsRes = await supabase
          .from('reports').select('id, status, finalized_at, generated_at, storage_path')
          .eq('job_id', jobId).order('generated_at', { ascending: false })
        setReports(reportsRes.data || [])
      }
      setProgress(null)
    } catch (e) {
      setError(e.message || 'Report generation failed')
      setProgress(null)
    } finally {
      setGenerating(false)
    }
  }

  async function downloadArchived(storagePath) {
    setError(null)
    try {
      const { data, error: dlErr } = await supabase.storage
        .from('reports')
        .createSignedUrl(storagePath, 60 * 60)
      if (dlErr) throw dlErr
      window.open(data.signedUrl, '_blank')
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className="min-h-screen bg-ink-50">
      <Header breadcrumb={[
        { label: 'Jobs', to: '/jobs' },
        { label: 'Job', to: `/jobs/${jobId}` },
        { label: 'Report' },
      ]} />

      <main className="max-w-4xl mx-auto p-4 sm:p-6 pb-24 space-y-5">
        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-danger rounded p-3 text-sm">
            {error}
          </div>
        )}

        <Card accent="blue">
          <CardHeader>
            <CardTitle>Mitigation Report</CardTitle>
            <p className="text-sm text-ink-600 mt-1">
              Generates a branded PDF report including all rooms, scope, readings, equipment,
              monitoring visits, and photos. Reports take 10-30 seconds depending on photo count.
            </p>
          </CardHeader>
          <CardBody className="space-y-3">
            {progress && (
              <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-brand-blue flex items-center gap-2">
                <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                {progress}
              </div>
            )}
            <Button onClick={generate} loading={generating} size="lg">
              {generating ? 'Generating…' : 'Generate report PDF'}
            </Button>
            <p className="text-xs text-ink-500">
              The PDF will download to your computer. A copy is also saved to the report archive below.
            </p>
          </CardBody>
        </Card>

        <Section title="Report archive" description="Previously generated reports for this job.">
          {reports.length === 0 ? (
            <p className="text-sm text-ink-500 italic">No reports generated yet.</p>
          ) : (
            <ul className="space-y-2">
              {reports.map((r) => (
                <li key={r.id} className="bg-white border border-ink-200 rounded p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge tone={r.status === 'finalized' ? 'green' : 'neutral'}>
                        {r.status === 'finalized' ? 'Finalized' : 'Draft'}
                      </Badge>
                      <span className="text-sm text-ink-700">
                        Generated {new Date(r.generated_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-xs text-ink-500 font-mono truncate">{r.storage_path}</p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => downloadArchived(r.storage_path)}>
                    Download
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </main>

      <BottomNav jobId={jobId} />
    </div>
  )
}
