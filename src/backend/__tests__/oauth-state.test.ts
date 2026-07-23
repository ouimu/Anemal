// src/backend/__tests__/oauth-state.test.ts
import { signOAuthState, verifyOAuthState } from '../utils/oauth-state'

const payload = { tenantId: 1, userId: 42, origin: 'http://localhost:5173', nonce: 'abc123' }

describe('signOAuthState / verifyOAuthState', () => {
  test('a freshly signed state verifies and round-trips the exact payload', () => {
    const token = signOAuthState(payload)
    const verified = verifyOAuthState(token)
    expect(verified).toMatchObject(payload)
    expect(typeof verified?.iat).toBe('number')
  })

  test('a tampered payload (any single byte changed) fails verification (grill N-5: HKDF-derived key, not the raw SETTINGS_ENCRYPTION_KEY)', () => {
    const token = signOAuthState(payload)
    const [body, sig] = token.split('.')
    const tamperedBody = Buffer.from(JSON.stringify({ ...payload, tenantId: 999, iat: Math.floor(Date.now() / 1000) }), 'utf8').toString('base64url')
    expect(verifyOAuthState(`${tamperedBody}.${sig}`)).toBeNull()
  })

  test('a tampered signature fails verification', () => {
    const token = signOAuthState(payload)
    const [body] = token.split('.')
    expect(verifyOAuthState(`${body}.not-a-real-signature`)).toBeNull()
  })

  test('an expired state (iat > 10 minutes old) fails verification', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-23T10:00:00Z'))
    const token = signOAuthState(payload)
    jest.setSystemTime(new Date('2026-07-23T10:10:01Z')) // 10 min 1 sec later
    expect(verifyOAuthState(token)).toBeNull()
    jest.useRealTimers()
  })

  test('a state exactly at the 10-minute boundary still verifies', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-23T10:00:00Z'))
    const token = signOAuthState(payload)
    jest.setSystemTime(new Date('2026-07-23T10:10:00Z')) // exactly 10 min later
    expect(verifyOAuthState(token)).not.toBeNull()
    jest.useRealTimers()
  })

  test('malformed input (no dot separator, garbage base64) returns null, never throws', () => {
    expect(verifyOAuthState('garbage-not-a-token')).toBeNull()
    expect(verifyOAuthState('')).toBeNull()
    expect(verifyOAuthState('a.b.c')).toBeNull()
  })
})
