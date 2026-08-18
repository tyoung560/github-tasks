/** GraphQL documents. Reads go through GraphQL so a whole issue tree is one round trip. */

export const ISSUE_CARD_FRAGMENT = /* GraphQL */ `
  fragment IssueCard on Issue {
    id
    databaseId
    number
    title
    state
    stateReason
    url
    createdAt
    updatedAt
    repository {
      nameWithOwner
    }
    author {
      login
      avatarUrl
    }
    assignees(first: 5) {
      nodes {
        login
        avatarUrl
      }
    }
    labels(first: 10) {
      nodes {
        name
        color
        description
      }
    }
    comments {
      totalCount
    }
    subIssuesSummary {
      total
      completed
      percentCompleted
    }
    parent {
      number
      title
      state
      repository {
        nameWithOwner
      }
    }
  }
`

export const VIEWER_QUERY = /* GraphQL */ `
  query Viewer {
    viewer {
      login
      name
      avatarUrl
    }
  }
`

/**
 * One request returns the issue, its comments and three levels of the sub-issue
 * tree (self → children → grandchildren). Deeper levels are fetched on demand
 * when a node is expanded.
 */
export const ISSUE_DETAIL_QUERY = /* GraphQL */ `
  ${ISSUE_CARD_FRAGMENT}
  query IssueDetail($owner: String!, $name: String!, $number: Int!, $comments: Int!) {
    repository(owner: $owner, name: $name) {
      issue(number: $number) {
        ...IssueCard
        body
        bodyHTML
        closedAt
        milestone {
          number
          title
          dueOn
          state
        }
        comments(first: $comments) {
          totalCount
          nodes {
            id
            databaseId
            body
            bodyHTML
            createdAt
            author {
              login
              avatarUrl
            }
          }
        }
        subIssues(first: 50) {
          nodes {
            ...IssueCard
            subIssues(first: 30) {
              nodes {
                ...IssueCard
              }
            }
          }
        }
      }
    }
  }
`

/** Children of one node, used when expanding past the depth the detail query loads. */
export const SUB_ISSUES_QUERY = /* GraphQL */ `
  ${ISSUE_CARD_FRAGMENT}
  query SubIssues($owner: String!, $name: String!, $number: Int!) {
    repository(owner: $owner, name: $name) {
      issue(number: $number) {
        subIssues(first: 50) {
          nodes {
            ...IssueCard
            subIssues(first: 30) {
              nodes {
                ...IssueCard
              }
            }
          }
        }
      }
    }
  }
`

/**
 * Search backs every list in the app — the cross-repo inbox and per-repo lists
 * differ only by the qualifiers in `q`.
 */
export const SEARCH_ISSUES_QUERY = /* GraphQL */ `
  ${ISSUE_CARD_FRAGMENT}
  query SearchIssues($q: String!, $first: Int!, $after: String) {
    search(type: ISSUE, query: $q, first: $first, after: $after) {
      issueCount
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        ... on Issue {
          ...IssueCard
        }
      }
    }
  }
`

export const REPO_META_QUERY = /* GraphQL */ `
  query RepoMeta($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      nameWithOwner
      description
      isPrivate
      hasIssuesEnabled
      pushedAt
      viewerCanPush
      issues(states: OPEN) {
        totalCount
      }
      labels(first: 100, orderBy: { field: NAME, direction: ASC }) {
        nodes {
          name
          color
          description
        }
      }
      milestones(first: 50, states: OPEN, orderBy: { field: DUE_DATE, direction: ASC }) {
        nodes {
          number
          title
          dueOn
          state
        }
      }
      assignableUsers(first: 60) {
        nodes {
          login
          avatarUrl
        }
      }
    }
  }
`

export const SEARCH_REPOS_QUERY = /* GraphQL */ `
  query SearchRepos($q: String!) {
    search(type: REPOSITORY, query: $q, first: 20) {
      nodes {
        ... on Repository {
          nameWithOwner
          description
          isPrivate
          hasIssuesEnabled
          pushedAt
          issues(states: OPEN) {
            totalCount
          }
        }
      }
    }
  }
`

export const RECENT_REPOS_QUERY = /* GraphQL */ `
  query RecentRepos {
    viewer {
      repositories(first: 30, orderBy: { field: PUSHED_AT, direction: DESC }, affiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER]) {
        nodes {
          nameWithOwner
          description
          isPrivate
          hasIssuesEnabled
          pushedAt
          issues(states: OPEN) {
            totalCount
          }
        }
      }
    }
  }
`
