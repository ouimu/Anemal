/**
 * Remember Me: Username Recall (RM-5, RM-6) — useAuth.ts owns username
 * persistence (upsert/remove), LoginView.tsx owns only recall/pre-fill/popup
 * UX. See docs/superpowers/specs/2026-07-10-remember-me-username-design.md §3
 * and docs/adr/0010-remember-me-username-recall-not-session-persistence.md.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const navigateMock = vi.fn()
const postMock = vi.fn()

vi.mock('../utils/api', () => ({
  default: { post: (...args: unknown[]) => postMock(...args) },
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
  refreshPermissions: vi.fn().mockResolvedValue(undefined),
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

import { useLogin } from './useAuth'

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
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { userId: 1, tenantId: 1, branchId: 1, name: 'Alice', email: 'a@b.com', roleIds: [1], permissions: ['pets.view'] } }),
    }) as unknown as typeof fetch
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
