import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { getPhotoUrls, deletePhoto } from '../lib/photos'
import { PHOTO_CATEGORIES } from '../lib/defaults'
import { Badge, Button } from '../ui'

const CATEGORY_LABEL = Object.fromEntries(PHOTO_CATEGORIES.map((c) => [c.key, c.label]))

/**
 * PhotoGallery — grid of photos with category + room filters and a lightbox.
 *
 * Bulk select mode (new):
 *   - "Select photos" toggle
 *   - In select mode, tapping a tile toggles selection (no lightbox)
 *   - Selected tiles get a checkmark overlay
 *   - Action bar appears: "Reassign to room", "Cancel"
 *   - Reassign picker → choose Job-level or a specific room → apply
 *
 * Props:
 *   - photos     array of photo rows
 *   - rooms      optional array of rooms for filtering + reassign
 *   - onDeleted  callback after a photo is removed
 *   - onUpdated  optional callback after a photo's row changes (room reassign)
 *   - emptyHint  optional text to show when empty
 */
export default function PhotoGallery({ photos = [], rooms = [], onDeleted, onUpdated, emptyHint }) {
  const [urls, setUrls] = useState(new Map())
  const [filterCategory, setFilterCategory] = useState('all')
  const [filterRoom, setFilterRoom] = useState('all')
  const [lightboxIdx, setLightboxIdx] = useState(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [showReassign, setShowReassign] = useState(false)
  const [reassigning, setReassigning] = useState(false)
  const [error, setError] = useState(null)

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

  function exitSelectMode() {
    setSelectMode(false)
    setSelectedIds(new Set())
    setShowReassign(false)
    setError(null)
  }

  function toggleSelected(photoId) {
    setSelectedIds((s) => {
      const next = new Set(s)
      if (next.has(photoId)) next.delete(photoId); else next.add(photoId)
      return next
    })
  }

  function selectAllVisible() {
    setSelectedIds(new Set(filtered.map((p) => p.id)))
  }

  async function applyReassign(newRoomId) {
    if (selectedIds.size === 0) return
    setReassigning(true); setError(null)
    try {
      const ids = Array.from(selectedIds)
      const { data, error: err } = await supabase
        .from('photos')
        .update({ room_id: newRoomId })
        .in('id', ids)
        .select('*')
      if (err) throw err
      // Notify parent for each updated row
      data?.forEach((row) => onUpdated?.(row))
      exitSelectMode()
    } catch (e) {
      setError(e.message)
    } finally {
      setReassigning(false)
    }
  }

  if (photos.length === 0) {
    return <p className="text-sm text-ink-500">{emptyHint || 'No photos yet.'}</p>
  }

  return (
    <div className="space-y-3">
      {/* Filters + select-mode toggle */}
      <div className="flex flex-wrap gap-2 items-center">
        <FilterPill active={filterCategory === 'all'} onClick={() => setFilterCategory('all')}>
          All categories ({photos.length})
        </FilterPill>
        {presentCategories.map((c) => {
          const count = photos.filter((p) => p.category === c).length
          return (
            <FilterPill key={c} active={filterCategory === c} onClick={() => setFilterCategory(c)}>
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
        <span className="flex-1" />
        {!selectMode ? (
          <Button variant="ghost" size="sm" onClick={() => setSelectMode(true)}>
            ☑ Select photos
          </Button>
        ) : (
          <span className="text-xs font-semibold text-ink-700">
            {selectedIds.size} selected
          </span>
        )}
      </div>

      {/* Select-mode action bar */}
      {selectMode && (
        <div className="bg-yellow-50 border border-yellow-200 rounded p-3 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-ink-900 mr-2">
            Tap photos to select.
          </span>
          <Button variant="ghost" size="sm" onClick={selectAllVisible}>
            Select all visible ({filtered.length})
          </Button>
          <span className="flex-1" />
          <Button
            variant="accent"
            size="sm"
            disabled={selectedIds.size === 0}
            onClick={() => setShowReassign(true)}
          >
            Reassign room ({selectedIds.size})
          </Button>
          <Button variant="ghost" size="sm" onClick={exitSelectMode}>
            Cancel
          </Button>
        </div>
      )}

      {error && (
        <div role="alert" className="bg-red-50 border border-red-200 text-danger rounded p-2 text-sm">
          {error}
        </div>
      )}

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
              selectMode={selectMode}
              selected={selectedIds.has(p.id)}
              onClick={() => {
                if (selectMode) toggleSelected(p.id)
                else setLightboxIdx(idx)
              }}
              onDelete={() => handleDelete(p)}
            />
          ))}
        </ul>
      )}

      {/* Lightbox (only when not in select mode) */}
      {!selectMode && lightboxIdx != null && filtered[lightboxIdx] && (
        <Lightbox
          photo={filtered[lightboxIdx]}
          url={urls.get(filtered[lightboxIdx].id)}
          roomName={filtered[lightboxIdx].room_id ? roomById.get(filtered[lightboxIdx].room_id)?.room_name : null}
          onClose={() => setLightboxIdx(null)}
          onPrev={lightboxIdx > 0 ? () => setLightboxIdx(lightboxIdx - 1) : null}
          onNext={lightboxIdx < filtered.length - 1 ? () => setLightboxIdx(lightboxIdx + 1) : null}
        />
      )}

      {/* Reassign modal */}
      {showReassign && (
        <ReassignModal
          count={selectedIds.size}
          rooms={rooms}
          busy={reassigning}
          onCancel={() => setShowReassign(false)}
          onApply={applyReassign}
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
      className={
        active
          ? 'bg-brand-blue text-white border border-brand-blue rounded-full px-3 py-1 text-xs font-medium'
          : 'bg-white text-ink-700 border border-ink-300 rounded-full px-3 py-1 text-xs font-medium hover:bg-ink-50'
      }
    >
      {children}
    </button>
  )
}

function PhotoTile({ photo, url, roomName, selectMode, selected, onClick, onDelete }) {
  return (
    <li className="relative group bg-ink-100 rounded overflow-hidden aspect-square">
      <button type="button" onClick={onClick} className="block w-full h-full">
        {url ? (
          <img
            src={url}
            alt={CATEGORY_LABEL[photo.category] ?? photo.category}
            className={`w-full h-full object-cover ${selected ? 'opacity-60' : ''}`}
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-ink-400 text-xs">
            Loading…
          </div>
        )}
      </button>

      {/* Selection overlay */}
      {selectMode && (
        <div className="absolute top-1 left-1 pointer-events-none">
          <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-sm font-bold transition-colors
            ${selected ? 'bg-brand-blue text-white border-white' : 'bg-white/70 border-ink-400 text-ink-500'}`}>
            {selected ? '✓' : ''}
          </div>
        </div>
      )}

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

      {/* Delete button hidden in select mode */}
      {!selectMode && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="absolute top-1 right-1 bg-black/70 hover:bg-danger text-white w-7 h-7 rounded-full text-xs font-bold opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
          aria-label="Delete photo"
        >
          ×
        </button>
      )}
    </li>
  )
}

function ReassignModal({ count, rooms, busy, onCancel, onApply }) {
  const [chosen, setChosen] = useState('__job__')   // '__job__' or a room.id
  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="bg-white rounded-lg max-w-md w-full p-4 space-y-3">
        <div>
          <h3 className="text-base font-semibold text-ink-900">Reassign {count} photo{count === 1 ? '' : 's'}</h3>
          <p className="text-xs text-ink-500 mt-0.5">
            Pick where these photos belong. Per-room photo requirements only match when the room_id is set.
          </p>
        </div>
        <div>
          <label className="text-xs font-semibold text-ink-700 block mb-1">Attach to:</label>
          <select
            value={chosen}
            onChange={(e) => setChosen(e.target.value)}
            className="w-full px-2 py-1.5 border border-ink-300 rounded text-sm"
            disabled={busy}
          >
            <option value="__job__">Job-level (no specific room)</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>{r.room_name}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button
            onClick={() => onApply(chosen === '__job__' ? null : chosen)}
            loading={busy}
          >
            Apply
          </Button>
        </div>
      </div>
    </div>
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
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-3"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="relative max-w-5xl w-full max-h-[90vh] flex items-center justify-center">
        <img
          src={url}
          alt={CATEGORY_LABEL[photo.category] ?? photo.category}
          className="max-h-[90vh] max-w-full object-contain rounded"
        />

        {/* Bottom info bar */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 text-white">
          <div className="flex flex-wrap gap-2">
            <Badge tone="neutral">{CATEGORY_LABEL[photo.category] ?? photo.category}</Badge>
            {roomName && <Badge tone="neutral">{roomName}</Badge>}
            {photo.caption && (
              <span className="text-xs italic ml-1">"{photo.caption}"</span>
            )}
          </div>
        </div>

        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-2 right-2 bg-black/70 hover:bg-danger text-white w-9 h-9 rounded-full text-base font-bold"
          aria-label="Close"
        >×</button>

        {/* Prev / Next */}
        {onPrev && (
          <button
            type="button"
            onClick={onPrev}
            className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/70 hover:bg-black text-white w-10 h-10 rounded-full font-bold"
            aria-label="Previous"
          >‹</button>
        )}
        {onNext && (
          <button
            type="button"
            onClick={onNext}
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/70 hover:bg-black text-white w-10 h-10 rounded-full font-bold"
            aria-label="Next"
          >›</button>
        )}
      </div>
    </div>
  )
}
