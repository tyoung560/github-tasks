import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getViewer } from '@/lib/github/api'
import { GitHubError } from '@/lib/github/client'
import { clearCachedData } from '@/lib/db'
import { readJson, readString, writeJson, writeString } from '@/lib/storage'
import type { Viewer } from '@/lib/github/types'

const TOKEN_KEY = 'gh-tasks.token'
const VIEWER_KEY = 'gh-tasks.viewer'

export type AuthStatus = 'anonymous' | 'checking' | 'ready' | 'invalid'

interface AuthValue {
  token: string | null
  viewer: Viewer | null
  status: AuthStatus
  error: string | null
  signIn: (token: string) => Promise<void>
  signOut: () => Promise<void>
  /** Re-checks a stored token, e.g. after coming back online. */
  revalidate: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => readString(TOKEN_KEY))
  // A cached viewer keeps the app usable offline on a cold start.
  const [viewer, setViewer] = useState<Viewer | null>(() => readJson<Viewer | null>(VIEWER_KEY, null))
  const [status, setStatus] = useState<AuthStatus>(() => (readString(TOKEN_KEY) ? 'checking' : 'anonymous'))
  const [error, setError] = useState<string | null>(null)

  const verify = useCallback(async (candidate: string) => {
    setStatus('checking')
    setError(null)
    try {
      const next = await getViewer(candidate)
      setViewer(next)
      writeJson(VIEWER_KEY, next)
      setStatus('ready')
    } catch (err) {
      if (err instanceof GitHubError && err.isAuth) {
        setStatus('invalid')
        setError(err.message)
        return
      }
      // Offline or GitHub having a bad day: trust the stored token for now.
      setStatus(readJson<Viewer | null>(VIEWER_KEY, null) ? 'ready' : 'invalid')
      setError(err instanceof Error ? err.message : 'Could not reach GitHub')
    }
  }, [])

  useEffect(() => {
    if (token) void verify(token)
  }, [token, verify])

  const signIn = useCallback(
    async (candidate: string) => {
      const trimmed = candidate.trim()
      setStatus('checking')
      setError(null)
      try {
        const next = await getViewer(trimmed)
        writeString(TOKEN_KEY, trimmed)
        writeJson(VIEWER_KEY, next)
        setToken(trimmed)
        setViewer(next)
        setStatus('ready')
      } catch (err) {
        setStatus('anonymous')
        setError(
          err instanceof GitHubError
            ? err.message
            : 'Could not reach GitHub. Check your connection and try again.',
        )
        throw err
      }
    },
    [],
  )

  const signOut = useCallback(async () => {
    writeString(TOKEN_KEY, null)
    writeString(VIEWER_KEY, null)
    setToken(null)
    setViewer(null)
    setStatus('anonymous')
    setError(null)
    await clearCachedData()
  }, [])

  const revalidate = useCallback(async () => {
    if (token) await verify(token)
  }, [token, verify])

  const value = useMemo<AuthValue>(
    () => ({ token, viewer, status, error, signIn, signOut, revalidate }),
    [token, viewer, status, error, signIn, signOut, revalidate],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/** For code paths that only run once signed in. */
export function useToken(): string {
  const { token } = useAuth()
  if (!token) throw new Error('No GitHub token available')
  return token
}
