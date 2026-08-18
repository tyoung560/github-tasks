import { useEffect, useState } from 'react'

/**
 * Delays a fast-changing value — typing in a search field — so it does not
 * turn every keystroke into a GitHub search request.
 */
export function useDebounced<T>(value: T, delayMs = 300): T {
  const [settled, setSettled] = useState(value)

  useEffect(() => {
    const id = setTimeout(() => setSettled(value), delayMs)
    return () => clearTimeout(id)
  }, [value, delayMs])

  return settled
}
