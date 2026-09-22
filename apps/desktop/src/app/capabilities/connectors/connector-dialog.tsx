import { type ReactNode, type RefObject, useRef } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import type { ConnectorCardField } from '@/components/ui/connector-card'
import { ConnectorLogo } from '@/components/ui/connector-logo'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { useI18n } from '@/i18n'
import type { Translations } from '@/i18n/types'
import { connectorIconUrl } from '@/lib/connector-tools'
import { cn } from '@/lib/utils'

import { CatalogMark } from './catalog-mark'
import type { ConnectorCardModel, ConnectorOffBy, ConnectorState, ConnectorWayHosted } from './types'
import { LocalInstall, LocalServerControl, WaysSection } from './ways-section'

type BadgeVariant = 'default' | 'destructive' | 'muted' | 'success' | 'warn'

const STATE_BADGE = {
  available: 'muted',
  broken: 'destructive',
  connected: 'success',
  connecting: 'warn',
  expired: 'warn',
  off: 'muted'
} satisfies Record<ConnectorState, BadgeVariant>

/** The shell is as tall as its taller column; past this each column scrolls on its own instead. */
const COLUMN_MAX_HEIGHT = 'max-h-[calc(85vh-4rem)]'

/** A repair state has nothing to rule on: the column leads with Reconnect and says why. */
const RULEABLE = {
  available: false,
  broken: false,
  connected: true,
  connecting: false,
  expired: false,
  off: true
} satisfies Record<ConnectorState, boolean>

/** The person's own rule over an app, which needs an account that exists and works. */
const ruleable = (way: ConnectorWayHosted | null): boolean => way !== null && way.connected && RULEABLE[way.state]

export interface ConnectorDialogProps {
  /** A local server's mcp.json entry, logs and Remove. Lives here and only here. */
  advanced?: ReactNode
  /** The signed-in identity Hermes acts as. */
  accountLabel?: string
  card: ConnectorCardModel
  /** Already formatted for the reader's locale by the caller. */
  connectedOn?: string
  /** The connect in flight, or how one ended: the column's first element, and its one verb. */
  connectElement?: ReactNode
  cost?: { tokensPerCall?: string; usesPerMonth?: string }
  /** The bundled entry's credential fields, while its install still needs them. */
  installFields?: readonly ConnectorCardField[]
  installing?: boolean
  /** The kebab's menu. Absent means no kebab. */
  menu?: ReactNode
  /** Sign the server on this Mac in again. Absent when no server is installed. */
  onAuthenticate?: () => void
  onConnect: () => void
  onDisconnect?: () => void
  onInstall: (env: Record<string, string>) => void
  onOpenAdmin?: () => void
  onOpenChange: (open: boolean) => void
  onReconnect: () => void
  onServerToggle?: (next: boolean) => void
  onToggleForMe?: (next: boolean) => void
  /** The column's first control: the same verb, with the same handler, as the card's. */
  onVerb?: () => void
  open: boolean
  /** How many tools the organisation took away. Zero means no note. */
  orgDisabledCount?: number
  /** The rules read failed: the switch still says what is on, but nothing here can write a rule. */
  rulesReadOnly?: boolean
  /** The switch is never optimistic: the policy write can take the full connector deadline. */
  togglePending?: boolean
  /** The right column: `ToolsList`. */
  tools: ReactNode
}

const localTarget = (card: ConnectorCardModel): string | undefined => card.ways.local?.target

export function ConnectorDialog({ card, onOpenChange, open, tools, ...rest }: ConnectorDialogProps) {
  const { t } = useI18n()
  const local = card.residency === 'local'
  const titleRef = useRef<HTMLHeadingElement>(null)

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        bodyClassName="gap-0 overflow-hidden p-0"
        className="max-h-[min(55rem,85vh)] min-w-[min(62.5rem,92vw)]"
        fitContent
        // Radix would focus the first tabbable node, which here turns something off; the title takes it instead.
        onOpenAutoFocus={event => {
          event.preventDefault()
          titleRef.current?.focus()
        }}
      >
        <Header card={card} menu={rest.menu} titleRef={titleRef} />

        <div className="grid min-h-0 grid-cols-[18.75rem_minmax(0,1fr)]">
          {/* Self-start, so the hairline stops with the column: stretched, it draws a box around the space it does not use. */}
          <div
            className={cn(
              'flex min-h-0 flex-col gap-3 self-start overflow-y-auto border-r border-(--ui-stroke-tertiary) p-4',
              COLUMN_MAX_HEIGHT
            )}
          >
            {local ? <LocalColumn card={card} {...rest} /> : <HostedColumn card={card} {...rest} />}
          </div>

          <div className={cn('flex min-h-0 flex-col', COLUMN_MAX_HEIGHT)}>{tools}</div>
        </div>

        <span className="sr-only">{t.connectorsPage.title}</span>
      </DialogContent>
    </Dialog>
  )
}

function Header({
  card,
  menu,
  titleRef
}: {
  card: ConnectorCardModel
  menu?: ReactNode
  titleRef: RefObject<HTMLHeadingElement | null>
}) {
  const { t } = useI18n()
  const copy = t.connectorsPage.card
  const local = card.residency === 'local'

  return (
    <header className="flex shrink-0 items-center gap-2.5 border-b border-(--ui-stroke-tertiary) px-5 py-3">
      <ConnectorLogo
        className="size-9 shrink-0 rounded-[9px]"
        connector={{ iconUrl: local ? undefined : connectorIconUrl(card.slug), name: card.slug, title: card.name }}
      />

      <div className="grid min-w-0 flex-1 gap-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <DialogTitle className="truncate text-base font-semibold outline-none" ref={titleRef} tabIndex={-1}>
            {card.name}
          </DialogTitle>

          <span className="shrink-0 text-[0.6875rem] text-(--ui-text-tertiary)">
            {local ? copy.localResidency : copy.hosted}
          </span>

          {card.inCatalog ? <CatalogMark /> : null}

          <Badge className="shrink-0" size="xs" variant={STATE_BADGE[card.state]}>
            {copy.state[card.stateWord]}
          </Badge>
        </div>

        <DialogDescription className="truncate text-[0.72rem] text-(--ui-text-secondary)">
          {card.description ?? localTarget(card) ?? ''}
        </DialogDescription>
      </div>

      {/* The close button sits at the shell's top right; the kebab keeps clear of it. */}
      {menu ? <div className="mr-7 shrink-0">{menu}</div> : null}
    </header>
  )
}

type ColumnProps = Omit<ConnectorDialogProps, 'onOpenChange' | 'open' | 'tools'>

type DialogCopy = Translations['connectorsPage']['dialog']

/** A failed rules read is said once, in the tools column, where its Retry is; here only the org note. */
function switchHint(copy: DialogCopy, offBy: ConnectorOffBy | undefined): string {
  return offBy === 'org' ? copy.appSwitchOrg : copy.appSwitchHint
}

function HostedColumn({
  accountLabel,
  card,
  connectedOn,
  connectElement,
  installFields,
  installing,
  onAuthenticate,
  onConnect,
  onDisconnect,
  onInstall,
  onOpenAdmin,
  onReconnect,
  onServerToggle,
  onToggleForMe,
  onVerb,
  orgDisabledCount = 0,
  rulesReadOnly = false,
  togglePending = false
}: ColumnProps) {
  const { t } = useI18n()
  const copy = t.connectorsPage.dialog
  const hosted = card.ways.hosted

  const reason = card.reason ? (card.reason.text ?? t.connectorsPage.card.reason[card.reason.key]) : undefined
  const appSwitch = ruleable(hosted) && onToggleForMe !== undefined
  // The connect in flight is the state's own line and its own verb, so the column offers neither twice.
  const offerVerb = !connectElement && card.verb && onVerb && !(card.verb === 'turnBackOn' && appSwitch)

  return (
    <>
      {connectElement}

      {reason && !connectElement ? <p className="text-[0.72rem] text-(--ui-text-secondary)">{reason}</p> : null}

      {/* The verb the card offered, in the place the eye lands first; the switch below already turns it on. */}
      {offerVerb && card.verb && onVerb ? (
        <Button className="self-start" onClick={onVerb} size="sm">
          {t.connectorsPage.card.verb[card.verb]}
        </Button>
      ) : null}

      {accountLabel ? <p className="text-[0.78rem] text-(--ui-text-primary)">{copy.actsAs(accountLabel)}</p> : null}

      {connectedOn ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-[0.7rem] text-(--ui-text-tertiary)">{copy.connectedOn(connectedOn)}</span>
          {onDisconnect ? (
            <Button className="text-destructive hover:text-destructive" onClick={onDisconnect} size="xs" variant="text">
              {copy.disconnect}
            </Button>
          ) : null}
        </div>
      ) : null}

      {appSwitch && hosted && onToggleForMe ? (
        <div className="grid gap-1 border-t border-(--ui-stroke-tertiary) pt-3">
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 text-xs font-medium text-(--ui-text-primary)">{copy.appSwitch(card.name)}</span>
            <Switch
              aria-label={copy.appSwitch(card.name)}
              checked={hosted.state !== 'off'}
              disabled={card.offBy === 'org' || togglePending || rulesReadOnly}
              onCheckedChange={onToggleForMe}
              size="xs"
            />
          </div>
          <p className="text-[0.7rem] text-(--ui-text-tertiary)">{switchHint(copy, card.offBy)}</p>
        </div>
      ) : null}

      {orgDisabledCount > 0 ? (
        <div className="grid gap-1 rounded-md bg-(--ui-orange)/8 p-2.5">
          <p className="text-[0.7rem] text-(--ui-text-secondary)">{copy.orgNote(orgDisabledCount)}</p>
          {onOpenAdmin ? (
            <Button className="justify-self-start" onClick={onOpenAdmin} size="inline" variant="textStrong">
              {copy.orgLink}
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* The column leads with the hosted verb, so the hosted row here states the form and nothing more. */}
      <WaysSection
        card={card}
        hostedVerb={false}
        installFields={installFields}
        installing={installing}
        onAuthenticate={onAuthenticate}
        onConnect={onConnect}
        onDisconnect={onDisconnect}
        onInstall={onInstall}
        onReconnect={onReconnect}
        onServerToggle={onServerToggle}
      />
    </>
  )
}

function LocalColumn({
  advanced,
  card,
  cost,
  installFields,
  installing,
  onAuthenticate,
  onConnect,
  onDisconnect,
  onInstall,
  onReconnect,
  onServerToggle
}: ColumnProps) {
  const { t } = useI18n()
  const copy = t.connectorsPage.dialog
  const target = localTarget(card)
  const overHttp = target?.startsWith('http') ?? false
  const local = card.ways.local

  return (
    <>
      {/* An app that also runs hosted keeps every local control in the section below, and only there. */}
      {card.ways.hosted || !local ? null : local.installed ? (
        <LocalServerControl
          name={card.name}
          onAuthenticate={onAuthenticate}
          onServerToggle={onServerToggle}
          way={local}
        />
      ) : (
        <div className="grid justify-items-start gap-2">
          <p className="text-[0.7rem] leading-relaxed text-(--ui-text-secondary)">{copy.wayLocalBody}</p>
          <LocalInstall installFields={installFields} installing={installing} onInstall={onInstall} />
        </div>
      )}

      {/* The two-forms section below already says where an app that also runs hosted lives. */}
      {local?.installed && !card.ways.hosted ? (
        <div className="grid gap-1.5">
          <h3 className="text-xs font-medium text-(--ui-text-primary)">{copy.whereItLives}</h3>
          <p className="text-[0.7rem] leading-relaxed text-(--ui-text-secondary)">
            {overHttp ? copy.localUrlBody : copy.localProgramBody}
          </p>
          {target ? (
            <code className="break-all font-mono text-[0.65rem] text-(--ui-text-tertiary)">{target}</code>
          ) : null}
        </div>
      ) : null}

      <WaysSection
        card={card}
        installFields={installFields}
        installing={installing}
        onAuthenticate={onAuthenticate}
        onConnect={onConnect}
        onDisconnect={onDisconnect}
        onInstall={onInstall}
        onReconnect={onReconnect}
        onServerToggle={onServerToggle}
      />

      {cost && (cost.tokensPerCall || cost.usesPerMonth) ? (
        <>
          <Separator />
          <div className="grid gap-1.5">
            <h3 className="text-xs font-medium text-(--ui-text-primary)">{copy.whatItCosts}</h3>
            <div className="flex gap-6">
              <Metric label={copy.tokensPerCall} value={cost.tokensPerCall} />
              <Metric label={copy.usesPerMonth} value={cost.usesPerMonth} />
            </div>
          </div>
        </>
      ) : null}

      {advanced ? (
        <>
          <Separator />
          <details className="group grid gap-2">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-(--ui-text-primary)">
              <Codicon
                className={cn('shrink-0 transition-transform duration-100 group-open:rotate-90')}
                name="chevron-right"
                size="0.75rem"
              />
              <span className="shrink-0">{copy.advanced}</span>
              {/* One line beside the word it belongs to: wrapped, the hint read as a list of its own. */}
              <span className="min-w-0 truncate font-normal text-(--ui-text-quaternary)">{copy.advancedHint}</span>
            </summary>
            <div className="pt-2">{advanced}</div>
          </details>
        </>
      ) : null}
    </>
  )
}

function Metric({ label, value }: { label: string; value?: string }) {
  if (!value) {
    return null
  }

  return (
    <div className="grid gap-0.5">
      <span className="text-sm font-semibold tabular-nums text-(--ui-text-primary)">{value}</span>
      <span className="text-[0.65rem] text-(--ui-text-quaternary)">{label}</span>
    </div>
  )
}
