import type { Translations } from '@/i18n/types'

import type { ConnectorCardModel } from './types'

/** The word beside the name: what kind of thing this is, never the bare residency word. */
export function connectorKindWord(card: ConnectorCardModel, copy: Translations['connectorsPage']['card']): string {
  if (card.residency === 'hosted') {
    return copy.kindManaged
  }

  if (card.plugin) {
    return copy.kindPlugin(card.plugin)
  }

  return card.ways.local?.inCatalog === true ? copy.kindCatalog : copy.kindCustom
}

/** We ship a manifest, or Nous hosts it. Never a server the person wrote, never a plugin's. */
export function showsCatalogMark(card: ConnectorCardModel): boolean {
  return card.inCatalog && card.plugin === undefined
}
