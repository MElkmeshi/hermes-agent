// Nothing in the link is trusted: the op id only names which operation to show, and the backend reads the account.

import { CAPABILITIES_ROUTE } from '../../../routes'

import { $accountOperations } from './account-operations'
import { wakeAccountOperation } from './rpc'

const connectorRoute = (slug: string): string =>
  `${CAPABILITIES_ROUTE}?tab=connectors&connector=${encodeURIComponent(slug)}`

/** Handle the returning link when THIS window holds the operation; false sends the caller to the session path. */
export async function resumeAccountConnect(opId: string, navigate: (to: string) => void): Promise<boolean> {
  const operation = $accountOperations.get()[opId]

  if (!operation) {
    return false
  }

  if (operation.settled) {
    // The tab can come back long after the person moved on, and a stale link must not pull them away.
    return true
  }

  navigate(connectorRoute(operation.connectors[0] ?? ''))

  try {
    await wakeAccountOperation(operation.scope, opId)
  } catch {
    // The operation can settle and leave the live registry between the link and this RPC.
  }

  return true
}
