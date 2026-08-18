import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Sheet, SheetRow } from '@/components/Sheet'
import { LabelChip, Spinner } from '@/components/Bits'
import { IconCheck, IconChevronLeft, IconLink, IconMilestone, IconPerson, IconTag } from '@/components/Icon'
import { useRepoMeta } from '@/hooks/useGithub'
import { useIssueMutations } from '@/hooks/useIssueMutations'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/state/auth'
import { useSettings } from '@/state/settings'
import { applyTemplate, templatesForRepo } from '@/lib/templates'
import { parseIssueKey } from '@/lib/github/types'

type Picker = null | 'repo' | 'labels' | 'assignees' | 'milestone'

/**
 * Quick capture. Opens with the keyboard on the title, so the fast path is
 * type-a-line-and-send; everything else is one tap away below.
 */
export function NewIssue() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { viewer } = useAuth()
  const { favorites, defaultRepo, templates } = useSettings()
  const { create } = useIssueMutations()
  const toast = useToast()

  const parentKey = params.get('parent')
  const parent = parentKey ? parseIssueKey(parentKey) : null
  const parentTitle = params.get('parentTitle') ?? ''

  const [repo, setRepo] = useState(() => params.get('repo') ?? parent?.repo ?? defaultRepo ?? favorites[0] ?? '')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [labels, setLabels] = useState<string[]>([])
  const [assignees, setAssignees] = useState<string[]>([])
  const [milestone, setMilestone] = useState<number | null>(null)
  const [picker, setPicker] = useState<Picker>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const meta = useRepoMeta(repo || null)
  const available = useMemo(() => templatesForRepo(templates, repo || null), [templates, repo])

  // Labels and assignees are repo-scoped; drop any that the new repo lacks.
  useEffect(() => {
    if (!meta.data) return
    setLabels((prev) => prev.filter((l) => meta.data.labels.some((x) => x.name === l)))
    setAssignees((prev) => prev.filter((a) => meta.data.assignableUsers.some((u) => u.login === a)))
    setMilestone((prev) => (prev && meta.data.milestones.some((m) => m.number === prev) ? prev : null))
  }, [meta.data])

  const useTemplate = (id: string) => {
    const template = available.find((t) => t.id === id)
    if (!template) return
    const rendered = applyTemplate(template, {
      me: viewer?.login,
      repo,
      parent: parentKey ?? '',
      parentTitle,
    })
    if (rendered.title) setTitle(rendered.title)
    setBody((prev) => (prev.trim() ? `${prev.trimEnd()}\n\n${rendered.body}` : rendered.body))
    setLabels((prev) => [...new Set([...prev, ...rendered.labels])])
    setAssignees((prev) => [...new Set([...prev, ...rendered.assignees])])
  }

  const submit = async () => {
    if (!repo || !title.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const outcome = await create(
        repo,
        { title: title.trim(), body, labels, assignees, milestone },
        parent ? { repo: parent.repo, number: parent.number } : undefined,
      )
      if (outcome.queued) {
        toast.show('Saved offline — will post when you reconnect', 'queued')
        navigate(-1)
      } else {
        toast.show(`Created #${outcome.result?.number}`)
        if (outcome.result) navigate(`/i/${repo}/${outcome.result.number}`, { replace: true })
        else navigate(-1)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the issue')
    } finally {
      setBusy(false)
    }
  }

  if (favorites.length === 0 && !repo) {
    return (
      <div className="pad-safe-top px-6 py-16 text-center">
        <p className="font-semibold">Pin a repo first</p>
        <p className="mt-1 text-sm text-muted">New issues need somewhere to go.</p>
        <button type="button" className="btn btn-primary mt-4" onClick={() => navigate('/repos')}>
          Go to Repos
        </button>
      </div>
    )
  }

  return (
    <div className="pad-safe-top flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-canvas/95 px-2 py-2 backdrop-blur">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="tap flex w-10 items-center justify-center rounded-xl text-muted"
          aria-label="Cancel"
        >
          <IconChevronLeft size={20} />
        </button>
        <h1 className="flex-1 text-center text-[0.9375rem] font-semibold">
          {parent ? 'New sub-issue' : 'New issue'}
        </h1>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!title.trim() || !repo || busy}
          className="btn btn-primary h-9 min-h-9 px-3.5 text-sm"
        >
          {busy ? <Spinner size={15} /> : 'Create'}
        </button>
      </header>

      <div className="flex-1 space-y-3 px-4 py-3">
        {parent && (
          <div className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2 text-xs text-muted ring-1 ring-line">
            <IconLink size={13} className="shrink-0" />
            <span className="min-w-0 truncate">
              Sub-issue of <span className="font-mono">#{parent.number}</span>
              {parentTitle ? ` · ${parentTitle}` : ''}
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={() => setPicker('repo')}
          className="tap flex w-full items-center justify-between rounded-xl bg-surface px-3 text-sm ring-1 ring-line"
          disabled={Boolean(parent)}
        >
          <span className="text-muted">Repository</span>
          <span className="truncate font-medium">{repo || 'Choose…'}</span>
        </button>

        <input
          className="field text-base font-medium"
          autoFocus
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          enterKeyHint="next"
        />

        {available.length > 0 && (
          <div className="scroll-x flex gap-2">
            {available.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => useTemplate(t.id)}
                className="shrink-0 rounded-full bg-surface px-3 py-1.5 text-sm font-medium ring-1 ring-line active:bg-surface-2"
              >
                <span className="mr-1">{t.emoji}</span>
                {t.name}
              </button>
            ))}
          </div>
        )}

        <textarea
          className="field min-h-40 resize-y font-normal"
          placeholder="Describe it (Markdown supported)"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={8}
        />

        <div className="space-y-2">
          <MetaButton
            icon={<IconTag size={15} />}
            label="Labels"
            value={labels.length ? labels.join(', ') : 'None'}
            onClick={() => setPicker('labels')}
            disabled={!repo}
          />
          <MetaButton
            icon={<IconPerson size={15} />}
            label="Assignees"
            value={assignees.length ? assignees.join(', ') : 'None'}
            onClick={() => setPicker('assignees')}
            disabled={!repo}
          />
          <MetaButton
            icon={<IconMilestone size={15} />}
            label="Milestone"
            value={meta.data?.milestones.find((m) => m.number === milestone)?.title ?? 'None'}
            onClick={() => setPicker('milestone')}
            disabled={!repo || !meta.data?.milestones.length}
          />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}
      </div>

      <Sheet open={picker === 'repo'} onClose={() => setPicker(null)} title="Repository">
        {favorites.map((r) => (
          <SheetRow key={r} onClick={() => { setRepo(r); setPicker(null) }} selected={r === repo}>
            <span className="flex-1 py-3">{r}</span>
            {r === repo && <IconCheck size={16} className="text-accent" />}
          </SheetRow>
        ))}
      </Sheet>

      <Sheet open={picker === 'labels'} onClose={() => setPicker(null)} title="Labels" tall>
        {meta.data?.labels.map((label) => {
          const on = labels.includes(label.name)
          return (
            <SheetRow
              key={label.name}
              selected={on}
              onClick={() => setLabels((prev) => (on ? prev.filter((l) => l !== label.name) : [...prev, label.name]))}
            >
              <span className="flex-1 py-3">
                <LabelChip label={label} />
              </span>
              {on && <IconCheck size={16} className="text-accent" />}
            </SheetRow>
          )
        })}
      </Sheet>

      <Sheet open={picker === 'assignees'} onClose={() => setPicker(null)} title="Assignees" tall>
        {meta.data?.assignableUsers.map((u) => {
          const on = assignees.includes(u.login)
          return (
            <SheetRow
              key={u.login}
              selected={on}
              onClick={() => setAssignees((prev) => (on ? prev.filter((a) => a !== u.login) : [...prev, u.login]))}
            >
              <img src={u.avatarUrl} alt="" width={24} height={24} className="rounded-full" />
              <span className="flex-1 py-3">{u.login}</span>
              {on && <IconCheck size={16} className="text-accent" />}
            </SheetRow>
          )
        })}
      </Sheet>

      <Sheet open={picker === 'milestone'} onClose={() => setPicker(null)} title="Milestone">
        <SheetRow onClick={() => { setMilestone(null); setPicker(null) }} selected={milestone === null}>
          <span className="flex-1 py-3">None</span>
        </SheetRow>
        {meta.data?.milestones.map((m) => (
          <SheetRow key={m.number} onClick={() => { setMilestone(m.number); setPicker(null) }} selected={milestone === m.number}>
            <span className="flex-1 py-3">{m.title}</span>
            {milestone === m.number && <IconCheck size={16} className="text-accent" />}
          </SheetRow>
        ))}
      </Sheet>
    </div>
  )
}

function MetaButton({
  icon,
  label,
  value,
  onClick,
  disabled,
}: {
  icon: React.ReactNode
  label: string
  value: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="tap flex w-full items-center gap-2.5 rounded-xl bg-surface px-3 text-sm ring-1 ring-line disabled:opacity-50"
    >
      <span className="text-faint">{icon}</span>
      <span className="text-muted">{label}</span>
      <span className="ml-auto max-w-[55%] truncate font-medium">{value}</span>
    </button>
  )
}
