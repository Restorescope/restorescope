import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { uploadJobPhoto } from '../lib/photos'
import { Button, Card, CardBody } from '../ui'

/**
 * RequirementPhotoButton
 *
 * A button bound to a specific photo requirement. Tapping it:
 *   1) Opens the device camera (mobile) or file picker (desktop)
 *   2) Shows a preview with an editable caption (pre-filled to requirement.label)
 *   3) On confirm, uploads with the requirement's category + caption + optional roomId
 *
 * Props:
 *   jobId
 *   roomId        — optional uuid of affected_rooms; if set, photo gets that room_id
 *   requirement   — { key, label, category }
 *   onUploaded?(photoRow)
 *   size          — 'sm' | 'md'  (default 'sm')
 *   label         — custom button label (default 'Take photo')
 */
export default function RequirementPhotoButton({ jobId, roomId = null, requirement, onUploaded, size = 'sm', label = 'Take photo' }) {
  const { profile } = useAuth()
  const fileInputRef = useRef(null)
  const [stage, setStage] = useState('idle')   // 'idle' | 'preview' | 'uploading'
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [caption, setCaption] = useState(requirement.label || '')
  const [error, setError] = useState(null)

  function openPicker() {
    setError(null)
    // Reset and trigger native file input
    setCaption(requirement.label || '')
    fileInputRef.current?.click()
  }

  function onFileChosen(e) {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setPreviewUrl(URL.createObjectURL(f))
    setStage('preview')
    // Clear the input so picking the same file again still triggers onChange
    e.target.value = ''
  }

  function cancel() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(null)
    setPreviewUrl(null)
    setStage('idle')
    setError(null)
  }

  function retake() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(null)
    setPreviewUrl(null)
    // Re-open the camera/picker immediately
    fileInputRef.current?.click()
  }

  async function confirm() {
    if (!file) return
    setStage('uploading'); setError(null)
    try {
      const row = await uploadJobPhoto(file, {
        tenantId: profile.tenant_id,
        jobId,
        roomId,
        category: requirement.category,
        caption: caption.trim() || requirement.label,
        uploadedBy: profile.id,
      })
      // Cleanup
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setFile(null)
      setPreviewUrl(null)
      setStage('idle')
      onUploaded?.(row)
    } catch (e) {
      setError(e.message)
      setStage('preview')
    }
  }

  return (
    <>
      {/* Hidden file input — capture=environment opens camera on mobile */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onFileChosen}
        className="hidden"
      />

      <Button
        type="button"
        onClick={openPicker}
        size={size}
        variant="accent"
        loading={stage === 'uploading'}
      >
        📷 {label}
      </Button>

      {/* Preview modal */}
      {stage === 'preview' && previewUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3"
          onClick={(e) => { if (e.target === e.currentTarget) cancel() }}
        >
          <Card className="max-w-md w-full max-h-[90vh] overflow-auto">
            <CardBody className="space-y-3">
              <div>
                <p className="text-sm font-semibold text-ink-900">{requirement.label}</p>
                <p className="text-xs text-ink-500 mt-0.5">Review the photo, edit caption if needed, then save.</p>
              </div>
              <img
                src={previewUrl}
                alt="Preview"
                className="w-full max-h-[50vh] object-contain bg-ink-100 rounded"
              />
              <div>
                <label className="text-xs font-semibold text-ink-700">Caption</label>
                <input
                  type="text"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  className="w-full mt-1 px-2 py-1.5 border border-ink-300 rounded text-sm"
                  placeholder={requirement.label}
                />
                <p className="text-xs text-ink-500 mt-1">
                  The caption helps match this photo to the requirement. Keep the keyword if you can.
                </p>
              </div>
              {error && (
                <div role="alert" className="bg-red-50 border border-red-200 text-danger rounded p-2 text-xs">
                  {error}
                </div>
              )}
              <div className="flex gap-2 justify-end flex-wrap">
                <Button variant="ghost" onClick={cancel}>Cancel</Button>
                <Button variant="secondary" onClick={retake}>Retake</Button>
                <Button onClick={confirm} loading={stage === 'uploading'}>Save photo</Button>
              </div>
            </CardBody>
          </Card>
        </div>
      )}
    </>
  )
}
