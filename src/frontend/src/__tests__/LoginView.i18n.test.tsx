import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('../store/uiStore', () => ({
  useUiStore: (selector: (s: { language: string }) => unknown) =>
    selector({ language: 'th' }),
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
  useLogin: () => ({ mutate: vi.fn(), isPending: false, error: null }),
}))

import LoginView from '../views/LoginView'

describe('LoginView — Thai i18n', () => {
  it('renders Thai welcome heading', () => {
    render(<LoginView />)
    expect(screen.getByText('ยินดีต้อนรับกลับ')).toBeInTheDocument()
  })
  it('renders Thai sign-in button', () => {
    render(<LoginView />)
    expect(screen.getByRole('button', { name: /เข้าสู่ระบบ/i })).toBeInTheDocument()
  })
  it('renders Thai email label', () => {
    render(<LoginView />)
    expect(screen.getByText(/อีเมล/i)).toBeInTheDocument()
  })
})
