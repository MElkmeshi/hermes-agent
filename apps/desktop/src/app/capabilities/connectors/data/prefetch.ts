// Opening a dialog must find the tools already there, so the page fetches them before it is asked.

import { useEffect, useMemo } from 'react'

import type { ProfileScope } from '@/hermes'
import { queryClient } from '@/lib/query-client'

import type { ConnectorCardModel } from '../types'

import { connectorToolsQueryOptions } from './queries'

/** Enough to cover a first screen of cards without crowding out the reads a person is waiting on. */
const PREFETCH_LIMIT = 3

/** A fresh or persisted entry makes this a no-op: the options carry the same key and lifetime. */
export function prefetchConnectorTools(scope: ProfileScope, slug: string): void {
  void queryClient.prefetchQuery(connectorToolsQueryOptions(scope, slug))
}

/** When the list lands: the connected apps' tool lists, at most three in flight. */
export function usePrefetchConnectedTools(scope: ProfileScope, cards: readonly ConnectorCardModel[]): void {
  const slugs = useMemo(
    () => cards.filter(card => card.ways.hosted?.state === 'connected').map(card => card.slug),
    [cards]
  )

  useEffect(() => {
    let stopped = false
    const queue = [...slugs]

    const next = async (): Promise<void> => {
      const slug = queue.shift()

      if (slug === undefined || stopped) {
        return
      }

      await queryClient.prefetchQuery(connectorToolsQueryOptions(scope, slug))

      return next()
    }

    void Promise.all(Array.from({ length: Math.min(PREFETCH_LIMIT, queue.length) }, () => next()))

    return () => {
      stopped = true
    }
  }, [scope, slugs])
}
