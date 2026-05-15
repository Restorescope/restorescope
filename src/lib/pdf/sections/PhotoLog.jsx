import { View, Text, Image } from '@react-pdf/renderer'
import { styles, COLORS } from '../theme'
import { formatDate, formatDateTime } from '../snapshot'

/**
 * PhotoLog — water mitigation photos organized into job phases.
 *
 * Filters OUT screening_* categories — those are mold screening photos
 * that belong on the screening report, not the mitigation report.
 *
 * Photos must already have dataUrl populated by snapshot loader.
 *
 * Layout: photos grouped into job phases with bold blue section bands.
 * Within each phase, sub-grouped by category.
 */
export default function PhotoLog({ snapshot }) {
  const { photos, rooms } = snapshot

  // STRICT FILTER: exclude all screening_* photos. They belong on the
  // mold screening report, not water mitigation.
  const mitigationPhotos = photos.filter((p) => {
    const cat = p.category || ''
    return !cat.startsWith('screening_')
  })

  if (mitigationPhotos.length === 0) {
    return (
      <View>
        <Text style={styles.sectionHeading}>PHOTO LOG</Text>
        <Text style={styles.para}>No water mitigation photos have been documented.</Text>
      </View>
    )
  }

  const roomMap = new Map(rooms.map((r) => [r.id, r]))

  // Group by category, only include ones with a successfully-loaded dataUrl
  const byCategory = new Map()
  for (const p of mitigationPhotos) {
    if (!p.dataUrl) continue
    const cat = p.category || 'uncategorized'
    if (!byCategory.has(cat)) byCategory.set(cat, [])
    byCategory.get(cat).push(p)
  }

  // Job phases — each phase has a title and a list of category keys that belong to it
  const PHASES = [
    {
      title: 'INITIAL CONDITIONS',
      subtitle: 'Property arrival state, source of loss, and initial assessment.',
      categories: ['front_property', 'source_area', 'affected_overview', 'moisture_readings'],
    },
    {
      title: 'CONTENTS & PROTECTION',
      subtitle: 'Customer contents and protective measures.',
      categories: ['contents'],
    },
    {
      title: 'CONTAINMENT & SAFETY',
      subtitle: 'Containment barriers and worker safety setup.',
      categories: ['containment'],
    },
    {
      title: 'MATERIAL REMOVAL',
      subtitle: 'Before, during, and after removal of affected materials.',
      categories: ['before_removal', 'removal_progress', 'exposed_after', 'debris'],
    },
    {
      title: 'CLEANING & ANTIMICROBIAL',
      subtitle: 'Cleaning, HEPA vacuuming, and antimicrobial application.',
      categories: ['cleaning'],
    },
    {
      title: 'EQUIPMENT & DRYING',
      subtitle: 'Air movers, dehumidifiers, and drying equipment placement.',
      categories: ['equipment_placement', 'daily_monitoring'],
    },
    {
      title: 'FINAL CONDITIONS',
      subtitle: 'Drying goals met and final cleaned condition.',
      categories: ['final_dry', 'final_condition'],
    },
  ]

  // Build the phase render data — only include phases that have at least one photo
  const phaseData = []
  const usedCategories = new Set()
  for (const phase of PHASES) {
    const phasePhotos = []
    for (const cat of phase.categories) {
      if (byCategory.has(cat)) {
        phasePhotos.push({ category: cat, photos: byCategory.get(cat) })
        usedCategories.add(cat)
      }
    }
    if (phasePhotos.length > 0) {
      phaseData.push({ ...phase, groups: phasePhotos })
    }
  }

  // Any leftover categories not in any phase (custom/unknown) go into a tail "Other documentation" phase
  const otherCategories = [...byCategory.keys()].filter((c) => !usedCategories.has(c))
  if (otherCategories.length > 0) {
    const groups = otherCategories.sort().map((c) => ({ category: c, photos: byCategory.get(c) }))
    phaseData.push({
      title: 'OTHER DOCUMENTATION',
      subtitle: 'Additional photos taken during the loss.',
      groups,
    })
  }

  const totalRendered = [...byCategory.values()].reduce((s, arr) => s + arr.length, 0)
  const skippedCount = mitigationPhotos.length - totalRendered

  return (
    <View>
      <Text style={styles.sectionHeading}>PHOTO LOG</Text>
      <Text style={styles.para}>
        {totalRendered} photo{totalRendered === 1 ? '' : 's'} documenting the water mitigation, organized by phase.
        {skippedCount > 0 && ` (${skippedCount} could not be embedded.)`}
      </Text>

      {phaseData.map((phase, pi) => (
        <View key={pi} style={{ marginTop: 14 }}>
          {/* Phase band */}
          <View style={phaseBandStyle} wrap={false}>
            <Text style={phaseBandTitle}>{phase.title}</Text>
            <Text style={phaseBandSubtitle}>{phase.subtitle}</Text>
          </View>

          {phase.groups.map((g) => (
            <View key={g.category} style={{ marginTop: 6 }}>
              <Text style={categoryHeadingStyle}>
                {prettyCategory(g.category)}  ({g.photos.length})
              </Text>
              <View style={styles.photoGrid}>
                {g.photos.map((p) => {
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
          ))}
        </View>
      ))}
    </View>
  )
}

const phaseBandStyle = {
  backgroundColor: COLORS.brandBlue,
  paddingVertical: 6,
  paddingHorizontal: 8,
}
const phaseBandTitle = {
  fontFamily: 'Helvetica-Bold',
  fontSize: 11,
  color: '#ffffff',
  letterSpacing: 1,
}
const phaseBandSubtitle = {
  fontSize: 8.5,
  color: '#ffffff',
  opacity: 0.85,
  marginTop: 1,
}
const categoryHeadingStyle = {
  fontFamily: 'Helvetica-Bold',
  fontSize: 10,
  color: COLORS.brandBlue,
  marginTop: 4,
  marginBottom: 3,
  paddingBottom: 2,
  borderBottomWidth: 0.5,
  borderBottomColor: COLORS.ink300,
}

function prettyCategory(key) {
  const map = {
    front_property:        'Front of property',
    source_area:           'Source area',
    affected_overview:     'Affected area overview',
    moisture_readings:     'Moisture meter readings',
    before_removal:        'Before removal',
    removal_progress:      'Removal in progress',
    exposed_after:         'Exposed materials after removal',
    cleaning:              'Cleaning / antimicrobial',
    equipment_placement:   'Equipment placement',
    daily_monitoring:      'Daily monitoring',
    final_dry:             'Final dry readings',
    final_condition:       'Final condition',
    contents:              'Contents / protection',
    containment:           'Containment / barriers',
    debris:                'Debris / load out',
    uncategorized:         'Uncategorized',
  }
  return map[key] || String(key).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
