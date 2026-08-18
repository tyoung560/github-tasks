import { useMemo, useState } from 'react'
import { ScreenHeader } from '@/components/AppShell'
import { IssueList } from '@/components/IssueList'
import { Segmented } from '@/components/Segmented'
import { ProgressRing } from '@/components/ProgressRing'
import { IconSync } from '@/components/Icon'
import { pagesToItems, useIssueSearch } from '@/hooks/useGithub'
import { useOutbox } from '@/hooks/useOutbox'
import { buildIssueQuery } from '@/lib/search'
import { percentOf } from '@/lib/progress'
import { useAuth } from '@/state/auth'
import { useSettings } from '@/state/settings'
import type { IssueSummary } from '@/lib/github/types'

type Scope = 'assigned' | 'created' | 'mentioned' | 'favorites'

const SCOPES: { value: Scope; label: string }[] = [
  { value: 'assigned', label: 'Assigned' },
  { value: 'created', label: 'Created' },
  { value: 'mentioned', label: 'Mentions' },
  { value: 'favorites', label: 'Favourites' },
]

export function Inbox() {
  const { viewer } = useAuth()
  const { favorites, defaultState, hideSubIssuesInLists } = useSettings()
  const { pendingKeys, creates, pending, flush } = useOutbox()
  const [scope, setScope] = useState<Scope>('assigned')
  const [showClosed, setShowClosed] = useState(defaultState === 'closed')

  const query = useMemo(() => {
    const state = showClosed ? 'closed' : 'open'
    switch (scope) {
      case 'created':
        return buildIssueQuery({ author: '@me', state })
      case 'mentioned':
        return buildIssueQuery({ mentions: '@me', state })
      case 'favorites':
        return buildIssueQuery({ repos: favorites, state })
      case 'assigned':
      default:
        return buildIssueQuery({ assignee: '@me', state })
    }
  }, [scope, showClosed, favorites])

  const enabled = scope !== 'favorites' || favorites.length > 0
  const search = useIssueSearch(query, enabled)
  const fetched = pagesToItems(search.data)

  const issues = useMemo(() => {
    const local: IssueSummary[] = scope === 'created' || scope === 'assigned' ? (creates as unknown as IssueSummary[]) : []
    const merged = [...local, ...fetched]
    return hideSubIssuesInLists ? merged.filter((i) => !i.parent) : merged
  }, [creates, fetched, scope, hideSubIssuesInLists])

  const total = search.data?.pages[0]?.totalCount ?? fetched.length

  // How much of the tracked work on this list is finished. Only issues that
  // actually have sub-issues contribute — otherwise the ring would just
  // restate the open/closed split.
  const tracked = fetched.reduce(
    (acc, issue) => ({
      done: acc.done + (issue.subIssues?.completed ?? 0),
      all: acc.all + (issue.subIssues?.total ?? 0),
    }),
    { done: 0, all: 0 },
  )

  return (
    <>
      <ScreenHeader
        title={showClosed ? 'Closed' : 'Inbox'}
        subtitle={viewer ? `Signed in as ${viewer.login}` : undefined}
        trailing={
          <div className="flex items-center gap-2">
            {pending > 0 && (
              <button
                type="button"
                onClick={() => void flush()}
                className="tap flex w-10 items-center justify-center rounded-xl text-accent"
                aria-label="Sync pending changes"
              >
                <IconSync size={18} />
              </button>
            )}
            {tracked.all > 0 && (
              <ProgressRing
                percent={percentOf(tracked.done, tracked.all)}
                size={36}
                label={`${tracked.done}/${tracked.all}`}
              />
            )}
          </div>
        }
      />

      <Segmented options={SCOPES} value={scope} onChange={setScope} ariaLabel="Inbox scope" />

      <div className="flex items-center justify-between px-4 pb-2">
        <p className="text-xs text-faint">
          {enabled ? `${total} ${showClosed ? 'closed' : 'open'} issue${total === 1 ? '' : 's'}` : 'No favourite repos yet'}
        </p>
        <button
          type="button"
          onClick={() => setShowClosed((v) => !v)}
          className="rounded-full bg-surface px-3 py-1 text-xs font-semibold text-muted ring-1 ring-line"
        >
          {showClosed ? 'Show open' : 'Show closed'}
        </button>
      </div>

      <IssueList
        issues={issues}
        isLoading={search.isLoading}
        error={search.error}
        hasNextPage={search.hasNextPage}
        isFetchingNextPage={search.isFetchingNextPage}
        fetchNextPage={search.fetchNextPage}
        onRetry={() => void search.refetch()}
        pendingKeys={pendingKeys}
        emptyTitle={
          scope === 'favorites' && favorites.length === 0
            ? 'No favourite repos'
            : showClosed
              ? 'Nothing closed yet'
              : 'Inbox zero'
        }
        emptyHint={
          scope === 'favorites' && favorites.length === 0
            ? 'Star a repo on the Repos tab to see its issues here.'
            : scope === 'assigned'
              ? 'Nothing is assigned to you right now.'
              : undefined
        }
      />
    </>
  )
}
