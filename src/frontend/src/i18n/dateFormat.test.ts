// src/frontend/src/i18n/dateFormat.test.ts
import { describe, it, expect, afterEach } from 'vitest'
import { formatDate, formatDateTime, formatShortDate } from './dateFormat'

// Fixed reference date (a Monday) — every assertion below uses this instead of
// a live clock, per I18N-15's AC.
const FIXED_ISO = '2026-09-21T14:30:00'

describe('dateFormat — English output is byte-identical to today (A-2)', () => {
  it('formatDate matches the pre-existing Inpatient formatDate literal call', () => {
    const legacy = new Date(FIXED_ISO).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    })
    expect(formatDate(FIXED_ISO, 'en')).toBe(legacy)
  })

  it('formatDateTime matches the pre-existing Inpatient formatDateTime literal call', () => {
    const legacy = new Date(FIXED_ISO).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
    expect(formatDateTime(FIXED_ISO, 'en')).toBe(legacy)
  })

  it('formatShortDate matches the pre-existing Grooming formatDateLabel literal call', () => {
    const legacy = new Date(FIXED_ISO).toLocaleDateString('en-GB', {
      weekday: 'short', day: '2-digit', month: 'short',
    })
    expect(formatShortDate(FIXED_ISO, 'en')).toBe(legacy)
  })
})

describe('dateFormat — Thai output uses Gregorian year, never Buddhist Era (ADR-0029, G-1)', () => {
  it('formatDate renders the Thai month and the Gregorian year 2026, not 2569', () => {
    const out = formatDate(FIXED_ISO, 'th')
    expect(out).toContain('2026')
    expect(out).not.toContain('2569')
    expect(out).toContain('ก.ย.') // Thai abbreviation for September
  })

  it('formatDateTime renders 24-hour time and the Gregorian year', () => {
    const out = formatDateTime(FIXED_ISO, 'th')
    expect(out).toContain('2026')
    expect(out).not.toContain('2569')
    expect(out).toContain('14:30')
  })

  it('formatShortDate renders the glossary Thai weekday abbreviation (§5.2)', () => {
    // 2026-09-21 is a Monday.
    expect(formatShortDate(FIXED_ISO, 'th')).toBe('จ. 21 ก.ย.')
  })
})

describe('dateFormat — output does not depend on the browser/OS locale', () => {
  const originalLanguage = window.navigator.language

  afterEach(() => {
    Object.defineProperty(window.navigator, 'language', { value: originalLanguage, configurable: true })
  })

  it('formatDate(iso, "en") is identical under two different navigator.language values', () => {
    Object.defineProperty(window.navigator, 'language', { value: 'en-US', configurable: true })
    const first = formatDate(FIXED_ISO, 'en')
    Object.defineProperty(window.navigator, 'language', { value: 'th-TH', configurable: true })
    const second = formatDate(FIXED_ISO, 'en')
    expect(first).toBe(second)
  })

  it('formatDate(iso, "th") is identical under two different navigator.language values', () => {
    Object.defineProperty(window.navigator, 'language', { value: 'en-US', configurable: true })
    const first = formatDate(FIXED_ISO, 'th')
    Object.defineProperty(window.navigator, 'language', { value: 'fr-FR', configurable: true })
    const second = formatDate(FIXED_ISO, 'th')
    expect(first).toBe(second)
  })
})
