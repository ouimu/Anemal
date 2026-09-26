// src/frontend/src/__tests__/i18n.coverage.test.ts
//
// Static i18n integrity checks (I18N-14, BA sign-off §6.2 / plan Task I18N-14).
// These are the app-wide, automatable checks (BA §2 answer 4.7a) — the per-screen
// render-level Latin-residue checks (4.7b) live in the per-screen
// `<Screen>.i18n.test.tsx` files instead.
//
// Source files are read via Vite's `import.meta.glob(..., { query: '?raw' })`
// rather than Node's `fs` module: this package has no @types/node dependency
// (browser-only codebase by design), and `import.meta.glob` is a native
// Vite/Vitest feature that needs no new dependency and no ambient type shims.
import { describe, it, expect } from 'vitest'
import { en, th, translate } from '../i18n'

/** Every non-test TypeScript/TSX source file under src/, as raw text, keyed by
 * its module path. `i18n/index.ts` itself is excluded — it defines keys, it
 * doesn't call the translator. */
const ALL_SOURCE_FILES = import.meta.glob(
  ['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}', '!../i18n/index.ts'],
  { eager: true, query: '?raw', import: 'default' }
) as Record<string, string>

/** The 4 screens this feature converts (BA §1 scope, plan §1). R-5's no-dynamic-key
 *  rule is scoped to these files only — other files (e.g. TopNav's `t(\`page.${p}\`)`)
 *  are pre-existing and out of scope for this branch. */
const IN_SCOPE_VIEW_FILES = import.meta.glob(
  [
    '../views/clinic/ClinicGrooming.tsx',
    '../views/clinic/ClinicInpatient.tsx',
    '../views/clinic/ClinicEMR.tsx',
    '../views/clinic/ClinicPets.tsx',
  ],
  { eager: true, query: '?raw', import: 'default' }
) as Record<string, string>

/** Namespaces this feature owns; R-4 requires every key in them to render a
 *  Thai value that differs from the English one (unless plural-exempted below). */
const OWNED_NAMESPACE_PREFIXES = ['clinic.grooming.', 'clinic.inpatient.', 'clinic.emr.', 'clinic.pets.']

/** R-4: One/Other plural pairs may share an identical Thai value (Thai has no
 *  plural inflection) — the th!==en check ignores them, per BA rule R-4. */
const PLURAL_SUFFIX_RE = /(One|Other)$/

/** Explicit allow-list for a key whose Thai value legitimately equals its English
 *  value (E-4 clinical tokens, brand/product names). Empty until a real case
 *  needs it — do not add an entry here to silence a genuine untranslated string. */
const ALLOWED_SAME_AS_EN: readonly string[] = []

/** Every literal `t('key')` / `t("key")` call in `source` (dynamic/template calls
 * are not literals and are intentionally not matched here — R-5 checks those
 * separately, scoped to the 4 in-scope view files). */
function literalTranslateKeys(source: string): string[] {
  const keys: string[] = []
  const re = /\bt\(\s*(['"])([a-zA-Z0-9_.]+)\1\s*\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) keys.push(m[2])
  return keys
}

/** `{token}` names referenced in an i18n string value (R-3 interpolation). */
function tokenSet(value: string): Set<string> {
  return new Set([...value.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map(m => m[1]))
}

function sameTokens(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const t of a) if (!b.has(t)) return false
  return true
}

describe('i18n key coverage', () => {
  it('every English key has a Thai translation', () => {
    const missing = Object.keys(en).filter(key => !(key in th))
    expect(missing, `Missing Thai keys: ${missing.join(', ')}`).toHaveLength(0)
  })

  it('every Thai key has an English translation (two-way parity)', () => {
    const missing = Object.keys(th).filter(key => !(key in en))
    expect(missing, `Thai-only keys with no English counterpart: ${missing.join(', ')}`).toHaveLength(0)
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

describe('i18n static integrity (I18N-14)', () => {
  it('every literal t(\'…\') key used in src/**/*.{ts,tsx} exists in en', () => {
    const missing = new Map<string, string[]>()
    for (const [file, source] of Object.entries(ALL_SOURCE_FILES)) {
      for (const key of literalTranslateKeys(source)) {
        if (!(key in en)) {
          missing.set(key, [...(missing.get(key) ?? []), file])
        }
      }
    }
    const report = [...missing.entries()].map(([key, files]) => `${key} (${files.join(', ')})`).join('; ')
    expect(missing.size, `Literal t() keys with no en entry: ${report}`).toBe(0)
  })

  it('every key\'s en and th values share the same {token} set (R-3)', () => {
    const mismatches: string[] = []
    for (const key of Object.keys(en)) {
      if (!(key in th)) continue // reported by the two-way parity test above
      const enTokens = tokenSet(en[key])
      const thTokens = tokenSet(th[key])
      if (!sameTokens(enTokens, thTokens)) {
        mismatches.push(`${key}: en={${[...enTokens]}} th={${[...thTokens]}}`)
      }
    }
    expect(mismatches, `Token mismatch: ${mismatches.join('; ')}`).toHaveLength(0)
  })

  it('every key in this feature\'s namespaces has a Thai value that differs from English (R-4)', () => {
    const violations: string[] = []
    for (const key of Object.keys(en)) {
      if (!OWNED_NAMESPACE_PREFIXES.some(prefix => key.startsWith(prefix))) continue
      if (PLURAL_SUFFIX_RE.test(key)) continue // R-4: plural pairs compared to each other, not to en
      if (ALLOWED_SAME_AS_EN.includes(key)) continue
      if (!(key in th)) continue // reported by the two-way parity test above
      if (th[key] === en[key]) violations.push(key)
    }
    expect(violations, `Untranslated (th === en) keys: ${violations.join(', ')}`).toHaveLength(0)
  })

  it('none of the 4 in-scope view files contains a template-literal t(`…`) call (R-5)', () => {
    const offenders: string[] = []
    for (const [file, source] of Object.entries(IN_SCOPE_VIEW_FILES)) {
      if (/\bt\(\s*`/.test(source)) offenders.push(file)
    }
    expect(offenders, `Dynamic t(\`…\`) call found in: ${offenders.join(', ')}`).toHaveLength(0)
  })
})
