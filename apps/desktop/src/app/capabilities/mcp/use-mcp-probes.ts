// The probe fleet and the 30-day usage overlay: what each server answers, and what it costs.

import { type RefObject, useEffect, useMemo, useRef, useState } from 'react'

import { type ProfileScope, testMcpServer } from '@/hermes'
import { PROBE_TTL_MS, probeCache, probeKey, serverFingerprint } from '@/lib/mcp-probe-cache'
import type { McpServers } from '@/lib/mcp-servers'
import { countEnabledTools } from '@/lib/mcp-tool-filter'

import { serverEnabled } from './mcp-doc'
import { loadMcpUsage, okProbe, type Probe, serverCost, type ServerCost } from './mcp-status'

export interface McpProbes {
  costFor: (name: string, entry: Record<string, unknown>) => ServerCost
  probes: Record<string, Probe>
  /** Forget every probe and the usage overlay; the caller bumps the epoch. */
  resetForProfileSwitch: () => void
  /** After a whole-document save: keep only probes whose server survived unchanged. */
  retainProbes: (entries: McpServers, prevServers: McpServers) => void
  runProbe: (name: string) => Promise<void>
  setProbe: (name: string, value: Probe) => void
  /** Registered/discovered tool counts per server. Absent until probed. */
  toolCounts: Record<string, { on: number; total: number }>
  /** 30-day call counts per SERVER, for the page's "unused" pill. */
  usageByServer: Record<string, number>
}

export interface UseMcpProbesOptions {
  /** The app-wide profile, for the usage fetch when no scope is selected. */
  appProfile: ProfileScope
  profile?: ProfileScope
  /** Bumped by the owner on every profile switch; an async result from the old epoch is dropped. */
  profileEpoch: RefObject<number>
  scopeProfileKey: string
  servers: McpServers
}

export function useMcpProbes({
  appProfile,
  profile,
  profileEpoch,
  scopeProfileKey,
  servers
}: UseMcpProbesOptions): McpProbes {
  const [probes, setProbes] = useState<Record<string, Probe>>({})
  const probesRef = useRef(probes)
  probesRef.current = probes

  // 30-day per-tool call counts (registry names). null = analytics unavailable
  // or not loaded yet — the cost overlay then omits usage entirely.
  const [toolCalls30d, setToolCalls30d] = useState<null | Record<string, number>>(null)

  const setProbe = (serverName: string, value: Probe) => {
    setProbes(current => ({ ...current, [serverName]: value }))
  }

  const runProbe = async (serverName: string) => {
    const epoch = profileEpoch.current
    const key = probeKey(serverName, servers[serverName], scopeProfileKey)
    setProbes(current => ({ ...current, [serverName]: 'probing' }))

    try {
      const result = await testMcpServer(serverName, profile ?? undefined)

      // Drop the result if the profile changed mid-probe — it belongs to A.
      if (profileEpoch.current !== epoch) {
        return
      }

      probeCache.set(key, { at: Date.now(), result })
      setProbes(current => ({ ...current, [serverName]: result }))
    } catch (err) {
      if (profileEpoch.current !== epoch) {
        return
      }

      const result = { ok: false, error: err instanceof Error ? err.message : String(err), tools: [] }
      probeCache.set(key, { at: Date.now(), result })
      setProbes(current => ({ ...current, [serverName]: result }))
    }
  }

  // It should just know: probe enabled servers as config arrives — but through
  // the cache, so revisiting the page doesn't respawn/reconnect the fleet.
  useEffect(() => {
    for (const [serverName, server] of Object.entries(servers)) {
      if (!serverEnabled(server) || probesRef.current[serverName] !== undefined) {
        continue
      }

      const cached = probeCache.get(probeKey(serverName, server, scopeProfileKey))

      if (cached && Date.now() - cached.at < PROBE_TTL_MS) {
        setProbes(current => ({ ...current, [serverName]: cached.result }))
      } else {
        void runProbe(serverName)
      }
    }
    // Re-run only when the server set changes; runProbe is recreated every
    // render and adding it would re-probe the fleet on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servers])

  // Cosmetic 30-day usage counts for the cost overlay — cached module-wide per
  // scope profile, epoch-guarded like the probes so a slow profile-A fetch
  // can't paint into profile B.
  useEffect(() => {
    const epoch = profileEpoch.current

    void loadMcpUsage(scopeProfileKey, profile ?? appProfile ?? null).then(value => {
      if (profileEpoch.current === epoch) {
        setToolCalls30d(value)
      }
    })
  }, [scopeProfileKey, profile, appProfile, profileEpoch])

  const costFor = (serverName: string, server: Record<string, unknown>): ServerCost =>
    serverCost(server, probes[serverName], serverName, toolCalls30d)

  // No entry at all without a successful probe: a zero would read as "this server has no tools".
  const toolCounts = useMemo(() => {
    const counts: Record<string, { on: number; total: number }> = {}

    for (const [serverName, server] of Object.entries(servers)) {
      const probe = okProbe(probes[serverName])

      if (probe) {
        counts[serverName] = {
          on: countEnabledTools(
            server,
            probe.tools.map(tool => tool.name)
          ),
          total: probe.tools.length
        }
      }
    }

    return counts
  }, [probes, servers])

  // The cost overlay's analytics, summed per server, because a card says "unused" and not which tool went unused.
  const usageByServer = useMemo(() => {
    const uses: Record<string, number> = {}

    if (!toolCalls30d) {
      return uses
    }

    for (const serverName of Object.keys(servers)) {
      uses[serverName] = serverCost(servers[serverName], probes[serverName], serverName, toolCalls30d).uses ?? 0
    }

    return uses
  }, [probes, servers, toolCalls30d])

  const retainProbes = (entries: McpServers, prevServers: McpServers) => {
    // Keep only probes for servers that survived AND kept the same config;
    // removed OR edited entries drop their probe so the mount effect re-probes
    // the new shape (the cache also misses on the changed fingerprint).
    setProbes(current =>
      Object.fromEntries(
        Object.entries(current).filter(
          ([name]) => name in entries && serverFingerprint(entries[name]) === serverFingerprint(prevServers[name] ?? {})
        )
      )
    )
  }

  const resetForProfileSwitch = () => {
    setProbes({})
    setToolCalls30d(null)
  }

  return {
    costFor,
    probes,
    resetForProfileSwitch,
    retainProbes,
    runProbe,
    setProbe,
    toolCounts,
    usageByServer
  }
}
