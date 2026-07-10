/**
 * Remember Me: Username Recall (RM-3, RM-4) — session storage simplification.
 * `setAuth` no longer branches on a `remember` flag; the auth token lives only
 * in sessionStorage. See docs/adr/0010-remember-me-username-recall-not-session-persistence.md.
 *
 * `loadPersisted()` runs at module import time, so cases that need to control
 * what's already in storage *before* import seed storage, then
 * `vi.resetModules()` + fresh `import('../authStore')` for a clean module
 * instance — the already-imported singleton must not be relied on for those.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { AuthData } from '../authStore'

const STORAGE_KEY = 'vc_auth'

const sampleAuth: AuthData = {
  token:          'jwt-token-value',
  plane:          'clinic',
  userId:         1,
  tenantId:       1,
  branchId:       1,
  roleIds:        [1],
  role:           'admin',
  permissions:    ['pets.view'],
  permSetVersion: 1,
  name:           'Alice',
  companyName:    'Acme Clinic',
  branchName:     'Main',
}

describe('authStore — sessionStorage-only persistence', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.resetModules()
  })

  it('setAuth always writes sessionStorage and never localStorage', async () => {
    const { useAuthStore } = await import('../authStore')
    useAuthStore.getState().setAuth(sampleAuth)
    expect(sessionStorage.getItem(STORAGE_KEY)).not.toBeNull()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('loadPersisted no longer reads localStorage — a value written only there is not picked up', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sampleAuth))
    const { useAuthStore } = await import('../authStore')
    expect(useAuthStore.getState().isAuthenticated()).toBe(false)
  })

  it('browser-restart simulation — clear sessionStorage, keep localStorage — results in logged-out state', async () => {
    // Simulate a legacy "remembered" token surviving in localStorage across a
    // browser restart, with sessionStorage empty (as it would be after restart).
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sampleAuth))
    sessionStorage.clear()
    const { useAuthStore } = await import('../authStore')
    expect(useAuthStore.getState().isAuthenticated()).toBe(false)
  })

  it('migration sweep — a legacy vc_auth value in localStorage is actively removed on module load', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sampleAuth))
    await import('../authStore')
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})
