import { View, Text } from '@react-pdf/renderer'
import { styles, COLORS } from '../theme'
import { formatDate } from '../snapshot'

/**
 * Limitations — boilerplate disclaimers about scope, observation, and conditions.
 */
export function Limitations({ snapshot }) {
  return (
    <View>
      <Text style={styles.sectionHeading}>LIMITATIONS</Text>
      <Text style={styles.para}>
        This report documents observable conditions, moisture readings, and mitigation work performed at the time of inspection and during the drying process. The following limitations apply:
      </Text>

      <View style={styles.bullet}>
        <Text style={styles.bulletDot}>•</Text>
        <Text style={styles.bulletText}>
          Findings are based on visual inspection and non-destructive moisture measurement. Conditions inside wall cavities, beneath flooring, or behind sealed materials may differ from observed conditions.
        </Text>
      </View>
      <View style={styles.bullet}>
        <Text style={styles.bulletDot}>•</Text>
        <Text style={styles.bulletText}>
          Drying standards were verified using calibrated moisture meters in accordance with IICRC S500 guidelines. Reference readings were taken from unaffected areas of the same or similar materials.
        </Text>
      </View>
      <View style={styles.bullet}>
        <Text style={styles.bulletDot}>•</Text>
        <Text style={styles.bulletText}>
          1-800 WATER DAMAGE of North Dakota does not warrant or imply that areas not specifically documented in this report are dry, free of moisture, or unaffected by the loss event.
        </Text>
      </View>
      <View style={styles.bullet}>
        <Text style={styles.bulletDot}>•</Text>
        <Text style={styles.bulletText}>
          This report addresses water mitigation only. Reconstruction, repairs, replacement of removed materials, and any required microbial remediation are outside the scope of services documented herein.
        </Text>
      </View>
      <View style={styles.bullet}>
        <Text style={styles.bulletDot}>•</Text>
        <Text style={styles.bulletText}>
          Photographs are representative of conditions at the time captured. Additional photographs and documentation are retained by 1-800 WATER DAMAGE of North Dakota and available upon request.
        </Text>
      </View>
    </View>
  )
}

/**
 * CompletionStatement — final sign-off acknowledging completion or status,
 * with technician/PM signature blocks.
 */
export function CompletionStatement({ snapshot }) {
  const { job } = snapshot
  const isFinalized = job.status === 'finalized'

  return (
    <View>
      <Text style={styles.sectionHeading}>COMPLETION STATEMENT</Text>

      {isFinalized ? (
        <Text style={styles.para}>
          Mitigation services for this loss have been completed in accordance with IICRC S500 standards.
          This report was finalized on {formatDate(job.finalized_at, { year: 'numeric', month: 'long', day: 'numeric' })} and
          represents a complete record of the inspection findings, mitigation work performed, drying verification,
          and project completion.
        </Text>
      ) : (
        <Text style={styles.para}>
          This report represents the current state of mitigation for this loss as of the report generation date.
          Mitigation work may be ongoing or pending final completion. Updated reports will be issued as project status changes.
        </Text>
      )}

      <View style={{
        marginTop: 24,
        flexDirection: 'row',
        gap: 24,
      }}>
        <SignatureBlock label="Technician / Project Manager" />
        <SignatureBlock label="Customer / Insured" />
      </View>

      <Text style={[styles.para, { fontSize: 8, color: COLORS.ink500, marginTop: 24, textAlign: 'center' }]}>
        Restoring What Matters Most™  ·  1-800 WATER DAMAGE of North Dakota  ·  701-670-2022  ·  1800waterdamage.com/north-dakota
      </Text>
    </View>
  )
}

function SignatureBlock({ label }) {
  return (
    <View style={{ flex: 1 }}>
      <View style={{
        height: 36,
        borderBottomWidth: 0.5,
        borderBottomColor: COLORS.ink400,
      }} />
      <Text style={{ fontSize: 9, color: COLORS.ink600, marginTop: 4 }}>{label}</Text>
      <View style={{
        marginTop: 24,
        height: 18,
        borderBottomWidth: 0.5,
        borderBottomColor: COLORS.ink400,
      }} />
      <Text style={{ fontSize: 9, color: COLORS.ink600, marginTop: 4 }}>Date</Text>
    </View>
  )
}
