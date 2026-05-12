/**
 * ReadingTrend — compact SVG line chart showing readings over time with the
 * drying-goal line and current value. Pure SVG, no chart library.
 *
 * Props:
 *   - readings  array of { captured_at, value, status }
 *   - goal      numeric drying goal value (optional — draws goal line if set)
 *   - unit      display unit string (e.g. '%WME')
 *   - height    px height (default 60)
 *
 * Designed to be small and high-density — fits in a list row.
 */
export default function ReadingTrend({ readings = [], goal, unit, height = 60, width = 200 }) {
  if (readings.length === 0) {
    return <div className="text-xs text-ink-400 italic">No readings yet</div>
  }

  const sorted = [...readings].sort(
    (a, b) => new Date(a.captured_at) - new Date(b.captured_at)
  )
  const values = sorted.map((r) => Number(r.value)).filter((v) => Number.isFinite(v))
  if (values.length === 0) return null

  // Y axis: include goal line if present, plus 10% padding
  const dataMin = Math.min(...values, goal ?? Infinity)
  const dataMax = Math.max(...values, goal ?? -Infinity)
  const pad = Math.max((dataMax - dataMin) * 0.15, 1)
  const yMin = dataMin - pad
  const yMax = dataMax + pad
  const yRange = yMax - yMin || 1

  const padL = 4, padR = 4, padT = 6, padB = 14
  const chartW = width - padL - padR
  const chartH = height - padT - padB

  const xAt = (i) => padL + (sorted.length === 1 ? chartW / 2 : (i / (sorted.length - 1)) * chartW)
  const yAt = (v) => padT + chartH - ((v - yMin) / yRange) * chartH

  const points = sorted.map((r, i) => `${xAt(i)},${yAt(Number(r.value))}`).join(' ')
  const last = sorted[sorted.length - 1]
  const lastNum = Number(last.value)

  const STATUS_COLORS = {
    wet:    '#DC2626',  // danger
    drying: '#D97706',  // warning
    dry:    '#16A34A',  // success
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Trend with ${sorted.length} reading${sorted.length === 1 ? '' : 's'}`}
      className="overflow-visible"
    >
      {/* Goal line */}
      {goal != null && Number.isFinite(Number(goal)) && (
        <>
          <line
            x1={padL} x2={padL + chartW}
            y1={yAt(Number(goal))} y2={yAt(Number(goal))}
            stroke="#16A34A"
            strokeDasharray="3 3"
            strokeWidth="1"
          />
          <text
            x={padL + chartW}
            y={yAt(Number(goal)) - 3}
            textAnchor="end"
            fontSize="9"
            fill="#16A34A"
            fontWeight="600"
          >
            goal {goal}{unit ? ` ${unit}` : ''}
          </text>
        </>
      )}

      {/* Trend line */}
      {sorted.length >= 2 && (
        <polyline
          fill="none"
          stroke="#0061AF"
          strokeWidth="1.5"
          points={points}
        />
      )}

      {/* Dots, colored by status */}
      {sorted.map((r, i) => (
        <circle
          key={r.id ?? i}
          cx={xAt(i)}
          cy={yAt(Number(r.value))}
          r={i === sorted.length - 1 ? 3 : 2}
          fill={STATUS_COLORS[r.status] ?? '#0061AF'}
        />
      ))}

      {/* Latest value label */}
      <text
        x={xAt(sorted.length - 1) + 5}
        y={yAt(lastNum) + 3}
        fontSize="10"
        fill="#1E293B"
        fontWeight="600"
      >
        {lastNum}{unit ? ` ${unit}` : ''}
      </text>
    </svg>
  )
}
