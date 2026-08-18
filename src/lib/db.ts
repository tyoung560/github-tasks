import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { OutboxEntry } from './outbox-types'

const DB_NAME = 'github-tasks'
const DB_VERSION = 1

interface TasksDB extends DBSchema {
  /** Small app state: settings, last-seen viewer, cache metadata. */
  kv: { key: string; value: unknown }
  /** Writes made while offline, replayed in order once back online. */
  outbox: { key: string; value: OutboxEntry; indexes: { createdAt: number } }
  /** The serialised TanStack Query cache, one row. */
  queryCache: { key: string; value: string }
}

let dbPromise: Promise<IDBPDatabase<TasksDB>> | null = null

export function db(): Promise<IDBPDatabase<TasksDB>> {
  if (!dbPromise) {
    dbPromise = openDB<TasksDB>(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains('kv')) database.createObjectStore('kv')
        if (!database.objectStoreNames.contains('outbox')) {
          const store = database.createObjectStore('outbox', { keyPath: 'id' })
          store.createIndex('createdAt', 'createdAt')
        }
        if (!database.objectStoreNames.contains('queryCache')) database.createObjectStore('queryCache')
      },
    })
  }
  return dbPromise
}

/** Closes the connection so the database can be deleted (used by tests). */
export async function closeDb(): Promise<void> {
  if (!dbPromise) return
  const database = await dbPromise
  database.close()
  dbPromise = null
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  return (await (await db()).get('kv', key)) as T | undefined
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await (await db()).put('kv', value, key)
}

export async function kvDelete(key: string): Promise<void> {
  await (await db()).delete('kv', key)
}

/** Async storage shim for `createAsyncStoragePersister`. */
export const queryCacheStorage = {
  async getItem(key: string): Promise<string | null> {
    return (await (await db()).get('queryCache', key)) ?? null
  },
  async setItem(key: string, value: string): Promise<void> {
    await (await db()).put('queryCache', value, key)
  },
  async removeItem(key: string): Promise<void> {
    await (await db()).delete('queryCache', key)
  },
}

/** Wipes every cached GitHub response. Called on sign-out. */
export async function clearCachedData(): Promise<void> {
  const database = await db()
  await Promise.all([database.clear('queryCache'), database.clear('outbox')])
}

export async function clearEverything(): Promise<void> {
  const database = await db()
  await Promise.all([database.clear('queryCache'), database.clear('outbox'), database.clear('kv')])
}
