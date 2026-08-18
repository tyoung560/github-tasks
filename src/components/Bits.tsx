import type { ReactNode } from 'react'
import { IconIssueClosed, IconIssueOpen, IconSkip } from './Icon'
import type { IssueState, Label, StateReason, User } from '@/lib/github/types'

export function StateIcon({ state, reason, size = 16 }: { state: IssueState; reason?: StateReason; size?: number }) {
  if (state === 'OPEN') return <IconIssueOpen size={size} className="text-open shrink-0" />
  if (reason === 'NOT_PLANNED') return <IconSkip size={size} className="text-notplanned shrink-0" />
  return <IconIssueClosed size={size} className="text-closed shrink-0" />
}

export function StateBadge({ state, reason }: { state: IssueState; reason?: StateReason }) {
  const [text, colour] =
    state === 'OPEN'
      ? ['Open', 'var(--c-open)']
      : reason === 'NOT_PLANNED'
        ? ['Not planned', 'var(--c-not-planned)']
        : ['Closed', 'var(--c-closed)']
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ background: colour, color: 'var(--c-canvas)' }}
    >
      <StateIcon state={state} reason={reason} size={12} />
      {text}
    </span>
  )
}

/** Picks black or white text for a label chip based on its background luminance. */
export function contrastInk(hex: string): string {
  const value = hex.replace('#', '')
  if (value.length !== 6) return '#ffffff'
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) / 255)
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  return luminance > 0.45 ? '#1f2328' : '#ffffff'
}

export function LabelChip({ label, onClick }: { label: Label; onClick?: () => void }) {
  const bg = `#${label.color.replace('#', '') || 'ededed'}`
  const chip = (
    <span
      className="inline-block max-w-[10rem] truncate rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold"
      style={{ background: bg, color: contrastInk(bg) }}
      title={label.description ?? label.name}
    >
      {label.name}
    </span>
  )
  return onClick ? (
    <button type="button" onClick={onClick} className="shrink-0">
      {chip}
    </button>
  ) : (
    chip
  )
}

export function Avatar({ user, size = 20 }: { user: User; size?: number }) {
  return (
    <img
      src={user.avatarUrl}
      alt={user.login}
      width={size}
      height={size}
      loading="lazy"
      className="rounded-full bg-surface-2 ring-1 ring-line"
      style={{ width: size, height: size }}
    />
  )
}

export function AvatarStack({ users, size = 20, max = 3 }: { users: User[]; size?: number; max?: number }) {
  if (!users.length) return null
  const shown = users.slice(0, max)
  return (
    <span className="flex items-center -space-x-1.5" title={users.map((u) => u.login).join(', ')}>
      {shown.map((u) => (
        <Avatar key={u.login} user={u} size={size} />
      ))}
      {users.length > max && <span className="pl-2 text-xs text-faint">+{users.length - max}</span>}
    </span>
  )
}

export function Spinner({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="animate-spin" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.2" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-surface-2 ${className}`} />
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-8 py-14 text-center">
      {icon && <div className="text-faint">{icon}</div>}
      <p className="text-base font-semibold text-ink">{title}</p>
      {hint && <p className="max-w-xs text-sm text-muted">{hint}</p>}
      {action}
    </div>
  )
}

export function ErrorNote({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Something went wrong'
  return (
    <div className="card m-4 p-4">
      <p className="text-sm font-semibold text-danger">Could not load</p>
      <p className="mt-1 text-sm text-muted">{message}</p>
      {onRetry && (
        <button type="button" className="btn btn-secondary mt-3" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}
