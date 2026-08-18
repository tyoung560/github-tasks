/**
 * Validates every GraphQL document in the app against GitHub's real schema.
 *
 * The smoke check cannot catch this class of bug: its fixtures answer whatever
 * they are sent, so a document that GitHub itself would reject still "works"
 * there. Two such bugs shipped before this existed — a field/argument merge
 * conflict on `comments`, and a `viewerCanPush` field that does not exist on
 * Repository.
 *
 *   npm run check:graphql
 *
 * The schema is ~1.5 MB, so it is downloaded and cached under node_modules
 * rather than committed. Point GITHUB_GRAPHQL_SCHEMA at a local copy to run
 * offline.
 */
import { buildSchema, parse, validate } from 'graphql'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const QUERIES = resolve(ROOT, 'src/lib/github/queries.ts')
const CACHE = resolve(ROOT, 'node_modules/.cache/github-schema.graphql')
const SCHEMA_URL = 'https://docs.github.com/public/fpt/schema.docs.graphql'

async function loadSchemaText() {
  const override = process.env.GITHUB_GRAPHQL_SCHEMA
  if (override) return readFileSync(override, 'utf8')
  if (existsSync(CACHE)) return readFileSync(CACHE, 'utf8')

  process.stdout.write(`Downloading GitHub's GraphQL schema…\n`)
  const response = await fetch(SCHEMA_URL)
  if (!response.ok) {
    throw new Error(`Could not download the schema (HTTP ${response.status}). Set GITHUB_GRAPHQL_SCHEMA to a local copy.`)
  }
  const text = await response.text()
  mkdirSync(dirname(CACHE), { recursive: true })
  writeFileSync(CACHE, text)
  return text
}

/** Pulls each `export const NAME = /* GraphQL *​/ \`…\`` out of the module. */
function extractDocuments(source) {
  const pattern = /export const (\w+) = \/\* GraphQL \*\/ `([\s\S]*?)\n`/g
  return [...source.matchAll(pattern)].map(([, name, body]) => ({ name, body }))
}

const source = readFileSync(QUERIES, 'utf8')
const documents = extractDocuments(source)
if (documents.length === 0) {
  console.error('No GraphQL documents found — has the export format in queries.ts changed?')
  process.exit(1)
}

const fragments = new Map(documents.filter((d) => d.name.endsWith('_FRAGMENT')).map((d) => [d.name, d.body]))
const operations = documents.filter((d) => !d.name.endsWith('_FRAGMENT'))

const schema = buildSchema(await loadSchemaText())
const failures = []

for (const { name, body } of operations) {
  // Fragments are interpolated at runtime; splice them in the same way here.
  let text = body
  for (const [fragmentName, fragmentBody] of fragments) {
    text = text.replaceAll('${' + fragmentName + '}', fragmentBody)
  }

  let ast
  try {
    ast = parse(text)
  } catch (error) {
    failures.push({ name, messages: [`parse error: ${error.message}`] })
    console.log(`✗ ${name}`)
    continue
  }

  const errors = validate(schema, ast)
  if (errors.length) {
    failures.push({ name, messages: errors.map((e) => e.message) })
    console.log(`✗ ${name}`)
    for (const error of errors) console.log(`    ${error.message}`)
  } else {
    console.log(`✓ ${name}`)
  }
}

const unused = [...fragments.keys()].filter((name) => !source.includes('${' + name + '}'))
for (const name of unused) console.log(`! ${name} is never interpolated into a document`)

if (failures.length) {
  console.error(`\n${failures.length} of ${operations.length} documents are invalid.`)
  process.exit(1)
}
console.log(`\nAll ${operations.length} documents validate against GitHub's schema.`)
