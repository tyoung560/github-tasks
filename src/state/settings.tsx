import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { readJson, writeJson } from '@/lib/storage'
import { DEFAULT_TEMPLATES, type IssueTemplate } from '@/lib/templates'
import type { SortKey, StateFilter } from '@/lib/search'

const KEY = 'gh-tasks.settings'

export type ThemeChoice = 'system' | 'light' | 'dark'

export interface Settings {
  /** "owner/name" repos pinned to the Repos tab, in display order. */
  favorites: string[]
  /** Where quick-capture files an issue when no repo is in context. */
  defaultRepo: string | null
  templates: IssueTemplate[]
  theme: ThemeChoice
  /** Hide issues that are already a sub-issue of something, in repo lists. */
  hideSubIssuesInLists: boolean
  defaultState: StateFilter
  defaultSort: SortKey
  /** Roll child progress up through the whole tree rather than one level. */
  deepProgress: boolean
}

const DEFAULTS: Settings = {
  favorites: [],
  defaultRepo: null,
  templates: DEFAULT_TEMPLATES,
  theme: 'system',
  hideSubIssuesInLists: false,
  defaultState: 'open',
  defaultSort: 'updated',
  deepProgress: true,
}

interface SettingsValue extends Settings {
  update: (patch: Partial<Settings>) => void
  toggleFavorite: (repo: string) => void
  moveFavorite: (repo: string, direction: -1 | 1) => void
  upsertTemplate: (template: IssueTemplate) => void
  deleteTemplate: (id: string) => void
  resetTemplates: () => void
}

const SettingsContext = createContext<SettingsValue | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => ({ ...DEFAULTS, ...readJson<Partial<Settings>>(KEY, {}) }))

  useEffect(() => {
    writeJson(KEY, settings)
  }, [settings])

  // The theme choice drives `data-theme`, which the CSS variables key off.
  useEffect(() => {
    const root = document.documentElement
    if (settings.theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', settings.theme)
  }, [settings.theme])

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }))
  }, [])

  const toggleFavorite = useCallback((repo: string) => {
    setSettings((prev) => {
      const favorites = prev.favorites.includes(repo)
        ? prev.favorites.filter((r) => r !== repo)
        : [...prev.favorites, repo]
      // Dropping the default repo from favourites should not leave it dangling.
      const defaultRepo = favorites.includes(prev.defaultRepo ?? '') ? prev.defaultRepo : (favorites[0] ?? null)
      return { ...prev, favorites, defaultRepo }
    })
  }, [])

  const moveFavorite = useCallback((repo: string, direction: -1 | 1) => {
    setSettings((prev) => {
      const idx = prev.favorites.indexOf(repo)
      const target = idx + direction
      if (idx < 0 || target < 0 || target >= prev.favorites.length) return prev
      const favorites = [...prev.favorites]
      ;[favorites[idx], favorites[target]] = [favorites[target], favorites[idx]]
      return { ...prev, favorites }
    })
  }, [])

  const upsertTemplate = useCallback((template: IssueTemplate) => {
    setSettings((prev) => {
      const exists = prev.templates.some((t) => t.id === template.id)
      return {
        ...prev,
        templates: exists ? prev.templates.map((t) => (t.id === template.id ? template : t)) : [...prev.templates, template],
      }
    })
  }, [])

  const deleteTemplate = useCallback((id: string) => {
    setSettings((prev) => ({ ...prev, templates: prev.templates.filter((t) => t.id !== id) }))
  }, [])

  const resetTemplates = useCallback(() => {
    setSettings((prev) => ({ ...prev, templates: DEFAULT_TEMPLATES }))
  }, [])

  const value = useMemo<SettingsValue>(
    () => ({ ...settings, update, toggleFavorite, moveFavorite, upsertTemplate, deleteTemplate, resetTemplates }),
    [settings, update, toggleFavorite, moveFavorite, upsertTemplate, deleteTemplate, resetTemplates],
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings(): SettingsValue {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used inside <SettingsProvider>')
  return ctx
}
