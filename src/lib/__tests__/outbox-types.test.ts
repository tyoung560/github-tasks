import { describe, expect, it } from 'vitest'
import { describeOp, opTargetKey, pendingIssues, type OutboxEntry, type OutboxOp } from '../outbox-types'

const child = { repo: 'acme/app', number: 9, databaseId: 900 }

const entry = (op: OutboxOp, over: Partial<OutboxEntry> = {}): OutboxEntry => ({
  id: 'e1',
  op,
  createdAt: Date.parse('2026-03-04T09:00:00Z'),
  attempts: 0,
  status: 'pending',
  ...over,
})

describe('describeOp', () => {
  it('names a queued issue', () => {
    expect(describeOp({ kind: 'createIssue', repo: 'acme/app', input: { title: 'Fix login' } })).toBe(
      'New issue “Fix login” in acme/app',
    )
  })

  it('reads close and reopen as verbs rather than field lists', () => {
    expect(describeOp({ kind: 'updateIssue', repo: 'acme/app', number: 3, patch: { state: 'closed' } })).toBe(
      'Close acme/app#3',
    )
    expect(describeOp({ kind: 'updateIssue', repo: 'acme/app', number: 3, patch: { state: 'open' } })).toBe(
      'Reopen acme/app#3',
    )
  })

  it('lists the changed fields for other edits', () => {
    expect(describeOp({ kind: 'updateIssue', repo: 'acme/app', number: 3, patch: { labels: ['bug'] } })).toBe(
      'Update labels on acme/app#3',
    )
  })

  it('describes link and unlink', () => {
    expect(describeOp({ kind: 'addSubIssue', repo: 'acme/app', parentNumber: 1, child })).toBe(
      'Link acme/app#9 under acme/app#1',
    )
    expect(describeOp({ kind: 'removeSubIssue', repo: 'acme/app', parentNumber: 1, child })).toBe(
      'Unlink acme/app#9 from acme/app#1',
    )
  })
})

describe('opTargetKey', () => {
  it('points at the issue a write will change', () => {
    expect(opTargetKey({ kind: 'comment', repo: 'acme/app', number: 4, body: 'x' })).toBe('acme/app#4')
    expect(opTargetKey({ kind: 'addSubIssue', repo: 'acme/app', parentNumber: 1, child })).toBe('acme/app#1')
  })

  it('has no target for an issue that does not exist yet', () => {
    expect(opTargetKey({ kind: 'createIssue', repo: 'acme/app', input: { title: 'x' } })).toBeNull()
  })
})

describe('pendingIssues', () => {
  const entries = [
    entry({ kind: 'createIssue', repo: 'acme/app', input: { title: 'One', labels: ['bug'] } }),
    entry({ kind: 'createIssue', repo: 'acme/api', input: { title: 'Two' } }, { id: 'e2' }),
    entry({ kind: 'comment', repo: 'acme/app', number: 1, body: 'x' }, { id: 'e3' }),
  ]

  it('projects only the queued creates', () => {
    expect(pendingIssues(entries).map((i) => i.title)).toEqual(['One', 'Two'])
  })

  it('can be scoped to one repo', () => {
    expect(pendingIssues(entries, 'acme/api').map((i) => i.title)).toEqual(['Two'])
  })

  it('marks them pending with numbers that cannot collide with real issues', () => {
    const [first] = pendingIssues(entries)
    expect(first.pending).toBe(true)
    expect(first.number).toBeLessThan(0)
    expect(first.labels).toEqual([{ name: 'bug', color: 'ededed', description: null }])
  })

  it('keeps the parent link so a queued sub-issue still reads as one', () => {
    const withParent = [
      entry({
        kind: 'createIssue',
        repo: 'acme/app',
        input: { title: 'Child' },
        parent: { repo: 'acme/app', number: 5 },
      }),
    ]
    expect(pendingIssues(withParent)[0].parent).toMatchObject({ number: 5, repo: 'acme/app' })
  })

  it('flags entries that already failed', () => {
    const failed = [entry({ kind: 'createIssue', repo: 'acme/app', input: { title: 'x' } }, { status: 'failed' })]
    expect(pendingIssues(failed)[0].failed).toBe(true)
  })
})
