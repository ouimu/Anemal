import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import RoleList from '../components/roles/RoleList'

interface MockAuth {
  permissions: string[]
  roleIds: string[]
  refreshPermissions: () => Promise<{ ok: boolean }>
}

const auth: MockAuth = {
  permissions: ['roles.manage'],
  roleIds: [],
  refreshPermissions: async () => ({ ok: true }),
}

vi.mock('../store/authStore', () => ({
  useAuthStore: (s: (s: MockAuth) => unknown) => s(auth),
}))

const h = vi.hoisted(() => ({ updateMutate: vi.fn() }))
vi.mock('../hooks/useRoles', () => ({
  useUpdateRolePermissionsMutation: () => ({ mutate: h.updateMutate, isPending: false }),
  useDeleteRoleMutation: () => ({ mutate: vi.fn(), isPending: false }),
}))

// Stub the real editor (which disables Save for system roles per AC-2) with a
// deterministic Save button — these tests are about handleSave's post-
// mutation toast/refresh branching, not about the editor's own toggle UI
// (covered by RoleEditorView.test.tsx).
vi.mock('../components/roles/RolePermissionEditor', () => ({
  default: ({ onSave }: { onSave: (delta: { add: string[]; remove: string[] }) => void }) => (
    <button type="button" onClick={() => onSave({ add: ['x'], remove: [] })}>
      Save Permissions
    </button>
  ),
}))

const roles = [
  { id: '1', name: 'Admin',  key: 'clinic_admin', isSystem: true,  permissions: [], assignedUserCount: 1 },
  { id: '2', name: 'Doctor', key: 'doctor',        isSystem: true,  permissions: [], assignedUserCount: 2 },
]

describe('RoleList — Admin clone lockdown', () => {
  it('does not render a Clone button on the Admin row', () => {
    render(<RoleList roles={roles} catalogue={{}} canManage={true} onAssignStaff={() => {}} />)
    const adminRow = screen.getByText('Admin').closest('div')!.parentElement!
    expect(adminRow.querySelector('[title="Clone this role"]')).toBeNull()
  })

  it('still renders a Clone button on the Doctor row', () => {
    render(<RoleList roles={roles} catalogue={{}} canManage={true} onAssignStaff={() => {}} />)
    const doctorRow = screen.getByText('Doctor').closest('div')!.parentElement!
    expect(doctorRow.querySelector('[title="Clone this role"]')).not.toBeNull()
  })
})

describe('RoleList — honest refresh (ADR-0026 decision 6, AUTH-REFRESH-01/02/05)', () => {
  beforeEach(() => {
    h.updateMutate.mockReset()
    auth.roleIds = ['1'] // Admin row is a self-held role for these cases
    auth.refreshPermissions = async () => ({ ok: true })
    // Simulate the update mutation succeeding and invoking its onSuccess.
    h.updateMutate.mockImplementation((_p: unknown, opts: { onSuccess: () => Promise<void> | void }) => {
      void opts.onSuccess()
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  /** Flushes the microtask queue so handleSave's `await refreshPerms()` settles. */
  async function flushMicrotasks() {
    await Promise.resolve()
    await Promise.resolve()
  }

  it('AUTH-REFRESH-01: self-edit + refresh non-ok shows a persistent warning, not a success toast', async () => {
    auth.refreshPermissions = vi.fn().mockResolvedValue({ ok: false })

    render(<RoleList roles={roles} catalogue={{}} canManage={true} onAssignStaff={() => {}} />)
    fireEvent.click(screen.getByText('Admin'))
    fireEvent.click(screen.getByText('Save Permissions'))
    await flushMicrotasks()

    expect(screen.getByText(/could not refresh/i)).toBeInTheDocument()
    expect(screen.queryByText('Permissions updated')).toBeNull()
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument()
  })

  it('AUTH-REFRESH-05: the warning toast never auto-dismisses and carries a reload control', async () => {
    auth.refreshPermissions = vi.fn().mockResolvedValue({ ok: false })
    vi.useFakeTimers()

    render(<RoleList roles={roles} catalogue={{}} canManage={true} onAssignStaff={() => {}} />)
    fireEvent.click(screen.getByText('Admin'))
    fireEvent.click(screen.getByText('Save Permissions'))
    // Flush the onSuccess microtask chain without advancing macrotasks —
    // fake timers don't block microtask resolution.
    await flushMicrotasks()

    const reloadBtn = screen.getByRole('button', { name: /reload/i })
    // Advance well past the 4s window success/error toasts use.
    act(() => { vi.advanceTimersByTime(10_000) })
    expect(reloadBtn).toBeInTheDocument()
    expect(screen.getByText(/could not refresh/i)).toBeInTheDocument()
  })

  it('AUTH-REFRESH-02: self-edit + refresh ok shows the success toast and it auto-dismisses at 4s (regression guard)', async () => {
    auth.refreshPermissions = vi.fn().mockResolvedValue({ ok: true })
    vi.useFakeTimers()

    render(<RoleList roles={roles} catalogue={{}} canManage={true} onAssignStaff={() => {}} />)
    fireEvent.click(screen.getByText('Admin'))
    fireEvent.click(screen.getByText('Save Permissions'))
    await flushMicrotasks()

    expect(screen.getByText('Permissions updated')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(4_001) })
    expect(screen.queryByText('Permissions updated')).toBeNull()
  })
})
