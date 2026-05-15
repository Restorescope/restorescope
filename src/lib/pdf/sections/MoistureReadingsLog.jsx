import { View, Text } from '@react-pdf/renderer'
import { styles, COLORS } from '../theme'
import { labelLookup, formatDate, formatDateTime } from '../snapshot'

/**
 * MoistureReadingsLog — Table 2 of two on the drying log section.
 *
 * Shows the actual material moisture readings (drywall, carpet, framing,
 * subfloor, etc.) for each room, grouped by room + material so adjusters
 * can see the dry-down progression.
 *
 * For each (room, material) combination, shows:
 *   - drying goal
 *   - every reading chronologically with date, value, status (wet/drying/dry)
 *   - a status badge at the end showing whether dry was achieved
 *
 * Adjusters use this to verify materials were actively dried, not just sitting.
 */
export default function MoistureReadingsLog({ snapshot }) {
  const readings = snapshot.readings || []
  const rooms = snapshot.rooms || []
  const settings = snapshot.settings || {}

  if (readings.length === 0) {
    return (
      <View>
        <Text style={styles.sectionHeading}>MATERIAL MOISTURE READINGS</Text>
        <Text style={styles.para}>No material moisture readings have been documented.</Text>
      </View>
    )
  }

  const roomMap = new Map(rooms.map((r) => [r.id, r]))

  // Group readings: room_id -> material_key -> [readings]
  const byRoom = new Map()
  for (const r of readings) {
    if (r.is_reference) continue  // skip unaffected reference readings
    if (r.value == null) continue
    if (!byRoom.has(r.room_id)) byRoom.set(r.room_id, new Map())
    const matMap = byRoom.get(r.room_id)
    const key = r.material_key || 'unspecified'
    if (!matMap.has(key)) matMap.set(key, [])
    matMap.get(key).push(r)
  }

  // Sort each group by capture time
  for (const matMap of byRoom.values()) {
    for (const arr of matMap.values()) {
      arr.sort((a, b) => new Date(a.captured_at) - new Date(b.captured_at))
    }
  }

  // Build ordered rooms list
  const orderedRoomIds = [...roomMap.keys()].filter((id) => byRoom.has(id))
  for (const id of byRoom.keys()) {
    if (id && !orderedRoomIds.includes(id)) orderedRoomIds.push(id)
  }
  if (byRoom.has(null) || byRoom.has(undefined)) orderedRoomIds.push(null)

  return (
    <View>
      <Text style={styles.sectionHeading}>MATERIAL MOISTURE READINGS</Text>
      <Text style={[styles.para, { fontSize: 9, color: COLORS.ink600 }]}>
        Moisture readings taken on actual building materials throughout the drying process.
        Each reading is compared against the drying goal to verify when the material reached
        the standard for that material type.
      </Text>

      {orderedRoomIds.map((roomId) => {
        const matMap = byRoom.get(roomId)
        if (!matMap || matMap.size === 0) return null
        const room = roomMap.get(roomId)
        const roomName = room?.room_name || 'Unspecified location'
        return (
          <View key={roomId || 'none'} style={{ marginTop: 10 }}>
            <View style={roomHeaderStyle} wrap={false}>
              <Text style={roomHeaderText}>{roomName.toUpperCase()}</Text>
            </View>

            {[...matMap.entries()].map(([matKey, arr]) => {
              const material = labelLookup(settings.materials, matKey, matKey)
              const last = arr[arr.length - 1]
              const goal = last.drying_goal ?? arr[0].drying_goal
              const dryAchieved = last.status === 'dry'
              return (
                <View key={matKey} style={materialBlockStyle} wrap={false}>
                  {/* Material header */}
                  <View style={materialHeaderStyle}>
                    <Text style={materialNameText}>{material}</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {goal != null && (
                        <Text style={metaText}>Goal: {formatValue(goal, last.unit)}</Text>
                      )}
                      <Text style={metaText}>{arr.length} reading{arr.length === 1 ? '' : 's'}</Text>
                      <Text style={[metaText, {
                        fontFamily: 'Helvetica-Bold',
                        color: dryAchieved ? COLORS.success ?? '#16a34a' : COLORS.brandBlue,
                      }]}>
                        {dryAchieved ? 'DRY ✓' : (last.status || 'IN PROGRESS').toUpperCase()}
                      </Text>
                    </View>
                  </View>

                  {/* Reading rows */}
                  <View style={tableStyle}>
                    <View style={[rowStyle, { backgroundColor: COLORS.ink100 }]}>
                      <Text style={[cellStyle, { flex: 2, fontFamily: 'Helvetica-Bold' }]}>Date / Time</Text>
                      <Text style={[cellStyle, { flex: 1, fontFamily: 'Helvetica-Bold' }]}>Point</Text>
                      <Text style={[cellStyle, { flex: 1, fontFamily: 'Helvetica-Bold', textAlign: 'right' }]}>Reading</Text>
                      <Text style={[cellStyle, { flex: 1, fontFamily: 'Helvetica-Bold' }]}>Status</Text>
                      <Text style={[cellStyle, { flex: 2 }]}>Notes</Text>
                    </View>
                    {arr.map((r, idx) => (
                      <View key={r.id} style={[rowStyle, idx % 2 === 1 ? { backgroundColor: '#fafafa' } : {}]}>
                        <Text style={[cellStyle, { flex: 2 }]}>{formatDateTime(r.captured_at)}</Text>
                        <Text style={[cellStyle, { flex: 1 }]}>{r.point_label || '—'}</Text>
                        <Text style={[cellStyle, { flex: 1, textAlign: 'right' }]}>{formatValue(r.value, r.unit)}</Text>
                        <Text style={[cellStyle, { flex: 1 }, statusColor(r.status)]}>
                          {r.status ? r.status.toUpperCase() : '—'}
                        </Text>
                        <Text style={[cellStyle, { flex: 2, color: COLORS.ink600, fontStyle: 'italic' }]}>
                          {r.notes || ''}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )
            })}
          </View>
        )
      })}
    </View>
  )
}

function formatValue(v, unit) {
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

function statusColor(status) {
  switch (status) {
    case 'dry':     return { color: '#16a34a', fontFamily: 'Helvetica-Bold' }
    case 'drying':  return { color: '#d97706' }
    case 'wet':     return { color: '#dc2626', fontFamily: 'Helvetica-Bold' }
    default:        return {}
  }
}

const roomHeaderStyle = {
  backgroundColor: COLORS.brandBlue,
  paddingVertical: 4,
  paddingHorizontal: 6,
}
const roomHeaderText = {
  fontFamily: 'Helvetica-Bold',
  fontSize: 10,
  color: '#ffffff',
  letterSpacing: 0.6,
}
const materialBlockStyle = {
  marginTop: 6,
  marginBottom: 2,
  borderWidth: 0.5,
  borderColor: COLORS.ink300,
}
const materialHeaderStyle = {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  backgroundColor: COLORS.ink50 ?? '#F8FAFC',
  paddingVertical: 3,
  paddingHorizontal: 6,
  borderBottomWidth: 0.5,
  borderBottomColor: COLORS.ink200,
}
const materialNameText = {
  fontFamily: 'Helvetica-Bold',
  fontSize: 10,
  color: COLORS.ink900,
}
const metaText = {
  fontSize: 8,
  color: COLORS.ink600,
}
const tableStyle = {}
const rowStyle = {
  flexDirection: 'row',
  borderBottomWidth: 0.5,
  borderBottomColor: COLORS.ink200,
}
const cellStyle = {
  fontSize: 9,
  paddingVertical: 3,
  paddingHorizontal: 5,
  color: COLORS.ink900,
}
