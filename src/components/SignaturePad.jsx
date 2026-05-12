import { useRef, useEffect, useState, useCallback } from 'react'
import { Button } from '../ui'

/**
 * SignaturePad — captures an on-screen signature on a canvas, with mouse + touch.
 *
 * Mobile-correct coordinate handling:
 *   - Uses ResizeObserver to detect when the rendered canvas size changes
 *     (handles initial mount, orientation change, virtual keyboard appearing,
 *     and layout reflows that happen after first paint).
 *   - Re-syncs the backing buffer to actual rendered CSS size × devicePixelRatio
 *     so finger position and stroke position stay in lock-step.
 *   - Preserves drawn ink across resize by snapshotting before resize and
 *     redrawing after.
 *
 * Usage:
 *   <SignaturePad
 *     value={dataUrl}              // existing base64 data URL or null
 *     onChange={(dataUrl) => ...}  // called when signature changes; null when cleared
 *     disabled={false}
 *   />
 */
export default function SignaturePad({ value, onChange, disabled = false, height = 180 }) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const drawingRef = useRef(false)
  const lastPointRef = useRef(null)
  // We keep the persisted ink as a data URL in a ref so resize redraws work
  // even when component-level state hasn't flushed yet.
  const inkRef = useRef(value || null)
  const [hasInk, setHasInk] = useState(!!value)

  // Snapshot current canvas to a data URL, accounting for empty canvas.
  const snapshot = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return null
    return canvas.toDataURL('image/png')
  }, [])

  // Draw a saved data URL onto the current canvas at its current size.
  const drawInk = useCallback((dataUrl) => {
    const canvas = canvasRef.current
    if (!canvas || !dataUrl) return
    const img = new Image()
    img.onload = () => {
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, canvas.clientWidth, canvas.clientHeight)
    }
    img.src = dataUrl
  }, [])

  // Size the canvas backing buffer to match its rendered CSS size × DPR.
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const cssWidth = canvas.clientWidth
    const cssHeight = canvas.clientHeight
    if (cssWidth === 0 || cssHeight === 0) return // not laid out yet

    // Capture existing ink BEFORE resize (which clears the canvas)
    const existingInk = inkRef.current

    canvas.width = Math.round(cssWidth * dpr)
    canvas.height = Math.round(cssHeight * dpr)
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.lineWidth = 2.4
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#0f172a'

    // Redraw saved ink at new size
    if (existingInk) drawInk(existingInk)
  }, [drawInk])

  // Watch the canvas for size changes and re-sync the backing buffer.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Initial size pass + redraw any provided value
    resizeCanvas()
    if (value && value !== inkRef.current) {
      inkRef.current = value
      drawInk(value)
      setHasInk(true)
    }

    if (typeof ResizeObserver === 'undefined') {
      // Fallback for browsers without ResizeObserver — listen on window resize
      const onResize = () => resizeCanvas()
      window.addEventListener('resize', onResize)
      window.addEventListener('orientationchange', onResize)
      return () => {
        window.removeEventListener('resize', onResize)
        window.removeEventListener('orientationchange', onResize)
      }
    }

    const ro = new ResizeObserver(() => {
      resizeCanvas()
    })
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [resizeCanvas, drawInk, value])

  // Translate a pointer event to canvas-local coordinates.
  // Critical: uses getBoundingClientRect() so it accounts for the canvas's
  // actual on-screen position regardless of scroll, transform, or zoom.
  function eventToCanvasPoint(e) {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    let clientX, clientY
    if (e.touches && e.touches[0]) {
      clientX = e.touches[0].clientX
      clientY = e.touches[0].clientY
    } else if (e.changedTouches && e.changedTouches[0]) {
      clientX = e.changedTouches[0].clientX
      clientY = e.changedTouches[0].clientY
    } else {
      clientX = e.clientX
      clientY = e.clientY
    }
    // CSS pixel coords relative to the canvas's top-left
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    }
  }

  function handleStart(e) {
    if (disabled) return
    e.preventDefault()
    const point = eventToCanvasPoint(e)
    drawingRef.current = true
    lastPointRef.current = point
    const ctx = canvasRef.current.getContext('2d')
    // Draw a tiny dot for taps that don't move (signature can be just a tap)
    ctx.beginPath()
    ctx.arc(point.x, point.y, 1.2, 0, Math.PI * 2)
    ctx.fillStyle = '#0f172a'
    ctx.fill()
    if (!hasInk) setHasInk(true)
  }

  function handleMove(e) {
    if (!drawingRef.current || disabled) return
    e.preventDefault()
    const point = eventToCanvasPoint(e)
    const last = lastPointRef.current
    if (!last) {
      lastPointRef.current = point
      return
    }
    const ctx = canvasRef.current.getContext('2d')
    ctx.beginPath()
    ctx.moveTo(last.x, last.y)
    ctx.lineTo(point.x, point.y)
    ctx.stroke()
    lastPointRef.current = point
  }

  function handleEnd(e) {
    if (!drawingRef.current) return
    e?.preventDefault?.()
    drawingRef.current = false
    lastPointRef.current = null
    const dataUrl = snapshot()
    if (dataUrl) {
      inkRef.current = dataUrl
      onChange?.(dataUrl)
    }
  }

  function clear() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    inkRef.current = null
    setHasInk(false)
    onChange?.(null)
  }

  return (
    <div ref={containerRef}>
      <div
        className="bg-white border-2 border-dashed border-ink-300 rounded relative overflow-hidden"
        style={{ height: `${height}px`, touchAction: 'none' }}
      >
        <canvas
          ref={canvasRef}
          className="block w-full h-full rounded cursor-crosshair"
          style={{ touchAction: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
          onMouseDown={handleStart}
          onMouseMove={handleMove}
          onMouseUp={handleEnd}
          onMouseLeave={handleEnd}
          onTouchStart={handleStart}
          onTouchMove={handleMove}
          onTouchEnd={handleEnd}
          onTouchCancel={handleEnd}
          aria-label="Signature pad"
        />
        {!hasInk && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-ink-400 text-sm italic select-none">
              {disabled ? 'No signature on file' : 'Sign here with finger or mouse'}
            </span>
          </div>
        )}
      </div>
      <div className="flex justify-between items-center mt-2">
        <span className="text-xs text-ink-500">
          {hasInk ? 'Signature captured' : 'Use mouse or finger to sign'}
        </span>
        {hasInk && !disabled && (
          <Button size="sm" variant="ghost" onClick={clear}>Clear &amp; redo</Button>
        )}
      </div>
    </div>
  )
}
