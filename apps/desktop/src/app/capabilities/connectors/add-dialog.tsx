import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useI18n } from '@/i18n'

import { McpJsonEditor } from '../mcp/mcp-editor'
import type { McpServersController } from '../mcp/use-mcp-servers'

export interface AddServerDialogProps {
  controller: McpServersController
  onOpenChange: (open: boolean) => void
  open: boolean
}

export function AddServerDialog({ controller, onOpenChange, open }: AddServerDialogProps) {
  const { t } = useI18n()
  const copy = t.connectorsPage.add

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent bodyClassName="gap-0 overflow-hidden p-0" className="h-[min(40rem,80vh)] min-w-[min(48rem,90vw)]">
        <header className="flex shrink-0 items-center border-b border-(--ui-stroke-tertiary) px-5 py-3">
          <DialogTitle className="text-base font-semibold">{copy.title}</DialogTitle>
        </header>
        <DialogDescription className="sr-only">{copy.hint}</DialogDescription>

        <div className="flex min-h-0 flex-1 flex-col">
          <McpJsonEditor controller={controller} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
