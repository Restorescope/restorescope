import { useState, useRef } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { uploadJobPhoto } from '../lib/photos'
import { PHOTO_CATEGORIES } from '../lib/defaults'
import { Button, Select } from '../ui'

/**
 * PhotoUploader — single-button uploader with category dropdown.
 *
 * Props:
 *   - jobId         (required)
 *   - roomId        (optional — if set, photo links to this room)
 *   - workItemId    (optional — alternative to roomId)
 *   - readingId     (optional — used by per-reading meter face shots)
 *   - defaultCategory  (optional — preselect a category)
 *   - filterCategories (optional — limit dropdown to these keys; e.g. for room-scoped uploads)
 *   - onUploaded    (optional callback fired after each successful upload)
 *   - compact       boolean — render as small button (default false)
 *   - label         button label (default: '+ Add photos')
 *
 * UX:
 *   - On click, file picker opens. On phones, uses `capture="environment"` so
 *     the rear camera launches when available; falls back to chooser otherwise.
 *   - Multiple files supported; each runs the compress/upload pipeline.
 *   - Shows per-file progress (compressing → uploading → saving).
 */
export default function PhotoUploader({
  jobId, roomId, workItemId, readingId,
  defaultCategory, filterCategories,
  onUploaded, compact = false, label = '+ Add photos',
}) {
  const { profile } = useAuth()
  const inputRef = useRef(null)
  const [category, setCategory] = useState(defaultCategory || '')
  const [progress, setProgress] = useState([]) // [{ name, phase, error? }]
  const [error, setError] = useState(null)

  const categories = (filterCategories
    ? PHOTO_CATEGORIES.filter((c) => filterCategories.includes(c.key))
    : PHOTO_CATEGORIES
  )

  function openPicker() {
    if (!category) {
      setError('Pick a category first')
      return
    }
    setError(null)
    inputRef.current?.click()
  }

  async function onFiles(e) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''  // reset so re-selecting the same file fires onChange
    if (files.length === 0) return

    // Initialize progress slots
    setProgress(files.map((f) => ({ name: f.name, phase: 'queued' })))

    for (let i = 0; i < files.length; i++) {
      const f = files[i]
      try {
        const row = await uploadJobPhoto(f, {
          tenantId: profile.tenant_id,
          jobId, roomId, workItemId, readingId,
          category,
          uploadedBy: profile.id,
        }, (phase) => {
          setProgress((p) => p.map((it, idx) => idx === i ? { ...it, phase } : it))
        })
        setProgress((p) => p.map((it, idx) => idx === i ? { ...it, phase: 'done' } : it))
        onUploaded?.(row)
      } catch (err) {
        setProgress((p) => p.map((it, idx) => idx === i ? { ...it, phase: 'error', error: err.message } : it))
      }
    }

    // Auto-clear after a beat so next batch starts fresh
    setTimeout(() => setProgress([]), 2000)
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={onFiles}
      />

      <div className={`flex flex-wrap gap-2 ${compact ? 'items-center' : 'items-end'}`}>
        <div className={compact ? 'min-w-[180px]' : 'flex-1 min-w-[200px]'}>
          <Select
            label={compact ? null : 'Photo category'}
            placeholder="Pick a category…"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            options={categories.map((c) => ({ key: c.key, label: c.label }))}
          />
        </div>
        <Button
          type="button"
          onClick={openPicker}
          variant="accent"
          size={compact ? 'md' : 'lg'}
          disabled={!category}
        >
          {label}
        </Button>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {progress.length > 0 && (
        <ul className="space-y-1 mt-2">
          {progress.map((p, i) => (
            <li key={i} className="text-xs flex items-center gap-2">
              <span className="font-mono truncate flex-1">{p.name}</span>
              <PhaseBadge phase={p.phase} error={p.error} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function PhaseBadge({ phase, error }) {
  const map = {
    queued:      ['Queued',      'bg-ink-100 text-ink-700'],
    compressing: ['Compressing', 'bg-amber-100 text-amber-800'],
    uploading:   ['Uploading',   'bg-blue-100 text-blue-800'],
    saving:      ['Saving',      'bg-blue-100 text-blue-800'],
    done:        ['Done',        'bg-green-100 text-green-800'],
    error:       [`Error: ${error}`, 'bg-red-100 text-red-800'],
  }
  const [label, classes] = map[phase] ?? ['', '']
  return <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${classes}`}>{label}</span>
}
