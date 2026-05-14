import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { pdf, Document, Page, View, Text, Image } from '@react-pdf/renderer'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth.jsx'
import { styles, COLORS, SPACING } from '../../lib/pdf/theme'
import { loadScreeningSnapshot } from '../../lib/pdf/screening-snapshot'
import {
  Header, BottomNav, Button, Card, CardHeader, CardBody, CardTitle, Badge,
} from '../../ui'

/**
 * ScreeningReportPDF — branded mold screening report.
 *
 * Sections:
 *   1. Cover — Spore-prominent NTE-style with accent strip
 *   2. Intake & inspection summary
 *   3. Findings — room-by-room alert table
 *   4. Photo log (screening categories only)
 *   5. Lab samples (if any have results)
 *   6. Recommendations
 *   7. Spore credential page
 *   8. Handler credential page
 *   9. Signed authorization
 *   10. Disclaimer & limitations
 *
 * Saves to the `reports` storage bucket and downloads to the user's device.
 */
export default function ScreeningReportPDF() {
  const { id: jobId } = useParams()
  const navigate = useNavigate()
  const { profile, tenantId } = useAuth()

  const [snapshot, setSnapshot] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true); setError(null); setProgress('Loading screening data…')
      try {
        const snap = await loadScreeningSnapshot(jobId, tenantId)
        if (cancelled) return
        setSnapshot(snap)
        setProgress(null)
      } catch (e) {
        if (!cancelled) { setError(e.message); setProgress(null) }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [jobId, tenantId])

  async function generate() {
    if (!snapshot) return
    setError(null); setGenerating(true)
    try {
      setProgress('Rendering PDF…')
      const blob = await pdf(<ScreeningDocument snapshot={snapshot} />).toBlob()
      const filename = `screening-${snapshot.job.job_number || 'report'}-${new Date().toISOString().slice(0,10)}.pdf`

      // Download
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      // Archive
      setProgress('Saving to archive…')
      const path = `${tenantId}/${jobId}/screening/${filename}`
      const { error: upErr } = await supabase.storage
        .from('reports')
        .upload(path, blob, { contentType: 'application/pdf', upsert: true })
      if (upErr) console.warn('Archive upload failed:', upErr.message)

      setProgress(null)
    } catch (e) {
      setError(e.message || 'Generation failed')
      setProgress(null)
    } finally {
      setGenerating(false)
    }
  }

  // Pre-flight checks for user warning
  const warnings = []
  if (snapshot) {
    if (!snapshot.authorization?.signed_at) {
      warnings.push('Customer has not yet signed the authorization form. The report will be generated but should not be delivered to the customer until the authorization is on file.')
    }
    if (!snapshot.alerts || snapshot.alerts.length === 0) {
      warnings.push('No alerts have been recorded in the walkthrough. Add at least one alert (or a negative documenting a clean inspection) before generating.')
    }
    if (!snapshot.inspection.recommendations_text?.trim()) {
      warnings.push('No recommendations have been entered. Add at least a brief recommendation before delivering the report.')
    }
    if (snapshot.samplesPending && snapshot.samplesPending.length > 0) {
      warnings.push(`${snapshot.samplesPending.length} lab sample${snapshot.samplesPending.length === 1 ? '' : 's'} are still pending results. Consider waiting for results before generating the final report.`)
    }
  }

  return (
    <div className="min-h-screen bg-ink-50">
      <Header breadcrumb={[
        { label: 'Jobs', to: '/jobs' },
        { label: snapshot?.job?.job_number || 'Job', to: `/jobs/${jobId}` },
        { label: 'Screening', to: `/jobs/${jobId}/screening` },
        { label: 'Report' },
      ]} />
      <main className="max-w-3xl mx-auto p-4 sm:p-6 pb-24 space-y-5">
        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-danger rounded p-3 text-sm">
            {error}
          </div>
        )}

        <Card accent="blue">
          <CardHeader>
            <CardTitle>Generate screening report PDF</CardTitle>
            <p className="text-sm text-ink-600 mt-1">
              Branded mold screening report for the customer. Includes Spore and handler
              credentials, room-by-room findings, photos, lab results (when available),
              recommendations, and signed authorization.
            </p>
          </CardHeader>
          <CardBody className="space-y-3">
            {loading ? (
              <p className="text-ink-500 text-sm">{progress || 'Loading…'}</p>
            ) : (
              <>
                {progress && (
                  <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-brand-blue flex items-center gap-2">
                    <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    {progress}
                  </div>
                )}

                {warnings.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-900 space-y-1">
                    <p className="font-semibold">Warnings:</p>
                    <ul className="list-disc pl-5">
                      {warnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  </div>
                )}

                {snapshot && (
                  <div className="bg-ink-50 border border-ink-200 rounded p-3 text-sm space-y-1">
                    <p><strong>Customer:</strong> {snapshot.job.customer?.name || '—'}</p>
                    <p><strong>Property:</strong> {snapshot.job.customer?.address || '—'}</p>
                    <p>
                      <strong>Findings:</strong> {snapshot.positiveAlerts.length} positive alert{snapshot.positiveAlerts.length === 1 ? '' : 's'}
                      {snapshot.negativeAlerts.length > 0 && `, ${snapshot.negativeAlerts.length} negative`}
                    </p>
                    <p>
                      <strong>Samples:</strong> {snapshot.samples.length} total
                      {snapshot.samplesWithResults.length > 0 && `, ${snapshot.samplesWithResults.length} with results`}
                    </p>
                    <p><strong>Authorization:</strong> {snapshot.authorization?.signed_at
                      ? <Badge tone="green">Signed</Badge>
                      : <Badge tone="red">Not signed</Badge>}</p>
                  </div>
                )}

                <Button onClick={generate} loading={generating} disabled={!snapshot} size="lg">
                  {generating ? 'Generating…' : 'Generate & download PDF'}
                </Button>
                <p className="text-xs text-ink-500">
                  A copy is also archived to the reports bucket for this job.
                </p>
              </>
            )}
          </CardBody>
        </Card>

        <div className="flex justify-between flex-wrap gap-2">
          <Link to={`/jobs/${jobId}/screening`}>
            <Button variant="secondary">← Back to Screening</Button>
          </Link>
        </div>
      </main>
      <BottomNav jobId={jobId} />
    </div>
  )
}

// ============================================================================
// PDF Document
// ============================================================================
function ScreeningDocument({ snapshot }) {
  const chrome = {
    tenantName: snapshot.tenantName,
    jobNumber: snapshot.job.job_number,
    customerName: snapshot.job.customer?.name,
  }
  return (
    <Document
      title={`Mold Screening Report — ${snapshot.job.job_number || 'Job'}`}
      author={snapshot.tenantName}
      subject="Mold screening report"
      keywords="mold, canine, screening, IICRC"
    >
      {/* 1. Cover */}
      <CoverPage snapshot={snapshot} />

      {/* 2. Intake / property history */}
      <Page size="LETTER" style={styles.page}>
        <ScreeningPageHeader {...chrome} />
        <ScreeningPageFooter {...chrome} />
        <IntakeSection snapshot={snapshot} />
        <SummarySection snapshot={snapshot} />
      </Page>

      {/* 3. Findings */}
      <Page size="LETTER" style={styles.page}>
        <ScreeningPageHeader {...chrome} />
        <ScreeningPageFooter {...chrome} />
        <FindingsSection snapshot={snapshot} />
      </Page>

      {/* 4. Photo log */}
      {snapshot.photos.length > 0 && (
        <Page size="LETTER" style={styles.page}>
          <ScreeningPageHeader {...chrome} />
          <ScreeningPageFooter {...chrome} />
          <PhotoLogSection snapshot={snapshot} />
        </Page>
      )}

      {/* 5. Lab samples (only if any exist) */}
      {snapshot.samples.length > 0 && (
        <Page size="LETTER" style={styles.page}>
          <ScreeningPageHeader {...chrome} />
          <ScreeningPageFooter {...chrome} />
          <SamplesSection snapshot={snapshot} />
        </Page>
      )}

      {/* 6. Recommendations */}
      <Page size="LETTER" style={styles.page}>
        <ScreeningPageHeader {...chrome} />
        <ScreeningPageFooter {...chrome} />
        <RecommendationsSection snapshot={snapshot} />
      </Page>

      {/* 7. Spore credential page */}
      <Page size="LETTER" style={styles.page}>
        <ScreeningPageHeader {...chrome} />
        <ScreeningPageFooter {...chrome} />
        <SporeCredentialPage snapshot={snapshot} />
      </Page>

      {/* 8. Handler credential page */}
      <Page size="LETTER" style={styles.page}>
        <ScreeningPageHeader {...chrome} />
        <ScreeningPageFooter {...chrome} />
        <HandlerCredentialPage snapshot={snapshot} />
      </Page>

      {/* 9. Signed authorization */}
      {snapshot.authorization && (
        <Page size="LETTER" style={styles.page}>
          <ScreeningPageHeader {...chrome} />
          <ScreeningPageFooter {...chrome} />
          <AuthorizationPage snapshot={snapshot} />
        </Page>
      )}

      {/* 10. Disclaimer */}
      <Page size="LETTER" style={styles.page}>
        <ScreeningPageHeader {...chrome} />
        <ScreeningPageFooter {...chrome} />
        <DisclaimerPage snapshot={snapshot} />
      </Page>
    </Document>
  )
}

// ============================================================================
// Page chrome — screening-specific (replaces "MITIGATION REPORT" with screening title)
// ============================================================================
function ScreeningPageHeader({ tenantName, jobNumber, customerName }) {
  return (
    <>
      <View style={styles.pageHeader} fixed>
        <Image style={styles.pageHeaderLogo} src="/brand/logo.png" />
        <View style={styles.pageHeaderText}>
          <Text style={styles.pageHeaderTitle}>MOLD SCREENING REPORT</Text>
          <Text style={styles.pageHeaderSub}>
            1-800 WATER DAMAGE Mold Detection Services
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

function ScreeningPageFooter({ tenantName, jobNumber }) {
  return (
    <View style={styles.pageFooter} fixed>
      <Text>
        {tenantName || '1-800 WATER DAMAGE of North Dakota'} · 701-670-2022 · Mold Detection Services
      </Text>
      <Text
        render={({ pageNumber, totalPages }) =>
          `${jobNumber || ''}  ·  Page ${pageNumber} of ${totalPages}`
        }
      />
    </View>
  )
}

// ============================================================================
// 1. Cover page — Spore-prominent
// ============================================================================
function CoverPage({ snapshot }) {
  const customer = snapshot.job.customer || {}
  const sporeName = snapshot.sporeProfile?.name || 'Spore'
  const sporePhoto = snapshot.sporeProfile?.photo_path || '/brand/spore.png'

  return (
    <Page size="LETTER" style={{ padding: 0, fontFamily: 'Helvetica' }}>
      {/* Top brand block */}
      <View style={{
        backgroundColor: COLORS.brandBlue,
        paddingTop: 56,
        paddingBottom: 36,
        paddingHorizontal: SPACING.pageH,
        alignItems: 'center',
      }}>
        <Image src="/brand/logo.png" style={{ width: 96, height: 96, marginBottom: 16 }} />
        <Text style={{
          fontFamily: 'Helvetica-Bold', fontSize: 32, color: COLORS.white,
          letterSpacing: 4, textAlign: 'center',
        }}>
          MOLD SCREENING
        </Text>
        <Text style={{
          fontFamily: 'Helvetica-Bold', fontSize: 13, color: COLORS.brandYellow,
          letterSpacing: 2, marginTop: 4, textAlign: 'center',
        }}>
          CANINE-ASSISTED INSPECTION REPORT
        </Text>
        <Text style={{
          fontSize: 11, color: COLORS.white, opacity: 0.9, marginTop: 14, textAlign: 'center',
        }}>
          1-800 WATER DAMAGE Mold Detection Services
        </Text>
      </View>
      <View style={{ height: 6, backgroundColor: COLORS.brandYellow }} />

      {/* Spore feature strip — centered */}
      <View style={{
        backgroundColor: COLORS.ink50,
        paddingVertical: 24,
        paddingHorizontal: 20,
        borderBottomWidth: 0.5,
        borderBottomColor: COLORS.ink300,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {/* Photo row — main work-vest portrait + smaller bandana shot */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
          gap: 14, marginBottom: 12,
        }}>
          <View style={{
            width: 110, height: 110, borderRadius: 55, overflow: 'hidden',
            borderWidth: 3, borderColor: COLORS.brandYellow,
            backgroundColor: COLORS.ink100,
          }}>
            <Image src={sporePhoto} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </View>
          <View style={{
            width: 70, height: 70, borderRadius: 35, overflow: 'hidden',
            borderWidth: 2, borderColor: COLORS.brandBlue,
            backgroundColor: COLORS.ink100,
          }}>
            <Image src="/brand/spore-bandana.png" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </View>
        </View>
        <Text style={{
          fontSize: 8, color: COLORS.ink500, textTransform: 'uppercase',
          letterSpacing: 0.8, textAlign: 'center',
        }}>
          Mold Detection Canine
        </Text>
        <Text style={{
          fontFamily: 'Helvetica-Bold', fontSize: 28, color: COLORS.brandBlue,
          letterSpacing: 1, marginTop: 2, textAlign: 'center',
        }}>
          {sporeName}
        </Text>
        <Text style={{
          fontSize: 10, color: COLORS.ink700, marginTop: 2,
          fontStyle: 'italic', textAlign: 'center',
        }}>
          {snapshot.sporeProfile?.tagline || 'Certified Mold Detection Canine'}
        </Text>
      </View>

      {/* Customer block */}
      <View style={{ padding: SPACING.pageH * 1.2, flex: 1 }}>
        <Text style={{
          fontFamily: 'Helvetica-Bold', fontSize: 22, color: COLORS.ink900, marginBottom: 6,
        }}>
          {customer.name || 'Unnamed customer'}
        </Text>
        <Text style={{ fontSize: 12, color: COLORS.ink700, marginBottom: 4 }}>
          {customer.address || '—'}
        </Text>
        {customer.phone && (
          <Text style={{ fontSize: 11, color: COLORS.ink600, marginBottom: 16 }}>{customer.phone}</Text>
        )}

        <View style={{
          borderTopWidth: 0.5, borderTopColor: COLORS.ink300, paddingTop: 14,
          flexDirection: 'row', flexWrap: 'wrap',
        }}>
          <CoverField label="Job number" value={snapshot.job.job_number} />
          <CoverField label="Inspection date"
            value={snapshot.inspection.started_at
              ? formatDate(snapshot.inspection.started_at)
              : formatDate(snapshot.job.created_at)} />
          <CoverField label="Handler" value={snapshot.handlerProfile?.full_name || snapshot.inspection.inspector_name} />
          <CoverField label="Canine" value={sporeName} />
          <CoverField label="Reason for screening" value={snapshot.inspection.reason_for_screening} />
          <CoverField label="Scope" value={snapshot.inspection.scope} />
        </View>

        <View style={{ flex: 1 }} />
      </View>
    </Page>
  )
}

function CoverField({ label, value }) {
  return (
    <View style={{ width: '50%', marginBottom: 10, paddingRight: 12 }}>
      <Text style={{ fontSize: 8, color: COLORS.ink500, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2 }}>{label}</Text>
      <Text style={{ fontSize: 11, color: COLORS.ink900 }}>{value || '—'}</Text>
    </View>
  )
}

// ============================================================================
// 2. Intake section
// ============================================================================
function IntakeSection({ snapshot }) {
  const insp = snapshot.inspection
  return (
    <View>
      <Text style={[styles.sectionHeading, styles.sectionHeadingFirst]}>INSPECTION SUMMARY</Text>

      <View style={styles.dlGrid}>
        <DL label="Reason for screening" value={prettyKey(insp.reason_for_screening)} />
        <DL label="Inspection date" value={insp.started_at ? formatDateTime(insp.started_at) : '—'} />
        <DL label="Scope" value={insp.scope} />
        <DL label="Inspector / handler" value={insp.inspector_name} />
        <DL label="Canine" value={insp.dog_name || 'Spore'} />
        {insp.ambient_conditions && (
          <DL label="Ambient conditions" value={insp.ambient_conditions} />
        )}
      </View>

      {insp.customer_concerns && (
        <>
          <Text style={styles.subHeading}>Customer's stated concerns</Text>
          <Text style={styles.para}>{insp.customer_concerns}</Text>
        </>
      )}

      {insp.reported_history && (
        <>
          <Text style={styles.subHeading}>Property history (notes)</Text>
          <Text style={styles.para}>{insp.reported_history}</Text>
        </>
      )}

      {insp.property_history && hasPropertyHistoryContent(insp.property_history) && (
        <>
          <Text style={styles.subHeading}>Structured property history</Text>
          {insp.property_history.year_built && (
            <Text style={styles.para}>• Year built: {insp.property_history.year_built}</Text>
          )}
          {insp.property_history.construction_type && (
            <Text style={styles.para}>• Construction: {insp.property_history.construction_type}</Text>
          )}
          {renderHistoryFlag(insp.property_history, 'prior_water_damage', 'Prior water damage')}
          {renderHistoryFlag(insp.property_history, 'exterior_issues', 'Exterior issues')}
          {renderHistoryFlag(insp.property_history, 'roofing_issues', 'Roofing issues')}
          {renderHistoryFlag(insp.property_history, 'grade_problems', 'Grade/drainage problems')}
          {renderHistoryFlag(insp.property_history, 'foundation_issues', 'Foundation issues')}
          {renderHistoryFlag(insp.property_history, 'hvac_issues', 'HVAC issues')}
          {renderHistoryFlag(insp.property_history, 'plumbing_issues', 'Plumbing issues')}
          {renderHistoryFlag(insp.property_history, 'ventilation_issues', 'Ventilation issues')}
          {renderHistoryFlag(insp.property_history, 'previous_remediation', 'Previous mold remediation')}
          {insp.property_history.other_notes && (
            <Text style={styles.para}>• Other observations: {insp.property_history.other_notes}</Text>
          )}
        </>
      )}

      {insp.visual_inspection_notes && (
        <>
          <Text style={styles.subHeading}>Visual inspection notes</Text>
          <Text style={styles.para}>{insp.visual_inspection_notes}</Text>
        </>
      )}
    </View>
  )
}

// ============================================================================
// Screening summary — 3-stat card layout
// ============================================================================
function SummarySection({ snapshot }) {
  const positives = snapshot.positiveAlerts.length
  const samples   = snapshot.samples.length
  const rooms     = snapshot.alertsByRoom.size || snapshot.rooms.length

  const positivesSub = snapshot.alertsByRoom.size > 0
    ? `across ${snapshot.alertsByRoom.size} room${snapshot.alertsByRoom.size === 1 ? '' : 's'}`
    : 'no alerts recorded'
  const samplesSub = samples > 0 ? 'sent for analysis' : 'none collected'
  const roomsSub   = 'in scope'

  return (
    <View style={{ marginTop: 14, marginBottom: 6 }} wrap={false}>
      <Text style={[styles.sectionHeading, { marginBottom: 8 }]}>SCREENING SUMMARY</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <StatCard label="POSITIVE ALERTS" value={positives} sub={positivesSub} />
        <StatCard label="LAB SAMPLES"     value={samples}   sub={samplesSub}   />
        <StatCard label="ROOMS INSPECTED" value={rooms}     sub={roomsSub}     />
      </View>
    </View>
  )
}

function StatCard({ label, value, sub }) {
  return (
    <View style={{
      flex: 1,
      borderWidth: 1, borderColor: COLORS.brandBlue,
      borderRadius: 3,
      backgroundColor: COLORS.white,
    }}>
      {/* Top blue accent strip */}
      <View style={{ height: 6, backgroundColor: COLORS.brandBlue }} />
      <View style={{ padding: 10, alignItems: 'center' }}>
        <Text style={{
          fontFamily: 'Helvetica', fontSize: 8, color: COLORS.ink600,
          letterSpacing: 0.5, marginBottom: 4, textAlign: 'center',
        }}>{label}</Text>
        <Text style={{
          fontFamily: 'Helvetica-Bold', fontSize: 36, color: COLORS.brandBlue,
          textAlign: 'center', marginBottom: 2,
        }}>{value}</Text>
        <Text style={{
          fontFamily: 'Helvetica', fontSize: 8, color: COLORS.ink600,
          textAlign: 'center',
        }}>{sub}</Text>
      </View>
    </View>
  )
}

// ============================================================================
// 3. Findings — room-by-room
// ============================================================================
function FindingsSection({ snapshot }) {
  if (snapshot.alerts.length === 0) {
    return (
      <View>
        <Text style={styles.sectionHeading}>FINDINGS</Text>
        <Text style={styles.para}>
          No alerts were recorded during the canine walkthrough of this property.
        </Text>
      </View>
    )
  }

  return (
    <View>
      <Text style={styles.sectionHeading}>FINDINGS — ROOM BY ROOM</Text>
      {[...snapshot.alertsByRoom.entries()].map(([roomName, alerts]) => (
        <View key={roomName} style={{ marginBottom: 10 }} wrap={false}>
          <Text style={styles.subHeading}>{roomName}</Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.th, { width: '15%' }]}>Strength</Text>
              <Text style={[styles.th, { width: '40%' }]}>Alert location</Text>
              <Text style={[styles.th, { width: '25%' }]}>Visible signs</Text>
              <Text style={[styles.th, { width: '20%' }]}>Notes</Text>
            </View>
            {alerts.map((a, idx) => {
              const isLast = idx === alerts.length - 1
              return (
                <View key={a.id} style={[styles.tableRow, isLast && styles.tableRowLast]}>
                  <Text style={[styles.td, { width: '15%' }]}>{labelStrength(a.alert_strength)}</Text>
                  <Text style={[styles.td, { width: '40%' }]}>{a.alert_location || '—'}</Text>
                  <Text style={[styles.td, { width: '25%' }]}>{a.visible_signs || '—'}</Text>
                  <Text style={[styles.td, { width: '20%' }]}>{a.notes || '—'}</Text>
                </View>
              )
            })}
          </View>

          {/* Optional measurements summary */}
          {alerts.some((a) => a.moisture_value != null || a.thermal_observation || a.wall_cavity_test_result) && (
            <View style={{ paddingLeft: 4, marginTop: 4, marginBottom: 4 }}>
              {alerts.map((a) => {
                const measurements = []
                if (a.moisture_value != null) measurements.push(`Moisture: ${a.moisture_value} ${a.moisture_unit || ''}`)
                if (a.thermal_observation) measurements.push(`Thermal: ${a.thermal_observation}`)
                if (a.wall_cavity_test_result) measurements.push(`Wall cavity: ${a.wall_cavity_test_result}`)
                if (measurements.length === 0) return null
                return (
                  <Text key={a.id} style={{ fontSize: 8.5, color: COLORS.ink600, marginBottom: 1 }}>
                    {a.alert_location?.slice(0, 30) || 'Alert'} — {measurements.join(' · ')}
                  </Text>
                )
              })}
            </View>
          )}
        </View>
      ))}
    </View>
  )
}

// ============================================================================
// 4. Photo log
// ============================================================================
function PhotoLogSection({ snapshot }) {
  return (
    <View>
      <Text style={[styles.sectionHeading, styles.sectionHeadingFirst]}>PHOTO LOG</Text>
      {[...snapshot.photosByRoom.entries()].map(([roomName, photos]) => (
        <View key={roomName} style={{ marginBottom: 10 }}>
          <Text style={styles.subHeading}>{roomName}</Text>
          <View style={styles.photoGrid}>
            {photos.map((photo) => (
              <View key={photo.id} style={styles.photoCell} wrap={false}>
                <Image src={photo.url} style={styles.photoImg} />
                <Text style={styles.photoCaption}>
                  {prettyKey(photo.category?.replace(/^screening_/, ''))}
                  {photo.caption && ` — ${photo.caption}`}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  )
}

// ============================================================================
// 5. Lab samples
// ============================================================================
function SamplesSection({ snapshot }) {
  return (
    <View>
      <Text style={[styles.sectionHeading, styles.sectionHeadingFirst]}>LAB SAMPLES</Text>
      <Text style={styles.para}>
        Samples were collected during the screening and submitted to a qualified
        laboratory for analysis. Canine alerts indicate the possible presence of
        mold; laboratory analysis confirms species and concentrations.
      </Text>

      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={[styles.th, { width: '12%' }]}>Sample</Text>
          <Text style={[styles.th, { width: '13%' }]}>Type</Text>
          <Text style={[styles.th, { width: '30%' }]}>Location</Text>
          <Text style={[styles.th, { width: '12%' }]}>Status</Text>
          <Text style={[styles.th, { width: '33%' }]}>Result</Text>
        </View>
        {snapshot.samples.map((s, idx) => {
          const isLast = idx === snapshot.samples.length - 1
          return (
            <View key={s.id} style={[styles.tableRow, isLast && styles.tableRowLast]}>
              <Text style={[styles.td, { width: '12%', fontFamily: 'Helvetica-Bold' }]}>{s.sample_id_label || '—'}</Text>
              <Text style={[styles.td, { width: '13%' }]}>{labelSampleType(s.sample_type)}</Text>
              <Text style={[styles.td, { width: '30%' }]}>{s.location_label || '—'}</Text>
              <Text style={[styles.td, { width: '12%' }]}>{labelSampleStatus(s.status)}</Text>
              <Text style={[styles.td, { width: '33%' }]}>{s.result_summary || (s.status === 'pending' || s.status === 'sent' ? 'Pending lab results' : '—')}</Text>
            </View>
          )
        })}
      </View>

      {/* Detail interpretations for samples that have full notes */}
      {snapshot.samplesWithResults.filter((s) => s.result_notes).length > 0 && (
        <>
          <Text style={styles.subHeading}>Laboratory interpretation</Text>
          {snapshot.samplesWithResults.filter((s) => s.result_notes).map((s) => (
            <View key={s.id} style={{ marginBottom: 6 }}>
              <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 10, color: COLORS.ink900 }}>
                {s.sample_id_label} — {s.location_label}
              </Text>
              <Text style={styles.para}>{s.result_notes}</Text>
            </View>
          ))}
        </>
      )}
    </View>
  )
}

// ============================================================================
// 6. Recommendations
// ============================================================================
function RecommendationsSection({ snapshot }) {
  const text = (snapshot.inspection.recommendations_text || '').trim()
  if (!text) {
    return (
      <View>
        <Text style={[styles.sectionHeading, styles.sectionHeadingFirst]}>RECOMMENDATIONS</Text>
        <Text style={styles.para}>
          No specific recommendations have been recorded for this screening.
        </Text>
      </View>
    )
  }

  // Split into bullet lines — handle both "- " prefix and plain lines
  const lines = text.split(/\r?\n/).map((l) => l.replace(/^[-•*]\s*/, '').trim()).filter(Boolean)

  return (
    <View>
      <Text style={[styles.sectionHeading, styles.sectionHeadingFirst]}>RECOMMENDATIONS</Text>
      <Text style={styles.para}>
        Based on the findings of this screening, the following recommendations are made for
        the customer's consideration. These are professional recommendations; final decisions
        about further investigation, remediation, or other action rest with the property owner.
      </Text>
      {lines.map((line, i) => (
        <View key={i} style={styles.bullet} wrap={false}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>{line}</Text>
        </View>
      ))}
    </View>
  )
}

// ============================================================================
// 7. Spore credential page
// ============================================================================
function SporeCredentialPage({ snapshot }) {
  const sp = snapshot.sporeProfile || {}
  const photoPath = sp.photo_path || '/brand/spore.png'

  return (
    <View>
      <Text style={[styles.sectionHeading, styles.sectionHeadingFirst]}>YOUR MOLD DETECTION CANINE</Text>

      <View style={{ flexDirection: 'row', gap: 14, marginTop: 8 }}>
        {/* Stacked photo column — work vest on top, relaxing below */}
        <View style={{ width: 130, gap: 8 }}>
          <View style={{
            width: 130, height: 130, borderRadius: 8, overflow: 'hidden',
            borderWidth: 2, borderColor: COLORS.brandYellow,
            backgroundColor: COLORS.ink100,
          }}>
            <Image src={photoPath} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </View>
          <Text style={{
            fontSize: 7.5, color: COLORS.ink500, textTransform: 'uppercase',
            letterSpacing: 0.5, textAlign: 'center', marginTop: -4,
          }}>
            On duty
          </Text>
          <View style={{
            width: 130, height: 130, borderRadius: 8, overflow: 'hidden',
            borderWidth: 2, borderColor: COLORS.brandBlue,
            backgroundColor: COLORS.ink100,
          }}>
            <Image src="/brand/spore-relaxing.png" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </View>
          <Text style={{
            fontSize: 7.5, color: COLORS.ink500, textTransform: 'uppercase',
            letterSpacing: 0.5, textAlign: 'center', marginTop: -4,
          }}>
            Off the clock
          </Text>
        </View>

        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 8, color: COLORS.ink500, textTransform: 'uppercase', letterSpacing: 0.8 }}>
            Mold Detection Canine
          </Text>
          <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 28, color: COLORS.brandBlue, letterSpacing: 1, marginTop: 2 }}>
            {sp.name || 'Spore'}
          </Text>
          <Text style={{ fontSize: 11, color: COLORS.ink700, marginTop: 2, fontStyle: 'italic' }}>
            {sp.tagline || 'Certified Mold Detection Canine'}
          </Text>

          <View style={{ marginTop: 12, gap: 4 }}>
            {sp.breed && <CredRow label="Breed" value={sp.breed} />}
            {sp.age_years && <CredRow label="Age" value={`${sp.age_years} years`} />}
            {sp.certifying_body && <CredRow label="Certifying body" value={sp.certifying_body} />}
            {sp.certification_no && <CredRow label="Certification #" value={sp.certification_no} />}
            {sp.certified_date && <CredRow label="Certified" value={formatDate(sp.certified_date)} />}
          </View>
        </View>
      </View>

      {sp.bio && (
        <>
          <Text style={styles.subHeading}>About {sp.name || 'Spore'}</Text>
          <Text style={styles.para}>{sp.bio}</Text>
        </>
      )}

      <Text style={styles.subHeading}>How canine mold detection works</Text>
      <Text style={styles.para}>
        Trained mold detection canines are taught to alert on the volatile organic
        compounds (VOCs) produced by actively growing mold colonies. Unlike air or
        surface samples that detect spores after they've been released into the
        environment, canine detection can identify active growth, including hidden
        growth behind walls, under floors, or in HVAC systems.
      </Text>
      <Text style={styles.para}>
        Canine screening is a presumptive method — it indicates the possible
        presence of mold but does not identify species or quantify concentrations.
        Laboratory sampling is required to confirm findings and assess remediation needs.
      </Text>
    </View>
  )
}

function CredRow({ label, value }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: COLORS.ink700, width: 110 }}>{label}:</Text>
      <Text style={{ fontSize: 9, color: COLORS.ink900, flex: 1 }}>{value}</Text>
    </View>
  )
}

// ============================================================================
// 8. Handler credential page
// ============================================================================
function HandlerCredentialPage({ snapshot }) {
  const h = snapshot.handlerProfile || {}
  return (
    <View>
      <Text style={[styles.sectionHeading, styles.sectionHeadingFirst]}>HANDLER &amp; INSPECTOR CREDENTIALS</Text>

      <View style={{ marginTop: 6 }}>
        <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 22, color: COLORS.brandBlue, letterSpacing: 0.5 }}>
          {h.full_name || snapshot.inspection.inspector_name || 'Inspector name pending'}
        </Text>
        <Text style={{ fontSize: 11, color: COLORS.ink700, marginTop: 2, fontStyle: 'italic' }}>
          {h.title || 'Certified Mold Detection Canine Handler'}
        </Text>
      </View>

      <Text style={styles.subHeading}>Handler training</Text>
      <View style={{ gap: 4 }}>
        {h.handler_cert_body && <CredRow label="Training body" value={h.handler_cert_body} />}
        {h.handler_cert_no && <CredRow label="Handler cert #" value={h.handler_cert_no} />}
        {h.handler_cert_date && <CredRow label="Certified" value={formatDate(h.handler_cert_date)} />}
        {h.years_experience && <CredRow label="Years experience" value={`${h.years_experience}+`} />}
      </View>

      {Array.isArray(h.credentials) && h.credentials.length > 0 && (
        <>
          <Text style={styles.subHeading}>Industry credentials</Text>
          <View style={{ gap: 4 }}>
            {h.credentials.map((c, idx) => (
              <View key={idx} style={{ flexDirection: 'row', gap: 8 }}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={{ flex: 1, fontSize: 10, color: COLORS.ink800 }}>
                  {c.label}{c.number ? ` (#${c.number})` : ''}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}

      {h.bio && (
        <>
          <Text style={styles.subHeading}>Professional bio</Text>
          <Text style={styles.para}>{h.bio}</Text>
        </>
      )}

      <Text style={styles.subHeading}>About 1-800 WATER DAMAGE Mold Detection Services</Text>
      <Text style={styles.para}>
        Our team combines restoration industry experience with specialized training in
        canine-assisted mold detection. We follow the IICRC S520 Standard for Professional
        Mold Remediation and the IICRC S500 Standard for Professional Water Damage Restoration
        as the foundation of our practice.
      </Text>
    </View>
  )
}

// ============================================================================
// 9. Signed authorization page
// ============================================================================
function AuthorizationPage({ snapshot }) {
  const auth = snapshot.authorization
  return (
    <View>
      <Text style={[styles.sectionHeading, styles.sectionHeadingFirst]}>SIGNED AUTHORIZATION</Text>
      <Text style={styles.para}>
        The Mold Detection Dog Authorization Form below was reviewed and signed by
        the customer prior to the screening.
      </Text>

      <View style={{
        backgroundColor: COLORS.ink50, borderWidth: 0.5, borderColor: COLORS.ink300,
        padding: 12, borderRadius: 3, marginTop: 6,
      }}>
        <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 11, color: COLORS.ink900, marginBottom: 6 }}>
          Mold Detection Dog Authorization
        </Text>
        <Text style={{ fontSize: 9.5, color: COLORS.ink800, marginBottom: 4 }}>
          The customer authorized 1-800 WATER DAMAGE of North Dakota and its certified mold
          detection canine team to perform a non-invasive screening of the property. The
          customer acknowledged that:
        </Text>
        <View style={{ paddingLeft: 6, marginBottom: 6 }}>
          <Text style={{ fontSize: 9, color: COLORS.ink800, marginBottom: 2 }}>
            • Canine screening is presumptive and does not substitute for laboratory analysis.
          </Text>
          <Text style={{ fontSize: 9, color: COLORS.ink800, marginBottom: 2 }}>
            • An alert indicates a possible scent; laboratory sampling confirms species and concentration.
          </Text>
          <Text style={{ fontSize: 9, color: COLORS.ink800, marginBottom: 2 }}>
            • Absence of alerts does not guarantee no mold is present in inaccessible areas.
          </Text>
          <Text style={{ fontSize: 9, color: COLORS.ink800, marginBottom: 2 }}>
            • Screening is limited to areas accessible at the time of inspection.
          </Text>
          <Text style={{ fontSize: 9, color: COLORS.ink800, marginBottom: 2 }}>
            • The report is not a warranty against mold growth, a substitute for remediation, or medical advice.
          </Text>
          <Text style={{ fontSize: 9, color: COLORS.ink800, marginBottom: 2 }}>
            • No demolition, invasive testing, or remediation is performed under this authorization.
          </Text>
          <Text style={{ fontSize: 9, color: COLORS.ink800, marginBottom: 2 }}>
            • Photographs may be taken of alert locations and included in the screening report.
          </Text>
        </View>
      </View>

      <View style={{ marginTop: 16 }}>
        <View style={styles.dlGrid}>
          <DL label="Customer printed name" value={auth.customer_name} />
          <DL label="Acknowledged" value={auth.acknowledged ? 'Yes' : 'No'} />
          <DL label="Signed at" value={formatDateTime(auth.signed_at)} />
          <DL label="Form version" value={auth.form_version} />
        </View>

        {auth.customer_signature_data && (
          <View style={{ marginTop: 8 }}>
            <Text style={{ fontSize: 8, color: COLORS.ink500, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>
              Customer signature
            </Text>
            <View style={{
              borderWidth: 0.5, borderColor: COLORS.ink400, borderRadius: 3, padding: 6,
              backgroundColor: COLORS.white, height: 96, alignItems: 'center', justifyContent: 'center',
            }}>
              <Image src={auth.customer_signature_data} style={{ maxWidth: 360, height: 80, objectFit: 'contain' }} />
            </View>
          </View>
        )}
      </View>
    </View>
  )
}

// ============================================================================
// 10. Disclaimer / limitations
// ============================================================================
function DisclaimerPage({ snapshot }) {
  return (
    <View>
      <Text style={[styles.sectionHeading, styles.sectionHeadingFirst]}>LIMITATIONS &amp; DISCLAIMER</Text>

      <Text style={styles.subHeading}>About canine mold detection</Text>
      <Text style={[styles.para, { marginBottom: 4 }]}>
        Canine scent detection is a presumptive screening method. A canine alert indicates the
        dog has detected compounds associated with mold growth at that location. It does NOT,
        by itself, confirm:
      </Text>
      <View style={{ paddingLeft: 6, marginBottom: 6 }}>
        <Text style={{ fontSize: 9.5, color: COLORS.ink800, marginBottom: 1 }}>• The species of mold present</Text>
        <Text style={{ fontSize: 9.5, color: COLORS.ink800, marginBottom: 1 }}>• The concentration of mold spores</Text>
        <Text style={{ fontSize: 9.5, color: COLORS.ink800, marginBottom: 1 }}>• Whether the mold poses a health risk</Text>
        <Text style={{ fontSize: 9.5, color: COLORS.ink800, marginBottom: 1 }}>• The extent of contamination beyond the alert location</Text>
      </View>

      <Text style={styles.subHeading}>Sampling and laboratory confirmation</Text>
      <Text style={[styles.para, { marginBottom: 6 }]}>
        Laboratory analysis of air, surface, or bulk samples is the recognized standard for
        confirming mold presence, identifying species, and quantifying concentrations. The
        canine handler will recommend laboratory sampling where confirmation is warranted.
      </Text>

      <Text style={styles.subHeading}>Scope and inspection limits</Text>
      <Text style={[styles.para, { marginBottom: 6 }]}>
        Screening was limited to the areas and conditions agreed upon prior to the inspection.
        Areas not accessible (locked rooms, crawlspaces, sealed cavities) cannot be screened.
        Absence of an alert does not guarantee no mold is present.
      </Text>

      <Text style={styles.subHeading}>Industry standards</Text>
      <Text style={[styles.para, { marginBottom: 4 }]}>This screening was conducted with reference to:</Text>
      <View style={{ paddingLeft: 6, marginBottom: 6 }}>
        <Text style={{ fontSize: 9.5, color: COLORS.ink800, marginBottom: 1 }}>
          • IICRC S520 — Standard for Professional Mold Remediation
        </Text>
        <Text style={{ fontSize: 9.5, color: COLORS.ink800, marginBottom: 1 }}>
          • IICRC S500 — Standard for Professional Water Damage Restoration
        </Text>
      </View>

      <Text style={styles.subHeading}>Liability &amp; report ownership</Text>
      <Text style={[styles.para, { marginBottom: 6 }]}>
        This report represents the canine handler's professional observations and findings,
        supplemented by laboratory data where applicable. It is intended for the customer's
        informational use and does not constitute a guarantee against future mold growth or a
        substitute for professional remediation or medical advice. The report is prepared for
        the customer named on the cover page and may not be reproduced or distributed except
        in its entirety.
      </Text>

      <View style={{
        marginTop: 10, padding: 8, backgroundColor: COLORS.ink50,
        borderWidth: 0.5, borderColor: COLORS.ink300, borderRadius: 3,
      }}>
        <Text style={{ fontSize: 9, color: COLORS.ink700, textAlign: 'center' }}>
          Report generated {formatDateTime(snapshot.generatedAt)} · {snapshot.tenantName}
        </Text>
        <Text style={{ fontSize: 9, color: COLORS.ink700, textAlign: 'center', marginTop: 2 }}>
          Job #{snapshot.job.job_number} · For {snapshot.job.customer?.name}
        </Text>
      </View>
    </View>
  )
}

// ============================================================================
// Helpers
// ============================================================================
function DL({ label, value }) {
  return (
    <View style={styles.dlCol}>
      <Text style={styles.dlLabel}>{label}</Text>
      <Text style={styles.dlValue}>{value || '—'}</Text>
    </View>
  )
}

function labelStrength(s) {
  return {
    strong:   'Strong',
    moderate: 'Moderate',
    weak:     'Weak',
    negative: 'Negative',
  }[s] || s || '—'
}

function labelSampleType(t) {
  return {
    air:             'Air',
    surface_tape:    'Tape lift',
    surface_swab:    'Swab',
    bulk:            'Bulk',
    wall_cavity_air: 'Wall cavity',
    outdoor_control: 'Outdoor',
  }[t] || t
}

function labelSampleStatus(s) {
  return {
    pending:  'Pending',
    sent:     'In lab',
    received: 'Received',
    reviewed: 'Reviewed',
  }[s] || s
}

function prettyKey(key) {
  if (!key) return null
  return String(key).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatDate(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

function formatDateTime(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function hasPropertyHistoryContent(ph) {
  if (!ph) return false
  if (ph.year_built || ph.construction_type || ph.other_notes) return true
  const flags = ['prior_water_damage', 'exterior_issues', 'roofing_issues',
    'grade_problems', 'foundation_issues', 'hvac_issues', 'plumbing_issues',
    'ventilation_issues', 'previous_remediation']
  return flags.some(k => ph[k])
}

function renderHistoryFlag(ph, key, label) {
  if (!ph[key]) return null
  const notes = ph[`${key}_notes`]
  return (
    <Text style={styles.para}>• {label}{notes ? ` — ${notes}` : ''}</Text>
  )
}

