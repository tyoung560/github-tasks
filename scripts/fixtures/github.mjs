/**
 * Canned GraphQL responses used by the smoke script, so the whole UI can be
 * exercised — including the sub-issue tree and progress roll-up — without a
 * token or a network round trip.
 */

const user = (login) => ({ login, avatarUrl: `https://avatars.githubusercontent.com/${login}` })

const LABELS = {
  bug: { name: 'bug', color: 'd73a4a', description: "Something isn't working" },
  ux: { name: 'ux', color: '1d76db', description: null },
}

const card = (n, title, over = {}) => ({
  id: `I_${n}`,
  databaseId: n * 10,
  number: n,
  title,
  state: 'OPEN',
  stateReason: null,
  url: `https://github.com/acme/app/issues/${n}`,
  createdAt: '2026-08-01T10:00:00Z',
  updatedAt: '2026-08-17T10:00:00Z',
  repository: { nameWithOwner: 'acme/app' },
  author: user('ada'),
  assignees: { nodes: [user('ada')] },
  labels: { nodes: [] },
  comments: { totalCount: 0 },
  subIssuesSummary: null,
  parent: null,
  ...over,
})

const listNodes = [
  card(101, 'Rebuild the onboarding flow for first-run users', {
    labels: { nodes: [LABELS.ux] },
    comments: { totalCount: 4 },
    subIssuesSummary: { total: 5, completed: 3, percentCompleted: 60 },
  }),
  card(102, 'Crash when opening a repo with no issues enabled', {
    labels: { nodes: [LABELS.bug] },
    comments: { totalCount: 2 },
  }),
  card(103, 'Draft tables', {
    parent: { number: 101, title: 'Rebuild the onboarding flow', state: 'OPEN', repository: { nameWithOwner: 'acme/app' } },
  }),
  card(104, 'Add offline queue indicator to the header', {
    subIssuesSummary: { total: 3, completed: 3, percentCompleted: 100 },
  }),
]

const issueDetail = {
  ...card(101, 'Rebuild the onboarding flow for first-run users', {
    labels: { nodes: [LABELS.ux] },
    comments: { totalCount: 1 },
    subIssuesSummary: { total: 3, completed: 1, percentCompleted: 33 },
  }),
  body: 'The current flow drops people straight into an empty inbox.',
  bodyHTML:
    '<p>The current flow drops people straight into an empty inbox. We want a three-step path:</p>' +
    '<ul class="contains-task-list"><li><input type="checkbox" checked disabled> pick repos</li>' +
    '<li><input type="checkbox" disabled> import templates</li></ul>',
  closedAt: null,
  milestone: { number: 1, title: 'v1.0', dueOn: '2026-09-01T00:00:00Z', state: 'OPEN' },
  comments: {
    totalCount: 1,
    nodes: [
      {
        id: 'C1',
        databaseId: 1,
        body: 'Agreed.',
        bodyHTML: '<p>Agreed — the empty state is doing too much work.</p>',
        createdAt: '2026-08-16T09:00:00Z',
        author: user('grace'),
      },
    ],
  },
  subIssues: {
    nodes: [
      card(201, 'Repo picker screen', {
        state: 'CLOSED',
        stateReason: 'COMPLETED',
        subIssuesSummary: { total: 2, completed: 2, percentCompleted: 100 },
        subIssues: {
          nodes: [card(301, 'Search field', { state: 'CLOSED' }), card(302, 'Recent repos list', { state: 'CLOSED' })],
        },
      }),
      card(202, 'Template import step', {
        subIssuesSummary: { total: 2, completed: 0, percentCompleted: 0 },
        subIssues: { nodes: [card(303, 'Bundle default templates'), card(304, 'Preview before import')] },
      }),
      card(203, 'Welcome tour copy'),
    ],
  },
}

const repository = {
  nameWithOwner: 'acme/app',
  description: 'A sample repository',
  isPrivate: false,
  hasIssuesEnabled: true,
  pushedAt: '2026-08-17T00:00:00Z',
  viewerCanPush: true,
  issues: { totalCount: 42 },
  labels: { nodes: [LABELS.bug, LABELS.ux] },
  milestones: { nodes: [{ number: 1, title: 'v1.0', dueOn: '2026-09-01T00:00:00Z', state: 'OPEN' }] },
  assignableUsers: { nodes: [user('ada'), user('grace')] },
}

/** Routes a GraphQL document to its canned response by operation name. */
export function respondTo(query) {
  if (query.includes('query Viewer')) {
    return { data: { viewer: { login: 'ada', name: 'Ada Lovelace', avatarUrl: user('ada').avatarUrl } } }
  }
  if (query.includes('query IssueDetail')) return { data: { repository: { issue: issueDetail } } }
  if (query.includes('query SearchIssues')) {
    return {
      data: {
        search: { issueCount: 42, pageInfo: { hasNextPage: false, endCursor: null }, nodes: listNodes },
      },
    }
  }
  if (query.includes('query RepoMeta')) return { data: { repository } }
  if (query.includes('query RecentRepos')) return { data: { viewer: { repositories: { nodes: [repository] } } } }
  if (query.includes('query SearchRepos')) return { data: { search: { nodes: [repository] } } }
  if (query.includes('query SubIssues')) return { data: { repository: { issue: { subIssues: { nodes: [] } } } } }
  return { data: {} }
}
