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
  permissionsLoaded: true,
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

  it('setAuth requires permissionsLoaded at the type level and round-trips it through sessionStorage', async () => {
    const { useAuthStore } = await import('../authStore')
    useAuthStore.getState().setAuth(sampleAuth)
    expect(useAuthStore.getState().permissionsLoaded).toBe(true)
    const persisted = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '{}')
    expect(persisted.permissionsLoaded).toBe(true)
  })

  it('a persisted blob missing the permissionsLoaded key entirely restores via the permissions.length > 0 fallback', async () => {
    const legacyBlob: Partial<AuthData> = { ...sampleAuth }
    delete legacyBlob.permissionsLoaded
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(legacyBlob))
    const { useAuthStore } = await import('../authStore')
    // legacyBlob.permissions is non-empty, so the fallback computes true
    expect(useAuthStore.getState().permissionsLoaded).toBe(true)
  })

  it('a persisted blob missing the key with empty permissions falls back to false', async () => {
    const legacyBlob: Partial<AuthData> = { ...sampleAuth, permissions: [] }
    delete legacyBlob.permissionsLoaded
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(legacyBlob))
    const { useAuthStore } = await import('../authStore')
    expect(useAuthStore.getState().permissionsLoaded).toBe(false)
  })

  // F-1 regression guard: the REAL pre-fix shape. Old refreshPermissions() built
  // `next = { ...get(), ...patch }` (snapshotting the still-false in-memory flag)
  // and persisted that BEFORE the following `set({ ...patch, permissionsLoaded: true })`
  // flipped it — so every successful pre-fix login persisted permissionsLoaded:
  // false alongside a fully populated permissions array. normalise()'s fallback
  // must be an OR (a present-but-false value + non-empty permissions still
  // rescues to true), not a typeof-guard that trusts a present `false` verbatim —
  // otherwise every live pre-fix session hangs on an infinite permission-gate
  // spinner on the first reload after this ships.
  it('a pre-fix blob with permissionsLoaded: false and real permissions still restores as loaded', async () => {
    const preFixBlob: AuthData = { ...sampleAuth, permissionsLoaded: false }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(preFixBlob))
    const { useAuthStore } = await import('../authStore')
    expect(useAuthStore.getState().permissionsLoaded).toBe(true)
  })

  it('an explicit permissionsLoaded: false with empty permissions stays false (unknown, not rescued)', async () => {
    const blob: AuthData = { ...sampleAuth, permissionsLoaded: false, permissions: [] }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(blob))
    const { useAuthStore } = await import('../authStore')
    expect(useAuthStore.getState().permissionsLoaded).toBe(false)
  })
})

describe('refreshPermissions total contract (ADR-0026, C-7/C-8, F-2)', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.resetModules()
    vi.stubGlobal('fetch', vi.fn())
    delete (window as unknown as { location?: unknown }).location
    ;(window as unknown as { location: { href: string } }).location = { href: '' }
  })

  /** Seeds a fresh authStore module instance with a logged-in session. */
  async function seedLoggedIn() {
    const { useAuthStore } = await import('../authStore')
    useAuthStore.getState().setAuth(sampleAuth)
    return useAuthStore
  }

  it('1. no token -> resolves { ok: false }, no fetch call', async () => {
    const { useAuthStore } = await import('../authStore')
    // Fresh module, never logged in -> token === ''
    const result = await useAuthStore.getState().refreshPermissions()
    expect(result).toEqual({ ok: false })
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('2. fetch rejects (network throw) -> resolves { ok: false }, no unhandled rejection', async () => {
    const useAuthStore = await seedLoggedIn()
    vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('network down'))
    await expect(useAuthStore.getState().refreshPermissions()).resolves.toEqual({ ok: false })
  })

  it('3. 401 response -> resolves { ok: false }, clearAuth() called, redirect carries reason=session-expired', async () => {
    const useAuthStore = await seedLoggedIn()
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      status: 401, ok: false, json: async () => ({}),
    } as Response)
    const result = await useAuthStore.getState().refreshPermissions()
    expect(result).toEqual({ ok: false })
    expect(useAuthStore.getState().isAuthenticated()).toBe(false)
    expect(window.location.href).toContain('reason=session-expired')
  })

  it('4. non-ok (e.g. 500) -> resolves { ok: false }, permissionsLoaded/permissions unchanged', async () => {
    const useAuthStore = await seedLoggedIn()
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      status: 500, ok: false, json: async () => ({}),
    } as Response)
    const before = useAuthStore.getState()
    const result = await useAuthStore.getState().refreshPermissions()
    expect(result).toEqual({ ok: false })
    expect(useAuthStore.getState().permissionsLoaded).toBe(before.permissionsLoaded)
    expect(useAuthStore.getState().permissions).toEqual(before.permissions)
  })

  it('5. 200 with a well-formed body -> resolves { ok: true }, permissionsLoaded: true', async () => {
    const useAuthStore = await seedLoggedIn()
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      status: 200, ok: true,
      json: async () => ({ data: { permissions: ['a.view', 'b.view'], roleIds: [2], permSetVersion: 3 } }),
    } as Response)
    const result = await useAuthStore.getState().refreshPermissions()
    expect(result).toEqual({ ok: true })
    expect(useAuthStore.getState().permissionsLoaded).toBe(true)
    expect(useAuthStore.getState().permissions).toEqual(['a.view', 'b.view'])
  })

  it('6. F-2: 200 with permissions missing/non-array -> resolves { ok: false }, permissionsLoaded/permissions unchanged (not flipped to [])', async () => {
    const useAuthStore = await seedLoggedIn()
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      status: 200, ok: true,
      json: async () => ({ data: { permissions: 'not-an-array' } }),
    } as Response)
    const before = useAuthStore.getState()
    const result = await useAuthStore.getState().refreshPermissions()
    expect(result).toEqual({ ok: false })
    expect(useAuthStore.getState().permissionsLoaded).toBe(before.permissionsLoaded)
    expect(useAuthStore.getState().permissions).toEqual(before.permissions)
  })

  // AUTH-INV-PERM-01: a failed refresh must never fabricate "authoritatively
  // none" out of "could not tell" — re-run across the failing exits above.
  it('AUTH-INV-PERM-01: a 401 leaves permissionsLoaded/permissions untouched before clearAuth resets them, not fabricated to []/true', async () => {
    const useAuthStore = await seedLoggedIn()
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      status: 401, ok: false, json: async () => ({}),
    } as Response)
    await useAuthStore.getState().refreshPermissions()
    // clearAuth() resets permissionsLoaded to false (logged-out state) — it
    // must NOT be true with a manufactured empty permissions array.
    expect(useAuthStore.getState().permissionsLoaded).toBe(false)
  })
})
