/**
 * Button — primary action element across the app.
 *
 * Variants:
 *   'primary'   — solid brand blue, white text (main CTAs)
 *   'secondary' — white surface, blue text + border (secondary actions)
 *   'ghost'     — transparent, blue text (tertiary, low-emphasis)
 *   'accent'    — brand yellow, blue text (the floating + buttons, key "create" CTAs)
 *   'danger'    — solid red, white text (destructive)
 *
 * Sizes:
 *   'sm' — 36px tall, dense rows
 *   'md' — 44px tall (default — field-friendly tap target)
 *   'lg' — 52px tall, hero CTAs (full-width signup buttons, "Place equipment", etc.)
 *
 * Always import from '../ui'. Never redefine.
 */
export default function Button({
  variant = 'primary',
  size = 'md',
  type = 'button',
  className = '',
  disabled,
  loading,
  children,
  ...rest
}) {
  const base =
    'inline-flex items-center justify-center gap-2 font-semibold rounded transition-colors ' +
    'focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-brand-blue ' +
    'disabled:opacity-50 disabled:cursor-not-allowed select-none whitespace-nowrap'

  const sizes = {
    sm: 'h-9 px-3 text-sm',
    md: 'h-11 px-4 text-base',
    lg: 'h-12 px-6 text-base',
  }

  // Field-friendly: bigger horizontal padding on lg
  const variants = {
    primary:
      'bg-brand-blue text-white hover:bg-brand-blue-dark active:bg-brand-blue-dark shadow-sm',
    secondary:
      'bg-white text-brand-blue border border-brand-blue hover:bg-ink-50',
    ghost:
      'bg-transparent text-brand-blue hover:bg-ink-100',
    accent:
      'bg-brand-yellow text-brand-blue-dark border border-brand-yellow-dark hover:bg-brand-yellow-dark',
    danger:
      'bg-danger text-white hover:bg-red-700',
  }

  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      {...rest}
    >
      {loading && (
        <span
          aria-hidden
          className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"
        />
      )}
      {children}
    </button>
  )
}
