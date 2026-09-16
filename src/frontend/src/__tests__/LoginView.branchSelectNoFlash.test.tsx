/**
 * F-3 (QA sign-off, 2026-08-19) — AC-1's actual claim: the credentials form
 * must never reappear between a branch tap and the dashboard redirect.
 *
 * The original guard in useAuth.test.ts sampled `result.current.branchSelection`
 * from inside a mocked `setAuth`, which async `act()` never flushes — QA proved
 * this vacuous by reintroducing the literal original bug (setBranchSelection(null)
 * before awaiting identity resolution) and getting a full green run.
 *
 * This test instead renders the REAL LoginView + real useLogin + real authStore
 * (only api.post/api.get are mocked — /auth/me moved from raw fetch() to the
 * shared axios client in the Phase 8 code-quality refactor, 2026-09-10) and
 * holds the /auth/me request pending so the intermediate render — the only
 * place the bug was ever observable — can be inspected directly while it's
 * still on screen, rather than sampled after the fact.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useAuthStore } from '../store/authStore'

const navigateMock = vi.fn()
const postMock = vi.fn()
const getMock = vi.fn()

vi.mock('../utils/api', () => ({
  default: {
    post: (...args: unknown[]) => postMock(...args),
    get: (...args: unknown[]) => getMock(...args),
  },
}))

vi.mock('react-router-dom', () => ({
  Navigate: () => null,
  useNavigate: () => navigateMock,
}))

import LoginView from '../views/LoginView'

const step1Response = {
  requiresBranchSelection: true as const,
  pendingToken: 'pending-token',
  branches: [{ id: 1, name: 'Main' }],
}

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

function renderLogin() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    React.createElement(QueryClientProvider, { client: queryClient }, React.createElement(LoginView)),
  )
}

async function submitCredentials() {
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'alice' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw' } })
  fireEvent.click(screen.getByRole('button', { name: /Sign In/i }))
  await screen.findByText('Main') // branch picker rendered
}

describe('LoginView — AC-1 branch-select no-flash guard (real components)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.getState().clearAuth()
    sessionStorage.clear()
    localStorage.clear()
  })

  it('the credentials form does not reappear while /auth/me is still pending after a branch tap', async () => {
    postMock.mockResolvedValueOnce({ data: { data: step1Response } })
    renderLogin()
    await submitCredentials()

    postMock.mockResolvedValueOnce({ data: { data: step2Response } })
    let resolveGet!: (v: unknown) => void
    getMock.mockReset()
    getMock.mockImplementationOnce(
      () => new Promise((resolve) => { resolveGet = resolve }),
    )

    fireEvent.click(screen.getByText('Main'))
    await waitFor(() => expect(getMock).toHaveBeenCalledTimes(1))

    // /auth/me is still pending here — this is the exact window the original
    // bug exposed. The picker must still be the thing on screen: no blank
    // credentials form, and no identity established yet.
    expect(screen.queryByLabelText('Username')).not.toBeInTheDocument()
    expect(screen.getByText('Main')).toBeInTheDocument()
    expect(useAuthStore.getState().isAuthenticated()).toBe(false)
    expect(navigateMock).not.toHaveBeenCalled()

    resolveGet({
      data: {
        data: { userId: 1, tenantId: 1, branchId: 1, name: 'Alice', email: 'a@b.com', roleIds: [1], permissions: ['pets.view'] },
      },
    })

    await waitFor(() => expect(navigateMock).toHaveBeenCalled())
    expect(useAuthStore.getState().isAuthenticated()).toBe(true)
    expect(useAuthStore.getState().permissionsLoaded).toBe(true)
  })
})
