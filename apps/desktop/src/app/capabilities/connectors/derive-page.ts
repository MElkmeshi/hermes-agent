// The directory's own shape: which group a card belongs to, and what one segment press will show.

import type {
  ConnectorCardModel,
  ConnectorGroupId,
  ConnectorGroupModel,
  ConnectorPageModel,
  ConnectorSegmentModel,
  ConnectorsFilter,
  ConnectorState
} from './types'

/** Attention sorts first inside Connected: it is the only thing here that stopped working on its own. */
const STATE_RANK = {
  available: 4,
  broken: 0,
  connected: 3,
  connecting: 2,
  expired: 1,
  off: 5
} satisfies Record<ConnectorState, number>

const GROUP_OF = {
  available: 'available',
  broken: 'connected',
  connected: 'connected',
  connecting: 'connected',
  expired: 'connected',
  off: 'off'
} satisfies Record<ConnectorState, ConnectorGroupId>

const GROUP_ORDER: readonly ConnectorGroupId[] = ['connected', 'local', 'available', 'off']

/** The one classifier. Groups and segment counts both call it, so they cannot disagree. */
export function groupIdOf(card: ConnectorCardModel): ConnectorGroupId {
  return card.residency === 'local' && card.state !== 'available' ? 'local' : GROUP_OF[card.state]
}

function byStateThenName(a: ConnectorCardModel, b: ConnectorCardModel): number {
  return STATE_RANK[a.state] - STATE_RANK[b.state] || a.name.localeCompare(b.name)
}

export function cardMatchesQuery(card: ConnectorCardModel, query: string): boolean {
  const needle = query.trim().toLowerCase()

  return needle.length === 0 || card.slug.toLowerCase().includes(needle) || card.name.toLowerCase().includes(needle)
}

function groupCards(cards: readonly ConnectorCardModel[]): ConnectorGroupModel[] {
  const buckets = new Map<ConnectorGroupId, ConnectorCardModel[]>()

  for (const card of cards) {
    const id = groupIdOf(card)
    const bucket = buckets.get(id)

    if (bucket) {
      bucket.push(card)
    } else {
      buckets.set(id, [card])
    }
  }

  return GROUP_ORDER.filter(id => (buckets.get(id)?.length ?? 0) > 0).map(id => ({
    cards: [...buckets.get(id)!].sort(byStateThenName),
    id
  }))
}

export function showsAttentionFirst({ cards }: ConnectorGroupModel): boolean {
  return cards.length > 1 && cards.some(card => card.state === 'broken' || card.state === 'expired')
}

/** The search narrows first, so every segment count promises exactly what pressing it shows. */
export function derivePage(
  cards: readonly ConnectorCardModel[],
  { query, segment }: ConnectorsFilter
): ConnectorPageModel {
  const matches = cards.filter(card => cardMatchesQuery(card, query))
  const groups = groupCards(matches)

  const segments: ConnectorSegmentModel[] = matches.length === 0 ? [] : [{ count: matches.length, id: 'all' }]

  for (const group of groups) {
    segments.push({ count: group.cards.length, id: group.id })
  }

  // A segment with nothing in it is never drawn, so a search that empties the chosen one falls back to All.
  const shownSegment = segments.some(candidate => candidate.id === segment) ? segment : 'all'
  const chosen = shownSegment === 'all' ? groups : groups.filter(group => group.id === shownSegment)
  const shown = chosen.reduce((total, group) => total + group.cards.length, 0)

  return {
    groups: chosen,
    // A search that found something the chosen segment hides says so; a bare segment press is not a surprise.
    hiddenMatches: shownSegment === 'all' || query.trim() === '' ? 0 : matches.length - shown,
    segment: shownSegment,
    segments
  }
}
