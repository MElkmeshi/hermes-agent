import { compactNumber } from '@hermes/shared'
import { useLocation, useNavigate } from 'react-router'

import { PanelEmpty } from '@/app/overlays/panel'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'

import type { McpServersController } from '../mcp/use-mcp-servers'

import { ConnectorDialog } from './connector-dialog'
import { localServerName } from './derive'
import { ConnectorDialogMenu } from './dialog-menu'
import type { InstallField } from './local-server-control'
import { LocalAdvanced } from './local-slots'
import { LocalToolsPanel } from './tools-panel'
import type { ConnectorCardModel } from './types'

export interface LocalConnectorDialogProps {
  card: ConnectorCardModel
  controller: McpServersController
  /** The catalog entry's credential fields, while its install still needs them. */
  installFields?: readonly InstallField[]
  installing?: boolean
  onClose: () => void
  /** The managed way's own verb: this is the upgrade path off a server on this device. */
  onConnect: () => void
  onInstall: (env: Record<string, string>) => void
  onReconnect: () => void
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
  const openPlugins = useOpenPluginsTab()
  const plugin = card.plugin
  const installed = card.ways.local?.installed === true
  const owned = plugin === undefined && installed

  return (
    <ConnectorDialog
      advanced={owned ? <LocalAdvanced controller={controller} name={name} onRemove={onRemoveServer} /> : undefined}
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
        plugin !== undefined ? (
          <PluginNote onOpenPlugins={openPlugins} plugin={plugin} />
        ) : installed ? (
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

function PluginNote({ onOpenPlugins, plugin }: { onOpenPlugins: () => void; plugin: string }) {
  const { t } = useI18n()
  const copy = t.connectorsPage.dialog

  return (
    <div className="grid min-h-0 flex-1 content-start justify-items-center gap-2 px-3.5 py-10 text-center">
      <p className="text-xs text-(--ui-text-tertiary)">{copy.providedByPlugin(plugin)}</p>
      <Button onClick={onOpenPlugins} size="inline" variant="textStrong">
        {copy.openPlugins}
      </Button>
    </div>
  )
}

function useOpenPluginsTab(): () => void {
  const navigate = useNavigate()
  const { hash, pathname, search } = useLocation()

  return () => {
    const params = new URLSearchParams(search)
    params.set('tab', 'plugins')
    navigate({ hash, pathname, search: `?${params.toString()}` })
  }
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
