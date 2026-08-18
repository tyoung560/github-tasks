import { describe, expect, it } from 'vitest'
import { buildIssueQuery, countActiveFilters, describeFilter, quoteQualifier } from '../search'

describe('buildIssueQuery', () => {
  it('always scopes to issues, excludes archives, and sorts', () => {
    expect(buildIssueQuery({})).toBe('is:issue archived:false sort:updated-desc')
  })

  it('adds one repo qualifier per repo', () => {
    const q = buildIssueQuery({ repos: ['acme/app', 'acme/api'] })
    expect(q).toContain('repo:acme/app')
    expect(q).toContain('repo:acme/api')
  })

  it('quotes multi-word labels', () => {
    expect(buildIssueQuery({ labels: ['good first issue'] })).toContain('label:"good first issue"')
    expect(buildIssueQuery({ labels: ['bug'] })).toContain('label:bug')
  })

  it('supports negated labels', () => {
    expect(buildIssueQuery({ excludeLabels: ['wontfix'] })).toContain('-label:wontfix')
  })

  it('maps "none" to the no: qualifiers', () => {
    expect(buildIssueQuery({ assignee: 'none' })).toContain('no:assignee')
    expect(buildIssueQuery({ milestone: 'none' })).toContain('no:milestone')
  })

  it('passes @me straight through', () => {
    expect(buildIssueQuery({ assignee: '@me' })).toContain('assignee:@me')
  })

  it('omits the state qualifier when asking for everything', () => {
    expect(buildIssueQuery({ state: 'all' })).not.toContain('state:')
    expect(buildIssueQuery({ state: 'closed' })).toContain('state:closed')
  })

  it('puts free text last so the qualifiers stay readable', () => {
    const q = buildIssueQuery({ state: 'open', text: 'crash on launch' })
    expect(q.endsWith('crash on launch')).toBe(true)
  })

  it('drops blank values instead of emitting empty qualifiers', () => {
    const q = buildIssueQuery({ repos: ['', '  '], labels: [''], text: '   ' })
    expect(q).toBe('is:issue archived:false sort:updated-desc')
  })

  it('can include archived repos when asked', () => {
    expect(buildIssueQuery({ includeArchived: true })).not.toContain('archived:false')
  })
})

describe('quoteQualifier', () => {
  it('escapes embedded quotes', () => {
    expect(quoteQualifier('needs "input"')).toBe('"needs \\"input\\""')
  })
})

describe('describeFilter', () => {
  it('summarises the active filter for a header', () => {
    expect(describeFilter({ state: 'open', assignee: '@me', labels: ['bug'] })).toBe('Open · bug · Mine')
  })

  it('collapses many labels into a count', () => {
    expect(describeFilter({ labels: ['a', 'b', 'c'] })).toContain('3 labels')
  })
})

describe('countActiveFilters', () => {
  it('does not count the defaults', () => {
    expect(countActiveFilters({ state: 'open', sort: 'updated' })).toBe(0)
  })

  it('counts each deviation once', () => {
    expect(countActiveFilters({ state: 'closed', labels: ['a', 'b'], assignee: '@me', sort: 'created' })).toBe(5)
  })
})
