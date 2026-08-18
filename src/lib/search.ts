/** Builds GitHub issue-search query strings from the app's filter UI. */

export type StateFilter = 'open' | 'closed' | 'all'
export type SortKey = 'updated' | 'created' | 'comments' | 'reactions'

export interface IssueFilter {
  /** "owner/name" values. Empty means search across everything the token sees. */
  repos?: string[]
  state?: StateFilter
  text?: string
  labels?: string[]
  excludeLabels?: string[]
  /** A login, `@me`, or `none` for unassigned. */
  assignee?: string
  author?: string
  mentions?: string
  /** A milestone title, or `none`. */
  milestone?: string
  sort?: SortKey
  order?: 'asc' | 'desc'
  /** Adds `archived:false`, which is almost always what you want. */
  includeArchived?: boolean
}

/** Wraps values containing whitespace so multi-word labels survive the round trip. */
export function quoteQualifier(value: string): string {
  return /[\s:"]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value
}

export function buildIssueQuery(filter: IssueFilter): string {
  const parts: string[] = ['is:issue']

  for (const repo of filter.repos ?? []) {
    if (repo.trim()) parts.push(`repo:${repo.trim()}`)
  }

  if (filter.state && filter.state !== 'all') parts.push(`state:${filter.state}`)
  if (!filter.includeArchived) parts.push('archived:false')

  for (const label of filter.labels ?? []) {
    if (label.trim()) parts.push(`label:${quoteQualifier(label.trim())}`)
  }
  for (const label of filter.excludeLabels ?? []) {
    if (label.trim()) parts.push(`-label:${quoteQualifier(label.trim())}`)
  }

  if (filter.assignee === 'none') parts.push('no:assignee')
  else if (filter.assignee) parts.push(`assignee:${filter.assignee}`)

  if (filter.author) parts.push(`author:${filter.author}`)
  if (filter.mentions) parts.push(`mentions:${filter.mentions}`)

  if (filter.milestone === 'none') parts.push('no:milestone')
  else if (filter.milestone) parts.push(`milestone:${quoteQualifier(filter.milestone)}`)

  const sort = filter.sort ?? 'updated'
  const order = filter.order ?? 'desc'
  parts.push(`sort:${sort}-${order}`)

  const text = filter.text?.trim()
  // Free text goes last so qualifiers stay readable when the query is shown.
  return text ? `${parts.join(' ')} ${text}` : parts.join(' ')
}

/** Short human label for the active filter, used in list headers. */
export function describeFilter(filter: IssueFilter): string {
  const bits: string[] = []
  bits.push(filter.state === 'closed' ? 'Closed' : filter.state === 'all' ? 'All' : 'Open')
  if (filter.labels?.length) bits.push(filter.labels.length === 1 ? filter.labels[0] : `${filter.labels.length} labels`)
  if (filter.assignee === 'none') bits.push('Unassigned')
  else if (filter.assignee === '@me') bits.push('Mine')
  else if (filter.assignee) bits.push(`@${filter.assignee}`)
  if (filter.milestone === 'none') bits.push('No milestone')
  else if (filter.milestone) bits.push(filter.milestone)
  if (filter.text?.trim()) bits.push(`“${filter.text.trim()}”`)
  return bits.join(' · ')
}

export function countActiveFilters(filter: IssueFilter): number {
  let n = 0
  if (filter.state && filter.state !== 'open') n++
  n += filter.labels?.length ?? 0
  n += filter.excludeLabels?.length ?? 0
  if (filter.assignee) n++
  if (filter.author) n++
  if (filter.milestone) n++
  if (filter.sort && filter.sort !== 'updated') n++
  return n
}
