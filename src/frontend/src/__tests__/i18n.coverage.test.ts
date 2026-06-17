// src/frontend/src/__tests__/i18n.coverage.test.ts
import { describe, it, expect } from 'vitest'
import { en, th, translate } from '../i18n'

describe('i18n key coverage', () => {
  it('every English key has a Thai translation', () => {
    const missing = Object.keys(en).filter(key => !(key in th))
    expect(missing, `Missing Thai keys: ${missing.join(', ')}`).toHaveLength(0)
  })

  it('translate() falls back to key for unknown keys', () => {
    expect(translate('th', 'unknown.key.xyz')).toBe('unknown.key.xyz')
  })

  it('translate() returns Thai string for a known key in Thai', () => {
    expect(translate('th', 'common.save')).toBe('บันทึก')
  })

  it('translate() returns English string for a known key in English', () => {
    expect(translate('en', 'common.save')).toBe('Save')
  })
})

describe('Language toggle smoke test', () => {
  it('translate() returns Thai for login.signIn', () => {
    expect(translate('th', 'login.signIn')).toBe('เข้าสู่ระบบ')
  })
  it('translate() returns English for login.signIn', () => {
    expect(translate('en', 'login.signIn')).toBe('Sign In')
  })
})
