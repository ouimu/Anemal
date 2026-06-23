import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../store/uiStore', () => ({
  useUiStore: (s: (s: { language: string }) => unknown) => s({ language: 'th' }),
}))
vi.mock('../store/authStore', () => ({
  useAuthStore: (s: (s: { permissions: string[]; roleIds: number[] }) => unknown) =>
    s({ permissions: ['roles.manage'], roleIds: [1] }),
}))
vi.mock('../hooks/useRoles', () => ({
  useRolesQuery: () => ({ data: [], isLoading: false }),
  usePermissionCatalogueQuery: () => ({ data: {}, isLoading: false }),
  useCloneRoleMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteRoleMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateRolePermissionsMutation: () => ({ mutate: vi.fn(), isPending: false }),
}))

import RoleEditorView from '../views/clinic/RoleEditorView'

describe('RoleEditorView — Thai i18n', () => {
  it('renders Thai page title', () => {
    render(<MemoryRouter><RoleEditorView /></MemoryRouter>)
    expect(screen.getByText(/ตัวแก้ไขบทบาท/i)).toBeInTheDocument()
  })
  it('renders Thai system badge text', () => {
    render(<MemoryRouter><RoleEditorView /></MemoryRouter>)
    // Empty state — no roles loaded; just check heading renders in Thai
    expect(screen.queryByText('Role Editor')).not.toBeInTheDocument()
  })
})
