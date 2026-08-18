import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Outbox } from '../outbox'
import type { OutboxOp } from '../outbox-types'

const api = vi.hoisted(() => ({
  createIssue: vi.fn(),
  updateIssue: vi.fn(),
  createComment: vi.fn(),
  addSubIssue: vi.fn(),
  removeSubIssue: vi.fn(),
}))

vi.mock('../github/api', () => api)

/**
 * Each test gets its own module registry and an empty IndexedDB. The error
 * classes come from that same fresh registry — `instanceof` across two
 * registries is false, which would quietly disable the outbox's own
 * permanent-vs-transient classification.
 */
async function freshOutbox(): Promise<{
  outbox: Outbox
  GitHubError: typeof import('../github/client').GitHubError
  NetworkError: typeof import('../github/client').NetworkError
}> {
  const { closeDb } = await import('../db')
  await closeDb()
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('github-tasks')
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('deleteDatabase blocked'))
  })
  vi.resetModules()
  const [{ outbox }, client] = await Promise.all([import('../outbox'), import('../github/client')])
  return { outbox, GitHubError: client.GitHubError, NetworkError: client.NetworkError }
}

const createOp = (title: string): OutboxOp => ({
  kind: 'createIssue',
  repo: 'acme/app',
  input: { title },
})

beforeEach(() => {
  vi.clearAllMocks()
  api.createIssue.mockResolvedValue({ databaseId: 42, number: 7 })
  api.updateIssue.mockResolvedValue({})
  api.createComment.mockResolvedValue({})
  api.addSubIssue.mockResolvedValue(undefined)
  api.removeSubIssue.mockResolvedValue(undefined)
})

describe('outbox', () => {
  it('persists queued ops and reports the pending count', async () => {
    const { outbox } = await freshOutbox()
    await outbox.enqueue(createOp('one'))
    await outbox.enqueue(createOp('two'))

    expect(outbox.pendingCount).toBe(2)
    expect(outbox.getSnapshot().map((e) => e.status)).toEqual(['pending', 'pending'])
  })

  it('replays entries in the order they were queued', async () => {
    const { outbox } = await freshOutbox()
    await outbox.enqueue(createOp('first'))
    await outbox.enqueue({ kind: 'comment', repo: 'acme/app', number: 7, body: 'hi' })

    const result = await outbox.flush('t0ken')

    expect(result.applied).toBe(2)
    expect(api.createIssue).toHaveBeenCalledBefore(api.createComment)
    expect(outbox.getSnapshot()).toHaveLength(0)
  })

  it('links a newly created issue to its parent after creating it', async () => {
    const { outbox } = await freshOutbox()
    await outbox.enqueue({
      kind: 'createIssue',
      repo: 'acme/app',
      input: { title: 'child' },
      parent: { repo: 'acme/app', number: 3 },
    })

    await outbox.flush('t0ken')

    expect(api.addSubIssue).toHaveBeenCalledWith('t0ken', 'acme/app', 3, 42)
  })

  it('stops the run when the connection drops, leaving the rest queued', async () => {
    const { outbox, NetworkError } = await freshOutbox()
    api.createIssue.mockRejectedValueOnce(new NetworkError())
    await outbox.enqueue(createOp('one'))
    await outbox.enqueue(createOp('two'))

    const result = await outbox.flush('t0ken')

    expect(result.interrupted).toBe(true)
    expect(result.applied).toBe(0)
    expect(outbox.pendingCount).toBe(2)
  })

  it('parks a permanently rejected entry and carries on with the rest', async () => {
    const { outbox, GitHubError } = await freshOutbox()
    api.createIssue.mockRejectedValueOnce(new GitHubError(422, 'Validation failed'))
    await outbox.enqueue(createOp('bad'))
    await outbox.enqueue({ kind: 'comment', repo: 'acme/app', number: 7, body: 'hi' })

    const result = await outbox.flush('t0ken')

    expect(result.failed).toBe(1)
    expect(result.applied).toBe(1)
    const remaining = outbox.getSnapshot()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].status).toBe('failed')
    expect(remaining[0].lastError).toBe('Validation failed')
  })

  it('gives a transient server error another chance on the next flush', async () => {
    const { outbox, GitHubError } = await freshOutbox()
    api.createIssue.mockRejectedValueOnce(new GitHubError(502, 'Bad gateway'))
    await outbox.enqueue(createOp('one'))

    await outbox.flush('t0ken')
    expect(outbox.getSnapshot()[0].status).toBe('pending')
    expect(outbox.getSnapshot()[0].attempts).toBe(1)

    const second = await outbox.flush('t0ken')
    expect(second.applied).toBe(1)
    expect(outbox.getSnapshot()).toHaveLength(0)
  })

  it('gives up on an entry that keeps failing', async () => {
    const { outbox, GitHubError } = await freshOutbox()
    api.createIssue.mockRejectedValue(new GitHubError(500, 'boom'))
    await outbox.enqueue(createOp('one'))

    await outbox.flush('t0ken')
    await outbox.flush('t0ken')
    await outbox.flush('t0ken')

    expect(outbox.getSnapshot()[0].status).toBe('failed')
  })

  it('can retry a parked entry', async () => {
    const { outbox, GitHubError } = await freshOutbox()
    api.createIssue.mockRejectedValueOnce(new GitHubError(422, 'nope'))
    const entry = await outbox.enqueue(createOp('one'))
    await outbox.flush('t0ken')
    expect(outbox.getSnapshot()[0].status).toBe('failed')

    await outbox.retry(entry.id)
    expect(outbox.getSnapshot()[0].status).toBe('pending')
    expect(outbox.getSnapshot()[0].lastError).toBeUndefined()

    await outbox.flush('t0ken')
    expect(outbox.getSnapshot()).toHaveLength(0)
  })

  it('discards failed entries on request', async () => {
    const { outbox, GitHubError } = await freshOutbox()
    api.createIssue.mockRejectedValue(new GitHubError(404, 'gone'))
    await outbox.enqueue(createOp('one'))
    await outbox.flush('t0ken')

    await outbox.clearFailed()
    expect(outbox.getSnapshot()).toHaveLength(0)
  })

  it('shares a single run between concurrent flush calls', async () => {
    const { outbox } = await freshOutbox()
    await outbox.enqueue(createOp('one'))

    const [a, b] = await Promise.all([outbox.flush('t0ken'), outbox.flush('t0ken')])

    expect(api.createIssue).toHaveBeenCalledTimes(1)
    expect(a).toBe(b)
  })

  it('notifies subscribers when the queue changes', async () => {
    const { outbox } = await freshOutbox()
    const seen: number[] = []
    const unsubscribe = outbox.subscribe(() => seen.push(outbox.getSnapshot().length))

    await outbox.enqueue(createOp('one'))
    await outbox.flush('t0ken')
    unsubscribe()

    expect(seen).toContain(1)
    expect(seen.at(-1)).toBe(0)
  })

  it('reloads what was queued in a previous session', async () => {
    const { outbox: first } = await freshOutbox()
    await first.enqueue(createOp('survives'))

    // A new module instance, same IndexedDB — as after an app restart.
    vi.resetModules()
    const { outbox: reloaded } = await import('../outbox')
    await reloaded.load()

    expect(reloaded.getSnapshot().map((e) => (e.op as { input: { title: string } }).input.title)).toEqual(['survives'])
  })
})
