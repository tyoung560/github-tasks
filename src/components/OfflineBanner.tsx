import { Link } from 'react-router-dom'
import { IconOffline, IconSync } from './Icon'
import { useOnline } from '@/hooks/useOnline'
import { useOutbox } from '@/hooks/useOutbox'

/**
 * One strip that answers both "am I looking at stale data?" and "did my last
 * change actually go through?" — the two questions an offline-capable app has
 * to keep answering.
 */
export function OfflineBanner() {
  const online = useOnline()
  const { pending, failed } = useOutbox()

  if (online && pending === 0 && failed === 0) return null

  const [tone, icon, text] = !online
    ? (['bg-warn/15 text-warn', <IconOffline key="o" size={14} />, pending > 0 ? `Offline · ${pending} change${pending === 1 ? '' : 's'} queued` : 'Offline · showing saved data'] as const)
    : failed > 0
      ? (['bg-danger/15 text-danger', <IconSync key="f" size={14} />, `${failed} change${failed === 1 ? '' : 's'} could not sync`] as const)
      : (['bg-accent/15 text-accent', <IconSync key="s" size={14} />, `Syncing ${pending} change${pending === 1 ? '' : 's'}…`] as const)

  return (
    <Link
      to="/settings/pending"
      className={`pad-safe-top sticky top-0 z-50 flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-semibold ${tone}`}
    >
      {icon}
      {text}
    </Link>
  )
}
