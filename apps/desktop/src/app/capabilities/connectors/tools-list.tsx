// Every closed row is `TOOL_ROW_HEIGHT` and at most one disclosure is open; the window is index arithmetic on that.

import { type ReactNode, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'

import {
  availableQuickActions,
  categoryCounts,
  deprecatedCount,
  EMPTY_TOOLS_FILTER,
  facetChips,
  facetSummary,
  filterTools,
  hintChips,
  isTinyConnector
} from './derive-tools'
import { TOOL_ROW_HEIGHT, ToolRow } from './tool-row'
import { ToolsFilterBar } from './tools-filter-bar'
import { isToolsStatusPhase, ToolsStatus, type ToolsStatusAction, ToolsWash } from './tools-status'
import { ToolsSummary, useShowAllTools } from './tools-summary'
import type {
  ConflictDifference,
  QuickAction,
  ToolRowModel,
  ToolsEditorCounts,
  ToolsFilter,
  ToolsFreshness
} from './types'
import type { ToolsEditor } from './use-tools-editor'

const OVERSCAN = 4
const MIN_VIEWPORT = 200

/** Stable, so a read-only bar does not get a fresh array on every render. */
const EMPTY_QUICK_ACTIONS: QuickAction[] = []

export interface ToolsListProps {
  /** The person turned the whole app off, and the portal refuses a tool rule for an app that is off. */
  appOff?: boolean
  /** Only read in the `conflict` phase. */
  conflict?: ConflictDifference
  connectorName: string
  editor: ToolsEditor
  freshness?: ToolsFreshness
  /** Identifies the list itself, so its openness follows the app rather than its display title. */
  listKey: string
  onRefresh: () => void
  onReload: () => void
  onRemove: () => void
  onRetry: () => void
  /** Read the rules again. Shown beside the switches the failed read froze. */
  onRetryRules?: () => void
  /** Absent where no sign-in control can appear, so a sign-in line can never be drawn without its way out. */
  onSignIn?: () => void
  /** No account yet: the list says what the app would bring, and carries no switch at all. */
  preview?: boolean
  /** The list still reads, but every switch is inert, the quick actions are gone and there is no footer. */
  readOnly?: boolean
  /** The rules read refused this identity, so a Retry could never win. */
  rulesSignedOut?: boolean
  /** The portal refused this identity: the cached list stays, with one quiet line beside it. */
  signedOut?: boolean
  tools: ToolRowModel[]
}

export function ToolsList(props: ToolsListProps) {
  const [filter, setFilter] = useState<ToolsFilter>(EMPTY_TOOLS_FILTER)

  const {
    appOff = false,
    conflict,
    connectorName,
    editor,
    listKey,
    onReload,
    onRemove,
    onRetry,
    onRetryRules,
    onSignIn,
    preview = false,
    readOnly = false,
    rulesSignedOut = false,
    signedOut = false,
    tools
  } = props

  const phase = editor.phase
  // Nothing here can be written, either because the rules refused or because there is no account.
  const frozen = readOnly || preview || appOff
  // A list the person left open reopens open, and an unsaved edit opens it by itself.
  const all = useShowAllTools(listKey, editor.dirty)

  // Counted over every row the reader can reach: no chip vanishes under a sibling, none names a hidden row.
  const chrome = useMemo(() => {
    const counted = filter.showDeprecated ? tools : tools.filter(tool => !tool.deprecated)

    return {
      categories: categoryCounts(counted),
      deprecated: deprecatedCount(tools),
      facets: facetChips(counted),
      hints: hintChips(counted),
      quickActions: availableQuickActions(tools),
      tiny: isTinyConnector(tools)
    }
  }, [filter.showDeprecated, tools])

  const visible = useMemo(() => filterTools(tools, filter), [tools, filter])
  const summary = useMemo(() => facetSummary(tools, editor.isOn), [tools, editor.isOn])

  if (phase === 'loading') {
    return <ToolsWash />
  }

  // The app is still there and its saved rule still holds, so only the read is worth saying.
  if (phase === 'unavailable') {
    return <UnavailableLine onRetry={onRetry} />
  }

  if (isToolsStatusPhase(phase)) {
    const act: Record<ToolsStatusAction, (() => void) | undefined> = {
      keepMine: () => void editor.keepMine(),
      reload: onReload,
      remove: onRemove,
      signIn: onSignIn
    }

    return (
      <ToolsStatus
        connectorName={connectorName}
        difference={conflict ?? { theyOff: 0, theyOn: 0 }}
        onAction={id => act[id]?.()}
        phase={phase}
      />
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-slot="tools-list">
      {all.open ? (
        <ToolsFilterBar
          categories={chrome.categories}
          currentAction={editor.currentAction}
          facets={chrome.facets}
          filter={filter}
          freshness={props.freshness}
          hints={chrome.hints}
          onApplyQuickAction={editor.applyQuickAction}
          onFilterChange={setFilter}
          onRefresh={props.onRefresh}
          onShowSummary={all.hide}
          quickActions={frozen ? EMPTY_QUICK_ACTIONS : chrome.quickActions}
          tiny={chrome.tiny}
          total={tools.length}
        />
      ) : (
        <ToolsSummary
          connectorName={connectorName}
          freshness={props.freshness}
          onRefresh={props.onRefresh}
          onShowAll={all.show}
          onToggleFacet={editor.toggleFacet}
          preview={preview}
          readOnly={readOnly || appOff}
          rows={summary}
          total={tools.length}
        />
      )}

      {/* Beside the switches it froze, whichever view is open. An app with no account has no rule to fail. */}
      {(readOnly || appOff) && !preview ? (
        <RulesLine
          appOffName={appOff ? connectorName : undefined}
          onRetryRules={onRetryRules}
          onSignIn={onSignIn}
          signedOut={rulesSignedOut}
        />
      ) : null}

      {signedOut && onSignIn ? <SignInLine onSignIn={onSignIn} /> : null}

      {/* Stays mounted through a query that matches nothing: it owns the scroll offset and the open row. */}
      {all.open ? (
        <ToolViewport
          isOn={editor.isOn}
          onToggle={editor.toggle}
          preview={preview}
          readOnly={frozen}
          tools={visible}
        />
      ) : null}

      {all.open && chrome.deprecated > 0 ? (
        <DeprecatedToggle
          count={chrome.deprecated}
          onToggle={() => setFilter({ ...filter, showDeprecated: !filter.showDeprecated })}
          shown={filter.showDeprecated}
        />
      ) : null}

      {editor.dirty && !frozen ? (
        <DirtyFooter
          counts={editor.counts}
          onDiscard={editor.discard}
          onSave={() => void editor.save()}
          saving={phase === 'saving'}
        />
      ) : null}
    </div>
  )
}

function Line({ action, label }: { action?: ReactNode; label: string }) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-(--ui-stroke-tertiary) px-3.5 py-1.5">
      <span className="min-w-0 flex-1 text-[0.7rem] text-(--ui-text-tertiary)">{label}</span>
      {action}
    </div>
  )
}

/** One quiet line, never an empty state: a failed read is not a verdict about the app. */
function UnavailableLine({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n()

  return (
    <Line
      action={
        <Button onClick={onRetry} size="inline" variant="textStrong">
          {t.connectorsPage.tools.retry}
        </Button>
      }
      label={t.connectorsPage.tools.unavailableLine}
    />
  )
}

/** The cached list is still true; only what a sign-in would refresh is worth a line. */
function SignInLine({ onSignIn }: { onSignIn: () => void }) {
  const { t } = useI18n()

  return (
    <Line
      action={
        <Button onClick={onSignIn} size="inline" variant="textStrong">
          {t.connectorsPage.page.signIn}
        </Button>
      }
      label={t.connectorsPage.tools.staleSignIn}
    />
  )
}

/** Why every switch below is frozen, said where those switches are. */
function RulesLine({
  appOffName,
  onRetryRules,
  onSignIn,
  signedOut
}: {
  appOffName?: string
  onRetryRules?: () => void
  onSignIn?: () => void
  signedOut: boolean
}) {
  const { t } = useI18n()
  const copy = t.connectorsPage

  // The app's own switch is the way out, and it sits in the column beside this line.
  if (appOffName) {
    return <Line label={copy.dialog.rulesAppOff(appOffName)} />
  }

  return (
    <Line
      action={
        signedOut && onSignIn ? (
          <Button onClick={onSignIn} size="inline" variant="textStrong">
            {copy.page.signIn}
          </Button>
        ) : onRetryRules ? (
          <Button onClick={onRetryRules} size="inline" variant="textStrong">
            {copy.page.retry}
          </Button>
        ) : null
      }
      label={signedOut ? copy.dialog.rulesSignIn : copy.dialog.rulesReadOnly}
    />
  )
}

/** The list's last line, never a chip: over the filter bar it printed on top of the first row. */
function DeprecatedToggle({ count, onToggle, shown }: { count: number; onToggle: () => void; shown: boolean }) {
  const { t } = useI18n()
  const copy = t.connectorsPage.tools

  return (
    <div className="flex shrink-0 border-t border-(--ui-stroke-tertiary) px-3.5 py-1">
      <Button aria-pressed={shown} onClick={onToggle} size="xs" variant="text">
        {shown ? copy.hideDeprecated(count) : copy.showDeprecated(count)}
      </Button>
    </div>
  )
}

/** Scroll anchoring is off on purpose: the browser reads the recycled slice as content shifting. */
function ToolViewport({
  isOn,
  onToggle,
  preview,
  readOnly,
  tools
}: {
  isOn: (slug: string) => boolean
  onToggle: (slug: string) => void
  preview: boolean
  readOnly: boolean
  tools: ToolRowModel[]
}) {
  const { t } = useI18n()
  const [scrollTop, setScrollTop] = useState(0)
  const [expanded, setExpanded] = useState<null | string>(null)
  /** Measured, because a description runs from one line to a paragraph and is shown whole. */
  const [detailHeight, setDetailHeight] = useState(0)
  const viewport = useViewportHeight()

  /** A ref callback, not an effect: the detail remounts whenever its row leaves and re-enters the window. */
  const measureDetail = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      setDetailHeight(Math.max(0, node.getBoundingClientRect().height - TOOL_ROW_HEIGHT))
    }
  }, [])

  const expandedIndex = expanded === null ? -1 : tools.findIndex(tool => tool.slug === expanded)
  const extra = expandedIndex >= 0 ? detailHeight : 0
  const total = tools.length * TOOL_ROW_HEIGHT + extra
  // Everything below the open row sits `extra` lower; everything above is where it always was.
  const cut = expandedIndex >= 0 ? (expandedIndex + 1) * TOOL_ROW_HEIGHT : Number.POSITIVE_INFINITY

  const indexAt = (y: number) => Math.max(0, Math.floor((y < cut ? y : Math.max(cut, y - extra)) / TOOL_ROW_HEIGHT))

  const offsetAt = (index: number) =>
    index * TOOL_ROW_HEIGHT + (expandedIndex >= 0 && index > expandedIndex ? extra : 0)

  // Clamped: a filter that shortens the list leaves `scrollTop` past the new bottom, which paints blank.
  const top = Math.min(scrollTop, Math.max(0, total - viewport.height))

  const start = Math.max(0, indexAt(top) - OVERSCAN)
  const end = Math.min(tools.length, indexAt(top + viewport.height) + OVERSCAN + 1)

  const toggleExpanded = (slug: string) =>
    setExpanded(previous => {
      if (previous === slug) {
        setDetailHeight(0)

        return null
      }

      return slug
    })

  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain [overflow-anchor:none]"
      data-slot="tools-viewport"
      onScroll={event => setScrollTop(event.currentTarget.scrollTop)}
      ref={viewport.ref}
    >
      {tools.length === 0 ? (
        <p className="px-3.5 py-8 text-center text-xs text-(--ui-text-tertiary)">{t.connectorsPage.tools.noMatch}</p>
      ) : null}

      <div className="relative" style={{ height: total }}>
        <div className="absolute inset-x-0" style={{ top: offsetAt(start) }}>
          {tools.slice(start, end).map(tool => (
            <div key={tool.slug} ref={expanded === tool.slug ? measureDetail : undefined}>
              <ToolRow
                expanded={expanded === tool.slug}
                on={isOn(tool.slug)}
                onExpand={() => toggleExpanded(tool.slug)}
                onToggle={() => onToggle(tool.slug)}
                preview={preview}
                readOnly={readOnly}
                tool={tool}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Measured, so the list ends where the dialog ends instead of nesting a scroller inside a scroller. */
function useViewportHeight() {
  const ref = useRef<HTMLDivElement | null>(null)
  const [height, setHeight] = useState(MIN_VIEWPORT)

  const read = useCallback(() => {
    const node = ref.current

    if (node) {
      setHeight(previous => {
        const next = Math.max(MIN_VIEWPORT, Math.round(node.clientHeight))

        return previous === next ? previous : next
      })
    }
  }, [])

  useLayoutEffect(() => {
    read()

    const node = ref.current

    if (!node || typeof ResizeObserver === 'undefined') {
      return
    }

    const observer = new ResizeObserver(read)

    observer.observe(node)

    return () => observer.disconnect()
  }, [read])

  return { height, ref }
}

function DirtyFooter({
  counts,
  onDiscard,
  onSave,
  saving
}: {
  counts: ToolsEditorCounts
  onDiscard: () => void
  onSave: () => void
  saving: boolean
}) {
  const { t } = useI18n()
  const copy = t.connectorsPage.tools

  return (
    <div
      className="flex shrink-0 items-center gap-2.5 border-t border-(--ui-stroke-tertiary) bg-(--ui-bg-chrome) px-3.5 py-2"
      data-slot="tools-dirty-footer"
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-(--theme-primary)" />
      <span className="min-w-0 flex-1 truncate text-xs text-(--ui-text-primary)">
        {copy.footerDirty(counts.off, counts.backOn)}
      </span>
      <Button disabled={saving} onClick={onDiscard} size="xs" variant="text">
        {copy.discard}
      </Button>
      <Button disabled={saving} loading={saving} onClick={onSave} size="xs">
        {saving ? copy.saving : copy.save}
      </Button>
    </div>
  )
}
