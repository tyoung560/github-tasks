import type {
  Comment,
  IssueDetail,
  IssueNode,
  IssueSummary,
  Label,
  Milestone,
  RepoSummary,
  StateReason,
  SubIssueSummary,
  User,
} from './types'

/* --- Raw GraphQL shapes (only the fields the queries actually ask for) --- */

interface GqlUser {
  login: string
  avatarUrl: string
}
interface GqlNodes<T> {
  nodes?: (T | null)[] | null
}
interface GqlSummary {
  total: number
  completed: number
  percentCompleted: number
}

export interface GqlIssueCard {
  id: string
  databaseId: number | null
  number: number
  title: string
  state: 'OPEN' | 'CLOSED'
  stateReason: StateReason
  url: string
  createdAt: string
  updatedAt: string
  repository: { nameWithOwner: string }
  author: GqlUser | null
  assignees: GqlNodes<GqlUser>
  labels: GqlNodes<Label>
  comments: { totalCount: number }
  subIssuesSummary: GqlSummary | null
  parent: GqlParent | null
  subIssues?: GqlNodes<GqlIssueCard>
}

interface GqlParent {
  number: number
  title: string
  state: 'OPEN' | 'CLOSED'
  repository: { nameWithOwner: string }
}

export interface GqlIssueDetail extends GqlIssueCard {
  body: string
  bodyHTML: string
  closedAt: string | null
  milestone: { number: number; title: string; dueOn: string | null; state: 'OPEN' | 'CLOSED' } | null
  /** Aliased in the query to avoid colliding with the fragment's `comments`. */
  issueComments: {
    totalCount: number
    nodes?: (GqlComment | null)[] | null
  }
}

export interface GqlComment {
  id: string
  databaseId: number | null
  body: string
  bodyHTML: string
  createdAt: string
  author: GqlUser | null
}

export interface GqlRepo {
  nameWithOwner: string
  description: string | null
  isPrivate: boolean
  hasIssuesEnabled: boolean
  pushedAt: string | null
  issues: { totalCount: number }
}

/* --- Mappers --- */

function list<T>(c: GqlNodes<T> | null | undefined): T[] {
  return (c?.nodes ?? []).filter((n): n is T => n != null)
}

export function mapSummary(s: GqlSummary | null | undefined): SubIssueSummary | null {
  if (!s || s.total === 0) return null
  return { total: s.total, completed: s.completed, percent: s.percentCompleted }
}

export function mapUser(u: GqlUser | null | undefined): User | null {
  return u ? { login: u.login, avatarUrl: u.avatarUrl } : null
}

export function mapIssueSummary(raw: GqlIssueCard): IssueSummary {
  return {
    id: raw.id,
    databaseId: raw.databaseId ?? 0,
    number: raw.number,
    title: raw.title,
    state: raw.state,
    stateReason: raw.stateReason ?? null,
    url: raw.url,
    repo: raw.repository.nameWithOwner,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    author: mapUser(raw.author),
    assignees: list(raw.assignees).map((u) => ({ login: u.login, avatarUrl: u.avatarUrl })),
    labels: list(raw.labels).map((l) => ({ name: l.name, color: l.color, description: l.description ?? null })),
    commentCount: raw.comments?.totalCount ?? 0,
    subIssues: mapSummary(raw.subIssuesSummary),
    parent: raw.parent
      ? {
          number: raw.parent.number,
          title: raw.parent.title,
          state: raw.parent.state,
          repo: raw.parent.repository.nameWithOwner,
        }
      : null,
  }
}

export function mapIssueNode(raw: GqlIssueCard): IssueNode {
  const children = list(raw.subIssues).map(mapIssueNode)
  const declared = raw.subIssuesSummary?.total ?? 0
  return {
    ...mapIssueSummary(raw),
    children,
    hasUnloadedChildren: declared > children.length,
  }
}

export function mapComment(raw: GqlComment): Comment {
  return {
    id: raw.id,
    databaseId: raw.databaseId ?? 0,
    author: mapUser(raw.author),
    body: raw.body,
    bodyHtml: raw.bodyHTML,
    createdAt: raw.createdAt,
  }
}

export function mapMilestone(
  m: { number: number; title: string; dueOn: string | null; state: 'OPEN' | 'CLOSED' } | null,
): Milestone | null {
  if (!m) return null
  return { number: m.number, title: m.title, dueOn: m.dueOn, state: m.state === 'OPEN' ? 'open' : 'closed' }
}

export function mapIssueDetail(raw: GqlIssueDetail): { issue: IssueDetail; comments: Comment[] } {
  const children = list(raw.subIssues).map(mapIssueNode)
  return {
    issue: {
      ...mapIssueSummary(raw),
      body: raw.body ?? '',
      bodyHtml: raw.bodyHTML ?? '',
      closedAt: raw.closedAt,
      milestone: mapMilestone(raw.milestone),
      children,
    },
    comments: (raw.issueComments?.nodes ?? []).filter((c): c is GqlComment => c != null).map(mapComment),
  }
}

export function mapRepo(raw: GqlRepo): RepoSummary {
  const [owner, name] = raw.nameWithOwner.split('/')
  return {
    owner,
    name,
    nameWithOwner: raw.nameWithOwner,
    description: raw.description,
    isPrivate: raw.isPrivate,
    hasIssues: raw.hasIssuesEnabled,
    openIssues: raw.issues?.totalCount ?? 0,
    pushedAt: raw.pushedAt,
  }
}

/* --- REST shapes (writes echo back REST issues, not GraphQL ones) --- */

export interface RestIssue {
  id: number
  node_id: string
  number: number
  title: string
  body: string | null
  body_html?: string
  state: 'open' | 'closed'
  state_reason: string | null
  html_url: string
  created_at: string
  updated_at: string
  closed_at: string | null
  comments: number
  user: { login: string; avatar_url: string } | null
  assignees?: { login: string; avatar_url: string }[]
  labels?: ({ name: string; color: string; description: string | null } | string)[]
  milestone?: { number: number; title: string; due_on: string | null; state: 'open' | 'closed' } | null
  repository_url?: string
  sub_issues_summary?: { total: number; completed: number; percent_completed: number }
}

const STATE_REASONS: Record<string, StateReason> = {
  completed: 'COMPLETED',
  not_planned: 'NOT_PLANNED',
  reopened: 'REOPENED',
  duplicate: 'DUPLICATE',
}

/**
 * `repo` must be supplied because REST issue payloads only carry an API URL.
 * REST does not return the parent link, so callers merging a write response
 * back into the cache should preserve the cached `parent`.
 */
export function mapRestIssue(raw: RestIssue, repo: string): IssueSummary {
  return {
    id: raw.node_id,
    databaseId: raw.id,
    number: raw.number,
    title: raw.title,
    state: raw.state === 'open' ? 'OPEN' : 'CLOSED',
    stateReason: raw.state_reason ? (STATE_REASONS[raw.state_reason] ?? null) : null,
    url: raw.html_url,
    repo,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    author: raw.user ? { login: raw.user.login, avatarUrl: raw.user.avatar_url } : null,
    assignees: (raw.assignees ?? []).map((u) => ({ login: u.login, avatarUrl: u.avatar_url })),
    labels: (raw.labels ?? []).map((l) =>
      typeof l === 'string' ? { name: l, color: 'ededed', description: null } : { name: l.name, color: l.color, description: l.description },
    ),
    commentCount: raw.comments ?? 0,
    parent: null,
    subIssues: raw.sub_issues_summary
      ? mapSummary({
          total: raw.sub_issues_summary.total,
          completed: raw.sub_issues_summary.completed,
          percentCompleted: raw.sub_issues_summary.percent_completed,
        })
      : null,
  }
}

/** Extracts "owner/name" from a REST `repository_url`. */
export function repoFromApiUrl(url: string | undefined): string | null {
  if (!url) return null
  const m = /\/repos\/([^/]+\/[^/]+)$/.exec(url)
  return m ? m[1] : null
}
