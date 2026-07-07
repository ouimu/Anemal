/**
 * BUG-010 regression: setAuth must map the REAL backend wire shape
 * { token, refreshToken, user: { id, name, email, role } } into the flat
 * store fields (platformUserId, role, name) — the previous flat-payload
 * assumption never matched what POST /platform/auth/login actually returns,
 * so avatar/name in PlatformLayout silently rendered blank.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { usePlatformAuthStore } from '../platformAuthStore'

describe('platformAuthStore.setAuth — nested user mapping (BUG-010)', () => {
  beforeEach(() => {
    usePlatformAuthStore.getState().clearAuth()
  })

  it('populates platformUserId/role/name from the real nested wire shape', () => {
    usePlatformAuthStore.getState().setAuth({
      token: 'jwt-token-value',
      refreshToken: 'refresh-token-value',
      user: { id: 7, name: 'Ada Lovelace', email: 'ada@example.com', role: 'platform_super_admin' },
    })
    const state = usePlatformAuthStore.getState()
    expect(state.token).toBe('jwt-token-value')
    expect(state.platformUserId).toBe(7)
    expect(state.role).toBe('platform_super_admin')
    expect(state.name).toBe('Ada Lovelace')
    expect(state.plane).toBe('platform')
  })

  it('does not persist refreshToken into store state (no silent-refresh interceptor this batch)', () => {
    usePlatformAuthStore.getState().setAuth({
      token: 't', refreshToken: 'r',
      user: { id: 1, name: 'X', email: 'x@example.com', role: 'platform_support' },
    })
    expect(usePlatformAuthStore.getState()).not.toHaveProperty('refreshToken')
  })
})
