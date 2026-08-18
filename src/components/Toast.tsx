import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { IconCheck, IconOffline, IconX } from './Icon'

type ToastKind = 'success' | 'error' | 'queued'

interface Toast {
  id: number
  kind: ToastKind
  message: string
}

interface ToastValue {
  show: (message: string, kind?: ToastKind) => void
}

const ToastContext = createContext<ToastValue | null>(null)

let nextId = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const show = useCallback((message: string, kind: ToastKind = 'success') => {
    const id = ++nextId
    setToasts((prev) => [...prev.slice(-2), { id, kind, message }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3200)
  }, [])

  const value = useMemo(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 z-[60] flex flex-col items-center gap-2 px-4"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 5.5rem)' }}
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="animate-in-up pointer-events-auto flex max-w-sm items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm shadow-lg"
          >
            <span className={t.kind === 'error' ? 'text-danger' : t.kind === 'queued' ? 'text-warn' : 'text-open'}>
              {t.kind === 'error' ? <IconX size={16} /> : t.kind === 'queued' ? <IconOffline size={16} /> : <IconCheck size={16} />}
            </span>
            <span className="min-w-0">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
