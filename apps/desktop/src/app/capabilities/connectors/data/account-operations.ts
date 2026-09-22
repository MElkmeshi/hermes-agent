// Connect is never optimistic: nothing enters this store until the backend answered.

import type {
  ConnectionOperationStatus,
  ConnectionSettleReason,
  ConnectionUpdatePayload,
  ConnectorsConnectResult
} from '@hermes/shared'
import { atom } from 'nanostores'

import type { ProfileScope } from '@/hermes'
import { type ConnectionTarget, parseConnectionTarget } from '@/store/connection-request'

import { invalidateConnectors } from './keys'
import { accountOperationStatus } from './rpc'

export interface AccountOperation {
  connectors: string[]
  /** Unix seconds; backend-owned. */
  deadlineAt: number
  opId: string
  /** The scope the operation started under; a settle refetches THAT scope's reads. */
  scope: ProfileScope
  /** The newest frame applied: the transport can reorder frames, and an older one would regress a target. */
  seq: number
  settled: boolean
  settledBy: ConnectionSettleReason | null
  targets: ConnectionTarget[]
}

export const $accountOperations = atom<Readonly<Record<string, AccountOperation>>>({})

/** The pending account outlives the operation, so until the reads catch up the rows still say `Connecting`. */
export const $abandonedConnects = atom<readonly string[]>([])

/** Stop waiting, in the current frame: the reads that follow only confirm it. */
export function abandonConnect(slugs: readonly string[]): void {
  const kept = $abandonedConnects.get().filter(slug => !slugs.includes(slug))

  $abandonedConnects.set([...kept, ...slugs])
}

function resumeConnect(slugs: readonly string[]): void {
  const next = $abandonedConnects.get().filter(slug => !slugs.includes(slug))

  if (next.length !== $abandonedConnects.get().length) {
    $abandonedConnects.set(next)
  }
}

const parseTargets = (targets: ConnectionUpdatePayload['targets']): ConnectionTarget[] =>
  targets.map(parseConnectionTarget).filter((target): target is ConnectionTarget => target !== null)

/** The operation open for one app. A plain selector, because a store per card would churn on every frame. */
export function accountOperationFor(
  operations: Readonly<Record<string, AccountOperation>>,
  slug: string
): AccountOperation | null {
  const mine = Object.values(operations).filter(operation => operation.connectors.includes(slug))

  // An unsettled operation is the live one; among settled ones the newest is what the person is still looking at.
  return mine.find(operation => !operation.settled) ?? mine[mine.length - 1] ?? null
}

/** Record the operation `connectors.connect` just opened. */
export function startAccountOperation(
  scope: ProfileScope,
  connectors: readonly string[],
  snapshot: ConnectorsConnectResult
): AccountOperation {
  const operation: AccountOperation = {
    connectors: [...connectors],
    deadlineAt: snapshot.deadline_at,
    opId: snapshot.op_id,
    scope,
    seq: snapshot.seq,
    settled: snapshot.settled,
    settledBy: snapshot.settled_by ?? null,
    targets: parseTargets(snapshot.targets)
  }

  resumeConnect(operation.connectors)

  // A finished attempt on the same app is history the moment a new one opens.
  const kept = Object.entries($accountOperations.get()).filter(
    ([, previous]) => !previous.settled || !previous.connectors.some(slug => operation.connectors.includes(slug))
  )

  $accountOperations.set({ ...Object.fromEntries(kept), [operation.opId]: operation })
  refetchOnSettle(operation)

  return operation
}

/** An ACCOUNT broadcast reaches every client, so the backend strips the link from it; only a reply carries one. */
function carryLink(held: ConnectionTarget | undefined, target: ConnectionTarget): ConnectionTarget {
  if (!held) {
    return target
  }

  // A target back at `initiated` is a new attempt, so the held link is spent.
  const reissued = target.state === 'initiated' && held.state !== 'initiated'

  return {
    ...target,
    connectUrl: target.connectUrl ?? (reissued ? null : held.connectUrl),
    connectionId: target.connectionId || held.connectionId
  }
}

/** A `broadcast` at a seq that did not move is a reorder; only a `reply` carries the link. */
type SnapshotSource = 'broadcast' | 'reply'

/** Every snapshot carries the whole target list, so it is taken as given; only the link is carried across. */
function applySnapshot(
  opId: string,
  snapshot: Pick<ConnectionOperationStatus, 'deadline_at' | 'seq' | 'settled' | 'settled_by' | 'targets'>,
  source: SnapshotSource
): void {
  const current = $accountOperations.get()[opId]

  if (!current || (source === 'broadcast' ? snapshot.seq <= current.seq : snapshot.seq < current.seq)) {
    return
  }

  const held = new Map(current.targets.map(target => [target.name, target] as const))

  const next: AccountOperation = {
    ...current,
    deadlineAt: snapshot.deadline_at,
    seq: snapshot.seq,
    settled: snapshot.settled,
    settledBy: snapshot.settled_by ?? null,
    targets: parseTargets(snapshot.targets).map(target => carryLink(held.get(target.name), target))
  }

  $accountOperations.set({ ...$accountOperations.get(), [next.opId]: next })
  refetchOnSettle(next)
}

/** Apply one account-owned `connection.update`; a frame for an operation this window never started is dropped. */
export function applyAccountConnectionUpdate(payload: ConnectionUpdatePayload): void {
  if (payload.owner.type !== 'account') {
    return
  }

  applySnapshot(payload.op_id, payload, 'broadcast')
}

/** Ask for the operation again — the only way to get a link this window does not hold. Silent on failure. */
export async function syncAccountOperation(opId: string): Promise<void> {
  const operation = $accountOperations.get()[opId]

  if (!operation) {
    return
  }

  try {
    const status = await accountOperationStatus(operation.scope, opId)
    applySnapshot(opId, status, 'reply')
  } catch {
    // A settled operation leaves the live registry, and the refetch settling scheduled is the answer.
  }
}

/** Drop one operation: the dialog closed on a finished connect, or the person stopped waiting. */
export function clearAccountOperation(opId: string): void {
  const operations = $accountOperations.get()

  if (!(opId in operations)) {
    return
  }

  const next = { ...operations }
  delete next[opId]
  $accountOperations.set(next)
}

/** A settle makes the list and the accounts wrong whatever it settled as; the tools and the catalog did not. */
function refetchOnSettle(operation: AccountOperation): void {
  if (!operation.settled) {
    return
  }

  invalidateConnectors(operation.scope, 'list', 'accounts')
}
