import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { Button, Card, CardHeader, CardBody, CardTitle } from '../ui'
import VoiceRecorder from './VoiceRecorder'

/**
 * VoiceNotePanel — full workflow component for capturing one voice note.
 *
 * Steps:
 *   1. Record audio → blob
 *   2. Upload blob to voice-notes bucket
 *   3. Create voice_notes row (status=draft)
 *   4. Optional: send to edge function for transcription + AI extraction
 *   5. Display transcript + structured data, let user edit
 *   6. Save → mark status=reviewed
 *
 * Props:
 *   jobId, roomId?
 *   scope: 'moisture_reading' | 'room_walkthrough' | 'scope_entry' | 'general_notes'
 *   onSaved(voiceNoteRow) — optional callback after save
 *   jobContext: { screening_only, screening_enabled }
 */
export default function VoiceNotePanel({ jobId, roomId = null, scope = 'general_notes', jobContext = {}, onSaved }) {
  const { profile } = useAuth()
  const [stage, setStage] = useState('record') // 'record' | 'uploading' | 'transcribing' | 'review' | 'saving'
  const [error, setError] = useState(null)
  const [voiceNote, setVoiceNote] = useState(null) // the row after creation
  const [audioBlob, setAudioBlob] = useState(null)
  const [audioPreviewUrl, setAudioPreviewUrl] = useState(null)
  const [transcript, setTranscript] = useState('')
  const [structured, setStructured] = useState({})
  const [summary, setSummary] = useState('')

  async function onRecordingComplete(blob, durationSec) {
    setAudioBlob(blob)
    setAudioPreviewUrl(URL.createObjectURL(blob))
    setStage('uploading'); setError(null)

    try {
      // Upload audio
      const ext = (blob.type.split('/')[1] || 'webm').split(';')[0]
      const id = crypto.randomUUID()
      const path = `${profile.tenant_id}/${jobId}/${id}.${ext}`

      const { error: upErr } = await supabase
        .storage
        .from('voice-notes')
        .upload(path, blob, { contentType: blob.type })
      if (upErr) throw upErr

      // Create row
      const { data: row, error: insErr } = await supabase
        .from('voice_notes')
        .insert({
          id,
          tenant_id: profile.tenant_id,
          job_id: jobId,
          room_id: roomId,
          storage_path: path,
          duration_sec: durationSec,
          mime_type: blob.type,
          status: 'draft',
          created_by: profile.id,
        })
        .select()
        .single()
      if (insErr) throw insErr

      setVoiceNote(row)
      setStage('transcribing')

      // Kick off AI transcription
      await runAITranscription(blob)
    } catch (e) {
      setError(`Upload failed: ${e.message}`)
      setStage('record')
    }
  }

  async function runAITranscription(blob) {
    try {
      const audio_base64 = await blobToBase64(blob)
      const { data, error: fnErr } = await supabase.functions.invoke('transcribe-voice-note', {
        body: {
          audio_base64,
          audio_mime_type: blob.type,
          context: {
            job_type: jobContext.screening_only ? 'screening'
              : jobContext.screening_enabled ? 'combo' : 'water_mit',
            scope,
          },
        },
      })
      if (fnErr) throw new Error(fnErr.message)
      if (data?.error) throw new Error(data.error)

      setTranscript(data?.transcript || '')
      setStructured(data?.structured || {})
      setSummary(data?.summary || '')
      setStage('review')
    } catch (e) {
      setError(`AI transcription failed: ${e.message}. You can still save the audio without text.`)
      setStage('review') // still allow saving
    }
  }

  async function saveNote() {
    setStage('saving'); setError(null)
    try {
      const { error: updErr } = await supabase
        .from('voice_notes')
        .update({
          transcript,
          structured_data: structured,
          ai_notes: summary,
          status: 'reviewed',
        })
        .eq('id', voiceNote.id)
      if (updErr) throw updErr
      onSaved?.({ ...voiceNote, transcript, structured_data: structured, ai_notes: summary })
      reset()
    } catch (e) {
      setError(`Save failed: ${e.message}`)
      setStage('review')
    }
  }

  async function discardNote() {
    if (!confirm('Discard this voice note? The audio file will be deleted.')) return
    if (voiceNote) {
      await supabase.storage.from('voice-notes').remove([voiceNote.storage_path])
      await supabase.from('voice_notes').delete().eq('id', voiceNote.id)
    }
    reset()
  }

  function reset() {
    setStage('record')
    setVoiceNote(null)
    setAudioBlob(null)
    if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl)
    setAudioPreviewUrl(null)
    setTranscript('')
    setStructured({})
    setSummary('')
    setError(null)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>🎙️ Voice note</CardTitle>
        <p className="text-xs text-ink-500 mt-1">
          Record your observations. AI cleans the transcript and pulls out key fields.
        </p>
      </CardHeader>
      <CardBody className="space-y-3">
        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-danger rounded p-2 text-sm">
            {error}
          </div>
        )}

        {stage === 'record' && (
          <VoiceRecorder onComplete={onRecordingComplete} maxSeconds={120} />
        )}

        {stage === 'uploading' && (
          <p className="text-sm text-ink-600">Uploading audio…</p>
        )}
        {stage === 'transcribing' && (
          <div className="space-y-2">
            <p className="text-sm text-ink-600">✨ Transcribing with AI… this takes a few seconds.</p>
            {audioPreviewUrl && <audio controls src={audioPreviewUrl} className="w-full" />}
          </div>
        )}

        {(stage === 'review' || stage === 'saving') && (
          <div className="space-y-3">
            {audioPreviewUrl && (
              <div>
                <label className="text-xs font-semibold text-ink-700">Audio</label>
                <audio controls src={audioPreviewUrl} className="w-full mt-1" />
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-ink-700">Transcript</label>
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                rows={4}
                className="w-full mt-1 px-2 py-1.5 border border-ink-300 rounded text-sm"
                placeholder="Transcript will appear here..."
              />
            </div>

            {summary && (
              <div className="bg-ink-50 rounded p-2 text-xs text-ink-700">
                <strong>Summary:</strong> {summary}
              </div>
            )}

            {structured && Object.keys(structured).length > 0 && (
              <details className="bg-yellow-50 border border-yellow-200 rounded p-2">
                <summary className="text-xs font-semibold text-yellow-900 cursor-pointer">
                  Structured data extracted ({Object.keys(structured).length} field{Object.keys(structured).length === 1 ? '' : 's'})
                </summary>
                <pre className="text-xs mt-2 overflow-x-auto">{JSON.stringify(structured, null, 2)}</pre>
              </details>
            )}

            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={discardNote} disabled={stage === 'saving'}>
                Discard
              </Button>
              <Button onClick={saveNote} loading={stage === 'saving'}>
                Save voice note
              </Button>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
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
