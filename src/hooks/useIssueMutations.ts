import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  addSubIssue,
  createComment,
  createIssue,
  removeSubIssue,
  updateIssue,
  type CreateIssueInput,
  type UpdateIssueInput,
} from '@/lib/github/api'
import { NetworkError } from '@/lib/github/client'
import { outbox } from '@/lib/outbox'
import type { ChildRef, OutboxOp } from '@/lib/outbox-types'
import type { Comment, IssueNode, IssueSummary } from '@/lib/github/types'
import { queryKeys } from '@/state/query'
import { useAuth } from '@/state/auth'
import { useOnline } from './useOnline'
import type { IssueDetailData } from './useGithub'

export interface MutationOutcome<T> {
  /** True when the write was parked in the outbox instead of sent. */
  queued: boolean
  result?: T
}

export interface IssueMutations {
  create: (repo: string, input: CreateIssueInput, parent?: { repo: string; number: number }) => Promise<MutationOutcome<IssueSummary>>
  patch: (repo: string, number: number, patch: UpdateIssueInput) => Promise<MutationOutcome<IssueSummary>>
  comment: (repo: string, number: number, body: string) => Promise<MutationOutcome<Comment>>
  linkChild: (parentRepo: string, parentNumber: number, child: ChildRef) => Promise<MutationOutcome<void>>
  unlinkChild: (parentRepo: string, parentNumber: number, child: ChildRef) => Promise<MutationOutcome<void>>
}

export function useIssueMutations(): IssueMutations {
  const { token } = useAuth()
  const online = useOnline()
  const queryClient = useQueryClient()

  /**
   * Sends the write when there is a connection, and falls back to the outbox
   * both when offline and when the request never reached GitHub. Anything
   * GitHub actually answered — a 403, a 422 — is thrown so the UI can explain it.
   */
  const send = useCallback(
    async <T,>(op: OutboxOp, perform: () => Promise<T>): Promise<MutationOutcome<T>> => {
      if (!token) throw new Error('Not signed in')
      if (!online) {
        await outbox.enqueue(op)
        return { queued: true }
      }
      try {
        return { queued: false, result: await perform() }
      } catch (err) {
        if (err instanceof NetworkError) {
          await outbox.enqueue(op)
          return { queued: true }
        }
        throw err
      }
    },
    [token, online],
  )

  const patchDetailCache = useCallback(
    (repo: string, number: number, fn: (data: IssueDetailData) => IssueDetailData) => {
      queryClient.setQueryData<IssueDetailData>(queryKeys.issue(repo, number), (prev) => (prev ? fn(prev) : prev))
    },
    [queryClient],
  )

  const create = useCallback<IssueMutations['create']>(
    async (repo, input, parent) => {
      const outcome = await send<IssueSummary>({ kind: 'createIssue', repo, input, parent }, async () => {
        const issue = await createIssue(token!, repo, input)
        if (parent) await addSubIssue(token!, parent.repo, parent.number, issue.databaseId)
        return issue
      })

      if (parent) await queryClient.invalidateQueries({ queryKey: queryKeys.issue(parent.repo, parent.number) })
      await queryClient.invalidateQueries({ queryKey: ['issues'] })
      return outcome
    },
    [send, token, queryClient],
  )

  const patch = useCallback<IssueMutations['patch']>(
    async (repo, number, changes) => {
      // Reflect the change immediately; a failed send rolls it back below.
      const snapshot = queryClient.getQueryData<IssueDetailData>(queryKeys.issue(repo, number))
      patchDetailCache(repo, number, (data) => ({ ...data, issue: applyPatch(data.issue, changes) }))

      try {
        const outcome = await send<IssueSummary>({ kind: 'updateIssue', repo, number, patch: changes }, () =>
          updateIssue(token!, repo, number, changes),
        )
        if (!outcome.queued) {
          await queryClient.invalidateQueries({ queryKey: queryKeys.issue(repo, number) })
        }
        await queryClient.invalidateQueries({ queryKey: ['issues'] })
        return outcome
      } catch (err) {
        if (snapshot) queryClient.setQueryData(queryKeys.issue(repo, number), snapshot)
        throw err
      }
    },
    [send, token, queryClient, patchDetailCache],
  )

  const comment = useCallback<IssueMutations['comment']>(
    async (repo, number, body) => {
      const outcome = await send<Comment>({ kind: 'comment', repo, number, body }, () =>
        createComment(token!, repo, number, body),
      )

      if (outcome.queued) {
        // Show the comment locally, marked pending, so the thread reads correctly.
        patchDetailCache(repo, number, (data) => ({
          ...data,
          comments: [...data.comments, pendingComment(body)],
          commentCount: data.commentCount + 1,
        }))
      } else {
        await queryClient.invalidateQueries({ queryKey: queryKeys.issue(repo, number) })
      }
      return outcome
    },
    [send, token, queryClient, patchDetailCache],
  )

  const linkChild = useCallback<IssueMutations['linkChild']>(
    async (parentRepo, parentNumber, child) => {
      const outcome = await send<void>(
        { kind: 'addSubIssue', repo: parentRepo, parentNumber, child },
        () => addSubIssue(token!, parentRepo, parentNumber, child.databaseId),
      )
      await queryClient.invalidateQueries({ queryKey: queryKeys.issue(parentRepo, parentNumber) })
      await queryClient.invalidateQueries({ queryKey: queryKeys.issue(child.repo, child.number) })
      return outcome
    },
    [send, token, queryClient],
  )

  const unlinkChild = useCallback<IssueMutations['unlinkChild']>(
    async (parentRepo, parentNumber, child) => {
      patchDetailCache(parentRepo, parentNumber, (data) => ({
        ...data,
        issue: {
          ...data.issue,
          children: data.issue.children.filter((c) => !(c.repo === child.repo && c.number === child.number)),
          subIssues: shrinkSummary(data.issue.children, data.issue.subIssues, child),
        },
      }))

      const outcome = await send<void>(
        { kind: 'removeSubIssue', repo: parentRepo, parentNumber, child },
        () => removeSubIssue(token!, parentRepo, parentNumber, child.databaseId),
      )
      if (!outcome.queued) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.issue(parentRepo, parentNumber) })
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.issue(child.repo, child.number) })
      return outcome
    },
    [send, token, queryClient, patchDetailCache],
  )

  return { create, patch, comment, linkChild, unlinkChild }
}

/* --------------------------- cache helpers --------------------------- */

function applyPatch<T extends IssueSummary & { body?: string; milestone?: unknown }>(
  issue: T,
  changes: UpdateIssueInput,
): T {
  const next = { ...issue }
  if (changes.title !== undefined) next.title = changes.title
  if (changes.body !== undefined) (next as { body?: string }).body = changes.body
  if (changes.state !== undefined) {
    next.state = changes.state === 'closed' ? 'CLOSED' : 'OPEN'
    next.stateReason =
      changes.state_reason === 'not_planned' ? 'NOT_PLANNED' : changes.state === 'closed' ? 'COMPLETED' : null
  }
  if (changes.labels !== undefined) {
    // Colours are unknown for a label added offline; keep any we already had.
    next.labels = changes.labels.map(
      (name) => issue.labels.find((l) => l.name === name) ?? { name, color: 'ededed', description: null },
    )
  }
  if (changes.assignees !== undefined) {
    next.assignees = changes.assignees.map(
      (login) => issue.assignees.find((a) => a.login === login) ?? { login, avatarUrl: avatarFor(login) },
    )
  }
  next.pending = true
  return next
}

function shrinkSummary(children: IssueNode[], summary: IssueSummary['subIssues'], child: ChildRef) {
  if (!summary) return null
  const removed = children.find((c) => c.repo === child.repo && c.number === child.number)
  const total = Math.max(0, summary.total - 1)
  const completed = Math.max(0, summary.completed - (removed?.state === 'CLOSED' ? 1 : 0))
  if (total === 0) return null
  return { total, completed, percent: Math.round((completed / total) * 100) }
}

function pendingComment(body: string): Comment {
  return {
    id: `pending-${Date.now()}`,
    databaseId: 0,
    author: null,
    body,
    bodyHtml: '',
    createdAt: new Date().toISOString(),
    pending: true,
  }
}

export function avatarFor(login: string): string {
  return `https://avatars.githubusercontent.com/${login}?s=80`
}
