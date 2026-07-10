/**
 * Remember Me: Username Recall (RM-7, RM-8, RM-9) — recall-on-mount,
 * RememberedUsersModal popup, and dismiss-on-type. Kept separate from
 * LoginView.i18n.test.tsx per the plan's file-split convention.
 * See docs/superpowers/specs/2026-07-10-remember-me-username-design.md
 * and docs/adr/0010-remember-me-username-recall-not-session-persistence.md.
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

describe('LoginView — remembered-username recall (RM-7, RM-8, RM-9)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('0 remembered usernames — renders blank form, checkbox unchecked, no popup', () => {
    render(<LoginView />)
    expect(screen.getByLabelText('Username')).toHaveValue('')
    expect(screen.getByRole('checkbox')).not.toBeChecked()
    expect(screen.queryByText('Choose a username')).not.toBeInTheDocument()
  })

  it('1 remembered username — pre-fills username, checks remember, no popup', () => {
    rememberedUsernames.upsert(SUBDOMAIN, 'alice')
    render(<LoginView />)
    expect(screen.getByLabelText('Username')).toHaveValue('alice')
    expect(screen.getByRole('checkbox')).toBeChecked()
    expect(screen.queryByText('Choose a username')).not.toBeInTheDocument()
  })

  it('2+ remembered usernames — popup renders, form stays blank until a pick is made', () => {
    rememberedUsernames.upsert(SUBDOMAIN, 'alice')
    rememberedUsernames.upsert(SUBDOMAIN, 'bob')
    render(<LoginView />)
    expect(screen.getByText('Choose a username')).toBeInTheDocument()
    expect(screen.getByLabelText('Username')).toHaveValue('')
  })

  it('2+ remembered — popup lists all entries most-recent-first', () => {
    rememberedUsernames.upsert(SUBDOMAIN, 'alice')
    rememberedUsernames.upsert(SUBDOMAIN, 'bob')
    rememberedUsernames.upsert(SUBDOMAIN, 'carol')
    render(<LoginView />)
    const rows = screen.getAllByRole('button', { name: /^(alice|bob|carol)$/ })
    expect(rows.map(r => r.textContent)).toEqual(['carol', 'bob', 'alice'])
  })

  it('clicking a popup row fills username, checks remember, closes popup, focuses password field', async () => {
    const user = userEvent.setup()
    rememberedUsernames.upsert(SUBDOMAIN, 'alice')
    rememberedUsernames.upsert(SUBDOMAIN, 'bob')
    render(<LoginView />)

    await user.click(screen.getByRole('button', { name: 'bob' }))

    expect(screen.getByLabelText('Username')).toHaveValue('bob')
    expect(screen.getByRole('checkbox')).toBeChecked()
    expect(screen.queryByText('Choose a username')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toHaveFocus()
  })

  it('X on a popup row removes just that entry and keeps the popup open with the remaining entries', async () => {
    const user = userEvent.setup()
    rememberedUsernames.upsert(SUBDOMAIN, 'alice')
    rememberedUsernames.upsert(SUBDOMAIN, 'bob')
    render(<LoginView />)

    await user.click(screen.getByRole('button', { name: /forget this username: bob/i }))

    expect(screen.getByText('Choose a username')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'bob' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'alice' })).toBeInTheDocument()
    expect(rememberedUsernames.list(SUBDOMAIN).map(e => e.username)).toEqual(['alice'])
  })

  it('dismissing the popup via backdrop or the close button falls back to blank form; user can still type an arbitrary username', async () => {
    const user = userEvent.setup()
    rememberedUsernames.upsert(SUBDOMAIN, 'alice')
    rememberedUsernames.upsert(SUBDOMAIN, 'bob')
    render(<LoginView />)

    await user.click(screen.getByRole('button', { name: 'Close' }))

    expect(screen.queryByText('Choose a username')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Username')).toHaveValue('')

    await user.type(screen.getByLabelText('Username'), 'zoe')
    expect(screen.getByLabelText('Username')).toHaveValue('zoe')
  })

  it('typing directly into the username field while the popup is open dismisses the popup and the keystroke is not lost', async () => {
    const user = userEvent.setup()
    rememberedUsernames.upsert(SUBDOMAIN, 'alice')
    rememberedUsernames.upsert(SUBDOMAIN, 'bob')
    render(<LoginView />)

    expect(screen.getByText('Choose a username')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Username'), 'z')

    expect(screen.queryByText('Choose a username')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Username')).toHaveValue('z')
  })

  it('list is filtered to the detected subdomain — a remembered entry saved under a different subdomain is neither pre-filled nor shown in the popup', () => {
    rememberedUsernames.upsert('other-clinic', 'carol')
    rememberedUsernames.upsert(SUBDOMAIN, 'alice')
    rememberedUsernames.upsert(SUBDOMAIN, 'bob')
    render(<LoginView />)

    expect(screen.getByText('Choose a username')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'carol' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'alice' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'bob' })).toBeInTheDocument()
  })
})
