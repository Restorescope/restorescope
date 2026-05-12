import { useEffect, useState, useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Header, BottomNav, Section, Card, CardHeader, CardBody, CardTitle } from '../../ui'
import PhotoUploader from '../../components/PhotoUploader'
import PhotoGallery from '../../components/PhotoGallery'

/**
 * Photos — main job-level photos screen.
 *
 * Shows: uploader at top, gallery below with category + room filters.
 * Uploads default to job-general scope (no roomId) so this screen is for
 * "front of property" / "source area" / etc. Room-scoped photos still appear.
 */
export default function PhotosScreen() {
  const { id: jobId } = useParams()
  const [photos, setPhotos] = useState([])
  const [rooms, setRooms] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const [photosRes, roomsRes] = await Promise.all([
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
    ])
    if (photosRes.error) setError(photosRes.error.message)
    else if (roomsRes.error) setError(roomsRes.error.message)
    else {
      setPhotos(photosRes.data ?? [])
      setRooms(roomsRes.data ?? [])
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

        <Card>
          <CardHeader><CardTitle>Add photos</CardTitle></CardHeader>
          <CardBody>
            <p className="text-sm text-ink-600 mb-3">
              Pick a category, then take a photo or pick from your library. On phones, the
              camera opens automatically. You can upload several at once.
            </p>
            <PhotoUploader jobId={jobId} onUploaded={onUploaded} />
          </CardBody>
        </Card>

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
