import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useI18n } from '@/i18n'

import { McpJsonEditor, McpLogPane } from '../mcp/mcp-editor'
import type { McpServersController } from '../mcp/use-mcp-servers'

import { localServerName } from './derive'
import type { ConnectorCardModel } from './types'

export interface LocalAdvancedProps {
  controller: McpServersController
  /** The server's key in mcp.json. */
  name: string
  onRemove: () => void
}

/** The `Advanced` section of an opened local server: its mcp.json entry, its logs, and Remove. */
export function LocalAdvanced({ controller, name, onRemove }: LocalAdvancedProps) {
  const { t } = useI18n()
  const m = t.settings.mcp

  return (
    <div className="grid min-h-0 gap-2">
      <div className="h-56 overflow-hidden rounded-md border border-(--ui-stroke-tertiary)">
        <McpJsonEditor controller={controller} highlightServer={name} />
      </div>

      <div className="h-40 overflow-hidden rounded-md border border-(--ui-stroke-tertiary)">
        <McpLogPane server={name} />
      </div>

      <Button className="justify-self-start text-destructive" onClick={onRemove} size="xs" variant="text">
        {m.remove}
      </Button>
    </div>
  )
}

export interface RemoveServerConfirmProps {
  /** The card whose server goes, `null` closes it. The question names the app, as every other surface does. */
  card: ConnectorCardModel | null
  controller: McpServersController
  onClose: () => void
  onRemoved: () => void
}

/** The page's one destructive local action, asked through the app's `ConfirmDialog` like every other. */
export function RemoveServerConfirm({ card, controller, onClose, onRemoved }: RemoveServerConfirmProps) {
  const { t } = useI18n()
  const m = t.settings.mcp
  const name = card ? localServerName(card) : null

  return (
    <ConfirmDialog
      confirmLabel={m.remove}
      description={t.connectorsPage.dialog.removeServerBody}
      destructive
      onClose={onClose}
      onConfirm={async () => {
        if (!name) {
          return
        }

        // Throwing keeps the dialog open with the reason inline; swallowing it would close as if mcp.json had changed.
        if (!(await controller.removeServer(name))) {
          throw new Error(m.removeFailed)
        }

        onRemoved()
      }}
      open={card !== null}
      title={t.connectorsPage.dialog.removeServerTitle(card?.name ?? '')}
    />
  )
}
