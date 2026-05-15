import { useEffect, useState, useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Header, BottomNav, Section, Card, CardHeader, CardBody, CardTitle, Button } from '../../ui'
import PhotoUploader from '../../components/PhotoUploader'
import PhotoGallery from '../../components/PhotoGallery'
import PhotoRequirementsChecklist from '../../components/PhotoRequirementsChecklist'
import { getPhotoUrls } from '../../lib/photos'

/**
 * Photos — main job-level photos screen.
 *
 * Shows: uploader at top, gallery below with category + room filters.
 * Bulk AI categorize button auto-classifies any photos missing a category
 * (or where you've shrugged at AI's guess as "uncategorized").
 */
export default function PhotosScreen() {
  const { id: jobId } = useParams()
  const [photos, setPhotos] = useState([])
  const [rooms, setRooms] = useState([])
  const [job, setJob] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiProgress, setAiProgress] = useState('')
  const [uploaderRoomId, setUploaderRoomId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const [photosRes, roomsRes, jobRes] = await Promise.all([
      supabase
        .from('photos')
        .select('id, room_id, work_item_id, reading_id, category, storage_path, caption, taken_at, uploaded_at')
        .eq('job_id', jobId)
        .order('taken_at', { ascending: true }),
      supabase
        .from('affected_rooms')
        .select('id, room_name')
        .eq('job_id', jobId)
        .order('created_at'),
      supabase
        .from('jobs')
        .select('id, screening_enabled, screening_only')
        .eq('id', jobId)
        .single(),
    ])
    if (photosRes.error) setError(photosRes.error.message)
    else if (roomsRes.error) setError(roomsRes.error.message)
    else {
      setPhotos(photosRes.data ?? [])
      setRooms(roomsRes.data ?? [])
      setJob(jobRes.data || null)
    }
    setLoading(false)
  }, [jobId])

  useEffect(() => { load() }, [load])

  function onUploaded(row) {
    setPhotos((p) => [...p, row])
  }
  function onDeleted(id) {
    setPhotos((p) => p.filter((x) => x.id !== id))
  }

  /**
   * Bulk-categorize photos missing a category. Sends each photo to the
   * categorize-photo edge function one at a time (avoiding rate limits)
   * and updates the database with the AI's suggestion.
   */
  async function bulkCategorize() {
    const uncategorized = photos.filter(p => !p.category || p.category === 'uncategorized')
    if (uncategorized.length === 0) {
      alert('All photos already have a category.')
      return
    }
    if (!confirm(`Run AI categorization on ${uncategorized.length} photo${uncategorized.length === 1 ? '' : 's'}? Roughly 5-10 seconds per photo.`)) return

    setAiBusy(true); setError(null)

    // Get signed URLs for all of them so we can fetch their bytes
    const urls = await getPhotoUrls(uncategorized)
    let done = 0; let failed = 0

    for (const photo of uncategorized) {
      done++
      setAiProgress(`Processing ${done}/${uncategorized.length}…`)
      try {
        const url = urls.get(photo.id)
        if (!url) { failed++; continue }

        const blob = await (await fetch(url)).blob()
        const photo_base64 = await blobToBase64(blob)
        const photo_media_type = blob.type || 'image/jpeg'

        const { data, error: fnErr } = await supabase.functions.invoke('categorize-photo', {
          body: {
            photo_base64,
            photo_media_type,
            job_context: { screening_only: !!job?.screening_only, screening_enabled: !!job?.screening_enabled },
          },
        })
        if (fnErr || data?.error || !data?.category_key) {
          failed++; continue
        }

        const { error: updErr } = await supabase
          .from('photos')
          .update({ category: data.category_key })
          .eq('id', photo.id)
        if (updErr) { failed++; continue }

        // Update local state
        setPhotos((arr) => arr.map(p => p.id === photo.id ? { ...p, category: data.category_key } : p))
      } catch (e) {
        failed++
      }
    }

    setAiBusy(false); setAiProgress('')
    if (failed > 0) setError(`Done. ${done - failed}/${done} categorized successfully. ${failed} failed.`)
  }

  const uncategorizedCount = photos.filter(p => !p.category || p.category === 'uncategorized').length

  return (
    <div className="min-h-screen bg-ink-50">
      <Header breadcrumb={[
        { label: 'Jobs', to: '/jobs' },
        { label: 'Job', to: `/jobs/${jobId}` },
        { label: 'Photos' },
      ]} />
      <main className="max-w-5xl mx-auto p-4 sm:p-6 pb-24 space-y-5">

        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-danger rounded p-3 text-sm">
            {error}
          </div>
        )}

        <PhotoRequirementsChecklist jobId={jobId} />

        <Card>
          <CardHeader><CardTitle>Add photos</CardTitle></CardHeader>
          <CardBody className="space-y-3">
            <p className="text-sm text-ink-600">
              Pick a category, then take a photo or pick from your library. On phones, the
              camera opens automatically. You can upload several at once.
            </p>
            <div>
              <label className="text-xs font-semibold text-ink-700 block mb-1">Attach to:</label>
              <select
                value={uploaderRoomId || ''}
                onChange={(e) => setUploaderRoomId(e.target.value || null)}
                className="w-full px-2 py-1.5 border border-ink-300 rounded text-sm"
              >
                <option value="">Job-level (no specific room)</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>{r.room_name}</option>
                ))}
              </select>
              <p className="text-xs text-ink-500 mt-1">
                Per-room requirements only match photos attached to the same room.
              </p>
            </div>
            <PhotoUploader jobId={jobId} roomId={uploaderRoomId || undefined} onUploaded={onUploaded} />
          </CardBody>
        </Card>

        {uncategorizedCount > 0 && (
          <Card accent="yellow">
            <CardBody className="flex items-center gap-3 flex-wrap">
              <div className="flex-1">
                <p className="text-sm font-semibold text-ink-900">
                  ✨ AI photo categorization
                </p>
                <p className="text-xs text-ink-600 mt-0.5">
                  {uncategorizedCount} photo{uncategorizedCount === 1 ? '' : 's'} {uncategorizedCount === 1 ? 'is' : 'are'} uncategorized.
                  AI can classify them automatically using vision. About 5-10 seconds per photo.
                </p>
                {aiProgress && (
                  <p className="text-xs text-brand-blue font-semibold mt-1">{aiProgress}</p>
                )}
              </div>
              <Button onClick={bulkCategorize} loading={aiBusy} variant="accent">
                Categorize with AI
              </Button>
            </CardBody>
          </Card>
        )}

        <Section
          title="All photos"
          description={`${photos.length} photo${photos.length === 1 ? '' : 's'} on this job, including any from rooms.`}
        >
          {loading ? (
            <p className="text-ink-500 text-sm">Loading…</p>
          ) : (
            <PhotoGallery
              photos={photos}
              rooms={rooms}
              onDeleted={onDeleted}
              emptyHint="No photos yet. Use the uploader above."
            />
          )}
        </Section>
      </main>

      <BottomNav jobId={jobId} />
    </div>
  )
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result
      resolve(typeof result === 'string' ? result.split(',')[1] : '')
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
