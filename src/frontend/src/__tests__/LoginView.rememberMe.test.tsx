/**
 * Remember Me: Username Recall — single most-recent username prefill.
 * Supersedes the earlier multi-username "Choose a username" chooser modal
 * (RM-7/8/9). See docs/adr/0017-remember-me-single-username-prefill.md
 * (supersedes docs/adr/0010-remember-me-username-recall-not-session-persistence.md).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as rememberedUsernames from '../utils/rememberedUsernames'

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

// jsdom's default window.location.hostname is 'localhost', which LoginView's
// detection logic maps to 'dev-clinic' — seed fixtures accordingly.
const SUBDOMAIN = 'dev-clinic'

describe('LoginView — remembered-username recall (single-username prefill)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('0 remembered usernames — renders blank form, checkbox unchecked', () => {
    render(<LoginView />)
    expect(screen.getByLabelText('Username')).toHaveValue('')
    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })

  it('1 remembered username — pre-fills username, checks remember', () => {
    rememberedUsernames.upsert(SUBDOMAIN, 'alice')
    render(<LoginView />)
    expect(screen.getByLabelText('Username')).toHaveValue('alice')
    expect(screen.getByRole('checkbox')).toBeChecked()
  })

  it('2+ remembered usernames — pre-fills the most-recent, checks remember, shows no chooser modal', () => {
    rememberedUsernames.upsert(SUBDOMAIN, 'alice')
    rememberedUsernames.upsert(SUBDOMAIN, 'bob') // bob is most-recent (upsert unshifts)
    render(<LoginView />)
    expect(screen.getByLabelText('Username')).toHaveValue('bob')
    expect(screen.getByRole('checkbox')).toBeChecked()
    expect(screen.queryByText('Choose a username')).not.toBeInTheDocument()
  })

  it('user can type over the pre-filled username', async () => {
    const user = userEvent.setup()
    rememberedUsernames.upsert(SUBDOMAIN, 'alice')
    render(<LoginView />)

    const input = screen.getByLabelText('Username')
    await user.clear(input)
    await user.type(input, 'zoe')
    expect(input).toHaveValue('zoe')
  })

  it('list is filtered to the detected subdomain — an entry saved under a different subdomain is not pre-filled', () => {
    rememberedUsernames.upsert('other-clinic', 'carol')
    rememberedUsernames.upsert(SUBDOMAIN, 'alice')
    render(<LoginView />)
    expect(screen.getByLabelText('Username')).toHaveValue('alice')
  })
})
