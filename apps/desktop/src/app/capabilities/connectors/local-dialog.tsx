import { compactNumber } from '@hermes/shared'

import type { ConnectorCardField } from '@/components/ui/connector-card'
import { useI18n } from '@/i18n'

import { PanelEmpty } from '../../overlays/panel'
import type { McpServersController } from '../mcp/use-mcp-servers'

import { ConnectorDialog } from './connector-dialog'
import { localServerName } from './derive'
import { ConnectorDialogMenu } from './dialog-menu'
import { LocalAdvanced } from './local-slots'
import { LocalToolsPanel } from './tools-panel'
import type { ConnectorCardModel } from './types'

export interface LocalConnectorDialogProps {
  card: ConnectorCardModel
  controller: McpServersController
  /** The hosted twin's credential fields are never needed here; a bundled twin is. */
  installFields?: readonly ConnectorCardField[]
  installing: boolean
  onClose: () => void
  /** The hosted way's own verb: this is the upgrade path off a server on this Mac. */
  onConnect: () => void
  onInstall: (env: Record<string, string>) => void
  onReconnect: () => void
  /** Ask for the removal; the confirm and the write belong to the page. */
  onRemoveServer: () => void
}

export function LocalConnectorDialog({
  card,
  controller,
  installFields,
  installing,
  onClose,
  onConnect,
  onInstall,
  onReconnect,
  onRemoveServer
}: LocalConnectorDialogProps) {
  const { t } = useI18n()
  const name = localServerName(card)
  const installed = card.ways.local?.installed === true

  return (
    <ConnectorDialog
      advanced={installed ? <LocalAdvanced controller={controller} name={name} onRemove={onRemoveServer} /> : undefined}
      card={card}
      cost={localCost(controller, name)}
      installFields={installFields}
      installing={installing}
      menu={<ConnectorDialogMenu onRefreshTools={() => void controller.runProbe(name)} />}
      onAuthenticate={() => void controller.authenticate(name)}
      onConnect={onConnect}
      onInstall={onInstall}
      onOpenChange={next => {
        if (!next) {
          onClose()
        }
      }}
      onReconnect={onReconnect}
      onServerToggle={next => void controller.setServerEnabled(name, next)}
      open
      tools={
        installed ? (
          <LocalToolsPanel card={card} controller={controller} onRemove={onRemoveServer} />
        ) : (
          <PanelEmpty
            description={t.connectorsPage.tools.notInstalledBody}
            icon="plug"
            title={t.connectorsPage.tools.title}
          />
        )
      }
    />
  )
}

/** Each half is omitted when it is unknown rather than printed as a zero nobody measured. */
function localCost(controller: McpServersController, name: string) {
  const entry = controller.servers[name]

  if (!entry) {
    return undefined
  }

  const cost = controller.costFor(name, entry)

  return {
    tokensPerCall: cost.tokens === null ? undefined : compactNumber(cost.tokens),
    usesPerMonth: cost.uses === null ? undefined : compactNumber(cost.uses)
  }
}
