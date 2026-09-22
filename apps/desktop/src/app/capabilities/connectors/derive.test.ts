import { describe, expect, it } from 'vitest'

import {
  bothWaysOn,
  bundledWay,
  deriveCards,
  EMPTY_CONNECTORS_FILTER,
  forgetAbandoned,
  hostedPhase,
  hostedWay,
  localWay,
  mergeCard,
  twinPillOf
} from './derive'
import { derivePage, groupIdOf } from './derive-page'
import { BUNDLED, HOSTED, LOCAL, TITLES, WAYS_BUNDLED, WAYS_HOSTED, WAYS_LOCAL, WAYS_SLUG } from './fixtures'
import type { ConnectorCardModel, ConnectorSegmentId } from './types'

const cards = deriveCards({ bundled: [], hosted: HOSTED, local: LOCAL, titles: TITLES })
const cardFor = (slug: string) => cards.find(card => card.slug === slug)
const ALL = EMPTY_CONNECTORS_FILTER

const slugs = (list: readonly ConnectorCardModel[]) => list.map(card => card.slug)

describe('card derivation', () => {
  it('reads the account status, the personal switch and the org rule in that order', () => {
    expect(cardFor('gmail')).toMatchObject({ state: 'connected', stateWord: 'connected' })
    expect(cardFor('notion')).toMatchObject({ state: 'expired', stateWord: 'accessExpired', verb: 'reconnect' })
    expect(cardFor('sentry')).toMatchObject({ state: 'broken', stateWord: 'couldNotConnect', verb: 'reconnect' })
    expect(cardFor('slack')).toMatchObject({ state: 'available', stateWord: 'available', verb: 'connect' })
    expect(cardFor('shopify')).toMatchObject({ offBy: 'me', state: 'off', verb: 'turnBackOn' })
    expect(cardFor('stripe')).toMatchObject({ offBy: 'org', state: 'off', stateWord: 'offByYourOrganisation' })
    // An app the org took away gets no verb: none of them would work.
    expect(cardFor('stripe')?.verb).toBeUndefined()
  })

  it('prefers the provider’s own sentence for a broken connection', () => {
    expect(cardFor('notion')?.reason).toEqual({
      key: 'reconnect',
      text: 'Authorization expired. Reconnect to continue.'
    })
  })

  it('carries at most one fact', () => {
    expect(cardFor('gmail')?.fact).toEqual({ count: 4, key: 'toolsOff' })
    expect(cardFor('slack')?.fact).toBeUndefined()
  })

  it('says how much of a local server is live', () => {
    expect(cardFor('github')?.fact).toEqual({ count: 31, key: 'toolsSomeOn', on: 29 })
    expect(cardFor('postgres')?.fact).toEqual({ count: 8, key: 'toolsOn' })
  })

  it('says a server is unused instead of counting it, so the word can be read', () => {
    const idle = mergeCard({
      inCatalog: false,
      name: 'Postgres',
      slug: 'postgres',
      ways: { hosted: null, local: localWay({ ...LOCAL[1], toolsOn: 8, toolsTotal: 8, unused: true }) }
    })

    // The lane holds one fact, so a count here would leave "On, unused" unreachable.
    expect(idle.stateWord).toBe('serverOnUnused')
    expect(idle.fact).toBeUndefined()
  })

  it('treats a never-probed server as connecting, not as working', () => {
    expect(localWay({ ...LOCAL[1], status: 'unknown' })).toMatchObject({ state: 'connecting' })
  })

  it('sends a server the browser flow would corrupt to its logs, still saying it needs authentication', () => {
    const base = { ...LOCAL[1], status: 'needs-auth' as const }

    expect(localWay(base).verb).toBe('authenticate')
    expect(
      mergeCard({
        inCatalog: false,
        name: 'Postgres',
        slug: 'postgres',
        ways: { hosted: null, local: localWay({ ...base, canAuthenticate: false }) }
      })
    ).toMatchObject({ stateWord: 'serverNeedsAuth', verb: 'openLogs' })
  })

  it('keeps the switch on the local way and the word on the card', () => {
    const off = localWay({ ...LOCAL[1], enabled: false })
    const card = mergeCard({ inCatalog: false, name: 'Postgres', slug: 'postgres', ways: { hosted: null, local: off } })

    expect(off).toMatchObject({ serverEnabled: false, state: 'off', verb: undefined })
    expect(card).toMatchObject({ offBy: 'me', stateWord: 'serverOff' })
  })

  it('reads a connected row with no status as active', () => {
    expect(hostedWay({ ...HOSTED[0], connectionStatus: undefined }).state).toBe('connected')
  })

  it('names neither an identity nor a date for a sign-in nobody finished', () => {
    const waiting = hostedWay({ ...HOSTED[0], connectionStatus: 'pending' })

    expect(waiting).toMatchObject({ state: 'connecting', verb: 'stopWaiting' })
    expect(waiting.accountLabel).toBeUndefined()
    expect(waiting.connectedAt).toBeUndefined()
  })

  it('gives back a sign-in the person stopped waiting for', () => {
    const waiting = { ...HOSTED[0], connectionStatus: 'pending' as const }
    const [row] = forgetAbandoned([waiting], new Set([waiting.slug]))

    expect(hostedWay(row)).toMatchObject({ state: 'available', verb: 'connect' })
    // Another app's pending sign-in is none of its business.
    expect(forgetAbandoned([waiting], new Set(['elsewhere']))[0]).toBe(waiting)
  })

  it('keeps one name across an install', () => {
    const offered = deriveCards({ bundled: [BUNDLED[2]], hosted: [], local: [] })

    const installed = deriveCards({
      bundled: [],
      hosted: [],
      local: [{ enabled: true, name: 'filesystem', status: 'ok', target: 'npx filesystem' }]
    })

    expect(offered[0]?.name).toBe('Filesystem')
    expect(installed[0]?.name).toBe('Filesystem')
  })
})

describe('an app that exists both ways', () => {
  const combination = (hosted: boolean, local: 'installed' | 'none' | 'offered') =>
    deriveCards({
      bundled: local === 'offered' ? [WAYS_BUNDLED] : [],
      hosted: hosted ? [WAYS_HOSTED] : [],
      local: local === 'installed' ? [WAYS_LOCAL] : [],
      titles: { [WAYS_SLUG]: 'Monday' }
    })

  it('draws one card per combination, in the right group, with the right primary verb', () => {
    const table = [
      {
        expected: { group: 'available', pill: null, residency: 'hosted', verb: 'connect' },
        hosted: true,
        local: 'none'
      },
      {
        expected: { group: 'available', pill: 'alsoLocal', residency: 'hosted', verb: 'connect' },
        hosted: true,
        local: 'offered'
      },
      {
        expected: { group: 'local', pill: 'hostedTwin', residency: 'local', verb: undefined },
        hosted: true,
        local: 'installed'
      },
      {
        expected: { group: 'local', pill: null, residency: 'local', verb: undefined },
        hosted: false,
        local: 'installed'
      },
      {
        expected: { group: 'available', pill: null, residency: 'local', verb: 'install' },
        hosted: false,
        local: 'offered'
      }
    ] as const

    for (const row of table) {
      const [card, ...rest] = combination(row.hosted, row.local)

      expect(rest).toHaveLength(0)
      expect({ group: groupIdOf(card), pill: twinPillOf(card), residency: card.residency, verb: card.verb }).toEqual(
        row.expected
      )
    }
  })

  it('knows when Hermes would see every tool twice', () => {
    const connected = { ...WAYS_HOSTED, connected: true, connectionStatus: 'active' as const }

    expect(bothWaysOn({ hosted: hostedWay(connected), local: localWay(WAYS_LOCAL) })).toBe(true)
    expect(bothWaysOn({ hosted: hostedWay(connected), local: bundledWay(WAYS_BUNDLED) })).toBe(false)
    expect(bothWaysOn({ hosted: hostedWay(WAYS_HOSTED), local: localWay(WAYS_LOCAL) })).toBe(false)
  })
})

describe('the bundled catalog on the page', () => {
  const withBundled = deriveCards({ bundled: BUNDLED, hosted: HOSTED, local: LOCAL, titles: TITLES })

  it('adds no second card for an entry whose manifest names an app the list offers', () => {
    expect(withBundled.filter(card => card.slug === 'slack')).toHaveLength(1)
    expect(twinPillOf(withBundled.find(card => card.slug === 'slack')!)).toBe('alsoLocal')
  })

  it('gives an entry with no offered twin its own Available card, with Install', () => {
    expect(withBundled.find(card => card.slug === 'airtable')).toMatchObject({
      name: 'Airtable',
      residency: 'local',
      state: 'available',
      stateWord: 'notInstalled',
      verb: 'install'
    })
    expect(withBundled.find(card => card.slug === 'filesystem')?.verb).toBe('install')
  })

  it('lets an installed server beat the bundled entry of the same app', () => {
    const installed = deriveCards({ bundled: [WAYS_BUNDLED], hosted: [], local: [WAYS_LOCAL] })

    expect(installed).toHaveLength(1)
    expect(installed[0].ways.local).toMatchObject({ installed: true, serverName: 'monday-server' })
  })
})

describe('the page', () => {
  it('counts every segment as the length of the group it labels', () => {
    const { groups, segments } = derivePage(cards, ALL)

    for (const segment of segments.filter(entry => entry.id !== 'all')) {
      expect(segment.count).toBe(groups.find(group => group.id === segment.id)?.cards.length)
    }

    // A connected server on this Mac is counted once, in On this Mac, and never in Connected.
    expect(segments.find(entry => entry.id === 'connected')?.count).toBe(3)
    expect(slugs(groups.find(group => group.id === 'local')?.cards ?? [])).toContain('github')
  })

  it('orders the groups, puts broken connections first and drops the empty ones', () => {
    const { groups } = derivePage(cards, ALL)

    expect(groups.map(group => group.id)).toEqual(['connected', 'local', 'available', 'off'])
    expect(slugs(groups[0].cards)).toEqual(['sentry', 'notion', 'gmail'])
    expect(derivePage([], ALL)).toMatchObject({ groups: [], segments: [] })
  })

  it('omits a segment with no cards and shows only the chosen one', () => {
    const connectedOnly = cards.filter(card => groupIdOf(card) === 'connected')
    const { groups, segments } = derivePage(connectedOnly, ALL)

    expect(segments.map(segment => segment.id)).toEqual(['all', 'connected'])
    expect(derivePage(cards, { ...ALL, segment: 'off' }).groups.map(group => group.id)).toEqual(['off'])
    expect(groups).toHaveLength(1)
  })

  it('reports the matches the chosen segment hides, and only under a search', () => {
    const query = { ...ALL, query: 'git', segment: 'connected' as ConnectorSegmentId }

    expect(derivePage(cards, query).hiddenMatches).toBe(1)
    expect(derivePage(cards, { ...query, query: '' }).hiddenMatches).toBe(0)
    expect(derivePage(cards, { ...ALL, query: 'git' }).hiddenMatches).toBe(0)
  })

  it('matches the query against the slug and the name', () => {
    expect(slugs(derivePage(cards, { ...ALL, query: 'GIT' }).groups.flatMap(group => group.cards))).toEqual(['github'])
    expect(derivePage(cards, { ...ALL, query: '   ' }).segments[0].count).toBe(cards.length)
  })
})

describe('the hosted half’s phase', () => {
  it('is ready once the list itself answers', () => {
    expect(hostedPhase({ available: true, errored: false, pending: false, reason: null })).toBe('ready')
  })

  it('takes its verdict from the list alone', () => {
    expect(hostedPhase({ errored: true, pending: false, reason: 'NEEDS_NOUS_AUTH' })).toBe('signedOut')
    expect(hostedPhase({ errored: true, pending: false, reason: 'CONNECTORS_UNAVAILABLE' })).toBe('unavailable')
    expect(hostedPhase({ errored: true, pending: false, reason: null })).toBe('failed')
    expect(hostedPhase({ errored: false, pending: true, reason: null })).toBe('loading')
    expect(hostedPhase({ available: false, errored: false, pending: false, reason: null })).toBe('unavailable')
  })
})
