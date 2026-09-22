// The `*Input` types mirror the wire; the models below them are what the components render.

import type { ConnectionStatus } from '@/lib/connector-tools'

export type ConnectorResidency = 'hosted' | 'local'

/** The MCP engine already speaks this vocabulary for a local server; keep it identical. */
export type LocalServerStatus = 'error' | 'needs-auth' | 'off' | 'ok' | 'probing' | 'unknown'

// ---------------------------------------------------------------- inputs

export interface HostedConnectorInput {
  /** The signed-in identity Hermes acts as; the dialog shows it, a card never does. */
  accountLabel?: string
  connected: boolean
  /** ISO timestamp, kept raw because the dialog prints the date. */
  connectedAt?: string
  connectionStatus?: ConnectionStatus
  description?: string
  /** The member rule, or the gateway's own effective off-list when the rules could not be read. */
  disabledTools?: readonly string[]
  /** The person's own switch. False means "Off for you". */
  enabled: boolean
  inCatalog?: boolean
  /** The org took the whole app away; nothing the person does here can widen it. */
  orgLocked?: boolean
  slug: string
  /** The provider's own words for a broken connection. */
  statusReason?: string
  toolsOff?: number
}

export interface LocalServerInput {
  /** False when the browser OAuth flow would corrupt this entry, so the card offers the logs instead. */
  canAuthenticate?: boolean
  description?: string
  enabled: boolean
  hostedSlug?: string
  name: string
  status: LocalServerStatus
  target: string
  toolsOn?: number
  toolsTotal?: number
  /** No call in the usage window. A quiet pill, not a problem. */
  unused?: boolean
}

export type ConnectorAuthType = 'apiKey' | 'none' | 'oauth'

export interface BundledEntryInput {
  authType: ConnectorAuthType
  description?: string
  /** The manifest's `connector` field. The ONLY merge key; names are never compared. */
  hostedSlug?: string
  /** The catalog entry's own name, which is also the install key. */
  name: string
  needsEnv: boolean
}

/** `facet` and `hints` stay open strings: a provider may send a value before we ship a word for it. */
export interface ToolInput {
  categories: string[]
  deprecated: boolean
  description: string
  facet: string
  hints: string[]
  name: string
  slug: string
}

// ---------------------------------------------------------------- card models

export type ConnectorState = 'available' | 'broken' | 'connected' | 'connecting' | 'expired' | 'off'

/** Who turned it off. Only `me` is reversible from this page. */
export type ConnectorOffBy = 'me' | 'org'

/** The key of the card's state word. A hosted app and a server never share one. */
export type ConnectorStateWord =
  | 'accessExpired'
  | 'available'
  | 'connected'
  | 'connecting'
  | 'couldNotConnect'
  | 'notInstalled'
  | 'offByYourOrganisation'
  | 'offForYou'
  | 'serverConnecting'
  | 'serverError'
  | 'serverNeedsAuth'
  | 'serverOff'
  | 'serverOn'
  | 'serverOnUnused'

/** The single count a card may carry. Never two facts in one lane. */
export type ConnectorFactKey = 'tools' | 'toolsOff' | 'toolsOn' | 'toolsSomeOn'

export interface ConnectorFact {
  count: number
  key: ConnectorFactKey
  /** The second number of `toolsSomeOn` ("31 tools, 29 on"). */
  on?: number
}

/** `text` carries the provider's own sentence when it sent one, and the component prefers it. */
export interface ConnectorReason {
  key: 'finishSignIn' | 'reconnect' | 'serverError' | 'serverNeedsAuth'
  text?: string
}

/** The one verb at the card's right edge. */
export type ConnectorVerb =
  'authenticate' | 'connect' | 'install' | 'openLogs' | 'reconnect' | 'stopWaiting' | 'turnBackOn'

/** The hosted form of one app. A way carries no state word: the card derives that from the state. */
export interface ConnectorWayHosted {
  accountLabel?: string
  /** An account exists for this app, whatever state it is in. */
  connected: boolean
  connectedAt?: string
  /** The member rule, or the gateway's own effective off-list when the rules could not be read. */
  disabledTools?: readonly string[]
  fact?: ConnectorFact
  offBy?: ConnectorOffBy
  reason?: ConnectorReason
  state: ConnectorState
  verb?: ConnectorVerb
}

/** The same app as a server on this Mac, installed or still only offered by the bundled catalog. */
export interface ConnectorWayLocal {
  authType?: ConnectorAuthType
  /** The bundled catalog entry's name — the install key. Absent for a hand-written server. */
  entryName?: string
  fact?: ConnectorFact
  /** False for a bundled entry that is not installed yet. */
  installed: boolean
  needsEnv?: boolean
  reason?: ConnectorReason
  serverEnabled?: boolean
  /** The mcp.json key, once installed. */
  serverName?: string
  state: ConnectorState
  target?: string
  /** No call in the usage window. A quiet pill, not a problem. */
  unused?: boolean
  verb?: ConnectorVerb
}

/** An app Hermes cannot reach either way is not a card, so one of the two is always there. */
export type ConnectorWays =
  { hosted: ConnectorWayHosted; local: ConnectorWayLocal | null } | { hosted: null; local: ConnectorWayLocal }

export interface ConnectorCardModel {
  description?: string
  fact?: ConnectorFact
  inCatalog: boolean
  name: string
  offBy?: ConnectorOffBy
  reason?: ConnectorReason
  residency: ConnectorResidency
  slug: string
  state: ConnectorState
  stateWord: ConnectorStateWord
  verb?: ConnectorVerb
  ways: ConnectorWays
}

export type ConnectorGroupId = 'available' | 'connected' | 'local' | 'off'

export interface ConnectorGroupModel {
  cards: ConnectorCardModel[]
  id: ConnectorGroupId
}

/** One segment IS one group, so a count can never disagree with the list under it. */
export type ConnectorSegmentId = 'all' | ConnectorGroupId

export interface ConnectorSegmentModel {
  count: number
  id: ConnectorSegmentId
}

export interface ConnectorsFilter {
  query: string
  segment: ConnectorSegmentId
}

export interface ConnectorPageModel {
  groups: ConnectorGroupModel[]
  /** Cards the query matches that the chosen segment hides. Zero when the segment is `all`. */
  hiddenMatches: number
  /** The segment actually shown: the chosen one, or `all` when the chosen one holds nothing. */
  segment: ConnectorSegmentId
  segments: ConnectorSegmentModel[]
}

/** `unavailable` is not a failure: this account has no connectors at all. */
export type HostedPhase = 'failed' | 'loading' | 'ready' | 'signedOut' | 'unavailable'

// ---------------------------------------------------------------- tool models

export interface ToolRowModel {
  categories: string[]
  deprecated: boolean
  description: string
  facet: string
  hints: string[]
  /** Struck and unswitchable. Only the org can give it back. */
  lockedBy: 'org' | null
  name: string
  on: boolean
  slug: string
}

export interface ToolsFilter {
  category: null | string
  facet: null | string
  hint: null | string
  query: string
  showDeprecated: boolean
}

/** Every state the dialog's right column can be in; only `ready` and `saving` render a list. */
export type ToolsEditorPhase =
  'conflict' | 'gone' | 'loading' | 'needsAuth' | 'off' | 'ready' | 'saving' | 'signedOut' | 'unavailable'

/** The phases the READ owns: the editor hook never enters or leaves them on its own. */
export type ToolsEditorStatus = Extract<
  ToolsEditorPhase,
  'gone' | 'loading' | 'needsAuth' | 'off' | 'signedOut' | 'unavailable'
>

export interface FacetSummaryRow {
  facet: string
  /** Every tool in this facet is org-locked, so the row's switch can write nothing. */
  locked: boolean
  on: number
  switchState: 'mixed' | 'off' | 'on'
  total: number
}

export interface ToolsEditorCounts {
  backOn: number
  off: number
}

export interface ToolsFreshness {
  fetchedAt: number
}

export type QuickActionId = 'everything-on' | 'no-destructive' | 'read-only'

export interface QuickAction {
  /** The facets this action turns OFF. Empty means it turns everything back on. */
  facets: readonly string[]
  id: QuickActionId
}

/** What the other editor's saved version does that this one does not. */
export interface ConflictDifference {
  /** Tools they left on that this editor turned off. */
  theyOn: number
  /** Tools they turned off that this editor has on. */
  theyOff: number
}
