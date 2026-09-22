import { compactNumber } from '@hermes/shared'

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
  onClose: () => void
  onConnect: () => void
  onReconnect: () => void
  onRemoveServer: () => void
}

export function LocalConnectorDialog({
  card,
  controller,
  onClose,
  onConnect,
  onReconnect,
  onRemoveServer
}: LocalConnectorDialogProps) {
  const name = localServerName(card)

  return (
    <ConnectorDialog
      advanced={<LocalAdvanced controller={controller} name={name} onRemove={onRemoveServer} />}
      card={card}
      cost={localCost(controller, name)}
      menu={<ConnectorDialogMenu onRefreshTools={() => void controller.runProbe(name)} />}
      onAuthenticate={() => void controller.authenticate(name)}
      onConnect={onConnect}
      onOpenChange={next => {
        if (!next) {
          onClose()
        }
      }}
      onReconnect={onReconnect}
      onServerToggle={next => void controller.setServerEnabled(name, next)}
      open
      tools={<LocalToolsPanel card={card} controller={controller} onRemove={onRemoveServer} />}
    />
  )
}

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
