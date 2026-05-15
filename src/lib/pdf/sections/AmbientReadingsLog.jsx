import { View, Text } from '@react-pdf/renderer'
import { styles, COLORS } from '../theme'
import { formatDateTime } from '../snapshot'

/**
 * AmbientReadingsLog — Table 1 of two on the drying log section.
 *
 * One block per monitoring visit, showing:
 *   - Affected area (chamber) temp/RH/GPP
 *   - Outside temp/RH/GPP + weather conditions
 *   - Unaffected area temp/RH/GPP
 *   - Per-dehu OUT readings (temp/RH/GPP each)
 *   - Notes
 *
 * Adjusters use this to verify drying was happening — GPP differential between
 * the affected area, outside, and unaffected area is the key evidence.
 */
export default function AmbientReadingsLog({ snapshot }) {
  const visits = snapshot.monitoringVisits || []
  const dehuReadings = snapshot.dehuReadings || []
  const chambers = snapshot.chambers || []

  if (visits.length === 0) {
    return (
      <View>
        <Text style={styles.sectionHeading}>DAILY AMBIENT READINGS</Text>
        <Text style={styles.para}>No daily monitoring visits have been logged.</Text>
      </View>
    )
  }

  // Sort visits chronologically (oldest first — natural reading order)
  const sorted = [...visits].sort((a, b) => new Date(a.visit_at) - new Date(b.visit_at))

  // Group dehu readings by visit_id
  const dehuByVisit = new Map()
  for (const r of dehuReadings) {
    if (!dehuByVisit.has(r.visit_id)) dehuByVisit.set(r.visit_id, [])
    dehuByVisit.get(r.visit_id).push(r)
  }

  const chamberById = new Map(chambers.map((c) => [c.id, c]))

  return (
    <View>
      <Text style={styles.sectionHeading}>DAILY AMBIENT READINGS</Text>
      <Text style={[styles.para, { fontSize: 9, color: COLORS.ink600 }]}>
        Daily ambient temperature, relative humidity, and grains per pound (GPP) readings
        taken in the affected area, outside, and an unaffected area for comparison.
        Per-dehumidifier exhaust (OUT) readings demonstrate active moisture removal.
      </Text>

      {sorted.map((v) => {
        const chamber = chamberById.get(v.chamber_id)
        const dehus = dehuByVisit.get(v.id) || []
        return (
          <View key={v.id} style={visitBlockStyle} wrap={false}>
            <View style={visitHeaderStyle}>
              <Text style={visitHeaderText}>
                {formatDateTime(v.visit_at)}
                {chamber && `  ·  ${chamber.name}`}
              </Text>
            </View>

            <View style={tableStyle}>
              {/* Header row */}
              <View style={[rowStyle, { backgroundColor: COLORS.ink100 }]}>
                <Text style={[cellStyle, { flex: 2, fontFamily: 'Helvetica-Bold' }]}>Zone</Text>
                <Text style={[cellStyle, { flex: 1, fontFamily: 'Helvetica-Bold', textAlign: 'right' }]}>Temp</Text>
                <Text style={[cellStyle, { flex: 1, fontFamily: 'Helvetica-Bold', textAlign: 'right' }]}>RH</Text>
                <Text style={[cellStyle, { flex: 1, fontFamily: 'Helvetica-Bold', textAlign: 'right' }]}>GPP</Text>
                <Text style={[cellStyle, { flex: 2 }]}></Text>
              </View>

              {/* Affected area */}
              <ReadingRow label="Affected area" temp={v.ambient_temp_f} rh={v.ambient_rh} gpp={v.ambient_gpp} />

              {/* Outside */}
              <ReadingRow
                label="Outside"
                temp={v.outside_temp_f}
                rh={v.outside_rh}
                gpp={v.outside_gpp}
                trailer={v.weather_conditions}
              />

              {/* Unaffected */}
              <ReadingRow label="Unaffected area" temp={v.unaffected_temp_f} rh={v.unaffected_rh} gpp={v.unaffected_gpp} />

              {/* Dehu OUT readings */}
              {dehus.map((d) => (
                <ReadingRow
                  key={d.id}
                  label={`${d.dehu_asset_label} (OUT)`}
                  temp={d.exhaust_temp_f}
                  rh={d.exhaust_rh}
                  gpp={d.exhaust_gpp}
                  dim={true}
                />
              ))}
            </View>

            {v.notes && (
              <Text style={notesStyle}>Notes: {v.notes}</Text>
            )}
          </View>
        )
      })}
    </View>
  )
}

function ReadingRow({ label, temp, rh, gpp, trailer, dim }) {
  const isEmpty = temp == null && rh == null && gpp == null
  return (
    <View style={[rowStyle, dim ? { backgroundColor: '#fafafa' } : {}]}>
      <Text style={[cellStyle, { flex: 2 }, dim ? { paddingLeft: 12, color: COLORS.ink700 } : {}]}>
        {label}
      </Text>
      <Text style={[cellStyle, { flex: 1, textAlign: 'right' }]}>
        {temp != null ? `${temp}°F` : isEmpty ? '—' : ''}
      </Text>
      <Text style={[cellStyle, { flex: 1, textAlign: 'right' }]}>
        {rh != null ? `${rh}%` : isEmpty ? '—' : ''}
      </Text>
      <Text style={[cellStyle, { flex: 1, textAlign: 'right' }]}>
        {gpp != null ? `${gpp}` : isEmpty ? '—' : ''}
      </Text>
      <Text style={[cellStyle, { flex: 2, fontStyle: 'italic', color: COLORS.ink600 }]}>
        {trailer || ''}
      </Text>
    </View>
  )
}

const visitBlockStyle = {
  marginTop: 10,
  marginBottom: 4,
  borderWidth: 0.5,
  borderColor: COLORS.ink300,
  borderRadius: 2,
}
const visitHeaderStyle = {
  backgroundColor: COLORS.brandBlue,
  paddingVertical: 4,
  paddingHorizontal: 6,
}
const visitHeaderText = {
  fontFamily: 'Helvetica-Bold',
  fontSize: 9,
  color: '#ffffff',
}
const tableStyle = {
  borderTopWidth: 0,
}
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
const notesStyle = {
  fontSize: 8,
  fontStyle: 'italic',
  color: COLORS.ink600,
  paddingHorizontal: 5,
  paddingVertical: 3,
  borderTopWidth: 0.5,
  borderTopColor: COLORS.ink200,
}
