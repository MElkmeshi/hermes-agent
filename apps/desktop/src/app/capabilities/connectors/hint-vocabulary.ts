// One map from every wire value to the i18n key we show for it; an unknown value degrades to a readable tag.

/** How loud the tag reads. Components map these onto the badge variants. */
export type VocabularyTone = 'danger' | 'neutral' | 'notice' | 'unknown'

export type VocabularyKey =
  | 'facetDestructive'
  | 'facetRead'
  | 'facetUnclassified'
  | 'facetWrite'
  | 'hintCreate'
  | 'hintDelete'
  | 'hintDestructive'
  | 'hintIdempotent'
  | 'hintOpenWorld'
  | 'hintReadOnly'
  | 'hintUpdate'

export interface VocabularyEntry {
  key: VocabularyKey
  tone: VocabularyTone
}

/** A null `key` means no word is shipped for this value, and `tagCopy` shortens the raw one instead. */
export interface VocabularyTag {
  key: VocabularyKey | null
  /** The raw wire value, for the unknown branch and for `data-` attributes. */
  raw: string
  tone: VocabularyTone
}

export interface VocabularyCopy {
  /** Eight characters at most, so seven tags fit one wrapping line at 390px. */
  label: string
  /** One plain sentence, for the disclosure and the tooltip. */
  long: string
}

export type VocabularyStrings = Record<VocabularyKey, VocabularyCopy>

/** The facet keys and the hint keys share one table and must never collide. */
export const VOCABULARY = {
  createHint: { key: 'hintCreate', tone: 'notice' },
  deleteHint: { key: 'hintDelete', tone: 'danger' },
  destructive: { key: 'facetDestructive', tone: 'danger' },
  destructiveHint: { key: 'hintDestructive', tone: 'danger' },
  idempotentHint: { key: 'hintIdempotent', tone: 'neutral' },
  openWorldHint: { key: 'hintOpenWorld', tone: 'notice' },
  read: { key: 'facetRead', tone: 'neutral' },
  readOnlyHint: { key: 'hintReadOnly', tone: 'neutral' },
  unclassified: { key: 'facetUnclassified', tone: 'unknown' },
  updateHint: { key: 'hintUpdate', tone: 'neutral' },
  write: { key: 'facetWrite', tone: 'notice' }
} satisfies Record<string, VocabularyEntry>

const TABLE: Record<string, undefined | VocabularyEntry> = VOCABULARY

/** The order facet chips and the facet summary render in: least to most costly. */
export const FACET_ORDER: readonly (keyof typeof VOCABULARY)[] = ['read', 'write', 'destructive', 'unclassified']

/** The order hint chips render in. Hints the connector does not use are dropped. */
export const HINT_ORDER: readonly (keyof typeof VOCABULARY)[] = [
  'readOnlyHint',
  'createHint',
  'updateHint',
  'deleteHint',
  'destructiveHint',
  'idempotentHint',
  'openWorldHint'
]

const MAX_LABEL = 8

/** `search_repositories_v2` reads as `Search`, truncated hard so an unknown tag cannot widen its row. */
export function shortenUnknown(raw: string): string {
  const stem = raw.trim().replace(/Hint$/, '')
  const word = stem.split(/[\s_\-.:/]+/).find(part => part.length > 0) ?? ''
  // camelCase and PascalCase both arrive from providers; take the leading run of letters.
  const head = /^[a-z]+|^[A-Z][a-z]*/.exec(word)?.[0] ?? ''

  if (head.length === 0) {
    return ''
  }

  return (head.charAt(0).toUpperCase() + head.slice(1)).slice(0, MAX_LABEL)
}

export function vocabularyTag(raw: string): VocabularyTag {
  const entry = TABLE[raw]

  if (entry) {
    return { key: entry.key, raw, tone: entry.tone }
  }

  // A value that shortens to nothing falls back to the key, which keeps "Unknown" translatable.
  return { key: shortenUnknown(raw).length === 0 ? 'facetUnclassified' : null, raw, tone: 'unknown' }
}

/** The hint a facet word already says, so a row never prints the same word twice. */
const FACET_SAYS: Record<string, string | undefined> = { destructive: 'destructiveHint' }

/** Unknown values stay at the end, so a new provider value never reshuffles the familiar tags. */
export function hintTags(hints: readonly string[], facet?: string): VocabularyTag[] {
  const said = facet === undefined ? undefined : FACET_SAYS[facet]
  const seen = new Set(hints.filter(hint => hint !== said))
  const known = HINT_ORDER.filter(hint => seen.has(hint))
  const rest = [...seen].filter(hint => !(hint in VOCABULARY))

  return [...known, ...rest].map(vocabularyTag)
}

/** An unknown value borrows its shortened text and its raw value, so nothing is ever blank. */
export function tagCopy(tag: VocabularyTag, strings: VocabularyStrings): VocabularyCopy {
  return tag.key ? strings[tag.key] : { label: shortenUnknown(tag.raw), long: tag.raw }
}
