import { describe, expect, it } from 'vitest'
import { plainPreview, sanitizeHtml } from '../sanitize'

describe('sanitizeHtml', () => {
  it('keeps ordinary GitHub markup intact', () => {
    const html = '<p>Hello <strong>world</strong> <code>x</code></p>'
    expect(sanitizeHtml(html)).toBe(html)
  })

  it('removes script elements and their contents', () => {
    const out = sanitizeHtml('<p>safe</p><script>alert(1)</script>')
    expect(out).toContain('safe')
    expect(out).not.toContain('alert')
  })

  it('removes style, iframe, object and form wholesale', () => {
    for (const tag of ['style', 'iframe', 'object', 'form']) {
      expect(sanitizeHtml(`<${tag}>x</${tag}>`)).toBe('')
    }
  })

  it('strips inline event handlers', () => {
    const out = sanitizeHtml('<a href="https://example.com" onclick="steal()">go</a>')
    expect(out).not.toContain('onclick')
    expect(out).toContain('https://example.com')
  })

  it('drops javascript: hrefs but keeps the link text', () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">click</a>')
    expect(out).not.toContain('javascript:')
    expect(out).toContain('click')
  })

  it('rejects a javascript: scheme hidden behind a control character', () => {
    const smuggled = `java${String.fromCharCode(9)}script:alert(1)`
    const out = sanitizeHtml(`<a href="${smuggled}">click</a>`)
    expect(out).not.toMatch(/href=/)
  })

  it('allows http, mailto, anchors and relative urls', () => {
    for (const href of ['https://a.test/x', 'http://a.test', 'mailto:a@b.test', '#frag', '/rel']) {
      expect(sanitizeHtml(`<a href="${href}">x</a>`)).toContain(href)
    }
  })

  it('forces external links to open safely', () => {
    const out = sanitizeHtml('<a href="https://a.test">x</a>')
    expect(out).toContain('rel="noopener noreferrer nofollow"')
    expect(out).toContain('target="_blank"')
  })

  it('unwraps unknown elements rather than deleting their text', () => {
    expect(sanitizeHtml('<marquee>keep me</marquee>')).toBe('keep me')
    expect(sanitizeHtml('<custom-thing><p>nested</p></custom-thing>')).toBe('<p>nested</p>')
  })

  it('disables task-list checkboxes', () => {
    const out = sanitizeHtml('<input type="checkbox" checked>')
    expect(out).toContain('disabled')
  })

  it('blocks data: image sources', () => {
    const out = sanitizeHtml('<img src="data:text/html,<script>alert(1)</script>" alt="x">')
    expect(out).not.toContain('data:')
    expect(out).toContain('alt="x"')
  })

  it('keeps only allowlisted attributes', () => {
    // Wrapped in a real table: a bare <td> is discarded by the HTML parser itself.
    const out = sanitizeHtml('<table><tr><td colspan="2" style="color:red" data-x="1">c</td></tr></table>')
    expect(out).toContain('colspan="2"')
    expect(out).not.toContain('style')
    expect(out).not.toContain('data-x')
  })

  it('returns empty for empty input', () => {
    expect(sanitizeHtml('')).toBe('')
  })
})

describe('plainPreview', () => {
  it('flattens markdown to a single line', () => {
    expect(plainPreview('# Title\n\nSome **bold** text')).toBe('Title Some bold text')
  })

  it('drops fenced code, images and html comments', () => {
    expect(plainPreview('a\n```js\nconst x = 1\n```\n![img](x.png)\n<!-- hidden -->b')).toBe('a b')
  })

  it('keeps link text but not the target', () => {
    expect(plainPreview('see [the docs](https://example.com)')).toBe('see the docs')
  })

  it('strips task-list markers', () => {
    expect(plainPreview('- [ ] first\n- [x] second')).toBe('first second')
  })

  it('truncates with an ellipsis', () => {
    const out = plainPreview('x'.repeat(200), 20)
    expect(out).toHaveLength(20)
    expect(out.endsWith('…')).toBe(true)
  })
})
