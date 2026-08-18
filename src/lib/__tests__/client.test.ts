import { afterEach, describe, expect, it, vi } from 'vitest'
import { GitHubError, graphql, NetworkError, nextPageUrl, onRateLimit, rest } from '../github/client'

function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('nextPageUrl', () => {
  it('finds the next link among several relations', () => {
    const header = '<https://api.github.com/x?page=2>; rel="next", <https://api.github.com/x?page=9>; rel="last"'
    expect(nextPageUrl(header)).toBe('https://api.github.com/x?page=2')
  })

  it('is null on the last page', () => {
    expect(nextPageUrl('<https://api.github.com/x?page=1>; rel="prev"')).toBeNull()
    expect(nextPageUrl(null)).toBeNull()
  })
})

describe('rest', () => {
  it('sends the token and API version, and serialises the body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    await rest('t0ken', '/repos/acme/app/issues', { method: 'POST', body: { title: 'x' } })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.github.com/repos/acme/app/issues')
    expect(init.headers.Authorization).toBe('Bearer t0ken')
    expect(init.headers['X-GitHub-Api-Version']).toBe('2022-11-28')
    expect(init.body).toBe('{"title":"x"}')
  })

  it('appends query parameters and drops empty ones', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]))
    vi.stubGlobal('fetch', fetchMock)

    await rest('t', '/search', { query: { q: 'bug', page: 2, empty: '', missing: undefined } })

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.github.com/search?q=bug&page=2')
  })

  it('returns undefined for 204 responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))
    await expect(rest('t', '/x', { method: 'DELETE' })).resolves.toBeUndefined()
  })

  it('turns a fetch failure into a NetworkError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(rest('t', '/x')).rejects.toBeInstanceOf(NetworkError)
  })

  it('lets an abort propagate rather than reporting it as offline', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abort))
    await expect(rest('t', '/x')).rejects.toThrow('aborted')
  })

  it('explains a rejected token in plain language', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ message: 'Bad credentials' }, { status: 401 })))

    const error = (await rest('t', '/x').catch((e) => e)) as GitHubError
    expect(error).toBeInstanceOf(GitHubError)
    expect(error.isAuth).toBe(true)
    expect(error.message).toMatch(/token/i)
  })

  it('explains rate limiting with a wait time', async () => {
    const reset = Math.floor((Date.now() + 5 * 60_000) / 1000)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ message: 'API rate limit exceeded' }, {
          status: 403,
          headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) },
        }),
      ),
    )

    const error = (await rest('t', '/x').catch((e) => e)) as GitHubError
    expect(error.message).toMatch(/rate limit/i)
    expect(error.message).toMatch(/5 minutes/)
  })

  it('treats 4xx as permanent and 5xx as worth retrying', () => {
    expect(new GitHubError(404, 'x').isPermanent).toBe(true)
    expect(new GitHubError(422, 'x').isPermanent).toBe(true)
    expect(new GitHubError(500, 'x').isPermanent).toBe(false)
  })

  it('publishes rate-limit headers to subscribers', async () => {
    const seen: unknown[] = []
    const unsubscribe = onRateLimit((r) => seen.push(r))
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({}, {
          headers: { 'x-ratelimit-limit': '5000', 'x-ratelimit-remaining': '4321', 'x-ratelimit-reset': '1800000000' },
        }),
      ),
    )

    await rest('t', '/x')
    unsubscribe()

    expect(seen.at(-1)).toEqual({ limit: 5000, remaining: 4321, resetAt: 1800000000000 })
  })
})

describe('graphql', () => {
  it('posts the query and returns data', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { viewer: { login: 'ada' } } }))
    vi.stubGlobal('fetch', fetchMock)

    const data = await graphql<{ viewer: { login: string } }>('t', 'query{viewer{login}}', { a: 1 })

    expect(data.viewer.login).toBe('ada')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ query: 'query{viewer{login}}', variables: { a: 1 } })
  })

  it('raises GraphQL errors, mapping NOT_FOUND to a 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ errors: [{ message: 'Could not resolve', type: 'NOT_FOUND' }] })),
    )

    const error = (await graphql('t', 'q').catch((e) => e)) as GitHubError
    expect(error.status).toBe(404)
    expect(error.message).toBe('Could not resolve')
  })

  it('rejects an empty payload rather than returning undefined data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({})))
    await expect(graphql('t', 'q')).rejects.toThrow(/empty/i)
  })
})
