import { afterEach, describe, expect, it } from 'vitest'

import { profileScopeKey } from '@/hermes'
import { writeJson } from '@/lib/storage'
import { $freeTierStatus } from '@/store/free-tier'
import type { FreeTierStatus } from '@/types/hermes'

import { clearPersisted, seedOptions } from './persist'

const SCOPE = 'work'

// The stored shape IS the contract across a restart, so the test writes it by hand.
const STORAGE_KEY = `hermes.connectors.v1.${profileScopeKey(SCOPE)}`
const IDENTITY_KEY = 'hermes.connectors.identity.v1'

const identity = (has_guest: boolean): FreeTierStatus => ({
  available: true,
  enabled: true,
  has_guest,
  label: 'free tier',
  model: 'model',
  notice_pending: false
})

const stored = { connectors: [{ connector: 'gmail', connected: true }] }

const write = () => writeJson(STORAGE_KEY, { freeTier: false, list: { at: 1000, data: stored } })

afterEach(() => {
  clearPersisted(SCOPE)
  writeJson(IDENTITY_KEY, null)
  $freeTierStatus.set(null)
})

describe('the persisted page', () => {
  it('paints the last answer at its real age, so a cold start does not wait', () => {
    $freeTierStatus.set(identity(false))
    write()

    expect(seedOptions(SCOPE, 'list')).toEqual({ initialData: stored, initialDataUpdatedAt: 1000 })
  })

  it('paints before the identity read answers, off the mirror the last session left', () => {
    writeJson(IDENTITY_KEY, false)
    write()

    // The atom is still `null`: this is the cold start the whole cache exists for.
    expect(seedOptions(SCOPE, 'list')).toEqual({ initialData: stored, initialDataUpdatedAt: 1000 })
  })

  it('keeps nothing at all while no identity is known', () => {
    write()

    expect(seedOptions(SCOPE, 'list')).toEqual({})
  })

  it('never paints one identity’s apps under another', () => {
    $freeTierStatus.set(identity(false))
    write()
    // Signing out flips the flag, and the previous account's connected apps must not come back.
    $freeTierStatus.set(identity(true))

    expect(seedOptions(SCOPE, 'list')).toEqual({})
  })

  it('has nothing to give for a read it never stores, or after the page is cleared', () => {
    $freeTierStatus.set(identity(false))
    write()

    expect(seedOptions(SCOPE, 'accounts')).toEqual({})

    clearPersisted(SCOPE)

    expect(seedOptions(SCOPE, 'list')).toEqual({})
  })
})
