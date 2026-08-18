import { useMemo, useState } from 'react'
import { Sheet, SheetRow } from '@/components/Sheet'
import { Spinner, StateIcon } from '@/components/Bits'
import { IconSearch } from '@/components/Icon'
import { useDebounced } from '@/hooks/useDebounced'
import { pagesToItems, useIssueSearch } from '@/hooks/useGithub'
import { buildIssueQuery } from '@/lib/search'
import type { IssueSummary } from '@/lib/github/types'

interface Props {
  open: boolean
  onClose: () => void
  repo: string
  /** Issue keys that cannot be linked — the issue itself and its descendants. */
  excludeKeys: Set<string>
  onPick: (issue: IssueSummary) => void | Promise<void>
}

/**
 * Picker for turning an existing issue into a sub-issue. Descendants and the
 * issue itself are filtered out, because GitHub rejects cycles and a silent
 * 422 is a poor explanation.
 */
export function LinkExistingSheet({ open, onClose, repo, excludeKeys, onPick }: Props) {
  const [term, setTerm] = useState('')
  const debounced = useDebounced(term)

  const query = useMemo(() => {
    const trimmed = debounced.trim()
    // A bare number is almost always an issue number, not a search phrase.
    const asNumber = /^#?\d+$/.test(trimmed) ? trimmed.replace('#', '') : null
    return buildIssueQuery({ repos: [repo], state: 'all', text: asNumber ? '' : trimmed, sort: 'updated' })
  }, [debounced, repo])

  const search = useIssueSearch(query, open)
  const numeric = /^#?\d+$/.test(debounced.trim()) ? Number(debounced.trim().replace('#', '')) : null

  const results = useMemo(() => {
    const all = pagesToItems(search.data).filter((i) => !excludeKeys.has(`${i.repo}#${i.number}`))
    if (numeric != null) {
      const exact = all.filter((i) => String(i.number).startsWith(String(numeric)))
      return exact.length ? exact : all
    }
    return all
  }, [search.data, excludeKeys, numeric])

  return (
    <Sheet open={open} onClose={onClose} title="Link an issue" tall>
      <div className="sticky top-0 z-10 border-b border-line bg-canvas p-3">
        <div className="relative">
          <IconSearch size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
          <input
            className="field pl-9"
            placeholder="Title or #number"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
          />
        </div>
      </div>

      {search.isLoading && (
        <p className="flex items-center justify-center gap-2 py-8 text-sm text-faint">
          <Spinner size={15} /> Searching…
        </p>
      )}

      {!search.isLoading && results.length === 0 && (
        <p className="px-4 py-8 text-center text-sm text-faint">
          Nothing to link here. Issues already under this one are hidden.
        </p>
      )}

      {results.map((issue) => (
        <SheetRow key={`${issue.repo}#${issue.number}`} onClick={() => void onPick(issue)}>
          <StateIcon state={issue.state} reason={issue.stateReason} size={16} />
          <span className="min-w-0 flex-1 py-2.5">
            <span className="line-clamp-2 text-sm">{issue.title}</span>
            <span className="mt-0.5 block font-mono text-xs text-faint">
              #{issue.number}
              {issue.parent ? ` · currently under #${issue.parent.number}` : ''}
            </span>
          </span>
        </SheetRow>
      ))}
    </Sheet>
  )
}
