# GitHub Tasks

A mobile-first web app for working GitHub issues from a phone: capture new
issues in a couple of taps, break them into sub-issues, and see progress roll
up from the children to the parent.

It is a static, installable PWA. There is no server and no backend of any kind —
the app talks straight to `api.github.com` from the browser using a personal
access token you supply, and everything else (cache, settings, offline queue)
lives on the device.

<!-- Screenshots: run `npm run smoke` to regenerate into smoke-shots/ -->

## What it does

**Capture**
- A floating **+** on every list screen opens the composer with the keyboard on
  the title field. Type a line, tap Create.
- Quick-capture templates (Bug / Task / Idea / Sub-task by default, fully
  editable) prefill body, labels and assignees. Templates support
  `{{date}}`, `{{time}}`, `{{me}}`, `{{repo}}`, `{{parent}}`, `{{parentTitle}}`.
- Templates can be pinned to a single repo or offered everywhere.

**Sub-issues and progress**
- Uses GitHub's real sub-issue relationships (the `sub_issues` REST endpoints
  and the `subIssues` / `subIssuesSummary` GraphQL fields), not task-list
  checkboxes — so the hierarchy is the same one github.com shows.
- **Add → Create a new issue** files an issue and links it under the current one
  in a single step. **Add → Link an existing issue** searches the repo, with the
  current issue and all of its descendants filtered out so you cannot build a
  cycle.
- Every parent shows a progress ring. By default it is a *deep* roll-up: every
  descendant at any depth counts once, so a parent with two children that each
  have four children reads `8` total, not `2`. Turn that off in Settings to use
  GitHub's own one-level counts instead.
- Branches GitHub reports but the app has not loaded yet fall back to GitHub's
  counts and mark the ring as partial (dashed track).
- Tapping a sub-issue's state icon closes or reopens it inline.

**Triage**
- Cross-repo inbox: Assigned / Created / Mentions / Favourites, open or closed.
- Per-repo lists with search and filters (state, labels, assignee, milestone,
  sort, and "hide issues that are sub-issues").
- Edit title, description, labels, assignees and milestone; close as completed
  or not planned; reopen.
- Read the comment thread and post a comment.

**Offline**
- Every GitHub response is cached in IndexedDB, so lists and issues you have
  opened are readable with no connection.
- Writes made offline — new issues, edits, comments, links and unlinks — go into
  a durable outbox and replay in order when you reconnect. Creating an issue as
  a sub-issue replays as create-then-link, so the relationship survives.
- Settings → Pending changes shows the queue, the error on anything that failed,
  and lets you retry or discard.
- A permanent rejection (401/404/422) parks that one entry and the rest of the
  queue carries on; a network failure stops the run so nothing is fired into a
  dead link.

## Getting a token

1. Open <https://github.com/settings/personal-access-tokens/new>.
2. Choose the repositories the app should see.
3. Under **Repository permissions**, grant **Issues: Read and write**
   (Metadata: read-only is added automatically).
4. Generate it and paste it into the app.

A classic token with the `repo` scope also works.

**Where the token lives.** It is stored in this browser's `localStorage` and
sent only to `api.github.com`. Anything with script access to the page origin
can read it, so treat the app like any other place you would paste a token: use
a fine-grained token scoped to just the repos you need, and sign out on a shared
device (sign-out clears the token and every cached response).

## Running it

```bash
npm install
npm run dev          # http://localhost:5173
```

Other scripts:

| Script | What it does |
| --- | --- |
| `npm run build` | Typecheck and produce `dist/` |
| `npm run preview` | Serve the built app on :4173 |
| `npm test` | Unit and component tests (Vitest) |
| `npm run typecheck` | Types only |
| `npm run smoke` | Drives the built app in a phone-sized Chromium against canned GitHub responses, screenshots every screen into `smoke-shots/`, and fails on a console error or horizontal overflow |
| `npm run icons` | Regenerate the PWA icon set from `scripts/generate-icons.mjs` |

`npm run smoke` needs a preview server running and a Chromium: either
`npx playwright install chromium`, or point `CHROMIUM_PATH` at an existing one.

## Deploying

The build is a plain static bundle and routing is hash-based, so it works on any
static host with no rewrite rules.

- **Root domain** (Netlify, Cloudflare Pages, S3, …): `npm run build`, publish `dist/`.
- **GitHub Pages subpath**: `BASE_PATH=/<repo>/ npm run build`. The included
  `.github/workflows/deploy-pages.yml` does this — run it from the Actions tab
  once Pages is set to "GitHub Actions" in repository settings.

## Installing on iOS

Open the deployed URL in Safari → Share → **Add to Home Screen**. It launches
standalone, respects the notch and home indicator, and works offline. The app is
built as a PWA rather than a native app so there is nothing to sign or
distribute; if a real App Store build is ever wanted, the same bundle can be
wrapped with Capacitor without touching feature code.

## How it is put together

```
src/
  lib/
    github/        client (fetch, errors, rate limit) · queries · mappers · api
    progress.ts    sub-issue roll-up maths
    search.ts      GitHub search-query builder
    templates.ts   quick-capture templates and variable expansion
    sanitize.ts    allowlist sanitiser for GitHub-rendered body HTML
    db.ts          IndexedDB: kv, outbox, persisted query cache
    outbox.ts      durable offline write queue and replay engine
  state/           auth · settings · query client with IndexedDB persistence
  hooks/           data hooks, mutations with offline fallback, outbox view
  components/      shell, sheets, issue row, sub-issue tree, progress rings
  screens/         onboarding · inbox · repos · repo issues · issue · composer · settings
```

A few decisions worth knowing about:

- **Reads use GraphQL, writes use REST.** One GraphQL request returns an issue,
  its comments and three levels of its sub-issue tree; the REST sub-issue and
  label/assignee endpoints are far simpler to call and to fold back into the
  cache than their GraphQL equivalents.
- **Bodies are rendered from GitHub's own HTML** (`bodyHTML`) rather than a
  local markdown parser, so mentions, cross-references, emoji and task lists all
  look exactly as they do on github.com. That HTML is still run through a local
  allowlist sanitiser before it reaches the DOM.
- **Hash routing** keeps the app deployable to any static host without
  server-side rewrites.
- **`networkMode: 'offlineFirst'`** on TanStack Query plus an IndexedDB
  persister is what makes a cold start offline show real data instead of
  spinners.

## Tests

141 tests covering the parts where being wrong is expensive:

- `progress` — deep roll-up, partially-loaded branches, disagreeing counts
- `outbox` — ordering, create-then-link, permanent vs transient failure,
  interruption, retry, restart persistence
- `sanitize` — script/style removal, `javascript:` URLs (including
  control-character smuggling), attribute allowlisting
- `search` — qualifier construction and quoting
- `client` — auth and rate-limit error messages, pagination links, GraphQL errors
- `map` — GraphQL and REST payloads into the shared model
- `templates`, `time`, `outbox-types` — pure helpers
- `SubIssueTree`, `Bits` — tree rendering, collapse, unlink target, label contrast

## Known limits

- Only the first 50 comments of an issue are loaded; the rest are one tap away
  on github.com.
- Sub-issue reordering is exposed in the API layer (`reprioritizeSubIssue`) but
  there is no drag handle in the UI yet.
- An issue created offline cannot be chosen as the parent of another issue until
  it has synced.
- Pull requests are deliberately out of scope.
