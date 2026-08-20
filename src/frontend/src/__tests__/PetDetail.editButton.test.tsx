// src/frontend/src/__tests__/PetDetail.editButton.test.tsx
// A4 — RBAC gating on the pencil edit button in PetDetail's hero card (crm.edit).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mockPet = {
  id: 1, ownerId: 1, name: 'Rex', species: 'canine', breed: 'Labrador', color: 'Golden',
  birthDate: '2020-01-15', gender: 'male', weightKg: 22.4, microchipId: 'CHIP123',
  allergies: 'Pollen', underlyingConditions: 'None', isActive: true,
  owner: { id: 1, firstName: 'Jane', lastName: 'Doe', phone: '0812345678', address: '123 Main St', isActive: true, pets: [] },
}

const state: { permissions: string[] } = { permissions: [] }

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({ data: { data: mockPet }, isLoading: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('../store/authStore', () => ({
  useAuthStore: (selector: (s: { hasPermission: (code: string) => boolean }) => unknown) =>
    selector({ hasPermission: (code: string) => state.permissions.includes(code) }),
}))

import { PetDetail } from '../views/clinic/ClinicPets'

describe('PetDetail — edit button RBAC gating', () => {
  beforeEach(() => { state.permissions = [] })

  it('shows the edit button when the user has crm.edit', () => {
    state.permissions = ['crm.edit']
    render(<MemoryRouter><PetDetail petId={1} onAddVaccination={vi.fn()} /></MemoryRouter>)
    expect(screen.getByLabelText('Edit Pet')).toBeInTheDocument()
  })

  it('hides the edit button when the user lacks crm.edit (server-side 403 already covered by route tests)', () => {
    render(<MemoryRouter><PetDetail petId={1} onAddVaccination={vi.fn()} /></MemoryRouter>)
    expect(screen.queryByLabelText('Edit Pet')).not.toBeInTheDocument()
  })
})
