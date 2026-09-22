// The identity chip for a server row; it fetches no mark, because a configured MCP URL can be a private host.

import { AvatarChip } from '@/components/ui/avatar-chip'
import { brandFor } from '@/lib/mcp-brands'
import { cn } from '@/lib/utils'

import { type ServerStatus, STATUS_DOT } from './mcp-status'

export function McpAvatar({ className, name, status }: { className?: string; name: string; status: ServerStatus }) {
  return (
    <AvatarChip
      brand={brandFor(name)}
      className={className}
      name={name}
      overlay={
        <span
          aria-hidden
          className={cn(
            'absolute -bottom-0.5 -right-0.5 size-2 rounded-full ring-2 ring-(--ui-chat-surface-background)',
            STATUS_DOT[status]
          )}
        />
      }
    />
  )
}
