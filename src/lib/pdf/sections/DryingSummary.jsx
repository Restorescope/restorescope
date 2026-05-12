import { View, Text } from '@react-pdf/renderer'
import { styles, COLORS } from '../theme'
import { labelLookup, formatDate } from '../snapshot'

/**
 * DryingSummary — auto-generated paragraphs describing how moisture readings
 * trended from initial wet readings through to drying standard met (or current state).
 *
 * Writes one paragraph per (room + material) combination that has at least
 * one non-reference reading. Also includes a per-room final status table.
 */
export default function DryingSummary({ snapshot }) {
  const { readings, rooms, settings } = snapshot

  if (readings.length === 0) {
    return (
      <View>
        <Text style={styles.sectionHeading}>DRYING SUMMARY</Text>
        <Text style={styles.para}>No moisture readings have been documented.</Text>
      </View>
    )
  }

  const roomMap = new Map(rooms.map((r) => [r.id, r]))

  // Group readings by room+material, excluding reference readings
  const groups = new Map()
  for (const r of readings) {
    if (r.is_reference) continue
    if (r.value == null) continue
    const key = `${r.room_id || 'none'}::${r.material_key || 'none'}`
    if (!groups.has(key)) {
      groups.set(key, {
        room_id: r.room_id,
        material_key: r.material_key,
        readings: [],
      })
    }
    groups.get(key).readings.push(r)
  }

  // Sort each group by capture time
  for (const g of groups.values()) {
    g.readings.sort((a, b) => new Date(a.captured_at) - new Date(b.captured_at))
  }

  return (
    <View>
      <Text style={styles.sectionHeading}>DRYING SUMMARY</Text>
      <Text style={styles.para}>
        Moisture readings were collected throughout the drying process to verify progress and confirm that drying standards were met.
      </Text>

      {[...groups.values()].map((g, i) => {
        const room = roomMap.get(g.room_id)
        const roomName = room?.room_name || 'Unspecified location'
        const material = labelLookup(settings.materials, g.material_key, g.material_key)
        const first = g.readings[0]
        const last = g.readings[g.readings.length - 1]
        const goal = last.drying_goal ?? first.drying_goal
        const dryAchieved = last.status === 'dry'
        const totalReadings = g.readings.length

        return (
          <View key={i} style={{ marginTop: 6 }} wrap={false}>
            <Text style={[styles.subHeading, { color: COLORS.brandBlue }]}>
              {roomName} — {material}
            </Text>
            <Text style={[styles.para, { fontSize: 10, lineHeight: 1.5 }]}>
              {`Initial readings on ${formatDate(first.captured_at)} measured ${formatVal(first.value, first.unit)}`}
              {goal != null ? ` against a drying goal of ${formatVal(goal, first.unit)}` : ''}
              {`. ${totalReadings === 1
                ? `One reading was taken${dryAchieved ? ' which met the drying standard' : ''}`
                : `Over ${countDays(first.captured_at, last.captured_at)} day${countDays(first.captured_at, last.captured_at) === 1 ? '' : 's'}, ${totalReadings} readings were collected, with the most recent on ${formatDate(last.captured_at)} measuring ${formatVal(last.value, last.unit)}`}.`}
              {dryAchieved && ` The drying standard was met on ${formatDate(last.captured_at)}.`}
              {!dryAchieved && totalReadings > 1 && ` The material was actively drying at the time of last reading.`}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

function formatVal(v, unit) {
  if (v == null) return '—'
  const n = Number(v)
  if (!Number.isFinite(n)) return String(v)
  const formatted = n % 1 === 0 ? n.toFixed(0) : n.toFixed(1)
  return unit ? `${formatted} ${unitLabel(unit)}` : formatted
}

function unitLabel(u) {
  const map = {
    wme_pct: '% WME',
    pct_mc: '% MC',
    rh_pct: '% RH',
    gpp: 'GPP',
    f: '°F',
    c: '°C',
  }
  return map[u] || u
}

function countDays(startIso, endIso) {
  const ms = new Date(endIso) - new Date(startIso)
  if (!Number.isFinite(ms) || ms < 0) return 1
  return Math.max(1, Math.round(ms / 86400000))
}
