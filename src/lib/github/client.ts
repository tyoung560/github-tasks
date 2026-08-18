import type { RateLimit } from './types'

export const API_ROOT = 'https://api.github.com'
export const API_VERSION = '2022-11-28'

export class GitHubError extends Error {
  readonly status: number
  readonly documentationUrl?: string
  readonly errors?: unknown

  constructor(status: number, message: string, opts?: { documentationUrl?: string; errors?: unknown }) {
    super(message)
    this.name = 'GitHubError'
    this.status = status
    this.documentationUrl = opts?.documentationUrl
    this.errors = opts?.errors
  }

  /** Retrying will not help: bad token, missing scope, gone, unprocessable. */
  get isPermanent(): boolean {
    return this.status === 401 || this.status === 403 || this.status === 404 || this.status === 410 || this.status === 422
  }

  get isAuth(): boolean {
    return this.status === 401
  }
}

/** Thrown when the device is offline or the request never reached GitHub. */
export class NetworkError extends Error {
  constructor(message = 'No connection to GitHub') {
    super(message)
    this.name = 'NetworkError'
  }
}

type RateListener = (r: RateLimit) => void
const rateListeners = new Set<RateListener>()
let lastRate: RateLimit | null = null

export function onRateLimit(fn: RateListener): () => void {
  rateListeners.add(fn)
  if (lastRate) fn(lastRate)
  return () => rateListeners.delete(fn)
}

function captureRate(res: Response) {
  const limit = res.headers.get('x-ratelimit-limit')
  const remaining = res.headers.get('x-ratelimit-remaining')
  const reset = res.headers.get('x-ratelimit-reset')
  if (!limit || !remaining || !reset) return
  lastRate = { limit: Number(limit), remaining: Number(remaining), resetAt: Number(reset) * 1000 }
  for (const fn of rateListeners) fn(lastRate)
}

function baseHeaders(token: string, accept: string): HeadersInit {
  return {
    Accept: accept,
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': API_VERSION,
  }
}

async function readError(res: Response): Promise<GitHubError> {
  let message = `${res.status} ${res.statusText}`
  let documentationUrl: string | undefined
  let errors: unknown
  try {
    const body = (await res.json()) as { message?: string; documentation_url?: string; errors?: unknown }
    if (body?.message) message = body.message
    documentationUrl = body?.documentation_url
    errors = body?.errors
  } catch {
    /* non-JSON error body */
  }
  if (res.status === 401) message = 'GitHub rejected the token. Check it has not expired or been revoked.'
  if (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0') {
    const reset = Number(res.headers.get('x-ratelimit-reset') ?? 0) * 1000
    const mins = Math.max(1, Math.ceil((reset - Date.now()) / 60000))
    message = `GitHub rate limit reached. Try again in about ${mins} minute${mins === 1 ? '' : 's'}.`
  }
  return new GitHubError(res.status, message, { documentationUrl, errors })
}

export interface RestOptions {
  method?: string
  body?: unknown
  /** Overrides the default `application/vnd.github+json`. */
  accept?: string
  signal?: AbortSignal
  query?: Record<string, string | number | boolean | undefined>
}

function withQuery(path: string, query?: RestOptions['query']): string {
  if (!query) return path
  const usp = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== '') usp.set(k, String(v))
  }
  const qs = usp.toString()
  return qs ? `${path}${path.includes('?') ? '&' : '?'}${qs}` : path
}

export async function rest<T>(token: string, path: string, opts: RestOptions = {}): Promise<T> {
  const url = path.startsWith('http') ? path : `${API_ROOT}${withQuery(path, opts.query)}`
  const headers: Record<string, string> = {
    ...(baseHeaders(token, opts.accept ?? 'application/vnd.github+json') as Record<string, string>),
  }
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'

  let res: Response
  try {
    res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: opts.signal,
    })
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err
    throw new NetworkError()
  }

  captureRate(res)
  if (!res.ok) throw await readError(res)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export interface GraphQLResponse<T> {
  data?: T
  errors?: Array<{ message: string; type?: string; path?: (string | number)[] }>
}

export async function graphql<T>(
  token: string,
  query: string,
  variables: Record<string, unknown> = {},
  signal?: AbortSignal,
): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_ROOT}/graphql`, {
      method: 'POST',
      headers: {
        ...(baseHeaders(token, 'application/json') as Record<string, string>),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
      signal,
    })
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err
    throw new NetworkError()
  }

  captureRate(res)
  if (!res.ok) throw await readError(res)

  const payload = (await res.json()) as GraphQLResponse<T>
  if (payload.errors?.length) {
    const notFound = payload.errors.some((e) => e.type === 'NOT_FOUND')
    throw new GitHubError(notFound ? 404 : 502, payload.errors.map((e) => e.message).join('; '))
  }
  if (!payload.data) throw new GitHubError(502, 'GitHub returned an empty GraphQL response')
  return payload.data
}

/** Follows `Link: rel="next"` until exhausted or `maxPages` is hit. */
export async function restPaged<T>(
  token: string,
  path: string,
  opts: RestOptions & { maxPages?: number } = {},
): Promise<T[]> {
  const maxPages = opts.maxPages ?? 5
  const out: T[] = []
  let url: string | null = `${API_ROOT}${withQuery(path, { per_page: 100, ...opts.query })}`

  for (let page = 0; url && page < maxPages; page++) {
    const res: Response = await fetch(url, {
      headers: baseHeaders(token, opts.accept ?? 'application/vnd.github+json'),
      signal: opts.signal,
    }).catch((err) => {
      if ((err as Error)?.name === 'AbortError') throw err
      throw new NetworkError()
    })
    captureRate(res)
    if (!res.ok) throw await readError(res)
    out.push(...((await res.json()) as T[]))
    url = nextPageUrl(res.headers.get('link'))
  }
  return out
}

export function nextPageUrl(link: string | null): string | null {
  if (!link) return null
  for (const part of link.split(',')) {
    const m = /<([^>]+)>\s*;\s*rel="next"/.exec(part.trim())
    if (m) return m[1]
  }
  return null
}
