import { type ReactNode, useState } from 'react'

import { PanelEmpty } from '@/app/overlays/panel'
import { Button } from '@/components/ui/button'
import { ErrorBanner } from '@/components/ui/error-state'
import { SearchField } from '@/components/ui/search-field'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { useI18n } from '@/i18n'

import { ConnectorRowCard } from './connector-row-card'
import { EMPTY_CONNECTORS_FILTER } from './derive'
import { derivePage, showsAttentionFirst } from './derive-page'
import { ToolsWash } from './tools-status'
import type { ConnectorCardModel, ConnectorGroupModel, ConnectorSegmentId, ConnectorsFilter } from './types'

/** Two rows of two, so the groups below the Available shelf stay on screen. */
const AVAILABLE_PREVIEW = 4

export interface ConnectorsDirectoryProps {
  /** The page action, top right. The wiring slice owns what it opens. */
  addYourOwn?: ReactNode
  /** The app whose write is in flight, so its verb can say so. */
  busySlug?: null | string
  cards: ConnectorCardModel[]
  filter: ConnectorsFilter
  /** Only the hosted half failed. The servers on this Mac still render. */
  hostedFailed?: boolean
  loading?: boolean
  /** The quiet lines about the hosted half, above the groups. The servers on this Mac render under them. */
  notices?: ReactNode
  onFilterChange: (next: ConnectorsFilter) => void
  onOpen: (card: ConnectorCardModel) => void
  onPrefetch?: (card: ConnectorCardModel) => void
  onRetryHosted?: () => void
  onServerToggle?: (card: ConnectorCardModel, next: boolean) => void
  onVerb?: (card: ConnectorCardModel) => void
  selectedSlug?: null | string
}

export function ConnectorsDirectory({
  addYourOwn,
  busySlug = null,
  cards,
  filter,
  hostedFailed = false,
  loading = false,
  notices,
  onFilterChange,
  onOpen,
  onPrefetch,
  onRetryHosted,
  onServerToggle,
  onVerb,
  selectedSlug = null
}: ConnectorsDirectoryProps) {
  const { t } = useI18n()
  const copy = t.connectorsPage
  const set = (patch: Partial<ConnectorsFilter>) => onFilterChange({ ...filter, ...patch })

  const { groups, hiddenMatches, segment, segments } = derivePage(cards, filter)

  // `All` plus one group is the same set twice, and that group's own header already carries the count.
  const showSegments = segments.length > 2
  const segmentFellBack = segments.length > 0 && segment !== filter.segment

  // Available is a shelf only while other groups sit above it; alone, or under a search, it is the page.
  const truncateAvailable = groups.length > 1 && filter.query.trim() === ''

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3" data-slot="connectors-directory">
      <div className="flex shrink-0 items-center gap-3">
        <h2 className="flex-1 text-sm font-semibold text-(--ui-text-primary)">{copy.title}</h2>
        {addYourOwn}
      </div>

      {/* An empty list hides every control that can only narrow it back to the same nothing. */}
      {cards.length === 0 ? null : (
        <>
          <div className="flex shrink-0 items-center gap-3 border-b border-(--ui-stroke-tertiary) pb-1.5">
            <SearchField
              containerClassName="min-w-0 flex-1"
              onChange={query => set({ query })}
              placeholder={copy.searchPlaceholder(cards.length)}
              value={filter.query}
            />
          </div>

          {showSegments || segmentFellBack || hiddenMatches > 0 ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {showSegments ? (
                <SegmentedControl
                  onChange={(next: ConnectorSegmentId) => set({ segment: next })}
                  options={segments.map(option => ({
                    id: option.id,
                    label: `${copy.segment[option.id]} ${option.count}`
                  }))}
                  value={segment}
                />
              ) : null}

              {segmentFellBack ? (
                <span className="text-[0.7rem] text-(--ui-text-tertiary)">
                  {copy.page.segmentNoMatch(copy.segment[filter.segment])}
                </span>
              ) : null}

              {hiddenMatches > 0 ? (
                <span className="flex items-center gap-1 text-[0.7rem] text-(--ui-text-tertiary)">
                  {copy.page.matchesElsewhere(hiddenMatches)}
                  <Button onClick={() => set({ segment: 'all' })} size="xs" variant="text">
                    {copy.page.showAllMatches}
                  </Button>
                </span>
              ) : null}
            </div>
          ) : null}
        </>
      )}

      {notices}

      {hostedFailed && onRetryHosted ? (
        <ErrorBanner className="shrink-0 items-center">
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <span className="font-medium">{copy.page.hostedFailedTitle}</span>
            <span className="opacity-80">{copy.page.hostedFailedBody}</span>
            <Button className="text-destructive" onClick={onRetryHosted} size="xs" variant="text">
              {copy.page.retry}
            </Button>
          </span>
        </ErrorBanner>
      ) : null}

      {loading ? (
        <ToolsWash label={copy.page.loading} rows={10} />
      ) : groups.length > 0 ? (
        // `content-start`: without it the grid stretches its rows, and a card with one line becomes a tall box.
        <div className="grid min-h-0 flex-1 content-start gap-6 overflow-y-auto overscroll-contain pb-4">
          {groups.map(group => (
            <Group
              busySlug={busySlug}
              group={group}
              key={group.id}
              onOpen={onOpen}
              onPrefetch={onPrefetch}
              onServerToggle={onServerToggle}
              onVerb={onVerb}
              selectedSlug={selectedSlug}
              truncateAvailable={truncateAvailable}
            />
          ))}
        </div>
      ) : cards.length === 0 ? (
        // A failed hosted half cannot claim "nothing here yet": the banner above already says what happened.
        hostedFailed ? null : (
          <PanelEmpty action={addYourOwn} icon="plug" title={copy.page.emptyTitle} />
        )
      ) : (
        <PanelEmpty
          action={
            <div className="flex items-center gap-2">
              <Button onClick={() => set(EMPTY_CONNECTORS_FILTER)} size="xs" variant="secondary">
                {copy.page.clearSearch}
              </Button>
              {addYourOwn}
            </div>
          }
          description={copy.page.noMatchBody}
          icon="search"
          title={copy.page.noMatchTitle}
        />
      )}
    </div>
  )
}

function Group({
  busySlug,
  group,
  onOpen,
  onPrefetch,
  onServerToggle,
  onVerb,
  selectedSlug,
  truncateAvailable
}: {
  busySlug: null | string
  group: ConnectorGroupModel
  onOpen: (card: ConnectorCardModel) => void
  onPrefetch?: (card: ConnectorCardModel) => void
  onServerToggle?: (card: ConnectorCardModel, next: boolean) => void
  onVerb?: (card: ConnectorCardModel) => void
  selectedSlug: null | string
  truncateAvailable: boolean
}) {
  const { t } = useI18n()
  const copy = t.connectorsPage.group
  const [expanded, setExpanded] = useState(false)
  const truncates = group.id === 'available' && truncateAvailable && group.cards.length > AVAILABLE_PREVIEW
  const shown = truncates && !expanded ? group.cards.slice(0, AVAILABLE_PREVIEW) : group.cards

  return (
    <section className="grid gap-2">
      <header className="flex items-center gap-2">
        <h3 className="text-xs font-semibold text-(--ui-text-primary)">{copy[group.id]}</h3>
        <span className="tabular-nums text-xs text-(--ui-text-tertiary)">{group.cards.length}</span>

        {group.id === 'connected' && showsAttentionFirst(group) ? <Note>{copy.connectedNote}</Note> : null}
        {group.id === 'off' ? <Note>{copy.offNote}</Note> : null}

        {truncates ? (
          <Button className="ml-auto" onClick={() => setExpanded(!expanded)} size="xs" variant="text">
            {expanded ? copy.availableShowFewer : copy.availableShowAll(group.cards.length)}
          </Button>
        ) : null}
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        {shown.map(card => (
          <ConnectorRowCard
            busy={busySlug === card.slug}
            card={card}
            key={`${card.residency}:${card.slug}`}
            onOpen={() => onOpen(card)}
            onPrefetch={onPrefetch ? () => onPrefetch(card) : undefined}
            onServerToggle={onServerToggle ? next => onServerToggle(card, next) : undefined}
            onVerb={onVerb ? () => onVerb(card) : undefined}
            selected={selectedSlug === card.slug}
          />
        ))}
      </div>
    </section>
  )
}

function Note({ children }: { children: ReactNode }) {
  return <span className="truncate text-[0.65rem] text-(--ui-text-tertiary)">{children}</span>
}
