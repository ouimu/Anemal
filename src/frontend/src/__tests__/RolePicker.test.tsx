/**
 * T-5F-03 — RolePicker (Multi-Role Assignment UI) unit tests (@qa-agent)
 *
 * Strategy: mock useUserRoles hooks (network) + authStore (identity/permissions),
 * then drive the REAL RolePicker component tree. Mirrors the mocking approach in
 * RoleEditorView.test.tsx / guards.test.tsx.
 *
 * Test framework: Vitest + React Testing Library (matches the rest of the suite;
 * the brief said "Jest" but this repo uses Vitest — same RTL surface).
 *
 * AC coverage:
 *  AC1 Shows current roles as chips.
 *  AC2 Remove chip → calls DELETE API (remove mutation).
 *  AC3 Picker disables non-grantable roles (perms superset of caller).
 *  AC4 Last-role removal → shows error, does NOT call DELETE.
 *  AC5 Self-demotion of an admin-level role → confirmation dialog before removing.
 *  AC6 staff.assign_role gating — see note: the gate is the PARENT (<Can perm>),
 *      RolePicker has no internal permission guard. Asserted contractually + flagged.
 *  AC7 After assign/remove success → onRolesChanged called.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import type { Role } from '../hooks/useUserRoles'

// ── Hoisted mutation spies ──────────────────────────────────────────────────
const h = vi.hoisted(() => {
  const assignMutateAsync = vi.fn<(v: { userId: number; roleId: number }) => Promise<unknown>>()
  const removeMutateAsync = vi.fn<(v: { userId: number; roleId: number }) => Promise<unknown>>()
  const clinicRoles: { data: Role[]; isError: boolean } = { data: [], isError: false }
  return { assignMutateAsync, removeMutateAsync, clinicRoles }
})

// ── Mock authStore ──────────────────────────────────────────────────────────
interface MockAuth {
  userId: number
  permissions: string[]
  refreshPermissions: () => Promise<void>
}
const auth = vi.hoisted<() => MockAuth>(() => {
  const state: MockAuth = {
    userId: 999,
    permissions: [],
    refreshPermissions: vi.fn(async () => {}),
  }
  return () => state
})

vi.mock('../store/authStore', () => ({
  useAuthStore: (selector: (s: MockAuth) => unknown) => selector(auth()),
}))

// ── Mock useUserRoles hooks ─────────────────────────────────────────────────
vi.mock('../hooks/useUserRoles', () => ({
  useClinicRolesQuery: () => ({ data: h.clinicRoles.data, isError: h.clinicRoles.isError }),
  useAssignRoleMutation: () => ({ mutateAsync: h.assignMutateAsync, isPending: false }),
  useRemoveRoleMutation: () => ({ mutateAsync: h.removeMutateAsync, isPending: false }),
}))

import RolePicker from '../components/roles/RolePicker'

// ── Fixtures ────────────────────────────────────────────────────────────────
// Admin (caller) permission set used across most tests.
const ADMIN_PERMS = [
  'appointments.view', 'appointments.create',
  'crm.view', 'crm.create',
  'staff.manage', 'staff.assign_role', 'roles.manage',
]

const staffRole: Role = {
  id: 10, name: 'Clinic Staff', isSystem: true,
  permissions: ['appointments.view', 'crm.view'], assignedUserCount: 3,
}
const doctorRole: Role = {
  id: 11, name: 'Doctor', isSystem: true,
  permissions: ['appointments.view', 'prescriptions.create'], assignedUserCount: 2,
}
const adminRole: Role = {
  id: 12, name: 'clinic_admin', isSystem: true,
  permissions: ['staff.manage', 'staff.assign_role', 'roles.manage'], assignedUserCount: 1,
}
const customGrantable: Role = {
  id: 13, name: 'Senior Receptionist', isSystem: false,
  permissions: ['appointments.view', 'crm.view'], assignedUserCount: 0,
}

function setAuth(over: Partial<MockAuth>): void {
  const s = auth()
  s.userId = over.userId ?? 999
  s.permissions = over.permissions ?? ADMIN_PERMS
  if (over.refreshPermissions) s.refreshPermissions = over.refreshPermissions
}

beforeEach(() => {
  vi.clearAllMocks()
  h.clinicRoles.data = []
  h.clinicRoles.isError = false
  h.assignMutateAsync.mockResolvedValue({})
  h.removeMutateAsync.mockResolvedValue({})
  setAuth({ userId: 999, permissions: ADMIN_PERMS })
})

// ─── AC1 ──────────────────────────────────────────────────────────────────────
describe('AC1 — current roles as chips', () => {
  it('renders each assigned role name as a chip with a remove button', () => {
    render(<RolePicker userId={1} currentRoles={[staffRole, doctorRole]} onRolesChanged={vi.fn()} />)
    const list = screen.getByRole('list', { name: /assigned roles/i })
    expect(within(list).getByText('Clinic Staff')).toBeInTheDocument()
    expect(within(list).getByText('Doctor')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /remove role Clinic Staff/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /remove role Doctor/i })).toBeInTheDocument()
  })

  it('shows the empty-state warning when the user has no roles', () => {
    render(<RolePicker userId={1} currentRoles={[]} onRolesChanged={vi.fn()} />)
    expect(screen.getByText(/has no roles/i)).toBeInTheDocument()
  })
})

// ─── AC2 ──────────────────────────────────────────────────────────────────────
describe('AC2 — remove chip calls DELETE API', () => {
  it('clicking remove on a non-last, non-self role calls the remove mutation', async () => {
    const onRolesChanged = vi.fn()
    render(<RolePicker userId={1} currentRoles={[staffRole, doctorRole]} onRolesChanged={onRolesChanged} />)

    fireEvent.click(screen.getByRole('button', { name: /remove role Doctor/i }))

    await waitFor(() => expect(h.removeMutateAsync).toHaveBeenCalledTimes(1))
    expect(h.removeMutateAsync).toHaveBeenCalledWith({ userId: 1, roleId: doctorRole.id })
  })
})

// ─── AC3 ──────────────────────────────────────────────────────────────────────
describe('AC3 — picker only allows grantable roles', () => {
  it('roles requiring permissions the caller lacks are disabled (not selectable)', () => {
    // doctorRole needs prescriptions.create which admin does NOT hold → not grantable.
    h.clinicRoles.data = [customGrantable, doctorRole]
    render(<RolePicker userId={1} currentRoles={[staffRole]} onRolesChanged={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /add role/i }))

    const grantableOpt = screen.getByRole('button', { name: /Senior Receptionist/i })
    expect(grantableOpt).not.toBeDisabled()

    const lockedOpt = screen.getByRole('button', { name: /Doctor/i })
    expect(lockedOpt).toBeDisabled()
    expect(screen.getByText(/Requires permissions you do not hold/i)).toBeInTheDocument()
  })

  it('selecting a grantable role calls the assign mutation', async () => {
    h.clinicRoles.data = [customGrantable]
    render(<RolePicker userId={1} currentRoles={[staffRole]} onRolesChanged={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /add role/i }))
    fireEvent.click(screen.getByRole('button', { name: /Senior Receptionist/i }))

    await waitFor(() => expect(h.assignMutateAsync).toHaveBeenCalledTimes(1))
    expect(h.assignMutateAsync).toHaveBeenCalledWith({ userId: 1, roleId: customGrantable.id })
  })
})

// ─── AC4 ──────────────────────────────────────────────────────────────────────
describe('AC4 — last-role removal blocked', () => {
  it('removing the only role shows error and does NOT call DELETE', () => {
    render(<RolePicker userId={1} currentRoles={[staffRole]} onRolesChanged={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /remove role Clinic Staff/i }))

    expect(screen.getByRole('alert')).toHaveTextContent(/cannot remove last role/i)
    expect(h.removeMutateAsync).not.toHaveBeenCalled()
  })

  it('a 409 from the server (non-last per UI) still surfaces the last-role banner', async () => {
    // Two roles in UI, but server rejects with 409 (race). Component maps 409 → banner.
    h.removeMutateAsync.mockRejectedValueOnce({ response: { status: 409 } })
    render(<RolePicker userId={1} currentRoles={[staffRole, customGrantable]} onRolesChanged={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /remove role Senior Receptionist/i }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/cannot remove last role/i),
    )
  })
})

// ─── AC5 ──────────────────────────────────────────────────────────────────────
describe('AC5 — self-demotion confirmation', () => {
  it('removing own admin-level role opens a confirmation dialog (no immediate DELETE)', () => {
    setAuth({ userId: 1, permissions: ADMIN_PERMS })
    render(<RolePicker userId={1} currentRoles={[adminRole, staffRole]} onRolesChanged={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /remove role clinic_admin/i }))

    expect(screen.getByRole('dialog')).toHaveTextContent(/remove your own admin role/i)
    expect(h.removeMutateAsync).not.toHaveBeenCalled()
  })

  it('confirming the dialog executes the remove', async () => {
    setAuth({ userId: 1, permissions: ADMIN_PERMS })
    render(<RolePicker userId={1} currentRoles={[adminRole, staffRole]} onRolesChanged={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /remove role clinic_admin/i }))
    fireEvent.click(screen.getByRole('button', { name: /remove anyway/i }))

    await waitFor(() => expect(h.removeMutateAsync).toHaveBeenCalledWith({ userId: 1, roleId: adminRole.id }))
  })

  it('cancelling the dialog leaves the role intact (no DELETE)', () => {
    setAuth({ userId: 1, permissions: ADMIN_PERMS })
    render(<RolePicker userId={1} currentRoles={[adminRole, staffRole]} onRolesChanged={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /remove role clinic_admin/i }))
    fireEvent.click(screen.getByRole('button', { name: /keep role/i }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(h.removeMutateAsync).not.toHaveBeenCalled()
  })

  it('removing another user\'s admin role does NOT trigger the self-demotion dialog', async () => {
    setAuth({ userId: 999, permissions: ADMIN_PERMS }) // editing user 1, not self
    render(<RolePicker userId={1} currentRoles={[adminRole, staffRole]} onRolesChanged={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /remove role clinic_admin/i }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(h.removeMutateAsync).toHaveBeenCalledWith({ userId: 1, roleId: adminRole.id }))
  })
})

// ─── AC6 ──────────────────────────────────────────────────────────────────────
describe('AC6 — staff.assign_role gating (PARENT responsibility)', () => {
  /**
   * NOTE (flagged in QA summary): RolePicker has NO internal staff.assign_role
   * guard. The brief expects the role section "hidden/disabled" without the perm.
   * Per the component contract (JSDoc: "Gate with <Can perm='staff.assign_role'>")
   * AND the backend route (gated on roles.manage), the hide/disable decision lives
   * in the parent staff editor, not here. This test documents that contract: the
   * component still renders its UI regardless of perms, so the gate MUST exist in
   * the parent. This is a divergence between brief and implementation.
   */
  it('RolePicker itself does not self-gate — parent must wrap in <Can perm="staff.assign_role">', () => {
    setAuth({ userId: 999, permissions: [] }) // caller holds NO permissions
    render(<RolePicker userId={1} currentRoles={[staffRole]} onRolesChanged={vi.fn()} />)
    // Component renders unconditionally → confirms the gate is NOT internal.
    expect(screen.getByRole('list', { name: /assigned roles/i })).toBeInTheDocument()
  })

  it('with zero caller permissions, no catalogue role is grantable (defence in depth)', () => {
    setAuth({ userId: 999, permissions: [] })
    h.clinicRoles.data = [customGrantable] // needs appointments.view + crm.view
    render(<RolePicker userId={1} currentRoles={[staffRole]} onRolesChanged={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /add role/i }))
    const opt = screen.getByRole('button', { name: /Senior Receptionist/i })
    expect(opt).toBeDisabled()
  })
})

// ─── AC7 ──────────────────────────────────────────────────────────────────────
describe('AC7 — onRolesChanged callback', () => {
  it('calls onRolesChanged after a successful assign', async () => {
    const onRolesChanged = vi.fn()
    h.clinicRoles.data = [customGrantable]
    render(<RolePicker userId={1} currentRoles={[staffRole]} onRolesChanged={onRolesChanged} />)

    fireEvent.click(screen.getByRole('button', { name: /add role/i }))
    fireEvent.click(screen.getByRole('button', { name: /Senior Receptionist/i }))

    await waitFor(() => expect(onRolesChanged).toHaveBeenCalledTimes(1))
  })

  it('calls onRolesChanged after a successful remove', async () => {
    const onRolesChanged = vi.fn()
    render(<RolePicker userId={1} currentRoles={[staffRole, doctorRole]} onRolesChanged={onRolesChanged} />)

    fireEvent.click(screen.getByRole('button', { name: /remove role Doctor/i }))

    await waitFor(() => expect(onRolesChanged).toHaveBeenCalledTimes(1))
  })

  it('does NOT call onRolesChanged when the remove mutation fails', async () => {
    const onRolesChanged = vi.fn()
    h.removeMutateAsync.mockRejectedValueOnce({ response: { status: 409 } })
    render(<RolePicker userId={1} currentRoles={[staffRole, doctorRole]} onRolesChanged={onRolesChanged} />)

    fireEvent.click(screen.getByRole('button', { name: /remove role Doctor/i }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(onRolesChanged).not.toHaveBeenCalled()
  })

  it('refreshes own permissions after editing self (assign)', async () => {
    const refreshPermissions = vi.fn(async () => {})
    setAuth({ userId: 1, permissions: ADMIN_PERMS, refreshPermissions })
    h.clinicRoles.data = [customGrantable]
    render(<RolePicker userId={1} currentRoles={[staffRole]} onRolesChanged={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /add role/i }))
    fireEvent.click(screen.getByRole('button', { name: /Senior Receptionist/i }))

    await waitFor(() => expect(refreshPermissions).toHaveBeenCalled())
  })
})

// ─── Error / load states ────────────────────────────────────────────────────
describe('Catalogue load error', () => {
  it('shows an error banner when the roles catalogue fails to load', () => {
    h.clinicRoles.isError = true
    render(<RolePicker userId={1} currentRoles={[staffRole]} onRolesChanged={vi.fn()} />)
    expect(screen.getByText(/cannot load roles/i)).toBeInTheDocument()
  })

  it('shows a forbidden banner when assign rejects with 403', async () => {
    h.clinicRoles.data = [customGrantable]
    h.assignMutateAsync.mockRejectedValueOnce({ response: { status: 403 } })
    render(<RolePicker userId={1} currentRoles={[staffRole]} onRolesChanged={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /add role/i }))
    fireEvent.click(screen.getByRole('button', { name: /Senior Receptionist/i }))

    await waitFor(() =>
      expect(screen.getByText(/cannot grant this role/i)).toBeInTheDocument(),
    )
  })
})
