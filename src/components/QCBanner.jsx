import { Badge } from '../ui'

/**
 * QCBanner — surfaces what's blocking finalization. Phase 1 stub: takes a
 * pre-computed array of issues. The real engine wires up in Step 16, reading
 * tenant qc_rules + job state.
 *
 * Each issue: { key, level: 'block'|'warn', label }
 */
export default function QCBanner({ issues = [], compact = false }) {
  const blocks = issues.filter((i) => i.level === 'block')
  const warns  = issues.filter((i) => i.level === 'warn')
  if (blocks.length === 0 && warns.length === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded p-3 text-sm text-green-800 flex items-center gap-2">
        <span aria-hidden>✓</span>
        Ready for review. No blocking issues found.
      </div>
    )
  }
  if (compact) {
    return (
      <div className="flex flex-wrap gap-2">
        {blocks.length > 0 && <Badge tone="red">{blocks.length} blocking</Badge>}
        {warns.length  > 0 && <Badge tone="amber">{warns.length} warning{warns.length > 1 ? 's' : ''}</Badge>}
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {blocks.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded p-3">
          <p className="font-semibold text-danger text-sm mb-1">{blocks.length} blocking issue{blocks.length > 1 ? 's' : ''}</p>
          <ul className="text-sm text-red-900 list-disc pl-5 space-y-0.5">
            {blocks.map((b) => <li key={b.key}>{b.label}</li>)}
          </ul>
        </div>
      )}
      {warns.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded p-3">
          <p className="font-semibold text-warning text-sm mb-1">{warns.length} warning{warns.length > 1 ? 's' : ''}</p>
          <ul className="text-sm text-amber-900 list-disc pl-5 space-y-0.5">
            {warns.map((w) => <li key={w.key}>{w.label}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}
