// The page's own derivations; `derive-tools.ts` owns everything inside an opened connector.

import { connectorTitle } from '@/lib/connector-tools'

import type {
  BundledEntryInput,
  ConnectorCardModel,
  ConnectorFact,
  ConnectorReason,
  ConnectorsFilter,
  ConnectorState,
  ConnectorStateWord,
  ConnectorVerb,
  ConnectorWayHosted,
  ConnectorWayLocal,
  ConnectorWays,
  HostedConnectorInput,
  HostedPhase,
  LocalServerInput,
  LocalServerStatus
} from './types'

export const EMPTY_CONNECTORS_FILTER: ConnectorsFilter = { query: '', segment: 'all' }

interface Phase {
  reason: ConnectorReason['key'] | undefined
  state: ConnectorState
  verb: ConnectorVerb | undefined
}

/** One table instead of a ladder: each account status decides its own state, reason and verb. */
const HOSTED_PHASES = {
  active: { reason: undefined, state: 'connected', verb: undefined },
  expired: { reason: 'reconnect', state: 'expired', verb: 'reconnect' },
  failed: { reason: 'reconnect', state: 'broken', verb: 'reconnect' },
  inactive: { reason: 'reconnect', state: 'expired', verb: 'reconnect' },
  pending: { reason: 'finishSignIn', state: 'connecting', verb: 'stopWaiting' },
  revoked: { reason: 'reconnect', state: 'expired', verb: 'reconnect' }
} satisfies Record<string, Phase>

/** The same table for a server on this machine. `ok` and `off` carry no verb: the card has the switch. */
const LOCAL_PHASES = {
  error: { reason: 'serverError', state: 'broken', verb: 'openLogs' },
  'needs-auth': { reason: 'serverNeedsAuth', state: 'broken', verb: 'authenticate' },
  off: { reason: undefined, state: 'off', verb: undefined },
  ok: { reason: undefined, state: 'connected', verb: undefined },
  probing: { reason: undefined, state: 'connecting', verb: undefined },
  unknown: { reason: undefined, state: 'connecting', verb: undefined }
} satisfies Record<LocalServerStatus, Phase>

/** The word is a function of the state and of which way is speaking, so it is never stored twice. */
const HOSTED_WORDS = {
  available: 'available',
  broken: 'couldNotConnect',
  connected: 'connected',
  connecting: 'connecting',
  expired: 'accessExpired',
  off: 'offForYou'
} satisfies Record<ConnectorState, ConnectorStateWord>

const LOCAL_WORDS = {
  available: 'notInstalled',
  broken: 'serverError',
  connected: 'serverOn',
  connecting: 'serverConnecting',
  expired: 'serverError',
  off: 'serverOff'
} satisfies Record<ConnectorState, ConnectorStateWord>

// ---------------------------------------------------------------- the two ways

/** One hosted app, as its own form. */
export function hostedWay(row: HostedConnectorInput): ConnectorWayHosted {
  const base = {
    accountLabel: row.accountLabel,
    connected: row.connected,
    connectedAt: row.connectedAt,
    disabledTools: row.disabledTools
  }

  // Policy comes before status: a verb on an app the org took away would promise what cannot work.
  if (row.orgLocked) {
    return { ...base, offBy: 'org', state: 'off' }
  }

  if (!row.enabled) {
    return { ...base, offBy: 'me', state: 'off', verb: 'turnBackOn' }
  }

  const phase = row.connected ? HOSTED_PHASES[row.connectionStatus ?? 'active'] : undefined

  if (!phase) {
    return { ...base, state: 'available', verb: 'connect' }
  }

  // An attempt still in the browser has no account to describe, so it names neither identity nor date.
  if (phase.state === 'connecting') {
    return {
      ...base,
      accountLabel: undefined,
      connectedAt: undefined,
      reason: { key: 'finishSignIn' },
      state: phase.state,
      verb: phase.verb
    }
  }

  return {
    ...base,
    fact:
      phase.state === 'connected' && row.toolsOff && row.toolsOff > 0
        ? { count: row.toolsOff, key: 'toolsOff' }
        : undefined,
    // Only a reconnect carries the provider's own sentence about what broke.
    reason: phase.reason
      ? { key: phase.reason, text: phase.reason === 'reconnect' ? row.statusReason : undefined }
      : undefined,
    state: phase.state,
    verb: phase.verb
  }
}

/** An idle server returns no count: the lane holds one fact, and "On, unused" is the one worth reading. */
function localFact(server: LocalServerInput, state: ConnectorState): ConnectorFact | undefined {
  if (state !== 'connected' || server.unused === true || server.toolsTotal === undefined) {
    return undefined
  }

  if (server.toolsOn === undefined) {
    return { count: server.toolsTotal, key: 'tools' }
  }

  return server.toolsOn < server.toolsTotal
    ? { count: server.toolsTotal, key: 'toolsSomeOn', on: server.toolsOn }
    : { count: server.toolsOn, key: 'toolsOn' }
}

/** One server installed on this machine. */
export function localWay(server: LocalServerInput): ConnectorWayLocal {
  const status: LocalServerStatus = server.enabled ? server.status : 'off'
  const phase = LOCAL_PHASES[status]

  return {
    fact: localFact(server, phase.state),
    installed: true,
    reason: phase.reason ? { key: phase.reason } : undefined,
    serverEnabled: server.enabled,
    serverName: server.name,
    state: phase.state,
    target: server.target,
    unused: server.unused,
    // A server the browser flow would corrupt is sent to its logs instead; the status word is unchanged.
    verb: phase.verb === 'authenticate' && server.canAuthenticate === false ? 'openLogs' : phase.verb
  }
}

/** A bundled catalog entry nobody has installed yet. */
export function bundledWay(entry: BundledEntryInput): ConnectorWayLocal {
  return {
    authType: entry.authType,
    entryName: entry.name,
    installed: false,
    needsEnv: entry.needsEnv,
    state: 'available',
    verb: 'install'
  }
}

/** True when Hermes would see the app's tools twice. */
export function bothWaysOn({ hosted, local }: ConnectorWays): boolean {
  return (
    hosted?.state === 'connected' &&
    local?.installed === true &&
    local.serverEnabled === true &&
    local.state === 'connected'
  )
}

// ---------------------------------------------------------------- one card per app

type Speaker = { kind: 'hosted'; way: ConnectorWayHosted } | { kind: 'local'; way: ConnectorWayLocal }

/** The card speaks for the way in use: a hosted account first, then an installed server, else what exists. */
function speakerOf(ways: ConnectorWays): Speaker {
  if (ways.hosted && ways.hosted.state !== 'available') {
    return { kind: 'hosted', way: ways.hosted }
  }

  if (ways.local?.installed === true) {
    return { kind: 'local', way: ways.local }
  }

  return ways.hosted ? { kind: 'hosted', way: ways.hosted } : { kind: 'local', way: ways.local }
}

function hostedWord(way: ConnectorWayHosted): ConnectorStateWord {
  return way.offBy === 'org' ? 'offByYourOrganisation' : HOSTED_WORDS[way.state]
}

function localWord(way: ConnectorWayLocal): ConnectorStateWord {
  if (way.reason?.key === 'serverNeedsAuth') {
    return 'serverNeedsAuth'
  }

  return way.state === 'connected' && way.unused === true ? 'serverOnUnused' : LOCAL_WORDS[way.state]
}

export interface MergeCardInput {
  description?: string
  inCatalog: boolean
  name: string
  slug: string
  ways: ConnectorWays
}

/** The four combinations of hosted × local, as one card that keeps both forms. */
export function mergeCard({ description, inCatalog, name, slug, ways }: MergeCardInput): ConnectorCardModel {
  const speaker = speakerOf(ways)
  const base = { description, fact: speaker.way.fact, inCatalog, name, reason: speaker.way.reason, slug, ways }

  if (speaker.kind === 'hosted') {
    return {
      ...base,
      offBy: speaker.way.offBy,
      residency: 'hosted',
      state: speaker.way.state,
      stateWord: hostedWord(speaker.way),
      verb: speaker.way.verb
    }
  }

  return {
    ...base,
    offBy: speaker.way.state === 'off' ? 'me' : undefined,
    residency: 'local',
    state: speaker.way.state,
    stateWord: localWord(speaker.way),
    verb: speaker.way.verb
  }
}

/** The pending account outlives the operation, so a sign-in nobody waits for reads as available here. */
export function forgetAbandoned(
  rows: readonly HostedConnectorInput[],
  abandoned: ReadonlySet<string>
): HostedConnectorInput[] {
  return rows.map(row =>
    abandoned.has(row.slug) && row.connectionStatus === 'pending'
      ? { ...row, accountLabel: undefined, connected: false, connectedAt: undefined, connectionStatus: undefined }
      : row
  )
}

/** A merged card's slug is the hosted slug, so every local call has to ask the way for the mcp.json key. */
export function localServerName(card: ConnectorCardModel): string {
  return card.ways.local?.serverName ?? card.slug
}

/** The other way this app could run, when the card is not already speaking for it. */
export type ConnectorTwinPill = 'alsoLocal' | 'hostedTwin' | null

export function twinPillOf({ residency, ways }: ConnectorCardModel): ConnectorTwinPill {
  if (residency === 'local') {
    // An app the org took away, or one the person switched off, is nothing to fall back on.
    return ways.hosted && ways.hosted.state !== 'off' ? 'hostedTwin' : null
  }

  return ways.local && !ways.local.installed ? 'alsoLocal' : null
}

export interface DeriveCardsInput {
  bundled: readonly BundledEntryInput[]
  hosted: readonly HostedConnectorInput[]
  local: readonly LocalServerInput[]
  /** Slug → display title. The wiring slice passes `connectorTitles`' result. */
  titles?: Readonly<Record<string, string>>
}

interface CardParts {
  bundled?: BundledEntryInput
  hosted?: HostedConnectorInput
  local?: LocalServerInput
}

/** The manifest's `connector` field is the only merge key; names are never compared. */
const mergeKey = (hostedSlug: string | undefined, name: string) => hostedSlug ?? `local:${name}`

function waysOf(parts: CardParts): ConnectorWays | null {
  const local = parts.local ? localWay(parts.local) : parts.bundled ? bundledWay(parts.bundled) : null

  if (parts.hosted) {
    return { hosted: hostedWay(parts.hosted), local }
  }

  return local ? { hosted: null, local } : null
}

/** One card per app, whichever of the three sources knows about it. */
export function deriveCards({ bundled, hosted, local, titles = {} }: DeriveCardsInput): ConnectorCardModel[] {
  const parts = new Map<string, CardParts>()

  const at = (key: string): CardParts => {
    const found = parts.get(key)

    if (found) {
      return found
    }

    const fresh: CardParts = {}
    parts.set(key, fresh)

    return fresh
  }

  for (const row of hosted) {
    at(row.slug).hosted = row
  }

  for (const server of local) {
    at(mergeKey(server.hostedSlug, server.name)).local = server
  }

  for (const entry of bundled) {
    const slot = at(mergeKey(entry.hostedSlug, entry.name))

    // An installed server always beats the bundled entry of the same app.
    if (!slot.local) {
      slot.bundled = entry
    }
  }

  const cards: ConnectorCardModel[] = []

  for (const slot of parts.values()) {
    const ways = waysOf(slot)

    if (!ways) {
      continue
    }

    // The slug stays the hosted slug, or the server's config key, so a deep link can still address the card.
    const slug = slot.hosted?.slug ?? slot.local?.name ?? slot.bundled?.name ?? ''
    const titleKey = slot.hosted?.slug ?? slot.local?.hostedSlug ?? slot.bundled?.hostedSlug ?? slug
    // An install must not rename the app: the bundled entry and the server it becomes read the same way.
    const fallback = connectorTitle(slot.local?.name ?? slot.bundled?.name ?? slug)

    cards.push(
      mergeCard({
        description: slot.hosted?.description ?? slot.local?.description ?? slot.bundled?.description,
        inCatalog: slot.hosted?.inCatalog ?? false,
        name: titles[titleKey] ?? fallback,
        slug,
        ways
      })
    )
  }

  return cards
}

// ---------------------------------------------------------------- the hosted half's phase

export interface HostedPhaseInput {
  /** `connectors.list`'s own `available` flag. */
  available?: boolean
  /** The list read failed, whatever the reason. */
  errored: boolean
  pending: boolean
  /** The list read's own typed reason, never another read's. */
  reason: null | string
}

/** Only the list decides whether the hosted half is usable; the other three reads may refuse it. */
export function hostedPhase({ available, errored, pending, reason }: HostedPhaseInput): HostedPhase {
  if (reason === 'NEEDS_NOUS_AUTH') {
    return 'signedOut'
  }

  if (reason === 'CONNECTORS_UNAVAILABLE') {
    return 'unavailable'
  }

  if (errored) {
    return 'failed'
  }

  if (pending) {
    return 'loading'
  }

  return available === false ? 'unavailable' : 'ready'
}
