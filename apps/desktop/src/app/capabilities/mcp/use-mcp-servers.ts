// The hook owns no route and no layout: the caller drives `focusServer` itself.

import { useStore } from '@nanostores/react'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'

import {
  getMcpCatalog,
  type HermesGateway,
  type McpCatalogEntry,
  type McpCatalogResponse,
  type McpTestResult,
  type ProfileScope,
  profileScopeKey,
  saveMcpServers
} from '@/hermes'
import { useI18n } from '@/i18n'
import { completeMcpDesktopOAuth } from '@/lib/mcp-dashboard-oauth'
import { probeCache, probeKey } from '@/lib/mcp-probe-cache'
import { getServers, type McpServerEntry, type McpServers } from '@/lib/mcp-servers'
import { setDisabledTools, toggleToolInServer } from '@/lib/mcp-tool-filter'
import { notify, notifyError } from '@/store/notifications'
import { $activeGatewayProfile, normalizeProfileKey } from '@/store/profile'
import { $activeSessionId } from '@/store/session'
import type { HermesConfigRecord } from '@/types/hermes'

import { hermesConfigCacheWriter, useHermesConfigRecord } from '../../hooks/use-config-record'
import { useOnProfileSwitch } from '../../hooks/use-on-profile-switch'
import { useProfileSwitchLatch } from '../../hooks/use-profile-switch-latch'
import { seedOptions } from '../connectors/data/persist'

import { parseServersDoc, withEnabled } from './mcp-doc'
import { MCP_CATALOG_KEY, type ServerStatus, statusOf } from './mcp-status'
import { type McpDraft, useMcpDraft } from './use-mcp-draft'
import { type McpProbes, useMcpProbes } from './use-mcp-probes'

type PublishedProbes = Pick<McpProbes, 'costFor' | 'probes' | 'runProbe' | 'toolCounts' | 'usageByServer'>

export interface McpServersController extends McpDraft, PublishedProbes {
  /** The server whose OAuth flow is blocking the browser, if any. */
  authing: null | string
  authenticate: (name: string) => Promise<void>
  /** Catalog entries that are not installed on this profile yet. */
  availableCatalog: McpCatalogEntry[]
  catalog: McpCatalogEntry[]
  catalogLoading: boolean
  config: HermesConfigRecord | null
  configError: unknown
  configFailed: boolean
  configLoading: boolean
  descriptionFor: (name: string, entry: McpServerEntry) => null | string
  /** Config/document order, not alphabetical — the list mirrors mcp.json. */
  names: string[]
  onCatalogInstalled: () => Promise<void>
  /** A profile switch is still settling: `servers` holds the other profile's map, so writes are refused. */
  profilePending: boolean
  refetchConfig: () => void
  /** Drop one server from mcp.json; `false` lets a confirm dialog raise the refusal inline. */
  removeServer: (name: string) => Promise<boolean>
  saveDoc: () => Promise<void>
  saving: boolean
  servers: McpServers
  setServerEnabled: (name: string, enabled: boolean) => Promise<void>
  /** Write one server's whole off-list at once; `false` is what the dialog's Save reports. */
  setServerTools: (name: string, disabled: string[], discovered: string[]) => Promise<boolean>
  /** What every configured server is doing right now, in one table. */
  statuses: Record<string, ServerStatus>
  toggleTool: (name: string, toolName: string) => Promise<void>
}

export interface UseMcpServersOptions {
  /** Only for the live `reload.mcp` RPC. Null withholds it (cross-backend scope). */
  gateway: HermesGateway | null
  profile?: ProfileScope
}

export function useMcpServers({ gateway, profile }: UseMcpServersOptions): McpServersController {
  const { t } = useI18n()
  const m = t.settings.mcp
  const activeSessionId = useStore($activeSessionId)

  // The scope selector's choice, else the app-wide profile. It keys every fetch and cache below.
  const appProfile = useStore($activeGatewayProfile)
  const scopeProfileKey = profile != null ? profileScopeKey(profile) : normalizeProfileKey(appProfile)

  // Shared config cache (see use-config-record): revisiting the page paints the
  // cached record instantly; mutations write through `setConfig` and stay
  // visible to the other settings surfaces.
  const {
    data: config,
    isLoading: configLoading,
    isError: configFailed,
    error: configError,
    refetch: refetchConfigQuery,
    dataUpdatedAt: configUpdatedAt,
    errorUpdatedAt: configErroredAt
  } = useHermesConfigRecord(profile)

  const setConfig = hermesConfigCacheWriter(profile)

  // True from a profile switch until the config query resettles for the new
  // profile. Until then `config` (and thus `servers`) still holds profile A's
  // data, so any persist would write A's server list into B — block mutations.
  const { arm: armProfileLatch, pending: profilePending } = useProfileSwitchLatch({
    dataUpdatedAt: configUpdatedAt,
    errorUpdatedAt: configErroredAt
  })

  const [saving, setSaving] = useState(false)

  // Blocks the browser until an OAuth flow lands a token; also reset on profile
  // switch, so declared up here alongside the other per-profile view state.
  const [authing, setAuthing] = useState<null | string>(null)

  const servers = useMemo(() => getServers(config ?? null), [config])
  const names = useMemo(() => Object.keys(servers), [servers])

  const draft = useMcpDraft({ config, names, profilePending, servers, writable: !profilePending })

  // Key by the SCOPED profile — installed/enabled badges are per-profile, so
  // sharing one cache across profiles would flash the previous profile's state
  // on switch.
  const catalogQuery = useQuery({
    // Seeded from the last answer this profile saw, so a cold start paints every entry before the call returns.
    ...seedOptions<McpCatalogResponse>(scopeProfileKey, 'bundled'),
    queryKey: [...MCP_CATALOG_KEY, scopeProfileKey],
    queryFn: () => getMcpCatalog(profile ?? undefined),
    staleTime: 5 * 60_000
  })

  const catalog = useMemo(() => catalogQuery.data?.entries ?? [], [catalogQuery.data])

  // The catalog SECTION of the unified list only offers entries that aren't
  // already configured — installed servers appear once, in the fleet list
  // above, with live status. Match by catalog `installed` flag or a config
  // entry under the same name (covers a just-saved doc the catalog refetch
  // hasn't caught up with yet).
  const availableCatalog = useMemo(
    () => catalog.filter((entry: McpCatalogEntry) => !entry.installed && !(entry.name in servers)),
    [catalog, servers]
  )

  const descriptionFor = (serverName: string, server: McpServerEntry): null | string => {
    const lower = serverName.toLowerCase()

    const match = catalog.find(
      entry =>
        entry.name.toLowerCase() === lower ||
        (entry.url && entry.url === server.url) ||
        (entry.command && entry.command === server.command)
    )

    return match?.description ?? null
  }

  // Bumped on every profile switch. Async probe/auth completions capture the
  // epoch at call time and bail if it changed, so a slow profile-A request can't
  // write its result into profile B's state after the user switched.
  const profileEpoch = useRef(0)

  // Scoped tabs remount when their owner changes, and no app-wide switch event is emitted for that.
  useEffect(
    () => () => {
      profileEpoch.current += 1
    },
    [scopeProfileKey]
  )

  const fleet = useMcpProbes({ appProfile, profile, profileEpoch, scopeProfileKey, servers })

  // A profile switch invalidates the config query (see store/profile.ts), which
  // refetches the new backend's mcp.json. Reset ALL per-profile view state — the
  // draft (incl. a dirty one, so profile A's edits can't be saved into B), its
  // seed latch, probes, and cursor — so everything reseeds for the new profile.
  // The probe cache is already profile-keyed, so this just forces a re-probe.
  useOnProfileSwitch(() => {
    profileEpoch.current += 1
    fleet.resetForProfileSwitch()
    setAuthing(null)
    draft.reset()
    // Mark stale until the config query replaces profile A's data — guards
    // sidebar mutations from persisting A's server list into B mid-refetch.
    // The latch releases on a fresh success OR a fresh failure, so a failed
    // refetch surfaces the retry UI instead of leaving mutations no-op forever.
    armProfileLatch()
  })

  // Config writes reach live sessions immediately — no manual "Reload MCP".
  const silentReload = async () => {
    if (!gateway) {
      return
    }

    try {
      await gateway.request('reload.mcp', { confirm: true, session_id: activeSessionId ?? undefined })
    } catch (err) {
      notifyError(err, m.reloadFailed)
    }
  }

  // First-class OAuth: opens the system browser, blocks until the flow lands a
  // token (verified on disk — a friendly tools/list is not proof), then the
  // auth result doubles as the probe (it carries the tool list).
  const authenticate = async (serverName: string) => {
    const epoch = profileEpoch.current
    setAuthing(serverName)
    fleet.setProbe(serverName, 'probing')

    try {
      const flow = await completeMcpDesktopOAuth({
        serverName,
        profile,
        cancelled: () => profileEpoch.current !== epoch
      })

      const result: McpTestResult = { ok: true, tools: flow.tools ?? [] }

      // Bail if the user switched profiles mid-flow — this result is profile A's.
      if (profileEpoch.current !== epoch) {
        return
      }

      fleet.setProbe(serverName, result)
      // Cache under the POST-auth fingerprint (auth: oauth) on success — that's
      // the config the mount effect will read back, so it hits this entry.
      const probedConfig = result.ok ? { ...servers[serverName], auth: 'oauth' } : servers[serverName]
      probeCache.set(probeKey(serverName, probedConfig, scopeProfileKey), { at: Date.now(), result })

      if (result.ok) {
        // The endpoint persisted `auth: oauth` — mirror it locally.
        const nextServers = { ...servers, [serverName]: { ...servers[serverName], auth: 'oauth' } }
        setConfig(current => (current ? { ...current, mcp_servers: nextServers } : current))

        // Mirror `auth: oauth` into the editor too. If we only reset a clean
        // draft, a dirty draft keeps the pre-auth text and the next Save would
        // drop the freshly-persisted auth field — so patch the dirty draft in
        // place instead of clobbering the user's other edits.
        if (draft.dirty) {
          draft.patchDraft(doc =>
            doc[serverName] ? { ...doc, [serverName]: { ...doc[serverName], auth: 'oauth' } } : doc
          )
        } else {
          draft.resetDraft(nextServers)
        }

        notify({
          kind: 'success',
          title: m.authenticatedTitle,
          message: m.authenticatedMessage(serverName, result.tools.length)
        })
        void silentReload()
      } else if (result.error) {
        notifyError(new Error(result.error), serverName)
      }
    } catch (err) {
      if (profileEpoch.current !== epoch) {
        return
      }

      fleet.setProbe(serverName, { ok: false, error: err instanceof Error ? err.message : String(err), tools: [] })
      notifyError(err, serverName)
    } finally {
      if (profileEpoch.current === epoch) {
        setAuthing(null)
      }
    }
  }

  // The one table the tab's rows and the Connectors cards both read.
  const statuses = useMemo(() => {
    const table: Record<string, ServerStatus> = {}

    for (const [serverName, server] of Object.entries(servers)) {
      table[serverName] = statusOf(server, fleet.probes[serverName])
    }

    return table
  }, [fleet.probes, servers])

  // Whole-map replace (NOT saveHermesConfig, which deep-merges and so can never
  // delete a server, drop `enabled: false`, or remove a nested field). Only
  // after the replace lands do we write the cache through + reload live sessions.
  // Returns false when the profile switched mid-save: the write hit profile A's
  // backend (correct), but the client-side cache/editor now belong to B, so the
  // caller must skip its post-await writes.
  const persist = async (nextServers: McpServers): Promise<boolean> => {
    const epoch = profileEpoch.current
    await saveMcpServers(nextServers, profile ?? undefined)

    if (profileEpoch.current !== epoch) {
      return false
    }

    setConfig(current => ({ ...current, mcp_servers: nextServers }))
    void silentReload()

    return true
  }

  /** Mirror a landed write into the document: redraw it, or patch the one entry when the person is mid-edit. */
  const mirror = (nextServers: McpServers, patch: (doc: McpServers) => McpServers) => {
    if (draft.dirty) {
      draft.patchDraft(patch)
    } else {
      draft.resetDraft(nextServers)
    }
  }

  // A catalog install wrote a new server into config.yaml on the backend —
  // refresh the catalog (installed state) and the config, then RECONCILE THE
  // EDITOR DRAFT with the fresh servers. Without this a dirty draft (or even a
  // clean one the seed never refreshes) would omit the new server, and the next
  // whole-map Save would silently drop it.
  const onCatalogInstalled = async () => {
    void catalogQuery.refetch()
    const { data } = await refetchConfigQuery()
    const nextServers = getServers(data ?? null)

    // Keep the user's in-progress edits (doc wins), add any server the install
    // introduced that the draft doesn't have yet.
    mirror(nextServers, doc => ({ ...nextServers, ...doc }))

    void silentReload()
  }

  /** One entry, persisted and then mirrored into the document by the same transform. */
  const writeEntry = async (
    serverName: string,
    transform: (entry: McpServerEntry) => McpServerEntry
  ): Promise<boolean> => {
    const base = servers[serverName]

    if (!base || profilePending) {
      return false
    }

    const next = transform(base)

    try {
      if (!(await persist({ ...servers, [serverName]: next }))) {
        return false
      }

      mirror({ ...servers, [serverName]: next }, doc =>
        doc[serverName] ? { ...doc, [serverName]: transform(doc[serverName]) } : doc
      )

      return true
    } catch (err) {
      notifyError(err, m.saveFailed)

      return false
    }
  }

  const setServerEnabled = async (serverName: string, enabled: boolean) => {
    if ((await writeEntry(serverName, entry => withEnabled(entry, enabled))) && enabled) {
      void fleet.runProbe(serverName)
    }
  }

  // The probe still lists every discovered tool; the filter decides which ones the agent registers.
  const toggleTool = async (serverName: string, toolName: string) => {
    await writeEntry(serverName, entry => toggleToolInServer(entry, toolName))
  }

  // The Connectors dialog edits every switch of one server and then saves, so it
  // writes the whole off-list in ONE config write rather than one per switch.
  const setServerTools = (serverName: string, disabled: string[], discovered: string[]): Promise<boolean> =>
    writeEntry(serverName, entry => setDisabledTools(entry, disabled, discovered))

  const removeServer = async (serverName: string): Promise<boolean> => {
    if (profilePending) {
      return false
    }

    setSaving(true)

    try {
      const next = { ...servers }
      delete next[serverName]

      if (!(await persist(next))) {
        return false
      }

      mirror(next, doc => {
        const patched = { ...doc }
        delete patched[serverName]

        return patched
      })

      draft.setCursor(0)
      // The catalog still flags the entry as installed, and that flag is what keeps it off the Available shelf.
      void catalogQuery.refetch()

      return true
    } catch (err) {
      notifyError(err, m.removeFailed)

      return false
    } finally {
      setSaving(false)
    }
  }

  const saveDoc = async () => {
    if (profilePending) {
      return
    }

    let entries: McpServers

    try {
      entries = parseServersDoc(draft.draft)
    } catch (err) {
      notifyError(err, m.invalidJson)

      return
    }

    setSaving(true)

    const prevServers = servers

    try {
      if (!(await persist(entries))) {
        return
      }

      draft.resetDraft(entries)
      fleet.retainProbes(entries, prevServers)
      notify({ kind: 'success', title: m.savedTitle, message: m.savedMessage('mcp.json') })
    } catch (err) {
      notifyError(err, m.saveFailed)
    } finally {
      setSaving(false)
    }
  }

  return {
    ...draft,
    authenticate,
    authing,
    availableCatalog,
    catalog,
    catalogLoading: catalogQuery.isLoading,
    config: config ?? null,
    configError,
    configFailed,
    configLoading,
    costFor: fleet.costFor,
    descriptionFor,
    names,
    onCatalogInstalled,
    probes: fleet.probes,
    profilePending,
    refetchConfig: () => void refetchConfigQuery(),
    removeServer,
    runProbe: fleet.runProbe,
    saveDoc,
    saving,
    servers,
    setServerEnabled,
    setServerTools,
    statuses,
    toggleTool,
    toolCounts: fleet.toolCounts,
    usageByServer: fleet.usageByServer
  }
}
