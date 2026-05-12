import { Document, Page, View } from '@react-pdf/renderer'
import { styles, COLORS } from './theme'
import { PageHeader, PageFooter } from './PageChrome'

import Cover from './sections/Cover'
import ExecutiveSummary from './sections/ExecutiveSummary'
import LossInfo from './sections/LossInfo'
import CauseSource from './sections/CauseSource'
import { AffectedAreasOverview, RoomByRoom } from './sections/Areas'
import ScopeJustification from './sections/ScopeJustification'
import DryingSummary from './sections/DryingSummary'
import EquipmentSummary from './sections/EquipmentSummary'
import PhotoLog from './sections/PhotoLog'
import { Limitations, CompletionStatement } from './sections/Closing'

/**
 * Report — the full mitigation report PDF.
 *
 * Structure:
 *   Page 1 — Cover (no header band)
 *   Page 2+ — ExecutiveSummary, LossInfo, CauseSource (continuous flow with header)
 *   Page 3+ — AffectedAreasOverview, RoomByRoom
 *   Then — ScopeJustification
 *   Then — DryingSummary, EquipmentSummary
 *   Then — PhotoLog (often spans multiple pages)
 *   Last — Limitations + CompletionStatement
 *
 * Sections flow naturally onto pages; we use wrap={false} on tight blocks
 * (room cards, photo cells) so they don't break mid-block.
 */
export default function Report({ snapshot }) {
  const tenantName = snapshot.tenant?.company_name || '1-800 WATER DAMAGE of North Dakota'
  const customerName = snapshot.job.customer?.name || ''
  const jobNumber = snapshot.job.job_number || ''

  const chromeProps = { tenantName, jobNumber, customerName }

  return (
    <Document
      title={`Mitigation Report — ${jobNumber || 'Job'}`}
      author={tenantName}
      subject="Water mitigation report"
      keywords="water mitigation, IICRC, restoration"
    >
      {/* Page 1: Cover (special — no chrome) */}
      <Cover snapshot={snapshot} />

      {/* Page 2: Summary + Loss Info + Cause/Source */}
      <Page size="LETTER" style={styles.page}>
        <PageHeader {...chromeProps} />
        <PageFooter {...chromeProps} />

        <ExecutiveSummary snapshot={snapshot} isFirst />
        <LossInfo snapshot={snapshot} />
        <CauseSource snapshot={snapshot} />
      </Page>

      {/* Page 3: Affected Areas + Room by Room */}
      <Page size="LETTER" style={styles.page}>
        <PageHeader {...chromeProps} />
        <PageFooter {...chromeProps} />

        <AffectedAreasOverview snapshot={snapshot} />
        <RoomByRoom snapshot={snapshot} />
      </Page>

      {/* Page 4: Scope + Drying + Equipment */}
      <Page size="LETTER" style={styles.page}>
        <PageHeader {...chromeProps} />
        <PageFooter {...chromeProps} />

        <ScopeJustification snapshot={snapshot} />
        <DryingSummary snapshot={snapshot} />
        <EquipmentSummary snapshot={snapshot} />
      </Page>

      {/* Page 5+: Photo Log (may span many pages) */}
      <Page size="LETTER" style={styles.page}>
        <PageHeader {...chromeProps} />
        <PageFooter {...chromeProps} />

        <PhotoLog snapshot={snapshot} />
      </Page>

      {/* Final: Limitations + Completion */}
      <Page size="LETTER" style={styles.page}>
        <PageHeader {...chromeProps} />
        <PageFooter {...chromeProps} />

        <Limitations snapshot={snapshot} />
        <CompletionStatement snapshot={snapshot} />
      </Page>
    </Document>
  )
}
