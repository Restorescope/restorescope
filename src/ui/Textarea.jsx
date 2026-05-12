import { forwardRef } from 'react'

const Textarea = forwardRef(function Textarea(
  { label, hint, error, required, rows = 3, className = '', containerClassName = '', ...rest },
  ref
) {
  return (
    <label className={`block ${containerClassName}`}>
      {label && (
        <span className="block text-sm font-semibold text-ink-700 mb-1">
          {label}
          {required && <span className="text-danger ml-0.5">*</span>}
        </span>
      )}
      <textarea
        ref={ref}
        rows={rows}
        className={`w-full px-3 py-2 rounded border bg-white text-ink-900 placeholder:text-ink-400
                    border-ink-300 focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/30 focus:outline-none
                    ${error ? '!border-danger' : ''} ${className}`}
        aria-invalid={error ? 'true' : 'false'}
        {...rest}
      />
      {error ? (
        <span className="block text-xs text-danger mt-1">{error}</span>
      ) : hint ? (
        <span className="block text-xs text-ink-500 mt-1">{hint}</span>
      ) : null}
    </label>
  )
})

export default Textarea
