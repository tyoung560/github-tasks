import { useState, type FormEvent } from 'react'
import { IconExternal } from '@/components/Icon'
import { Spinner } from '@/components/Bits'
import { useAuth } from '@/state/auth'

const NEW_TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new'

export function Onboarding() {
  const { signIn, error, status } = useAuth()
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!value.trim() || busy) return
    setBusy(true)
    try {
      await signIn(value)
    } catch {
      /* the provider surfaces the message */
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pad-safe-top mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-10">
      <div>
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface ring-1 ring-line">
          <svg width="30" height="30" viewBox="0 0 64 64" aria-hidden="true">
            <circle cx="32" cy="32" r="20" fill="none" stroke="var(--c-track)" strokeWidth="8" />
            <circle
              cx="32"
              cy="32"
              r="20"
              fill="none"
              stroke="var(--c-open)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray="85.5 125.7"
              transform="rotate(-90 32 32)"
            />
            <circle cx="32" cy="32" r="5.5" fill="var(--c-text)" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold">GitHub Tasks</h1>
        <p className="mt-2 text-sm text-muted">
          Capture issues fast, break them into sub-issues, and watch progress roll up. Everything runs on your device —
          your token is only ever sent to <span className="font-mono">api.github.com</span>.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm font-semibold" htmlFor="token">
          Personal access token
        </label>
        <input
          id="token"
          className="field font-mono text-sm"
          type="password"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="github_pat_… or ghp_…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />

        {error && status !== 'checking' && <p className="text-sm text-danger">{error}</p>}

        <button type="submit" className="btn btn-primary w-full" disabled={!value.trim() || busy}>
          {busy ? <Spinner size={16} /> : null}
          {busy ? 'Checking…' : 'Connect'}
        </button>
      </form>

      <details className="card p-4 text-sm">
        <summary className="cursor-pointer font-semibold">How do I make one?</summary>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-muted">
          <li>
            Open{' '}
            <a
              className="inline-flex items-center gap-1 text-accent underline"
              href={NEW_TOKEN_URL}
              target="_blank"
              rel="noreferrer"
            >
              fine-grained tokens <IconExternal size={12} />
            </a>{' '}
            on GitHub.
          </li>
          <li>Pick the repositories you want this app to see.</li>
          <li>
            Under <em>Repository permissions</em> grant <strong>Issues: Read and write</strong>. Metadata read-only is
            added for you.
          </li>
          <li>Generate the token and paste it above.</li>
        </ol>
        <p className="mt-3 text-xs text-faint">
          A classic token with the <span className="font-mono">repo</span> scope works too. The token is stored in this
          browser’s local storage — on a shared device, sign out when you are done.
        </p>
      </details>
    </div>
  )
}
