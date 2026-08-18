import { useInfiniteQuery, useQuery, type UseQueryOptions } from '@tanstack/react-query'
import {
  getIssue,
  getRecentRepos,
  getRepoMeta,
  getSubIssues,
  searchIssues,
  searchRepos,
  type Page,
  type RepoMeta,
} from '@/lib/github/api'
import { repoRef, type Comment, type IssueDetail, type IssueNode, type IssueSummary, type RepoSummary } from '@/lib/github/types'
import { queryKeys } from '@/state/query'
import { useAuth } from '@/state/auth'

const PAGE_SIZE = 25

/** Paginated issue search. `q` is a full GitHub search string. */
export function useIssueSearch(q: string, enabled = true) {
  const { token } = useAuth()
  return useInfiniteQuery({
    queryKey: queryKeys.issues(q),
    enabled: Boolean(token) && enabled,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      searchIssues(token!, q, { first: PAGE_SIZE, after: pageParam, signal }),
    getNextPageParam: (last: Page<IssueSummary>) => last.nextCursor,
  })
}

export interface IssueDetailData {
  issue: IssueDetail
  comments: Comment[]
  commentCount: number
}

export function useIssue(repo: string, number: number, options?: Partial<UseQueryOptions<IssueDetailData>>) {
  const { token } = useAuth()
  const { owner, name } = repoRef(repo)
  return useQuery<IssueDetailData>({
    queryKey: queryKeys.issue(repo, number),
    enabled: Boolean(token) && Boolean(repo) && Number.isFinite(number),
    queryFn: ({ signal }) => getIssue(token!, owner, name, number, signal),
    ...options,
  })
}

/** Children of a node deeper than the detail query loads, fetched on expand. */
export function useSubIssues(repo: string, number: number, enabled: boolean) {
  const { token } = useAuth()
  const { owner, name } = repoRef(repo)
  return useQuery<IssueNode[]>({
    queryKey: queryKeys.subIssues(repo, number),
    enabled: Boolean(token) && enabled,
    queryFn: ({ signal }) => getSubIssues(token!, owner, name, number, signal),
  })
}

export function useRepoMeta(repo: string | null) {
  const { token } = useAuth()
  return useQuery<RepoMeta>({
    queryKey: queryKeys.repoMeta(repo ?? ''),
    enabled: Boolean(token) && Boolean(repo),
    // Labels and milestones move slowly; do not re-fetch them on every visit.
    staleTime: 10 * 60_000,
    queryFn: ({ signal }) => {
      const { owner, name } = repoRef(repo!)
      return getRepoMeta(token!, owner, name, signal)
    },
  })
}

export function useRepoSearch(term: string) {
  const { token } = useAuth()
  const q = term.trim()
  return useQuery<RepoSummary[]>({
    queryKey: queryKeys.repoSearch(q),
    enabled: Boolean(token) && q.length >= 2,
    queryFn: ({ signal }) => searchRepos(token!, q, signal),
  })
}

export function useRecentRepos(enabled = true) {
  const { token } = useAuth()
  return useQuery<RepoSummary[]>({
    queryKey: queryKeys.recentRepos,
    enabled: Boolean(token) && enabled,
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) => getRecentRepos(token!, signal),
  })
}

/** Flattens infinite-query pages into one list. */
export function pagesToItems<T>(data: { pages: Page<T>[] } | undefined): T[] {
  return data?.pages.flatMap((p) => p.items) ?? []
}
