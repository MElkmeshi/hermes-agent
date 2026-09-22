import type { Translations } from '@/i18n/types'
import { isMacPlatform, isWindowsPlatform } from '@/lib/platform'

export function localResidencyWord(copy: Translations['connectorsPage']): string {
  if (isMacPlatform()) {
    return copy.residencyLocal.mac
  }

  return isWindowsPlatform() ? copy.residencyLocal.windows : copy.residencyLocal.other
}
