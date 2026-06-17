import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('../store/uiStore', () => ({
  useUiStore: (s: (s: { language: string }) => unknown) => s({ language: 'th' }),
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: [], isLoading: false }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('../store/authStore', () => ({
  useAuthStore: (s: (s: { token: string; permissions: string[] }) => unknown) =>
    s({ token: 'tok', permissions: ['staff.view', 'staff.manage'] }),
}))

import AdminUsers from '../views/admin/AdminUsers'

describe('AdminUsers — Thai i18n', () => {
  it('renders Thai add user button', () => {
    render(<AdminUsers />)
    expect(screen.getByRole('button', { name: /เพิ่มผู้ใช้/i })).toBeInTheDocument()
  })
  it('renders Thai users & roles heading', () => {
    render(<AdminUsers />)
    expect(screen.getByText(/ผู้ใช้และบทบาท/i)).toBeInTheDocument()
  })
})
