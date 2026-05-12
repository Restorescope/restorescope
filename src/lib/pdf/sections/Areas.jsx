import { View, Text } from '@react-pdf/renderer'
import { styles, COLORS } from '../theme'
import { labelLookup, prettyKey } from '../snapshot'

/**
 * AffectedAreas — high-level summary of which rooms were affected, grouped
 * by chamber when chambers are present.
 */
export function AffectedAreasOverview({ snapshot }) {
  const { rooms, chambers } = snapshot

  if (rooms.length === 0) {
    return (
      <View>
        <Text style={styles.sectionHeading}>AFFECTED AREAS</Text>
        <Text style={styles.para}>No affected rooms have been documented for this job.</Text>
      </View>
    )
  }

  const chamberMap = new Map(chambers.map((c) => [c.id, c]))
  // Group rooms by chamber
  const byChamber = new Map()
  const orphans = []
  for (const r of rooms) {
    if (r.chamber_id) {
      if (!byChamber.has(r.chamber_id)) byChamber.set(r.chamber_id, [])
      byChamber.get(r.chamber_id).push(r)
    } else {
      orphans.push(r)
    }
  }

  return (
    <View>
      <Text style={styles.sectionHeading}>AFFECTED AREAS</Text>
      <Text style={styles.para}>
        The following {rooms.length} room{rooms.length === 1 ? ' was' : 's were'} identified as affected during the inspection
        {chambers.length > 0 ? ` and grouped into ${chambers.length} drying chamber${chambers.length === 1 ? '' : 's'}` : ''}.
      </Text>

      {chambers.length > 0 && [...byChamber.entries()].map(([chamberId, roomsInChamber]) => {
        const chamber = chamberMap.get(chamberId)
        return (
          <View key={chamberId} style={{ marginTop: 6, marginBottom: 6 }}>
            <Text style={styles.subHeading}>
              {chamber?.name || 'Chamber'}
              {chamber?.class_of_water ? `  ·  Class ${chamber.class_of_water}` : ''}
            </Text>
            {roomsInChamber.map((r) => (
              <View key={r.id} style={styles.bullet}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.bulletText}>{r.room_name || 'Unnamed room'}</Text>
              </View>
            ))}
          </View>
        )
      })}

      {orphans.length > 0 && (
        <View style={{ marginTop: 6 }}>
          {chambers.length > 0 && (
            <Text style={styles.subHeading}>Other affected rooms</Text>
          )}
          {orphans.map((r) => (
            <View key={r.id} style={styles.bullet}>
              <Text style={styles.bulletDot}>•</Text>
              <Text style={styles.bulletText}>{r.room_name || 'Unnamed room'}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

/**
 * RoomByRoom — for each affected room, a structured entry: materials, actions
 * taken, reasons, current status, notes.
 */
export function RoomByRoom({ snapshot }) {
  const { rooms, settings } = snapshot

  if (rooms.length === 0) return null

  return (
    <View>
      <Text style={styles.sectionHeading}>ROOM-BY-ROOM DETAILS</Text>

      {rooms.map((r, i) => (
        <View key={r.id} wrap={false} style={{ marginBottom: 12, paddingBottom: 8, borderBottomWidth: i === rooms.length - 1 ? 0 : 0.5, borderBottomColor: COLORS.ink200 }}>
          <Text style={[styles.subHeading, { marginTop: 4, color: COLORS.brandBlue }]}>
            {r.room_name || 'Unnamed room'}
          </Text>

          <RoomRow label="Final status" value={prettyKey(r.final_status)} />
          <RoomRow label="Affected materials" value={
            (r.materials ?? []).map((m) => labelLookup(settings.materials, m.key, m.key)).join(', ') || '—'
          } />
          <RoomRow label="Actions taken" value={
            (r.actions ?? []).map((a) => prettyKey(a.key)).join(', ') || '—'
          } />
          <RoomRow label="Reasons" value={
            (r.reasons ?? []).map((rs) => prettyKey(rs.key)).join('; ') || '—'
          } />
          {r.notes && r.notes.trim() && (
            <RoomRow label="Notes" value={r.notes} />
          )}
        </View>
      ))}
    </View>
  )
}

function RoomRow({ label, value }) {
  return (
    <View style={{ flexDirection: 'row', marginTop: 2 }}>
      <Text style={{
        width: 110,
        fontSize: 9,
        color: COLORS.ink600
      }}>
        {label}
      </Text>
      <Text style={{ flex: 1, fontSize: 10, color: COLORS.ink800 }}>
        {value || '—'}
      </Text>
    </View>
  )
}
