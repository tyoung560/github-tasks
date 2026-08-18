interface Props {
  percent: number
  size?: number
  strokeWidth?: number
  /** Renders "3/8" in the middle rather than a percentage. */
  label?: string
  className?: string
  /** Dims the ring and dashes the track when counts are incomplete. */
  partial?: boolean
}

/**
 * The app's signature affordance: at-a-glance completion for an issue's
 * children. Colour walks from muted → accent → green as work lands.
 */
export function ProgressRing({ percent, size = 40, strokeWidth = 4, label, className, partial }: Props) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)))
  const r = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * r
  const dash = (clamped / 100) * circumference
  const colour = clamped >= 100 ? 'var(--c-open)' : clamped > 0 ? 'var(--c-accent)' : 'var(--c-border-strong)'

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      role="img"
      aria-label={label ? `${label} complete` : `${clamped}% complete`}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--c-track)"
        strokeWidth={strokeWidth}
        strokeDasharray={partial ? '2 3' : undefined}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={colour}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circumference - dash}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dasharray 320ms ease, stroke 320ms ease' }}
      />
      {label !== undefined && (
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          fill="var(--c-text)"
          fontSize={size <= 32 ? 9 : size <= 44 ? 10 : 12}
          fontWeight={600}
        >
          {label}
        </text>
      )}
    </svg>
  )
}

export function ProgressBar({ percent, partial }: { percent: number; partial?: boolean }) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)))
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-track" role="presentation">
      <div
        className="h-full rounded-full transition-[width] duration-300"
        style={{
          width: `${clamped}%`,
          background: clamped >= 100 ? 'var(--c-open)' : 'var(--c-accent)',
          opacity: partial ? 0.65 : 1,
        }}
      />
    </div>
  )
}
