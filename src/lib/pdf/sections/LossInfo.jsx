import { View, Text } from '@react-pdf/renderer'
import { styles } from '../theme'
import { formatDate } from '../snapshot'

/**
 * LossInfo — definition list of all the claim, customer, and contact details.
 */
export default function LossInfo({ snapshot }) {
  const { job } = snapshot
  const customer = job.customer || {}
  const loss = job.loss_info || {}

  return (
    <View>
      <Text style={styles.sectionHeading}>LOSS INFORMATION</Text>

      <Text style={styles.subHeading}>Customer</Text>
      <View style={styles.dlGrid}>
        <DLItem label="Name" value={customer.name} />
        <DLItem label="Phone" value={customer.phone} />
        <DLItem label="Email" value={customer.email} />
        <DLItem label="Address" value={customer.address} />
      </View>

      <Text style={styles.subHeading}>Claim</Text>
      <View style={styles.dlGrid}>
        <DLItem label="Job number" value={job.job_number} />
        <DLItem label="Claim number" value={loss.claim_number} />
        <DLItem label="Carrier" value={loss.carrier} />
        <DLItem label="Adjuster" value={loss.adjuster_name} />
        <DLItem label="Adjuster phone" value={loss.adjuster_phone} />
        <DLItem label="Adjuster email" value={loss.adjuster_email} />
        <DLItem label="Policy holder" value={loss.policy_holder} />
        <DLItem label="Deductible" value={loss.deductible ? `$${loss.deductible}` : null} />
      </View>

      <Text style={styles.subHeading}>Loss details</Text>
      <View style={styles.dlGrid}>
        <DLItem label="Date of loss" value={formatDate(loss.date_of_loss)} />
        <DLItem label="Inspection date" value={formatDate(loss.inspection_at)} />
        <DLItem label="Reported source" value={prettyKey(loss.source_key)} />
        <DLItem label="Cause of loss" value={loss.cause_notes} />
        <DLItem label="Category of water" value={loss.category ? `Category ${loss.category}` : null} />
        <DLItem label="Class of water" value={loss.class_of_water ? `Class ${loss.class_of_water}` : null} />
        <DLItem label="Occupancy" value={prettyKey(loss.occupancy)} />
        <DLItem label="Emergency service" value={loss.emergency_service ? 'Yes' : 'No'} />
        <DLItem label="Work auth signed" value={loss.work_auth_signed ? `Yes — ${loss.work_auth_signed_by || ''} ${formatDate(loss.work_auth_signed_at) || ''}`.trim() : 'No'} />
      </View>
    </View>
  )
}

function DLItem({ label, value }) {
  return (
    <View style={styles.dlCol}>
      <Text style={styles.dlLabel}>{label}</Text>
      <Text style={styles.dlValue}>{value || '—'}</Text>
    </View>
  )
}

function prettyKey(key) {
  if (!key) return null
  return String(key).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
