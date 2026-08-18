import { useNavigate } from 'react-router-dom'
import { ScreenHeader } from '@/components/AppShell'
import { EmptyState, Spinner } from '@/components/Bits'
import { IconCheck, IconChevronLeft, IconSync, IconTrash } from '@/components/Icon'
import { useOutbox } from '@/hooks/useOutbox'
import { useOnline } from '@/hooks/useOnline'
import { describeOp } from '@/lib/outbox-types'
import { relativeTime } from '@/lib/time'

/** The queue, made visible. Nothing about offline writes should be a mystery. */
export function PendingChanges() {
  const navigate = useNavigate()
  const online = useOnline()
  const { entries, pending, failed, flush, retry, discard, discardFailed } = useOutbox()

  return (
    <>
      <ScreenHeader
        leading={
          <button
            type="button"
            onClick={() => navigate('/settings')}
            className="tap -ml-2 flex w-9 items-center justify-center rounded-xl text-muted"
            aria-label="Back to settings"
          >
            <IconChevronLeft size={20} />
          </button>
        }
        title="Pending changes"
        subtitle={online ? `${pending} queued · ${failed} failed` : 'Offline — nothing will send yet'}
        trailing={
          pending > 0 && online ? (
            <button
              type="button"
              onClick={() => void flush()}
              className="tap flex w-10 items-center justify-center rounded-xl text-accent"
              aria-label="Sync now"
            >
              <IconSync size={18} />
            </button>
          ) : null
        }
      />

      {entries.length === 0 ? (
        <EmptyState
          icon={<IconCheck size={34} />}
          title="Everything is synced"
          hint="Changes you make offline land here until they reach GitHub."
        />
      ) : (
        <ul>
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-start gap-3 border-b border-line px-4 py-3">
              <span className={`mt-1 ${entry.status === 'failed' ? 'text-danger' : 'text-accent'}`}>
                {entry.status === 'failed' ? <IconSync size={15} /> : <Spinner size={15} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm">{describeOp(entry.op)}</p>
                <p className="mt-0.5 text-xs text-faint">
                  {relativeTime(entry.createdAt)} ago
                  {entry.attempts > 0 ? ` · ${entry.attempts} attempt${entry.attempts === 1 ? '' : 's'}` : ''}
                </p>
                {entry.lastError && <p className="mt-1 text-xs text-danger">{entry.lastError}</p>}
                {entry.status === 'failed' && (
                  <button
                    type="button"
                    onClick={() => void retry(entry.id)}
                    className="mt-2 rounded-lg bg-surface-2 px-2.5 py-1 text-xs font-semibold"
                  >
                    Retry
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => void discard(entry.id)}
                className="tap flex w-9 items-center justify-center text-faint active:text-danger"
                aria-label="Discard"
              >
                <IconTrash size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {failed > 0 && (
        <div className="p-4">
          <button type="button" className="btn btn-danger w-full" onClick={() => void discardFailed()}>
            Discard {failed} failed change{failed === 1 ? '' : 's'}
          </button>
        </div>
      )}
    </>
  )
}
