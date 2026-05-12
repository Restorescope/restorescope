/**
 * Card — surface container.
 *
 * Visual: white background, soft border, subtle shadow, no automatic accent
 * strip (the redesign uses optional left-border accents instead — pass
 * `accent="blue"` for a 3px blue left border, or `accent="yellow"` for
 * threshold-warning emphasis).
 *
 * Most cards should NOT have an accent. Reserve it for cards that need
 * to call attention to themselves (Quality Control card, threshold rows).
 */
export default function Card({
  children,
  className = '',
  accent = null,           // null | 'blue' | 'yellow'
  as: Tag = 'div',
  ...rest
}) {
  const accentClass =
    accent === 'blue'   ? 'border-l-[3px] border-l-brand-blue'   :
    accent === 'yellow' ? 'border-l-[3px] border-l-brand-yellow' :
    ''
  return (
    <Tag
      className={`bg-white rounded-lg shadow-card border border-ink-200/60 ${accentClass} ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  )
}

export function CardHeader({ children, className = '' }) {
  return (
    <div className={`px-4 pt-4 pb-3 ${className}`}>
      {children}
    </div>
  )
}

export function CardBody({ children, className = '' }) {
  return <div className={`px-4 pb-4 ${className}`}>{children}</div>
}

export function CardTitle({ children, className = '' }) {
  return (
    <h2 className={`text-lg font-semibold text-ink-900 leading-tight ${className}`}>
      {children}
    </h2>
  )
}
