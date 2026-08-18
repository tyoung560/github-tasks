import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ScreenHeader } from '@/components/AppShell'
import { Sheet, SheetRow } from '@/components/Sheet'
import { EmptyState, Spinner } from '@/components/Bits'
import { IconChevronRight, IconPlus, IconRepo, IconSearch, IconStar, IconStarOutline } from '@/components/Icon'
import { useDebounced } from '@/hooks/useDebounced'
import { useRecentRepos, useRepoSearch } from '@/hooks/useGithub'
import { useSettings } from '@/state/settings'
import { relativeTime } from '@/lib/time'
import type { RepoSummary } from '@/lib/github/types'

export function Repos() {
  const { favorites, toggleFavorite, defaultRepo, update } = useSettings()
  const [adding, setAdding] = useState(false)

  return (
    <>
      <ScreenHeader
        title="Repos"
        subtitle={favorites.length ? `${favorites.length} pinned` : 'Pin the repos you work in'}
        trailing={
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="tap flex w-10 items-center justify-center rounded-xl text-accent"
            aria-label="Add repository"
          >
            <IconPlus size={20} />
          </button>
        }
      />

      {favorites.length === 0 ? (
        <EmptyState
          icon={<IconRepo size={34} />}
          title="No repos pinned"
          hint="Pin a repository to browse its issues and file new ones in a couple of taps."
          action={
            <button type="button" className="btn btn-primary mt-2" onClick={() => setAdding(true)}>
              Add a repo
            </button>
          }
        />
      ) : (
        <ul>
          {favorites.map((repo) => (
            <li key={repo} className="flex items-center border-b border-line">
              <Link to={`/r/${repo}`} className="flex min-w-0 flex-1 items-center gap-3 py-3.5 pl-4">
                <IconRepo size={18} className="shrink-0 text-faint" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.9375rem] font-medium">{repo.split('/')[1]}</span>
                  <span className="block truncate text-xs text-faint">{repo.split('/')[0]}</span>
                </span>
                {defaultRepo === repo && (
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[0.625rem] font-semibold text-muted">
                    Default
                  </span>
                )}
                <IconChevronRight size={16} className="shrink-0 text-faint" />
              </Link>
              <button
                type="button"
                onClick={() => toggleFavorite(repo)}
                className="tap flex w-11 items-center justify-center text-warn"
                aria-label={`Unpin ${repo}`}
              >
                <IconStar size={17} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {favorites.length > 1 && (
        <div className="px-4 py-4">
          <label className="block text-xs font-semibold text-muted" htmlFor="default-repo">
            Default repo for quick capture
          </label>
          <select
            id="default-repo"
            className="field mt-1.5"
            value={defaultRepo ?? ''}
            onChange={(e) => update({ defaultRepo: e.target.value || null })}
          >
            {favorites.map((repo) => (
              <option key={repo} value={repo}>
                {repo}
              </option>
            ))}
          </select>
        </div>
      )}

      <AddRepoSheet open={adding} onClose={() => setAdding(false)} />
    </>
  )
}

function AddRepoSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [term, setTerm] = useState('')
  const { favorites, toggleFavorite } = useSettings()
  const debounced = useDebounced(term)
  const recent = useRecentRepos(open && term.trim().length < 2)
  const found = useRepoSearch(open ? debounced : '')

  const searchingRepos = term.trim().length >= 2
  const results: RepoSummary[] = searchingRepos ? (found.data ?? []) : (recent.data ?? [])
  const loading = searchingRepos ? found.isLoading || debounced !== term : recent.isLoading

  return (
    <Sheet open={open} onClose={onClose} title="Add repository" tall>
      <div className="sticky top-0 z-10 border-b border-line bg-canvas p-3">
        <div className="relative">
          <IconSearch size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
          <input
            className="field pl-9"
            placeholder="Search your repos or owner/name"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
      </div>

      {loading && (
        <p className="flex items-center justify-center gap-2 py-8 text-sm text-faint">
          <Spinner size={15} /> Looking…
        </p>
      )}

      {!loading && results.length === 0 && (
        <p className="px-4 py-8 text-center text-sm text-faint">
          {term.trim().length >= 2 ? 'No repositories matched.' : 'No repositories available to this token.'}
        </p>
      )}

      {results.map((repo) => {
        const pinned = favorites.includes(repo.nameWithOwner)
        return (
          <SheetRow key={repo.nameWithOwner} onClick={() => toggleFavorite(repo.nameWithOwner)} selected={pinned}>
            <span className={pinned ? 'text-warn' : 'text-faint'}>
              {pinned ? <IconStar size={17} /> : <IconStarOutline size={17} />}
            </span>
            <span className="min-w-0 flex-1 py-2.5">
              <span className="block truncate font-medium">{repo.nameWithOwner}</span>
              <span className="block truncate text-xs text-faint">
                {repo.isPrivate ? 'Private · ' : ''}
                {repo.openIssues} open
                {repo.pushedAt ? ` · pushed ${relativeTime(repo.pushedAt)}` : ''}
                {!repo.hasIssues ? ' · issues disabled' : ''}
              </span>
            </span>
          </SheetRow>
        )
      })}
    </Sheet>
  )
}
