import type { IssueNode, IssueSummary, SubIssueSummary } from './github/types'

export interface Progress {
  /** Descendants counted (excludes the node itself). */
  total: number
  completed: number
  /** 0–100, rounded. 0 when there is nothing to complete. */
  percent: number
  /** Deepest level below the node that contributed to the count. */
  depth: number
  /** True when GitHub reports children the app has not loaded yet. */
  partial: boolean
}

export const EMPTY_PROGRESS: Progress = { total: 0, completed: 0, percent: 0, depth: 0, partial: false }

export function percentOf(completed: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((completed / total) * 100)
}

/** Progress straight from GitHub's own one-level-deep summary. */
export function directProgress(summary: SubIssueSummary | null | undefined): Progress {
  if (!summary || summary.total === 0) return EMPTY_PROGRESS
  return {
    total: summary.total,
    completed: summary.completed,
    percent: percentOf(summary.completed, summary.total),
    depth: 1,
    partial: false,
  }
}

/**
 * Rolls the whole loaded subtree into one number.
 *
 * Every descendant counts once, at any depth — so a parent with two children
 * that each have four children reads as 8 of 10, not 1 of 2. Where a branch has
 * children GitHub told us about but we have not loaded, its own summary counts
 * are used for that branch and the result is flagged `partial`.
 */
export function rollup(node: Pick<IssueNode, 'children' | 'subIssues' | 'hasUnloadedChildren'>): Progress {
  let total = 0
  let completed = 0
  let depth = 0
  let partial = false

  for (const child of node.children) {
    total += 1
    if (child.state === 'CLOSED') completed += 1

    const nested = rollup(child)
    if (nested.total > 0) {
      total += nested.total
      completed += nested.completed
      depth = Math.max(depth, nested.depth)
      partial ||= nested.partial
    }
  }
  depth += 1

  if (node.hasUnloadedChildren && node.subIssues) {
    // Trust GitHub's counts for the part of this level we could not see.
    const missing = Math.max(0, node.subIssues.total - node.children.length)
    if (missing > 0) {
      const seenCompleted = node.children.filter((c) => c.state === 'CLOSED').length
      total += missing
      completed += Math.max(0, Math.min(missing, node.subIssues.completed - seenCompleted))
      partial = true
    }
  }

  if (total === 0) return EMPTY_PROGRESS
  return { total, completed, percent: percentOf(completed, total), depth, partial }
}

/** Combined progress across a list of top-level issues (each issue counts too). */
export function rollupMany(nodes: IssueNode[]): Progress {
  let total = 0
  let completed = 0
  let depth = 0
  let partial = false

  for (const node of nodes) {
    total += 1
    if (node.state === 'CLOSED') completed += 1
    const nested = rollup(node)
    total += nested.total
    completed += nested.completed
    depth = Math.max(depth, nested.depth)
    partial ||= nested.partial
  }

  if (total === 0) return EMPTY_PROGRESS
  return { total, completed, percent: percentOf(completed, total), depth, partial }
}

/**
 * The number shown on a list row, where only GitHub's summary is available.
 * Falls back to the summary's own percentage so it never disagrees with github.com.
 */
export function summaryProgress(issue: Pick<IssueSummary, 'subIssues'>): Progress | null {
  if (!issue.subIssues || issue.subIssues.total === 0) return null
  const { total, completed, percent } = issue.subIssues
  return { total, completed, percent: Math.round(percent), depth: 1, partial: false }
}

/** Flattens a tree depth-first, tagging each node with its indent level. */
export function flattenTree(nodes: IssueNode[], depth = 0): Array<{ node: IssueNode; depth: number }> {
  const out: Array<{ node: IssueNode; depth: number }> = []
  for (const node of nodes) {
    out.push({ node, depth })
    if (node.children.length) out.push(...flattenTree(node.children, depth + 1))
  }
  return out
}

/** Guards against linking an issue under one of its own descendants. */
export function collectDescendantKeys(nodes: IssueNode[], into = new Set<string>()): Set<string> {
  for (const node of nodes) {
    into.add(`${node.repo}#${node.number}`)
    collectDescendantKeys(node.children, into)
  }
  return into
}
