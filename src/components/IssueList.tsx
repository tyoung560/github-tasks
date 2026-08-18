import { useEffect, useRef } from 'react'
import { IssueRow } from './IssueRow'
import { EmptyState, ErrorNote, Skeleton, Spinner } from './Bits'
import { IconInbox } from './Icon'
import type { IssueSummary } from '@/lib/github/types'

interface Props {
  issues: IssueSummary[]
  showRepo?: boolean
  isLoading: boolean
  error: unknown
  hasNextPage?: boolean
  isFetchingNextPage?: boolean
  fetchNextPage?: () => void
  onRetry?: () => void
  emptyTitle?: string
  emptyHint?: string
  /** Issue keys with an unsynced local write, badged in the row. */
  pendingKeys?: Set<string>
  header?: React.ReactNode
}

export function IssueList({
  issues,
  showRepo = true,
  isLoading,
  error,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  onRetry,
  emptyTitle = 'Nothing here',
  emptyHint,
  pendingKeys,
  header,
}: Props) {
  const sentinel = useRef<HTMLDivElement>(null)

  // Infinite scroll: load the next page as the sentinel nears the viewport.
  useEffect(() => {
    const node = sentinel.current
    if (!node || !hasNextPage || !fetchNextPage) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) fetchNextPage()
      },
      { rootMargin: '400px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasNextPage, fetchNextPage, isFetchingNextPage])

  if (error && issues.length === 0) return <ErrorNote error={error} onRetry={onRetry} />

  if (isLoading && issues.length === 0) {
    return (
      <div className="divide-y divide-line">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex gap-3 px-4 py-3.5">
            <Skeleton className="h-4 w-4 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-3 w-2/5" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (issues.length === 0) {
    return <EmptyState icon={<IconInbox size={34} />} title={emptyTitle} hint={emptyHint} />
  }

  return (
    <>
      {header}
      <ul>
        {issues.map((issue) => (
          <li key={`${issue.repo}#${issue.number}`}>
            <IssueRow
              issue={issue}
              showRepo={showRepo}
              pending={issue.pending || pendingKeys?.has(`${issue.repo}#${issue.number}`)}
            />
          </li>
        ))}
      </ul>
      <div ref={sentinel} className="flex justify-center py-6 text-faint">
        {isFetchingNextPage ? <Spinner /> : hasNextPage ? null : issues.length > 8 ? (
          <span className="text-xs">That’s everything</span>
        ) : null}
      </div>
    </>
  )
}
