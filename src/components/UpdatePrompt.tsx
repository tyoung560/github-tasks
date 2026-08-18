import { useRegisterSW } from 'virtual:pwa-register/react'
import { IconSync } from './Icon'

/** Offers the new build rather than swapping it in mid-task. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true })

  if (!needRefresh) return null

  return (
    <div
      className="fixed inset-x-3 z-[70] flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 shadow-lg"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 5.25rem)' }}
      role="status"
    >
      <IconSync size={16} className="shrink-0 text-accent" />
      <span className="flex-1 text-sm">A new version is ready.</span>
      <button
        type="button"
        className="rounded-lg bg-accent px-2.5 py-1 text-sm font-semibold text-accent-ink"
        onClick={() => void updateServiceWorker(true)}
      >
        Reload
      </button>
      <button type="button" className="px-1 text-sm text-muted" onClick={() => setNeedRefresh(false)}>
        Later
      </button>
    </div>
  )
}
