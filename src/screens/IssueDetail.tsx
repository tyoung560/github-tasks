import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Sheet, SheetRow } from '@/components/Sheet'
import { Avatar, ErrorNote, LabelChip, Skeleton, Spinner, StateBadge } from '@/components/Bits'
import { ProgressBar, ProgressRing } from '@/components/ProgressRing'
import { SubIssueTree } from '@/components/SubIssueTree'
import { Markdown } from '@/components/Markdown'
import {
  IconCheck,
  IconChevronLeft,
  IconComment,
  IconExternal,
  IconIssueClosed,
  IconIssueOpen,
  IconLink,
  IconMilestone,
  IconPerson,
  IconPlus,
  IconSkip,
  IconTag,
} from '@/components/Icon'
import { LinkExistingSheet } from './LinkExisting'
import { useIssue, useRepoMeta } from '@/hooks/useGithub'
import { useIssueMutations } from '@/hooks/useIssueMutations'
import { useToast } from '@/components/Toast'
import { useSettings } from '@/state/settings'
import { collectDescendantKeys, directProgress, rollup } from '@/lib/progress'
import { relativeTime, shortDate } from '@/lib/time'
import type { IssueNode } from '@/lib/github/types'

type Editor = null | 'labels' | 'assignees' | 'milestone' | 'title' | 'body' | 'close' | 'addChild' | 'link'

export function IssueDetail() {
  const { owner = '', name = '', number: numberParam = '0' } = useParams()
  const repo = `${owner}/${name}`
  const number = Number(numberParam)
  const navigate = useNavigate()
  const toast = useToast()
  const { deepProgress } = useSettings()
  const { patch, comment, linkChild, unlinkChild } = useIssueMutations()

  const { data, isLoading, error, refetch, isFetching } = useIssue(repo, number)
  const meta = useRepoMeta(repo)

  const [editor, setEditor] = useState<Editor>(null)
  const [busyChild, setBusyChild] = useState<string | null>(null)
  const [commentText, setCommentText] = useState('')
  const [sending, setSending] = useState(false)

  const issue = data?.issue
  const children = issue?.children ?? []

  const progress = useMemo(() => {
    if (!issue) return null
    const deep = rollup({ children, subIssues: issue.subIssues, hasUnloadedChildren: false })
    return deepProgress && deep.total > 0 ? deep : directProgress(issue.subIssues)
  }, [issue, children, deepProgress])

  const descendantKeys = useMemo(() => collectDescendantKeys(children), [children])

  const run = async (label: string, fn: () => Promise<{ queued: boolean }>) => {
    try {
      const outcome = await fn()
      toast.show(outcome.queued ? `${label} — queued until you reconnect` : label, outcome.queued ? 'queued' : 'success')
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'That did not work', 'error')
    }
  }

  const toggleChildState = async (node: IssueNode) => {
    const key = `${node.repo}#${node.number}`
    setBusyChild(key)
    const closing = node.state === 'OPEN'
    await run(closing ? `Closed #${node.number}` : `Reopened #${node.number}`, () =>
      patch(node.repo, node.number, {
        state: closing ? 'closed' : 'open',
        state_reason: closing ? 'completed' : 'reopened',
      }).then(async (r) => {
        await refetch()
        return r
      }),
    )
    setBusyChild(null)
  }

  const postComment = async () => {
    const text = commentText.trim()
    if (!text || sending) return
    setSending(true)
    try {
      const outcome = await comment(repo, number, text)
      setCommentText('')
      toast.show(outcome.queued ? 'Comment queued' : 'Comment posted', outcome.queued ? 'queued' : 'success')
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Could not post the comment', 'error')
    } finally {
      setSending(false)
    }
  }

  if (error && !issue) {
    return (
      <div className="pad-safe-top">
        <BackBar onBack={() => navigate(-1)} title={`${repo}#${number}`} />
        <ErrorNote error={error} onRetry={() => void refetch()} />
      </div>
    )
  }

  if (!issue) {
    return (
      <div className="pad-safe-top">
        <BackBar onBack={() => navigate(-1)} title={`${repo}#${number}`} />
        <div className="space-y-3 p-4">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
        {isLoading && null}
      </div>
    )
  }

  return (
    <div className="pad-safe-top pb-[calc(env(safe-area-inset-bottom)+1rem)]">
      <BackBar
        onBack={() => navigate(-1)}
        title={`${name} #${issue.number}`}
        busy={isFetching}
        trailing={
          <a
            href={issue.url}
            target="_blank"
            rel="noreferrer"
            className="tap flex w-10 items-center justify-center rounded-xl text-muted"
            aria-label="Open on GitHub"
          >
            <IconExternal size={17} />
          </a>
        }
      />

      <div className="px-4 pt-3">
        {issue.parent && (
          <Link
            to={`/i/${issue.parent.repo}/${issue.parent.number}`}
            className="mb-2 inline-flex max-w-full items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-xs text-muted ring-1 ring-line"
          >
            <IconLink size={12} className="shrink-0" />
            <span className="truncate">
              #{issue.parent.number} {issue.parent.title}
            </span>
          </Link>
        )}

        <button type="button" onClick={() => setEditor('title')} className="w-full text-left">
          <h1 className="text-xl leading-snug font-bold">{issue.title}</h1>
        </button>

        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-muted">
          <StateBadge state={issue.state} reason={issue.stateReason} />
          {issue.author && (
            <span className="inline-flex items-center gap-1.5">
              <Avatar user={issue.author} size={16} />
              {issue.author.login}
            </span>
          )}
          <span>opened {shortDate(issue.createdAt)}</span>
        </div>
      </div>

      {progress && progress.total > 0 && (
        <section className="card mx-4 mt-4 p-3.5">
          <div className="flex items-center gap-3.5">
            <ProgressRing percent={progress.percent} size={54} strokeWidth={5} partial={progress.partial} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                {progress.completed} of {progress.total} done
                <span className="ml-1.5 font-normal text-muted">{progress.percent}%</span>
              </p>
              <p className="mt-0.5 text-xs text-faint">
                {deepProgress && progress.depth > 1
                  ? `Across ${progress.depth} levels of sub-issues`
                  : 'Direct sub-issues'}
                {progress.partial ? ' · some branches not loaded' : ''}
              </p>
              <div className="mt-2">
                <ProgressBar percent={progress.percent} partial={progress.partial} />
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="mt-4 px-4">
        <button type="button" onClick={() => setEditor('body')} className="w-full text-left">
          <Markdown html={issue.bodyHtml} fallback={issue.body} />
        </button>
      </section>

      <section className="mt-5">
        <div className="flex items-center justify-between px-4">
          <h2 className="text-xs font-bold tracking-wide text-faint uppercase">
            Sub-issues {children.length > 0 && <span className="text-muted">({children.length})</span>}
          </h2>
          <button
            type="button"
            onClick={() => setEditor('addChild')}
            className="inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-accent ring-1 ring-line"
          >
            <IconPlus size={12} /> Add
          </button>
        </div>

        <div className="mt-1 px-4">
          {children.length === 0 ? (
            <p className="py-4 text-sm text-faint">
              No sub-issues yet. Break this down and progress rolls up here automatically.
            </p>
          ) : (
            <SubIssueTree
              nodes={children}
              parent={{ repo, number }}
              deep={deepProgress}
              busyKey={busyChild}
              onToggleState={(node) => void toggleChildState(node)}
              onUnlink={(node, from) =>
                void run(`Unlinked #${node.number}`, async () => {
                  const outcome = await unlinkChild(from.repo, from.number, {
                    repo: node.repo,
                    number: node.number,
                    databaseId: node.databaseId,
                    title: node.title,
                  })
                  // The node may sit several levels down, so the tree this
                  // screen is showing has to be re-read, not just the parent.
                  if (!outcome.queued) await refetch()
                  return outcome
                })
              }
            />
          )}
        </div>
      </section>

      <section className="mt-5 space-y-2 px-4">
        <MetaRow
          icon={<IconTag size={15} />}
          label="Labels"
          onClick={() => setEditor('labels')}
          empty={issue.labels.length === 0}
        >
          <div className="flex flex-wrap gap-1.5">
            {issue.labels.map((l) => (
              <LabelChip key={l.name} label={l} />
            ))}
          </div>
        </MetaRow>

        <MetaRow
          icon={<IconPerson size={15} />}
          label="Assignees"
          onClick={() => setEditor('assignees')}
          empty={issue.assignees.length === 0}
        >
          <div className="flex flex-wrap items-center gap-2">
            {issue.assignees.map((u) => (
              <span key={u.login} className="inline-flex items-center gap-1.5 text-sm">
                <Avatar user={u} size={18} />
                {u.login}
              </span>
            ))}
          </div>
        </MetaRow>

        <MetaRow
          icon={<IconMilestone size={15} />}
          label="Milestone"
          onClick={() => setEditor('milestone')}
          empty={!issue.milestone}
        >
          <span className="text-sm">{issue.milestone?.title}</span>
        </MetaRow>
      </section>

      <div className="mt-5 flex gap-2 px-4">
        {issue.state === 'OPEN' ? (
          <>
            <button
              type="button"
              className="btn btn-secondary flex-1"
              onClick={() =>
                void run('Closed as completed', () =>
                  patch(repo, number, { state: 'closed', state_reason: 'completed' }),
                )
              }
            >
              <IconIssueClosed size={16} /> Close
            </button>
            <button type="button" className="btn btn-secondary flex-1" onClick={() => setEditor('close')}>
              <IconSkip size={16} /> Not planned
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn btn-secondary flex-1"
            onClick={() => void run('Reopened', () => patch(repo, number, { state: 'open', state_reason: 'reopened' }))}
          >
            <IconIssueOpen size={16} /> Reopen
          </button>
        )}
      </div>

      <section className="mt-6">
        <h2 className="px-4 pb-1 text-xs font-bold tracking-wide text-faint uppercase">
          Comments {data.commentCount > 0 && <span className="text-muted">({data.commentCount})</span>}
        </h2>

        {data.comments.length === 0 && <p className="px-4 py-3 text-sm text-faint">No comments yet.</p>}

        <ul className="space-y-3 px-4 pt-2">
          {data.comments.map((c) => (
            <li key={c.id} className="card p-3">
              <div className="mb-1.5 flex items-center gap-2 text-xs text-muted">
                {c.author && <Avatar user={c.author} size={18} />}
                <span className="font-semibold text-ink">{c.author?.login ?? 'You'}</span>
                <span>{relativeTime(c.createdAt)}</span>
                {c.pending && (
                  <span className="rounded-full bg-warn/15 px-1.5 py-0.5 text-[0.625rem] font-semibold text-warn">
                    Pending
                  </span>
                )}
              </div>
              <Markdown html={c.bodyHtml} fallback={c.body} />
            </li>
          ))}
        </ul>

        {data.commentCount > data.comments.length && (
          <p className="px-4 pt-3 text-xs text-faint">
            Showing the first {data.comments.length} of {data.commentCount} comments.{' '}
            <a href={issue.url} target="_blank" rel="noreferrer" className="text-accent underline">
              Read the rest on GitHub
            </a>
            .
          </p>
        )}

        <div className="mt-3 px-4">
          <textarea
            className="field min-h-24 resize-y"
            placeholder="Leave a comment"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            rows={3}
          />
          <button
            type="button"
            className="btn btn-primary mt-2 w-full"
            disabled={!commentText.trim() || sending}
            onClick={() => void postComment()}
          >
            {sending ? <Spinner size={15} /> : <IconComment size={15} />}
            Comment
          </button>
        </div>
      </section>

      {/* --- editors --- */}

      <TextSheet
        open={editor === 'title'}
        onClose={() => setEditor(null)}
        title="Edit title"
        initial={issue.title}
        multiline={false}
        onSave={(value) => run('Title updated', () => patch(repo, number, { title: value }))}
      />

      <TextSheet
        open={editor === 'body'}
        onClose={() => setEditor(null)}
        title="Edit description"
        initial={issue.body}
        multiline
        onSave={(value) => run('Description updated', () => patch(repo, number, { body: value }))}
      />

      <Sheet open={editor === 'labels'} onClose={() => setEditor(null)} title="Labels" tall>
        {meta.data?.labels.map((label) => {
          const on = issue.labels.some((l) => l.name === label.name)
          return (
            <SheetRow
              key={label.name}
              selected={on}
              onClick={() => {
                const next = on
                  ? issue.labels.filter((l) => l.name !== label.name).map((l) => l.name)
                  : [...issue.labels.map((l) => l.name), label.name]
                void run('Labels updated', () => patch(repo, number, { labels: next }))
              }}
            >
              <span className="flex-1 py-3">
                <LabelChip label={label} />
              </span>
              {on && <IconCheck size={16} className="text-accent" />}
            </SheetRow>
          )
        })}
      </Sheet>

      <Sheet open={editor === 'assignees'} onClose={() => setEditor(null)} title="Assignees" tall>
        {meta.data?.assignableUsers.map((u) => {
          const on = issue.assignees.some((a) => a.login === u.login)
          return (
            <SheetRow
              key={u.login}
              selected={on}
              onClick={() => {
                const next = on
                  ? issue.assignees.filter((a) => a.login !== u.login).map((a) => a.login)
                  : [...issue.assignees.map((a) => a.login), u.login]
                void run('Assignees updated', () => patch(repo, number, { assignees: next }))
              }}
            >
              <Avatar user={u} size={24} />
              <span className="flex-1 py-3">{u.login}</span>
              {on && <IconCheck size={16} className="text-accent" />}
            </SheetRow>
          )
        })}
      </Sheet>

      <Sheet open={editor === 'milestone'} onClose={() => setEditor(null)} title="Milestone">
        <SheetRow
          selected={!issue.milestone}
          onClick={() => {
            setEditor(null)
            void run('Milestone cleared', () => patch(repo, number, { milestone: null }))
          }}
        >
          <span className="flex-1 py-3">None</span>
        </SheetRow>
        {meta.data?.milestones.map((m) => (
          <SheetRow
            key={m.number}
            selected={issue.milestone?.number === m.number}
            onClick={() => {
              setEditor(null)
              void run(`Milestone set to ${m.title}`, () => patch(repo, number, { milestone: m.number }))
            }}
          >
            <span className="flex-1 py-3">{m.title}</span>
            {issue.milestone?.number === m.number && <IconCheck size={16} className="text-accent" />}
          </SheetRow>
        ))}
      </Sheet>

      <Sheet open={editor === 'close'} onClose={() => setEditor(null)} title="Close issue">
        <SheetRow
          onClick={() => {
            setEditor(null)
            void run('Closed as completed', () => patch(repo, number, { state: 'closed', state_reason: 'completed' }))
          }}
        >
          <IconIssueClosed size={17} className="text-closed" />
          <span className="flex-1 py-3.5">Completed</span>
        </SheetRow>
        <SheetRow
          onClick={() => {
            setEditor(null)
            void run('Closed as not planned', () =>
              patch(repo, number, { state: 'closed', state_reason: 'not_planned' }),
            )
          }}
        >
          <IconSkip size={17} className="text-notplanned" />
          <span className="flex-1 py-3.5">Not planned</span>
        </SheetRow>
      </Sheet>

      <Sheet open={editor === 'addChild'} onClose={() => setEditor(null)} title="Add sub-issue">
        <SheetRow
          onClick={() => {
            setEditor(null)
            navigate(
              `/new?repo=${encodeURIComponent(repo)}&parent=${encodeURIComponent(`${repo}#${number}`)}&parentTitle=${encodeURIComponent(issue.title)}`,
            )
          }}
        >
          <IconPlus size={17} className="text-accent" />
          <span className="flex-1 py-3.5">
            Create a new issue
            <span className="block text-xs text-faint">Files it and links it in one step</span>
          </span>
        </SheetRow>
        <SheetRow onClick={() => setEditor('link')}>
          <IconLink size={17} className="text-accent" />
          <span className="flex-1 py-3.5">
            Link an existing issue
            <span className="block text-xs text-faint">Search this repo by title or number</span>
          </span>
        </SheetRow>
      </Sheet>

      <LinkExistingSheet
        open={editor === 'link'}
        onClose={() => setEditor(null)}
        repo={repo}
        excludeKeys={new Set([`${repo}#${number}`, ...descendantKeys])}
        onPick={async (candidate) => {
          setEditor(null)
          await run(`Linked #${candidate.number}`, () =>
            linkChild(repo, number, {
              repo: candidate.repo,
              number: candidate.number,
              databaseId: candidate.databaseId,
              title: candidate.title,
            }),
          )
        }}
      />
    </div>
  )
}

function BackBar({
  onBack,
  title,
  trailing,
  busy,
}: {
  onBack: () => void
  title: string
  trailing?: React.ReactNode
  busy?: boolean
}) {
  return (
    <header className="sticky top-0 z-20 flex items-center gap-1 border-b border-line bg-canvas/95 px-2 py-2 backdrop-blur">
      <button
        type="button"
        onClick={onBack}
        className="tap flex w-10 items-center justify-center rounded-xl text-muted"
        aria-label="Back"
      >
        <IconChevronLeft size={20} />
      </button>
      <h1 className="min-w-0 flex-1 truncate text-center font-mono text-sm text-muted">{title}</h1>
      <div className="flex w-10 justify-center">{busy ? <Spinner size={15} /> : trailing}</div>
    </header>
  )
}

function MetaRow({
  icon,
  label,
  onClick,
  empty,
  children,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  empty: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-2.5 rounded-xl bg-surface px-3 py-2.5 text-left ring-1 ring-line active:bg-surface-2"
    >
      <span className="mt-0.5 text-faint">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-muted">{label}</span>
        <span className="mt-1 block">{empty ? <span className="text-sm text-faint">None</span> : children}</span>
      </span>
    </button>
  )
}

function TextSheet({
  open,
  onClose,
  title,
  initial,
  multiline,
  onSave,
}: {
  open: boolean
  onClose: () => void
  title: string
  initial: string
  multiline: boolean
  onSave: (value: string) => Promise<void>
}) {
  const [value, setValue] = useState(initial)
  const [busy, setBusy] = useState(false)

  // The sheet stays mounted between opens, so the draft has to be re-seeded
  // each time — otherwise a second edit starts from the previous session's text.
  useEffect(() => {
    if (open) setValue(initial)
  }, [open, initial])

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      tall={multiline}
      action={
        <button
          type="button"
          className="text-sm font-semibold text-accent disabled:opacity-50"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            await onSave(value)
            setBusy(false)
            onClose()
          }}
        >
          {busy ? <Spinner size={15} /> : 'Save'}
        </button>
      }
    >
      <div className="p-4">
        {multiline ? (
          <textarea
            key={open ? 'open' : 'closed'}
            className="field min-h-[55dvh] resize-y"
            defaultValue={initial}
            onChange={(e) => setValue(e.target.value)}
          />
        ) : (
          <input
            key={open ? 'open' : 'closed'}
            className="field"
            defaultValue={initial}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
          />
        )}
      </div>
    </Sheet>
  )
}
