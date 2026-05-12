import { View, Text } from '@react-pdf/renderer'
import { styles } from '../theme'
import { formatDate } from '../snapshot'

/**
 * ExecutiveSummary — auto-generated paragraph describing the loss and
 * mitigation work at a high level. Pulled from the data, not free-text.
 */
export default function ExecutiveSummary({ snapshot, isFirst = true }) {
  const { job, rooms, equipmentEvents, monitoringVisits, scopeItems } = snapshot
  const customer = job.customer || {}
  const loss = job.loss_info || {}

  const numRooms = rooms.length
  const numAssets = countUniqueAssets(equipmentEvents)
  const numVisits = monitoringVisits.length
  const numScope = scopeItems.length

  const sourceText = prettyKey(loss.source_key) || 'an unspecified source'
  const catText = loss.category ? `Category ${loss.category}` : 'unclassified water'
  const classText = loss.class_of_water ? `Class ${loss.class_of_water}` : null
  const lossDate = formatDate(loss.date_of_loss)
  const inspectionDate = formatDate(loss.inspection_at)

  const summary = [
    `On ${lossDate}, ${customer.name || 'the property owner'} reported a water loss at ${customer.address || 'the property'} caused by ${sourceText.toLowerCase()}.`,
    `1-800 WATER DAMAGE of North Dakota was contacted to perform mitigation services and conducted an initial inspection on ${inspectionDate}.`,
    `The loss was classified as ${catText}${classText ? `, ${classText}` : ''}, with ${numRooms} affected room${numRooms === 1 ? '' : 's'} identified during the inspection.`,
    numAssets > 0
      ? `Mitigation included structural drying using ${numAssets} piece${numAssets === 1 ? '' : 's'} of equipment, with ${numVisits} documented monitoring visit${numVisits === 1 ? '' : 's'} to verify drying progress.`
      : `Mitigation work was scoped and is documented in this report.`,
    numScope > 0
      ? `${numScope} scope item${numScope === 1 ? '' : 's'} were performed and are detailed with their justification in the Scope section of this report.`
      : null,
    `All work was performed in accordance with IICRC S500 standards for professional water damage restoration.`,
  ].filter(Boolean).join(' ')

  return (
    <View>
      <Text style={[styles.sectionHeading, isFirst && styles.sectionHeadingFirst]}>
        EXECUTIVE SUMMARY
      </Text>
      <Text style={styles.para}>{summary}</Text>
    </View>
  )
}

function countUniqueAssets(events) {
  const set = new Set()
  for (const e of events) set.add(e.asset_label || `__${e.id}__`)
  return set.size
}

function prettyKey(key) {
  if (!key) return null
  return String(key).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
