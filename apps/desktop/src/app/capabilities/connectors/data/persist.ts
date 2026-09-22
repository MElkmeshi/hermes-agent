// The last page the person saw, kept across a restart so a cold start paints before the network answers.

import { type ProfileScope, profileScopeKey } from '@/hermes'
import { queryClient } from '@/lib/query-client'
import { readJson, writeJson } from '@/lib/storage'
import { $freeTierStatus } from '@/store/free-tier'

import { MCP_CATALOG_KEY } from '../../mcp/mcp-status'
import type { LocalServerInput } from '../types'

import { CONNECTOR_LIFETIMES, type ConnectorRead, CONNECTORS_QUERY_ROOT } from './keys'

/** `bundled` sits outside this page's key space and `servers` rides no query at all, yet the page paints from both. */
export type PersistedRead = 'bundled' | 'servers' | ConnectorRead

const persists = (read: PersistedRead): boolean =>
  read === 'bundled' || read === 'servers' || CONNECTOR_LIFETIMES[read].persist

const STORAGE_PREFIX = 'hermes.connectors.v1.'

/** The atom behind it is filled by an async boot read, so the last answer is mirrored where the first frame sees it. */
const IDENTITY_KEY = 'hermes.connectors.identity.v1'

/** Sixty apps with a sixty-tool list each would pass the origin's quota; the oldest lists go first. */
const PERSIST_MAX_BYTES = 256 * 1024

interface PersistedEntry {
  at: number
  data: unknown
}

interface PersistedBlob {
  bundled?: PersistedEntry
  catalog?: PersistedEntry
  /** The identity the reads ran under, so one profile cannot paint the previous account's apps. */
  freeTier: boolean
  list?: PersistedEntry
  servers?: PersistedEntry
  tools?: Record<string, PersistedEntry>
}

const keyFor = (scopeKey: string) => `${STORAGE_PREFIX}${scopeKey}`

/** `null` while nothing has ever answered; the page then keeps no cache rather than a shared one. */
const currentIdentity = (): boolean | null => $freeTierStatus.get()?.has_guest ?? readJson<boolean>(IDENTITY_KEY)

const isRead = (value: unknown): value is ConnectorRead => typeof value === 'string' && value in CONNECTOR_LIFETIMES

function size(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

function readBlob(scopeKey: string): PersistedBlob | null {
  const blob = readJson<PersistedBlob>(keyFor(scopeKey))

  if (!blob || typeof blob !== 'object' || Array.isArray(blob)) {
    return null
  }

  return blob.freeTier === currentIdentity() ? blob : null
}

const SLOTS = {
  bundled: 'bundled',
  catalog: 'catalog',
  list: 'list',
  servers: 'servers'
} satisfies Partial<Record<PersistedRead, keyof PersistedBlob>>

type SlotRead = keyof typeof SLOTS

function entryOf(blob: PersistedBlob, read: PersistedRead, slug: string | undefined): PersistedEntry | undefined {
  if (read === 'tools') {
    return slug ? blob.tools?.[slug] : undefined
  }

  return read in SLOTS ? (blob[SLOTS[read as SlotRead]] as PersistedEntry | undefined) : undefined
}

/** Seed one query from storage at the blob's real age, so TanStack paints it at once. */
export function seedOptions<T>(
  scopeKey: ProfileScope | string,
  read: PersistedRead,
  slug?: string
): { initialData?: T; initialDataUpdatedAt?: number } {
  const blob = readBlob(typeof scopeKey === 'string' ? scopeKey : profileScopeKey(scopeKey))
  const entry = blob ? entryOf(blob, read, slug) : undefined

  if (!entry || typeof entry.at !== 'number' || entry.data === undefined || entry.data === null) {
    return {}
  }

  return { initialData: entry.data as T, initialDataUpdatedAt: entry.at }
}

/** Drop the oldest tool lists until the whole blob fits the budget. */
function trimmed(blob: PersistedBlob): PersistedBlob {
  let tools = blob.tools

  while (tools !== undefined && size({ ...blob, tools }) > PERSIST_MAX_BYTES) {
    const oldest = Object.entries(tools).sort((a, b) => a[1].at - b[1].at)[0]

    if (!oldest) {
      break
    }

    const rest = { ...tools }
    delete rest[oldest[0]]
    tools = rest
  }

  return { ...blob, tools }
}

function store(scopeKey: string, read: PersistedRead, slug: string | undefined, data: unknown, at: number): void {
  const entry: PersistedEntry = { at, data }
  const identity = currentIdentity()

  // An unstamped blob would be readable by whoever signs in next, so nothing is kept until one is known.
  if (identity === null || size(entry) > PERSIST_MAX_BYTES) {
    return
  }

  const blob = readBlob(scopeKey) ?? { freeTier: identity }

  if (read === 'tools') {
    if (!slug) {
      return
    }

    blob.tools = { ...blob.tools, [slug]: entry }
  } else {
    blob[SLOTS[read as SlotRead]] = entry
  }

  writeJson(keyFor(scopeKey), trimmed({ ...blob, freeTier: identity }))
}

interface ReadTarget {
  read: PersistedRead
  scopeKey: string
  slug: string | undefined
}

function targetOf(queryKey: readonly unknown[]): null | ReadTarget {
  const [root, scopeKey, read, slug] = queryKey

  if (root === MCP_CATALOG_KEY[0]) {
    return typeof scopeKey === 'string' ? { read: 'bundled', scopeKey, slug: undefined } : null
  }

  if (root !== CONNECTORS_QUERY_ROOT || typeof scopeKey !== 'string' || !isRead(read)) {
    return null
  }

  return { read, scopeKey, slug: typeof slug === 'string' ? slug : undefined }
}

/** Subscribe the query cache. Called once, from the page's mount effect; returns the unsubscribe. */
export function startConnectorPersistence(): () => void {
  const stopCache = queryClient.getQueryCache().subscribe(event => {
    if (event.type !== 'updated' || event.action.type !== 'success') {
      return
    }

    const target = targetOf(event.query.queryKey)
    const { data, dataUpdatedAt } = event.query.state

    if (!target || !persists(target.read) || data === undefined) {
      return
    }

    store(target.scopeKey, target.read, target.slug, data, dataUpdatedAt)
  })

  const stopIdentity = $freeTierStatus.listen(status => {
    if (status && status.has_guest !== readJson<boolean>(IDENTITY_KEY)) {
      writeJson(IDENTITY_KEY, status.has_guest)
    }
  })

  return () => {
    stopCache()
    stopIdentity()
  }
}

/** What a server is, before anything has probed it. No target and no probe result: both would age badly. */
interface ServerSeed {
  description?: string
  enabled: boolean
  hostedSlug?: string
  name: string
}

const isSeed = (value: unknown): value is ServerSeed =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as ServerSeed).name === 'string' &&
  typeof (value as ServerSeed).enabled === 'boolean'

/** The servers come from the config read, not from a query, so the page hands them over itself. */
export function storeLocalServers(scope: ProfileScope, servers: readonly LocalServerInput[]): void {
  const seeds: ServerSeed[] = servers.map(({ description, enabled, hostedSlug, name }) => ({
    description,
    enabled,
    hostedSlug,
    name
  }))

  store(profileScopeKey(scope), 'servers', undefined, seeds, Date.now())
}

/** The last known servers, as cards the first probe then refines. */
export function seedLocalServers(scope: ProfileScope): LocalServerInput[] {
  const { initialData } = seedOptions<unknown>(scope, 'servers')

  if (!Array.isArray(initialData)) {
    return []
  }

  return initialData.filter(isSeed).map(seed => ({ ...seed, status: 'unknown', target: '' }))
}

/** Drop everything stored for one profile. */
export function clearPersisted(scope: ProfileScope): void {
  writeJson(keyFor(profileScopeKey(scope)), null)
}
