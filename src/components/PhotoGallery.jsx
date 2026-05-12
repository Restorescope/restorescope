import { useEffect, useState, useCallback } from 'react'
import { getPhotoUrls, deletePhoto } from '../lib/photos'
import { PHOTO_CATEGORIES } from '../lib/defaults'
import { Badge } from '../ui'

const CATEGORY_LABEL = Object.fromEntries(PHOTO_CATEGORIES.map((c) => [c.key, c.label]))

/**
 * PhotoGallery — grid of photos with category filter, room filter, and lightbox.
 *
 * Props:
 *   - photos    array of photo rows (from `photos` table)
 *   - rooms     optional array of rooms to enable room-name filter
 *   - onDeleted optional callback after a photo is removed
 *   - emptyHint optional text to show when empty
 */
export default function PhotoGallery({ photos = [], rooms = [], onDeleted, emptyHint }) {
  const [urls, setUrls] = useState(new Map())
  const [filterCategory, setFilterCategory] = useState('all')
  const [filterRoom, setFilterRoom] = useState('all')
  const [lightboxIdx, setLightboxIdx] = useState(null)

  // Resolve signed URLs whenever the photo set changes
  useEffect(() => {
    let cancelled = false
    if (photos.length === 0) { setUrls(new Map()); return }
    getPhotoUrls(photos).then((u) => { if (!cancelled) setUrls(u) })
    return () => { cancelled = true }
  }, [photos])

  const filtered = photos.filter((p) => {
    if (filterCategory !== 'all' && p.category !== filterCategory) return false
    if (filterRoom !== 'all') {
      if (filterRoom === '__none__' && p.room_id) return false
      if (filterRoom !== '__none__' && p.room_id !== filterRoom) return false
    }
    return true
  })

  const presentCategories = Array.from(new Set(photos.map((p) => p.category)))
  const roomById = new Map(rooms.map((r) => [r.id, r]))

  const handleDelete = useCallback(async (photo) => {
    if (!confirm('Delete this photo? This cannot be undone.')) return
    try {
      await deletePhoto(photo)
      onDeleted?.(photo.id)
    } catch (err) {
      alert(`Couldn't delete: ${err.message}`)
    }
  }, [onDeleted])

  if (photos.length === 0) {
    return (
      <p className="text-sm text-ink-500">{emptyHint || 'No photos yet.'}</p>
    )
  }

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <FilterPill active={filterCategory === 'all'} onClick={() => setFilterCategory('all')}>
          All categories ({photos.length})
        </FilterPill>
        {presentCategories.map((c) => {
          const count = photos.filter((p) => p.category === c).length
          return (
            <FilterPill
              key={c}
              active={filterCategory === c}
              onClick={() => setFilterCategory(c)}
            >
              {CATEGORY_LABEL[c] ?? c} ({count})
            </FilterPill>
          )
        })}
        {rooms.length > 0 && (
          <>
            <span className="w-px bg-ink-300 self-stretch mx-1" aria-hidden />
            <FilterPill active={filterRoom === 'all'} onClick={() => setFilterRoom('all')}>
              All rooms
            </FilterPill>
            {rooms.map((r) => (
              <FilterPill key={r.id} active={filterRoom === r.id} onClick={() => setFilterRoom(r.id)}>
                {r.room_name}
              </FilterPill>
            ))}
            <FilterPill active={filterRoom === '__none__'} onClick={() => setFilterRoom('__none__')}>
              Unassigned
            </FilterPill>
          </>
        )}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <p className="text-sm text-ink-500">No photos match this filter.</p>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map((p, idx) => (
            <PhotoTile
              key={p.id}
              photo={p}
              url={urls.get(p.id)}
              roomName={p.room_id ? roomById.get(p.room_id)?.room_name : null}
              onClick={() => setLightboxIdx(idx)}
              onDelete={() => handleDelete(p)}
            />
          ))}
        </ul>
      )}

      {lightboxIdx != null && filtered[lightboxIdx] && (
        <Lightbox
          photo={filtered[lightboxIdx]}
          url={urls.get(filtered[lightboxIdx].id)}
          roomName={filtered[lightboxIdx].room_id ? roomById.get(filtered[lightboxIdx].room_id)?.room_name : null}
          onClose={() => setLightboxIdx(null)}
          onPrev={lightboxIdx > 0 ? () => setLightboxIdx(lightboxIdx - 1) : null}
          onNext={lightboxIdx < filtered.length - 1 ? () => setLightboxIdx(lightboxIdx + 1) : null}
        />
      )}
    </div>
  )
}

function FilterPill({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 h-8 rounded-full text-xs font-medium border transition-colors
        ${active
          ? 'bg-brand-blue text-white border-brand-blue'
          : 'bg-white text-ink-700 border-ink-300 hover:bg-ink-100'}`}
    >
      {children}
    </button>
  )
}

function PhotoTile({ photo, url, roomName, onClick, onDelete }) {
  return (
    <li className="relative group bg-ink-100 rounded overflow-hidden aspect-square">
      <button type="button" onClick={onClick} className="block w-full h-full">
        {url ? (
          <img
            src={url}
            alt={CATEGORY_LABEL[photo.category] ?? photo.category}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-ink-400 text-xs">
            Loading…
          </div>
        )}
      </button>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 pointer-events-none">
        <div className="flex flex-wrap gap-1">
          <span className="bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded font-medium">
            {CATEGORY_LABEL[photo.category] ?? photo.category}
          </span>
          {roomName && (
            <span className="bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded font-medium">
              {roomName}
            </span>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDelete() }}
        className="absolute top-1 right-1 bg-black/70 hover:bg-danger text-white w-7 h-7 rounded-full text-xs font-bold opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
        aria-label="Delete photo"
      >
        ×
      </button>
    </li>
  )
}

function Lightbox({ photo, url, roomName, onClose, onPrev, onNext }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && onPrev) onPrev()
      if (e.key === 'ArrowRight' && onNext) onNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onPrev, onNext])

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 text-white text-3xl w-10 h-10 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/80"
      >
        ×
      </button>
      {onPrev && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onPrev() }}
          aria-label="Previous"
          className="absolute left-3 top-1/2 -translate-y-1/2 text-white w-12 h-12 rounded-full bg-black/50 hover:bg-black/80 text-2xl"
        >
          ‹
        </button>
      )}
      {onNext && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onNext() }}
          aria-label="Next"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-white w-12 h-12 rounded-full bg-black/50 hover:bg-black/80 text-2xl"
        >
          ›
        </button>
      )}
      <div className="max-w-5xl max-h-full" onClick={(e) => e.stopPropagation()}>
        {url ? (
          <img src={url} alt="" className="max-w-full max-h-[80vh] object-contain" />
        ) : (
          <p className="text-white">Loading…</p>
        )}
        <div className="mt-3 text-white text-sm flex flex-wrap gap-2">
          <Badge tone="blue">{CATEGORY_LABEL[photo.category] ?? photo.category}</Badge>
          {roomName && <Badge tone="neutral">{roomName}</Badge>}
          {photo.taken_at && (
            <span className="text-white/70">
              {new Date(photo.taken_at).toLocaleString()}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
