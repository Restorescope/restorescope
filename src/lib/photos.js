import imageCompression from 'browser-image-compression'
import { supabase } from './supabase'

/**
 * uploadJobPhoto — full pipeline for one photo capture/file:
 *
 *   1. Read EXIF (timestamp; we keep, don't strip — adjuster-friendly)
 *   2. Compress to max 1600px long edge, 80% quality
 *   3. Re-inject EXIF into compressed JPEG so timestamp/GPS survive
 *   4. Upload to Supabase Storage at: {tenant_id}/{job_id}/{room_or_general}/{photo_id}.jpg
 *   5. Insert row in `photos` with category, room/work-item links, taken_at
 *
 * Returns the inserted photo row.
 *
 * Args:
 *   file        - File or Blob (camera capture or chosen file)
 *   meta        - {
 *                   tenantId, jobId, roomId?, workItemId?, readingId?,
 *                   category   (one of PHOTO_CATEGORIES keys),
 *                   uploadedBy (user uuid),
 *                   takenAt?   (Date — defaults to file.lastModifiedDate or now)
 *                 }
 *   onProgress  - optional (phase, pct?) => void; phases: 'compressing'|'uploading'|'saving'
 */
export async function uploadJobPhoto(file, meta, onProgress) {
  const { tenantId, jobId, roomId, workItemId, readingId, category, uploadedBy, takenAt } = meta
  if (!tenantId || !jobId || !category) {
    throw new Error('uploadJobPhoto: missing required tenantId/jobId/category')
  }

  // 1. Determine the taken_at timestamp from EXIF (preferred) or file metadata
  let takenAtIso = takenAt instanceof Date ? takenAt.toISOString() : null
  if (!takenAtIso) {
    const exifTs = await readExifTimestamp(file).catch(() => null)
    if (exifTs) takenAtIso = exifTs.toISOString()
    else if (file.lastModified) takenAtIso = new Date(file.lastModified).toISOString()
    else takenAtIso = new Date().toISOString()
  }

  // 2. Compress while preserving EXIF
  onProgress?.('compressing')
  let blob = file
  if (file.type?.startsWith('image/') && !file.type.includes('svg')) {
    blob = await imageCompression(file, {
      maxSizeMB: 2,                  // hard ceiling
      maxWidthOrHeight: 1600,        // long edge
      initialQuality: 0.8,
      useWebWorker: true,
      preserveExif: true,            // keep timestamp + GPS for adjusters
      fileType: 'image/jpeg',
    })
  }

  // 3. Build the storage path: tenant_id/job_id/{room|workitem|general}/photo_id.jpg
  const photoId = crypto.randomUUID()
  const folder = roomId
    ? `room-${roomId}`
    : workItemId
      ? `workitem-${workItemId}`
      : readingId
        ? `reading-${readingId}`
        : 'general'
  const storagePath = `${tenantId}/${jobId}/${folder}/${photoId}.jpg`

  // 4. Upload
  onProgress?.('uploading')
  const bucket = readingId ? 'reading-photos' : 'job-photos'
  const { error: upErr } = await supabase.storage
    .from(bucket)
    .upload(storagePath, blob, {
      contentType: 'image/jpeg',
      upsert: false,
    })
  if (upErr) throw upErr

  // 5. Insert DB row
  onProgress?.('saving')
  const { data: row, error: dbErr } = await supabase
    .from('photos')
    .insert({
      id: photoId,
      tenant_id: tenantId,
      job_id: jobId,
      room_id: roomId || null,
      work_item_id: workItemId || null,
      reading_id: readingId || null,
      category,
      storage_path: `${bucket}:${storagePath}`,   // store bucket+path together
      taken_at: takenAtIso,
      uploaded_by: uploadedBy || null,
    })
    .select('*')
    .single()
  if (dbErr) {
    // Roll back the storage upload — orphan files are bad
    await supabase.storage.from(bucket).remove([storagePath]).catch(() => {})
    throw dbErr
  }

  return row
}

/**
 * Returns a short-lived signed URL for a photo's storage_path.
 * Signed URLs work for private buckets (which all of ours are).
 */
export async function getPhotoUrl(storagePath, expiresInSec = 3600) {
  if (!storagePath) return null
  const [bucket, ...rest] = storagePath.split(':')
  const path = rest.join(':')
  if (!bucket || !path) return null
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSec)
  if (error) return null
  return data?.signedUrl ?? null
}

/**
 * Bulk-resolve signed URLs for a list of photos.
 */
export async function getPhotoUrls(photos, expiresInSec = 3600) {
  // Group by bucket so we can use bulk createSignedUrls
  const groups = new Map()
  for (const p of photos) {
    if (!p.storage_path) continue
    const [bucket, ...rest] = p.storage_path.split(':')
    const path = rest.join(':')
    if (!groups.has(bucket)) groups.set(bucket, [])
    groups.get(bucket).push({ id: p.id, path })
  }
  const urlById = new Map()
  for (const [bucket, items] of groups) {
    const paths = items.map((i) => i.path)
    const { data } = await supabase.storage.from(bucket).createSignedUrls(paths, expiresInSec)
    if (data) {
      data.forEach((entry, idx) => {
        if (entry.signedUrl) urlById.set(items[idx].id, entry.signedUrl)
      })
    }
  }
  return urlById
}

/**
 * Delete a photo's storage object + DB row. Best-effort on storage cleanup.
 */
export async function deletePhoto(photo) {
  if (!photo?.storage_path) return
  const [bucket, ...rest] = photo.storage_path.split(':')
  const path = rest.join(':')
  // Storage first; even if it fails (orphan file), still drop the DB row
  await supabase.storage.from(bucket).remove([path]).catch(() => {})
  const { error } = await supabase.from('photos').delete().eq('id', photo.id)
  if (error) throw error
}

// -----------------------------------------------------------------------------
// EXIF timestamp reader — minimal, just for taken_at. Reads DateTimeOriginal
// (tag 0x9003) from a JPEG's APP1 segment. Returns Date or null.
// -----------------------------------------------------------------------------
async function readExifTimestamp(file) {
  if (!file.type?.includes('jpeg')) return null
  const buf = await file.slice(0, 256 * 1024).arrayBuffer()  // first 256KB is plenty
  const view = new DataView(buf)
  if (view.getUint16(0) !== 0xFFD8) return null              // not a JPEG

  let i = 2
  while (i < view.byteLength - 4) {
    const marker = view.getUint16(i); i += 2
    if (marker === 0xFFE1) {
      const size = view.getUint16(i); i += 2
      // 'Exif\0\0' header
      if (view.getUint32(i) !== 0x45786966) { i += size - 2; continue }
      const tiffStart = i + 6
      const little = view.getUint16(tiffStart) === 0x4949
      const get16 = (off) => little ? view.getUint16(off, true) : view.getUint16(off)
      const get32 = (off) => little ? view.getUint32(off, true) : view.getUint32(off)
      const ifd0 = tiffStart + get32(tiffStart + 4)
      const numEntries = get16(ifd0)
      // Find ExifIFD pointer (0x8769)
      let exifIfd = null
      for (let e = 0; e < numEntries; e++) {
        const entry = ifd0 + 2 + e * 12
        if (get16(entry) === 0x8769) {
          exifIfd = tiffStart + get32(entry + 8); break
        }
      }
      if (!exifIfd) return null
      const en = get16(exifIfd)
      for (let e = 0; e < en; e++) {
        const entry = exifIfd + 2 + e * 12
        if (get16(entry) === 0x9003) {        // DateTimeOriginal
          const valOff = tiffStart + get32(entry + 8)
          let s = ''
          for (let k = 0; k < 19; k++) s += String.fromCharCode(view.getUint8(valOff + k))
          // Format: "YYYY:MM:DD HH:MM:SS"
          const m = s.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/)
          if (!m) return null
          return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`)
        }
      }
      return null
    } else if ((marker & 0xFF00) !== 0xFF00) {
      return null
    } else {
      const size = view.getUint16(i); i += size
    }
  }
  return null
}
