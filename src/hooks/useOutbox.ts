import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { outbox } from '@/lib/outbox'
import { opTargetKey, pendingIssues, type OutboxEntry, type PendingIssue } from '@/lib/outbox-types'
import { useAuth } from '@/state/auth'
import { useOnline } from './useOnline'

const AUTO_FLUSH_COOLDOWN_MS = 10_000

export interface OutboxView {
  entries: OutboxEntry[]
  pending: number
  failed: number
  /** Issue keys ("owner/name#12") with a queued write against them. */
  pendingKeys: Set<string>
  /** Issues created offline, shown in lists until they reach GitHub. */
  creates: PendingIssue[]
  flush: () => Promise<void>
  retry: (id: string) => Promise<void>
  discard: (id: string) => Promise<void>
  discardFailed: () => Promise<void>
}

export function useOutbox(): OutboxView {
  const entries = useSyncExternalStore(outbox.subscribe, outbox.getSnapshot, outbox.getSnapshot)
  const { token } = useAuth()
  const online = useOnline()
  const queryClient = useQueryClient()

  const flush = useCallback(async () => {
    if (!token) return
    const result = await outbox.flush(token)
    if (result.applied > 0) {
      // A replayed write can touch anything; a blanket invalidate is cheap
      // relative to getting a stale tree wrong.
      await queryClient.invalidateQueries()
    }
  }, [token, queryClient])

  // Drain automatically when the connection comes back. Every flush mutates
  // the queue, which re-runs this effect — the cooldown keeps a server-side
  // error from turning that into a tight retry loop.
  const lastAutoFlush = useRef(0)
  useEffect(() => {
    if (!online || !token) return
    if (!entries.some((e) => e.status === 'pending')) return
    const now = Date.now()
    if (now - lastAutoFlush.current < AUTO_FLUSH_COOLDOWN_MS) return
    lastAutoFlush.current = now
    void flush()
  }, [online, token, entries, flush])

  const pendingKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const entry of entries) {
      const key = opTargetKey(entry.op)
      if (key) keys.add(key)
    }
    return keys
  }, [entries])

  const creates = useMemo(() => pendingIssues(entries), [entries])

  return {
    entries,
    creates,
    pending: entries.filter((e) => e.status === 'pending').length,
    failed: entries.filter((e) => e.status === 'failed').length,
    pendingKeys,
    flush,
    retry: (id) => outbox.retry(id),
    discard: (id) => outbox.remove(id),
    discardFailed: () => outbox.clearFailed(),
  }
}
