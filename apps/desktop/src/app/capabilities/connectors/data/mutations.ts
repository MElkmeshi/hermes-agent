// Every write answers a typed outcome instead of throwing: the words belong to i18n, and this folder holds none.

import type { ConnectionAnswer, ConnectorPolicyGetResult } from '@hermes/shared'
import { useCallback, useRef, useState } from 'react'

import type { ProfileScope } from '@/hermes'
import { queryClient } from '@/lib/query-client'

import type { SaveResult } from '../use-tools-editor'

import {
  $accountOperations,
  abandonConnect,
  type AccountOperation,
  clearAccountOperation,
  startAccountOperation
} from './account-operations'
import { memberDisabledTools, memberRevision, readPolicy } from './join'
import { connectorsPolicyQueryKey, invalidateConnectors } from './keys'
import {
  asConnectorError,
  connectAccountConnectors,
  connectorPolicy,
  type ConnectorRpcError,
  isConnectorReason,
  removeConnectorAccount,
  respondToAccountOperation,
  setConnectorPolicy
} from './rpc'

export type WriteOutcome = { error: ConnectorRpcError; ok: false } | { ok: true }

const failed = (error: unknown) => ({ error: asConnectorError(error), ok: false as const })

const attempt = async (run: () => Promise<unknown>): Promise<WriteOutcome> => {
  try {
    await run()

    return { ok: true }
  } catch (error) {
    return failed(error)
  }
}

// The token for the next write is the revision the backend just answered, not the one still on screen.
interface WrittenRevision {
  after: string | undefined
  revision: string
}

const tokenFor = (written: null | WrittenRevision, seen: string | undefined): string | undefined =>
  written && written.after === seen ? written.revision : seen

const remember = (seen: string | undefined, revision: string | undefined): null | WrittenRevision =>
  revision === undefined ? null : { after: seen, revision }

// ── the tool editor's compare-and-set write ────────────────────────────────

export interface ConnectorToolsSaver {
  onSave: (disabled: string[]) => Promise<SaveResult>
  reload: () => void
  /** The rule the other editor saved, set only while a conflict is unresolved. */
  theirs: string[] | null
}

/** Save one connector's tool rule. A losing write answers `conflict`, carrying what the other editor saved. */
export function useConnectorToolsSave(
  scope: ProfileScope,
  connector: string,
  seenRevision: string | undefined
): ConnectorToolsSaver {
  const [theirs, setTheirs] = useState<string[] | null>(null)
  // A ref, not state: as state it would re-render the editor mid-save.
  const written = useRef<null | WrittenRevision>(null)

  const reload = useCallback(() => {
    setTheirs(null)
    // The remembered revision stays: it is the one that would win, and the refetch supersedes it.
    invalidateConnectors(scope, 'policy')
  }, [scope])

  const onSave = useCallback(
    // The editor's `overwrite` option is deliberately ignored: the token is always the freshest revision known.
    async (disabled: string[]): Promise<SaveResult> => {
      const expected = tokenFor(written.current, seenRevision)

      try {
        const result = await setConnectorPolicy(scope, { connector, disabled_tools: disabled, type: 'tools' }, expected)

        written.current = remember(seenRevision, result.revision)
      } catch (error) {
        if (!isConnectorReason(error, 'POLICY_CONFLICT')) {
          return 'failed'
        }

        try {
          // Read without writing the cache: the cached rule is the editor's baseline for the conflict view.
          const policy = readPolicy((await connectorPolicy(scope)).layers)

          written.current = remember(seenRevision, memberRevision(policy))
          setTheirs([...memberDisabledTools(policy, connector)])

          return 'conflict'
        } catch {
          // Their version could not be read, so there is no conflict to show — only a save that did not happen.
          return 'failed'
        }
      }

      setTheirs(null)
      // The policy is the source of every "off" on this page, so a write to it makes the list's own flags stale too.
      invalidateConnectors(scope, 'policy', 'list')

      return 'saved'
    },
    [connector, scope, seenRevision]
  )

  return { onSave, reload, theirs }
}

// ── the connector's own switch ─────────────────────────────────────────────

export interface ConnectorSwitch {
  /** The connector whose write is in flight. */
  pending: null | string
  setEnabled: (connector: string, enabled: boolean) => Promise<WriteOutcome>
}

/** "Off for you" / "Turn back on", and the dialog's own switch. */
export function useConnectorSwitch(scope: ProfileScope): ConnectorSwitch {
  const [pending, setPending] = useState<null | string>(null)
  const written = useRef<null | WrittenRevision>(null)

  const setEnabled = useCallback(
    async (connector: string, enabled: boolean): Promise<WriteOutcome> => {
      setPending(connector)

      try {
        return await attempt(async () => {
          // The token is simply the freshest revision the page holds; sending none would make the write unconditional.
          const cached = queryClient.getQueryData<ConnectorPolicyGetResult>(connectorsPolicyQueryKey(scope))
          const seen = cached ? memberRevision(readPolicy(cached.layers)) : undefined

          const result = await setConnectorPolicy(
            scope,
            { connector, enabled, type: 'connector' },
            tokenFor(written.current, seen)
          )

          written.current = remember(seen, result.revision)
          invalidateConnectors(scope, 'policy', 'list')
        })
      } finally {
        setPending(null)
      }
    },
    [scope]
  )

  return { pending, setEnabled }
}

// ── disconnect ─────────────────────────────────────────────────────────────

export interface AccountDisconnect {
  disconnect: (connectionId: string) => Promise<WriteOutcome>
  pending: boolean
}

/** Forget one account; the caller asks through `ConfirmDialog` first. */
export function useDisconnectAccount(scope: ProfileScope): AccountDisconnect {
  const [pending, setPending] = useState(false)

  const disconnect = useCallback(
    async (connectionId: string): Promise<WriteOutcome> => {
      setPending(true)

      try {
        return await attempt(async () => {
          await removeConnectorAccount(scope, connectionId)
          invalidateConnectors(scope, 'list', 'accounts')
        })
      } finally {
        setPending(false)
      }
    },
    [scope]
  )

  return { disconnect, pending }
}

// ── connect ────────────────────────────────────────────────────────────────

export type ConnectOutcome = { error: ConnectorRpcError; ok: false } | { ok: true; operation: AccountOperation }

export interface ConnectorConnect {
  /** Connect, or Try again / Reconnect. Later facts arrive as `connection.update` frames, never from here. */
  connect: (slug: string, options?: { reconnect?: boolean }) => Promise<ConnectOutcome>
  /** Stop waiting: end the operation now and forget it. */
  giveUp: (opId: string) => Promise<WriteOutcome>
  /** The connector whose connect is in flight. */
  pending: null | string
}

export function useConnectConnector(scope: ProfileScope): ConnectorConnect {
  const [pending, setPending] = useState<null | string>(null)

  const connect = useCallback(
    async (slug: string, options?: { reconnect?: boolean }): Promise<ConnectOutcome> => {
      setPending(slug)

      try {
        const snapshot = await connectAccountConnectors(scope, [slug], options?.reconnect ?? false)

        return { ok: true, operation: startAccountOperation(scope, [slug], snapshot) }
      } catch (error) {
        return failed(error)
      } finally {
        setPending(null)
      }
    },
    [scope]
  )

  const respond = useCallback(
    (opId: string, answer: ConnectionAnswer): Promise<WriteOutcome> =>
      attempt(() => respondToAccountOperation(scope, opId, answer)),
    [scope]
  )

  const giveUp = useCallback(
    async (opId: string): Promise<WriteOutcome> => {
      const operation = $accountOperations.get()[opId]

      // The card goes back in this frame: a refused Continue still means the person stopped waiting.
      abandonConnect(operation?.connectors ?? [])
      clearAccountOperation(opId)

      const outcome = await respond(opId, { settled_by: 'continue' })

      // The account the mint opened outlives the operation, so the list would keep answering `pending`.
      for (const target of operation?.targets ?? []) {
        if (target.state !== 'connected' && target.connectionId) {
          await attempt(() => removeConnectorAccount(scope, target.connectionId))
        }
      }

      invalidateConnectors(scope, 'list', 'accounts')

      return outcome
    },
    [respond, scope]
  )

  return { connect, giveUp, pending }
}
