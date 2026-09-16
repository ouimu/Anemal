/**
 * Remember Me: Username Recall (RM-5, RM-6) — useAuth.ts owns username
 * persistence (upsert/remove), LoginView.tsx owns only recall/pre-fill/popup
 * UX. See docs/superpowers/specs/2026-07-10-remember-me-username-design.md §3
 * and docs/adr/0010-remember-me-username-recall-not-session-persistence.md.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const navigateMock = vi.fn()
const postMock = vi.fn()
const getMock = vi.fn()

// Phase 8 (2026-09-10 code-quality refactor): fetchMe moved from raw fetch()
// to the shared axios client (utils/api.ts), so /auth/me is now called via
// api.get, not globalThis.fetch. getMock replaces every `globalThis.fetch =
// ...` stub below with an equivalent api.get mock — same response/rejection
// shapes translated to axios's { data } resolve / { response: { status,
// data } } | Error reject contract, same assertions throughout.
vi.mock('../utils/api', () => ({
  default: {
    post: (...args: unknown[]) => postMock(...args),
    get: (...args: unknown[]) => getMock(...args),
  },
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}))

vi.mock('../i18n', () => ({
  useT: () => (key: string) => key,
}))

const upsertMock = vi.fn()
const removeMock = vi.fn()
vi.mock('../utils/rememberedUsernames', () => ({
  upsert: (...args: unknown[]) => upsertMock(...args),
  remove: (...args: unknown[]) => removeMock(...args),
}))

const authState = {
  setAuth:            vi.fn(),
  clearAuth:          vi.fn(),
  refreshPermissions: vi.fn().mockResolvedValue({ ok: true }),
  plane: 'clinic' as const, userId: 0, tenantId: 0, roleIds: [] as number[],
  role: '', permissions: [] as string[], permSetVersion: 0,
  name: '', companyName: '', branchName: '',
}
function useAuthStoreMock<T>(selector: (s: typeof authState) => T): T {
  return selector(authState)
}
useAuthStoreMock.getState = () => authState
vi.mock('../store/authStore', () => ({
  useAuthStore: useAuthStoreMock,
}))

import { useLogin, useSwitchBranch, IdentityLoadError } from './useAuth'

const step2Response = {
  requiresBranchSelection: false as const,
  token:        'jwt-token',
  refreshToken: 'refresh-token',
  userId:       1,
  tenantId:     1,
  branchId:     1,
  role:         'staff',
  name:         'Alice',
  companyName:  'Acme Clinic',
}

const step1Response = {
  requiresBranchSelection: true as const,
  pendingToken: 'pending-token',
  branches: [{ id: 1, name: 'Main' }, { id: 2, name: 'North' }],
}

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('useLogin — remember-me username persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getMock.mockResolvedValue({
      data: { data: { userId: 1, tenantId: 1, branchId: 1, name: 'Alice', email: 'a@b.com', roleIds: [1], permissions: ['pets.view'] } },
    })
  })

  it('applyLogin calls setAuth with a single AuthData argument (no remember flag)', async () => {
    postMock.mockResolvedValueOnce({ data: { data: step2Response } })
    const { result } = renderHook(() => useLogin(), { wrapper })

    act(() => { result.current.loginMutation.mutate({ subdomain: 'dev-clinic', username: 'alice', password: 'pw', remember: true }) })

    await waitFor(() => expect(authState.setAuth).toHaveBeenCalled())
    expect(authState.setAuth.mock.calls[0]).toHaveLength(1)
    expect(authState.setAuth.mock.calls[0][0]).toMatchObject({ token: 'jwt-token' })
  })

  it('direct-login path — remember checked upserts (subdomain, username) after applyLogin resolves', async () => {
    postMock.mockResolvedValueOnce({ data: { data: step2Response } })
    const { result } = renderHook(() => useLogin(), { wrapper })

    act(() => { result.current.loginMutation.mutate({ subdomain: 'dev-clinic', username: 'alice', password: 'pw', remember: true }) })

    await waitFor(() => expect(upsertMock).toHaveBeenCalledWith('dev-clinic', 'alice'))
    expect(removeMock).not.toHaveBeenCalled()
    expect(navigateMock).toHaveBeenCalled()
  })

  it('direct-login path — remember unchecked removes (subdomain, username) after applyLogin resolves', async () => {
    postMock.mockResolvedValueOnce({ data: { data: step2Response } })
    const { result } = renderHook(() => useLogin(), { wrapper })

    act(() => { result.current.loginMutation.mutate({ subdomain: 'dev-clinic', username: 'alice', password: 'pw', remember: false }) })

    await waitFor(() => expect(removeMock).toHaveBeenCalledWith('dev-clinic', 'alice'))
    expect(upsertMock).not.toHaveBeenCalled()
  })

  it('branch-selection path — pendingUsername/pendingSubdomain stashed from loginMutation carry through to selectBranchMutation.onSuccess and drive the correct upsert/remove', async () => {
    postMock.mockResolvedValueOnce({ data: { data: step1Response } })
    const { result } = renderHook(() => useLogin(), { wrapper })

    act(() => { result.current.loginMutation.mutate({ subdomain: 'dev-clinic', username: 'bob', password: 'pw', remember: true }) })

    await waitFor(() => expect(result.current.branchSelection).not.toBeNull())

    postMock.mockResolvedValueOnce({ data: { data: step2Response } })
    await act(async () => {
      await result.current.selectBranchMutation.mutateAsync({ pendingToken: 'pending-token', branchId: 1 })
    })

    expect(upsertMock).toHaveBeenCalledWith('dev-clinic', 'bob')
    expect(removeMock).not.toHaveBeenCalled()
    expect(navigateMock).toHaveBeenCalled()
  })
})

describe('useLogin — atomic identity resolution (ADR-0024)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.removeItem('vc_auth')
    getMock.mockResolvedValue({
      data: { data: { userId: 1, tenantId: 1, branchId: 1, name: 'Alice', email: 'a@b.com', roleIds: [1], permissions: ['pets.view'] } },
    })
  })

  // T4/T3 — branch-select happy path: exactly one GET /auth/me, setAuth
  // receives permissionsLoaded: true, navigate fires only after setAuth (AC-2, AC-3)
  it('branch-select success — exactly one /auth/me call, setAuth carries permissionsLoaded: true, navigate fires after setAuth', async () => {
    postMock.mockResolvedValueOnce({ data: { data: step1Response } })
    const { result } = renderHook(() => useLogin(), { wrapper })
    act(() => { result.current.loginMutation.mutate({ subdomain: 'dev-clinic', username: 'alice', password: 'pw', remember: false }) })
    await waitFor(() => expect(result.current.branchSelection).not.toBeNull())

    postMock.mockResolvedValueOnce({ data: { data: step2Response } })
    await act(async () => {
      await result.current.selectBranchMutation.mutateAsync({ pendingToken: 'pending-token', branchId: 1 })
    })

    expect(getMock).toHaveBeenCalledTimes(1)
    expect(authState.setAuth).toHaveBeenCalledWith(expect.objectContaining({ permissionsLoaded: true }))
    const setAuthOrder  = authState.setAuth.mock.invocationCallOrder[0]
    const navigateOrder = navigateMock.mock.invocationCallOrder[0]
    expect(setAuthOrder).toBeLessThan(navigateOrder)
  })

  // T5 — the picker stays mounted (branchSelection non-null) until the mutation
  // resolves; setBranchSelection(null) never races ahead of setAuth (AC-1)
  it('branch-select success — branchSelection stays non-null until setAuth has been called', async () => {
    postMock.mockResolvedValueOnce({ data: { data: step1Response } })
    const { result } = renderHook(() => useLogin(), { wrapper })
    act(() => { result.current.loginMutation.mutate({ subdomain: 'dev-clinic', username: 'alice', password: 'pw', remember: false }) })
    await waitFor(() => expect(result.current.branchSelection).not.toBeNull())

    postMock.mockResolvedValueOnce({ data: { data: step2Response } })
    let sawBranchSelectionAtSuccessTime: BranchSelectionStateLike | null = null
    authState.setAuth.mockImplementationOnce(() => {
      sawBranchSelectionAtSuccessTime = result.current.branchSelection
    })
    await act(async () => {
      await result.current.selectBranchMutation.mutateAsync({ pendingToken: 'pending-token', branchId: 1 })
    })

    expect(sawBranchSelectionAtSuccessTime).not.toBeNull()
    expect(result.current.branchSelection).toBeNull() // cleared only after setAuth, in onSuccess
  })

  // T6 — /auth/select-branch succeeds, /auth/me fails: no setAuth, no persisted
  // session, no navigate, picker stays mounted, isError true, exactly one fetch (AC-9, AC-12)
  it.each([
    ['request rejects (network)', () => Promise.reject(new Error('network down')), true],
    ['401 response',         () => Promise.reject({ response: { status: 401, data: {} } }), true],
    ['404 response',         () => Promise.reject({ response: { status: 404, data: {} } }), true],
    ['500 response',         () => Promise.reject({ response: { status: 500, data: {} } }), true],
    // N-1: a 200 whose body isn't a JSON object must surface as
    // IdentityLoadError, not silently flow through as a MeResponse. Unlike
    // fetch().json(), axios does NOT throw on a malformed/non-JSON 200 body
    // by default — it resolves with the raw string (e.g. an HTML fallback
    // page from a misconfigured proxy). Mocking the resolved shape axios
    // actually produces, not a rejected promise, is the point: this row
    // exercises fetchMe's own `typeof json !== 'object'` guard, not the
    // catch block the other rows exercise.
    ['200 with a non-JSON-object body', () => Promise.resolve({ data: '<html>fallback page</html>' }), true],
  ])('branch-select — /auth/me %s after select-branch succeeds: no setAuth/navigate, picker survives', async (_label, getImpl, expectIdentityError) => {
    postMock.mockResolvedValueOnce({ data: { data: step1Response } })
    const { result } = renderHook(() => useLogin(), { wrapper })
    act(() => { result.current.loginMutation.mutate({ subdomain: 'dev-clinic', username: 'alice', password: 'pw', remember: false }) })
    await waitFor(() => expect(result.current.branchSelection).not.toBeNull())

    postMock.mockResolvedValueOnce({ data: { data: step2Response } })
    getMock.mockReset()
    getMock.mockImplementationOnce(getImpl)

    act(() => {
      result.current.selectBranchMutation.mutate({ pendingToken: 'pending-token', branchId: 1 })
    })
    await waitFor(() => expect(result.current.selectBranchMutation.isError).toBe(true))

    expect(authState.setAuth).not.toHaveBeenCalled()
    // F-5: NOT asserting sessionStorage.getItem('vc_auth') here — setAuth is
    // a vi.fn() mock in this describe block (line 35), so it can never write
    // to sessionStorage regardless of production behavior. That made the
    // assertion vacuous (see the real-store proof below, which is what
    // AC-12 actually needs). Delete-only per Task 6.1 — no behavior lost.
    expect(navigateMock).not.toHaveBeenCalled()
    expect(result.current.branchSelection).not.toBeNull()
    expect(getMock).toHaveBeenCalledTimes(1)
    // A non-ok response is reported as IdentityLoadError (so the UI can show a
    // specific message); a raw network throw propagates as its native error.
    expect(result.current.selectBranchMutation.error instanceof IdentityLoadError).toBe(expectIdentityError)
  })

  // T8 — re-tap retry after a T6-style failure, same pendingToken, second
  // attempt succeeds: setAuth/navigate now fire, one POST + one GET on the retry itself
  it('branch-select — retry with the same pendingToken after a failed /auth/me succeeds cleanly', async () => {
    postMock.mockResolvedValueOnce({ data: { data: step1Response } })
    const { result } = renderHook(() => useLogin(), { wrapper })
    act(() => { result.current.loginMutation.mutate({ subdomain: 'dev-clinic', username: 'alice', password: 'pw', remember: false }) })
    await waitFor(() => expect(result.current.branchSelection).not.toBeNull())

    postMock.mockResolvedValueOnce({ data: { data: step2Response } })
    getMock.mockReset()
    getMock.mockRejectedValueOnce(new Error('network down'))
    await act(async () => {
      try {
        await result.current.selectBranchMutation.mutateAsync({ pendingToken: 'pending-token', branchId: 1 })
      } catch { /* expected */ }
    })
    expect(authState.setAuth).not.toHaveBeenCalled()

    postMock.mockResolvedValueOnce({ data: { data: step2Response } })
    getMock.mockReset()
    getMock.mockResolvedValueOnce({
      data: { data: { userId: 1, tenantId: 1, branchId: 1, name: 'Alice', email: 'a@b.com', roleIds: [1], permissions: ['pets.view'] } },
    })
    await act(async () => {
      await result.current.selectBranchMutation.mutateAsync({ pendingToken: 'pending-token', branchId: 1 })
    })

    expect(authState.setAuth).toHaveBeenCalledTimes(1)
    expect(navigateMock).toHaveBeenCalled()
    expect(postMock).toHaveBeenCalledTimes(3) // login + failed select + retried select
    expect(getMock).toHaveBeenCalledTimes(1) // one /auth/me on the retry itself
  })

  // T9 — direct/admin path: success unchanged, failure surfaces an error
  // instead of stopping silently (AC-4, AC-10)
  it('direct-login success — one /auth/me call, permissionsLoaded: true, navigate fires', async () => {
    postMock.mockResolvedValueOnce({ data: { data: step2Response } })
    const { result } = renderHook(() => useLogin(), { wrapper })
    await act(async () => {
      await result.current.loginMutation.mutateAsync({ subdomain: 'dev-clinic', username: 'alice', password: 'pw', remember: false })
    })

    expect(getMock).toHaveBeenCalledTimes(1)
    expect(authState.setAuth).toHaveBeenCalledWith(expect.objectContaining({ permissionsLoaded: true }))
    expect(navigateMock).toHaveBeenCalled()
  })

  it('direct-login — /auth/me failure surfaces isError, no setAuth/navigate, and a clean re-submit retry succeeds', async () => {
    postMock.mockResolvedValueOnce({ data: { data: step2Response } })
    getMock.mockReset()
    getMock.mockRejectedValueOnce(new Error('network down'))
    const { result } = renderHook(() => useLogin(), { wrapper })

    act(() => {
      result.current.loginMutation.mutate({ subdomain: 'dev-clinic', username: 'alice', password: 'pw', remember: false })
    })
    await waitFor(() => expect(result.current.loginMutation.isError).toBe(true))

    expect(authState.setAuth).not.toHaveBeenCalled()
    expect(sessionStorage.getItem('vc_auth')).toBeNull()
    expect(navigateMock).not.toHaveBeenCalled()

    postMock.mockResolvedValueOnce({ data: { data: step2Response } })
    getMock.mockReset()
    getMock.mockResolvedValueOnce({
      data: { data: { userId: 1, tenantId: 1, branchId: 1, name: 'Alice', email: 'a@b.com', roleIds: [1], permissions: ['pets.view'] } },
    })
    await act(async () => {
      await result.current.loginMutation.mutateAsync({ subdomain: 'dev-clinic', username: 'alice', password: 'pw', remember: false })
    })
    expect(authState.setAuth).toHaveBeenCalledTimes(1)
    expect(navigateMock).toHaveBeenCalled()
  })

  // T13/T14 — /auth/me 200 with permissions: [] (legit zero-permission role)
  // still establishes the session, distinguishable from a T6-style failure (AC-13)
  it('branch-select — /auth/me 200 with permissions: [] still succeeds (not treated as a failure)', async () => {
    postMock.mockResolvedValueOnce({ data: { data: step1Response } })
    const { result } = renderHook(() => useLogin(), { wrapper })
    act(() => { result.current.loginMutation.mutate({ subdomain: 'dev-clinic', username: 'alice', password: 'pw', remember: false }) })
    await waitFor(() => expect(result.current.branchSelection).not.toBeNull())

    postMock.mockResolvedValueOnce({ data: { data: step2Response } })
    getMock.mockReset()
    getMock.mockResolvedValueOnce({
      data: { data: { userId: 1, tenantId: 1, branchId: 1, name: 'Alice', email: 'a@b.com', roleIds: [1], permissions: [] } },
    })

    await act(async () => {
      await result.current.selectBranchMutation.mutateAsync({ pendingToken: 'pending-token', branchId: 1 })
    })

    expect(authState.setAuth).toHaveBeenCalledWith(
      expect.objectContaining({ permissionsLoaded: true, permissions: [] }),
    )
    expect(navigateMock).toHaveBeenCalled()
  })
})

// Minimal shape used only to type a locally-captured branchSelection snapshot in the test above.
type BranchSelectionStateLike = { pendingToken: string; branches: { id: number; name: string }[] }

describe('useSwitchBranch — permissionsLoaded regression guard (AC-11, R-1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('setAuth is called with permissionsLoaded: true explicitly present in the payload', async () => {
    postMock.mockResolvedValueOnce({ data: { data: { token: 'new-jwt' } } })
    const { result } = renderHook(() => useSwitchBranch(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ branchId: 2, branchName: 'North' })
    })

    expect(authState.setAuth).toHaveBeenCalledWith(
      expect.objectContaining({ permissionsLoaded: true }),
    )
  })
})

// ── AC-12 real-store proof (F-5) ─────────────────────────────────────────────
// The file-level mock of '../store/authStore' (line 46) makes `setAuth` a
// vi.fn(), so no test above can observe a real sessionStorage write — that's
// exactly what made the assertion deleted from the T6 test (line ~208)
// vacuous. This block unmocks the real authStore module for one test so
// AC-12 ("failed login leaves no persisted blob") is proven against actual
// write behavior, not a mock that could never have written regardless.
describe('useLogin — AC-12 real-store proof (no mocked authStore)', () => {
  afterEach(() => {
    // Restore the file-level mock for every other test in this file.
    vi.doMock('../store/authStore', () => ({ useAuthStore: useAuthStoreMock }))
  })

  it('a failed /auth/me leaves no persisted auth blob in sessionStorage (real authStore module)', async () => {
    vi.doUnmock('../store/authStore')
    vi.resetModules()
    sessionStorage.removeItem('vc_auth')
    postMock.mockResolvedValueOnce({ data: { data: step2Response } })
    getMock.mockReset()
    getMock.mockRejectedValueOnce(new Error('network down'))

    const { useLogin: useLoginReal } = await import('./useAuth')
    const { result } = renderHook(() => useLoginReal(), { wrapper })

    act(() => {
      result.current.loginMutation.mutate({
        subdomain: 'dev-clinic', username: 'alice', password: 'pw', remember: false,
      })
    })
    await waitFor(() => expect(result.current.loginMutation.isError).toBe(true))

    expect(sessionStorage.getItem('vc_auth')).toBeNull()
  })
})

