// Shape: `['connectors', <scope key>, <read>, …]`.

import { type ProfileScope, profileScopeKey } from '@/hermes'
import { queryClient } from '@/lib/query-client'

/** The five reads behind this page. A key and its lifetime live together so they cannot drift. */
export type ConnectorRead = 'accounts' | 'catalog' | 'list' | 'policy' | 'tools'

export const CONNECTORS_QUERY_ROOT = 'connectors'

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE

interface ReadLifetime {
  focusRefetch: boolean
  /** Survives an app restart. Never the accounts (they carry account labels) and never the rules. */
  persist: boolean
  staleTime: number
}

export const CONNECTOR_LIFETIMES = {
  accounts: { focusRefetch: true, persist: false, staleTime: 5 * MINUTE },
  catalog: { focusRefetch: false, persist: true, staleTime: 24 * HOUR },
  list: { focusRefetch: true, persist: true, staleTime: 5 * MINUTE },
  policy: { focusRefetch: false, persist: false, staleTime: 60 * SECOND },
  // The backend is the authority for 24 h; only `Refresh` asks it to revalidate.
  tools: { focusRefetch: false, persist: true, staleTime: 24 * HOUR }
} satisfies Record<ConnectorRead, ReadLifetime>

/** Closing and reopening a dialog must never refetch what the cache already answered. */
export const CONNECTOR_GC_TIME = Number.POSITIVE_INFINITY

const scoped = (scope: ProfileScope, ...rest: string[]) =>
  [CONNECTORS_QUERY_ROOT, profileScopeKey(scope), ...rest] as const

export const connectorsListQueryKey = (scope: ProfileScope) => scoped(scope, 'list')

export const connectorsCatalogQueryKey = (scope: ProfileScope) => scoped(scope, 'catalog')

export const connectorsAccountsQueryKey = (scope: ProfileScope) => scoped(scope, 'accounts')

export const connectorsPolicyQueryKey = (scope: ProfileScope) => scoped(scope, 'policy')

export const connectorToolsQueryKey = (scope: ProfileScope, slug: string) => scoped(scope, 'tools', slug)

/** Refresh the named reads of one scope. A bare scope prefix would also match every tool list. */
export function invalidateConnectors(scope: ProfileScope, ...reads: [ConnectorRead, ...ConnectorRead[]]): void {
  for (const read of reads) {
    void queryClient.invalidateQueries({ queryKey: scoped(scope, read) })
  }
}

/** One app's tool list, plus the list that decides whether the app is gone rather than unreadable. */
export function invalidateConnectorApp(scope: ProfileScope, slug: string): void {
  void queryClient.invalidateQueries({ queryKey: connectorToolsQueryKey(scope, slug) })
  void queryClient.invalidateQueries({ queryKey: connectorsListQueryKey(scope) })
}
