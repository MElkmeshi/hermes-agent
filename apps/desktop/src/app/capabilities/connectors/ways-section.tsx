import { type ReactNode, useState } from 'react'

import { Button } from '@/components/ui/button'
import type { ConnectorCardField } from '@/components/ui/connector-card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { useI18n } from '@/i18n'

import { bothWaysOn } from './derive'
import type { ConnectorCardModel, ConnectorWayHosted, ConnectorWayLocal } from './types'

export interface WaysSectionProps {
  card: ConnectorCardModel
  /** False when the column above already leads with the hosted verb, so the row does not offer it twice. */
  hostedVerb?: boolean
  /** The bundled entry's credential fields. The section owns the draft and hands it to `onInstall`. */
  installFields?: readonly ConnectorCardField[]
  installing?: boolean
  /** Sign the server on this Mac in again; it keeps its own token, so this is not the hosted Connect. */
  onAuthenticate?: () => void
  onConnect: () => void
  onDisconnect?: () => void
  onInstall: (env: Record<string, string>) => void
  onReconnect: () => void
  onServerToggle?: (next: boolean) => void
}

/** The two forms of one app, side by side. An app with one form says it all in the column above. */
export function WaysSection({ card, ...rest }: WaysSectionProps) {
  const { t } = useI18n()
  const copy = t.connectorsPage.dialog
  const { hosted, local } = card.ways

  // The section exists to compare the forms, and it owns the local controls whenever it is drawn.
  if (!hosted || !local) {
    return null
  }

  return (
    <section className="grid gap-3">
      <h3 className="text-xs font-medium text-(--ui-text-primary)">{copy.waysTitle(card.name)}</h3>

      {/* One filled button per dialog: a server waiting for its sign-in has it, so Connect steps back. */}
      <HostedWay
        onConnect={rest.hostedVerb === false ? undefined : rest.onConnect}
        onDisconnect={rest.hostedVerb === false ? undefined : rest.onDisconnect}
        onReconnect={rest.hostedVerb === false ? undefined : rest.onReconnect}
        quiet={local.installed && local.verb === 'authenticate'}
        way={hosted}
      />

      <LocalWay
        installFields={rest.installFields}
        installing={rest.installing}
        name={card.name}
        onAuthenticate={rest.onAuthenticate}
        onInstall={rest.onInstall}
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

/** The installed server's one switch, wherever the column puts it: the dialog never draws a second. */
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

      {/* The server keeps its own sign-in, so this is the only place that can repair it. */}
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
  // A hosted column already names the account above this row.
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
            {copy.card.verb.reconnect}
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
  installFields = [],
  installing = false,
  name,
  onAuthenticate,
  onInstall,
  onServerToggle,
  way
}: {
  installFields?: readonly ConnectorCardField[]
  installing?: boolean
  name: string
  onAuthenticate?: () => void
  onInstall: (env: Record<string, string>) => void
  onServerToggle?: (next: boolean) => void
  way: ConnectorWayLocal
}) {
  const { t } = useI18n()
  const copy = t.connectorsPage

  return (
    <WayRow body={copy.dialog.wayLocalBody} title={copy.dialog.wayLocal}>
      {way.installed ? (
        <LocalServerControl name={name} onAuthenticate={onAuthenticate} onServerToggle={onServerToggle} way={way} />
      ) : (
        <LocalInstall installFields={installFields} installing={installing} onInstall={onInstall} />
      )}
    </WayRow>
  )
}

/** The offer to put the server on this Mac: the credentials it needs first, then the one verb. */
export function LocalInstall({
  installFields = [],
  installing = false,
  onInstall
}: {
  installFields?: readonly ConnectorCardField[]
  installing?: boolean
  onInstall: (env: Record<string, string>) => void
}) {
  const { t } = useI18n()
  const [draft, setDraft] = useState<Record<string, string>>({})
  const missing = installFields.some(field => field.required === true && !(draft[field.name] ?? '').trim())

  return (
    <div className="grid justify-items-start gap-2">
      {installFields.length > 0 ? (
        <>
          <p className="text-[0.7rem] text-(--ui-text-tertiary)">{t.settings.mcp.catalogEnvRequired}</p>
          {installFields.map(field => (
            <label className="grid w-full gap-1" key={field.name}>
              <span className="text-[0.65rem] text-(--ui-text-secondary)">
                {field.prompt || field.name}
                {field.required ? ' *' : ''}
              </span>
              <Input
                className="h-7 text-xs"
                onChange={event => setDraft({ ...draft, [field.name]: event.currentTarget.value })}
                type="password"
                value={draft[field.name] ?? ''}
              />
            </label>
          ))}
        </>
      ) : null}

      <Button
        disabled={installing || missing}
        loading={installing}
        onClick={() => onInstall(draft)}
        size="xs"
        variant="outline"
      >
        {t.connectorsPage.card.verb.install}
      </Button>
    </div>
  )
}
