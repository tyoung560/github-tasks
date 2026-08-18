import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ScreenHeader } from '@/components/AppShell'
import { Sheet } from '@/components/Sheet'
import { Avatar, Spinner } from '@/components/Bits'
import { IconChevronRight, IconPlus, IconSync, IconTrash } from '@/components/Icon'
import { useOutbox } from '@/hooks/useOutbox'
import { useAuth } from '@/state/auth'
import { useSettings, type ThemeChoice } from '@/state/settings'
import { newTemplateId, type IssueTemplate } from '@/lib/templates'
import { onRateLimit } from '@/lib/github/client'
import { clearCachedData } from '@/lib/db'
import { queryClient } from '@/state/query'
import type { RateLimit } from '@/lib/github/types'

export function Settings() {
  const { viewer, signOut } = useAuth()
  const settings = useSettings()
  const { pending, failed } = useOutbox()
  const navigate = useNavigate()
  const [editing, setEditing] = useState<IssueTemplate | null>(null)
  const [rate, setRate] = useState<RateLimit | null>(null)
  const [clearing, setClearing] = useState(false)

  useEffect(() => onRateLimit(setRate), [])

  return (
    <>
      <ScreenHeader title="Settings" />

      <Section title="Account">
        <div className="flex items-center gap-3 px-4 py-3">
          {viewer && <Avatar user={{ login: viewer.login, avatarUrl: viewer.avatarUrl }} size={40} />}
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{viewer?.name || viewer?.login}</p>
            <p className="truncate text-xs text-faint">@{viewer?.login}</p>
          </div>
          <button
            type="button"
            className="btn btn-danger h-9 min-h-9 px-3 text-sm"
            onClick={() => void signOut()}
          >
            Sign out
          </button>
        </div>
        {rate && (
          <p className="px-4 pb-3 text-xs text-faint">
            API budget: {rate.remaining} of {rate.limit} left, resets{' '}
            {new Date(rate.resetAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </Section>

      <Section title="Sync">
        <Link to="/settings/pending" className="tap flex items-center gap-3 border-b border-line px-4">
          <IconSync size={17} className={failed ? 'text-danger' : pending ? 'text-accent' : 'text-faint'} />
          <span className="flex-1">Pending changes</span>
          <span className="text-sm text-muted">
            {failed > 0 ? `${failed} failed` : pending > 0 ? `${pending} queued` : 'All synced'}
          </span>
          <IconChevronRight size={15} className="text-faint" />
        </Link>
        <button
          type="button"
          className="tap flex w-full items-center gap-3 border-b border-line px-4 text-left"
          disabled={clearing}
          onClick={async () => {
            setClearing(true)
            queryClient.clear()
            await clearCachedData()
            setClearing(false)
            navigate('/')
          }}
        >
          <IconTrash size={17} className="text-faint" />
          <span className="flex-1">Clear cached data</span>
          {clearing && <Spinner size={15} />}
        </button>
      </Section>

      <Section title="Appearance">
        <Row label="Theme">
          <select
            className="field w-auto min-w-32 py-1.5"
            value={settings.theme}
            onChange={(e) => settings.update({ theme: e.target.value as ThemeChoice })}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </Row>
      </Section>

      <Section title="Issues">
        <Toggle
          label="Roll progress up the whole tree"
          hint="Count every descendant, not just direct sub-issues"
          value={settings.deepProgress}
          onChange={(v) => settings.update({ deepProgress: v })}
        />
        <Toggle
          label="Hide sub-issues in lists"
          hint="Show only top-level work when browsing a repo"
          value={settings.hideSubIssuesInLists}
          onChange={(v) => settings.update({ hideSubIssuesInLists: v })}
        />
        <Row label="Default view">
          <select
            className="field w-auto min-w-28 py-1.5"
            value={settings.defaultState}
            onChange={(e) => settings.update({ defaultState: e.target.value as 'open' | 'closed' | 'all' })}
          >
            <option value="open">Open</option>
            <option value="closed">Closed</option>
            <option value="all">All</option>
          </select>
        </Row>
      </Section>

      <Section
        title="Quick-capture templates"
        action={
          <button
            type="button"
            className="text-accent"
            aria-label="New template"
            onClick={() =>
              setEditing({ id: newTemplateId(), name: '', emoji: '📝', title: '', body: '', labels: [], assignees: [] })
            }
          >
            <IconPlus size={17} />
          </button>
        }
      >
        {settings.templates.map((template) => (
          <button
            key={template.id}
            type="button"
            onClick={() => setEditing(template)}
            className="tap flex w-full items-center gap-3 border-b border-line px-4 text-left"
          >
            <span className="text-lg">{template.emoji}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{template.name || 'Untitled'}</span>
              <span className="block truncate text-xs text-faint">
                {template.repo ? `${template.repo} · ` : ''}
                {template.labels.length ? template.labels.join(', ') : 'No labels'}
              </span>
            </span>
            <IconChevronRight size={15} className="text-faint" />
          </button>
        ))}
        <button
          type="button"
          onClick={settings.resetTemplates}
          className="tap flex w-full items-center px-4 text-left text-sm text-muted"
        >
          Reset to the built-in templates
        </button>
      </Section>

      <p className="px-4 py-6 text-center text-xs text-faint">
        GitHub Tasks · everything is stored on this device
      </p>

      <TemplateEditor template={editing} onClose={() => setEditing(null)} />
    </>
  )
}

function TemplateEditor({ template, onClose }: { template: IssueTemplate | null; onClose: () => void }) {
  const { upsertTemplate, deleteTemplate, favorites } = useSettings()
  const [draft, setDraft] = useState<IssueTemplate | null>(template)

  useEffect(() => setDraft(template), [template])
  if (!draft) return null

  const set = (patch: Partial<IssueTemplate>) => setDraft({ ...draft, ...patch })

  return (
    <Sheet
      open={Boolean(template)}
      onClose={onClose}
      title="Template"
      tall
      action={
        <button
          type="button"
          className="text-sm font-semibold text-accent"
          onClick={() => {
            upsertTemplate({ ...draft, name: draft.name.trim() || 'Untitled' })
            onClose()
          }}
        >
          Save
        </button>
      }
    >
      <div className="space-y-3 p-4">
        <div className="flex gap-2">
          <input
            className="field w-16 text-center"
            value={draft.emoji}
            onChange={(e) => set({ emoji: e.target.value.slice(0, 2) })}
            aria-label="Emoji"
          />
          <input
            className="field flex-1"
            placeholder="Name"
            value={draft.name}
            onChange={(e) => set({ name: e.target.value })}
          />
        </div>

        <input
          className="field"
          placeholder="Default title (optional)"
          value={draft.title}
          onChange={(e) => set({ title: e.target.value })}
        />

        <textarea
          className="field min-h-48 resize-y font-mono text-sm"
          placeholder="Body"
          value={draft.body}
          onChange={(e) => set({ body: e.target.value })}
        />

        <p className="text-xs text-faint">
          Variables: <code>{'{{date}}'}</code> <code>{'{{time}}'}</code> <code>{'{{me}}'}</code>{' '}
          <code>{'{{repo}}'}</code> <code>{'{{parent}}'}</code> <code>{'{{parentTitle}}'}</code>
        </p>

        <input
          className="field"
          placeholder="Labels, comma separated"
          value={draft.labels.join(', ')}
          onChange={(e) => set({ labels: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
        />

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-5 w-5 accent-[var(--c-accent)]"
            checked={Boolean(draft.assignSelf)}
            onChange={(e) => set({ assignSelf: e.target.checked })}
          />
          Assign to me
        </label>

        <label className="block text-sm">
          <span className="text-muted">Only offer in</span>
          <select
            className="field mt-1"
            value={draft.repo ?? ''}
            onChange={(e) => set({ repo: e.target.value || undefined })}
          >
            <option value="">Every repo</option>
            {favorites.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className="btn btn-danger w-full"
          onClick={() => {
            deleteTemplate(draft.id)
            onClose()
          }}
        >
          <IconTrash size={15} /> Delete template
        </button>
      </div>
    </Sheet>
  )
}

function Section({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="mt-4">
      <div className="flex items-center justify-between px-4 pb-1">
        <h2 className="text-xs font-bold tracking-wide text-faint uppercase">{title}</h2>
        {action}
      </div>
      <div className="border-t border-line">{children}</div>
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-14 items-center gap-3 border-b border-line px-4">
      <span className="flex-1">{label}</span>
      {children}
    </div>
  )
}

function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string
  hint?: string
  value: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className="flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left"
    >
      <span className="min-w-0 flex-1">
        <span className="block">{label}</span>
        {hint && <span className="block text-xs text-faint">{hint}</span>}
      </span>
      <span
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${value ? 'bg-accent' : 'bg-track'}`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-[left] ${value ? 'left-6' : 'left-1'}`}
        />
      </span>
    </button>
  )
}
