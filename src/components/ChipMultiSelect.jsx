/**
 * ChipMultiSelect — tap-to-toggle selection from a set of options.
 *
 * Props:
 *   - label         section label
 *   - hint          small subtext
 *   - options       [{ key, label }]
 *   - value         array of selected keys
 *   - onChange      (newValue: string[]) => void
 *   - allowCustom   if true, shows "+ add custom" textbox
 *   - onAddCustom   (label) => void  (called when user adds custom; you decide
 *                                     whether to also push the new key into options)
 */
import { useState } from 'react'

export default function ChipMultiSelect({
  label, hint, options, value = [], onChange,
  allowCustom = false, onAddCustom,
}) {
  const [custom, setCustom] = useState('')

  function toggle(key) {
    if (value.includes(key)) onChange(value.filter((v) => v !== key))
    else onChange([...value, key])
  }

  function handleCustom(e) {
    e.preventDefault()
    const trimmed = custom.trim()
    if (!trimmed) return
    onAddCustom?.(trimmed)
    setCustom('')
  }

  return (
    <div>
      {label && (
        <div className="mb-2">
          <span className="block text-sm font-semibold text-ink-700">{label}</span>
          {hint && <span className="block text-xs text-ink-500 mt-0.5">{hint}</span>}
        </div>
      )}
      <ul className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const selected = value.includes(opt.key)
          return (
            <li key={opt.key}>
              <button
                type="button"
                onClick={() => toggle(opt.key)}
                aria-pressed={selected}
                className={`px-3 h-9 rounded-full text-sm font-medium border transition-colors
                  ${selected
                    ? 'bg-brand-blue text-white border-brand-blue'
                    : 'bg-white text-ink-700 border-ink-300 hover:bg-ink-100'}`}
              >
                {selected && <span aria-hidden className="mr-1">✓</span>}
                {opt.label}
              </button>
            </li>
          )
        })}
      </ul>
      {allowCustom && (
        <form onSubmit={handleCustom} className="mt-3 flex gap-2">
          <input
            type="text"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="+ add custom"
            className="flex-1 h-9 px-3 rounded border bg-white text-sm border-ink-300 focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/30 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!custom.trim()}
            className="px-3 h-9 rounded text-sm font-semibold bg-ink-100 text-ink-700 hover:bg-ink-200 disabled:opacity-40"
          >
            Add
          </button>
        </form>
      )}
    </div>
  )
}
