import { useMemo } from 'react'
import { sanitizeHtml } from '@/lib/sanitize'

/**
 * Renders the HTML GitHub already produced for a body, after a local
 * allowlist pass. Doing it this way means task lists, mentions, emoji and
 * cross-references all look exactly as they do on github.com without shipping
 * a markdown parser.
 */
export function Markdown({ html, fallback }: { html: string; fallback?: string }) {
  const clean = useMemo(() => sanitizeHtml(html), [html])

  if (!clean.trim()) {
    return fallback ? (
      <p className="prose-gh whitespace-pre-wrap text-muted">{fallback}</p>
    ) : (
      <p className="text-sm text-faint italic">No description.</p>
    )
  }
  return <div className="prose-gh" dangerouslySetInnerHTML={{ __html: clean }} />
}
