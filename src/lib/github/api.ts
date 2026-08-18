import { graphql, rest } from './client'
import {
  ISSUE_DETAIL_QUERY,
  RECENT_REPOS_QUERY,
  REPO_META_QUERY,
  SEARCH_ISSUES_QUERY,
  SEARCH_REPOS_QUERY,
  SUB_ISSUES_QUERY,
  VIEWER_QUERY,
} from './queries'
import {
  mapIssueDetail,
  mapIssueNode,
  mapIssueSummary,
  mapMilestone,
  mapRepo,
  mapRestIssue,
  type GqlIssueCard,
  type GqlIssueDetail,
  type GqlRepo,
  type RestIssue,
} from './map'
import type {
  Comment,
  IssueDetail,
  IssueNode,
  IssueSummary,
  Label,
  Milestone,
  RepoSummary,
  User,
  Viewer,
} from './types'

export interface Page<T> {
  items: T[]
  totalCount: number
  nextCursor: string | null
}

export interface RepoMeta extends RepoSummary {
  labels: Label[]
  milestones: Milestone[]
  assignableUsers: User[]
}

/* ------------------------------- reads ------------------------------- */

export async function getViewer(token: string, signal?: AbortSignal): Promise<Viewer> {
  const data = await graphql<{ viewer: Viewer }>(token, VIEWER_QUERY, {}, signal)
  return data.viewer
}

export async function searchIssues(
  token: string,
  q: string,
  opts: { first?: number; after?: string | null; signal?: AbortSignal } = {},
): Promise<Page<IssueSummary>> {
  const data = await graphql<{
    search: {
      issueCount: number
      pageInfo: { hasNextPage: boolean; endCursor: string | null }
      nodes: (GqlIssueCard | null)[]
    }
  }>(token, SEARCH_ISSUES_QUERY, { q, first: opts.first ?? 25, after: opts.after ?? null }, opts.signal)

  return {
    items: data.search.nodes.filter((n): n is GqlIssueCard => n != null && 'number' in n).map(mapIssueSummary),
    totalCount: data.search.issueCount,
    nextCursor: data.search.pageInfo.hasNextPage ? data.search.pageInfo.endCursor : null,
  }
}

export async function getIssue(
  token: string,
  owner: string,
  name: string,
  number: number,
  signal?: AbortSignal,
): Promise<{ issue: IssueDetail; comments: Comment[]; commentCount: number }> {
  const data = await graphql<{ repository: { issue: GqlIssueDetail | null } | null }>(
    token,
    ISSUE_DETAIL_QUERY,
    { owner, name, number, comments: 50 },
    signal,
  )
  const raw = data.repository?.issue
  if (!raw) throw new Error(`${owner}/${name}#${number} not found`)
  const mapped = mapIssueDetail(raw)
  return { ...mapped, commentCount: raw.comments?.totalCount ?? mapped.comments.length }
}

export async function getSubIssues(
  token: string,
  owner: string,
  name: string,
  number: number,
  signal?: AbortSignal,
): Promise<IssueNode[]> {
  const data = await graphql<{ repository: { issue: { subIssues: { nodes: (GqlIssueCard | null)[] } } | null } | null }>(
    token,
    SUB_ISSUES_QUERY,
    { owner, name, number },
    signal,
  )
  return (data.repository?.issue?.subIssues.nodes ?? [])
    .filter((n): n is GqlIssueCard => n != null)
    .map(mapIssueNode)
}

export async function getRepoMeta(
  token: string,
  owner: string,
  name: string,
  signal?: AbortSignal,
): Promise<RepoMeta> {
  const data = await graphql<{
    repository:
      | (GqlRepo & {
          labels: { nodes: Label[] }
          milestones: { nodes: { number: number; title: string; dueOn: string | null; state: 'OPEN' | 'CLOSED' }[] }
          assignableUsers: { nodes: User[] }
        })
      | null
  }>(token, REPO_META_QUERY, { owner, name }, signal)

  const r = data.repository
  if (!r) throw new Error(`${owner}/${name} not found`)
  return {
    ...mapRepo(r),
    labels: r.labels.nodes ?? [],
    milestones: (r.milestones.nodes ?? []).map(mapMilestone).filter((m): m is Milestone => m != null),
    assignableUsers: r.assignableUsers.nodes ?? [],
  }
}

export async function searchRepos(token: string, q: string, signal?: AbortSignal): Promise<RepoSummary[]> {
  if (!q.trim()) return []
  const data = await graphql<{ search: { nodes: (GqlRepo | null)[] } }>(
    token,
    SEARCH_REPOS_QUERY,
    { q: `${q} fork:true` },
    signal,
  )
  return data.search.nodes.filter((n): n is GqlRepo => n != null && 'nameWithOwner' in n).map(mapRepo)
}

export async function getRecentRepos(token: string, signal?: AbortSignal): Promise<RepoSummary[]> {
  const data = await graphql<{ viewer: { repositories: { nodes: (GqlRepo | null)[] } } }>(
    token,
    RECENT_REPOS_QUERY,
    {},
    signal,
  )
  return data.viewer.repositories.nodes.filter((n): n is GqlRepo => n != null).map(mapRepo)
}

/* ------------------------------- writes ------------------------------ */
/* Writes use REST: the sub-issue endpoints and label/assignee patches are
   simpler there, and the responses are easy to fold back into the cache. */

export interface CreateIssueInput {
  title: string
  body?: string
  labels?: string[]
  assignees?: string[]
  milestone?: number | null
}

export async function createIssue(token: string, repo: string, input: CreateIssueInput): Promise<IssueSummary> {
  const raw = await rest<RestIssue>(token, `/repos/${repo}/issues`, {
    method: 'POST',
    body: {
      title: input.title,
      body: input.body || undefined,
      labels: input.labels?.length ? input.labels : undefined,
      assignees: input.assignees?.length ? input.assignees : undefined,
      milestone: input.milestone ?? undefined,
    },
  })
  return mapRestIssue(raw, repo)
}

export interface UpdateIssueInput {
  title?: string
  body?: string
  state?: 'open' | 'closed'
  state_reason?: 'completed' | 'not_planned' | 'reopened' | null
  labels?: string[]
  assignees?: string[]
  milestone?: number | null
}

export async function updateIssue(
  token: string,
  repo: string,
  number: number,
  patch: UpdateIssueInput,
): Promise<IssueSummary> {
  const raw = await rest<RestIssue>(token, `/repos/${repo}/issues/${number}`, { method: 'PATCH', body: patch })
  return mapRestIssue(raw, repo)
}

export async function createComment(token: string, repo: string, number: number, body: string): Promise<Comment> {
  const raw = await rest<{
    id: number
    node_id: string
    body: string
    body_html?: string
    created_at: string
    user: { login: string; avatar_url: string } | null
  }>(token, `/repos/${repo}/issues/${number}/comments`, {
    method: 'POST',
    body: { body },
    accept: 'application/vnd.github.full+json',
  })
  return {
    id: raw.node_id,
    databaseId: raw.id,
    author: raw.user ? { login: raw.user.login, avatarUrl: raw.user.avatar_url } : null,
    body: raw.body,
    bodyHtml: raw.body_html ?? '',
    createdAt: raw.created_at,
  }
}

/** `subIssueId` is the child's numeric database id, not its issue number. */
export async function addSubIssue(
  token: string,
  repo: string,
  parentNumber: number,
  subIssueId: number,
  replaceParent = true,
): Promise<void> {
  await rest(token, `/repos/${repo}/issues/${parentNumber}/sub_issues`, {
    method: 'POST',
    body: { sub_issue_id: subIssueId, replace_parent: replaceParent },
  })
}

export async function removeSubIssue(
  token: string,
  repo: string,
  parentNumber: number,
  subIssueId: number,
): Promise<void> {
  await rest(token, `/repos/${repo}/issues/${parentNumber}/sub_issue`, {
    method: 'DELETE',
    body: { sub_issue_id: subIssueId },
  })
}

export async function reprioritizeSubIssue(
  token: string,
  repo: string,
  parentNumber: number,
  subIssueId: number,
  position: { after_id?: number; before_id?: number },
): Promise<void> {
  await rest(token, `/repos/${repo}/issues/${parentNumber}/sub_issues/priority`, {
    method: 'PATCH',
    body: { sub_issue_id: subIssueId, ...position },
  })
}

/** Fetches one issue over REST — used to resolve a database id before linking. */
export async function getIssueLite(token: string, repo: string, number: number): Promise<IssueSummary> {
  const raw = await rest<RestIssue>(token, `/repos/${repo}/issues/${number}`)
  return mapRestIssue(raw, repo)
}
