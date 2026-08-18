import { onlineManager } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'

/** Live online/offline flag, shared with TanStack Query's own notion of it. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => onlineManager.subscribe(cb),
    () => onlineManager.isOnline(),
    () => true,
  )
}
