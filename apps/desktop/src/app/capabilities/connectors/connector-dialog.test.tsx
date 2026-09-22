import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ConnectorDialog, type ConnectorDialogProps } from './connector-dialog'
import { deriveCards } from './derive'
import { BUNDLED, HOSTED, LOCAL, TITLES, WAYS_HOSTED, WAYS_LOCAL, WAYS_SLUG } from './fixtures'
import type { ConnectorCardModel } from './types'

const cards = deriveCards({ bundled: BUNDLED, hosted: HOSTED, local: LOCAL, titles: TITLES })
const cardFor = (slug: string) => cards.find(card => card.slug === slug)!

/** The stress case: the account is connected AND the same app runs as a server on this Mac. */
const bothWays = deriveCards({
  bundled: [],
  hosted: [{ ...WAYS_HOSTED, accountLabel: 'work@example.invalid', connected: true, connectionStatus: 'active' }],
  local: [WAYS_LOCAL],
  titles: { [WAYS_SLUG]: 'Monday' }
})[0]

function renderDialog(card: ConnectorCardModel, overrides: Partial<ConnectorDialogProps> = {}) {
  render(
    <ConnectorDialog
      card={card}
      onConnect={() => {}}
      onInstall={() => {}}
      onOpenChange={() => {}}
      onReconnect={() => {}}
      open
      tools={null}
      {...overrides}
    />
  )
}

afterEach(cleanup)

describe('opening the dialog', () => {
  it('does not hand the keyboard a control that turns something off', async () => {
    renderDialog(cardFor('postgres'), { onServerToggle: () => {} })

    const title = screen.getByText('Postgres')

    // The title takes the focus instead: a dialog that opens on Enter must not open on "off".
    await waitFor(() => {
      expect(title.ownerDocument.activeElement).toBe(title)
    })
    expect(screen.getByRole('switch', { name: /Postgres/ })).not.toBe(title.ownerDocument.activeElement)
  })

  it('leads with the verb the card offered, once', () => {
    renderDialog(cardFor('slack'), { onVerb: () => {} })

    // Slack has a bundled twin, so the section names both forms; only the column carries the verb.
    expect(screen.getAllByRole('button', { name: 'Connect' })).toHaveLength(1)

    // Access expired and a failed connection are one repair, so they carry one word.
    for (const slug of ['notion', 'sentry']) {
      cleanup()
      renderDialog(cardFor(slug), { onVerb: () => {} })

      expect(screen.getByRole('button', { name: 'Reconnect' })).toBeTruthy()
    }
  })

  it('offers the app switch only where there is a working account to rule on', () => {
    renderDialog(cardFor('gmail'), { onToggleForMe: () => {} })

    expect(screen.getByRole('switch', { name: 'Hermes can use Gmail' })).toBeTruthy()

    // Available and access expired: nothing to rule on.
    for (const slug of ['slack', 'notion']) {
      cleanup()
      renderDialog(cardFor(slug), { onToggleForMe: () => {} })

      expect(screen.queryByRole('switch', { name: /Hermes can use/ })).toBeNull()
    }
  })

  it('shows the app switch off and read-only for an app the organisation turned off', () => {
    renderDialog(cardFor('stripe'), { onToggleForMe: () => {} })

    const control = screen.getByRole('switch', { name: 'Hermes can use Stripe' })

    expect(control.getAttribute('aria-checked')).toBe('false')
    expect(control.hasAttribute('disabled')).toBe(true)
    expect(screen.getByText('Turned off by your organisation.')).toBeTruthy()
  })

  it('offers one control, not two, for an app the person switched off', () => {
    renderDialog(cardFor('shopify'), { onToggleForMe: () => {}, onVerb: () => {} })

    expect(screen.getByRole('switch', { name: 'Hermes can use Shopify' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Turn back on' })).toBeNull()
  })

  it('keeps the column under a connect in flight, and offers that state’s verb once', () => {
    renderDialog(cardFor('notion'), {
      connectElement: <p>Waiting</p>,
      connectedOn: '14 Mar',
      onDisconnect: () => {},
      onVerb: () => {}
    })

    expect(screen.getByText('Waiting')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeTruthy()
    // The element in flight carries the state's own verb, so the column does not offer a second one.
    expect(screen.queryByRole('button', { name: 'Reconnect' })).toBeNull()
  })

  it('does not repeat the failed rules read beside the app switch', () => {
    renderDialog(cardFor('gmail'), {
      connectedOn: '14 Mar',
      onDisconnect: () => {},
      onToggleForMe: () => {},
      rulesReadOnly: true
    })

    // The tools column says it once, where its Retry is.
    expect(screen.queryByText('Rules cannot be changed right now.')).toBeNull()
    expect(screen.getByText('Off keeps your sign-in.')).toBeTruthy()
  })

  it('draws the two forms only for an app that has both', () => {
    renderDialog(cardFor('gmail'), { onVerb: () => {} })

    expect(screen.queryByText('How Hermes reaches Gmail')).toBeNull()

    cleanup()
    renderDialog(cardFor('slack'), { onVerb: () => {} })

    expect(screen.getByText('How Hermes reaches Slack')).toBeTruthy()
  })

  it('keeps Disconnect working while the rules cannot be written', () => {
    const onDisconnect = vi.fn()

    renderDialog(cardFor('gmail'), {
      connectedOn: '14 Mar',
      onDisconnect,
      onToggleForMe: () => {},
      rulesReadOnly: true
    })

    expect(screen.getByRole('switch', { name: 'Hermes can use Gmail' }).hasAttribute('disabled')).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))

    expect(onDisconnect).toHaveBeenCalledTimes(1)
  })

  it('names the double tool list when both forms are on, and offers the one fix', () => {
    const onServerToggle = vi.fn()

    renderDialog(bothWays, { onServerToggle })

    expect(screen.getByText('Both are on, so Hermes sees every Monday tool twice.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Turn off the local server' }))

    expect(onServerToggle).toHaveBeenCalledWith(false)
  })
})
