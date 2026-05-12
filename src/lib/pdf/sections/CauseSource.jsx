import { View, Text } from '@react-pdf/renderer'
import { styles, COLORS } from '../theme'

/**
 * CauseSource — narrative description of what caused the water intrusion
 * and what was found at inspection. Pulled from job.loss_info free-text fields.
 */
export default function CauseSource({ snapshot }) {
  const loss = snapshot.job.loss_info || {}

  const sourceText = prettyKey(loss.source_key) || 'an unspecified source'
  const cat = loss.category
  const cls = loss.class_of_water

  // Auto-build a concise narrative if no explicit cause notes are present.
  const narrative = loss.cause_notes && loss.cause_notes.trim().length > 0
    ? loss.cause_notes
    : `The reported source of loss was ${sourceText.toLowerCase()}. Upon arrival, technicians inspected affected areas, identified all impacted materials, and documented moisture conditions to scope appropriate mitigation.`

  return (
    <View>
      <Text style={styles.sectionHeading}>CAUSE & SOURCE OF LOSS</Text>
      <Text style={styles.para}>{narrative}</Text>

      <View style={{ marginTop: 8 }}>
        <CauseField label="Source identified" value={prettyKey(loss.source_key) || '—'} />
        <CauseField
          label="Category of water (IICRC S500)"
          value={cat ? `Category ${cat} — ${categoryDescription(cat)}` : '—'}
        />
        <CauseField
          label="Class of water (IICRC S500)"
          value={cls ? `Class ${cls} — ${classDescription(cls)}` : '—'}
        />
        <CauseField
          label="Containment required"
          value={cat && Number(cat) >= 2 ? 'Yes (per IICRC for Cat 2/3)' : 'Per scope'}
        />
      </View>
    </View>
  )
}

function CauseField({ label, value }) {
  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={{
        fontSize: 8,
        color: COLORS.ink500,
        textTransform: 'uppercase',
        letterSpacing: 0.6,
        marginBottom: 2,
      }}>
        {label}
      </Text>
      <Text style={{
        fontSize: 11,
        color: COLORS.ink900,
        lineHeight: 1.4,
      }}>
        {value}
      </Text>
    </View>
  )
}

function categoryDescription(cat) {
  const c = String(cat)
  if (c === '1') return 'Clean water from a sanitary source'
  if (c === '2') return 'Significantly contaminated water (gray water)'
  if (c === '3') return 'Grossly contaminated water (black water)'
  return ''
}

function classDescription(cls) {
  const c = String(cls)
  if (c === '1') return 'Least amount of water; minimal evaporation load'
  if (c === '2') return 'Significant water absorption; faster evaporation'
  if (c === '3') return 'Greatest amount of water; fastest evaporation'
  if (c === '4') return 'Specialty drying — low-permeance materials'
  return ''
}

function prettyKey(key) {
  if (!key) return null
  return String(key).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
