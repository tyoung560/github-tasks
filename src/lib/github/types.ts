/** Normalised issue model. Both the REST and GraphQL layers map into these. */

export type IssueState = 'OPEN' | 'CLOSED'
export type StateReason = 'COMPLETED' | 'NOT_PLANNED' | 'REOPENED' | 'DUPLICATE' | null

export interface User {
  login: string
  avatarUrl: string
}

export interface Label {
  name: string
  color: string
  description?: string | null
}

export interface Milestone {
  number: number
  title: string
  dueOn?: string | null
  state?: 'open' | 'closed'
  openIssues?: number
  closedIssues?: number
}

/** GitHub's own one-level-deep completion counts for an issue's children. */
export interface SubIssueSummary {
  total: number
  completed: number
  percent: number
}

export interface RepoRef {
  owner: string
  name: string
}

/** "owner/name#number" — the app's canonical identifier for an issue. */
export type IssueKey = string

export interface IssueParent {
  number: number
  title: string
  state: IssueState
  repo: string
}

export interface IssueSummary {
  /** GraphQL node id when known, otherwise `db:<databaseId>`. */
  id: string
  databaseId: number
  number: number
  title: string
  state: IssueState
  stateReason: StateReason
  url: string
  /** "owner/name" */
  repo: string
  createdAt: string
  updatedAt: string
  author: User | null
  assignees: User[]
  labels: Label[]
  commentCount: number
  subIssues: SubIssueSummary | null
  /** Present whenever the issue is itself a sub-issue of another issue. */
  parent: IssueParent | null
  /** True while the issue exists only in the local outbox. */
  pending?: boolean
}

export interface IssueNode extends IssueSummary {
  children: IssueNode[]
  /** True when GitHub reports children we did not fetch at this depth. */
  hasUnloadedChildren: boolean
}

export interface IssueDetail extends IssueSummary {
  body: string
  bodyHtml: string
  closedAt: string | null
  milestone: Milestone | null
  children: IssueNode[]
}

export interface Comment {
  id: string
  databaseId: number
  author: User | null
  body: string
  bodyHtml: string
  createdAt: string
  /** True while the comment exists only in the local outbox. */
  pending?: boolean
}

export interface RepoSummary {
  owner: string
  name: string
  nameWithOwner: string
  description: string | null
  isPrivate: boolean
  openIssues: number
  pushedAt: string | null
  hasIssues: boolean
}

export interface RateLimit {
  limit: number
  remaining: number
  resetAt: number
}

export interface Viewer {
  login: string
  name: string | null
  avatarUrl: string
}

export function repoRef(nameWithOwner: string): RepoRef {
  const [owner, name] = nameWithOwner.split('/')
  return { owner, name }
}

export function issueKey(repo: string, number: number): IssueKey {
  return `${repo}#${number}`
}

export function parseIssueKey(key: IssueKey): { repo: string; number: number } | null {
  const m = /^([^/\s]+\/[^#\s]+)#(\d+)$/.exec(key)
  return m ? { repo: m[1], number: Number(m[2]) } : null
}
