import { describe, expect, it } from 'vitest'
import { collectDescendantKeys, directProgress, flattenTree, rollup, rollupMany, summaryProgress } from '../progress'
import type { IssueNode } from '../github/types'

function node({ number, ...over }: Partial<IssueNode> & { number: number }): IssueNode {
  return {
    id: `n${number}`,
    databaseId: number * 100,
    number,
    title: `Issue ${number}`,
    state: 'OPEN',
    stateReason: null,
    url: '',
    repo: 'acme/app',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    author: null,
    assignees: [],
    labels: [],
    commentCount: 0,
    subIssues: null,
    parent: null,
    children: [],
    hasUnloadedChildren: false,
    ...over,
  }
}

describe('directProgress', () => {
  it('uses GitHub’s own counts', () => {
    expect(directProgress({ total: 4, completed: 1, percent: 25 })).toEqual({
      total: 4,
      completed: 1,
      percent: 25,
      depth: 1,
      partial: false,
    })
  })

  it('treats a childless issue as having no progress', () => {
    expect(directProgress(null).total).toBe(0)
    expect(directProgress({ total: 0, completed: 0, percent: 0 }).total).toBe(0)
  })
})

describe('rollup', () => {
  it('counts every descendant, not just direct children', () => {
    const tree = node({
      number: 1,
      subIssues: { total: 2, completed: 0, percent: 0 },
      children: [
        node({
          number: 2,
          subIssues: { total: 2, completed: 2, percent: 100 },
          children: [node({ number: 4, state: 'CLOSED' }), node({ number: 5, state: 'CLOSED' })],
        }),
        node({ number: 3 }),
      ],
    })

    // 4 descendants (2, 3, 4, 5), two of them closed.
    expect(rollup(tree)).toMatchObject({ total: 4, completed: 2, percent: 50, depth: 2, partial: false })
  })

  it('reports 100% only when every descendant is closed', () => {
    const tree = node({
      number: 1,
      children: [node({ number: 2, state: 'CLOSED', children: [node({ number: 3, state: 'OPEN' })] })],
    })
    expect(rollup(tree).percent).toBe(50)
  })

  it('falls back to GitHub’s counts for branches it has not loaded', () => {
    const tree = node({
      number: 1,
      subIssues: { total: 5, completed: 3, percent: 60 },
      hasUnloadedChildren: true,
      children: [node({ number: 2, state: 'CLOSED' })],
    })

    const result = rollup(tree)
    expect(result.total).toBe(5)
    expect(result.completed).toBe(3)
    expect(result.partial).toBe(true)
  })

  it('never reports more completed than total when counts disagree', () => {
    const tree = node({
      number: 1,
      subIssues: { total: 2, completed: 2, percent: 100 },
      hasUnloadedChildren: true,
      children: [node({ number: 2, state: 'OPEN' })],
    })
    const result = rollup(tree)
    expect(result.completed).toBeLessThanOrEqual(result.total)
  })

  it('is empty for a leaf', () => {
    expect(rollup(node({ number: 9 })).total).toBe(0)
  })
})

describe('rollupMany', () => {
  it('counts the top-level issues themselves as well as their children', () => {
    const result = rollupMany([
      node({ number: 1, state: 'CLOSED' }),
      node({ number: 2, children: [node({ number: 3, state: 'CLOSED' })] }),
    ])
    // Nodes 1, 2, 3 → two closed.
    expect(result).toMatchObject({ total: 3, completed: 2, percent: 67 })
  })
})

describe('summaryProgress', () => {
  it('rounds GitHub’s percentage rather than recomputing it', () => {
    expect(summaryProgress({ subIssues: { total: 3, completed: 1, percent: 33.333 } })?.percent).toBe(33)
  })

  it('returns null when there are no children', () => {
    expect(summaryProgress({ subIssues: null })).toBeNull()
  })
})

describe('tree helpers', () => {
  const tree = [node({ number: 1, children: [node({ number: 2, children: [node({ number: 3 })] })] })]

  it('flattens depth-first with indent levels', () => {
    expect(flattenTree(tree).map((r) => [r.node.number, r.depth])).toEqual([
      [1, 0],
      [2, 1],
      [3, 2],
    ])
  })

  it('collects descendant keys so cycles can be blocked', () => {
    expect([...collectDescendantKeys(tree)]).toEqual(['acme/app#1', 'acme/app#2', 'acme/app#3'])
  })
})
