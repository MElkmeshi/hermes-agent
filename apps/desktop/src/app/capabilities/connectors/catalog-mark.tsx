// `Codicon` hardcodes `aria-hidden`, so the label lives on the wrapping span instead.

import { Codicon } from '@/components/ui/codicon'
import { Tip } from '@/components/ui/tooltip'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'

/** `relative z-10`: the row-card's name button paints a pseudo element over the whole card. */
export function CatalogMark({ className }: { className?: string }) {
  const { t } = useI18n()
  const label = t.connectorsPage.card.inCatalog

  return (
    <Tip label={label}>
      <span
        aria-label={label}
        className={cn('relative z-10 flex shrink-0 items-center text-(--ui-text-quaternary)', className)}
        role="img"
      >
        <Codicon name="verified-filled" size="0.75rem" />
      </span>
    </Tip>
  )
}
