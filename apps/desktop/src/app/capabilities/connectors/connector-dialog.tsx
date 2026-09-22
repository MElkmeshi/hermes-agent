import { type ReactNode, type RefObject, useRef } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { ConnectorLogo } from '@/components/ui/connector-logo'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { useI18n } from '@/i18n'
import type { Translations } from '@/i18n/types'
import { connectorIconUrl } from '@/lib/connector-tools'
import { cn } from '@/lib/utils'

import { CatalogMark } from './catalog-mark'
import { localResidencyWord } from './residency'
import type { ConnectorCardModel, ConnectorOffBy, ConnectorState, ConnectorVerb, ConnectorWayHosted } from './types'
import { LocalServerControl } from './ways-section'

type BadgeVariant = 'default' | 'destructive' | 'muted' | 'success' | 'warn'

const STATE_BADGE = {
  available: 'muted',
  broken: 'destructive',
  connected: 'success',
  connecting: 'warn',
  expired: 'warn',
  off: 'muted',
  unknown: 'muted'
} satisfies Record<ConnectorState, BadgeVariant>

const COLUMN_MAX_HEIGHT = 'max-h-[calc(85vh-4rem)]'

const RULEABLE = {
  available: false,
  broken: false,
  connected: true,
  connecting: false,
  expired: false,
  off: true,
  unknown: true
} satisfies Record<ConnectorState, boolean>

const ruleable = (way: ConnectorWayHosted | null): boolean => way !== null && way.connected && RULEABLE[way.state]

export interface ConnectorDialogProps {
  advanced?: ReactNode
  accountLabel?: string
  card: ConnectorCardModel
  connectedOn?: string
  connectElement?: ReactNode
  cost?: { tokensPerCall?: string; usesPerMonth?: string }
  menu?: ReactNode
  onAuthenticate?: () => void
  onDisconnect?: () => void
  onOpenAdmin?: () => void
  onOpenChange: (open: boolean) => void
  onServerToggle?: (next: boolean) => void
  onToggleForMe?: (next: boolean) => void
  onVerb?: () => void
  open: boolean
  orgDisabledCount?: number
  rulesReadOnly?: boolean
  togglePending?: boolean
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
        onOpenAutoFocus={event => {
          event.preventDefault()
          titleRef.current?.focus()
        }}
      >
        <Header card={card} menu={rest.menu} titleRef={titleRef} />

        <div className="grid min-h-0 grid-cols-[18.75rem_minmax(0,1fr)]">
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
            {local ? localResidencyWord(t.connectorsPage) : copy.hosted}
          </span>

          {card.inCatalog ? <CatalogMark /> : null}

          <Badge className="shrink-0" size="xs" variant={STATE_BADGE[card.state]}>
            {copy.state[card.stateWord]}
          </Badge>
        </div>

        <DialogDescription className="truncate text-[0.72rem] text-(--ui-text-secondary)">
          {card.description ?? localTarget(card) ?? copy.state[card.stateWord]}
        </DialogDescription>
      </div>

      {menu ? <div className="mr-7 shrink-0">{menu}</div> : null}
    </header>
  )
}

type ColumnProps = Omit<ConnectorDialogProps, 'onOpenChange' | 'open' | 'tools'>

type DialogCopy = Translations['connectorsPage']['dialog']

function switchHint(copy: DialogCopy, offBy: ConnectorOffBy | undefined): string {
  return offBy === 'org' ? copy.appSwitchOrg : copy.appSwitchHint
}

interface LeadVerb {
  run: () => void
  verb: ConnectorVerb
}

function leadVerb({
  appSwitch,
  card,
  hasElement,
  onVerb
}: {
  appSwitch: boolean
  card: ConnectorCardModel
  hasElement: boolean
  onVerb?: () => void
}): LeadVerb | undefined {
  const verb = card.verb

  if (hasElement || verb === undefined || onVerb === undefined || (verb === 'turnBackOn' && appSwitch)) {
    return undefined
  }

  return { run: onVerb, verb }
}

function HostedColumn({
  accountLabel,
  card,
  connectedOn,
  connectElement,
  onDisconnect,
  onOpenAdmin,
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
  const offerVerb = leadVerb({ appSwitch, card, hasElement: connectElement !== undefined, onVerb })

  return (
    <>
      {connectElement}

      {reason === undefined || connectElement ? null : (
        <p className="text-[0.72rem] text-(--ui-text-secondary)">{reason}</p>
      )}

      {offerVerb === undefined ? null : (
        <Button className="self-start" onClick={offerVerb.run} size="sm">
          {t.connectorsPage.card.verb[offerVerb.verb]}
        </Button>
      )}

      {accountLabel ? <p className="text-[0.78rem] text-(--ui-text-primary)">{copy.actsAs(accountLabel)}</p> : null}

      <ConnectedOn connectedOn={connectedOn} onDisconnect={onDisconnect} />

      {appSwitch && hosted && onToggleForMe ? (
        <AppSwitch
          card={card}
          frozen={togglePending || rulesReadOnly}
          on={hosted.state !== 'off'}
          onToggleForMe={onToggleForMe}
        />
      ) : null}

      <OrgNote count={orgDisabledCount} onOpenAdmin={onOpenAdmin} />

      <div className="grid gap-1 border-t border-(--ui-stroke-tertiary) pt-3">
        <p className="text-[0.7rem] text-(--ui-text-tertiary)">
          {copy.hostedFooter(localResidencyWord(t.connectorsPage))}
        </p>
        <p className="text-[0.7rem] text-(--ui-text-tertiary)">{copy.nousLine}</p>
      </div>
    </>
  )
}

function ConnectedOn({ connectedOn, onDisconnect }: { connectedOn?: string; onDisconnect?: () => void }) {
  const { t } = useI18n()
  const copy = t.connectorsPage.dialog

  if (!connectedOn) {
    return null
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[0.7rem] text-(--ui-text-tertiary)">{copy.connectedOn(connectedOn)}</span>
      {onDisconnect ? (
        <Button className="text-destructive hover:text-destructive" onClick={onDisconnect} size="xs" variant="text">
          {copy.disconnect}
        </Button>
      ) : null}
    </div>
  )
}

function AppSwitch({
  card,
  frozen,
  on,
  onToggleForMe
}: {
  card: ConnectorCardModel
  frozen: boolean
  on: boolean
  onToggleForMe: (next: boolean) => void
}) {
  const { t } = useI18n()
  const copy = t.connectorsPage.dialog

  return (
    <div className="grid gap-1 border-t border-(--ui-stroke-tertiary) pt-3">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 text-xs font-medium text-(--ui-text-primary)">{copy.appSwitch(card.name)}</span>
        <Switch
          aria-label={copy.appSwitch(card.name)}
          checked={on}
          disabled={card.offBy === 'org' || frozen}
          onCheckedChange={onToggleForMe}
          size="xs"
        />
      </div>
      <p className="text-[0.7rem] text-(--ui-text-tertiary)">{switchHint(copy, card.offBy)}</p>
    </div>
  )
}

function OrgNote({ count, onOpenAdmin }: { count: number; onOpenAdmin?: () => void }) {
  const { t } = useI18n()
  const copy = t.connectorsPage.dialog

  if (count <= 0) {
    return null
  }

  return (
    <div className="grid gap-1 rounded-md bg-(--ui-orange)/8 p-2.5">
      <p className="text-[0.7rem] text-(--ui-text-secondary)">{copy.orgNote(count)}</p>
      {onOpenAdmin ? (
        <Button className="justify-self-start" onClick={onOpenAdmin} size="inline" variant="textStrong">
          {copy.orgLink}
        </Button>
      ) : null}
    </div>
  )
}

function LocalColumn({
  advanced,
  card,
  cost,
  onAuthenticate,
  onServerToggle
}: ColumnProps) {
  const { t } = useI18n()
  const copy = t.connectorsPage.dialog
  const target = localTarget(card)
  const local = card.ways.local

  return (
    <>
      {card.ways.hosted || !local ? null : (
        <LocalServerControl
          name={card.name}
          onAuthenticate={onAuthenticate}
          onServerToggle={onServerToggle}
          way={local}
        />
      )}

      {local && !card.ways.hosted && target ? (
        <div className="grid gap-1.5">
          <h3 className="text-xs font-medium text-(--ui-text-primary)">{copy.whereItLives}</h3>
          <code className="break-all font-mono text-[0.65rem] text-(--ui-text-tertiary)">{target}</code>
        </div>
      ) : null}

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
