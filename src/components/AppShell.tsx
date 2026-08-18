import { NavLink, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { IconGear, IconInbox, IconPlus, IconRepo } from './Icon'
import { OfflineBanner } from './OfflineBanner'

const TABS = [
  { to: '/', label: 'Inbox', icon: IconInbox, end: true },
  { to: '/repos', label: 'Repos', icon: IconRepo, end: false },
  { to: '/settings', label: 'Settings', icon: IconGear, end: false },
]

/** Hide the tab bar on screens that own the full viewport. */
const FULLSCREEN = [/^\/i\//, /^\/new/]

export function AppShell({ children, onQuickAdd }: { children: ReactNode; onQuickAdd: () => void }) {
  const { pathname } = useLocation()
  const immersive = FULLSCREEN.some((re) => re.test(pathname))

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <OfflineBanner />
      <main className={`min-h-0 flex-1 ${immersive ? '' : 'pb-[calc(env(safe-area-inset-bottom)+4.25rem)]'}`}>
        {children}
      </main>

      {!immersive && (
        <>
          <button
            type="button"
            onClick={onQuickAdd}
            aria-label="New issue"
            className="fixed right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-ink shadow-lg transition-transform active:scale-95"
            style={{ bottom: 'calc(env(safe-area-inset-bottom) + 5rem)' }}
          >
            <IconPlus size={24} />
          </button>

          <nav
            className="pad-safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-canvas/95 backdrop-blur"
            aria-label="Primary"
          >
            <ul className="mx-auto flex max-w-lg">
              {TABS.map(({ to, label, icon: Icon, end }) => (
                <li key={to} className="flex-1">
                  <NavLink
                    to={to}
                    end={end}
                    className={({ isActive }) =>
                      `flex h-14 flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-medium transition-colors ${
                        isActive ? 'text-accent' : 'text-faint'
                      }`
                    }
                  >
                    <Icon size={22} />
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </>
      )}
    </div>
  )
}

/** Sticky screen header with an optional trailing control. */
export function ScreenHeader({
  title,
  subtitle,
  trailing,
  leading,
}: {
  title: ReactNode
  subtitle?: ReactNode
  trailing?: ReactNode
  leading?: ReactNode
}) {
  return (
    <header className="pad-safe-top sticky top-0 z-20 border-b border-line bg-canvas/95 backdrop-blur">
      <div className="flex items-center gap-2 px-4 py-2.5">
        {leading}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg leading-tight font-bold">{title}</h1>
          {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
        </div>
        {trailing}
      </div>
    </header>
  )
}
