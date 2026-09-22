// The page has no chat session, so every operation call names the ACCOUNT owner.

import type { AccountOwner, ConnectionAnswer, ConnectorChange, RpcMethods, ToolsChange } from '@hermes/shared'
import { JsonRpcGatewayError } from '@hermes/shared'

import type { ProfileScope } from '@/hermes'
import { requestGatewayForAgent } from '@/store/gateway'

/** `tui_gateway/contracts/connectors.py::ConnectorErrorReason`; the generator does not emit `error.data`. */
const CONNECTOR_ERROR_REASONS = [
  'ACCOUNTS_UNAVAILABLE',
  'CATALOG_UNAVAILABLE',
  'CONNECTION_NOT_FOUND',
  'CONNECTORS_UNAVAILABLE',
  'CONNECTOR_NOT_FOUND',
  'CONNECTOR_REQUEST_FAILED',
  'FORBIDDEN_SCOPE',
  'INVALID_ANSWER',
  'INVALID_CONNECTOR_RESPONSE',
  'INVALID_PARAMS',
  'INVALID_POLICY',
  'LINK_STILL_VALID',
  'NEEDS_NOUS_AUTH',
  'NOT_OWNER',
  'POLICY_CONFLICT',
  'POLICY_UNAVAILABLE',
  'REISSUE_REFUSED',
  'TOOLS_UNAVAILABLE',
  'UNKNOWN_OPERATION',
  'UNKNOWN_TARGET',
  'UNSUPPORTED_RUNTIME'
] as const

export type ConnectorErrorReason = (typeof CONNECTOR_ERROR_REASONS)[number]

const REASONS: ReadonlySet<string> = new Set(CONNECTOR_ERROR_REASONS)

/** `reason` is the backend's verdict; `undefined` means the failure never reached a connector handler. */
export class ConnectorRpcError extends Error {
  readonly code: number | undefined
  readonly reason: ConnectorErrorReason | undefined

  constructor(message: string, code?: number, reason?: ConnectorErrorReason) {
    super(message)
    this.name = 'ConnectorRpcError'
    this.code = code
    this.reason = reason
  }
}

function reasonOf(error: unknown): ConnectorErrorReason | undefined {
  const data = error instanceof JsonRpcGatewayError ? error.data : undefined
  const reason = data && typeof data === 'object' ? (data as { reason?: unknown }).reason : undefined

  return typeof reason === 'string' && REASONS.has(reason) ? (reason as ConnectorErrorReason) : undefined
}

export function asConnectorError(error: unknown): ConnectorRpcError {
  if (error instanceof ConnectorRpcError) {
    return error
  }

  const message = error instanceof Error ? error.message : String(error)
  const code = error instanceof JsonRpcGatewayError ? error.code : undefined

  return new ConnectorRpcError(message, code, reasonOf(error))
}

/** The page branches on reasons, never on codes or message text. */
export function isConnectorReason(error: unknown, ...reasons: readonly ConnectorErrorReason[]): boolean {
  const reason = error instanceof ConnectorRpcError ? error.reason : reasonOf(error)

  return reason !== undefined && reasons.includes(reason)
}

const ACCOUNT_OWNER: AccountOwner = { type: 'account' }

// The backend's upstream deadline is 30 s: a 30 s renderer deadline would replace the typed reason with a timeout.
const CONNECTOR_TIMEOUT_MS = 45_000

/** A capability scope split into the two arguments the gateway router takes. */
function routeOf(scope: ProfileScope): { connectionId: null | string; profile: string } {
  if (scope && typeof scope === 'object') {
    return {
      connectionId: (scope.connectionId ?? '').trim() || null,
      profile: (scope.profile ?? '').trim()
    }
  }

  return { connectionId: null, profile: (scope ?? '').trim() }
}

/** How a call may take the pool's reserved spawn slot: a write is a person waiting on a control. */
type Urgency = 'background' | 'foreground'

async function call<M extends keyof RpcMethods>(
  scope: ProfileScope,
  method: M,
  params: RpcMethods[M]['params'],
  urgency: Urgency = 'background'
): Promise<RpcMethods[M]['result']> {
  const { connectionId, profile } = routeOf(scope)

  try {
    return await requestGatewayForAgent<RpcMethods[M]['result']>(
      connectionId,
      profile,
      method,
      // The router injects the routed key, so the contract's optional `profile` is deliberately never set here.
      params as unknown as Record<string, unknown>,
      CONNECTOR_TIMEOUT_MS,
      undefined,
      { spawnPriority: urgency }
    )
  } catch (error) {
    throw asConnectorError(error)
  }
}

// ── reads ──────────────────────────────────────────────────────────────────

/** Connection state for every app, plus the `available` flag that decides whether this page has a hosted half. */
export const listConnectors = (scope: ProfileScope) => call(scope, 'connectors.list', { owner: ACCOUNT_OWNER })

export const connectorCatalog = (scope: ProfileScope) => call(scope, 'connectors.catalog', {})

export const connectorAccounts = (scope: ProfileScope, connector?: string) =>
  call(scope, 'connectors.accounts', connector === undefined ? {} : { connector })

/** Every visible policy layer; the member layer is the one this page writes, the rest say what is locked. */
export const connectorPolicy = (scope: ProfileScope) => call(scope, 'connectors.policy.get', {})

/** One connector's tool list; `refresh` asks the backend's 24 h cache to revalidate. */
export const connectorTools = (scope: ProfileScope, slug: string, refresh = false) =>
  call(scope, 'connectors.tools', { refresh, slug })

/** The live snapshot of an account operation, for a window that joined one it did not start. */
export const accountOperationStatus = (scope: ProfileScope, opId: string) =>
  call(scope, 'connectors.operation.status', { op_id: opId, owner: ACCOUNT_OWNER })

// ── writes ─────────────────────────────────────────────────────────────────

/** `expectedRevision` is the compare-and-set token: the revision the writer was looking at. */
export const setConnectorPolicy = (
  scope: ProfileScope,
  change: ConnectorChange | ToolsChange,
  expectedRevision?: string
) =>
  call(
    scope,
    'connectors.policy.set',
    expectedRevision === undefined ? { change } : { change, expected_revision: expectedRevision },
    'foreground'
  )

/** Forget one signed-in account; the app stays in the catalog. */
export const removeConnectorAccount = (scope: ProfileScope, connectionId: string) =>
  call(scope, 'connectors.accounts.remove', { connection_id: connectionId }, 'foreground')

/** Open (or re-mint) an authorization, owned by the account rather than by a chat. */
export const connectAccountConnectors = (scope: ProfileScope, connectors: readonly string[], reconnect = false) =>
  call(scope, 'connectors.connect', { connectors: [...connectors], owner: ACCOUNT_OWNER, reconnect }, 'foreground')

/** The return from the browser: look at the operation now instead of at the next poll. */
export const wakeAccountOperation = (scope: ProfileScope, opId: string) =>
  call(scope, 'connectors.operation.wake', { op_id: opId, owner: ACCOUNT_OWNER }, 'foreground')

/** The connect element's answer: a per-target outcome, or Continue for "Stop waiting". */
export const respondToAccountOperation = (scope: ProfileScope, opId: string, result: ConnectionAnswer) =>
  call(scope, 'connection.respond', { op_id: opId, owner: ACCOUNT_OWNER, result }, 'foreground')
