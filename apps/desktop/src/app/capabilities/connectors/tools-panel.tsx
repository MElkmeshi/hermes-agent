// Two owners of the rule: the portal's policy, and mcp.json on this Mac.

import { useMemo } from 'react'

import type { ProfileScope } from '@/hermes'
import { isToolEnabled } from '@/lib/mcp-tool-filter'

import { okProbe } from '../mcp/mcp-status'
import type { McpServersController } from '../mcp/use-mcp-servers'

import {
  type ConnectorPolicyView,
  connectorToolRows,
  memberDisabledTools,
  memberRevision,
  orgLockedTools
} from './data/join'
import { useConnectorToolsSave } from './data/mutations'
import type { ConnectorToolsView } from './data/queries'
import { localServerName } from './derive'
import { conflictDifference, toolDisplayName, toolRows } from './derive-tools'
import { ToolsList } from './tools-list'
import type { ConnectorCardModel, ToolInput } from './types'
import { type SaveResult, useToolsEditor } from './use-tools-editor'

export interface HostedToolsPanelProps {
  card: ConnectorCardModel
  /** The effective off-list from the list row: the only rule the page has while `readOnly` is true. */
  disabledTools?: readonly string[]
  /** The 'gone' state's way out: the connector is no longer on the account. */
  onDisconnect: () => void
  /** Read the rules again, offered beside the switches the failed read froze. */
  onRetryRules?: () => void
  onSignIn: () => void
  policy: ConnectorPolicyView
  /** The rules read failed: a compare-and-set write needs a revision nobody could read. */
  readOnly?: boolean
  /** The rules read refused this identity, so a Retry could never win. */
  rulesSignedOut?: boolean
  scope: ProfileScope
  /** The dialog owns the query, so the kebab's Refresh and this column's Refresh are the same one. */
  tools: ConnectorToolsView
}

export function HostedToolsPanel({
  card,
  disabledTools = [],
  onDisconnect,
  onRetryRules,
  onSignIn,
  policy,
  readOnly = false,
  rulesSignedOut = false,
  scope,
  tools
}: HostedToolsPanelProps) {
  const saver = useConnectorToolsSave(scope, card.slug, memberRevision(policy))

  // Without the rules there is no layer to attribute a lock to, so a row is simply on or off.
  const rows = useMemo(
    () =>
      readOnly ? toolRows(tools.tools, new Set(disabledTools)) : connectorToolRows(policy, card.slug, tools.tools),
    [card.slug, disabledTools, policy, readOnly, tools.tools]
  )

  const savedDisabled = useMemo(
    () => (readOnly ? [...disabledTools] : [...memberDisabledTools(policy, card.slug)]),
    [card.slug, disabledTools, policy, readOnly]
  )

  const editor = useToolsEditor({
    editorKey: card.slug,
    onSave: saver.onSave,
    savedDisabled,
    status: tools.status,
    tools: rows
  })

  return (
    <ToolsList
      appOff={card.state === 'off'}
      conflict={saver.theirs ? conflictDifference(saver.theirs, editor.local) : undefined}
      connectorName={card.name}
      editor={editor}
      freshness={tools.freshness ?? undefined}
      listKey={card.slug}
      onRefresh={tools.refresh}
      onReload={saver.reload}
      onRemove={onDisconnect}
      onRetry={tools.retry}
      onRetryRules={onRetryRules}
      onSignIn={onSignIn}
      // No account: the column says what this app would bring, and rules over it are not a thing yet.
      preview={card.ways.hosted?.connected !== true}
      readOnly={readOnly}
      rulesSignedOut={rulesSignedOut}
      signedOut={tools.signedOut}
      tools={rows}
    />
  )
}

export interface LocalToolsPanelProps {
  card: ConnectorCardModel
  controller: McpServersController
  /** Remove the server — the 'gone' state's way out. */
  onRemove: () => void
}

export function LocalToolsPanel({ card, controller, onRemove }: LocalToolsPanelProps) {
  const name = localServerName(card)
  const probe = controller.probes[name]
  const entry = controller.servers[name]

  // A server that is off is never probed, so its absent probe must not read as progress.
  const status =
    card.ways.local?.serverEnabled === false
      ? 'off'
      : card.ways.local?.reason?.key === 'serverNeedsAuth'
        ? 'needsAuth'
        : !probe || probe === 'probing'
          ? 'loading'
          : probe.ok
            ? null
            : 'unavailable'

  const discovered = useMemo(() => okProbe(probe)?.tools.map(tool => tool.name) ?? [], [probe])

  // An MCP tool has a name and a description only: no facet, no hints, so the quick actions skip it.
  const inputs = useMemo<ToolInput[]>(
    () =>
      okProbe(probe)?.tools.map(tool => ({
        categories: [],
        deprecated: false,
        description: tool.description ?? '',
        facet: 'unclassified',
        hints: [],
        name: toolDisplayName(tool.name),
        slug: tool.name
      })) ?? [],
    [probe]
  )

  const savedDisabled = useMemo(
    () => discovered.filter(tool => entry !== undefined && !isToolEnabled(entry, tool)),
    [discovered, entry]
  )

  const rows = useMemo(() => toolRows(inputs, new Set(savedDisabled)), [inputs, savedDisabled])

  const onSave = async (disabled: string[]): Promise<SaveResult> =>
    (await controller.setServerTools(name, disabled, discovered)) ? 'saved' : 'failed'

  const editor = useToolsEditor({ editorKey: name, onSave, savedDisabled, status, tools: rows })

  return (
    <ToolsList
      connectorName={card.name}
      editor={editor}
      listKey={name}
      onRefresh={() => void controller.runProbe(name)}
      onReload={() => void controller.runProbe(name)}
      onRemove={onRemove}
      onRetry={() => void controller.runProbe(name)}
      tools={rows}
    />
  )
}

/** How many tools the organisation took away from one hosted app. */
export function orgDisabledCount(policy: ConnectorPolicyView, slug: string, tools: readonly ToolInput[]): number {
  return orgLockedTools(policy, slug, tools).size
}
