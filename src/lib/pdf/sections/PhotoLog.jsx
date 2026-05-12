import { View, Text, Image } from '@react-pdf/renderer'
import { styles, COLORS } from '../theme'
import { formatDate, formatDateTime } from '../snapshot'

/**
 * PhotoLog — every photo organized by category. Smart-filtered: only categories
 * with photos appear. 3-column grid; captions show category + room + timestamp.
 *
 * Photos must already have dataUrl populated by snapshot loader.
 */
export default function PhotoLog({ snapshot }) {
  const { photos, rooms } = snapshot

  if (photos.length === 0) {
    return (
      <View>
        <Text style={styles.sectionHeading}>PHOTO LOG</Text>
        <Text style={styles.para}>No photos have been documented.</Text>
      </View>
    )
  }

  const roomMap = new Map(rooms.map((r) => [r.id, r]))

  // Group by category, only include categories that have at least one photo
  // with a successfully-loaded dataUrl
  const groups = new Map()
  for (const p of photos) {
    if (!p.dataUrl) continue
    const cat = p.category || 'uncategorized'
    if (!groups.has(cat)) groups.set(cat, [])
    groups.get(cat).push(p)
  }

  // Order categories by a logical sequence
  const categoryOrder = [
    'source_area',
    'affected_overview',
    'before_removal',
    'removal_progress',
    'exposed_after',
    'containment',
    'equipment_placement',
    'moisture_readings',
    'monitoring_visit',
    'final_dry',
    'final_condition',
    'documentation',
    'damage_evidence',
    'safety_concern',
    'uncategorized',
  ]
  const sortedCategories = [...groups.keys()].sort((a, b) => {
    const ai = categoryOrder.indexOf(a)
    const bi = categoryOrder.indexOf(b)
    if (ai === -1 && bi === -1) return a.localeCompare(b)
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })

  const skippedCount = photos.length - [...groups.values()].reduce((s, arr) => s + arr.length, 0)

  return (
    <View>
      <Text style={styles.sectionHeading}>PHOTO LOG</Text>
      <Text style={styles.para}>
        {photos.length - skippedCount} photo{(photos.length - skippedCount) === 1 ? '' : 's'} are documented below, organized by category.
        {skippedCount > 0 && ` (${skippedCount} could not be embedded.)`}
      </Text>

      {sortedCategories.map((cat) => {
        const list = groups.get(cat)
        return (
          <View key={cat} style={{ marginTop: 8 }}>
            <Text style={[styles.subHeading, { color: COLORS.brandBlue, marginTop: 6 }]}>
              {prettyCategory(cat)}  ({list.length})
            </Text>
            <View style={styles.photoGrid}>
              {list.map((p) => {
                const room = roomMap.get(p.room_id)
                return (
                  <View key={p.id} style={styles.photoCell} wrap={false}>
                    <Image src={p.dataUrl} style={styles.photoImg} />
                    <Text style={styles.photoCaption}>
                      {room?.room_name ? `${room.room_name} · ` : ''}{formatDate(p.taken_at)}
                    </Text>
                    {p.caption && (
                      <Text style={[styles.photoCaption, { fontStyle: 'italic' }]}>
                        {p.caption}
                      </Text>
                    )}
                  </View>
                )
              })}
            </View>
          </View>
        )
      })}
    </View>
  )
}

function prettyCategory(key) {
  const map = {
    source_area:           'Source area',
    affected_overview:     'Affected area overview',
    before_removal:        'Before removal',
    removal_progress:      'Removal in progress',
    exposed_after:         'Exposed after removal',
    containment:           'Containment',
    equipment_placement:   'Equipment placement',
    moisture_readings:     'Moisture readings',
    monitoring_visit:      'Monitoring visits',
    final_dry:             'Final dry readings',
    final_condition:       'Final condition',
    documentation:         'Documentation',
    damage_evidence:       'Damage evidence',
    safety_concern:        'Safety concerns',
    uncategorized:         'Uncategorized',
  }
  return map[key] || String(key).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
