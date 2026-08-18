/**
 * Mobile smoke check: drives the built app in a phone-sized Chromium against
 * canned GitHub responses, screenshots each screen, and fails on a console
 * error or a page that scrolls sideways.
 *
 *   npm run build && npm run preview &
 *   npm run smoke
 *
 * Set CHROMIUM_PATH if Playwright's own download is not on this machine.
 */
import { chromium, devices } from 'playwright'
import { mkdirSync } from 'node:fs'
import { respondTo } from './fixtures/github.mjs'

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:4173'
const OUT = process.env.SMOKE_OUT ?? 'smoke-shots'
const launchOptions = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}

mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch(launchOptions)
const context = await browser.newContext({ ...devices['iPhone 14'], isMobile: true, hasTouch: true })

await context.route('https://api.github.com/graphql', async (route) => {
  const body = JSON.parse(route.request().postData() ?? '{}')
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(respondTo(body.query ?? '')) })
})
await context.route('https://avatars.githubusercontent.com/**', (route) =>
  route.fulfill({
    status: 200,
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#4493f8"/></svg>',
  }),
)

const problems = []
const page = await context.newPage()
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(`console: ${m.text()}`)
})
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))

async function checkLayout(name) {
  const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  if (overflows) problems.push(`${name}: page scrolls horizontally`)
}

async function shot(name, options = {}) {
  await checkLayout(name)
  await page.screenshot({ path: `${OUT}/${name}.png`, ...options })
}

async function signIn(theme) {
  await page.evaluate(
    ([chosen]) => {
      localStorage.setItem('gh-tasks.token', 'smoke-token')
      localStorage.setItem(
        'gh-tasks.settings',
        JSON.stringify({ favorites: ['acme/app'], defaultRepo: 'acme/app', theme: chosen }),
      )
    },
    [theme],
  )
}

await page.goto(BASE, { waitUntil: 'networkidle' })
await shot('01-onboarding')

await signIn('dark')
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('text=Rebuild the onboarding flow')
await shot('02-inbox-dark')

await page.click('text=Rebuild the onboarding flow')
await page.waitForSelector('text=Sub-issues')
await shot('03-issue-detail', { fullPage: true })

await signIn('light')
await page.goto(`${BASE}#/r/acme/app`, { waitUntil: 'networkidle' })
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('text=Rebuild the onboarding flow')
await shot('04-repo-light')

await page.goto(`${BASE}#/new?repo=acme%2Fapp`, { waitUntil: 'networkidle' })
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('text=New issue')
await shot('05-new-issue', { fullPage: true })

await page.goto(`${BASE}#/settings`, { waitUntil: 'networkidle' })
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('text=Quick-capture templates')
await shot('06-settings', { fullPage: true })

await browser.close()

if (problems.length) {
  console.error('Smoke check failed:')
  for (const problem of problems) console.error(` - ${problem}`)
  process.exit(1)
}
console.log(`Smoke check passed. Screenshots in ${OUT}/`)
