import type { ConnectorAccountRow, ConnectorToolsResult } from '@hermes/shared'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo } from 'react'

import type { ProfileScope } from '@/hermes'
import { translateNow } from '@/i18n'
import { isMissingRpcMethod, isOutOfSyncRpcParams } from '@/lib/gateway-rpc'
import { queryClient } from '@/lib/query-client'
import { notifyError } from '@/store/notifications'

import { hostedPhase } from '../derive'
import { toolReadStatus } from '../derive-tools'
import type { HostedConnectorInput, HostedPhase, ToolInput, ToolsEditorStatus, ToolsFreshness } from '../types'

import {
  type ConnectorPolicyView,
  connectorTitles,
  EMPTY_POLICY,
  joinHostedConnectors,
  readPolicy,
  toolsFreshness
} from './join'
import {
  CONNECTOR_GC_TIME,
  CONNECTOR_LIFETIMES,
  connectorsAccountsQueryKey,
  connectorsCatalogQueryKey,
  connectorsListQueryKey,
  connectorsPolicyQueryKey,
  connectorToolsQueryKey,
  invalidateConnectorApp,
  invalidateConnectors
} from './keys'
import { clearPersisted, seedOptions } from './persist'
import {
  asConnectorError,
  connectorAccounts,
  connectorCatalog,
  connectorPolicy,
  connectorTools,
  listConnectors
} from './rpc'

// A typed connector failure is a verdict, not a blip: recovery is the page's own Retry.
const read = (of: keyof typeof CONNECTOR_LIFETIMES) => ({
  gcTime: CONNECTOR_GC_TIME,
  refetchOnWindowFocus: CONNECTOR_LIFETIMES[of].focusRefetch,
  retry: false,
  staleTime: CONNECTOR_LIFETIMES[of].staleTime
})

export interface HostedConnectorsView {
  accounts: readonly ConnectorAccountRow[]
  /** The slugs `connectors.list` itself carries. The catalog is a shelf, so a hosted card is not this fact. */
  listSlugs: ReadonlySet<string>
  phase: HostedPhase
  policy: ConnectorPolicyView
  refetch: () => void
  /** Re-read the rules alone, for the Retry the read-only note carries. */
  retryRules: () => void
  rows: HostedConnectorInput[]
  /** The rules read failed: the rule controls are read-only, but on/off still comes off the list row. */
  rulesFailed: boolean
  /** The rules read refused a free-tier identity: that part shows one quiet line with Sign in. */
  rulesSignedOut: boolean
  titles: Record<string, string>
}

/** The four reads behind the hosted cards. Only the list decides whether the hosted half is usable. */
export function useHostedConnectors(scope: ProfileScope): HostedConnectorsView {
  const listSeed = useMemo(() => seedOptions<Awaited<ReturnType<typeof listConnectors>>>(scope, 'list'), [scope])

  const catalogSeed = useMemo(
    () => seedOptions<Awaited<ReturnType<typeof connectorCatalog>>>(scope, 'catalog'),
    [scope]
  )

  const list = useQuery({
    ...read('list'),
    ...listSeed,
    queryFn: () => listConnectors(scope).catch(reportVersionSkew),
    queryKey: connectorsListQueryKey(scope)
  })

  const catalog = useQuery({
    ...read('catalog'),
    ...catalogSeed,
    queryFn: () => connectorCatalog(scope),
    queryKey: connectorsCatalogQueryKey(scope)
  })

  const accounts = useQuery({
    ...read('accounts'),
    queryFn: () => connectorAccounts(scope),
    queryKey: connectorsAccountsQueryKey(scope)
  })

  const policy = useQuery({
    ...read('policy'),
    queryFn: () => connectorPolicy(scope),
    queryKey: connectorsPolicyQueryKey(scope)
  })

  const listError = list.error === null ? null : asConnectorError(list.error)
  const policyError = policy.error === null ? null : asConnectorError(policy.error)
  const rulesFailed = policyError !== null

  const policyView = useMemo(() => (policy.data ? readPolicy(policy.data.layers) : EMPTY_POLICY), [policy.data])

  const joined = useMemo(() => {
    const input = {
      accounts: accounts.data?.accounts ?? [],
      catalog: catalog.data?.connectors ?? [],
      list: list.data?.connectors ?? [],
      policy: policyView,
      rulesReadable: !rulesFailed
    }

    return { rows: joinHostedConnectors(input), titles: connectorTitles(input) }
  }, [accounts.data, catalog.data, list.data, policyView, rulesFailed])

  const phase = hostedPhase({
    available: list.data?.available,
    errored: listError !== null,
    pending: list.isPending,
    reason: listError?.reason ?? null
  })

  // An account with no hosted half at all must not paint the last one it had, in this window or the next.
  const blanked = phase === 'signedOut' || phase === 'unavailable'

  useEffect(() => {
    if (blanked) {
      clearPersisted(scope)
    }
  }, [blanked, scope])

  const listSlugs = useMemo(
    () =>
      new Set(blanked ? [] : (list.data?.connectors ?? []).flatMap(row => (row.connector ? [row.connector] : []))),
    [blanked, list.data]
  )

  const refetch = useCallback(() => invalidateConnectors(scope, 'accounts', 'catalog', 'list', 'policy'), [scope])

  const retryRules = useCallback(() => invalidateConnectors(scope, 'policy'), [scope])

  return {
    accounts: accounts.data?.accounts ?? [],
    listSlugs,
    phase,
    policy: policyView,
    refetch,
    retryRules,
    rows: blanked ? [] : joined.rows,
    rulesFailed,
    rulesSignedOut: policyError?.reason === 'NEEDS_NOUS_AUTH',
    titles: joined.titles
  }
}

/** An older backend fails all four reads with no typed reason, so the list alone reports it, once. */
function reportVersionSkew(error: unknown): never {
  if (isMissingRpcMethod(error) || isOutOfSyncRpcParams(error instanceof Error ? error : String(error))) {
    notifyError(error, translateNow('connectorsPage.page.hostedFailedTitle'))
  }

  throw error
}

/** One connector's tool list, shared by the live query and by the prefetch so they cannot disagree. */
export function connectorToolsQueryOptions(scope: ProfileScope, slug: string) {
  return {
    ...read('tools'),
    ...seedOptions<ConnectorToolsResult>(scope, 'tools', slug),
    queryFn: () => connectorTools(scope, slug),
    queryKey: connectorToolsQueryKey(scope, slug)
  }
}

export interface ConnectorToolsView {
  freshness: ToolsFreshness | null
  refresh: () => void
  /** Re-read this one app, for the Retry the unavailable state carries. */
  retry: () => void
  /** The portal refused this identity. The cached list still renders, with one quiet Sign in beside it. */
  signedOut: boolean
  /** `null` means the list is on screen and the editor owns the phase. */
  status: ToolsEditorStatus | null
  tools: ToolInput[]
}

/** One connector's tool list. A null `slug` parks the query while no dialog is open. */
export function useConnectorTools(scope: ProfileScope, slug: null | string, listHasApp: boolean): ConnectorToolsView {
  const key = connectorToolsQueryKey(scope, slug ?? '')
  const options = useMemo(() => connectorToolsQueryOptions(scope, slug ?? ''), [scope, slug])

  const tools = useQuery({ ...options, enabled: slug !== null })

  const revalidate = useMutation({
    mutationFn: () => connectorTools(scope, slug ?? '', true),
    // Write through rather than invalidate: the refreshed answer IS the new cache entry.
    onSuccess: data => queryClient.setQueryData(key, data)
  })

  const error = tools.error === null ? null : asConnectorError(tools.error)
  // An untyped failure still counts as a failure, so it lands on the state that offers a Retry.
  const reason = error === null ? null : (error.reason ?? 'CONNECTOR_REQUEST_FAILED')

  return {
    freshness: tools.data ? toolsFreshness(tools.data) : null,
    refresh: () => revalidate.mutate(),
    retry: () => invalidateConnectorApp(scope, slug ?? ''),
    signedOut: reason === 'NEEDS_NOUS_AUTH',
    status:
      slug === null
        ? null
        : toolReadStatus({ hasData: tools.data !== undefined, listHasApp, pending: tools.isPending, reason }),
    tools: tools.data?.tools ?? []
  }
}
