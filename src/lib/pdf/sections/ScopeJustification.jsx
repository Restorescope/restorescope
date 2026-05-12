import { View, Text } from '@react-pdf/renderer'
import { styles, COLORS } from '../theme'
import { labelLookup } from '../snapshot'

/**
 * ScopeJustification — Lists every scope item with its IICRC-aligned reason.
 * Grouped by room when room_id is set; job-level items appear together.
 */
export default function ScopeJustification({ snapshot }) {
  const { scopeItems, rooms, settings } = snapshot

  if (scopeItems.length === 0) {
    return (
      <View>
        <Text style={styles.sectionHeading}>SCOPE JUSTIFICATION</Text>
        <Text style={styles.para}>No scope items have been documented.</Text>
      </View>
    )
  }

  const roomMap = new Map(rooms.map((r) => [r.id, r]))
  // Group: room_id || 'job'
  const grouped = new Map()
  for (const item of scopeItems) {
    const key = item.room_id || '__job__'
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key).push(item)
  }

  return (
    <View>
      <Text style={styles.sectionHeading}>SCOPE JUSTIFICATION</Text>
      <Text style={styles.para}>
        Each scope item below is documented with its corresponding justification, in alignment with IICRC S500 standards for water damage restoration.
      </Text>

      {[...grouped.entries()].map(([groupKey, items]) => {
        const room = roomMap.get(groupKey)
        const groupLabel = room ? room.room_name : 'Job-level scope'
        return (
          <View key={groupKey} style={{ marginTop: 6 }}>
            <Text style={styles.subHeading}>{groupLabel}</Text>
            {items.map((item) => (
              <View key={item.id} style={{
                marginBottom: 6,
                paddingLeft: 8,
                borderLeftWidth: 2,
                borderLeftColor: COLORS.brandBlue
              }}>
                <Text style={{
                  fontSize: 11,
                  color: COLORS.ink900
                }}>
                  {labelLookup(settings.scopeLibrary, item.scope_key, item.scope_key)}
                  {item.quantity && (
                    <Text style={{ color: COLORS.ink600 }}>
                      {`  ·  ${item.quantity}${item.unit ? ` ${item.unit.toUpperCase()}` : ''}`}
                    </Text>
                  )}
                </Text>
                <Text style={{
                  fontSize: 10,
                  color: COLORS.ink700,
                  marginTop: 2,
                  lineHeight: 1.45
                }}>
                  {item.reason_text || '(no reason recorded)'}
                </Text>
              </View>
            ))}
          </View>
        )
      })}
    </View>
  )
}
