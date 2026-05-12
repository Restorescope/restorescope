/**
 * Small composable UI primitives. Import from '../ui'.
 *
 * Refined per the locked redesign:
 *   - Badge tones now match the dashboard mockup palette
 *   - StatusPill consolidated (job statuses + reading statuses)
 *   - EmptyState lost its decorative accent strip in favor of a clean look
 *   - Section heading uses sentence case body labels and Barlow Condensed
 *     only when explicitly requested via the `eyebrow` prop
 */

export function Badge({ children, tone = 'neutral', className = '' }) {
  const tones = {
    neutral: 'bg-ink-100 text-ink-700',
    blue:    'bg-brand-blue/10 text-brand-blue',
    yellow:  'bg-brand-yellow/30 text-brand-blue-dark',
    green:   'bg-green-100 text-green-800',
    amber:   'bg-amber-100 text-amber-800',
    red:     'bg-red-100 text-red-800',
  }
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

export function StatusPill({ status }) {
  const map = {
    draft:               { tone: 'neutral', label: 'Draft' },
    in_progress:         { tone: 'amber',   label: 'In progress' },
    ready_for_review:    { tone: 'blue',    label: 'Ready for review' },
    finalized:           { tone: 'green',   label: 'Finalized' },
    paid:                { tone: 'green',   label: 'Paid · Closed' },
    unlocked:            { tone: 'yellow',  label: 'Unlocked' },
    wet:                 { tone: 'red',     label: 'Wet' },
    drying:              { tone: 'amber',   label: 'Drying' },
    dry:                 { tone: 'green',   label: 'Dry' },
  }
  const m = map[status] ?? { tone: 'neutral', label: status ?? '—' }
  return <Badge tone={m.tone}>{m.label}</Badge>
}

export function EmptyState({ title, body, action }) {
  return (
    <div className="text-center py-10 px-4">
      <h3 className="font-semibold text-ink-900">{title}</h3>
      {body && <p className="text-sm text-ink-600 mt-1 max-w-sm mx-auto">{body}</p>}
      {action && <div className="mt-4 inline-flex">{action}</div>}
    </div>
  )
}

/**
 * Section — title + optional description + optional action button.
 *
 * Pass `eyebrow` to use the Barlow Condensed all-caps eyebrow style
 * (used on the dashboard for "DOCUMENTATION"). Default style is
 * sentence case body weight.
 */
export function Section({ title, description, action, eyebrow = false, children }) {
  const titleClass = eyebrow
    ? 'font-condensed font-semibold text-base tracking-wide uppercase text-ink-900'
    : 'text-lg font-semibold text-ink-900'
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className={titleClass}>{title}</h2>
          {description && <p className="text-sm text-ink-600 mt-0.5">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}
