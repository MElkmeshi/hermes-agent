import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConnectorLogo } from '@/components/ui/connector-logo'
import { Switch } from '@/components/ui/switch'
import { useI18n } from '@/i18n'
import type { Translations } from '@/i18n/types'
import { connectorIconUrl } from '@/lib/connector-tools'
import { cn } from '@/lib/utils'

import { CatalogMark } from './catalog-mark'
import { twinPillOf } from './derive'
import type { ConnectorAuthType, ConnectorCardModel, ConnectorFact, ConnectorState } from './types'

/** What a bundled entry will ask for at install: its one fact, in place of a state nobody has set yet. */
const AUTH_WORDS = {
  apiKey: 'authApiKey',
  none: null,
  oauth: 'authOauth'
} satisfies Record<ConnectorAuthType, 'authApiKey' | 'authOauth' | null>

/** Only the three states that cost the person something are coloured. */
const STATE_DOT = {
  available: 'bg-(--ui-text-quaternary)',
  broken: 'bg-(--ui-red)',
  connected: 'bg-(--ui-green)',
  connecting: 'bg-(--ui-yellow)',
  expired: 'bg-(--ui-orange)',
  off: 'bg-(--ui-text-quaternary)'
} satisfies Record<ConnectorState, string>

const REASON_TONE = {
  available: '',
  broken: 'text-(--ui-red)',
  connected: '',
  connecting: 'text-(--ui-text-secondary)',
  expired: 'text-(--ui-orange)',
  off: ''
} satisfies Record<ConnectorState, string>

function factText(copy: Translations['connectorsPage']['card'], fact: ConnectorFact): string {
  switch (fact.key) {
    case 'tools':
      return copy.fact.tools(fact.count)

    case 'toolsOff':
      return copy.fact.toolsOff(fact.count)

    case 'toolsOn':
      return copy.fact.toolsOn(fact.count)

    default:
      return copy.fact.toolsSomeOn(fact.count, fact.on ?? 0)
  }
}

export interface ConnectorRowCardProps {
  /** The card paints nothing before the backend answers, so the verb says it is busy instead. */
  busy?: boolean
  card: ConnectorCardModel
  onOpen: () => void
  /** Pointer or keyboard has reached this card: fetch what its dialog will need. */
  onPrefetch?: () => void
  /** Local cards only: the dialog is never needed to turn a server off. */
  onServerToggle?: (next: boolean) => void
  onVerb?: () => void
  /** The card whose dialog is open, highlighted behind it. */
  selected?: boolean
}

export function ConnectorRowCard({
  busy = false,
  card,
  onOpen,
  onPrefetch,
  onServerToggle,
  onVerb,
  selected = false
}: ConnectorRowCardProps) {
  const { t } = useI18n()
  const copy = t.connectorsPage.card
  const local = card.residency === 'local'
  const server = card.ways.local
  const offered = local && server?.installed === false ? server : undefined
  const authWord = offered?.authType ? AUTH_WORDS[offered.authType] : null
  // Nothing is set up yet, so the lane holds the one fact that tells these cards apart: the sign-in it asks for.
  const unset = card.state === 'available'

  // A working server says how much of itself is live where a hosted app says "Connected".
  const stateLabel = unset
    ? authWord && copy[authWord]
    : local && card.fact
      ? factText(copy, card.fact)
      : copy.state[card.stateWord]

  const reason = card.reason ? (card.reason.text ?? copy.reason[card.reason.key]) : undefined
  const twin = twinPillOf(card)

  return (
    <div
      className={cn(
        'relative flex items-center gap-3 rounded-lg border p-3 transition-colors duration-100',
        selected
          ? 'border-(--theme-primary) bg-(--ui-row-active-background)'
          : 'border-(--ui-stroke-quaternary) bg-(--ui-bg-elevated) hover:bg-(--chrome-action-hover)'
      )}
      data-connector={card.slug}
      data-slot="connector-row-card"
      onFocus={onPrefetch}
      onPointerEnter={onPrefetch}
    >
      <ConnectorLogo
        className="size-9 shrink-0 rounded-[9px]"
        connector={{ iconUrl: local ? undefined : connectorIconUrl(card.slug), name: card.slug, title: card.name }}
      />

      <div className="grid min-w-0 flex-1 gap-0.5">
        {/* Wrapping, not squeezing: at a laptop width the pill drops to its own line and the name stays whole. */}
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
          {/* The name's pseudo element covers the card, so the row is clickable without a nested button. */}
          <button
            className="min-w-0 truncate text-[0.8125rem] font-semibold text-(--ui-text-primary) outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-[0.1875rem] focus-visible:after:ring-ring/50"
            onClick={onOpen}
            type="button"
          >
            {card.name}
            <span className="sr-only">{` — ${copy.open(card.name)}`}</span>
          </button>

          <span className="shrink-0 text-[0.6875rem] text-(--ui-text-tertiary)">
            {local ? copy.localResidency : copy.hosted}
          </span>

          {card.inCatalog ? <CatalogMark /> : null}

          {twin ? (
            <Badge className="shrink-0" size="xs" variant="muted">
              {twin === 'hostedTwin' ? copy.hostedTwin : copy.alsoLocal}
            </Badge>
          ) : null}
        </div>

        <SecondLine card={card} reason={reason} />
      </div>

      <div className="relative z-10 flex w-[7.75rem] shrink-0 flex-col items-end gap-1">
        {stateLabel ? (
          <span className="flex items-center gap-1.5 text-[0.6875rem] text-(--ui-text-secondary)">
            {/* Nothing has been set up yet, so a dot here would colour a state nobody has reached. */}
            {unset ? null : (
              <span aria-hidden className={cn('size-[5px] shrink-0 rounded-full', STATE_DOT[card.state])} />
            )}
            <span className="truncate">{stateLabel}</span>
          </span>
        ) : null}

        {/* A column, not a slot: a server that needs signing in carries BOTH its switch and its repair. */}
        {local && server?.installed === true && onServerToggle ? (
          <Switch
            aria-label={server.serverEnabled ? copy.turnServerOff(card.name) : copy.turnServerOn(card.name)}
            checked={server.serverEnabled ?? false}
            onCheckedChange={onServerToggle}
            size="xs"
          />
        ) : null}

        {card.verb && onVerb ? (
          <Button
            disabled={busy}
            loading={busy}
            onClick={onVerb}
            size="xs"
            variant={card.state === 'available' ? 'outline' : 'secondary'}
          >
            {copy.verb[card.verb]}
          </Button>
        ) : !local && card.fact ? (
          <span className="truncate text-[0.6875rem] text-(--ui-text-tertiary)">{factText(copy, card.fact)}</span>
        ) : null}
      </div>
    </div>
  )
}

/** One line only: the reason it broke, else what the app is for, else the endpoint if it runs here. */
function SecondLine({ card, reason }: { card: ConnectorCardModel; reason?: string }) {
  if (reason) {
    return <p className={cn('truncate text-[0.72rem]', REASON_TONE[card.state])}>{reason}</p>
  }

  if (card.description) {
    return <p className="line-clamp-2 text-[0.72rem] leading-snug text-(--ui-text-secondary)">{card.description}</p>
  }

  const target = card.residency === 'local' ? card.ways.local?.target : undefined

  return target ? <p className="truncate font-mono text-[0.65rem] text-(--ui-text-tertiary)">{target}</p> : null
}
