import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { toolFixtures } from './fixtures'
import { ToolsList } from './tools-list'
import type { ToolRowModel, ToolsEditorPhase } from './types'
import { useToolsEditor } from './use-tools-editor'

const onSave = vi.fn(async () => 'saved' as const)

// The hook owns the edit and the list renders it; every rule below lives in that seam.
function Harness({
  listKey = 'tools',
  name = 'Linear',
  phase = 'ready' as ToolsEditorPhase,
  preview = false,
  readOnly = false,
  rows,
  savedDisabled = [] as string[],
  signedOut = false
}: {
  listKey?: string
  name?: string
  phase?: ToolsEditorPhase
  preview?: boolean
  readOnly?: boolean
  rows?: ToolRowModel[]
  savedDisabled?: string[]
  signedOut?: boolean
}) {
  const tools = rows ?? toolFixtures(savedDisabled)
  const editor = useToolsEditor({ onSave, savedDisabled, tools })

  return (
    <ToolsList
      connectorName={name}
      editor={{ ...editor, phase: phase === 'ready' ? editor.phase : phase }}
      listKey={listKey}
      onRefresh={() => {}}
      onReload={() => {}}
      onRemove={() => {}}
      onRetry={() => {}}
      onSignIn={() => {}}
      preview={preview}
      readOnly={readOnly}
      signedOut={signedOut}
      tools={tools}
    />
  )
}

// cmdk scrolls its active item into view when the category picker opens; jsdom has no layout and therefore no `scrollIntoView`.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

// An opened list is remembered for the window session, so every case gets a key of its own.
let listSeq = 0

function renderSummary(props: Parameters<typeof Harness>[0] = {}) {
  return render(<Harness listKey={`summary-${++listSeq}`} {...props} />)
}

function renderList(props: Parameters<typeof Harness>[0] = {}) {
  const view = render(<Harness listKey={`list-${++listSeq}`} {...props} />)

  fireEvent.click(screen.getByRole('button', { name: /^Show all \d+ tools?$/ }))

  return view
}

const switchFor = (label: string) => screen.getByRole('switch', { name: label })
const footer = () => screen.queryByText(/^Not saved:/)

afterEach(cleanup)

describe('the tools column', () => {
  it('opens on what Hermes may do, one line per facet', () => {
    renderSummary({ name: 'Notion' })

    expect(screen.getByRole('button', { name: 'Show all 14 tools' })).toBeTruthy()
    expect(screen.getByRole('switch', { name: 'Turn Read tools on or off' })).toBeTruthy()
    expect(screen.getByText('2 of 3 on')).toBeTruthy()
    expect(screen.queryByRole('switch', { name: /Create an issue/ })).toBeNull()
  })

  it('goes back to the summary from the opened list', () => {
    renderSummary({ name: 'Linear' })

    fireEvent.click(screen.getByRole('button', { name: 'Show all 14 tools' }))

    expect(screen.getByRole('textbox', { name: 'Search 14 tools' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Show summary' }))

    expect(screen.getByRole('switch', { name: 'Turn Read tools on or off' })).toBeTruthy()
    expect(screen.queryByRole('switch', { name: /Create an issue/ })).toBeNull()
  })

  it('claims nothing for an app with no account, and offers nothing to switch', () => {
    renderSummary({ name: 'Notion', preview: true })

    expect(screen.getByText('What Hermes could do with Notion once you connect')).toBeTruthy()
    expect(screen.queryAllByRole('switch')).toHaveLength(0)
    expect(screen.queryByText('Rules cannot be changed right now.')).toBeNull()
  })

  it('writes a whole facet from its one switch', () => {
    renderSummary({ name: 'Slack' })

    fireEvent.click(screen.getByRole('switch', { name: 'Turn Read tools on or off' }))

    // The edit opens the list by itself, so an unsaved change is visible.
    expect(screen.getByText('Not saved: 4 tools turned off')).toBeTruthy()
    expect(screen.getByRole('switch', { name: 'Turn List issues on' }).getAttribute('aria-checked')).toBe('false')
  })

  it('folds back to the summary once the edit that opened it is discarded', () => {
    renderSummary({ name: 'Sentry' })

    fireEvent.click(screen.getByRole('switch', { name: 'Turn Read tools on or off' }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))

    expect(screen.getByRole('switch', { name: 'Turn Read tools on or off' })).toBeTruthy()
    expect(screen.queryByRole('switch', { name: /Create an issue/ })).toBeNull()
  })

  it('leaves every facet switch read-only while the rules cannot be written, and says why beside them', () => {
    renderSummary({ name: 'Stripe', readOnly: true })

    for (const control of screen.getAllByRole('switch')) {
      expect(control.hasAttribute('disabled')).toBe(true)
    }

    expect(screen.getByText('Rules cannot be changed right now.')).toBeTruthy()
  })
})

describe('editing the tool list', () => {
  it('counts one toggle in the dirty footer', () => {
    renderList()

    expect(footer()).toBeNull()

    fireEvent.click(switchFor('Turn Create an issue off'))

    expect(screen.getByText('Not saved: 1 tool turned off')).toBeTruthy()
    expect(switchFor('Turn Create an issue on').getAttribute('aria-checked')).toBe('false')
  })

  it('counts a tool put back on separately from one taken off', () => {
    renderList({ savedDisabled: ['LINEAR_CREATE_ISSUE'] })

    fireEvent.click(switchFor('Turn Create an issue on'))
    fireEvent.click(switchFor('Turn Archive an issue off'))

    expect(screen.getByText('Not saved: 1 tool turned off, 1 turned back on')).toBeTruthy()
  })

  it('flips the switches a quick action names, and only those', () => {
    renderList()

    fireEvent.click(screen.getByRole('button', { name: 'Turn off destructive' }))

    expect(switchFor('Turn Archive an issue on').getAttribute('aria-checked')).toBe('false')
    expect(switchFor('Turn Delete a comment on').getAttribute('aria-checked')).toBe('false')
    expect(switchFor('Turn Create an issue off').getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText('Not saved: 2 tools turned off')).toBeTruthy()
  })

  it('leaves a tool with an unknown effect exactly as the person left it', () => {
    renderList({ savedDisabled: ['LINEAR_PING'] })

    fireEvent.click(screen.getByRole('button', { name: 'Read only' }))

    // An unclassified tool the person set by hand is never rewritten, so the footer reports only the action's own expansion.
    expect(screen.getByText('Not saved: 6 tools turned off')).toBeTruthy()
  })

  it('gives an org-locked tool no switch to press', () => {
    renderList()

    expect(screen.queryByRole('switch', { name: /Delete a project/ })).toBeNull()
    expect(screen.getAllByText('off by your organisation').length).toBeGreaterThan(0)
  })

  it('keeps a toggle made outside the current filter', () => {
    renderList()

    fireEvent.click(switchFor('Turn Create an issue off'))
    fireEvent.change(screen.getByRole('textbox', { name: /Search/ }), { target: { value: 'archive' } })

    expect(screen.queryByRole('switch', { name: /Create an issue/ })).toBeNull()

    fireEvent.click(switchFor('Turn Archive an issue off'))
    fireEvent.change(screen.getByRole('textbox', { name: /Search/ }), { target: { value: '' } })

    expect(switchFor('Turn Create an issue on').getAttribute('aria-checked')).toBe('false')
    expect(switchFor('Turn Archive an issue on').getAttribute('aria-checked')).toBe('false')
    expect(screen.getByText('Not saved: 2 tools turned off')).toBeTruthy()
  })

  it('discards back to the saved rule', () => {
    renderList()

    fireEvent.click(switchFor('Turn Create an issue off'))
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))

    expect(footer()).toBeNull()
    expect(switchFor('Turn Create an issue off').getAttribute('aria-checked')).toBe('true')
  })

  it('hides deprecated tools behind the list’s last line', () => {
    renderList()

    fireEvent.change(screen.getByRole('textbox', { name: /Search/ }), { target: { value: 'legacy' } })

    expect(screen.getByText('No tool matches these filters.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Show 1 deprecated' }))

    expect(screen.getByText('Sync the legacy board')).toBeTruthy()
  })

  it('opens one tool at a time and shows what it does', () => {
    renderList()

    expect(screen.queryByText('Opens a new issue on a team board.')).toBeNull()

    fireEvent.click(screen.getByRole('button', { expanded: false, name: /Create an issue/ }))

    expect(screen.getByText('Opens a new issue on a team board.')).toBeTruthy()
    // The slug rides a data attribute, so a reader never meets it.
    expect(screen.queryByText('LINEAR_CREATE_ISSUE')).toBeNull()
  })

  it('names two hints on the row and every one of them in the disclosure', () => {
    const rows: ToolRowModel[] = [
      {
        categories: [],
        deprecated: false,
        description: 'Files an item and moves the board on.',
        facet: 'write',
        hints: ['createHint', 'updateHint', 'deleteHint'],
        lockedBy: null,
        name: 'File an item',
        on: true,
        slug: 'FILE_ITEM'
      }
    ]

    renderList({ rows })

    expect(screen.getByText('+1')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { expanded: false, name: /File an item/ }))

    expect(screen.getByText('Creates · Updates · Deletes')).toBeTruthy()
  })

  it('keeps the cached list on screen with one sign-in beside it', () => {
    renderList({ signedOut: true })

    expect(screen.getByRole('switch', { name: 'Turn Create an issue off' })).toBeTruthy()
    expect(screen.getByText('Sign in to read the latest tool list.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy()
  })

  it('gives a row whose description restates its name nothing to open', () => {
    const rows: ToolRowModel[] = [
      {
        categories: [],
        deprecated: false,
        description: 'List teams.',
        facet: 'read',
        hints: [],
        lockedBy: null,
        name: 'List teams',
        on: true,
        slug: 'LIST_TEAMS'
      }
    ]

    renderList({ name: 'Tiny', rows })

    expect(screen.getByRole('switch', { name: 'Turn List teams off' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /List teams/ })).toBeNull()
  })
})

describe('what the chrome promises', () => {
  it('counts a chip over the rows it can actually show', () => {
    renderList()

    // `Write` covers five tools, one deprecated and hidden; a chip counting it would name a row the reader cannot reach.
    fireEvent.click(screen.getByRole('button', { name: /^Write/ }))

    expect(screen.getByRole('button', { name: /^Write/ }).textContent).toBe('Write4')
    expect(screen.getAllByRole('switch')).toHaveLength(4)
  })

  it('keeps the scroll position and the open row through a query that matches nothing', () => {
    renderList()

    fireEvent.click(screen.getByRole('button', { expanded: false, name: /Create an issue/ }))

    const search = screen.getByRole('textbox', { name: /Search/ })

    fireEvent.change(search, { target: { value: 'quickbooks' } })

    expect(screen.getByText('No tool matches these filters.')).toBeTruthy()

    fireEvent.change(search, { target: { value: '' } })

    // The viewport owns both, so unmounting it for the empty case made one keystroke differ from the next.
    expect(screen.getByText('Opens a new issue on a team board.')).toBeTruthy()
  })

  it('closes the category picker once a category is picked', () => {
    renderList()

    fireEvent.click(screen.getByRole('button', { name: /categories/ }))
    fireEvent.click(screen.getByText('comments'))

    // The panel opens over the rows it filters, so leaving it open hides the answer just asked for.
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getAllByRole('switch')).toHaveLength(2)
  })

  it('paints rows after a filter shortens the list under a scrolled viewport', () => {
    const { container } = renderList()
    const viewport = container.querySelector('[data-slot="tools-viewport"]')!

    fireEvent.scroll(viewport, { target: { scrollTop: 400 } })
    fireEvent.change(screen.getByRole('textbox', { name: /Search/ }), { target: { value: 'archive' } })

    // An unclamped offset must not slice the window past the end of the new list and paint a blank scroller.
    expect(screen.getByText('Archive an issue')).toBeTruthy()
  })
})

describe('the states that replace the list', () => {
  it('names the problem and the way out, one per phase', () => {
    const cases: [ToolsEditorPhase, string, string][] = [
      ['gone', 'Linear left the catalog.', 'Remove'],
      ['signedOut', 'Sign in to Nous to read the tool list.', 'Sign in'],
      ['conflict', 'Someone changed this rule while you were editing.', 'Reload their version']
    ]

    for (const [phase, title, action] of cases) {
      render(<Harness phase={phase} />)

      expect(screen.getByText(title)).toBeTruthy()
      expect(screen.getByRole('button', { name: action })).toBeTruthy()

      cleanup()
    }
  })

  it('shows a static wash while it loads, with no list and no filters', () => {
    render(<Harness phase="loading" />)

    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.queryByRole('switch')).toBeNull()
  })
})
