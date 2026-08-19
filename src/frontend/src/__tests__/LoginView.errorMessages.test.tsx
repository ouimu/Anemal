/**
 * Branch-Select Login Flash fix (ADR-0024) — the picker error box and the
 * direct-form error message must show a distinct string when the mutation
 * failed to resolve identity (IdentityLoadError) versus any other failure.
 * See docs/superpowers/plans/2026-08-19-branch-select-login-flash.md T16/T17.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { IdentityLoadError } from '../hooks/useAuth'

vi.mock('../store/uiStore', () => ({
  useUiStore: (selector: (s: { language: string }) => unknown) =>
    selector({ language: 'en' }),
}))

vi.mock('../store/authStore', () => ({
  useAuthStore: (selector: (s: { isAuthenticated: () => boolean; role: string }) => unknown) =>
    selector({ isAuthenticated: () => false, role: '' }),
}))

vi.mock('react-router-dom', () => ({
  Navigate: () => null,
  useNavigate: () => vi.fn(),
}))

const branches = [{ id: 1, name: 'Main' }, { id: 2, name: 'North' }]

const loginState: {
  branchSelection: { pendingToken: string; branches: typeof branches } | null
  loginError: unknown
  selectBranchError: unknown
  selectBranchIsError: boolean
} = {
  branchSelection: null,
  loginError: null,
  selectBranchError: null,
  selectBranchIsError: false,
}

vi.mock('../hooks/useAuth', async () => {
  const actual = await vi.importActual<typeof import('../hooks/useAuth')>('../hooks/useAuth')
  return {
    ...actual,
    useLogin: () => ({
      branchSelection: loginState.branchSelection,
      loginMutation: { mutate: vi.fn(), isPending: false, error: loginState.loginError },
      selectBranchMutation: {
        mutate: vi.fn(),
        isPending: false,
        isError: loginState.selectBranchIsError,
        error: loginState.selectBranchError,
      },
      resetBranchSelection: vi.fn(),
    }),
  }
})

import LoginView from '../views/LoginView'

describe('LoginView — error message branching (IdentityLoadError vs other)', () => {
  beforeEach(() => {
    loginState.branchSelection = null
    loginState.loginError = null
    loginState.selectBranchError = null
    loginState.selectBranchIsError = false
  })

  it('picker error box shows the identity-specific message when selectBranchMutation.error is an IdentityLoadError', () => {
    loginState.branchSelection = { pendingToken: 'p', branches }
    loginState.selectBranchIsError = true
    loginState.selectBranchError = new IdentityLoadError('boom')

    render(<LoginView />)
    expect(screen.getByText('Could not load your permissions. Please try again.')).toBeInTheDocument()
    expect(screen.queryByText('Could not select branch. Please try again.')).not.toBeInTheDocument()
  })

  it('picker error box shows the generic message when selectBranchMutation.error is a plain/axios error', () => {
    loginState.branchSelection = { pendingToken: 'p', branches }
    loginState.selectBranchIsError = true
    loginState.selectBranchError = new Error('server 500')

    render(<LoginView />)
    expect(screen.getByText('Could not select branch. Please try again.')).toBeInTheDocument()
    expect(screen.queryByText('Could not load your permissions. Please try again.')).not.toBeInTheDocument()
  })

  it('direct-form errorMsg shows the identity-specific message when loginMutation.error is an IdentityLoadError', () => {
    loginState.loginError = new IdentityLoadError('boom')

    render(<LoginView />)
    expect(screen.getByText('Could not load your permissions. Please try again.')).toBeInTheDocument()
  })

  it('direct-form errorMsg falls back to invalidCredentials for a plain error without a server message', () => {
    loginState.loginError = new Error('boom')

    render(<LoginView />)
    expect(screen.getByText('Invalid credentials. Please try again.')).toBeInTheDocument()
  })
})
