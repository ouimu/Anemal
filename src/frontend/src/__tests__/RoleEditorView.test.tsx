/**
 * T-5F-01 — Clinic Role Editor frontend QA (@qa-agent)
 *
 * Strategy: mock the useRoles hooks (network) and the authStore (permissions),
 * then drive the real RoleList + RolePermissionEditor + CloneRoleModal tree.
 * Mirrors the mocking approach in src/guards/guards.test.tsx.
 *
 * AC coverage:
 *  AC-1 Renders role list: name, SYSTEM badge, assignedUserCount chip.
 *  AC-2 System role toggles are disabled.
 *  AC-3 Custom role toggle fires onToggle (local state flips).
 *  AC-4 Save sends a delta { add, remove } — not the full permission array.
 *  AC-5 Clone modal submit calls the clone API.
 *  AC-6 Delete with users shows "Reassign N staff".
 *  AC-7 Permission not in user.permissions[] → toggle disabled.
 *  AC-8 After saving own role → refreshPermissions() is called.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import type { Role, PermissionCatalogue } from '../hooks/useRoles'

/**
 * Permission labels collide across modules (crm.create and prescriptions.create
 * both render as "Create"), so we locate a toggle by its unique permission CODE,
 * which the editor renders as visible text under each label.
 */
function toggleByCode(code: string): HTMLInputElement {
  const codeNode = screen.getByText(code)
  // walk up to the permission row, then find its checkbox
  const row = codeNode.closest('div.flex.items-center.justify-between') as HTMLElement | null
  const host = row ?? (codeNode.parentElement as HTMLElement)
  const cb = host.querySelector('input[type="checkbox"]') as HTMLInputElement | null
  if (!cb) throw new Error(`No toggle found for ${code}`)
  return cb
}

// ── Hoisted mutation spies ──────────────────────────────────────────────────
const h = vi.hoisted(() => {
  const updateMutate = vi.fn()
  const deleteMutate = vi.fn()
  const cloneMutate  = vi.fn()
  return { updateMutate, deleteMutate, cloneMutate }
})

// ── Mock authStore ──────────────────────────────────────────────────────────
interface MockAuth {
  permissions: string[]
  roleIds: string[]
  refreshPermissions: () => Promise<void>
}
const auth = vi.hoisted<() => MockAuth>(() => {
  const state: MockAuth = {
    permissions: [],
    roleIds: [],
    refreshPermissions: vi.fn(async () => {}),
  }
  return () => state
})

vi.mock('../store/authStore', () => ({
  useAuthStore: (selector: (s: MockAuth) => unknown) => selector(auth()),
}))

// ── Mock useRoles hooks ─────────────────────────────────────────────────────
vi.mock('../hooks/useRoles', () => ({
  useUpdateRolePermissionsMutation: () => ({ mutate: h.updateMutate, isPending: false }),
  useDeleteRoleMutation:            () => ({ mutate: h.deleteMutate, isPending: false }),
  useCloneRoleMutation:             () => ({ mutate: h.cloneMutate, isPending: false, isError: false, error: null }),
}))

import RoleList from '../components/roles/RoleList'
import CloneRoleModal from '../components/roles/CloneRoleModal'

// ── Fixtures ────────────────────────────────────────────────────────────────
const catalogue: PermissionCatalogue = {
  appointments: ['appointments.view', 'appointments.create', 'appointments.edit'],
  crm:          ['crm.view', 'crm.create'],
  prescriptions:['prescriptions.create'], // admin will NOT hold this → AC-7
}

const systemRole: Role = {
  id: 'sys-staff',
  name: 'Clinic Staff',
  isSystem: true,
  permissions: ['appointments.view', 'appointments.create'],
  assignedUserCount: 3,
}

const customRole: Role = {
  id: 'custom-1',
  name: 'Senior Receptionist',
  isSystem: false,
  permissions: ['appointments.view', 'crm.view'],
  assignedUserCount: 2,
}

function setAuth(over: Partial<MockAuth>): void {
  const s = auth()
  s.permissions = ['appointments.view', 'appointments.create', 'appointments.edit', 'crm.view', 'crm.create', 'roles.manage']
  s.roleIds = []
  s.refreshPermissions = vi.fn(async () => {})
  Object.assign(s, over)
}

beforeEach(() => {
  h.updateMutate.mockReset()
  h.deleteMutate.mockReset()
  h.cloneMutate.mockReset()
  setAuth({})
})

function renderList(roles: Role[], canManage = true) {
  return render(
    <RoleList
      roles={roles}
      catalogue={catalogue}
      canManage={canManage}
      onAssignStaff={vi.fn()}
    />,
  )
}

// ── AC-1 ────────────────────────────────────────────────────────────────────
describe('AC-1 role list rendering', () => {
  it('shows role name, SYSTEM badge and assignedUserCount chip', () => {
    renderList([systemRole, customRole])
    expect(screen.getByText('Clinic Staff')).toBeInTheDocument()
    expect(screen.getByText('Senior Receptionist')).toBeInTheDocument()
    expect(screen.getByText('SYSTEM')).toBeInTheDocument()
    // assignedUserCount chips
    expect(screen.getByText('3 staff')).toBeInTheDocument()
    expect(screen.getByText('2 staff')).toBeInTheDocument()
  })

  it('does not render a SYSTEM badge on a custom role', () => {
    renderList([customRole])
    expect(screen.queryByText('SYSTEM')).toBeNull()
  })
})

// ── AC-2 ────────────────────────────────────────────────────────────────────
describe('AC-2 system role toggles disabled', () => {
  it('all permission checkboxes are disabled when the role is a system role', () => {
    renderList([systemRole])
    fireEvent.click(screen.getByText('Clinic Staff')) // expand
    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes.length).toBeGreaterThan(0)
    for (const cb of checkboxes) expect(cb).toBeDisabled()
    // read-only banner present
    expect(screen.getByText(/System roles are read-only/i)).toBeInTheDocument()
  })
})

// ── AC-3 ────────────────────────────────────────────────────────────────────
describe('AC-3 custom role toggle fires', () => {
  it('toggling a held permission flips the checkbox (local state)', () => {
    renderList([customRole])
    fireEvent.click(screen.getByText('Senior Receptionist'))
    // crm.create is held by admin and OFF in the role → enabled + unchecked
    const cb = toggleByCode('crm.create')
    expect(cb.disabled).toBe(false)
    expect(cb.checked).toBe(false)
    fireEvent.click(cb)
    expect(cb.checked).toBe(true)
  })
})

// ── AC-4 ────────────────────────────────────────────────────────────────────
describe('AC-4 save sends a delta', () => {
  it('Save changes calls update mutation with { add, remove } delta only', () => {
    renderList([customRole])
    fireEvent.click(screen.getByText('Senior Receptionist'))

    // add crm.create (held, currently off)
    fireEvent.click(toggleByCode('crm.create'))

    fireEvent.click(screen.getByText('Save changes'))

    expect(h.updateMutate).toHaveBeenCalledTimes(1)
    const payload = h.updateMutate.mock.calls[0][0]
    expect(payload).toEqual({ roleId: 'custom-1', add: ['crm.create'], remove: [] })
    // Critically: it is a delta, NOT the full permission set.
    expect(payload).not.toHaveProperty('permissions')
    expect(payload.add).not.toContain('appointments.view') // unchanged → not in delta
  })

  it('Save is disabled until a change is made', () => {
    renderList([customRole])
    fireEvent.click(screen.getByText('Senior Receptionist'))
    expect(screen.getByText('Save changes').closest('button')).toBeDisabled()
  })
})

// ── AC-5 ────────────────────────────────────────────────────────────────────
describe('AC-5 clone modal submit', () => {
  it('submitting the clone modal calls the clone mutation with source + new name', () => {
    render(
      <CloneRoleModal sourceRoleName="Clinic Staff" onClose={vi.fn()} onCloned={vi.fn()} />,
    )
    fireEvent.change(screen.getByLabelText(/New role name/i), { target: { value: 'Night Shift' } })
    fireEvent.click(screen.getByText('Clone role'))

    expect(h.cloneMutate).toHaveBeenCalledTimes(1)
    expect(h.cloneMutate.mock.calls[0][0]).toEqual({
      sourceRoleName: 'Clinic Staff',
      newName: 'Night Shift',
    })
  })

  it('does not submit when the name is blank', () => {
    render(
      <CloneRoleModal sourceRoleName="Clinic Staff" onClose={vi.fn()} onCloned={vi.fn()} />,
    )
    fireEvent.click(screen.getByText('Clone role'))
    expect(h.cloneMutate).not.toHaveBeenCalled()
  })
})

// ── AC-6 ────────────────────────────────────────────────────────────────────
describe('AC-6 delete with assigned users', () => {
  it('shows "Reassign N staff" when delete returns 409', () => {
    // Simulate the mutation invoking its onError with a 409 axios-style error.
    h.deleteMutate.mockImplementation((_id: string, opts: { onError: (e: unknown) => void }) => {
      opts.onError({ response: { status: 409, data: { data: { assignedCount: 4 } } } })
    })

    renderList([customRole])
    // open delete dialog via the row Delete button
    fireEvent.click(screen.getByTitle('Delete this role'))
    // confirm delete — scope to the dialog so we hit the modal's confirm button,
    // not the row's "Delete" action button (both render the text "Delete").
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByText('Delete'))

    expect(screen.getByText(/Reassign 4 staff before deleting/i)).toBeInTheDocument()
  })
})

// ── AC-7 ────────────────────────────────────────────────────────────────────
describe('AC-7 permission not held → toggle disabled', () => {
  it('prescriptions.create toggle is disabled when current user lacks it', () => {
    // admin perms (from setAuth) deliberately exclude prescriptions.create
    renderList([customRole])
    fireEvent.click(screen.getByText('Senior Receptionist'))
    const presToggle = toggleByCode('prescriptions.create')
    expect(presToggle.disabled).toBe(true)
    // contrast: a held permission (crm.create) is enabled
    expect(toggleByCode('crm.create').disabled).toBe(false)
  })
})

// ── AC-8 ────────────────────────────────────────────────────────────────────
describe('AC-8 saving own role refreshes permissions', () => {
  it('calls refreshPermissions when the edited role is one of the user roles', async () => {
    const refresh = vi.fn(async () => {})
    setAuth({ roleIds: ['custom-1'], refreshPermissions: refresh })

    // Save mutation invokes its onSuccess callback.
    h.updateMutate.mockImplementation((_p: unknown, opts: { onSuccess: () => Promise<void> | void }) => {
      return opts.onSuccess()
    })

    renderList([customRole])
    fireEvent.click(screen.getByText('Senior Receptionist'))
    fireEvent.click(toggleByCode('crm.create'))
    fireEvent.click(screen.getByText('Save changes'))

    // allow the async onSuccess microtask to settle
    await Promise.resolve()
    await Promise.resolve()
    expect(refresh).toHaveBeenCalled()
  })

  it('does NOT refresh permissions when the edited role is not a user role', async () => {
    const refresh = vi.fn(async () => {})
    setAuth({ roleIds: ['some-other-role'], refreshPermissions: refresh })
    h.updateMutate.mockImplementation((_p: unknown, opts: { onSuccess: () => Promise<void> | void }) => opts.onSuccess())

    renderList([customRole])
    fireEvent.click(screen.getByText('Senior Receptionist'))
    fireEvent.click(toggleByCode('crm.create'))
    fireEvent.click(screen.getByText('Save changes'))

    await Promise.resolve()
    expect(refresh).not.toHaveBeenCalled()
  })
})
