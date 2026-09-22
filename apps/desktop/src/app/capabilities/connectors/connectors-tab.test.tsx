// @vitest-environment jsdom
//
// The container, black-box: only `data/rpc.ts` and the config record are stubbed.

import { QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type * as HermesApi from '@/hermes'
import { queryClient } from '@/lib/query-client'

import type * as Rpc from './data/rpc'

const listConnectors = vi.fn()
const connectorCatalog = vi.fn()
const connectorAccounts = vi.fn()
const connectorPolicy = vi.fn()
const connectorTools = vi.fn()
const setConnectorPolicy = vi.fn()
const removeConnectorAccount = vi.fn()
const connectAccountConnectors = vi.fn()

// Partial mock: the error class and its helpers stay real, because the hooks branch on `instanceof`.
vi.mock('./data/rpc', async importOriginal => ({
  ...(await importOriginal<typeof Rpc>()),
  connectAccountConnectors: (...args: unknown[]) => connectAccountConnectors(...args),
  connectorAccounts: (...args: unknown[]) => connectorAccounts(...args),
  connectorCatalog: (...args: unknown[]) => connectorCatalog(...args),
  connectorPolicy: (...args: unknown[]) => connectorPolicy(...args),
  connectorTools: (...args: unknown[]) => connectorTools(...args),
  listConnectors: (...args: unknown[]) => listConnectors(...args),
  removeConnectorAccount: (...args: unknown[]) => removeConnectorAccount(...args),
  setConnectorPolicy: (...args: unknown[]) => setConnectorPolicy(...args)
}))

const getHermesConfigRecord = vi.fn()
const getMcpCatalog = vi.fn()
const testMcpServer = vi.fn()
const getUsageAnalytics = vi.fn()
const installMcpCatalogEntry = vi.fn()

vi.mock('@/hermes', async importOriginal => ({
  ...(await importOriginal<typeof HermesApi>()),
  getHermesConfigRecord: () => getHermesConfigRecord(),
  getMcpCatalog: () => getMcpCatalog(),
  getUsageAnalytics: (days: number) => getUsageAnalytics(days),
  installMcpCatalogEntry: (...args: unknown[]) => installMcpCatalogEntry(...args),
  testMcpServer: (name: string) => testMcpServer(name)
}))

// `readableError` stays real-shaped: the Disconnect confirm shows the sentence it returns.
vi.mock('@/store/notifications', () => ({
  notify: vi.fn(),
  notifyError: vi.fn(),
  readableError: (error: unknown, fallback: string) => ({
    message: error instanceof Error ? error.message : fallback
  })
}))

// Imported after the hoisted mocks, so these modules see them.
const { ConnectorsTab } = await import('./connectors-tab')
const { ConnectorRpcError } = await import('./data/rpc')

const { $abandonedConnects, $accountOperations, applyAccountConnectionUpdate } = await import(
  './data/account-operations'
)

const { clearPersisted } = await import('./data/persist')
const { $freeTierStatus } = await import('@/store/free-tier')
const { notifyError } = await import('@/store/notifications')

const CATALOG = {
  connectors: [{ category: 'Docs', description: 'Pages and databases.', name: 'Notion', slug: 'notion' }]
}

const MEMBER_POLICY = {
  layers: [{ body: { disabled_connectors: [], mode: 'deny', tools: {} }, kind: 'member', revision: 'rev-1' }]
}

const ACCOUNT = {
  active: true,
  connection_id: 'conn-1',
  connector: 'notion',
  created_at: '2026-01-02T03:04:05Z',
  label: 'ada@example.com',
  status: 'active',
  updated_at: '2026-01-02T03:04:05Z'
}

const TOOLS = {
  connector: 'notion',
  etag: 'e1',
  fetched_at: Math.floor(Date.now() / 1000),
  source: 'cache',
  stale: false,
  tools: [
    {
      categories: [],
      deprecated: false,
      description: 'Read a page.',
      facet: 'read',
      hints: [],
      name: 'Get page',
      slug: 'get_page'
    },
    {
      categories: [],
      deprecated: false,
      description: 'Write a page.',
      facet: 'write',
      hints: [],
      name: 'Add page',
      slug: 'add_page'
    }
  ],
  toolkit_version: '1'
}

/** One bundled catalog entry whose `connector` names a hosted app, which is what earns the quiet twin pill. */
const BUNDLED = {
  args: [],
  auth_type: 'api_key',
  bootstrap: [],
  command: 'npx',
  connector: 'notion',
  default_enabled: null,
  description: 'Bases and records.',
  enabled: false,
  install_ref: null,
  install_url: null,
  installed: false,
  name: 'airtable',
  needs_install: false,
  post_install: '',
  required_env: [],
  source: 'bundled',
  transport: 'stdio',
  url: null
}

const OPERATION = {
  deadline_at: Math.floor(Date.now() / 1000) + 600,
  op_id: 'op-1',
  seq: 1,
  settled: false,
  targets: [
    {
      action: 'connect',
      connect_url: 'https://example.invalid/authorize',
      kind: 'connector',
      name: 'notion',
      state: 'initiated'
    }
  ]
}

async function renderTab(search = '') {
  await act(async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/capabilities?tab=connectors${search}`]}>
          <ConnectorsTab gateway={null} profile="default" />
        </MemoryRouter>
      </QueryClientProvider>
    )
  })
}

/** A bundled entry nothing else knows about: its own Available card, with Install. */
const bundledEntry = (name: string, patch: Record<string, unknown> = {}) => ({
  ...BUNDLED,
  connector: null,
  description: `${name} in one place.`,
  name,
  ...patch
})

/** Open one app's dialog through the card's own control. */
async function openCard(name: string) {
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(`${name} — Open ${name}`) }))
}

/** The tools column opens on the facet summary; the per-tool switches are one press down. */
async function openTools() {
  fireEvent.click(await screen.findByRole('button', { name: /^Show all \d+ tools?$/ }))
}

beforeEach(() => {
  vi.stubGlobal('hermesDesktop', undefined)
  listConnectors.mockResolvedValue({ available: true, connectors: [{ connector: 'notion', enabled: true }] })
  connectorCatalog.mockResolvedValue(CATALOG)
  connectorAccounts.mockResolvedValue({ accounts: [] })
  connectorPolicy.mockResolvedValue(MEMBER_POLICY)
  connectorTools.mockResolvedValue(TOOLS)
  setConnectorPolicy.mockResolvedValue({ revision: 'rev-2' })
  removeConnectorAccount.mockResolvedValue({ connection_id: 'conn-1', status: 'removed' })
  connectAccountConnectors.mockResolvedValue(OPERATION)

  getHermesConfigRecord.mockResolvedValue({ mcp_servers: {} })
  getMcpCatalog.mockResolvedValue({ entries: [] })
  testMcpServer.mockResolvedValue({ ok: true, tools: [] })
  getUsageAnalytics.mockResolvedValue({ tools: [] })
  installMcpCatalogEntry.mockResolvedValue({ background: false })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  queryClient.clear()
  // Storage outlives a clear: the page a test persisted would seed the next one.
  clearPersisted('default')
  // The operation store is module state, so a connect one test started outlives it.
  $accountOperations.set({})
  $abandonedConnects.set([])
  $freeTierStatus.set(null)
})

describe('ConnectorsTab', { timeout: 60_000 }, () => {
  it('builds each card from the catalog, the hosted list and the accounts read', async () => {
    connectorAccounts.mockResolvedValue({ accounts: [ACCOUNT] })
    await renderTab()

    // The name comes from the catalog, the group from the account row.
    expect(await screen.findByRole('button', { name: /Notion — Open Notion/ })).toBeTruthy()
    await waitFor(() => expect(screen.getAllByText('Connected').length).toBeGreaterThan(0))
    expect(screen.getByText('Pages and databases.')).toBeTruthy()
  })

  it('Connect shows the connect element, and an update frame reconnects the list', async () => {
    await renderTab()

    fireEvent.click(await screen.findByRole('button', { name: 'Connect' }))

    await waitFor(() => expect(connectAccountConnectors).toHaveBeenCalledWith('default', ['notion'], false))

    // One line in the column, flat: no second card, and no second name for the app.
    expect(await screen.findByText('Finish the sign-in in your browser.')).toBeTruthy()
    expect(screen.queryByText('Connect your apps')).toBeNull()

    const before = listConnectors.mock.calls.length

    await act(async () => {
      applyAccountConnectionUpdate({
        ...OPERATION,
        owner: { type: 'account' },
        seq: 2,
        settled: true,
        settled_by: 'all_resolved',
        targets: [{ action: 'connect', kind: 'connector', name: 'notion', state: 'connected' }]
      })
    })

    await waitFor(() => expect(listConnectors.mock.calls.length).toBeGreaterThan(before))
  })

  it('Save writes against the revision the person saw, and a conflict shows the conflict view', async () => {
    connectorAccounts.mockResolvedValue({ accounts: [ACCOUNT] })
    setConnectorPolicy.mockRejectedValue(new ConnectorRpcError('conflict', 4009, 'POLICY_CONFLICT'))
    // The re-read after a losing write: their version turned the other tool off.
    await renderTab()
    await openCard('Notion')
    await openTools()

    const toggle = await screen.findByRole('switch', { name: 'Turn Get page off' })

    // The conflict re-read is a direct RPC, so this never reaches the cached policy the editor is using.
    connectorPolicy.mockResolvedValue({
      layers: [
        {
          body: { disabled_connectors: [], mode: 'deny', tools: { notion: ['add_page'] } },
          kind: 'member',
          revision: 'rev-9'
        }
      ]
    })

    fireEvent.click(toggle)
    fireEvent.click(await screen.findByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(setConnectorPolicy).toHaveBeenCalledWith(
        'default',
        { connector: 'notion', disabled_tools: ['get_page'], type: 'tools' },
        'rev-1'
      )
    )

    expect(await screen.findByText('Someone changed this rule while you were editing.')).toBeTruthy()
  })

  it('sends the revision the last save produced, not the one still on screen', async () => {
    connectorAccounts.mockResolvedValue({ accounts: [ACCOUNT] })
    await renderTab()
    await openCard('Notion')
    await openTools()

    fireEvent.click(await screen.findByRole('switch', { name: 'Turn Get page off' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(setConnectorPolicy).toHaveBeenLastCalledWith(
        'default',
        { connector: 'notion', disabled_tools: ['get_page'], type: 'tools' },
        'rev-1'
      )
    )

    // The screen still says rev-1, so a second write on it would read as somebody else's change.
    fireEvent.click(await screen.findByRole('switch', { name: 'Turn Add page off' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(setConnectorPolicy).toHaveBeenLastCalledWith(
        'default',
        { connector: 'notion', disabled_tools: ['get_page', 'add_page'], type: 'tools' },
        'rev-2'
      )
    )
  })

  it('names a backend too old for these reads instead of offering a Retry that cannot win', async () => {
    listConnectors.mockRejectedValue(new ConnectorRpcError('Method not found', -32601, undefined))

    await renderTab()

    await waitFor(() => expect(notifyError).toHaveBeenCalledWith(expect.anything(), 'Could not reach the hosted apps.'))
  })

  it('Stop waiting gives the column back in the same frame', async () => {
    await renderTab()

    fireEvent.click(await screen.findByRole('button', { name: 'Connect' }))

    const waiting = await screen.findByText('Finish the sign-in in your browser.')

    fireEvent.click(within(waiting.closest('[role="dialog"]')!).getByRole('button', { name: 'Stop waiting' }))

    expect(screen.queryByText('Finish the sign-in in your browser.')).toBeNull()
  })

  it('Stop waiting ends the pending account no operation in this window holds', async () => {
    // A connect another window started: the account says pending and nothing here can settle it.
    connectorAccounts.mockResolvedValue({ accounts: [{ ...ACCOUNT, status: 'pending' }] })
    await renderTab()

    fireEvent.click(await screen.findByRole('button', { name: 'Stop waiting' }))

    await waitFor(() => expect(removeConnectorAccount).toHaveBeenCalledWith('default', 'conn-1'))
    expect(await screen.findByRole('button', { name: 'Connect' })).toBeTruthy()
  })

  it('Disconnect asks first, and keeps the confirm open with the reason when the write is refused', async () => {
    connectorAccounts.mockResolvedValue({ accounts: [ACCOUNT] })
    removeConnectorAccount.mockRejectedValue(new ConnectorRpcError('The portal refused it.', 4001, undefined))
    await renderTab()
    await openCard('Notion')

    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect' }))

    const confirm = await screen.findByRole('dialog', { name: 'Disconnect Notion?' })

    expect(removeConnectorAccount).not.toHaveBeenCalled()

    fireEvent.click(within(confirm).getByRole('button', { name: 'Disconnect' }))

    await waitFor(() => expect(removeConnectorAccount).toHaveBeenCalledWith('default', 'conn-1'))
    expect(await within(confirm).findByText('The portal refused it.')).toBeTruthy()
  })

  it('keeps the servers on this Mac when the hosted half fails', async () => {
    listConnectors.mockRejectedValue(new ConnectorRpcError('no route', undefined, undefined))
    connectorCatalog.mockRejectedValue(new ConnectorRpcError('no route', undefined, undefined))
    getHermesConfigRecord.mockResolvedValue({ mcp_servers: { ctx7: { url: 'https://ctx7.invalid/mcp' } } })

    await renderTab()

    expect(await screen.findByRole('button', { name: /ctx7 — Open ctx7/ })).toBeTruthy()
    expect(screen.getByText('Could not reach the hosted apps.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
  })

  // The portal and the desktop ship on separate clocks, so the list alone has to draw the page.
  it('draws the hosted cards from the list alone when the catalog and the rules fail', async () => {
    listConnectors.mockResolvedValue({
      available: true,
      connectors: [
        {
          connected: true,
          connectionStatus: 'active',
          connector: 'hubspot',
          disabledTools: ['get_page'],
          enabled: true
        }
      ]
    })
    connectorCatalog.mockRejectedValue(new ConnectorRpcError('no catalog', 4004, 'CATALOG_UNAVAILABLE'))
    connectorPolicy.mockRejectedValue(new ConnectorRpcError('no rules', 4004, 'POLICY_UNAVAILABLE'))

    await renderTab()

    // No catalog row for the slug, so the name is derived from the slug itself.
    expect(await screen.findByRole('button', { name: /Hubspot — Open Hubspot/ })).toBeTruthy()
    // The page is not "failed": only the list can make it that.
    expect(screen.queryByText('Could not reach the hosted apps.')).toBeNull()
    // The off-count rides the list row, so it survives the rules read failing.
    expect(screen.getByText('1 tool off')).toBeTruthy()

    await openCard('Hubspot')

    expect(await screen.findByText('Rules cannot be changed right now.')).toBeTruthy()
    expect((screen.getByRole('switch', { name: 'Hermes can use Hubspot' }) as HTMLButtonElement).disabled).toBe(true)

    await openTools()

    // The read-only editor shows the list row's `disabledTools`, and no switch in it can be pressed.
    const tool = (await screen.findByRole('switch', { name: 'Turn Add page off' })) as HTMLButtonElement
    expect(tool.disabled).toBe(true)
    expect((screen.getByRole('switch', { name: 'Turn Get page on' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('keeps the hosted cards when every portal read but the list refuses this identity', async () => {
    const refused = () => new ConnectorRpcError('sign in first', 4003, 'NEEDS_NOUS_AUTH')

    connectorCatalog.mockRejectedValue(refused())
    connectorAccounts.mockRejectedValue(refused())
    connectorPolicy.mockRejectedValue(refused())

    await renderTab()

    expect(await screen.findByRole('button', { name: /Notion — Open Notion/ })).toBeTruthy()
    expect(screen.queryByText('Sign in to use the apps that follow your account.')).toBeNull()
  })

  it('calls an app gone only when the hosted list has dropped it', async () => {
    connectorAccounts.mockResolvedValue({ accounts: [ACCOUNT] })
    connectorTools.mockRejectedValue(new ConnectorRpcError('no such connector', 4004, 'CONNECTOR_NOT_FOUND'))

    await renderTab()
    await openCard('Notion')

    // The list still carries the app, so the failed read is about the read.
    expect(await screen.findByText('Tool list unavailable.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull()

    cleanup()
    queryClient.clear()
    clearPersisted('default')

    // The catalog still offers it; the list no longer answers for it.
    listConnectors.mockResolvedValue({ available: true, connectors: [] })

    await renderTab()
    await openCard('Notion')

    expect(await screen.findByText('Notion left the catalog.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Remove' })).toBeTruthy()
  })

  it('shows the hosted-failed state, never the first-run empty state, when the list fails', async () => {
    listConnectors.mockRejectedValue(new ConnectorRpcError('no route', undefined, undefined))
    // No shelf and no servers on this Mac: exactly the shape that used to read as a first run.
    connectorCatalog.mockResolvedValue({ connectors: [] })

    await renderTab()

    expect(await screen.findByText('Could not reach the hosted apps.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
    // A full shelf may exist that this person simply cannot see right now.
    expect(screen.queryByText(/No apps here yet/)).toBeNull()
  })

  it('keeps the one Add a server trigger to one job: a server that is in no list', async () => {
    getMcpCatalog.mockResolvedValue({ entries: [bundledEntry('filesystem')] })
    await renderTab()

    fireEvent.click(await screen.findByRole('button', { name: 'Add a server' }))

    const dialog = await screen.findByRole('dialog', { name: 'Add a server' })

    // What is left is the mcp.json editor and nothing else.
    expect(await within(dialog).findByRole('button', { name: 'Save' })).toBeTruthy()
    // One directory, one flow: the ready-to-install entries are cards on the page, not a second list here.
    expect(within(dialog).queryByText('Filesystem')).toBeNull()
    expect(within(dialog).queryByRole('button', { name: 'Install' })).toBeNull()
  })

  it('installs a bundled entry from its own card and opens what it installed', async () => {
    let servers: Record<string, unknown> = {}
    getHermesConfigRecord.mockImplementation(() => Promise.resolve({ mcp_servers: servers }))
    getMcpCatalog.mockResolvedValue({ entries: [bundledEntry('filesystem')] })
    installMcpCatalogEntry.mockImplementation(() => {
      servers = { filesystem: { command: 'npx' } }

      return Promise.resolve({ background: false })
    })

    await renderTab()

    fireEvent.click(await screen.findByRole('button', { name: 'Install' }))

    await waitFor(() => expect(installMcpCatalogEntry).toHaveBeenCalledWith('filesystem', {}, 'default'))
    expect(await screen.findByRole('dialog', { name: /Filesystem/ })).toBeTruthy()
  })

  it('opens the app a deep link names even when the Available shelf shows only its first few', async () => {
    getMcpCatalog.mockResolvedValue({
      entries: ['alpha', 'bravo', 'charlie', 'delta', 'echo'].map(name => bundledEntry(name))
    })
    // A group above Available is what makes Available a shelf at all.
    getHermesConfigRecord.mockResolvedValue({ mcp_servers: { ctx7: { url: 'https://ctx7.invalid/mcp' } } })

    await renderTab('&connector=notion')

    // Notion sorts last of the six Available cards, so the shelf is not drawing it.
    expect(await screen.findByRole('dialog', { name: /Notion/ })).toBeTruthy()
  })

  it('never turns a missing sign-in into a dead end', async () => {
    listConnectors.mockResolvedValue({ available: false, connectors: [] })
    getHermesConfigRecord.mockResolvedValue({ mcp_servers: { ctx7: { url: 'https://ctx7.invalid/mcp' } } })

    await renderTab()

    expect(await screen.findByText('Sign in to use the apps that follow your account.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy()
    // The servers on this Mac are nobody's account's business, so they still render under the line.
    expect(await screen.findByRole('button', { name: /ctx7 — Open ctx7/ })).toBeTruthy()
    expect(screen.queryByText('Could not reach the hosted apps.')).toBeNull()
  })

  it('tells a free-tier identity what a sign-in would add, without taking its apps away', async () => {
    $freeTierStatus.set({
      available: true,
      enabled: true,
      has_guest: true,
      label: 'free tier',
      model: 'nous/welcome',
      notice_pending: false
    })

    await renderTab()

    expect(await screen.findByRole('button', { name: /Notion — Open Notion/ })).toBeTruthy()
    expect(screen.getByText('Connections stay on this Mac until you sign in.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull()
  })

  it('shows the servers on this Mac before their probes answer', async () => {
    getHermesConfigRecord.mockResolvedValue({ mcp_servers: { ctx7: { url: 'https://ctx7.invalid/mcp' } } })
    testMcpServer.mockReturnValue(new Promise(() => {}))

    await renderTab()

    expect(await screen.findByRole('button', { name: /ctx7 — Open ctx7/ })).toBeTruthy()
  })

  it('names a server that is off instead of promising a tool list', async () => {
    getHermesConfigRecord.mockResolvedValue({
      mcp_servers: { ctx7: { enabled: false, url: 'https://ctx7.invalid/mcp' } }
    })

    await renderTab()
    await openCard('ctx7')

    expect(await screen.findByText('ctx7 is off.')).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('paints the page it had last time before the network answers again', async () => {
    // Nothing is kept under an unknown identity, which is the state a real launch resolves first.
    $freeTierStatus.set({
      available: true,
      enabled: true,
      has_guest: true,
      label: 'free tier',
      model: 'nous/welcome',
      notice_pending: false
    })

    await renderTab()
    await screen.findByRole('button', { name: /Notion — Open Notion/ })

    // A restart: the in-memory cache is gone and only what was written to storage survives.
    cleanup()
    queryClient.clear()

    const listCalls = listConnectors.mock.calls.length
    const catalogCalls = connectorCatalog.mock.calls.length

    await renderTab()

    expect(screen.getByRole('button', { name: /Notion — Open Notion/ })).toBeTruthy()
    expect(listConnectors.mock.calls.length).toBe(listCalls)
    expect(connectorCatalog.mock.calls.length).toBe(catalogCalls)
  })

  it('opens the tool list itself for a link that names a tool', async () => {
    // An app no other case in this file opens: a list stays open for the window session.
    listConnectors.mockResolvedValue({ available: true, connectors: [{ connector: 'dropbox', enabled: true }] })

    await renderTab('&connector=dropbox&tool=get_page')

    expect(await screen.findByRole('switch', { name: 'Turn Get page off' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Show all \d+ tools?$/ })).toBeNull()
  })
})
