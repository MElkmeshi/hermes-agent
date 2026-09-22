import type { ConnectionUpdatePayload, ConnectorsConnectResult } from '@hermes/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { queryClient } from '@/lib/query-client'

// The status RPC, and only it: the store calls nothing else on the wire.
const { statusReply } = vi.hoisted(() => ({ statusReply: vi.fn() }))

vi.mock('./rpc', () => ({ accountOperationStatus: (...args: unknown[]) => statusReply(...args) }))

import {
  $accountOperations,
  accountOperationFor,
  applyAccountConnectionUpdate,
  clearAccountOperation,
  startAccountOperation,
  syncAccountOperation
} from './account-operations'
import { connectorsAccountsQueryKey, connectorsListQueryKey } from './keys'

const snapshot = (overrides: Partial<ConnectorsConnectResult> = {}): ConnectorsConnectResult => ({
  deadline_at: 1_772_000_600,
  op_id: 'op-1',
  seq: 1,
  settled: false,
  targets: [{ action: 'authorize', kind: 'connector', name: 'gmail', state: 'initiated' }],
  ...overrides
})

const frame = (overrides: Partial<ConnectionUpdatePayload> = {}): ConnectionUpdatePayload => ({
  deadline_at: 1_772_000_600,
  op_id: 'op-1',
  owner: { type: 'account' },
  seq: 2,
  settled: false,
  targets: [{ action: 'authorize', kind: 'connector', name: 'gmail', state: 'connected' }],
  ...overrides
})

describe('account operations', () => {
  beforeEach(() => {
    $accountOperations.set({})
    vi.restoreAllMocks()
  })

  it('applies a newer frame and ignores one the transport reordered behind it', () => {
    startAccountOperation('omar', ['gmail'], snapshot())

    applyAccountConnectionUpdate(frame())
    expect($accountOperations.get()['op-1'].targets[0].state).toBe('connected')

    applyAccountConnectionUpdate(
      frame({ seq: 1, targets: [{ action: 'authorize', kind: 'connector', name: 'gmail', state: 'pending' }] })
    )
    expect($accountOperations.get()['op-1'].targets[0].state).toBe('connected')
  })

  it('keeps the link a broadcast cannot carry, and drops it when the target is re-minted', () => {
    // An ACCOUNT broadcast reaches every client, so the backend strips the link from it: only a reply carries one.
    startAccountOperation(
      'omar',
      ['gmail'],
      snapshot({
        targets: [
          {
            action: 'authorize',
            connect_url: 'https://example.invalid/a',
            kind: 'connector',
            name: 'gmail',
            state: 'initiated'
          }
        ]
      })
    )

    applyAccountConnectionUpdate(
      frame({ targets: [{ action: 'authorize', kind: 'connector', name: 'gmail', state: 'pending' }] })
    )
    expect($accountOperations.get()['op-1'].targets[0].connectUrl).toBe('https://example.invalid/a')

    // Back to `initiated` is a NEW attempt; the held link is spent.
    applyAccountConnectionUpdate(
      frame({ seq: 3, targets: [{ action: 'authorize', kind: 'connector', name: 'gmail', state: 'initiated' }] })
    )
    expect($accountOperations.get()['op-1'].targets[0].connectUrl).toBeNull()
  })

  it('leaves a session-owned frame to the chat card', () => {
    startAccountOperation('omar', ['gmail'], snapshot())

    applyAccountConnectionUpdate(frame({ owner: { session_id: 's-1', type: 'session' } }))

    expect($accountOperations.get()['op-1'].seq).toBe(1)
  })

  it('refetches the list and the accounts once an operation settles', () => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockReturnValue(Promise.resolve())

    startAccountOperation('omar', ['gmail'], snapshot())
    expect(invalidate).not.toHaveBeenCalled()

    // A settle that connected nothing still has to stop the row saying "Connecting…".
    applyAccountConnectionUpdate(
      frame({
        settled: true,
        settled_by: 'deadline',
        targets: [{ action: 'authorize', kind: 'connector', name: 'gmail', state: 'not_connected' }]
      })
    )

    expect(invalidate).toHaveBeenCalledWith({ queryKey: connectorsListQueryKey('omar') })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: connectorsAccountsQueryKey('omar') })
  })

  it('takes a status reply at the seq it already holds, because that reply is the only copy of the link', async () => {
    startAccountOperation('omar', ['gmail'], snapshot())

    statusReply.mockResolvedValue({
      deadline_at: 1_772_000_600,
      op_id: 'op-1',
      seq: 1,
      settled: false,
      targets: [
        {
          action: 'authorize',
          connect_url: 'https://example.invalid/b',
          kind: 'connector',
          name: 'gmail',
          state: 'initiated'
        }
      ]
    })

    await syncAccountOperation('op-1')

    expect($accountOperations.get()['op-1'].targets[0].connectUrl).toBe('https://example.invalid/b')
  })

  it('replaces a finished attempt when the same app is connected again', () => {
    startAccountOperation('omar', ['gmail'], snapshot({ settled: true, settled_by: 'deadline' }))
    startAccountOperation('omar', ['gmail'], snapshot({ op_id: 'op-2' }))

    expect(Object.keys($accountOperations.get())).toEqual(['op-2'])

    clearAccountOperation('op-2')

    expect(accountOperationFor($accountOperations.get(), 'gmail')).toBeNull()
  })
})
