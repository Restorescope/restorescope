import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { pdf, Document, Page, View, Text, Image } from '@react-pdf/renderer'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth.jsx'
import { styles, COLORS, SPACING } from '../../lib/pdf/theme'
import { PageHeader, PageFooter } from '../../lib/pdf/PageChrome'
import {
  Header, BottomNav, Button, Card, CardHeader, CardBody, CardTitle,
} from '../../ui'

/**
 * EstimatePDFScreen — generates the branded NTE estimate PDF and downloads it.
 *
 * Same react-pdf system as the mitigation report. Saves to the `reports`
 * storage bucket with a path of {tenant}/{job}/estimates/{filename}.pdf.
 */
export default function EstimatePDFScreen() {
  const { id: jobId, estimateId } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [snapshot, setSnapshot] = useState(null)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState(null)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setProgress('Loading estimate data…')
      try {
        const [jobRes, tenantRes, estRes, lineRes] = await Promise.all([
          supabase.from('jobs').select('id, job_number, customer, loss_info').eq('id', jobId).maybeSingle(),
          supabase.from('tenants').select('company_name').limit(1).maybeSingle(),
          supabase.from('estimates').select('*').eq('id', estimateId).maybeSingle(),
          supabase.from('estimate_lines').select('*').eq('estimate_id', estimateId).order('display_order').order('created_at'),
        ])
        if (cancelled) return
        if (jobRes.error || !jobRes.data) throw new Error(jobRes.error?.message || 'Job not found')
        if (estRes.error || !estRes.data) throw new Error(estRes.error?.message || 'Estimate not found')
        setSnapshot({
          job: jobRes.data,
          tenant: tenantRes.data,
          estimate: estRes.data,
          lines: lineRes.data || [],
          generatedAt: new Date().toISOString(),
        })
        setProgress(null)
      } catch (e) {
        if (!cancelled) { setError(e.message); setProgress(null) }
      }
    }
    load()
    return () => { cancelled = true }
  }, [jobId, estimateId])

  async function generate() {
    if (!snapshot) return
    setError(null); setGenerating(true)
    try {
      setProgress('Rendering PDF…')
      const blob = await pdf(<EstimateDocument snapshot={snapshot} />).toBlob()

      const filename = `${snapshot.estimate.estimate_number || 'estimate'}-${new Date().toISOString().slice(0, 10)}.pdf`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      // Save to bucket
      setProgress('Saving to archive…')
      const storagePath = `${profile.tenant_id}/${jobId}/estimates/${filename}`
      const { error: upErr } = await supabase.storage
        .from('reports')
        .upload(storagePath, blob, { contentType: 'application/pdf', upsert: true })
      if (upErr) console.warn('Estimate archive upload failed:', upErr.message)

      setProgress(null)
      // Return to estimate detail
      setTimeout(() => navigate(`/jobs/${jobId}/estimates/${estimateId}`), 800)
    } catch (e) {
      setError(e.message || 'Generation failed')
      setProgress(null)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="min-h-screen bg-ink-50">
      <Header breadcrumb={[
        { label: 'Jobs', to: '/jobs' },
        { label: 'Job', to: `/jobs/${jobId}` },
        { label: 'Estimates', to: `/jobs/${jobId}/estimates` },
        { label: snapshot?.estimate?.estimate_number || 'Estimate', to: `/jobs/${jobId}/estimates/${estimateId}` },
        { label: 'PDF' },
      ]} />
      <main className="max-w-3xl mx-auto p-4 sm:p-6 pb-24 space-y-5">
        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-danger rounded p-3 text-sm">
            {error}
          </div>
        )}

        <Card accent="blue">
          <CardHeader>
            <CardTitle>Generate Estimate PDF</CardTitle>
            <p className="text-sm text-ink-600 mt-1">
              Creates a branded Not-to-Exceed estimate document for the customer and adjuster.
            </p>
          </CardHeader>
          <CardBody className="space-y-3">
            {progress && (
              <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-brand-blue flex items-center gap-2">
                <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                {progress}
              </div>
            )}
            <Button onClick={generate} loading={generating} disabled={!snapshot} size="lg">
              {generating ? 'Generating…' : 'Generate & download'}
            </Button>
            <p className="text-xs text-ink-500">
              The PDF will download to your computer. A copy is saved to the reports bucket for this job.
            </p>
          </CardBody>
        </Card>
      </main>

      <BottomNav jobId={jobId} />
    </div>
  )
}

// ===========================================================================
// PDF Document
// ===========================================================================

function EstimateDocument({ snapshot }) {
  const tenantName = snapshot.tenant?.company_name || '1-800 WATER DAMAGE of North Dakota'
  const customerName = snapshot.job.customer?.name || ''
  const jobNumber = snapshot.job.job_number || ''
  const chromeProps = { tenantName, jobNumber, customerName }

  return (
    <Document
      title={`NTE Estimate — ${snapshot.estimate.estimate_number || 'Job'}`}
      author={tenantName}
      subject="Not-to-Exceed estimate"
      keywords="estimate, NTE, water mitigation"
    >
      {/* Cover-style first page */}
      <CoverPage snapshot={snapshot} tenantName={tenantName} />

      {/* Line items + totals */}
      <Page size="LETTER" style={styles.page}>
        <PageHeader {...chromeProps} />
        <PageFooter {...chromeProps} />

        <LineItemsSection snapshot={snapshot} />
        <TotalsSection snapshot={snapshot} />
        <NTETermsSection />
        <SignatureSection snapshot={snapshot} />
      </Page>
    </Document>
  )
}

// ---------------------------------------------------------------------------

function CoverPage({ snapshot, tenantName }) {
  const { estimate, job, generatedAt } = snapshot
  const customer = job.customer || {}
  const loss = job.loss_info || {}

  return (
    <Page size="LETTER" style={{ padding: 0, fontFamily: 'Helvetica' }}>
      {/* Top brand block */}
      <View style={{
        backgroundColor: COLORS.brandBlue,
        paddingTop: 60,
        paddingBottom: 40,
        paddingHorizontal: SPACING.pageH,
        alignItems: 'center',
      }}>
        <Image src="/brand/logo.png" style={{ width: 110, height: 110, marginBottom: 18 }} />
        <Text style={{
          fontFamily: 'Helvetica-Bold',
          fontSize: 36,
          color: COLORS.white,
          letterSpacing: 4,
          textAlign: 'center',
        }}>
          NTE ESTIMATE
        </Text>
        <Text style={{
          fontFamily: 'Helvetica-Bold',
          fontSize: 14,
          color: COLORS.brandYellow,
          letterSpacing: 2,
          marginTop: 6,
          textAlign: 'center',
        }}>
          NOT-TO-EXCEED PRICING
        </Text>
        <Text style={{
          fontSize: 11,
          color: COLORS.white,
          opacity: 0.9,
          marginTop: 16,
          textAlign: 'center',
        }}>
          {tenantName}
        </Text>
        <Text style={{
          fontFamily: 'Helvetica-Oblique',
          fontSize: 10,
          color: COLORS.white,
          opacity: 0.85,
          marginTop: 4,
          textAlign: 'center',
          letterSpacing: 0.5,
        }}>
          Restoring What Matters Most
        </Text>
      </View>
      <View style={{ height: 6, backgroundColor: COLORS.brandYellow }} />

      {/* Customer + claim block */}
      <View style={{ padding: SPACING.pageH * 1.4, flex: 1 }}>
        <Text style={{
          fontFamily: 'Helvetica-Bold',
          fontSize: 24,
          color: COLORS.ink900,
          marginBottom: 8,
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
          flexWrap: 'wrap',
        }}>
          <CoverField label="Estimate number" value={estimate.estimate_number} />
          <CoverField label="Version" value={`V${estimate.version}`} />
          <CoverField label="Job number" value={job.job_number} />
          <CoverField label="Claim number" value={loss.claim_number} />
          <CoverField label="Carrier" value={loss.carrier} />
          <CoverField label="Estimator" value={estimate.estimator_name} />
          <CoverField label="Date prepared" value={formatDate(generatedAt)} />
          <CoverField label="Loss type" value={prettyKey(loss.source_key)} />
        </View>

        {estimate.scope_summary && (
          <View style={{ marginTop: 16 }}>
            <Text style={{
              fontSize: 8,
              color: COLORS.ink500,
              textTransform: 'uppercase',
              letterSpacing: 0.6,
              marginBottom: 4,
            }}>Scope summary</Text>
            <Text style={{ fontSize: 11, color: COLORS.ink800, lineHeight: 1.5 }}>
              {estimate.scope_summary}
            </Text>
          </View>
        )}

        {/* Total preview at bottom of cover */}
        <View style={{ flex: 1 }} />
        <View style={{
          backgroundColor: COLORS.brandBlue,
          padding: 16,
          borderRadius: 4,
          flexDirection: 'row',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginTop: 24,
        }}>
          <Text style={{
            fontFamily: 'Helvetica-Bold',
            fontSize: 14,
            color: COLORS.white,
            letterSpacing: 1.5,
          }}>NOT-TO-EXCEED TOTAL</Text>
          <Text style={{
            fontFamily: 'Helvetica-Bold',
            fontSize: 28,
            color: COLORS.brandYellow,
          }}>
            {fmtCurrency(estimate.total)}
          </Text>
        </View>

        {estimate.customer_signed_at && (
          <View style={{
            marginTop: 12,
            padding: 8,
            backgroundColor: '#16A34A',
            borderRadius: 3,
            alignItems: 'center',
          }}>
            <Text style={{
              fontFamily: 'Helvetica-Bold',
              fontSize: 11,
              color: COLORS.white,
              letterSpacing: 1.5,
            }}>
              ✓ ACCEPTED BY CUSTOMER
            </Text>
            <Text style={{ fontSize: 9, color: COLORS.white, opacity: 0.92, marginTop: 2 }}>
              {estimate.customer_signature_name || ''} · {formatDate(estimate.customer_signed_at)}
            </Text>
          </View>
        )}
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
        marginBottom: 2,
      }}>{label}</Text>
      <Text style={{ fontSize: 12, color: COLORS.ink900 }}>{value || '—'}</Text>
    </View>
  )
}

// ---------------------------------------------------------------------------

function LineItemsSection({ snapshot }) {
  const { lines } = snapshot
  // Group by section
  const sectionOrder = ['Labor', 'Equipment', 'Consumables']
  const grouped = new Map()
  for (const line of lines) {
    if (!grouped.has(line.section)) grouped.set(line.section, [])
    grouped.get(line.section).push(line)
  }
  const orderedSections = sectionOrder.filter((s) => grouped.has(s))
    .concat([...grouped.keys()].filter((s) => !sectionOrder.includes(s)))

  if (lines.length === 0) {
    return (
      <View>
        <Text style={[styles.sectionHeading, styles.sectionHeadingFirst]}>LINE ITEMS</Text>
        <Text style={styles.para}>No line items have been added to this estimate.</Text>
      </View>
    )
  }

  return (
    <View>
      <Text style={[styles.sectionHeading, styles.sectionHeadingFirst]}>LINE ITEMS</Text>

      {orderedSections.map((section, sIdx) => {
        const sectionLines = grouped.get(section)
        const sectionSub = sectionLines.reduce((s, l) => s + Number(l.line_subtotal || 0), 0)
        return (
          <View key={section} style={{ marginBottom: 10 }} wrap={false}>
            <Text style={styles.subHeading}>{section}</Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.th, { width: '44%' }]}>Description</Text>
                <Text style={[styles.th, { width: '14%' }]}>Unit</Text>
                <Text style={[styles.th, { width: '8%', textAlign: 'right' }]}>Qty</Text>
                <Text style={[styles.th, { width: '8%', textAlign: 'right' }]}>Days</Text>
                <Text style={[styles.th, { width: '13%', textAlign: 'right' }]}>Rate</Text>
                <Text style={[styles.th, { width: '13%', textAlign: 'right' }]}>Subtotal</Text>
              </View>
              {sectionLines.map((line, idx) => {
                const showsDays = (line.unit || '').toLowerCase().includes('day')
                const isLast = idx === sectionLines.length - 1
                return (
                  <View key={line.id} style={[styles.tableRow, isLast && styles.tableRowLast]}>
                    <Text style={[styles.td, { width: '44%' }]}>{line.name}</Text>
                    <Text style={[styles.td, { width: '14%', fontSize: 8.5 }]}>{line.unit}</Text>
                    <Text style={[styles.td, { width: '8%', textAlign: 'right' }]}>{Number(line.qty)}</Text>
                    <Text style={[styles.td, { width: '8%', textAlign: 'right' }]}>{showsDays ? Number(line.days) : '—'}</Text>
                    <Text style={[styles.td, { width: '13%', textAlign: 'right' }]}>{fmtCurrency(line.rate)}</Text>
                    <Text style={[styles.td, { width: '13%', textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>
                      {fmtCurrency(line.line_subtotal)}
                    </Text>
                  </View>
                )
              })}
            </View>
            <Text style={{
              fontSize: 9,
              color: COLORS.ink600,
              textAlign: 'right',
              marginTop: 2,
            }}>
              {section} subtotal: <Text style={{ fontFamily: 'Helvetica-Bold', color: COLORS.ink900 }}>{fmtCurrency(sectionSub)}</Text>
            </Text>
          </View>
        )
      })}
    </View>
  )
}

function TotalsSection({ snapshot }) {
  const { estimate } = snapshot
  return (
    <View style={{ marginTop: 12 }} wrap={false}>
      <Text style={styles.sectionHeading}>TOTALS</Text>
      <View style={{
        backgroundColor: COLORS.ink50,
        borderWidth: 0.5,
        borderColor: COLORS.ink300,
        borderRadius: 4,
        padding: 12,
      }}>
        <TotalRow label="Subtotal" value={estimate.subtotal} />
        {Number(estimate.markup_pct) > 0 && (
          <TotalRow label={`Markup (${estimate.markup_pct}%)`} value={estimate.markup_amt} />
        )}
        {Number(estimate.contingency_pct) > 0 && (
          <TotalRow label={`Contingency (${estimate.contingency_pct}%)`} value={estimate.contingency_amt} />
        )}
        {Number(estimate.tax_pct) > 0 && (
          <TotalRow label={`Tax (${estimate.tax_pct}%)`} value={estimate.tax_amt} />
        )}
        <View style={{
          marginTop: 8,
          paddingTop: 8,
          borderTopWidth: 1,
          borderTopColor: COLORS.brandYellow,
          flexDirection: 'row',
          justifyContent: 'space-between',
        }}>
          <Text style={{
            fontFamily: 'Helvetica-Bold',
            fontSize: 13,
            color: COLORS.brandBlue,
            letterSpacing: 1,
          }}>NOT-TO-EXCEED TOTAL</Text>
          <Text style={{
            fontFamily: 'Helvetica-Bold',
            fontSize: 16,
            color: COLORS.brandBlue,
          }}>{fmtCurrency(estimate.total)}</Text>
        </View>
      </View>
    </View>
  )
}

function TotalRow({ label, value }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
      <Text style={{ fontSize: 10, color: COLORS.ink700 }}>{label}</Text>
      <Text style={{ fontSize: 10, color: COLORS.ink900 }}>{fmtCurrency(value)}</Text>
    </View>
  )
}

function NTETermsSection() {
  return (
    <View style={{ marginTop: 14 }}>
      <Text style={styles.sectionHeading}>TERMS</Text>
      <Text style={[styles.para, { fontSize: 9.5, lineHeight: 1.5 }]}>
        This is a Not-to-Exceed (NTE) estimate. The total cost of services will not exceed the
        amount stated above without prior written authorization from the customer. The final invoice
        will reflect actual labor hours, equipment days, and consumables used; if the project requires
        less than estimated, the customer is billed only for the actual amount.
      </Text>
      <Text style={[styles.para, { fontSize: 9.5, lineHeight: 1.5 }]}>
        Rates conform to the 1-800 WATER DAMAGE 2026 National Rate Schedule. Pricing is exclusive
        of any federal, state, or local taxes and the costs of any required permits, approvals, or
        licenses unless explicitly stated above. Work is performed in accordance with IICRC S500
        and S520 standards as applicable.
      </Text>
    </View>
  )
}

function SignatureSection({ snapshot }) {
  const est = snapshot?.estimate || {}
  const isSigned = !!est.customer_signed_at

  return (
    <View style={{ marginTop: 24 }} wrap={false}>
      <Text style={styles.sectionHeading}>ACCEPTANCE</Text>
      <Text style={[styles.para, { fontSize: 9.5 }]}>
        By signing below, the customer authorizes 1-800 WATER DAMAGE of North Dakota to perform
        the scope of work outlined in this estimate, on a Not-to-Exceed basis.
      </Text>

      {isSigned ? (
        <View style={{ marginTop: 16 }}>
          <View style={{
            borderWidth: 0.5, borderColor: COLORS.ink400, borderRadius: 3, padding: 6,
            backgroundColor: COLORS.white, height: 80, alignItems: 'center', justifyContent: 'center',
          }}>
            <Image
              src={est.customer_signature_data}
              style={{ maxWidth: 360, height: 64, objectFit: 'contain' }}
            />
          </View>
          <View style={{ flexDirection: 'row', gap: 24, marginTop: 4 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 9, color: COLORS.ink600 }}>
                Customer signature · {est.customer_signature_name || ''}
              </Text>
            </View>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 9, color: COLORS.ink600 }}>
                Signed {formatDate(est.customer_signed_at)}
              </Text>
            </View>
          </View>

          {/* Estimator block stays as blank line — handler signs separately if needed */}
          <View style={{ flexDirection: 'row', gap: 24, marginTop: 20 }}>
            <SigBlock label="Estimator signature" />
            <SigBlock label="Date" />
          </View>
        </View>
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: 24, marginTop: 24 }}>
            <SigBlock label="Customer signature" />
            <SigBlock label="Date" />
          </View>
          <View style={{ flexDirection: 'row', gap: 24, marginTop: 16 }}>
            <SigBlock label="Estimator signature" />
            <SigBlock label="Date" />
          </View>
        </>
      )}
    </View>
  )
}

function SigBlock({ label }) {
  return (
    <View style={{ flex: 1 }}>
      <View style={{ height: 32, borderBottomWidth: 0.5, borderBottomColor: COLORS.ink400 }} />
      <Text style={{ fontSize: 9, color: COLORS.ink600, marginTop: 4 }}>{label}</Text>
    </View>
  )
}

// ---------------------------------------------------------------------------

function fmtCurrency(n) {
  if (n == null) return '$0.00'
  return Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

function prettyKey(key) {
  if (!key) return null
  return String(key).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
