// src/frontend/src/__tests__/OwnerPanel.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockOwnerActive = {
  id: 1, firstName: 'Jane', lastName: 'Doe', phone: '0812345678',
  email: 'jane@example.com', address: '123 Main St', isActive: true, pets: [],
}
const mockOwnerInactive = { ...mockOwnerActive, id: 2, isActive: false }

let currentOwner = mockOwnerActive
const deleteMock = vi.fn().mockResolvedValue({ data: { data: { message: 'Owner deactivated' } } })
const putMock = vi.fn().mockResolvedValue({ data: { data: { id: 1 } } })

vi.mock('../utils/api', () => ({
  default: {
    delete: (...args: unknown[]) => deleteMock(...args),
    put: (...args: unknown[]) => putMock(...args),
  },
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: { data: currentOwner }, isLoading: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

const state: { permissions: string[] } = { permissions: [] }
vi.mock('../store/authStore', () => ({
  useAuthStore: (selector: (s: { hasPermission: (code: string) => boolean }) => unknown) =>
    selector({ hasPermission: (code: string) => state.permissions.includes(code) }),
}))

import { OwnerPanel } from '../views/clinic/ClinicPets'

describe('OwnerPanel — Edit/Delete/Reactivate controls', () => {
  beforeEach(() => {
    state.permissions = []
    currentOwner = mockOwnerActive
    deleteMock.mockClear()
    putMock.mockClear()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  it('hides Edit/Delete buttons without crm.edit/crm.delete', () => {
    render(<OwnerPanel ownerId={1} onSelectPet={vi.fn()} onAddPet={vi.fn()} />)
    expect(screen.queryByTitle('Edit')).not.toBeInTheDocument()
    expect(screen.queryByTitle('Delete')).not.toBeInTheDocument()
  })

  it('shows Edit button with crm.edit', () => {
    state.permissions = ['crm.edit']
    render(<OwnerPanel ownerId={1} onSelectPet={vi.fn()} onAddPet={vi.fn()} />)
    expect(screen.getByTitle('Edit')).toBeInTheDocument()
  })

  it('shows Delete button with crm.delete and calls confirm + DELETE on click', async () => {
    state.permissions = ['crm.delete']
    render(<OwnerPanel ownerId={1} onSelectPet={vi.fn()} onAddPet={vi.fn()} />)
    await userEvent.click(screen.getByTitle('Delete'))
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Jane Doe'))
    expect(deleteMock).toHaveBeenCalledWith('/api/owners/1')
  })

  it('does not call DELETE if confirm is cancelled', async () => {
    state.permissions = ['crm.delete']
    ;(window.confirm as ReturnType<typeof vi.fn>).mockReturnValueOnce(false)
    render(<OwnerPanel ownerId={1} onSelectPet={vi.fn()} onAddPet={vi.fn()} />)
    await userEvent.click(screen.getByTitle('Delete'))
    expect(deleteMock).not.toHaveBeenCalled()
  })

  it('shows an inline error on 409 delete-blocked, without navigating away', async () => {
    state.permissions = ['crm.delete']
    deleteMock.mockRejectedValueOnce({ response: { data: { error: 'Cannot delete: owner has active pets' } } })
    render(<OwnerPanel ownerId={1} onSelectPet={vi.fn()} onAddPet={vi.fn()} />)
    await userEvent.click(screen.getByTitle('Delete'))
    expect(await screen.findByText(/active pets/i)).toBeInTheDocument()
  })

  it('shows Reactivate button instead of Edit/Delete when owner is inactive', () => {
    currentOwner = mockOwnerInactive
    state.permissions = ['crm.edit', 'crm.delete']
    render(<OwnerPanel ownerId={2} onSelectPet={vi.fn()} onAddPet={vi.fn()} />)
    expect(screen.getByText('Reactivate Owner')).toBeInTheDocument()
    expect(screen.queryByTitle('Edit')).not.toBeInTheDocument()
    expect(screen.queryByTitle('Delete')).not.toBeInTheDocument()
  })

  it('calls PUT with isActive:true when Reactivate is clicked', async () => {
    currentOwner = mockOwnerInactive
    state.permissions = ['crm.delete']
    render(<OwnerPanel ownerId={2} onSelectPet={vi.fn()} onAddPet={vi.fn()} />)
    await userEvent.click(screen.getByText('Reactivate Owner'))
    expect(putMock).toHaveBeenCalledWith('/api/owners/2', expect.objectContaining({ isActive: true }))
  })
})
