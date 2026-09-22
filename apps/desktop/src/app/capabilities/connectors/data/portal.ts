// Every connectors link asks the origin the install was pointed at, not a portal the person has no session on.

import { openExternalLink } from '@/lib/external-link'

import { FALLBACK_PORTAL_URL } from '../../../settings/billing/use-billing-state'

const CONNECTORS_PATH = '/connectors'

const FALLBACK_CONNECTORS_ADMIN_URL = `${FALLBACK_PORTAL_URL}${CONNECTORS_PATH}`

const adminUrl = (base: string): string => {
  const origin = base.replace(/\/+$/, '')

  return origin ? `${origin}${CONNECTORS_PATH}` : FALLBACK_CONNECTORS_ADMIN_URL
}

/** Open the portal's connectors admin, resolving the origin at the click rather than holding it as render state. */
export async function openConnectorsAdmin(): Promise<void> {
  let url = FALLBACK_CONNECTORS_ADMIN_URL

  try {
    const status = await window.hermesDesktop?.cloud?.status()

    if (status) {
      url = adminUrl(status.portalBaseUrl)
    }
  } catch {
    // The fallback still opens, and a portal link is not worth a notice.
  }

  openExternalLink(url)
}
