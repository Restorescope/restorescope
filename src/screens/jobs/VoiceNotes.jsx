import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Header, BottomNav, Section, Card, CardBody, Badge, EmptyState } from '../../ui'
import VoiceNotePanel from '../../components/VoiceNotePanel'

/**
 * VoiceNotes — job-level page listing voice notes + new-note recorder.
 *
 * Route: /jobs/:id/voice-notes
 *
 * Each saved note shows transcript, audio playback, and structured fields.
 * Notes are sorted newest first.
 */
export default function VoiceNotesScreen() {
  const { id: jobId } = useParams()
  const [notes, setNotes] = useState([])
  const [job, setJob] = useState(null)
  const [audioUrls, setAudioUrls] = useState(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const [notesRes, jobRes] = await Promise.all([
      supabase
        .from('voice_notes')
        .select('id, room_id, storage_path, duration_sec, mime_type, transcript, structured_data, ai_notes, status, created_at')
        .eq('job_id', jobId)
        .order('created_at', { ascending: false }),
      supabase
        .from('jobs')
        .select('id, job_number, screening_enabled, screening_only')
        .eq('id', jobId)
        .single(),
    ])
    if (notesRes.error) setError(notesRes.error.message)
    else {
      setNotes(notesRes.data ?? [])
      setJob(jobRes.data || null)
    }
    setLoading(false)
  }, [jobId])

  useEffect(() => { load() }, [load])

  // Sign URLs for audio playback
  useEffect(() => {
    let cancelled = false
    async function signAll() {
      const urlMap = new Map()
      for (const note of notes) {
        if (!note.storage_path) continue
        const { data } = await supabase.storage.from('voice-notes').createSignedUrl(note.storage_path, 60 * 60)
        if (data?.signedUrl) urlMap.set(note.id, data.signedUrl)
      }
      if (!cancelled) setAudioUrls(urlMap)
    }
    if (notes.length > 0) signAll()
    return () => { cancelled = true }
  }, [notes])

  async function deleteNote(note) {
    if (!confirm('Delete this voice note? The audio file and transcript will be removed.')) return
    try {
      if (note.storage_path) {
        await supabase.storage.from('voice-notes').remove([note.storage_path])
      }
      await supabase.from('voice_notes').delete().eq('id', note.id)
      setNotes((arr) => arr.filter((n) => n.id !== note.id))
    } catch (e) {
      alert(`Couldn't delete: ${e.message}`)
    }
  }

  return (
    <div className="min-h-screen bg-ink-50">
      <Header breadcrumb={[
        { label: 'Jobs', to: '/jobs' },
        { label: job?.job_number || 'Job', to: `/jobs/${jobId}` },
        { label: 'Voice notes' },
      ]} />
      <main className="max-w-3xl mx-auto p-4 sm:p-6 pb-24 space-y-5">

        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-danger rounded p-3 text-sm">
            {error}
          </div>
        )}

        <Section
          title="Voice notes"
          description="Record observations hands-free. AI transcribes and pulls out key fields automatically."
        />

        <VoiceNotePanel
          jobId={jobId}
          scope="general_notes"
          jobContext={{
            screening_only: !!job?.screening_only,
            screening_enabled: !!job?.screening_enabled,
          }}
          onSaved={(row) => setNotes((arr) => [row, ...arr])}
        />

        <Section title={`Saved notes (${notes.length})`}>
          {loading ? (
            <p className="text-ink-500 text-sm">Loading…</p>
          ) : notes.length === 0 ? (
            <EmptyState
              title="No voice notes yet"
              body="Tap 'Start recording' above to capture your first one."
            />
          ) : (
            <ul className="space-y-3">
              {notes.map((note) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  audioUrl={audioUrls.get(note.id)}
                  onDelete={() => deleteNote(note)}
                />
              ))}
            </ul>
          )}
        </Section>
      </main>

      <BottomNav jobId={jobId} />
    </div>
  )
}

function NoteCard({ note, audioUrl, onDelete }) {
  const created = new Date(note.created_at)
  return (
    <li>
      <Card>
        <CardBody className="space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-xs text-ink-500">
              {created.toLocaleString()}
              {note.duration_sec ? <span> · {Math.round(note.duration_sec)}s</span> : null}
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={note.status === 'reviewed' ? 'green' : 'neutral'}>{note.status}</Badge>
              <button
                onClick={onDelete}
                className="text-xs text-danger underline hover:no-underline"
              >
                Delete
              </button>
            </div>
          </div>

          {audioUrl && <audio controls src={audioUrl} className="w-full" />}

          {note.ai_notes && (
            <div className="bg-ink-50 rounded p-2 text-xs text-ink-700">
              <strong>Summary:</strong> {note.ai_notes}
            </div>
          )}

          {note.transcript && (
            <div>
              <div className="text-xs font-semibold text-ink-700 mb-1">Transcript</div>
              <p className="text-sm text-ink-900 whitespace-pre-wrap">{note.transcript}</p>
            </div>
          )}

          {note.structured_data && Object.keys(note.structured_data).length > 0 && (
            <details className="bg-yellow-50 border border-yellow-200 rounded p-2">
              <summary className="text-xs font-semibold text-yellow-900 cursor-pointer">
                Structured data
              </summary>
              <pre className="text-xs mt-2 overflow-x-auto">{JSON.stringify(note.structured_data, null, 2)}</pre>
            </details>
          )}
        </CardBody>
      </Card>
    </li>
  )
}
