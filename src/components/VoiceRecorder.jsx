import { useEffect, useRef, useState } from 'react'
import { Button } from '../ui'

/**
 * VoiceRecorder — uses browser MediaRecorder to capture audio.
 *
 * Props:
 *   onComplete(blob, durationSec)  — called when user stops recording
 *   maxSeconds   (default 120)     — auto-stop after this many seconds
 *   disabled     (boolean)
 *
 * UI:
 *   - "Record" button initially
 *   - While recording: pulsing red dot + elapsed time + Stop button
 *   - After stop: blob is handed to parent via onComplete
 *
 * Notes:
 *   - Uses 'audio/webm' MIME type which is widely supported on modern browsers.
 *     Safari might need 'audio/mp4' fallback — handled.
 *   - Requires HTTPS to access microphone (works on https://restorescope.netlify.app).
 *   - Asks for mic permission on first use.
 */
export default function VoiceRecorder({ onComplete, maxSeconds = 120, disabled = false }) {
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState(null)

  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const startTimeRef = useRef(null)
  const tickRef = useRef(null)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current)
      stopMediaTracks()
    }
  }, [])

  function stopMediaTracks() {
    const r = mediaRecorderRef.current
    if (r?.stream) r.stream.getTracks().forEach((t) => t.stop())
  }

  async function start() {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

      // Try preferred MIME types in order
      let mimeType = ''
      const preferred = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
      for (const m of preferred) {
        if (MediaRecorder.isTypeSupported(m)) { mimeType = m; break }
      }

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        const durationSec = startTimeRef.current ? (Date.now() - startTimeRef.current) / 1000 : 0
        stopMediaTracks()
        setRecording(false)
        setElapsed(0)
        clearInterval(tickRef.current); tickRef.current = null
        onComplete?.(blob, durationSec)
      }

      mediaRecorderRef.current = recorder
      startTimeRef.current = Date.now()
      recorder.start()
      setRecording(true)
      setElapsed(0)

      tickRef.current = setInterval(() => {
        const seconds = (Date.now() - startTimeRef.current) / 1000
        setElapsed(seconds)
        if (seconds >= maxSeconds) stop()
      }, 200)
    } catch (e) {
      setError(e.name === 'NotAllowedError'
        ? 'Microphone permission denied. Allow microphone access in your browser settings and try again.'
        : `Couldn't access microphone: ${e.message}`)
    }
  }

  function stop() {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
  }

  return (
    <div className="space-y-2">
      {error && (
        <div role="alert" className="bg-red-50 border border-red-200 text-danger rounded p-2 text-xs">
          {error}
        </div>
      )}
      {!recording ? (
        <Button onClick={start} disabled={disabled} variant="accent">
          🎙️ Start recording
        </Button>
      ) : (
        <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
            <span className="font-mono text-sm font-semibold text-red-700">
              {Math.floor(elapsed / 60)}:{String(Math.floor(elapsed % 60)).padStart(2, '0')}
            </span>
          </div>
          <span className="text-xs text-red-700 flex-1">
            Recording… {maxSeconds - Math.floor(elapsed)}s left
          </span>
          <Button onClick={stop} size="sm" className="!bg-red-600 hover:!bg-red-700 !text-white">
            ⏹ Stop
          </Button>
        </div>
      )}
    </div>
  )
}
