import { toolRows } from './derive-tools'
import type { BundledEntryInput, HostedConnectorInput, LocalServerInput, ToolInput, ToolRowModel } from './types'

/** One tool per rule, and enough rows to clear the tiny-connector threshold so the chrome renders. */
export const TOOLS: ToolInput[] = [
  {
    categories: ['issues'],
    deprecated: false,
    description: 'Returns the issues on a team board, newest first.',
    facet: 'read',
    hints: ['readOnlyHint'],
    name: 'List issues',
    slug: 'LINEAR_LIST_ISSUES'
  },
  {
    categories: ['issues'],
    deprecated: false,
    description: 'Returns one issue and its current state.',
    facet: 'read',
    hints: ['idempotentHint', 'readOnlyHint'],
    name: 'Get one issue',
    slug: 'LINEAR_GET_ISSUE'
  },
  {
    // The two-category row: it must match either bucket in the filter.
    categories: ['issues', 'search'],
    deprecated: false,
    description: 'Finds issues by title, body or label.',
    facet: 'read',
    hints: ['readOnlyHint'],
    name: 'Search issues',
    slug: 'LINEAR_SEARCH_ISSUES'
  },
  {
    categories: ['teams'],
    deprecated: false,
    description: 'Returns the teams you can see.',
    facet: 'read',
    hints: ['readOnlyHint'],
    name: 'List teams',
    slug: 'LINEAR_LIST_TEAMS'
  },
  {
    categories: ['issues'],
    deprecated: false,
    description: 'Opens a new issue on a team board.',
    facet: 'write',
    hints: ['createHint'],
    name: 'Create an issue',
    slug: 'LINEAR_CREATE_ISSUE'
  },
  {
    categories: ['issues'],
    deprecated: false,
    description: 'Changes the title, state or assignee of an issue.',
    facet: 'write',
    hints: ['idempotentHint', 'updateHint'],
    name: 'Update an issue',
    slug: 'LINEAR_UPDATE_ISSUE'
  },
  {
    categories: ['comments'],
    deprecated: false,
    description: 'Adds a comment to an issue.',
    facet: 'write',
    hints: ['createHint'],
    name: 'Comment on an issue',
    slug: 'LINEAR_ADD_COMMENT'
  },
  {
    categories: ['issues'],
    deprecated: false,
    description: 'Attaches an outside link to an issue.',
    facet: 'write',
    hints: ['createHint', 'openWorldHint'],
    name: 'Attach a link',
    slug: 'LINEAR_ATTACH_LINK'
  },
  {
    categories: ['issues'],
    deprecated: false,
    description: 'Moves an issue off the board. It can be restored.',
    facet: 'destructive',
    hints: ['deleteHint'],
    name: 'Archive an issue',
    slug: 'LINEAR_ARCHIVE_ISSUE'
  },
  {
    categories: ['comments'],
    deprecated: false,
    description: 'Removes a comment for good.',
    facet: 'destructive',
    hints: ['deleteHint', 'destructiveHint'],
    name: 'Delete a comment',
    slug: 'LINEAR_DELETE_COMMENT'
  },
  {
    // The org-locked row: `ORG_DISABLED` below takes it away.
    categories: ['projects'],
    deprecated: false,
    description: 'Removes a project and everything filed under it.',
    facet: 'destructive',
    hints: ['deleteHint', 'destructiveHint'],
    name: 'Delete a project',
    slug: 'LINEAR_DELETE_PROJECT'
  },
  {
    categories: [],
    deprecated: false,
    description: 'Posts to a URL you configured. What happens there is not ours to say.',
    facet: 'unclassified',
    hints: ['openWorldHint'],
    name: 'Run a webhook',
    slug: 'LINEAR_RUN_WEBHOOK'
  },
  {
    categories: ['projects'],
    deprecated: true,
    description: 'Copies the old board across. Replaced by the project sync.',
    facet: 'write',
    hints: ['updateHint'],
    name: 'Sync the legacy board',
    slug: 'LINEAR_SYNC_LEGACY'
  },
  {
    categories: [],
    deprecated: false,
    description: 'Answers if the connection is alive.',
    facet: 'unclassified',
    hints: [],
    name: 'Check the connection',
    slug: 'LINEAR_PING'
  }
]

export const ORG_DISABLED = new Set(['LINEAR_DELETE_PROJECT'])

export function toolFixtures(disabled: Iterable<string> = []): ToolRowModel[] {
  return toolRows(TOOLS, new Set(disabled), ORG_DISABLED)
}

/** Three tools, one facet: under every threshold the chrome is derived from. */
export const TINY_TOOLS: ToolInput[] = [
  {
    categories: [],
    deprecated: false,
    description: 'Searches the docs.',
    facet: 'unclassified',
    hints: [],
    name: 'Docs',
    slug: 'CLOUDFLARE_MCP_DOCS'
  },
  {
    categories: [],
    deprecated: false,
    description: 'Runs a query.',
    facet: 'unclassified',
    hints: [],
    name: 'Execute',
    slug: 'CLOUDFLARE_MCP_EXECUTE'
  },
  {
    categories: [],
    deprecated: false,
    description: 'Searches your account.',
    facet: 'unclassified',
    hints: [],
    name: 'Search',
    slug: 'CLOUDFLARE_MCP_SEARCH'
  }
]

/** No write facet, so `Read only` and `Turn off destructive` expand to the same list. */
export const NO_WRITE_TOOLS: ToolInput[] = TOOLS.filter(
  tool => tool.facet !== 'write' && tool.slug !== 'LINEAR_DELETE_PROJECT'
)

export const HOSTED: HostedConnectorInput[] = [
  {
    accountLabel: 'mag-yoga@gmail.com',
    connected: true,
    connectedAt: '2026-03-14T09:00:00.000Z',
    connectionStatus: 'active',
    description: 'Email, search, labels and drafts across your mailbox',
    enabled: true,
    inCatalog: true,
    slug: 'gmail',
    toolsOff: 4
  },
  {
    connected: true,
    connectionStatus: 'expired',
    description: 'Pages, databases and the blocks inside them',
    enabled: true,
    inCatalog: true,
    slug: 'notion',
    statusReason: 'Authorization expired. Reconnect to continue.'
  },
  {
    connected: true,
    connectionStatus: 'failed',
    description: 'Issues, releases and the events behind them',
    enabled: true,
    inCatalog: true,
    slug: 'sentry'
  },
  {
    connected: false,
    description: 'Channels, messages and the people in them',
    enabled: true,
    inCatalog: true,
    slug: 'slack'
  },
  {
    connected: false,
    description: 'Files, frames and comments in a design file',
    enabled: true,
    inCatalog: true,
    slug: 'figma'
  },
  {
    connected: true,
    connectionStatus: 'active',
    description: 'Storefronts, orders, products and customers',
    enabled: false,
    inCatalog: true,
    slug: 'shopify'
  },
  {
    connected: true,
    connectionStatus: 'active',
    description: 'Payments, customers and invoices',
    enabled: true,
    inCatalog: true,
    orgLocked: true,
    slug: 'stripe'
  },
  {
    // The hosted twin of the local `github` server below. One card, not two.
    connected: false,
    description: 'Repositories, issues and pull requests',
    enabled: true,
    inCatalog: true,
    slug: 'github'
  }
]

export const LOCAL: LocalServerInput[] = [
  {
    enabled: true,
    hostedSlug: 'github',
    name: 'github',
    status: 'ok',
    target: 'https://api.githubcopilot.com/mcp/',
    toolsOn: 29,
    toolsTotal: 31
  },
  {
    enabled: true,
    name: 'postgres',
    status: 'ok',
    target: 'npx -y @modelcontextprotocol/server-postgres',
    toolsOn: 8,
    toolsTotal: 8
  },
  {
    enabled: true,
    name: 'linear-local',
    status: 'needs-auth',
    target: 'https://mcp.linear.app/sse'
  }
]

export const TITLES: Record<string, string> = {
  figma: 'Figma',
  github: 'GitHub',
  gmail: 'Gmail',
  'linear-local': 'Linear',
  notion: 'Notion',
  postgres: 'Postgres',
  sentry: 'Sentry',
  shopify: 'Shopify',
  slack: 'Slack',
  stripe: 'Stripe'
}

/** One entry naming an app the list offers, one naming a slug it does not, and one naming none. */
export const BUNDLED: BundledEntryInput[] = [
  {
    authType: 'oauth',
    description: 'Channels, messages and the people in them',
    hostedSlug: 'slack',
    name: 'slack-server',
    needsEnv: false
  },
  {
    authType: 'apiKey',
    description: 'Bases, tables and the rows inside them',
    hostedSlug: 'airtable',
    name: 'airtable',
    needsEnv: true
  },
  {
    authType: 'none',
    description: 'Reads and writes files in a folder you choose',
    name: 'filesystem',
    needsEnv: false
  }
]

// The stress case: one app that exists both ways. A test composes the four combinations from these.
export const WAYS_SLUG = 'monday'

export const WAYS_HOSTED: HostedConnectorInput = {
  connected: false,
  description: 'Boards, items and the updates on them',
  enabled: true,
  inCatalog: true,
  slug: WAYS_SLUG
}

export const WAYS_LOCAL: LocalServerInput = {
  enabled: true,
  hostedSlug: WAYS_SLUG,
  name: 'monday-server',
  status: 'ok',
  target: 'https://example.invalid/mcp'
}

export const WAYS_BUNDLED: BundledEntryInput = {
  authType: 'oauth',
  hostedSlug: WAYS_SLUG,
  name: 'monday-server',
  needsEnv: false
}
