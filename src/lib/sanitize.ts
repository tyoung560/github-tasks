/**
 * Allowlist sanitiser for the HTML GitHub renders for issue and comment bodies.
 *
 * GitHub already strips dangerous markup server-side; this is defence in depth
 * so a change on their side — or a cached response from somewhere else — cannot
 * turn into script execution in the app.
 */

const ALLOWED_TAGS = new Set([
  'a', 'b', 'blockquote', 'br', 'code', 'col', 'colgroup', 'dd', 'del', 'details', 'div', 'dl', 'dt',
  'em', 'g-emoji', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'input', 'ins', 'kbd', 'li',
  'ol', 'p', 'picture', 'pre', 'q', 's', 'samp', 'section', 'source', 'span', 'strike', 'strong',
  'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul', 'var',
])

const GLOBAL_ATTRS = new Set(['class', 'title', 'dir', 'lang'])

const TAG_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'rel', 'target']),
  img: new Set(['src', 'alt', 'width', 'height', 'loading']),
  source: new Set(['srcset', 'media', 'type']),
  input: new Set(['type', 'checked', 'disabled']),
  td: new Set(['colspan', 'rowspan', 'align']),
  th: new Set(['colspan', 'rowspan', 'align', 'scope']),
  col: new Set(['span', 'width']),
  ol: new Set(['start', 'reversed']),
  details: new Set(['open']),
}

const SAFE_URL = /^(https?:|mailto:|#|\/)/i
/** Control characters can smuggle a `javascript:` scheme past a naive prefix test. */
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/

function safeUrl(value: string): boolean {
  const trimmed = value.trim()
  if (CONTROL_CHARS.test(trimmed)) return false
  return SAFE_URL.test(trimmed)
}

const DROP_ENTIRELY = new Set(['script', 'style', 'iframe', 'object', 'embed', 'form', 'template'])

/**
 * Returns HTML containing only allowlisted tags and attributes. Disallowed
 * elements are unwrapped (their text survives) rather than dropped, so no
 * prose silently disappears; markup-only elements are removed outright.
 */
export function sanitizeHtml(html: string): string {
  if (!html) return ''
  if (typeof DOMParser === 'undefined') return ''

  const doc = new DOMParser().parseFromString(`<div id="__root">${html}</div>`, 'text/html')
  const root = doc.getElementById('__root')
  if (!root) return ''

  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      const tag = child.tagName.toLowerCase()

      if (DROP_ENTIRELY.has(tag)) {
        child.remove()
        continue
      }

      if (!ALLOWED_TAGS.has(tag)) {
        const parent = child.parentNode
        walk(child)
        while (child.firstChild) parent?.insertBefore(child.firstChild, child)
        child.remove()
        continue
      }

      const allowed = TAG_ATTRS[tag]
      for (const attr of Array.from(child.attributes)) {
        const name = attr.name.toLowerCase()
        const ok = (GLOBAL_ATTRS.has(name) || Boolean(allowed?.has(name))) && !name.startsWith('on')
        if (!ok) {
          child.removeAttribute(attr.name)
          continue
        }
        if ((name === 'href' || name === 'src' || name === 'srcset') && !safeUrl(attr.value)) {
          child.removeAttribute(attr.name)
        }
      }

      if (tag === 'a') {
        child.setAttribute('rel', 'noopener noreferrer nofollow')
        child.setAttribute('target', '_blank')
      }
      if (tag === 'input') {
        // Task-list checkboxes render read-only; editing happens in the body editor.
        child.setAttribute('disabled', '')
      }

      walk(child)
    }
  }

  walk(root)
  return root.innerHTML
}

/** Plain-text preview of a markdown body, for list rows and search results. */
export function plainPreview(markdown: string, maxLength = 140): string {
  const text = markdown
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+\[[ xX]]\s*/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/[*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text
}
