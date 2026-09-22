import { useStore } from '@nanostores/react'
import { useState } from 'react'

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
import { localResidencyWord } from './residency'
import { HostedToolsPanel, LocalToolsPanel, orgDisabledCount } from './tools-panel'
import type { ConnectorCardModel } from './types'

export interface HostedConnectorDialogProps {
  card: ConnectorCardModel
  controller: McpServersController
  hosted: HostedConnectorsView
  onClose: () => void
  onConnect: () => void
  onDisconnect: () => void
  onGiveUp: (opId: string) => void
  onReconnect: () => void
  onRemoveServer: () => void
  onToggleForMe: (next: boolean) => void
  onVerb: () => void
  profile: ProfileScope
  togglePending: boolean
}

export function HostedConnectorDialog({
  card,
  controller,
  hosted,
  onClose,
  onConnect,
  onDisconnect,
  onGiveUp,
  onReconnect,
  onRemoveServer,
  onToggleForMe,
  onVerb,
  profile,
  togglePending
}: HostedConnectorDialogProps) {
  const { locale, t } = useI18n()
  const tools = useConnectorTools(profile, card.slug, hosted.listSlugs.has(card.slug))
  const operation = accountOperationFor(useStore($accountOperations), card.slug)
  const [form, setForm] = useState<'hosted' | 'local'>('hosted')

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
    <ConnectElement onStopWaiting={() => onGiveUp(operation.opId)} operation={operation} />
  ) : undefined

  return (
    <ConnectorDialog
      accountLabel={card.ways.hosted?.accountLabel}
      card={card}
      connectedOn={formatDate(card.ways.hosted?.connectedAt, locale)}
      connectElement={element}
      menu={<ConnectorDialogMenu onReconnect={onReconnect} onRefreshTools={tools.refresh} />}
      onAuthenticate={() => void controller.authenticate(localServerName(card))}
      onConnect={onConnect}
      onDisconnect={onDisconnect}
      onOpenAdmin={() => void openConnectorsAdmin()}
      onOpenChange={next => {
        if (!next) {
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
                  { id: 'local', label: localResidencyWord(t.connectorsPage) }
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

function stillOpen(operation: AccountOperation | null): operation is AccountOperation {
  return operation !== null && (!operation.settled || !operation.targets.every(target => target.state === 'connected'))
}

const formatDate = (iso: string | undefined, locale: string): string | undefined => {
  if (!iso) {
    return undefined
  }

  const at = new Date(iso)

  return Number.isNaN(at.getTime()) ? undefined : at.toLocaleDateString(locale)
}
