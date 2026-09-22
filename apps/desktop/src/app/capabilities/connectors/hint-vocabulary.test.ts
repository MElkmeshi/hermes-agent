import { describe, expect, it } from 'vitest'

import { en } from '@/i18n/en'

import { hintTags, shortenUnknown, tagCopy, type VocabularyStrings, vocabularyTag } from './hint-vocabulary'

const strings: VocabularyStrings = en.connectorsPage.vocabulary

describe('hint vocabulary', () => {
  it('falls back to a readable tag for a value it has never seen', () => {
    const tag = vocabularyTag('mutateEverythingHint')

    expect(tag.key).toBeNull()
    expect(tag.tone).toBe('unknown')
    expect(tagCopy(tag, strings).label).toBe('Mutate')
  })

  it('never renders a blank tag, whatever the wire sends', () => {
    for (const raw of ['', '   ', '___', 'Hint', '🙂']) {
      expect(tagCopy(vocabularyTag(raw), strings).label.length).toBeGreaterThan(0)
    }
  })

  it('shortens an unknown value to at most eight characters', () => {
    expect(shortenUnknown('search_repositories_v2')).toBe('Search')
    expect(shortenUnknown('extraordinarilyLongHint')).toBe('Extraord')
    expect(shortenUnknown('readOnlyHint')).toBe('Read')
  })

  it('orders known hints first and keeps unknown ones at the end', () => {
    const tags = hintTags(['telepathyHint', 'deleteHint', 'readOnlyHint'])

    expect(tags.map(tag => tag.key)).toEqual(['hintReadOnly', 'hintDelete', null])
    expect(tagCopy(tags[2], strings).label).toBe('Telepath')
  })

  it('drops a hint the facet word already says', () => {
    const tags = hintTags(['deleteHint', 'destructiveHint'], 'destructive')

    // The row printed `Destructive Destructive` while both words rode the same line.
    expect(tags.map(tag => tag.key)).toEqual(['hintDelete'])
    expect(hintTags(['destructiveHint'], 'write').map(tag => tag.key)).toEqual(['hintDestructive'])
  })
})
