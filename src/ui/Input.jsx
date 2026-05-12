import { forwardRef } from 'react'

const Input = forwardRef(function Input(
  { label, hint, error, required, className = '', containerClassName = '', ...rest },
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
      <input
        ref={ref}
        className={`w-full h-11 px-3 rounded border bg-white text-ink-900 placeholder:text-ink-400
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

export default Input
