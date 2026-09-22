import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useI18n } from '@/i18n'

import type { ConnectorWayLocal } from './types'

export function LocalServerControl({
  name,
  onAuthenticate,
  onServerToggle,
  way
}: {
  name: string
  onAuthenticate?: () => void
  onServerToggle?: (next: boolean) => void
  way: ConnectorWayLocal
}) {
  const { t } = useI18n()
  const copy = t.connectorsPage

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-[0.7rem] text-(--ui-text-tertiary)">
          {copy.card.state[way.serverEnabled === true ? 'serverOn' : 'serverOff']}
        </span>
        {onServerToggle ? (
          <Switch
            aria-label={way.serverEnabled === true ? copy.card.turnServerOff(name) : copy.card.turnServerOn(name)}
            checked={way.serverEnabled ?? false}
            onCheckedChange={onServerToggle}
            size="xs"
          />
        ) : null}
      </div>

      {way.verb === 'authenticate' && onAuthenticate ? (
        <Button className="justify-self-start" onClick={onAuthenticate} size="xs">
          {copy.card.verb.authenticate}
        </Button>
      ) : null}
    </div>
  )
}
