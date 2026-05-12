import { Page, View, Text, Image } from '@react-pdf/renderer'
import { COLORS, SPACING } from '../theme'
import { formatDate } from '../snapshot'

/**
 * Cover — the first page. Big brand statement, customer + claim details.
 * No header band; the cover IS the header.
 */
export default function Cover({ snapshot }) {
  const { job, tenant, generatedAt } = snapshot
  const customer = job.customer || {}
  const loss = job.loss_info || {}
  const tenantName = tenant?.company_name || '1-800 WATER DAMAGE of North Dakota'

  return (
    <Page size="LETTER" style={{ padding: 0, fontFamily: 'Helvetica' }}>
      {/* Top brand block — fills upper half */}
      <View style={{
        backgroundColor: COLORS.brandBlue,
        paddingTop: 60,
        paddingBottom: 40,
        paddingHorizontal: SPACING.pageH,
        alignItems: 'center'
      }}>
        <Image src="/brand/logo.png" style={{ width: 110, height: 110, marginBottom: 18 }} />
        <Text style={{
          fontFamily: 'Helvetica-Bold',
          fontSize: 36,
          color: COLORS.white,
          letterSpacing: 4,
          textAlign: 'center'
        }}>
          RESTORESCOPE
        </Text>
        <Text style={{
          fontFamily: 'Helvetica-Bold',
          fontSize: 16,
          color: COLORS.brandYellow,
          letterSpacing: 2,
          marginTop: 6,
          textAlign: 'center'
        }}>
          MITIGATION REPORT
        </Text>
        <Text style={{
          fontSize: 11,
          color: COLORS.white,
          opacity: 0.9,
          marginTop: 16,
          textAlign: 'center'
        }}>
          {tenantName}
        </Text>
        <Text style={{
          fontFamily: 'Helvetica-Bold',
          fontStyle: 'italic',
          fontSize: 10,
          color: COLORS.white,
          opacity: 0.85,
          marginTop: 4,
          textAlign: 'center',
          letterSpacing: 0.5
        }}>
          Restoring What Matters Most
        </Text>
      </View>
      <View style={{ height: 6, backgroundColor: COLORS.brandYellow }} />

      {/* Lower half — claim card */}
      <View style={{ padding: SPACING.pageH * 1.4, flex: 1 }}>
        <Text style={{
          fontFamily: 'Helvetica-Bold',
          fontSize: 24,
          color: COLORS.ink900,
          marginBottom: 8,
          letterSpacing: 0.4
        }}>
          {customer.name || 'Unnamed customer'}
        </Text>
        <Text style={{ fontSize: 12, color: COLORS.ink700, marginBottom: 4 }}>
          {customer.address || '—'}
        </Text>
        {customer.phone && (
          <Text style={{ fontSize: 11, color: COLORS.ink600, marginBottom: 22 }}>
            {customer.phone}
          </Text>
        )}

        <View style={{
          borderTopWidth: 0.5,
          borderTopColor: COLORS.ink300,
          paddingTop: 16,
          flexDirection: 'row',
          flexWrap: 'wrap'
        }}>
          <CoverField label="Job number" value={job.job_number} />
          <CoverField label="Claim number" value={loss.claim_number} />
          <CoverField label="Carrier" value={loss.carrier} />
          <CoverField label="Adjuster" value={loss.adjuster_name} />
          <CoverField label="Date of loss" value={formatDate(loss.date_of_loss)} />
          <CoverField label="Inspection" value={formatDate(loss.inspection_at)} />
          <CoverField label="Category / Class" value={[
            loss.category ? `Cat ${loss.category}` : null,
            loss.class_of_water ? `Class ${loss.class_of_water}` : null
          ].filter(Boolean).join(' · ') || null} />
          <CoverField label="Source of loss" value={prettyKey(loss.source_key)} />
        </View>

        <View style={{ flex: 1 }} />

        {/* Generated stamp */}
        <View style={{
          marginTop: 24,
          paddingTop: 12,
          borderTopWidth: 0.5,
          borderTopColor: COLORS.ink300
        }}>
          <Text style={{ fontSize: 9, color: COLORS.ink500 }}>
            Report generated {formatDate(generatedAt, { year: 'numeric', month: 'long', day: 'numeric' })}
          </Text>
          <Text style={{ fontSize: 9, color: COLORS.ink500, marginTop: 2 }}>
            {tenantName} · 701-670-2022
          </Text>
        </View>
      </View>
    </Page>
  )
}

function CoverField({ label, value }) {
  return (
    <View style={{ width: '50%', marginBottom: 12, paddingRight: 12 }}>
      <Text style={{
        fontSize: 8,
        color: COLORS.ink500,
        textTransform: 'uppercase',
        letterSpacing: 0.6,
        marginBottom: 2
      }}>
        {label}
      </Text>
      <Text style={{
        fontSize: 12,
        color: COLORS.ink900
      }}>
        {value || '—'}
      </Text>
    </View>
  )
}

function prettyKey(key) {
  if (!key) return null
  return String(key).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
