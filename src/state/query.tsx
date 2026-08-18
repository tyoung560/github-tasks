import { QueryClient, focusManager, onlineManager } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import type { ReactNode } from 'react'
import { queryCacheStorage } from '@/lib/db'
import { GitHubError } from '@/lib/github/client'

const DAY = 24 * 60 * 60 * 1000

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Lists stay usable offline, so keep them well past the session.
      gcTime: 7 * DAY,
      staleTime: 60_000,
      retry: (failureCount, error) => {
        if (error instanceof GitHubError && error.isPermanent) return false
        return failureCount < 2
      },
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      networkMode: 'offlineFirst',
    },
    mutations: {
      networkMode: 'offlineFirst',
      retry: false,
    },
  },
})

const persister = createAsyncStoragePersister({
  storage: queryCacheStorage,
  key: 'gh-tasks.query-cache',
  throttleTime: 1_000,
})

export function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 7 * DAY,
        dehydrateOptions: {
          // Never persist an errored query — a stale failure should not
          // reappear as the app's opening state.
          shouldDehydrateQuery: (query) => query.state.status === 'success',
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  )
}

/** iOS Safari fires `visibilitychange`, not `focus`, when returning to a PWA. */
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    focusManager.setFocused(document.visibilityState === 'visible')
  })
}

export function isOnline(): boolean {
  return onlineManager.isOnline()
}

export const queryKeys = {
  viewer: ['viewer'] as const,
  issues: (q: string) => ['issues', q] as const,
  issue: (repo: string, number: number) => ['issue', repo, number] as const,
  subIssues: (repo: string, number: number) => ['sub-issues', repo, number] as const,
  repoMeta: (repo: string) => ['repo-meta', repo] as const,
  repoSearch: (q: string) => ['repo-search', q] as const,
  recentRepos: ['recent-repos'] as const,
}
