import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import RoleList from '../components/roles/RoleList'

vi.mock('../store/authStore', () => ({
  useAuthStore: (s: (s: { permissions: string[]; roleIds: string[]; refreshPermissions: () => Promise<void> }) => unknown) =>
    s({ permissions: ['roles.manage'], roleIds: [], refreshPermissions: async () => {} }),
}))
vi.mock('../hooks/useRoles', () => ({
  useUpdateRolePermissionsMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteRoleMutation: () => ({ mutate: vi.fn(), isPending: false }),
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
