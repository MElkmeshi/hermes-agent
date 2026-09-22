import { describe, expect, it } from 'vitest'

import {
  availableQuickActions,
  categoryCounts,
  conflictDifference,
  deprecatedCount,
  describesNothingNew,
  editorCounts,
  EMPTY_TOOLS_FILTER,
  expandQuickAction,
  facetChips,
  facetSummary,
  facetTools,
  filterTools,
  hintChips,
  isTinyConnector,
  isUntouchedByQuickActions,
  matchingQuickAction,
  quickActionById,
  toolDisplayName,
  toolReadStatus,
  toolRows,
  UNCATEGORISED
} from './derive-tools'
import { NO_WRITE_TOOLS, ORG_DISABLED, TINY_TOOLS, toolFixtures } from './fixtures'

const tools = toolFixtures()
const slugs = (rows: { slug: string }[]) => rows.map(row => row.slug)

describe('filtering tools', () => {
  it('hides deprecated tools until they are asked for', () => {
    expect(slugs(filterTools(tools, EMPTY_TOOLS_FILTER))).not.toContain('LINEAR_SYNC_LEGACY')
    expect(slugs(filterTools(tools, { ...EMPTY_TOOLS_FILTER, showDeprecated: true }))).toContain('LINEAR_SYNC_LEGACY')
  })

  it('matches the query against the slug and the name, with no debounce to wait for', () => {
    expect(slugs(filterTools(tools, { ...EMPTY_TOOLS_FILTER, query: 'delete_comment' }))).toEqual([
      'LINEAR_DELETE_COMMENT'
    ])
    expect(slugs(filterTools(tools, { ...EMPTY_TOOLS_FILTER, query: 'comment on' }))).toEqual(['LINEAR_ADD_COMMENT'])
  })

  it('filters by facet and by hint', () => {
    expect(filterTools(tools, { ...EMPTY_TOOLS_FILTER, facet: 'destructive' })).toHaveLength(3)
    expect(slugs(filterTools(tools, { ...EMPTY_TOOLS_FILTER, hint: 'openWorldHint' })).sort()).toEqual([
      'LINEAR_ATTACH_LINK',
      'LINEAR_RUN_WEBHOOK'
    ])
  })

  it('lets a tool in two categories match either one', () => {
    for (const category of ['issues', 'search']) {
      expect(slugs(filterTools(tools, { ...EMPTY_TOOLS_FILTER, category }))).toContain('LINEAR_SEARCH_ISSUES')
    }
  })

  it('collects the tools with no category into one bucket', () => {
    expect(slugs(filterTools(tools, { ...EMPTY_TOOLS_FILTER, category: UNCATEGORISED })).sort()).toEqual([
      'LINEAR_PING',
      'LINEAR_RUN_WEBHOOK'
    ])
  })
})

describe('counting what the chips offer', () => {
  it('counts a facet once per tool and orders them least to most costly', () => {
    expect(facetChips(tools)).toEqual([
      { count: 4, value: 'read' },
      { count: 5, value: 'write' },
      { count: 3, value: 'destructive' },
      { count: 2, value: 'unclassified' }
    ])
  })

  it('does not offer a hint chip that only restates a facet chip', () => {
    const values = hintChips(tools).map(entry => entry.value)

    expect(values).not.toContain('readOnlyHint')
    expect(values).not.toContain('destructiveHint')
    expect(values).toEqual(['createHint', 'updateHint', 'deleteHint', 'idempotentHint', 'openWorldHint'])
  })

  it('offers no chips when a single value would filter to the list you are on', () => {
    expect(facetChips(toolRows(TINY_TOOLS, new Set()))).toEqual([])
    expect(hintChips(toolRows(TINY_TOOLS, new Set()))).toEqual([])
  })

  it('adds an Uncategorised bucket only when some tools have none', () => {
    const counts = categoryCounts(tools)

    expect(counts.at(-1)).toEqual({ count: 2, value: UNCATEGORISED })
    expect(counts.find(entry => entry.value === 'issues')).toEqual({ count: 7, value: 'issues' })
  })

  it('offers no category picker at all when the connector has no categories', () => {
    expect(categoryCounts(toolRows(TINY_TOOLS, new Set()))).toEqual([])
  })

  it('counts the deprecated tools the toggle names', () => {
    expect(deprecatedCount(tools)).toBe(1)
    expect(deprecatedCount(toolRows(TINY_TOOLS, new Set()))).toBe(0)
  })
})

describe('a tiny connector drops its chrome', () => {
  it('draws the line at eight tools', () => {
    expect(isTinyConnector(toolRows(TINY_TOOLS, new Set()))).toBe(true)
    expect(isTinyConnector(tools)).toBe(false)
    expect(isTinyConnector(tools.slice(0, 8))).toBe(true)
    expect(isTinyConnector(tools.slice(0, 9))).toBe(false)
  })
})

describe('quick actions', () => {
  const readOnly = quickActionById('read-only')
  const noDestructive = quickActionById('no-destructive')

  it('never touches a tool with an unknown effect or a deprecated one', () => {
    for (const action of [readOnly, noDestructive]) {
      const expansion = expandQuickAction(action, tools)

      expect(expansion).not.toContain('LINEAR_RUN_WEBHOOK')
      expect(expansion).not.toContain('LINEAR_PING')
      expect(expansion).not.toContain('LINEAR_SYNC_LEGACY')
    }

    expect(
      tools
        .filter(isUntouchedByQuickActions)
        .map(tool => tool.slug)
        .sort()
    ).toEqual(['LINEAR_PING', 'LINEAR_RUN_WEBHOOK', 'LINEAR_SYNC_LEGACY'])
  })

  it('never writes a rule the organisation already wrote', () => {
    for (const slug of ORG_DISABLED) {
      expect(expandQuickAction(readOnly, tools)).not.toContain(slug)
      expect(expandQuickAction(noDestructive, tools)).not.toContain(slug)
    }
  })

  it('expands to a concrete list over the tools loaded now', () => {
    expect(expandQuickAction(noDestructive, tools).sort()).toEqual(['LINEAR_ARCHIVE_ISSUE', 'LINEAR_DELETE_COMMENT'])
  })

  it('offers all three actions when each promises something different', () => {
    expect(availableQuickActions(tools).map(action => action.id)).toEqual([
      'read-only',
      'no-destructive',
      'everything-on'
    ])
  })

  it('de-duplicates Read only away when the connector has no write facet', () => {
    const rows = toolRows(NO_WRITE_TOOLS, new Set())

    expect(expandQuickAction(readOnly, rows)).toEqual(expandQuickAction(noDestructive, rows))
    expect(availableQuickActions(rows).map(action => action.id)).toEqual(['no-destructive', 'everything-on'])
  })

  it('keeps only Everything on when no narrowing has anything to narrow', () => {
    expect(availableQuickActions(toolRows(TINY_TOOLS, new Set())).map(action => action.id)).toEqual(['everything-on'])
  })

  it('names the action the person pressed, not the first that fits', () => {
    const rows = toolRows(NO_WRITE_TOOLS, new Set())
    const expansion = expandQuickAction(readOnly, rows)

    expect(matchingQuickAction(expansion, rows, 'read-only')?.id).toBe('read-only')
    expect(matchingQuickAction(expansion, rows, 'no-destructive')?.id).toBe('no-destructive')
  })

  it('ignores hand-toggled tools a quick action could never have written', () => {
    const expansion = expandQuickAction(noDestructive, tools)

    expect(matchingQuickAction([...expansion, 'LINEAR_PING'], tools)?.id).toBe('no-destructive')
  })

  it('reads an empty list as Everything on, never as a narrowing with nothing to do', () => {
    expect(matchingQuickAction([], tools)?.id).toBe('everything-on')
    expect(matchingQuickAction(['LINEAR_CREATE_ISSUE'], tools)).toBeNull()
  })
})

describe('what the footer counts', () => {
  it('reports the change, not the total', () => {
    expect(editorCounts(['a', 'b', 'c'], ['a'])).toEqual({ backOn: 0, off: 2 })
    expect(editorCounts(['a'], ['a', 'b'])).toEqual({ backOn: 1, off: 0 })
    expect(editorCounts(['b'], ['a'])).toEqual({ backOn: 1, off: 1 })
    expect(editorCounts(['a'], ['a'])).toEqual({ backOn: 0, off: 0 })
  })

  it('names what the other version does in both directions', () => {
    expect(conflictDifference(['a', 'b'], ['b', 'c'])).toEqual({ theyOff: 1, theyOn: 1 })
    expect(conflictDifference([], ['a'])).toEqual({ theyOff: 0, theyOn: 1 })
  })
})

describe('turning wire tools into rows', () => {
  it('strikes what the organisation took away and leaves it off', () => {
    const locked = tools.find(tool => tool.slug === 'LINEAR_DELETE_PROJECT')

    expect(locked).toMatchObject({ lockedBy: 'org', on: false })
  })

  it('reads the personal disabled list for everything else', () => {
    const rows = toolFixtures(['LINEAR_CREATE_ISSUE'])

    expect(rows.find(tool => tool.slug === 'LINEAR_CREATE_ISSUE')?.on).toBe(false)
    expect(rows.find(tool => tool.slug === 'LINEAR_LIST_ISSUES')?.on).toBe(true)
  })
})

describe('the tool read', () => {
  const status = (reason: null | string, listHasApp: boolean, hasData = false) =>
    toolReadStatus({ hasData, listHasApp, pending: false, reason })

  it('calls an app gone only when the portal says so AND the list has dropped it', () => {
    expect(status('CONNECTOR_NOT_FOUND', false)).toBe('gone')
    expect(status('CONNECTOR_NOT_FOUND', true)).toBe('unavailable')
    // A read that failed while the list still carries the app is a failed read, not a removed app.
    expect(status('CONNECTOR_NOT_FOUND', true, true)).toBe('unavailable')
    expect(status('TOOLS_UNAVAILABLE', true)).toBe('unavailable')
    expect(status('NEEDS_NOUS_AUTH', true)).toBe('signedOut')
  })

  it('renders a cached list behind any failure but a removed app', () => {
    expect(status('TOOLS_UNAVAILABLE', true, true)).toBeNull()
    expect(status('NEEDS_NOUS_AUTH', true, true)).toBeNull()
    expect(status('CONNECTOR_NOT_FOUND', false, true)).toBe('gone')
  })

  it('waits only when there is nothing to show', () => {
    expect(toolReadStatus({ hasData: false, listHasApp: true, pending: true, reason: null })).toBe('loading')
    expect(toolReadStatus({ hasData: true, listHasApp: true, pending: true, reason: null })).toBeNull()
    expect(status(null, true)).toBeNull()
  })
})

describe('the facet summary', () => {
  it('reads off when every switchable tool of a facet is off', () => {
    const off = new Set(['LINEAR_ARCHIVE_ISSUE', 'LINEAR_DELETE_COMMENT'])
    const rows = facetSummary(toolFixtures(off), slug => !ORG_DISABLED.has(slug) && !off.has(slug))
    const destructive = rows.find(row => row.facet === 'destructive')

    // The org-locked third tool is off too, which is why the row reads off rather than mixed.
    expect(destructive).toMatchObject({ locked: false, on: 0, switchState: 'off', total: 3 })
  })

  it('reads all on once every tool the switch writes is on, org-locked ones aside', () => {
    const rows = facetSummary(toolFixtures(), slug => !ORG_DISABLED.has(slug))

    expect(rows.find(row => row.facet === 'destructive')).toMatchObject({ on: 2, switchState: 'on', total: 3 })
  })

  it('marks a facet the person cannot write, and counts no deprecated tool anywhere', () => {
    const rows = facetSummary(toolFixtures(), () => true)

    expect(rows.find(row => row.facet === 'write')?.total).toBe(4)
    expect(facetTools(toolFixtures(), 'write')).not.toContain('LINEAR_SYNC_LEGACY')
    expect(
      facetSummary(
        toolFixtures().filter(tool => tool.lockedBy !== null),
        () => false
      )[0]
    ).toMatchObject({
      locked: true
    })
  })
})

describe('a tool name from a server on this Mac', () => {
  it('reads as words, whichever way the identifier was written', () => {
    expect(toolDisplayName('read_wiki_contents')).toBe('Read wiki contents')
    expect(toolDisplayName('createIssue')).toBe('Create issue')
  })
})

describe('a description that says nothing new', () => {
  it('is the same words as the name, ignoring case and punctuation', () => {
    const [tool] = toolFixtures()

    expect(describesNothingNew({ ...tool, description: 'List, issues!' })).toBe(true)
    expect(describesNothingNew({ ...tool, description: '' })).toBe(true)
    expect(describesNothingNew(tool)).toBe(false)
  })
})
