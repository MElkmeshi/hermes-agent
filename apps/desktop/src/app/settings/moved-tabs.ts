import { CAPABILITIES_ROUTE } from '../routes'

// Settings tabs that now live in Capabilities, with the row-selector param each carries across.
const MOVED_TO_CAPABILITIES: Record<string, { param: string; tab: string }> = {
  mcp: { param: 'server', tab: 'connectors' },
  plugins: { param: 'plugin', tab: 'plugins' }
}

/** The Capabilities URL an old `/settings?tab=<moved>` query lands on, or null when the tab is still Settings'. */
export function movedSettingsTabRedirect(search: string): null | string {
  const params = new URLSearchParams(search)
  const moved = MOVED_TO_CAPABILITIES[params.get('tab') ?? '']

  if (moved === undefined) {
    return null
  }

  const row = params.get(moved.param)
  const suffix = row ? `&${moved.param}=${encodeURIComponent(row)}` : ''

  return `${CAPABILITIES_ROUTE}?tab=${moved.tab}${suffix}`
}
