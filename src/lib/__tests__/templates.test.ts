import { describe, expect, it } from 'vitest'
import { applyTemplate, DEFAULT_TEMPLATES, newTemplateId, renderTemplateText, templatesForRepo } from '../templates'
import type { IssueTemplate } from '../templates'

const NOW = Date.parse('2026-03-04T09:30:00Z')

const base: IssueTemplate = {
  id: 't1',
  name: 'Bug',
  emoji: '🐞',
  title: 'Bug: ',
  body: 'Found on {{date}} by {{me}} in {{repo}}',
  labels: ['bug'],
  assignees: [],
}

describe('renderTemplateText', () => {
  it('expands the known variables', () => {
    expect(renderTemplateText('{{date}} / {{me}} / {{repo}}', { me: 'ada', repo: 'acme/app', now: NOW })).toBe(
      '2026-03-04 / ada / acme/app',
    )
  })

  it('tolerates whitespace inside the braces', () => {
    expect(renderTemplateText('{{  me  }}', { me: 'ada' })).toBe('ada')
  })

  it('leaves unknown variables visible instead of silently blanking them', () => {
    expect(renderTemplateText('{{nope}}', {})).toBe('{{nope}}')
  })

  it('substitutes every occurrence', () => {
    expect(renderTemplateText('{{me}} and {{me}}', { me: 'ada' })).toBe('ada and ada')
  })

  it('renders empty for known-but-unsupplied variables', () => {
    expect(renderTemplateText('parent={{parent}}', {})).toBe('parent=')
  })
})

describe('applyTemplate', () => {
  it('renders title and body together', () => {
    const out = applyTemplate(base, { me: 'ada', repo: 'acme/app', now: NOW })
    expect(out.title).toBe('Bug:')
    expect(out.body).toBe('Found on 2026-03-04 by ada in acme/app')
    expect(out.labels).toEqual(['bug'])
  })

  it('adds the signed-in user when the template asks for it', () => {
    const out = applyTemplate({ ...base, assignSelf: true }, { me: 'ada' })
    expect(out.assignees).toEqual(['ada'])
  })

  it('does not duplicate an assignee already listed', () => {
    const out = applyTemplate({ ...base, assignees: ['ada'], assignSelf: true }, { me: 'ada' })
    expect(out.assignees).toEqual(['ada'])
  })

  it('skips self-assignment when nobody is signed in', () => {
    expect(applyTemplate({ ...base, assignSelf: true }, {}).assignees).toEqual([])
  })

  it('does not mutate the stored template', () => {
    const template = { ...base, labels: ['bug'], assignees: [], assignSelf: true }
    applyTemplate(template, { me: 'ada' })
    expect(template.assignees).toEqual([])
  })
})

describe('templatesForRepo', () => {
  const pinned: IssueTemplate = { ...base, id: 't2', repo: 'acme/api' }

  it('offers global templates everywhere', () => {
    expect(templatesForRepo([base, pinned], 'acme/app').map((t) => t.id)).toEqual(['t1'])
  })

  it('includes a repo-pinned template in its own repo', () => {
    expect(templatesForRepo([base, pinned], 'acme/api').map((t) => t.id)).toEqual(['t1', 't2'])
  })
})

describe('defaults', () => {
  it('ships templates with unique ids', () => {
    const ids = DEFAULT_TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('mints distinct ids', () => {
    expect(newTemplateId(1)).not.toBe(newTemplateId(1))
  })
})
