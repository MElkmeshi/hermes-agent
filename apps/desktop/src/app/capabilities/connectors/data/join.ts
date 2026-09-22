// Pure: every fact arrives as an argument, so each join is provable alone.

import type {
  ConnectorAccountRow,
  ConnectorCatalogRow,
  ConnectorRow as ConnectorListRow,
  ConnectorPolicyLayer,
  ConnectorToolsResult
} from '@hermes/shared'

import type { McpCatalogEntry } from '@/hermes'
import { connectorTitle } from '@/lib/connector-tools'
import type { McpServers } from '@/lib/mcp-servers'

import { canAuthenticate } from '../../mcp/mcp-status'
import { toolRows } from '../derive-tools'
import type {
  BundledEntryInput,
  ConnectorAuthType,
  HostedConnectorInput,
  LocalServerInput,
  LocalServerStatus,
  ToolInput,
  ToolRowModel,
  ToolsFreshness
} from '../types'

// ── policy ─────────────────────────────────────────────────────────────────

/** `disable` takes a tool away; `enable` is an allow-list, so a tool carrying none of its tags is locked. */
export interface ConnectorPolicyTagRules {
  disable: readonly string[]
  enable: readonly string[]
}

/** One layer flattened: four wire modes become what it permits and what it forbids. */
export interface ConnectorPolicyRules {
  /** Connectors this layer permits; `null` means "every connector". */
  allowed: ReadonlySet<string> | null
  /** Connectors this layer forbids by name. */
  denied: ReadonlySet<string>
  /** Compare-and-set token for this layer. */
  revision: string
  tags: ConnectorPolicyTagRules
  /** Named tool rules, keyed by connector slug. */
  tools: Readonly<Record<string, readonly string[]>>
}

export interface ConnectorPolicyView {
  /** The one layer this page writes. Absent until the member has a rule. */
  member: ConnectorPolicyRules | null
  /** Every other layer (org, role). Read-only here, and any of them can lock. */
  others: readonly ConnectorPolicyRules[]
}

export const EMPTY_POLICY: ConnectorPolicyView = { member: null, others: [] }

const NO_TAGS: ConnectorPolicyTagRules = { disable: [], enable: [] }

function rulesOf(layer: ConnectorPolicyLayer): ConnectorPolicyRules {
  const body = layer.body
  const base = { revision: layer.revision, tags: NO_TAGS, tools: {} }

  if (body.mode === 'unrestricted') {
    return { ...base, allowed: null, denied: new Set() }
  }

  // Deny-all is an allow-list with no entries, so it needs no third case.
  if (body.mode === 'deny-all') {
    return { ...base, allowed: new Set(), denied: new Set() }
  }

  const tags: ConnectorPolicyTagRules = {
    disable: body.tags?.disable ?? [],
    enable: body.tags?.enable ?? []
  }

  return body.mode === 'allow'
    ? { allowed: new Set(body.connectors), denied: new Set(), revision: layer.revision, tags, tools: body.tools }
    : {
        allowed: null,
        denied: new Set(body.disabled_connectors),
        revision: layer.revision,
        tags,
        tools: body.tools
      }
}

export function readPolicy(layers: readonly ConnectorPolicyLayer[]): ConnectorPolicyView {
  const member = layers.find(layer => layer.kind === 'member')

  return {
    member: member ? rulesOf(member) : null,
    others: layers.filter(layer => layer.kind !== 'member').map(rulesOf)
  }
}

const layerAllows = (rules: ConnectorPolicyRules, slug: string): boolean =>
  (rules.allowed === null || rules.allowed.has(slug)) && !rules.denied.has(slug)

/** The person's own switch. No member layer at all means nothing is switched off. */
export const memberEnables = (policy: ConnectorPolicyView, slug: string): boolean =>
  policy.member === null || layerAllows(policy.member, slug)

/** A layer the person cannot write took the whole app away. */
export const orgLocks = (policy: ConnectorPolicyView, slug: string): boolean =>
  policy.others.some(rules => !layerAllows(rules, slug))

/** The member's saved rule for one connector — the editor's baseline. */
export const memberDisabledTools = (policy: ConnectorPolicyView, slug: string): readonly string[] =>
  policy.member?.tools[slug] ?? []

/** The CAS token the editor must send back with a tools write. */
export const memberRevision = (policy: ConnectorPolicyView): string | undefined => policy.member?.revision

/** A tag rule needs the tool's own hints, which is why a card counts named rules only. */
export function orgLockedTools(policy: ConnectorPolicyView, slug: string, tools: readonly ToolInput[]): Set<string> {
  const locked = new Set<string>()

  for (const rules of policy.others) {
    for (const tool of rules.tools[slug] ?? []) {
      locked.add(tool)
    }

    for (const tool of tools) {
      const hints = new Set(tool.hints)
      const disabledByTag = rules.tags.disable.some(tag => hints.has(tag))
      const missingEveryEnabledTag = rules.tags.enable.length > 0 && !rules.tags.enable.some(tag => hints.has(tag))

      if (disabledByTag || missingEveryEnabledTag) {
        locked.add(tool.slug)
      }
    }
  }

  return locked
}

/** The wire tools, the member's rule, and whatever a layer above the member locked. */
export function connectorToolRows(
  policy: ConnectorPolicyView,
  slug: string,
  tools: readonly ToolInput[]
): ToolRowModel[] {
  return toolRows(tools, new Set(memberDisabledTools(policy, slug)), orgLockedTools(policy, slug, tools))
}

// ── hosted ─────────────────────────────────────────────────────────────────

export interface HostedJoinInput {
  accounts: readonly ConnectorAccountRow[]
  catalog: readonly ConnectorCatalogRow[]
  list: readonly ConnectorListRow[]
  policy: ConnectorPolicyView
  /** False when the rules read failed: the list row's own effective off-list stands in. */
  rulesReadable?: boolean
}

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value : undefined

/** `ConnectorRow` is an open record, so `disabledTools` arrives through the index signature. */
const stringList = (value: unknown): readonly string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []

/** A connector can carry several accounts: the live one wins, then the newest. */
export function pickAccount(accounts: readonly ConnectorAccountRow[], slug: string): ConnectorAccountRow | undefined {
  const mine = accounts.filter(account => account.connector === slug)
  const rank = (account: ConnectorAccountRow) => (account.active ? 0 : 1)

  return [...mine].sort((a, b) => rank(a) - rank(b) || b.created_at.localeCompare(a.created_at))[0]
}

/** The catalog's own name beats our table, and our table beats a bare slug. */
export function connectorTitles(input: Pick<HostedJoinInput, 'catalog' | 'list'>): Record<string, string> {
  const titles: Record<string, string> = {}

  for (const slug of hostedSlugs(input)) {
    const fromCatalog = text(input.catalog.find(row => row.slug === slug)?.name)
    const fromList = text(input.list.find(row => row.connector === slug)?.name)

    titles[slug] = fromCatalog ?? fromList ?? connectorTitle(slug)
  }

  return titles
}

/** The catalog is the shelf, the list is what the account has touched, and neither contains the other. */
function hostedSlugs({ catalog, list }: Pick<HostedJoinInput, 'catalog' | 'list'>): string[] {
  const slugs = new Set(catalog.map(row => row.slug))

  for (const row of list) {
    if (row.connector) {
      slugs.add(row.connector)
    }
  }

  return [...slugs]
}

export function joinHostedConnectors({
  accounts,
  catalog,
  list,
  policy,
  rulesReadable = true
}: HostedJoinInput): HostedConnectorInput[] {
  return hostedSlugs({ catalog, list }).map(slug => {
    const entry = catalog.find(row => row.slug === slug)
    const row = list.find(candidate => candidate.connector === slug)
    const account = pickAccount(accounts, slug)
    // The member layer when the page can read it, the gateway's effective off-list when it cannot.
    const off = rulesReadable ? memberDisabledTools(policy, slug) : stringList(row?.disabledTools)

    return {
      accountLabel: account?.label,
      // Existence, not `active`, is what `connected` means: `connectionStatus` says which state it is in.
      connected: account !== undefined || row?.connected === true,
      connectedAt: account?.created_at,
      connectionStatus: account?.status ?? undefined,
      description: entry?.description ?? text(row?.description),
      disabledTools: off,
      // Two sources can say "off", and on means neither said so.
      enabled: memberEnables(policy, slug) && row?.enabled !== false,
      inCatalog: entry !== undefined,
      orgLocked: orgLocks(policy, slug),
      slug,
      statusReason: text(account?.status_reason) ?? text(row?.statusReason),
      // Named rules only: a tag rule needs the tool list, which a card never fetches.
      toolsOff: off.length > 0 ? off.length : undefined
    }
  })
}

// ── local ──────────────────────────────────────────────────────────────────

export interface LocalJoinInput {
  /** Its `connector` field is the only source for the hosted slug a local server backs. */
  catalog: readonly McpCatalogEntry[]
  /** The `mcp_servers` map out of the scoped profile's config. */
  servers: McpServers
  /** Server name → the status the MCP tab's probe table computed. */
  status: Readonly<Record<string, LocalServerStatus>>
  /** Server name → its tool split, when a probe reported one. */
  toolCounts?: Readonly<Record<string, { on: number; total: number }>>
  /** Server name → calls in the usage window. Zero is the quiet `unused` pill. */
  usage?: Readonly<Record<string, number>>
}

const targetOf = (entry: Record<string, unknown>): string => {
  const url = text(entry.url)

  if (url !== undefined) {
    return url
  }

  const args = Array.isArray(entry.args) ? entry.args.filter((arg): arg is string => typeof arg === 'string') : []

  return [text(entry.command) ?? '', ...args].join(' ').trim()
}

export function joinLocalServers({ catalog, servers, status, toolCounts, usage }: LocalJoinInput): LocalServerInput[] {
  return Object.entries(servers).map(([name, entry]) => {
    const bundled = catalog.find(candidate => candidate.name === name)
    const hostedSlug = text(bundled?.connector)
    const counts = toolCounts?.[name]
    const calls = usage?.[name]
    const raw = status[name] ?? 'unknown'

    return {
      canAuthenticate: canAuthenticate(entry, raw),
      description: text(bundled?.description),
      enabled: entry.enabled !== false,
      // The manifest's join key is what collapses a local and a hosted `notion` into one card.
      hostedSlug,
      name,
      status: raw,
      target: targetOf(entry),
      toolsOn: counts?.on,
      toolsTotal: counts?.total,
      unused: calls === undefined ? undefined : calls === 0
    }
  })
}

// ── the bundled catalog ────────────────────────────────────────────────────

/** The manifest's own word for what an install will ask for. */
const AUTH_TYPES: Record<string, ConnectorAuthType> = { api_key: 'apiKey', oauth: 'oauth' }

/** Every ready-to-install entry becomes an Available card, so there is one directory and one flow. */
export function joinBundledEntries(catalog: readonly McpCatalogEntry[]): BundledEntryInput[] {
  return catalog.map(entry => ({
    authType: AUTH_TYPES[entry.auth_type] ?? 'none',
    description: text(entry.description),
    hostedSlug: text(entry.connector),
    name: entry.name,
    needsEnv: entry.required_env.some(field => field.required)
  }))
}

// ── tools ──────────────────────────────────────────────────────────────────

/** The wire timestamp is Unix SECONDS, and the cue subtracts it from `Date.now()`. */
export const toolsFreshness = (result: ConnectorToolsResult): ToolsFreshness => ({
  fetchedAt: result.fetched_at * 1000
})
