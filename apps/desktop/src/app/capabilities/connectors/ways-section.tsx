import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useI18n } from '@/i18n'

import { bothWaysOn } from './derive'
import { localResidencyWord } from './residency'
import type { ConnectorCardModel, ConnectorWayHosted, ConnectorWayLocal } from './types'

export interface WaysSectionProps {
  card: ConnectorCardModel
  hostedVerb?: boolean
  onAuthenticate?: () => void
  onConnect: () => void
  onDisconnect?: () => void
  onReconnect: () => void
  onServerToggle?: (next: boolean) => void
}

export function WaysSection({ card, ...rest }: WaysSectionProps) {
  const { t } = useI18n()
  const copy = t.connectorsPage.dialog
  const { hosted, local } = card.ways

  if (!hosted || !local) {
    return null
  }

  return (
    <section className="grid gap-3">
      <h3 className="text-xs font-medium text-(--ui-text-primary)">{copy.waysTitle(card.name)}</h3>

      <HostedWay
        onConnect={rest.hostedVerb === false ? undefined : rest.onConnect}
        onDisconnect={rest.hostedVerb === false ? undefined : rest.onDisconnect}
        onReconnect={rest.hostedVerb === false ? undefined : rest.onReconnect}
        quiet={local.verb === 'authenticate'}
        way={hosted}
      />

      <LocalWay
        name={card.name}
        onAuthenticate={rest.onAuthenticate}
        onServerToggle={rest.onServerToggle}
        way={local}
      />

      {bothWaysOn(card.ways) && rest.onServerToggle ? (
        <div className="grid justify-items-start gap-1">
          <p className="text-[0.7rem] text-(--ui-text-secondary)">{copy.bothOn(card.name)}</p>
          <Button onClick={() => rest.onServerToggle?.(false)} size="inline" variant="textStrong">
            {copy.turnOffLocal}
          </Button>
        </div>
      ) : null}
    </section>
  )
}

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

function WayRow({ body, children, title }: { body: string; children: ReactNode; title: string }) {
  return (
    <div className="grid gap-1 border-t border-(--ui-stroke-tertiary) pt-2">
      <span className="text-[0.72rem] font-medium text-(--ui-text-primary)">{title}</span>
      <p className="text-[0.7rem] leading-relaxed text-(--ui-text-secondary)">{body}</p>
      {children}
    </div>
  )
}

function HostedWay({
  onConnect,
  onDisconnect,
  onReconnect,
  quiet = false,
  way
}: {
  onConnect?: () => void
  onDisconnect?: () => void
  onReconnect?: () => void
  quiet?: boolean
  way: ConnectorWayHosted
}) {
  const { t } = useI18n()
  const copy = t.connectorsPage
  const ownsHosted = Boolean(onConnect || onDisconnect || onReconnect)

  return (
    <WayRow body={copy.dialog.wayHostedBody} title={copy.dialog.wayHosted}>
      <div className="flex flex-wrap items-center gap-2">
        {way.accountLabel && ownsHosted ? (
          <span className="min-w-0 flex-1 truncate text-[0.7rem] text-(--ui-text-tertiary)">{way.accountLabel}</span>
        ) : null}

        {way.state === 'available' && onConnect ? (
          <Button onClick={onConnect} size="xs" variant={quiet ? 'outline' : undefined}>
            {copy.card.verb.connect}
          </Button>
        ) : null}

        {(way.state === 'expired' || way.state === 'broken') && onReconnect ? (
          <Button onClick={onReconnect} size="xs" variant="secondary">
            {copy.card.verb[way.state === 'broken' ? 'tryAgain' : 'reconnect']}
          </Button>
        ) : null}

        {way.state === 'connected' && onDisconnect ? (
          <Button className="text-destructive hover:text-destructive" onClick={onDisconnect} size="xs" variant="text">
            {copy.dialog.disconnect}
          </Button>
        ) : null}
      </div>
    </WayRow>
  )
}

function LocalWay({
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
    <WayRow body={copy.dialog.wayLocalBody} title={localResidencyWord(copy)}>
      <LocalServerControl name={name} onAuthenticate={onAuthenticate} onServerToggle={onServerToggle} way={way} />
    </WayRow>
  )
}
