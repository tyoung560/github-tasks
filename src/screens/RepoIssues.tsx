import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ScreenHeader } from '@/components/AppShell'
import { IssueList } from '@/components/IssueList'
import { Sheet, SheetRow } from '@/components/Sheet'
import { LabelChip, Spinner } from '@/components/Bits'
import { ProgressRing } from '@/components/ProgressRing'
import { IconCheck, IconChevronLeft, IconFilter, IconSearch } from '@/components/Icon'
import { useDebounced } from '@/hooks/useDebounced'
import { pagesToItems, useIssueSearch, useRepoMeta } from '@/hooks/useGithub'
import { useOutbox } from '@/hooks/useOutbox'
import { buildIssueQuery, countActiveFilters, type IssueFilter, type SortKey, type StateFilter } from '@/lib/search'
import { percentOf } from '@/lib/progress'
import { useSettings } from '@/state/settings'
import type { IssueSummary } from '@/lib/github/types'

export function RepoIssues() {
  const { owner = '', name = '' } = useParams()
  const repo = `${owner}/${name}`
  const navigate = useNavigate()
  const { defaultState, defaultSort, hideSubIssuesInLists, update } = useSettings()
  const { pendingKeys, creates } = useOutbox()

  const [filter, setFilter] = useState<IssueFilter>({ state: defaultState, sort: defaultSort })
  const [text, setText] = useState('')
  const [searching, setSearching] = useState(false)
  const [filtering, setFiltering] = useState(false)

  const debouncedText = useDebounced(text)
  const meta = useRepoMeta(repo)
  const query = useMemo(
    () => buildIssueQuery({ ...filter, text: debouncedText, repos: [repo] }),
    [filter, debouncedText, repo],
  )
  const search = useIssueSearch(query)
  const fetched = pagesToItems(search.data)

  const issues = useMemo(() => {
    const local = creates.filter((c) => c.repo === repo) as unknown as IssueSummary[]
    const merged = [...local, ...fetched]
    return hideSubIssuesInLists ? merged.filter((i) => !i.parent) : merged
  }, [creates, fetched, repo, hideSubIssuesInLists])

  const total = search.data?.pages[0]?.totalCount ?? 0
  const withChildren = fetched.filter((i) => i.subIssues)
  const rolled = withChildren.reduce(
    (acc, i) => ({ done: acc.done + (i.subIssues?.completed ?? 0), all: acc.all + (i.subIssues?.total ?? 0) }),
    { done: 0, all: 0 },
  )
  const activeFilters = countActiveFilters(filter)

  return (
    <>
      <ScreenHeader
        leading={
          <button
            type="button"
            onClick={() => navigate('/repos')}
            className="tap -ml-2 flex w-9 items-center justify-center rounded-xl text-muted"
            aria-label="Back to repos"
          >
            <IconChevronLeft size={20} />
          </button>
        }
        title={name}
        subtitle={`${owner} · ${total} ${filter.state === 'closed' ? 'closed' : filter.state === 'all' ? '' : 'open'}`.trim()}
        trailing={
          <div className="flex items-center gap-1">
            {rolled.all > 0 && (
              <ProgressRing
                percent={percentOf(rolled.done, rolled.all)}
                size={34}
                label={`${rolled.done}/${rolled.all}`}
              />
            )}
            <button
              type="button"
              onClick={() => setSearching((v) => !v)}
              className="tap flex w-9 items-center justify-center rounded-xl text-muted"
              aria-label="Search issues"
            >
              <IconSearch size={18} />
            </button>
            <button
              type="button"
              onClick={() => setFiltering(true)}
              className="tap relative flex w-9 items-center justify-center rounded-xl text-muted"
              aria-label="Filter issues"
            >
              <IconFilter size={18} />
              {activeFilters > 0 && (
                <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[0.625rem] font-bold text-accent-ink">
                  {activeFilters}
                </span>
              )}
            </button>
          </div>
        }
      />

      {searching && (
        <div className="border-b border-line px-4 py-2">
          <input
            className="field"
            autoFocus
            placeholder={`Search ${repo}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoCapitalize="none"
          />
        </div>
      )}

      {filter.labels && filter.labels.length > 0 && (
        <div className="scroll-x flex gap-1.5 border-b border-line px-4 py-2">
          {filter.labels.map((labelName) => {
            const label = meta.data?.labels.find((l) => l.name === labelName) ?? {
              name: labelName,
              color: 'ededed',
              description: null,
            }
            return (
              <LabelChip
                key={labelName}
                label={label}
                onClick={() => setFilter((f) => ({ ...f, labels: f.labels?.filter((l) => l !== labelName) }))}
              />
            )
          })}
        </div>
      )}

      <IssueList
        issues={issues}
        showRepo={false}
        isLoading={search.isLoading}
        error={search.error}
        hasNextPage={search.hasNextPage}
        isFetchingNextPage={search.isFetchingNextPage}
        fetchNextPage={search.fetchNextPage}
        onRetry={() => void search.refetch()}
        pendingKeys={pendingKeys}
        emptyTitle="No matching issues"
        emptyHint={activeFilters > 0 ? 'Try clearing a filter.' : 'Tap + to file the first one.'}
      />

      <Sheet
        open={filtering}
        onClose={() => setFiltering(false)}
        title="Filter"
        tall
        action={
          <button
            type="button"
            className="text-sm font-semibold text-accent"
            onClick={() => {
              setFilter({ state: 'open', sort: 'updated' })
              setText('')
            }}
          >
            Reset
          </button>
        }
      >
        <FilterBody
          filter={filter}
          setFilter={setFilter}
          labels={meta.data?.labels ?? []}
          milestones={meta.data?.milestones ?? []}
          assignees={meta.data?.assignableUsers ?? []}
          loading={meta.isLoading}
          hideSubIssues={hideSubIssuesInLists}
          onToggleHideSubIssues={() => update({ hideSubIssuesInLists: !hideSubIssuesInLists })}
        />
      </Sheet>
    </>
  )
}

interface FilterBodyProps {
  filter: IssueFilter
  setFilter: React.Dispatch<React.SetStateAction<IssueFilter>>
  labels: { name: string; color: string; description?: string | null }[]
  milestones: { number: number; title: string }[]
  assignees: { login: string; avatarUrl: string }[]
  loading: boolean
  hideSubIssues: boolean
  onToggleHideSubIssues: () => void
}

const STATES: { value: StateFilter; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
  { value: 'all', label: 'All' },
]

const SORTS: { value: SortKey; label: string }[] = [
  { value: 'updated', label: 'Recently updated' },
  { value: 'created', label: 'Newest' },
  { value: 'comments', label: 'Most discussed' },
  { value: 'reactions', label: 'Most reactions' },
]

function FilterBody({
  filter,
  setFilter,
  labels,
  milestones,
  assignees,
  loading,
  hideSubIssues,
  onToggleHideSubIssues,
}: FilterBodyProps) {
  const toggleLabel = (name: string) =>
    setFilter((f) => {
      const current = f.labels ?? []
      return { ...f, labels: current.includes(name) ? current.filter((l) => l !== name) : [...current, name] }
    })

  return (
    <div className="pb-6">
      <Section title="State">
        <div className="flex gap-2 px-4 py-2">
          {STATES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setFilter((f) => ({ ...f, state: s.value }))}
              className={`flex-1 rounded-xl py-2.5 text-sm font-semibold ${
                (filter.state ?? 'open') === s.value ? 'bg-accent text-accent-ink' : 'bg-surface text-muted ring-1 ring-line'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Assignee">
        <SheetRow onClick={() => setFilter((f) => ({ ...f, assignee: undefined }))} selected={!filter.assignee}>
          <span className="flex-1 py-3">Anyone</span>
          {!filter.assignee && <IconCheck size={16} className="text-accent" />}
        </SheetRow>
        <SheetRow onClick={() => setFilter((f) => ({ ...f, assignee: '@me' }))} selected={filter.assignee === '@me'}>
          <span className="flex-1 py-3">Me</span>
          {filter.assignee === '@me' && <IconCheck size={16} className="text-accent" />}
        </SheetRow>
        <SheetRow onClick={() => setFilter((f) => ({ ...f, assignee: 'none' }))} selected={filter.assignee === 'none'}>
          <span className="flex-1 py-3">Unassigned</span>
          {filter.assignee === 'none' && <IconCheck size={16} className="text-accent" />}
        </SheetRow>
        {assignees.slice(0, 12).map((u) => (
          <SheetRow key={u.login} onClick={() => setFilter((f) => ({ ...f, assignee: u.login }))} selected={filter.assignee === u.login}>
            <img src={u.avatarUrl} alt="" width={22} height={22} className="rounded-full" />
            <span className="flex-1 py-3">{u.login}</span>
            {filter.assignee === u.login && <IconCheck size={16} className="text-accent" />}
          </SheetRow>
        ))}
      </Section>

      <Section title="Labels">
        {loading && (
          <p className="flex items-center gap-2 px-4 py-3 text-sm text-faint">
            <Spinner size={14} /> Loading labels…
          </p>
        )}
        {labels.map((label) => {
          const on = filter.labels?.includes(label.name) ?? false
          return (
            <SheetRow key={label.name} onClick={() => toggleLabel(label.name)} selected={on}>
              <span className="flex-1 py-3">
                <LabelChip label={{ ...label, description: label.description ?? null }} />
              </span>
              {on && <IconCheck size={16} className="text-accent" />}
            </SheetRow>
          )
        })}
      </Section>

      {milestones.length > 0 && (
        <Section title="Milestone">
          <SheetRow onClick={() => setFilter((f) => ({ ...f, milestone: undefined }))} selected={!filter.milestone}>
            <span className="flex-1 py-3">Any</span>
            {!filter.milestone && <IconCheck size={16} className="text-accent" />}
          </SheetRow>
          {milestones.map((m) => (
            <SheetRow key={m.number} onClick={() => setFilter((f) => ({ ...f, milestone: m.title }))} selected={filter.milestone === m.title}>
              <span className="flex-1 py-3">{m.title}</span>
              {filter.milestone === m.title && <IconCheck size={16} className="text-accent" />}
            </SheetRow>
          ))}
        </Section>
      )}

      <Section title="Sort">
        {SORTS.map((s) => (
          <SheetRow key={s.value} onClick={() => setFilter((f) => ({ ...f, sort: s.value }))} selected={(filter.sort ?? 'updated') === s.value}>
            <span className="flex-1 py-3">{s.label}</span>
            {(filter.sort ?? 'updated') === s.value && <IconCheck size={16} className="text-accent" />}
          </SheetRow>
        ))}
      </Section>

      <Section title="Hierarchy">
        <SheetRow onClick={onToggleHideSubIssues} selected={hideSubIssues}>
          <span className="flex-1 py-3">
            Hide issues that are sub-issues
            <span className="block text-xs text-faint">Show only top-level work in this list</span>
          </span>
          {hideSubIssues && <IconCheck size={16} className="text-accent" />}
        </SheetRow>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="px-4 pt-4 pb-1 text-xs font-bold tracking-wide text-faint uppercase">{title}</h3>
      {children}
    </section>
  )
}
