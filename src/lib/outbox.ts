import { db } from './db'
import { addSubIssue, createComment, createIssue, removeSubIssue, updateIssue } from './github/api'
import { GitHubError, NetworkError } from './github/client'
import type { OutboxEntry, OutboxOp } from './outbox-types'

export interface FlushResult {
  applied: number
  failed: number
  /** True when the run stopped early because the network went away again. */
  interrupted: boolean
  /** Repos touched, so callers know which queries to invalidate. */
  repos: string[]
}

let counter = 0
function nextId(): string {
  counter += 1
  return `ob_${Date.now().toString(36)}_${counter.toString(36)}`
}

/**
 * Durable queue of writes made while offline.
 *
 * Entries replay strictly in creation order: a comment added to an issue that
 * was itself created offline must not overtake the create. A permanent failure
 * (401/404/422) parks that one entry as `failed` and the queue carries on; a
 * network failure stops the run so nothing is retried against a dead link.
 */
export class Outbox {
  private entries: OutboxEntry[] = []
  private listeners = new Set<() => void>()
  private ready: Promise<void> | null = null
  private flushing: Promise<FlushResult> | null = null

  load(): Promise<void> {
    if (!this.ready) {
      this.ready = (async () => {
        const rows = await (await db()).getAllFromIndex('outbox', 'createdAt')
        this.entries = rows
        this.emit()
      })()
    }
    return this.ready
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    void this.load()
    return () => this.listeners.delete(fn)
  }

  getSnapshot = (): OutboxEntry[] => this.entries

  get pendingCount(): number {
    return this.entries.filter((e) => e.status === 'pending').length
  }

  private emit() {
    // A new array identity is what tells useSyncExternalStore something changed.
    this.entries = [...this.entries].sort((a, b) => a.createdAt - b.createdAt)
    for (const fn of this.listeners) fn()
  }

  async enqueue(op: OutboxOp): Promise<OutboxEntry> {
    await this.load()
    const entry: OutboxEntry = { id: nextId(), op, createdAt: Date.now(), attempts: 0, status: 'pending' }
    await (await db()).put('outbox', entry)
    this.entries.push(entry)
    this.emit()
    return entry
  }

  async remove(id: string): Promise<void> {
    await (await db()).delete('outbox', id)
    this.entries = this.entries.filter((e) => e.id !== id)
    this.emit()
  }

  async clearFailed(): Promise<void> {
    const failed = this.entries.filter((e) => e.status === 'failed')
    const tx = (await db()).transaction('outbox', 'readwrite')
    await Promise.all(failed.map((e) => tx.store.delete(e.id)))
    await tx.done
    this.entries = this.entries.filter((e) => e.status !== 'failed')
    this.emit()
  }

  async retry(id: string): Promise<void> {
    const entry = this.entries.find((e) => e.id === id)
    if (!entry) return
    const next: OutboxEntry = { ...entry, status: 'pending', lastError: undefined }
    await (await db()).put('outbox', next)
    this.entries = this.entries.map((e) => (e.id === id ? next : e))
    this.emit()
  }

  private async update(entry: OutboxEntry, patch: Partial<OutboxEntry>): Promise<void> {
    const next = { ...entry, ...patch }
    await (await db()).put('outbox', next)
    this.entries = this.entries.map((e) => (e.id === entry.id ? next : e))
    this.emit()
  }

  /** Replays every pending entry. Concurrent calls share one run. */
  flush(token: string): Promise<FlushResult> {
    if (this.flushing) return this.flushing
    this.flushing = this.run(token).finally(() => {
      this.flushing = null
    })
    return this.flushing
  }

  private async run(token: string): Promise<FlushResult> {
    await this.load()
    const result: FlushResult = { applied: 0, failed: 0, interrupted: false, repos: [] }
    const repos = new Set<string>()

    for (const entry of this.entries.filter((e) => e.status === 'pending')) {
      try {
        await applyOp(token, entry.op)
        repos.add(entry.op.repo)
        await this.remove(entry.id)
        result.applied += 1
      } catch (err) {
        if (err instanceof NetworkError) {
          result.interrupted = true
          break
        }
        const message = err instanceof Error ? err.message : String(err)
        const permanent = err instanceof GitHubError && err.isPermanent
        await this.update(entry, {
          attempts: entry.attempts + 1,
          lastError: message,
          status: permanent || entry.attempts + 1 >= 3 ? 'failed' : 'pending',
        })
        result.failed += 1
        if (!permanent) {
          // Something transient on GitHub's side — stop and let the next flush retry.
          result.interrupted = true
          break
        }
      }
    }

    result.repos = [...repos]
    return result
  }
}

async function applyOp(token: string, op: OutboxOp): Promise<void> {
  switch (op.kind) {
    case 'createIssue': {
      const created = await createIssue(token, op.repo, op.input)
      if (op.parent) {
        await addSubIssue(token, op.parent.repo, op.parent.number, created.databaseId)
      }
      return
    }
    case 'updateIssue':
      await updateIssue(token, op.repo, op.number, op.patch)
      return
    case 'comment':
      await createComment(token, op.repo, op.number, op.body)
      return
    case 'addSubIssue':
      await addSubIssue(token, op.repo, op.parentNumber, op.child.databaseId)
      return
    case 'removeSubIssue':
      await removeSubIssue(token, op.repo, op.parentNumber, op.child.databaseId)
      return
  }
}

export const outbox = new Outbox()
