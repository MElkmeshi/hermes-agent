import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ConnectorsDirectory } from './connectors-directory'
import { deriveCards, EMPTY_CONNECTORS_FILTER } from './derive'
import { groupIdOf } from './derive-page'
import { BUNDLED, HOSTED, LOCAL, TITLES } from './fixtures'
import type { BundledEntryInput, ConnectorCardModel, ConnectorsFilter } from './types'

const ALL = EMPTY_CONNECTORS_FILTER
const allCards = deriveCards({ bundled: BUNDLED, hosted: HOSTED, local: LOCAL, titles: TITLES })

/** Enough entries to push the Available shelf past its preview, and one word they all match. */
const MANY: BundledEntryInput[] = ['one', 'two', 'three', 'four', 'five', 'six'].map(word => ({
  authType: 'none',
  name: `note-${word}`,
  needsEnv: false
}))

const manyCards = deriveCards({ bundled: [...BUNDLED, ...MANY], hosted: HOSTED, local: LOCAL, titles: TITLES })

const onOpen = vi.fn()

/** The page owns its filter, so the test drives the real controlled contract. */
function Harness({ cards = allCards, hostedFailed = false }: { cards?: ConnectorCardModel[]; hostedFailed?: boolean }) {
  const [filter, setFilter] = useState<ConnectorsFilter>(ALL)

  return (
    <ConnectorsDirectory
      cards={cards}
      filter={filter}
      hostedFailed={hostedFailed}
      onFilterChange={setFilter}
      onOpen={onOpen}
      onRetryHosted={() => {}}
      onServerToggle={() => {}}
      onVerb={() => {}}
    />
  )
}

const segment = (name: RegExp) => screen.queryByRole('button', { name })
const headings = () => screen.getAllByRole('heading', { level: 3 }).map(node => node.textContent)
const search = () => screen.getByRole('textbox', { name: /Search/ })

afterEach(cleanup)

describe('the one segmented control', () => {
  it('counts what pressing it will show, and shows only that group', () => {
    render(<Harness />)

    // The count on a segment IS the length of the group it labels: one classifier answers both.
    expect(segment(/^All 12$/)).toBeTruthy()
    expect(segment(/^On this Mac 3$/)).toBeTruthy()

    fireEvent.click(segment(/^On this Mac 3$/)!)

    expect(headings()).toEqual(['On this Mac'])
  })

  it('drops a segment the search emptied', () => {
    render(<Harness />)

    fireEvent.change(search(), { target: { value: 'ma' } })

    expect(segment(/^All 2$/)).toBeTruthy()
    expect(segment(/Turned off/)).toBeNull()
  })

  it('is not drawn when one group is left, because that group says the same thing', () => {
    render(<Harness />)

    fireEvent.change(search(), { target: { value: 'git' } })

    expect(segment(/^All 1$/)).toBeNull()
    expect(headings()).toEqual(['On this Mac'])
  })

  it('says where the matches the chosen segment hides are, and goes there', () => {
    render(<Harness />)

    fireEvent.click(segment(/^On this Mac 3$/)!)
    fireEvent.change(search(), { target: { value: 'o' } })

    expect(screen.getByText('2 more matches in other groups.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Show all matches' }))

    expect(screen.getByRole('button', { name: /Notion — Open Notion/ })).toBeTruthy()
  })
})

describe('the groups', () => {
  it('orders them and drops the empty ones', () => {
    render(<Harness />)

    expect(headings()).toEqual(['Connected', 'On this Mac', 'Available', 'Turned off'])
  })

  it('stops truncating Available once a search asks for every match', () => {
    render(<Harness cards={manyCards} />)

    expect(screen.getByRole('button', { name: 'Show all 10' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Note Six — Open/ })).toBeNull()

    fireEvent.change(search(), { target: { value: 'note-' } })

    expect(screen.queryByRole('button', { name: /Show all/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Note Six — Open/ })).toBeTruthy()
  })

  it('keeps the servers on this Mac when only the hosted half failed', () => {
    render(<Harness cards={allCards.filter(card => card.residency === 'local')} hostedFailed />)

    expect(screen.getByText('Could not reach the hosted apps.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 3, name: 'On this Mac' })).toBeTruthy()
    expect(screen.getByText('https://api.githubcopilot.com/mcp/')).toBeTruthy()
  })

  it('shows every app when Available is the whole page', () => {
    render(<Harness cards={manyCards.filter(card => groupIdOf(card) === 'available')} />)

    expect(screen.queryByRole('button', { name: /Show all/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Note Six — Open/ })).toBeTruthy()
  })
})

describe('the row cards', () => {
  it('opens the app from the name, in any group', () => {
    render(<Harness />)

    fireEvent.click(screen.getByRole('button', { name: /^Gmail/ }))

    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ slug: 'gmail' }))
  })

  it('offers a bundled entry with Install, where it runs, and what it will ask for', () => {
    render(<Harness />)

    const open = screen.getByRole('button', { name: /Airtable — Open Airtable/ })
    const card = open.closest('[data-slot="connector-row-card"]')!

    expect(within(card as HTMLElement).getByText('On this Mac')).toBeTruthy()
    expect(screen.getByText('API key')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Install' }).length).toBeGreaterThan(0)
  })

  it('shows one verb per broken app and none for one the organisation took away', () => {
    render(<Harness />)

    expect(screen.getByRole('button', { name: 'Reconnect' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(screen.getByText('Off by your organisation')).toBeTruthy()

    const card = screen.getByRole('button', { name: /Stripe — Open Stripe/ }).closest('[data-slot="connector-row-card"]')

    expect(within(card as HTMLElement).getAllByRole('button')).toHaveLength(1)
  })

  it('lets a broken server be repaired, not only switched off', () => {
    render(<Harness />)

    // The switch and the verb share one lane, which once left the repair on screen with no way to press it.
    expect(screen.getByRole('switch', { name: 'Turn Linear off' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy()
  })

  it('explains the Connected order only where a broken connection can be seen', () => {
    const { rerender } = render(<Harness />)

    expect(screen.getByText('Broken connections first.')).toBeTruthy()

    rerender(<Harness cards={allCards.filter(card => card.state !== 'broken' && card.state !== 'expired')} />)

    expect(screen.queryByText('Broken connections first.')).toBeNull()
  })

  it('announces the catalog mark instead of hiding it from assistive tech', () => {
    render(<Harness />)

    expect(screen.getAllByRole('img', { name: 'In the Hermes catalog' }).length).toBeGreaterThan(0)
  })

  it('marks the one card that is showing a local backing over a hosted twin', () => {
    render(<Harness />)

    expect(screen.getByText('Hosted version available')).toBeTruthy()
  })
})

describe('when nothing matches', () => {
  it('keeps the search and names the way out', () => {
    render(<Harness />)

    fireEvent.change(search(), { target: { value: 'quickbooks' } })

    expect(screen.getByText('No matching apps')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Clear the search' }))

    expect(screen.getByRole('heading', { level: 3, name: 'Connected' })).toBeTruthy()
  })

  it('shows every match instead of a blank page when the chosen segment holds none', () => {
    render(<Harness />)

    fireEvent.click(segment(/^Turned off 2$/)!)
    fireEvent.change(search(), { target: { value: 'git' } })

    expect(screen.getByText('No match in Turned off, so every match is shown.')).toBeTruthy()
    expect(segment(/^Turned off 0$/)).toBeNull()
    expect(screen.getByRole('button', { name: /GitHub — Open GitHub/ })).toBeTruthy()
  })

  it('reads a first run as a first run, not as a failure', () => {
    render(<Harness cards={[]} />)

    expect(screen.getByText(/No apps here yet/)).toBeTruthy()
  })

  it('never calls a failed hosted half a first run, even with nothing to show', () => {
    render(<Harness cards={[]} hostedFailed />)

    expect(screen.getByText('Could not reach the hosted apps.')).toBeTruthy()
    expect(screen.queryByText(/No apps here yet/)).toBeNull()
  })

  it('hides the search field when there is nothing to search', () => {
    render(<Harness cards={[]} />)

    expect(screen.queryByRole('textbox', { name: /Search/ })).toBeNull()
  })
})
