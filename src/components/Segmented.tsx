interface Props<T extends string> {
  options: { value: T; label: string; badge?: number }[]
  value: T
  onChange: (value: T) => void
  ariaLabel: string
}

/** Horizontally scrollable segmented control — fits any number of options on a phone. */
export function Segmented<T extends string>({ options, value, onChange, ariaLabel }: Props<T>) {
  return (
    <div className="scroll-x flex gap-1.5 px-4 pb-2" role="group" aria-label={ariaLabel}>
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap transition-colors ${
              active ? 'bg-ink text-canvas' : 'bg-surface text-muted ring-1 ring-line'
            }`}
          >
            {option.label}
            {option.badge != null && option.badge > 0 && (
              <span className={`ml-1.5 text-xs ${active ? 'opacity-70' : 'text-faint'}`}>{option.badge}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
