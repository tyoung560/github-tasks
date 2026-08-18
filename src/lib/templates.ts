import { isoDate } from './time'

/**
 * Quick-capture templates. Stored per device in settings, so they work offline
 * and are not tied to a repo's `.github/ISSUE_TEMPLATE` files.
 */
export interface IssueTemplate {
  id: string
  name: string
  /** Rendered as the row's leading glyph. */
  emoji: string
  /** Prefilled title; `{{...}}` variables are expanded on use. */
  title: string
  body: string
  labels: string[]
  assignees: string[]
  /** Pins the template to one repo; empty means it offers itself everywhere. */
  repo?: string
  /** Assign the new issue to the signed-in user. */
  assignSelf?: boolean
}

export interface TemplateVars {
  me?: string
  repo?: string
  /** "owner/name#123" of the parent when creating a sub-issue. */
  parent?: string
  parentTitle?: string
  now?: number
}

const VARIABLE = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g

/** Expands `{{date}}`, `{{me}}`, `{{repo}}`, `{{parent}}`, `{{parentTitle}}`, `{{time}}`. */
export function renderTemplateText(text: string, vars: TemplateVars = {}): string {
  const now = vars.now ?? Date.now()
  const table: Record<string, string> = {
    date: isoDate(now),
    time: new Date(now).toTimeString().slice(0, 5),
    me: vars.me ?? '',
    repo: vars.repo ?? '',
    parent: vars.parent ?? '',
    parentTitle: vars.parentTitle ?? '',
  }
  // Unknown variables are left verbatim so a typo is visible rather than silent.
  return text.replace(VARIABLE, (match, name: string) => (name in table ? table[name] : match))
}

export interface RenderedTemplate {
  title: string
  body: string
  labels: string[]
  assignees: string[]
}

export function applyTemplate(template: IssueTemplate, vars: TemplateVars = {}): RenderedTemplate {
  const assignees = [...template.assignees]
  if (template.assignSelf && vars.me && !assignees.includes(vars.me)) assignees.push(vars.me)
  return {
    title: renderTemplateText(template.title, vars).trim(),
    body: renderTemplateText(template.body, vars),
    labels: [...template.labels],
    assignees,
  }
}

/** Templates offered for a repo: global ones first, then repo-pinned ones. */
export function templatesForRepo(templates: IssueTemplate[], repo: string | null): IssueTemplate[] {
  return templates.filter((t) => !t.repo || t.repo === repo)
}

export function newTemplateId(seed: number = Date.now()): string {
  return `tpl_${seed.toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export const DEFAULT_TEMPLATES: IssueTemplate[] = [
  {
    id: 'tpl_bug',
    name: 'Bug',
    emoji: '🐞',
    title: '',
    body: '### What happened\n\n\n### Expected\n\n\n### Steps\n1. \n2. \n\n_Filed {{date}} from mobile._\n',
    labels: ['bug'],
    assignees: [],
    assignSelf: true,
  },
  {
    id: 'tpl_task',
    name: 'Task',
    emoji: '✅',
    title: '',
    body: '### Outcome\n\n\n### Done when\n- [ ] \n- [ ] \n',
    labels: [],
    assignees: [],
    assignSelf: true,
  },
  {
    id: 'tpl_idea',
    name: 'Idea',
    emoji: '💡',
    title: '',
    body: '### The idea\n\n\n### Why now\n\n',
    labels: [],
    assignees: [],
  },
  {
    id: 'tpl_subtask',
    name: 'Sub-task',
    emoji: '🔗',
    title: '',
    body: 'Part of {{parent}} — {{parentTitle}}\n\n### Scope\n\n',
    labels: [],
    assignees: [],
    assignSelf: true,
  },
]
