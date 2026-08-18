import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconX } from './Icon'

interface Props {
  open: boolean
  onClose: () => void
  title?: string
  /** Rendered on the right of the header — usually a confirm action. */
  action?: ReactNode
  children: ReactNode
  /** Full-height sheet for editors; otherwise it hugs its content. */
  tall?: boolean
}

/**
 * Bottom sheet. Everything modal in the app uses one: on a phone a sheet is
 * reachable with the thumb, where a centred dialog is not.
 */
export function Sheet({ open, onClose, title, action, children, tall }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)

    // Lock the page behind the sheet so iOS does not scroll it under the panel.
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Close"
        className="animate-fade absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`animate-in-up relative flex flex-col rounded-t-2xl border-t border-line bg-canvas outline-none ${
          tall ? 'h-[92dvh]' : 'max-h-[88dvh]'
        }`}
        style={{ boxShadow: 'var(--shadow-sheet)' }}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 pt-2 pb-2">
          <div className="absolute inset-x-0 top-1.5 mx-auto h-1 w-9 rounded-full bg-line-strong" aria-hidden="true" />
          <button
            type="button"
            onClick={onClose}
            className="tap -ml-1 flex w-11 items-center justify-center rounded-xl text-muted"
            aria-label="Close"
          >
            <IconX size={18} />
          </button>
          <h2 className="min-w-0 flex-1 truncate text-center text-[0.9375rem] font-semibold">{title}</h2>
          <div className="flex min-w-11 justify-end">{action}</div>
        </div>
        <div className="pad-safe-bottom min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

/** Tappable row used inside pickers. */
export function SheetRow({
  children,
  onClick,
  selected,
  destructive,
}: {
  children: ReactNode
  onClick?: () => void
  selected?: boolean
  destructive?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`tap flex w-full items-center gap-3 border-b border-line px-4 text-left text-[0.9375rem] active:bg-surface-2 ${
        destructive ? 'text-danger' : ''
      } ${selected ? 'bg-surface' : ''}`}
    >
      {children}
    </button>
  )
}
