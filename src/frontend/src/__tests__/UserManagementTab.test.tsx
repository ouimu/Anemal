/**
 * UserManagementTab — admin-reset-password field (Task 7), primary-admin lock
 * (Task 8), and row Deactivate/Restore actions (Task 9). One shared test file,
 * grown task-by-task per docs/superpowers/plans/2026-07-15-clinic-password-ui-and-user-management.md.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const api = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn(),
}))
vi.mock('../utils/api', () => ({ default: api }))

const state = vi.hoisted(() => ({ userId: 1, permissions: ['staff.manage', 'staff.assign_role'] }))
vi.mock('../store/authStore', () => ({
  useAuthStore: (selector: (s: { userId: number; hasPermission: (p: string) => boolean }) => unknown) =>
    selector({ userId: state.userId, hasPermission: (p: string) => state.permissions.includes(p) }),
}))

vi.mock('../hooks/useUserRoles', () => ({ useUserRolesQuery: () => ({ data: [], refetch: vi.fn() }) }))
vi.mock('../components/roles/RolePicker', () => ({ default: () => null }))
vi.mock('../i18n', async () => {
  const actual = await vi.importActual<typeof import('../i18n')>('../i18n')
  return { useT: () => (key: string) => actual.en[key] ?? key }
})

import UserManagementTab from '../views/admin/UserManagementTab'

const ADMIN = { id: 1, name: 'Primary Admin', username: 'admin', email: null, role: 'admin', isActive: true, createdAt: '2026-01-01T00:00:00.000Z', branchId: null }
const SECOND_ADMIN = { id: 2, name: 'Second Admin', username: 'admin2', email: null, role: 'admin', isActive: true, createdAt: '2026-01-02T00:00:00.000Z', branchId: null }
const STAFF = { id: 3, name: 'Staff One', username: 'staff1', email: null, role: 'staff', isActive: true, createdAt: '2026-01-03T00:00:00.000Z', branchId: null }
const INACTIVE_STAFF = { id: 4, name: 'Staff Two', username: 'staff2', email: null, role: 'staff', isActive: false, createdAt: '2026-01-04T00:00:00.000Z', branchId: null }

function renderTab() {
  const qc = new QueryClient()
  return render(<QueryClientProvider client={qc}><UserManagementTab /></QueryClientProvider>)
}

beforeEach(() => {
  vi.resetAllMocks()
  state.userId = 1
  state.permissions = ['staff.manage', 'staff.assign_role']
  api.get.mockImplementation((url: string) => {
    if (url === '/users') return Promise.resolve({ data: { data: [ADMIN, SECOND_ADMIN, STAFF, INACTIVE_STAFF] } })
    if (url === '/api/branches') return Promise.resolve({ data: { data: [] } })
    if (/\/users\/\d+\/branches/.test(url)) return Promise.resolve({ data: { data: [] } })
    return Promise.resolve({ data: { data: [] } })
  })
})

describe('Admin reset-password field (Task 7)', () => {
  it('renders in edit mode for a non-self user, calls PATCH /users/:id/password, shows success', async () => {
    renderTab()
    fireEvent.click(await screen.findAllByRole('button', { name: 'Edit' }).then(btns => btns[1])) // SECOND_ADMIN row (2nd active row)
    expect(screen.getByLabelText(/Reset password/i)).toBeInTheDocument()

    api.patch.mockResolvedValue({ status: 204 })
    fireEvent.change(screen.getByLabelText(/Reset password/i), { target: { value: 'BrandNewPass1!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }))

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/users/2/password', { newPassword: 'BrandNewPass1!' }))
    await waitFor(() => expect(screen.getByText(/Password reset\./i)).toBeInTheDocument())
  })

  it('is absent from the create form', async () => {
    renderTab()
    fireEvent.click(await screen.findByRole('button', { name: /Add user/i }))
    expect(screen.queryByLabelText(/Reset password/i)).not.toBeInTheDocument()
  })

  it('does not render when staff.manage is absent', async () => {
    state.permissions = []
    renderTab()
    const editButtons = await screen.findAllByRole('button', { name: 'Edit' }).catch(() => [])
    // Without staff.manage the row action area itself is gated (existing <Can>
    // pattern); if any Edit-equivalent surface remains reachable, the
    // reset-password field still must not appear.
    if (editButtons.length > 0) {
      fireEvent.click(editButtons[0])
      expect(screen.queryByLabelText(/Reset password/i)).not.toBeInTheDocument()
    } else {
      expect(editButtons).toHaveLength(0)
    }
  })

  it('shows the real server error on a 422 instead of a generic message', async () => {
    renderTab()
    const editButtons = await screen.findAllByRole('button', { name: 'Edit' })
    fireEvent.click(editButtons[1])
    api.patch.mockRejectedValue({ response: { data: { error: 'Password must be at least 8 characters' } } })
    fireEvent.change(screen.getByLabelText(/Reset password/i), { target: { value: 'short' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }))
    await waitFor(() => expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument())
  })

  it('hides the field for the primary admin editing their own row, shows a Preferences pointer instead', async () => {
    state.userId = 1 // matches ADMIN.id — self
    renderTab()
    const editButtons = await screen.findAllByRole('button', { name: 'Edit' })
    fireEvent.click(editButtons[0]) // ADMIN's own row
    expect(screen.queryByLabelText(/Reset password/i)).not.toBeInTheDocument()
    expect(screen.getByText(/Settings → Preferences/i)).toBeInTheDocument()
  })
})
