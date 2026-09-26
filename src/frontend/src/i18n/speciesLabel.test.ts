// src/frontend/src/i18n/speciesLabel.test.ts
import { describe, it, expect } from 'vitest'
import { speciesLabel } from './speciesLabel'
import { translate } from './index'

const en = (key: string) => translate('en', key)
const th = (key: string) => translate('th', key)

describe('speciesLabel — canonical stored values (I18N-16 T3)', () => {
  it('resolves the four canonical species to their English labels', () => {
    expect(speciesLabel(en, 'canine')).toBe('Canine')
    expect(speciesLabel(en, 'feline')).toBe('Feline')
    expect(speciesLabel(en, 'avian')).toBe('Avian')
    expect(speciesLabel(en, 'other')).toBe('Other')
  })

  it('resolves the four canonical species to their Thai labels', () => {
    expect(speciesLabel(th, 'canine')).toBe('สุนัข')
    expect(speciesLabel(th, 'feline')).toBe('แมว')
    expect(speciesLabel(th, 'avian')).toBe('นก')
    expect(speciesLabel(th, 'other')).toBe('อื่นๆ')
  })
})

describe('speciesLabel — display-only aliases for non-canonical stored values (§9.4 item 6)', () => {
  it('maps dog -> canine label and cat -> feline label in Thai', () => {
    expect(speciesLabel(th, 'dog')).toBe('สุนัข')
    expect(speciesLabel(th, 'cat')).toBe('แมว')
  })

  it('maps dog -> canine label and cat -> feline label in English', () => {
    expect(speciesLabel(en, 'dog')).toBe('Canine')
    expect(speciesLabel(en, 'cat')).toBe('Feline')
  })
})

describe('speciesLabel — case-insensitive lookup', () => {
  it('resolves mixed-case and upper-case stored values (Dog, CAT, Canine)', () => {
    expect(speciesLabel(th, 'Dog')).toBe('สุนัข')
    expect(speciesLabel(th, 'CAT')).toBe('แมว')
    expect(speciesLabel(th, 'Canine')).toBe('สุนัข')
    expect(speciesLabel(th, 'FELINE')).toBe('แมว')
  })
})

describe('speciesLabel — unknown stored value (X-1)', () => {
  it('falls back to the raw stored value with no crash and no key string', () => {
    expect(speciesLabel(th, 'ferret')).toBe('ferret')
    expect(speciesLabel(en, 'ferret')).toBe('ferret')
  })
})

describe('speciesLabel — every mapped key exists in both dictionaries', () => {
  it('resolves to a real label, never the raw i18n key, for every table entry in en and th', () => {
    const stored = ['canine', 'feline', 'avian', 'other', 'dog', 'cat']
    for (const value of stored) {
      expect(speciesLabel(en, value)).not.toMatch(/^clinic\.|^common\./)
      expect(speciesLabel(th, value)).not.toMatch(/^clinic\.|^common\./)
    }
  })
})
