import { useStore } from '@nanostores/react'
import { useState } from 'react'

import type { ConnectorCardField } from '@/components/ui/connector-card'
import { SegmentedControl } from '@/components/ui/segmented-control'
import type { ProfileScope } from '@/hermes'
import { useI18n } from '@/i18n'
import { openFreeTierSignIn } from '@/store/free-tier-sign-in'

import type { McpServersController } from '../mcp/use-mcp-servers'

import { ConnectElement } from './connect-element'
import { ConnectorDialog } from './connector-dialog'
import {
  $accountOperations,
  type AccountOperation,
  accountOperationFor,
  clearAccountOperation
} from './data/account-operations'
import { openConnectorsAdmin } from './data/portal'
import { type HostedConnectorsView, useConnectorTools } from './data/queries'
import { bothWaysOn, localServerName } from './derive'
import { ConnectorDialogMenu } from './dialog-menu'
import { HostedToolsPanel, LocalToolsPanel, orgDisabledCount } from './tools-panel'
import type { ConnectorCardModel } from './types'

export interface HostedConnectorDialogProps {
  card: ConnectorCardModel
  /** A `connectors.connect` for this app is in flight. */
  connectPending: boolean
  controller: McpServersController
  /** The page's own hosted reads, passed down so the dialog never runs a second copy of them. */
  hosted: HostedConnectorsView
  /** The bundled twin's credential fields, while its install still needs them. */
  installFields?: readonly ConnectorCardField[]
  installing: boolean
  onClose: () => void
  onConnect: () => void
  onDisconnect: () => void
  /** Stop waiting: end the operation the connect element is showing. */
  onGiveUp: (opId: string) => void
  onInstall: (env: Record<string, string>) => void
  /** Re-mint the authorization, from the kebab or from a target's Try again. */
  onReconnect: () => void
  onRemoveServer: () => void
  onToggleForMe: (next: boolean) => void
  /** The card's own verb, with the card's own handler. */
  onVerb: () => void
  profile: ProfileScope
  togglePending: boolean
}

export function HostedConnectorDialog({
  card,
  connectPending,
  controller,
  hosted,
  installFields,
  installing,
  onClose,
  onConnect,
  onDisconnect,
  onGiveUp,
  onInstall,
  onReconnect,
  onRemoveServer,
  onToggleForMe,
  onVerb,
  profile,
  togglePending
}: HostedConnectorDialogProps) {
  const { t } = useI18n()
  const tools = useConnectorTools(profile, card.slug, hosted.listSlugs.has(card.slug))
  const operation = accountOperationFor(useStore($accountOperations), card.slug)
  const [form, setForm] = useState<'hosted' | 'local'>('hosted')

  // Both forms answer at once, so the column says which one it is reading.
  const both = bothWaysOn(card.ways)

  const hostedPanel = (
    <HostedToolsPanel
      card={card}
      disabledTools={card.ways.hosted?.disabledTools}
      onDisconnect={onDisconnect}
      onRetryRules={hosted.retryRules}
      onSignIn={() => openFreeTierSignIn()}
      policy={hosted.policy}
      readOnly={hosted.rulesFailed}
      rulesSignedOut={hosted.rulesSignedOut}
      scope={profile}
      tools={tools}
    />
  )

  const element = stillOpen(operation) ? (
    <ConnectElement
      busy={connectPending}
      onReissue={onReconnect}
      onStopWaiting={() => onGiveUp(operation.opId)}
      operation={operation}
    />
  ) : undefined

  return (
    <ConnectorDialog
      accountLabel={card.ways.hosted?.accountLabel}
      card={card}
      connectedOn={formatDate(card.ways.hosted?.connectedAt)}
      connectElement={element}
      installFields={installFields}
      installing={installing}
      menu={<ConnectorDialogMenu onReconnect={onReconnect} onRefreshTools={tools.refresh} />}
      onAuthenticate={() => void controller.authenticate(localServerName(card))}
      onConnect={onConnect}
      onDisconnect={onDisconnect}
      onInstall={onInstall}
      onOpenAdmin={() => void openConnectorsAdmin()}
      onOpenChange={next => {
        if (!next) {
          // A settled operation would otherwise still own the column the next time the dialog opens.
          if (operation?.settled) {
            clearAccountOperation(operation.opId)
          }

          onClose()
        }
      }}
      onReconnect={onReconnect}
      onServerToggle={next => void controller.setServerEnabled(localServerName(card), next)}
      onToggleForMe={onToggleForMe}
      onVerb={onVerb}
      open
      orgDisabledCount={orgDisabledCount(hosted.policy, card.slug, tools.tools)}
      rulesReadOnly={hosted.rulesFailed}
      togglePending={togglePending}
      tools={
        both ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center border-b border-(--ui-stroke-tertiary) px-3.5 py-1.5">
              <SegmentedControl
                onChange={setForm}
                options={[
                  { id: 'hosted', label: t.connectorsPage.dialog.wayHosted },
                  { id: 'local', label: t.connectorsPage.dialog.wayLocal }
                ]}
                value={form}
              />
            </div>

            {form === 'hosted' ? (
              hostedPanel
            ) : (
              <LocalToolsPanel card={card} controller={controller} onRemove={onRemoveServer} />
            )}
          </div>
        ) : (
          hostedPanel
        )
      }
    />
  )
}

/** An attempt still worth a line: one in flight, or one that ended without connecting. */
function stillOpen(operation: AccountOperation | null): operation is AccountOperation {
  return operation !== null && (!operation.settled || !operation.targets.every(target => target.state === 'connected'))
}

const formatDate = (iso: string | undefined): string | undefined => {
  if (!iso) {
    return undefined
  }

  const at = new Date(iso)

  return Number.isNaN(at.getTime()) ? undefined : at.toLocaleDateString()
}
