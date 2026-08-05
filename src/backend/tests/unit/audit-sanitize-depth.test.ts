/**
 * @qa-agent — R3-HI-06 regression: the audit redactor must never throw on
 * attacker-controlled input shapes.
 *
 * The pre-fix implementation recursed with the native call stack and no bound, so a
 * deeply-nested body (well under any body-size limit) threw
 * `RangeError: Maximum call stack size exceeded` from inside `res.on('finish')` —
 * outside Express's error-handling chain, so nothing caught it and the process died.
 *
 * These tests assert the iterative rewrite is *total*: it returns a value for every
 * input rather than throwing, and it bounds both nesting depth and total node count.
 */
import { redact, sanitize } from '../../utils/audit-sanitize'
import { isWithinJsonLimits } from '../../utils/json-depth'

/** Builds `{a:{a:{a:...}}}` nested `depth` levels deep, iteratively (no recursion). */
function deepObject(depth: number): Record<string, unknown> {
  const root: Record<string, unknown> = {}
  let cur = root
  for (let i = 0; i < depth; i++) {
    const next: Record<string, unknown> = {}
    cur['a'] = next
    cur = next
  }
  cur['password'] = 'sentinel-should-never-surface'
  return root
}

/** Builds `[[[...]]]` nested `depth` levels deep. */
function deepArray(depth: number): unknown[] {
  let cur: unknown[] = []
  for (let i = 0; i < depth; i++) cur = [cur]
  return cur
}

describe('R3-HI-06 — redact() does not throw on pathological input', () => {
  it('survives 5000 levels of object nesting (pre-fix: RangeError)', () => {
    expect(() => redact(deepObject(5000))).not.toThrow()
  })

  it('survives 5000 levels of array nesting', () => {
    expect(() => redact(deepArray(5000))).not.toThrow()
  })

  it('truncates beyond the depth bound rather than traversing forever', () => {
    const out = JSON.stringify(redact(deepObject(5000)))
    expect(out).toContain('[TRUNCATED]')
    // The deep sentinel sits below the bound, so it must never reach the audit row.
    expect(out).not.toContain('sentinel-should-never-surface')
  })

  it('survives a cyclic object (node bound stops the walk)', () => {
    const cyclic: Record<string, unknown> = { name: 'loop' }
    cyclic['self'] = cyclic
    expect(() => redact(cyclic)).not.toThrow()
    expect(JSON.stringify(redact(cyclic))).toContain('[TRUNCATED]')
  })

  it('survives a wide payload (breadth bound, not just depth)', () => {
    const wide: Record<string, unknown> = {}
    for (let i = 0; i < 5000; i++) wide['k' + i] = { v: i }
    expect(() => redact(wide)).not.toThrow()
  })

  it('passes malformed / exotic leaves through without throwing', () => {
    for (const v of [null, undefined, NaN, Infinity, 0, '', false, Symbol('s'), () => 1, new Date(), BigInt(1)]) {
      expect(() => redact({ v } as Record<string, unknown>)).not.toThrow()
    }
    expect(() => redact(Object.create(null) as object)).not.toThrow()
  })

  it('still redacts sensitive keys at shallow depth (fix did not regress the core job)', () => {
    const out = redact({ username: 'bob', password: 'hunter2', nested: { apiKey: 'abc', token: 't' } }) as Record<string, unknown>
    expect(out['username']).toBe('bob')
    expect(out['password']).toBe('***')
    expect((out['nested'] as Record<string, unknown>)['apiKey']).toBe('***')
    expect((out['nested'] as Record<string, unknown>)['token']).toBe('***')
  })

  it('redacts sensitive keys inside arrays', () => {
    const out = redact({ items: [{ secret: 's1' }, { ok: 'v' }] }) as Record<string, unknown>
    const items = out['items'] as Record<string, unknown>[]
    expect(items[0]!['secret']).toBe('***')
    expect(items[1]!['ok']).toBe('v')
  })

  it('sanitize() returns undefined for non-objects and never throws on deep input', () => {
    expect(sanitize('str')).toBeUndefined()
    expect(sanitize(null)).toBeUndefined()
    expect(() => sanitize(deepObject(5000))).not.toThrow()
  })
})

describe('R3-HI-06 — isWithinJsonLimits() validator guard', () => {
  it('does not throw on 5000-level nesting (guard must not crash the validator)', () => {
    expect(() => isWithinJsonLimits(deepObject(5000))).not.toThrow()
  })

  it('rejects input deeper than the bound', () => {
    expect(isWithinJsonLimits(deepObject(5000))).toBe(false)
  })

  it('rejects input wider than the node bound', () => {
    const wide: Record<string, unknown> = {}
    for (let i = 0; i < 5000; i++) wide['k' + i] = { v: i }
    expect(isWithinJsonLimits(wide)).toBe(false)
  })

  it('accepts an ordinary settings-shaped payload', () => {
    expect(isWithinJsonLimits({ operatingHours: { mon: { open: '09:00', close: '18:00' } } })).toBe(true)
  })

  it('does not throw on a cyclic object', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic['self'] = cyclic
    expect(() => isWithinJsonLimits(cyclic)).not.toThrow()
    expect(isWithinJsonLimits(cyclic)).toBe(false)
  })
})
