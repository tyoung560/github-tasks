const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** Compact relative time: "now", "12m", "5h", "3d", "8w", then a date. */
export function relativeTime(iso: string | number | Date, now: number = Date.now()): string {
  const then = iso instanceof Date ? iso.getTime() : typeof iso === 'number' ? iso : Date.parse(iso)
  if (Number.isNaN(then)) return ''

  const diff = now - then
  if (diff < 0) return 'soon'
  if (diff < MINUTE) return 'now'
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d`
  if (diff < 365 * DAY) return `${Math.floor(diff / (7 * DAY))}w`
  return `${Math.floor(diff / (365 * DAY))}y`
}

/** "12 Mar" / "12 Mar 2023" — used where an exact-ish date reads better. */
export function shortDate(iso: string | number | Date, now: number = Date.now()): string {
  const d = iso instanceof Date ? iso : new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const sameYear = d.getFullYear() === new Date(now).getFullYear()
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

export function isoDate(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10)
}

/** Milestone due dates read as "due in 3d" / "3d overdue". */
export function dueLabel(iso: string | null | undefined, now: number = Date.now()): string | null {
  if (!iso) return null
  const due = Date.parse(iso)
  if (Number.isNaN(due)) return null
  const days = Math.round((due - now) / DAY)
  if (days === 0) return 'due today'
  if (days > 0) return `due in ${days}d`
  return `${Math.abs(days)}d overdue`
}
