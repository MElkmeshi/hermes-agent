import type { Translations } from '@/i18n/types'

import type { ConnectorCardModel } from './types'

/** The word beside the name: what kind of thing this is, never the bare residency word. */
export function connectorKindWord(card: ConnectorCardModel, copy: Translations['connectorsPage']['card']): string {
  if (card.residency === 'hosted') {
    return copy.kindManaged
  }

  return card.plugin ? copy.kindPlugin(card.plugin) : copy.kindCustom
}
