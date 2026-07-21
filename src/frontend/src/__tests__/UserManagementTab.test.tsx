/**
 * UserManagementTab — admin-reset-password field, primary-admin lock,
 * row Deactivate/Restore actions, and the unified RBAC-backed role listbox
 * (Plan B, docs/superpowers/plans/2026-07-20-unify-user-role-assignment-plan-b-frontend.md).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const api = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn(),
}))
vi.mock('../utils/api', () => ({ default: api }))

const state = vi.hoisted(() => ({
  userId: 1,
  permissions: ['staff.manage', 'staff.assign_role', 'emr.edit', 'billing.view'],
}))
vi.mock('../store/authStore', () => ({
  useAuthStore: (selector: (s: {
    userId: number; branchId: number | null; permissions: string[]; hasPermission: (p: string) => boolean
  }) => unknown) =>
    selector({
      userId: state.userId,
      branchId: null,
      permissions: state.permissions,
      hasPermission: (p: string) => state.permissions.includes(p),
    }),
}))

vi.mock('../i18n', async () => {
  const actual = await vi.importActual<typeof import('../i18n')>('../i18n')
  return { useT: () => (key: string) => actual.en[key] ?? key }
})

import UserManagementTab from '../views/admin/UserManagementTab'

const ADMIN_ROLE      = { id: 1, name: 'Admin',      key: 'clinic_admin',           isSystem: true,  permissions: ['staff.manage', 'staff.assign_role'], assignedUserCount: 2 }
const DOCTOR_ROLE     = { id: 2, name: 'Doctor',     key: 'doctor',                 isSystem: true,  permissions: ['emr.edit'], assignedUserCount: 1 }
const ACCOUNTANT_ROLE = { id: 3, name: 'Accountant', key: 'tenant_1_accountant',    isSystem: false, permissions: ['billing.view'], assignedUserCount: 1 }
const ROLES = [ADMIN_ROLE, DOCTOR_ROLE, ACCOUNTANT_ROLE]

const ADMIN          = { id: 1, name: 'Primary Admin', username: 'admin',  email: null, role: { id: 1, name: 'Admin', key: 'clinic_admin', isSystem: true }, isPrimaryAdmin: true,  isActive: true,  createdAt: '2026-01-01T00:00:00.000Z', branchId: null }
const SECOND_ADMIN    = { id: 2, name: 'Second Admin', username: 'admin2', email: null, role: { id: 1, name: 'Admin', key: 'clinic_admin', isSystem: true }, isPrimaryAdmin: false, isActive: true,  createdAt: '2026-01-02T00:00:00.000Z', branchId: null }
const STAFF           = { id: 3, name: 'Staff One',    username: 'staff1', email: null, role: { id: 3, name: 'Accountant', key: 'tenant_1_accountant', isSystem: false }, isPrimaryAdmin: false, isActive: true,  createdAt: '2026-01-03T00:00:00.000Z', branchId: null }
const INACTIVE_STAFF  = { id: 4, name: 'Staff Two',    username: 'staff2', email: null, role: { id: 2, name: 'Doctor', key: 'doctor', isSystem: true }, isPrimaryAdmin: false, isActive: false, createdAt: '2026-01-04T00:00:00.000Z', branchId: null }

function renderTab() {
  const qc = new QueryClient()
  return render(<QueryClientProvider client={qc}><UserManagementTab /></QueryClientProvider>)
}

beforeEach(() => {
  vi.resetAllMocks()
  state.userId = 1
  state.permissions = ['staff.manage', 'staff.assign_role', 'emr.edit', 'billing.view']
  api.get.mockImplementation((url: string) => {
    if (url === '/users') return Promise.resolve({ data: { data: [ADMIN, SECOND_ADMIN, STAFF, INACTIVE_STAFF] } })
    if (url === '/api/branches') return Promise.resolve({ data: { data: [] } })
    if (url === '/clinic/roles') return Promise.resolve({ data: { data: ROLES } })
    if (/\/users\/\d+\/branches/.test(url)) return Promise.resolve({ data: { data: [] } })
    return Promise.resolve({ data: { data: [] } })
  })
})

describe('UserManagementTab — unified role listbox (Bug fix + CORR-3)', () => {
  it('shows a cloned custom role in the Edit User listbox (reported-bug regression)', async () => {
    renderTab()
    const editButtons = await screen.findAllByRole('button', { name: 'Edit' })
    fireEvent.click(editButtons[2]) // STAFF (Accountant, custom role)
    await waitFor(() => {
      expect(screen.getByText('Accountant')).toBeInTheDocument()
    })
  })

  it('hides the Admin option when creating a new user', async () => {
    renderTab()
    fireEvent.click(await screen.findByRole('button', { name: /add user/i }))
    await waitFor(() => {
      const listbox = screen.getByLabelText(/role/i)
      expect(listbox.textContent).not.toMatch(/Admin/)
    })
  })

  it('does not render the old separate Roles section anywhere', async () => {
    renderTab()
    const editButtons = await screen.findAllByRole('button', { name: 'Edit' })
    fireEvent.click(editButtons[0])
    expect(screen.queryByText('Effective permissions are the union of all assigned roles.')).toBeNull()
  })

  it('renders the primary-admin lock icon from the server isPrimaryAdmin flag, not a local role comparison', async () => {
    renderTab()
    await screen.findAllByRole('button', { name: 'Edit' })
    expect(screen.getByLabelText('Primary admin — cannot be deactivated')).toBeInTheDocument()
  })

  // Regression: a real clinic_admin intentionally lacks clinical-only codes
  // (emr.create, vaccination.create), so a strict-subset isGrantable would
  // hide the Doctor/Staff roles from them entirely — breaking the core admin
  // workflow. The listbox must mirror the backend roles.manage exemption
  // (assertNoRoleEscalation / BA CORR-3 anti-drift).
  it('lists a role whose permissions the caller lacks, when the caller holds roles.manage (mirrors backend exemption)', async () => {
    // clinic_admin-like caller: manages roles but does NOT hold Doctor's emr.edit
    state.permissions = ['staff.manage', 'staff.assign_role', 'roles.manage']
    renderTab()
    const editButtons = await screen.findAllByRole('button', { name: 'Edit' })
    fireEvent.click(editButtons[1]) // SECOND_ADMIN (non-self, non-new)
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Doctor' })).toBeInTheDocument()
    })
  })
})

describe('UserManagementTab — role listbox permission gating (CORR-3)', () => {
  it('disables the role listbox for a caller without staff.assign_role', async () => {
    state.permissions = ['staff.manage']
    renderTab()
    const editButtons = await screen.findAllByRole('button', { name: 'Edit' })
    fireEvent.click(editButtons[1])
    await waitFor(() => {
      const listbox = screen.queryByLabelText(/role/i) as HTMLSelectElement | null
      expect(listbox === null || listbox.disabled).toBe(true)
    })
  })
})

describe('Admin reset-password field', () => {
  it('renders in edit mode for a non-self user, calls PATCH /users/:id/password, shows success', async () => {
    renderTab()
    fireEvent.click(await screen.findAllByRole('button', { name: 'Edit' }).then(btns => btns[1])) // SECOND_ADMIN row
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
    expect(screen.getByText(/My Preferences/i)).toBeInTheDocument()
  })
})

describe('Security card — idle timeout (moved from Appointment Settings)', () => {
  const SETTINGS = {
    defaultSlotMinutes: 30, workStartTime: '08:00', workEndTime: '18:00',
    smsRemindersEnabled: true, lineRemindersEnabled: true, idleTimeoutMinutes: 15,
    tenant: { name: 'Dev Clinic', subdomain: 'dev-clinic' },
  }

  function mockWithSettings() {
    api.get.mockImplementation((url: string) => {
      if (url === '/users') return Promise.resolve({ data: { data: [ADMIN, STAFF] } })
      if (url === '/admin/settings') return Promise.resolve({ data: { data: SETTINGS } })
      if (url === '/api/branches') return Promise.resolve({ data: { data: [] } })
      if (url === '/clinic/roles') return Promise.resolve({ data: { data: ROLES } })
      return Promise.resolve({ data: { data: [] } })
    })
  }

  it('renders the idle-timeout input with the loaded value when the user has clinic.profile.edit', async () => {
    state.permissions = ['staff.manage', 'clinic.profile.edit']
    mockWithSettings()
    renderTab()
    expect(await screen.findByLabelText(/idle timeout/i)).toHaveValue(15)
  })

  it('saves the updated idle-timeout via PUT /admin/settings', async () => {
    state.permissions = ['staff.manage', 'clinic.profile.edit']
    api.put.mockResolvedValue({ data: {} })
    mockWithSettings()
    renderTab()
    const input = await screen.findByLabelText(/idle timeout/i)
    fireEvent.change(input, { target: { value: '45' } })
    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/admin/settings', { idleTimeoutMinutes: 45 }))
  })

  it('surfaces the server error on a failed save instead of failing silently', async () => {
    state.permissions = ['staff.manage', 'clinic.profile.edit']
    api.put.mockRejectedValue({ response: { data: { error: 'Idle timeout must be between 5 and 120' } } })
    mockWithSettings()
    renderTab()
    const input = await screen.findByLabelText(/idle timeout/i)
    fireEvent.change(input, { target: { value: '45' } })
    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }))
    await waitFor(() => expect(screen.getByText(/between 5 and 120/i)).toBeInTheDocument())
  })

  it('is hidden without clinic.profile.edit', async () => {
    state.permissions = ['staff.manage']
    mockWithSettings()
    renderTab()
    await screen.findByText('Staff One')
    expect(screen.queryByLabelText(/idle timeout/i)).not.toBeInTheDocument()
  })
})

describe('Primary-admin lock on Active-account checkbox', () => {
  it('disables the Active-account checkbox with a lock note when editing the primary admin', async () => {
    renderTab()
    const editButtons = await screen.findAllByRole('button', { name: 'Edit' })
    fireEvent.click(editButtons[0]) // ADMIN (id=1) is the server-flagged primary admin
    const checkbox = screen.getByLabelText(/Active account/i) as HTMLInputElement
    expect(checkbox).toBeDisabled()
    expect(screen.getByText(/Primary admin — cannot be deactivated/i)).toBeInTheDocument()
  })

  it('leaves the checkbox enabled for a second admin (non-primary)', async () => {
    renderTab()
    const editButtons = await screen.findAllByRole('button', { name: 'Edit' })
    fireEvent.click(editButtons[1]) // SECOND_ADMIN (id=2)
    const checkbox = screen.getByLabelText(/Active account/i) as HTMLInputElement
    expect(checkbox).not.toBeDisabled()
    expect(screen.queryByText(/Primary admin — cannot be deactivated/i)).not.toBeInTheDocument()
  })

  it('surfaces the real server error via describeSaveError if the backend 403s anyway (stale client)', async () => {
    renderTab()
    const editButtons = await screen.findAllByRole('button', { name: 'Edit' })
    fireEvent.click(editButtons[1])
    api.put.mockRejectedValue({ response: { data: { error: 'Cannot deactivate the primary clinic admin' } } })
    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }))
    await waitFor(() => expect(screen.getByText(/Cannot deactivate the primary clinic admin/i)).toBeInTheDocument())
  })
})

describe('Row-level Deactivate/Restore', () => {
  it('shows a Deactivate button on active, non-primary-admin rows; confirming calls DELETE', async () => {
    api.delete.mockResolvedValue({ status: 200 })
    renderTab()
    const secondAdminDeactivate = await screen.findAllByRole('button', { name: /^Deactivate$/i })
    expect(secondAdminDeactivate.length).toBeGreaterThan(0)

    fireEvent.click(secondAdminDeactivate[0])
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/Second Admin/)).toBeInTheDocument()
    expect(within(dialog).getByText(/You can restore them later/i)).toBeInTheDocument()
    expect(api.delete).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Deactivate' }))
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/users/2'))
  })

  it('shows a disabled lock icon instead of Deactivate on the primary-admin row, and it fires no request', async () => {
    renderTab()
    await screen.findAllByRole('button', { name: 'Edit' })
    // Only SECOND_ADMIN + STAFF are active, non-primary-admin rows.
    const deactivateButtons = screen.getAllByRole('button', { name: /^Deactivate$/i })
    expect(deactivateButtons).toHaveLength(2)
    const lockIcon = screen.getByLabelText(/Primary admin — cannot be deactivated/i)
    fireEvent.click(lockIcon)
    expect(api.delete).not.toHaveBeenCalled()
  })

  it('Restore calls PUT /users/:id {isActive:true} directly, no confirm dialog', async () => {
    api.put.mockResolvedValue({ status: 200 })
    renderTab()
    const restoreButton = await screen.findByRole('button', { name: 'Restore' })
    fireEvent.click(restoreButton)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/users/4', { isActive: true }))
  })

  it('surfaces a server error via describeSaveError if Deactivate 403s (stale client)', async () => {
    api.delete.mockRejectedValue({ response: { data: { error: 'Cannot deactivate the primary clinic admin' } } })
    renderTab()
    const deactivateButtons = await screen.findAllByRole('button', { name: /^Deactivate$/i })
    fireEvent.click(deactivateButtons[0])
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Deactivate' }))
    await waitFor(() => expect(screen.getByText(/Cannot deactivate the primary clinic admin/i)).toBeInTheDocument())
  })

  it('does not render Deactivate/Restore actions without staff.manage', async () => {
    state.permissions = []
    renderTab()
    await screen.findByText('Second Admin')
    expect(screen.queryByRole('button', { name: /^Deactivate$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Restore' })).not.toBeInTheDocument()
  })

  it('surfaces a server error via describeSaveError if Restore fails (e.g. seat quota)', async () => {
    api.put.mockRejectedValue({ response: { data: { error: 'Quota exceeded for users' } } })
    renderTab()
    const restoreButton = await screen.findByRole('button', { name: 'Restore' })
    fireEvent.click(restoreButton)
    await waitFor(() => expect(screen.getByText(/Quota exceeded for users/i)).toBeInTheDocument())
  })
})
