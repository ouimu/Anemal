/**
 * AUTH-401-04 (ADR-0026 decision 7) — the `?reason=` allow-list.
 *
 * A recognised reason renders its own copy; an unrecognised reason renders
 * no banner AND never reflects the raw query value into the DOM. The naive
 * fix (a boolean `=== 'idle'` check, which is what shipped before this ADR)
 * happens to also satisfy "no banner for an unknown reason" — so the
 * load-bearing half of this file is the DOM-reflection check, which only a
 * real allow-list lookup (not string interpolation of the raw param)
 * satisfies.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

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

vi.mock('../hooks/useAuth', () => ({
  useLogin: () => ({
    branchSelection: null,
    loginMutation: { mutate: vi.fn(), isPending: false, error: null },
    selectBranchMutation: { mutate: vi.fn(), isPending: false, isError: false },
    resetBranchSelection: vi.fn(),
  }),
}))

import LoginView from '../views/LoginView'

describe('LoginView — ?reason= allow-list (AUTH-401-04)', () => {
  it('renders the session-expired banner for ?reason=session-expired', () => {
    window.history.pushState({}, '', '/login?reason=session-expired')
    render(<LoginView />)
    expect(screen.getByText(/session has ended/i)).toBeInTheDocument()
  })

  it('renders no banner for an unrecognised ?reason= value, and never reflects the raw value into the DOM', () => {
    window.history.pushState({}, '', '/login?reason=bogus-value')
    render(<LoginView />)
    expect(screen.queryByText(/bogus-value/i)).toBeNull()
  })

  it('renders no banner when ?reason= is absent entirely', () => {
    window.history.pushState({}, '', '/login')
    render(<LoginView />)
    expect(screen.queryByText(/session has ended/i)).toBeNull()
    expect(screen.queryByText(/logged out due to inactivity/i)).toBeNull()
  })
})
