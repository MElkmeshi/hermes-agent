// No RPC lives here.

import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  editorCounts,
  expandQuickAction,
  facetTools,
  isUntouchedByQuickActions,
  matchingQuickAction,
  quickActionById,
  sameSet
} from './derive-tools'
import type {
  QuickAction,
  QuickActionId,
  ToolRowModel,
  ToolsEditorCounts,
  ToolsEditorPhase,
  ToolsEditorStatus
} from './types'

/** `failed` leaves the editor dirty and the work on screen; only `saved` moves the baseline. */
export type SaveResult = 'conflict' | 'failed' | 'saved'

/** `overwrite` travels with the list: a compare-and-set write cannot tell one from a second losing attempt. */
export interface SaveOptions {
  overwrite: boolean
}

export interface UseToolsEditorOptions {
  /** The connector slug, usually. Two connectors can share a saved rule, so the rule alone is not an identity. */
  editorKey?: string
  onSave: (disabled: string[], options: SaveOptions) => Promise<SaveResult>
  /** The saved personal rule. A different list is a different editor, and the hook reloads against it. */
  savedDisabled: readonly string[]
  status?: ToolsEditorStatus | null
  tools: readonly ToolRowModel[]
}

export interface ToolsEditor {
  applyQuickAction: (id: QuickActionId) => void
  counts: ToolsEditorCounts
  /** Which quick action the current list matches, if any. */
  currentAction: QuickAction | null
  dirty: boolean
  discard: () => void
  isOn: (slug: string) => boolean
  /** Keeps this editor's work after a conflict and writes it: the button says "Save over their version". */
  keepMine: () => Promise<SaveResult>
  local: string[]
  phase: ToolsEditorPhase
  save: () => Promise<SaveResult>
  toggle: (slug: string) => void
  /** One facet's whole switchable set, as the tools summary writes it. */
  toggleFacet: (facet: string, on: boolean) => void
}

export function useToolsEditor({
  editorKey,
  onSave,
  savedDisabled,
  status,
  tools
}: UseToolsEditorOptions): ToolsEditor {
  const [local, setLocal] = useState<string[]>([...savedDisabled])
  const [baseline, setBaseline] = useState<string[]>([...savedDisabled])
  const [editing, setEditing] = useState<'conflict' | 'ready' | 'saving'>('ready')
  /** Remembered rather than re-derived: two actions can expand to the same list. */
  const [pressed, setPressed] = useState<QuickActionId | null>(null)
  const [overwrite, setOverwrite] = useState(false)

  // Keyed on the saved rule's CONTENT, so a caller that rebuilds the array every render keeps the edit.
  const savedKey = `${editorKey ?? ''}\u0000${[...savedDisabled].sort().join('\u0000')}`

  useEffect(() => {
    setLocal([...savedDisabled])
    setBaseline([...savedDisabled])
    setEditing('ready')
    setPressed(null)
    setOverwrite(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey])

  const byslug = useMemo(() => new Map(tools.map(tool => [tool.slug, tool])), [tools])
  const disabledSet = useMemo(() => new Set(local), [local])
  const dirty = !sameSet(local, baseline)
  const counts = useMemo(() => editorCounts(local, baseline), [local, baseline])
  const currentAction = useMemo(() => matchingQuickAction(local, tools, pressed), [local, tools, pressed])

  const toggle = useCallback(
    (slug: string) => {
      // A locked row has no switch, and refusing here stops a stray keyboard event writing the org's rule.
      if (byslug.get(slug)?.lockedBy) {
        return
      }

      setPressed(null)
      setLocal(previous => (previous.includes(slug) ? previous.filter(s => s !== slug) : [...previous, slug]))
    },
    [byslug]
  )

  const toggleFacet = useCallback(
    (facet: string, on: boolean) => {
      const slugs = facetTools(tools, facet)

      setPressed(null)
      setLocal(previous => {
        const without = previous.filter(slug => !slugs.includes(slug))

        return on ? without : [...without, ...slugs]
      })
    },
    [tools]
  )

  /** A quick action rewrites only the part of the list it owns, `Everything on` included. */
  const applyQuickAction = useCallback(
    (id: QuickActionId) => {
      const action = quickActionById(id)

      setPressed(id)
      setLocal(previous => {
        const kept = previous.filter(slug => {
          const tool = byslug.get(slug)

          // `expandQuickAction` will not put an org-locked slug back, so dropping it here would report it "back on".
          return tool !== undefined && (isUntouchedByQuickActions(tool) || tool.lockedBy !== null)
        })

        return [...new Set([...kept, ...expandQuickAction(action, tools)])]
      })
    },
    [byslug, tools]
  )

  const discard = useCallback(() => {
    setLocal(baseline)
    setEditing('ready')
    setPressed(null)
    setOverwrite(false)
  }, [baseline])

  /** One writer, so a press and a write can never disagree about the flag. */
  const write = useCallback(
    async (asOverwrite: boolean) => {
      setEditing('saving')

      const result = await onSave(local, { overwrite: asOverwrite })

      setEditing(result === 'conflict' ? 'conflict' : 'ready')

      if (result === 'saved') {
        setBaseline(local)
        setOverwrite(false)
      }

      return result
    },
    [local, onSave]
  )

  /** Nothing merges: this writes over the version the other editor left. */
  const keepMine = useCallback(() => {
    setOverwrite(true)

    return write(true)
  }, [write])

  const save = useCallback(() => write(overwrite), [overwrite, write])

  const isOn = useCallback(
    (slug: string) => byslug.get(slug)?.lockedBy === null && !disabledSet.has(slug),
    [byslug, disabledSet]
  )

  return {
    applyQuickAction,
    counts,
    currentAction,
    dirty,
    discard,
    isOn,
    keepMine,
    local,
    // A failed fetch replaces the whole right column, so it outranks whatever the editor is doing.
    phase: status ?? editing,
    save,
    toggle,
    toggleFacet
  }
}
