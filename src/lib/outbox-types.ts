import type { CreateIssueInput, UpdateIssueInput } from './github/api'

export interface ChildRef {
  repo: string
  number: number
  /** Numeric database id — what the sub-issue endpoints expect. */
  databaseId: number
  title?: string
}

export type OutboxOp =
  | {
      kind: 'createIssue'
      repo: string
      input: CreateIssueInput
      /** When set, the created issue is linked under this parent on replay. */
      parent?: { repo: string; number: number }
    }
  | { kind: 'updateIssue'; repo: string; number: number; patch: UpdateIssueInput; title?: string }
  | { kind: 'comment'; repo: string; number: number; body: string }
  | { kind: 'addSubIssue'; repo: string; parentNumber: number; child: ChildRef }
  | { kind: 'removeSubIssue'; repo: string; parentNumber: number; child: ChildRef }

export type OutboxStatus = 'pending' | 'failed'

export interface OutboxEntry {
  id: string
  op: OutboxOp
  createdAt: number
  attempts: number
  status: OutboxStatus
  lastError?: string
}

/** One-line description shown in the pending-changes list. */
export function describeOp(op: OutboxOp): string {
  switch (op.kind) {
    case 'createIssue':
      return `New issue “${op.input.title}” in ${op.repo}`
    case 'updateIssue': {
      const fields = Object.keys(op.patch)
      const what =
        op.patch.state === 'closed'
          ? 'Close'
          : op.patch.state === 'open'
            ? 'Reopen'
            : `Update ${fields.join(', ')} on`
      return `${what} ${op.repo}#${op.number}`
    }
    case 'comment':
      return `Comment on ${op.repo}#${op.number}`
    case 'addSubIssue':
      return `Link ${op.child.repo}#${op.child.number} under ${op.repo}#${op.parentNumber}`
    case 'removeSubIssue':
      return `Unlink ${op.child.repo}#${op.child.number} from ${op.repo}#${op.parentNumber}`
  }
}

/** The issue a queued op targets, for badging list rows as "pending". */
export function opTargetKey(op: OutboxOp): string | null {
  switch (op.kind) {
    case 'createIssue':
      return null
    case 'updateIssue':
    case 'comment':
      return `${op.repo}#${op.number}`
    case 'addSubIssue':
    case 'removeSubIssue':
      return `${op.repo}#${op.parentNumber}`
  }
}

/**
 * Renders queued `createIssue` ops as issues so they show up in lists straight
 * away, flagged `pending`. Negative numbers keep them out of the way of real
 * issue numbers and make them obviously not-yet-real.
 */
export function pendingIssues(entries: OutboxEntry[], repo?: string): PendingIssue[] {
  return entries
    .filter((e): e is OutboxEntry & { op: Extract<OutboxOp, { kind: 'createIssue' }> } => e.op.kind === 'createIssue')
    .filter((e) => !repo || e.op.repo === repo)
    .map((e, i) => ({
      id: e.id,
      databaseId: 0,
      number: -(i + 1),
      title: e.op.input.title,
      state: 'OPEN' as const,
      stateReason: null,
      url: '',
      repo: e.op.repo,
      createdAt: new Date(e.createdAt).toISOString(),
      updatedAt: new Date(e.createdAt).toISOString(),
      author: null,
      assignees: [],
      labels: (e.op.input.labels ?? []).map((name) => ({ name, color: 'ededed', description: null })),
      commentCount: 0,
      subIssues: null,
      parent: e.op.parent ? { number: e.op.parent.number, title: '', state: 'OPEN' as const, repo: e.op.parent.repo } : null,
      pending: true as const,
      failed: e.status === 'failed',
    }))
}

export interface PendingIssue {
  id: string
  databaseId: number
  number: number
  title: string
  state: 'OPEN'
  stateReason: null
  url: string
  repo: string
  createdAt: string
  updatedAt: string
  author: null
  assignees: never[]
  labels: { name: string; color: string; description: null }[]
  commentCount: number
  subIssues: null
  parent: { number: number; title: string; state: 'OPEN'; repo: string } | null
  pending: true
  failed: boolean
}
