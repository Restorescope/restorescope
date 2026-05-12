import { View, Text, Image } from '@react-pdf/renderer'
import { styles, COLORS } from './theme'

/**
 * PageChrome — the blue header band, yellow strip, and footer that appear
 * on every page of the report. Use the `fixed` prop on these so they
 * repeat across page breaks.
 */
export function PageHeader({ tenantName, jobNumber, customerName }) {
  return (
    <>
      <View style={styles.pageHeader} fixed>
        <Image style={styles.pageHeaderLogo} src="/brand/logo.png" />
        <View style={styles.pageHeaderText}>
          <Text style={styles.pageHeaderTitle}>RESTORESCOPE — MITIGATION REPORT</Text>
          <Text style={styles.pageHeaderSub}>
            {tenantName || '1-800 WATER DAMAGE of North Dakota'}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.pageHeaderRight}>{jobNumber || ''}</Text>
          <Text style={[styles.pageHeaderRight, { fontSize: 8, opacity: 0.85 }]}>
            {customerName || ''}
          </Text>
        </View>
      </View>
      <View style={styles.pageYellowStrip} fixed />
    </>
  )
}

export function PageFooter({ tenantName, jobNumber }) {
  return (
    <View style={styles.pageFooter} fixed>
      <Text>
        {tenantName || '1-800 WATER DAMAGE of North Dakota'} · 701-670-2022 · 1800waterdamage.com/north-dakota
      </Text>
      <Text
        render={({ pageNumber, totalPages }) =>
          `${jobNumber || ''}  ·  Page ${pageNumber} of ${totalPages}`
        }
      />
    </View>
  )
}
