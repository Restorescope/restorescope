import { View, Text } from '@react-pdf/renderer'
import { styles, COLORS } from '../theme'
import { buildEquipmentAssetList, labelLookup, formatDate } from '../snapshot'

/**
 * EquipmentSummary — tabular list of every asset that was on site, with
 * placement date, removal date (or "Currently on site"), and days on site.
 */
export default function EquipmentSummary({ snapshot }) {
  const { equipmentEvents, rooms, chambers, settings } = snapshot

  const assets = buildEquipmentAssetList(equipmentEvents)

  if (assets.length === 0) {
    return (
      <View>
        <Text style={styles.sectionHeading}>EQUIPMENT SUMMARY</Text>
        <Text style={styles.para}>No equipment has been placed on this job.</Text>
      </View>
    )
  }

  const roomMap = new Map(rooms.map((r) => [r.id, r]))
  const chamberMap = new Map(chambers.map((c) => [c.id, c]))

  return (
    <View>
      <Text style={styles.sectionHeading}>EQUIPMENT SUMMARY</Text>
      <Text style={styles.para}>
        The following equipment was placed for structural drying. Days on site are calculated through removal date or current date if equipment is still on site.
      </Text>

      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={[styles.th, { width: '24%' }]}>Asset</Text>
          <Text style={[styles.th, { width: '20%' }]}>Type</Text>
          <Text style={[styles.th, { width: '18%' }]}>Location</Text>
          <Text style={[styles.th, { width: '14%' }]}>Placed</Text>
          <Text style={[styles.th, { width: '14%' }]}>Removed</Text>
          <Text style={[styles.th, { width: '10%', textAlign: 'right' }]}>Days</Text>
        </View>
        {assets.map((a, i) => {
          const room = roomMap.get(a.room_id)
          const chamber = chamberMap.get(a.chamber_id)
          const location = chamber?.name || room?.room_name || '—'
          const isLast = i === assets.length - 1
          return (
            <View key={a.key} style={[styles.tableRow, isLast && styles.tableRowLast]}>
              <Text style={[styles.td, { width: '24%'}]}>
                {a.asset_label || '(unlabeled)'}
              </Text>
              <Text style={[styles.td, { width: '20%' }]}>
                {labelLookup(settings.equipment, a.equipment_type, a.equipment_type)}
              </Text>
              <Text style={[styles.td, { width: '18%' }]}>{location}</Text>
              <Text style={[styles.td, { width: '14%' }]}>{formatDate(a.placed_at)}</Text>
              <Text style={[styles.td, { width: '14%' }]}>
                {a.removed_at ? formatDate(a.removed_at) : 'On site'}
              </Text>
              <Text style={[styles.td, { width: '10%', textAlign: 'right' }]}>
                {a.days_on_site}
              </Text>
            </View>
          )
        })}
      </View>

      <Text style={[styles.para, { fontSize: 9, color: COLORS.ink600, marginTop: 4 }]}>
        Total assets deployed: {assets.length} · Total equipment-days on site: {assets.reduce((s, a) => s + a.days_on_site, 0)}
      </Text>
    </View>
  )
}
