import { describe, expect, it } from 'vitest'
import { mapIssueDetail, mapIssueNode, mapRestIssue, mapSummary, repoFromApiUrl } from '../github/map'
import type { GqlIssueCard, GqlIssueDetail, RestIssue } from '../github/map'

function card(over: Partial<GqlIssueCard> = {}): GqlIssueCard {
  return {
    id: 'I_1',
    databaseId: 1001,
    number: 1,
    title: 'Parent',
    state: 'OPEN',
    stateReason: null,
    url: 'https://github.com/acme/app/issues/1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    repository: { nameWithOwner: 'acme/app' },
    author: { login: 'ada', avatarUrl: 'https://a/ada' },
    assignees: { nodes: [{ login: 'grace', avatarUrl: 'https://a/grace' }] },
    labels: { nodes: [{ name: 'bug', color: 'd73a4a', description: null }] },
    comments: { totalCount: 2 },
    subIssuesSummary: null,
    parent: null,
    ...over,
  }
}

describe('mapSummary', () => {
  it('is null when an issue has no children', () => {
    expect(mapSummary({ total: 0, completed: 0, percentCompleted: 0 })).toBeNull()
    expect(mapSummary(null)).toBeNull()
  })

  it('carries GitHub’s percentage through unchanged', () => {
    expect(mapSummary({ total: 3, completed: 1, percentCompleted: 33 })).toEqual({
      total: 3,
      completed: 1,
      percent: 33,
    })
  })
})

describe('mapIssueNode', () => {
  it('maps nested children recursively', () => {
    const node = mapIssueNode(
      card({
        subIssuesSummary: { total: 1, completed: 0, percentCompleted: 0 },
        subIssues: { nodes: [card({ id: 'I_2', number: 2, title: 'Child' })] },
      }),
    )

    expect(node.children).toHaveLength(1)
    expect(node.children[0].title).toBe('Child')
    expect(node.hasUnloadedChildren).toBe(false)
  })

  it('flags a branch whose children were not returned', () => {
    const node = mapIssueNode(card({ subIssuesSummary: { total: 40, completed: 0, percentCompleted: 0 } }))
    expect(node.hasUnloadedChildren).toBe(true)
  })

  it('drops nulls that GraphQL returns for inaccessible nodes', () => {
    const node = mapIssueNode(card({ subIssues: { nodes: [null, card({ number: 3 })] } }))
    expect(node.children.map((c) => c.number)).toEqual([3])
  })

  it('keeps the parent link', () => {
    const node = mapIssueNode(
      card({ parent: { number: 7, title: 'Epic', state: 'OPEN', repository: { nameWithOwner: 'acme/app' } } }),
    )
    expect(node.parent).toEqual({ number: 7, title: 'Epic', state: 'OPEN', repo: 'acme/app' })
  })
})

describe('mapIssueDetail', () => {
  it('splits the payload into the issue and its comments', () => {
    const raw: GqlIssueDetail = {
      ...card(),
      body: '**hi**',
      bodyHTML: '<p><strong>hi</strong></p>',
      closedAt: null,
      milestone: { number: 2, title: 'v1', dueOn: null, state: 'OPEN' },
      // Aliased in the query so it does not collide with the fragment's own
      // argument-free `comments` selection.
      issueComments: {
        totalCount: 1,
        nodes: [
          {
            id: 'C_1',
            databaseId: 5,
            body: 'nice',
            bodyHTML: '<p>nice</p>',
            createdAt: '2026-01-03T00:00:00Z',
            author: { login: 'grace', avatarUrl: 'https://a/grace' },
          },
        ],
      },
    }

    const { issue, comments } = mapIssueDetail(raw)
    expect(issue.milestone).toEqual({ number: 2, title: 'v1', dueOn: null, state: 'open' })
    expect(issue.body).toBe('**hi**')
    // Count comes from the fragment's `comments`, bodies from the alias.
    expect(issue.commentCount).toBe(2)
    expect(comments).toHaveLength(1)
    expect(comments[0].author?.login).toBe('grace')
  })
})

describe('mapRestIssue', () => {
  const raw: RestIssue = {
    id: 900,
    node_id: 'I_9',
    number: 9,
    title: 'From REST',
    body: null,
    state: 'closed',
    state_reason: 'not_planned',
    html_url: 'https://github.com/acme/app/issues/9',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    closed_at: '2026-01-02T00:00:00Z',
    comments: 0,
    user: { login: 'ada', avatar_url: 'https://a/ada' },
    labels: ['bug', { name: 'p1', color: 'ff0000', description: 'urgent' }],
    sub_issues_summary: { total: 2, completed: 1, percent_completed: 50 },
  }

  it('normalises state and state reason to the GraphQL spelling', () => {
    const issue = mapRestIssue(raw, 'acme/app')
    expect(issue.state).toBe('CLOSED')
    expect(issue.stateReason).toBe('NOT_PLANNED')
  })

  it('accepts labels in both string and object form', () => {
    expect(mapRestIssue(raw, 'acme/app').labels.map((l) => l.name)).toEqual(['bug', 'p1'])
  })

  it('maps the sub-issue summary', () => {
    expect(mapRestIssue(raw, 'acme/app').subIssues).toEqual({ total: 2, completed: 1, percent: 50 })
  })

  it('reports no parent, because REST does not return one', () => {
    expect(mapRestIssue(raw, 'acme/app').parent).toBeNull()
  })
})

describe('repoFromApiUrl', () => {
  it('extracts owner/name', () => {
    expect(repoFromApiUrl('https://api.github.com/repos/acme/app')).toBe('acme/app')
  })

  it('is null for anything else', () => {
    expect(repoFromApiUrl(undefined)).toBeNull()
    expect(repoFromApiUrl('https://api.github.com/user')).toBeNull()
  })
})
