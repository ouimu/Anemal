// src/frontend/src/__tests__/PetOverview.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockPet = {
  id: 1, ownerId: 1, name: 'Rex', species: 'canine', breed: 'Labrador', color: 'Golden',
  birthDate: '2020-01-15', gender: 'male', weightKg: 22.4, microchipId: 'CHIP123',
  allergies: 'Pollen', underlyingConditions: 'None', isActive: true,
}

const state: { permissions: string[] } = { permissions: [] }

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: { data: mockPet }, isLoading: false }),
}))
vi.mock('../store/authStore', () => ({
  useAuthStore: (selector: (s: { hasPermission: (code: string) => boolean }) => unknown) =>
    selector({ hasPermission: (code: string) => state.permissions.includes(code) }),
}))

import { PetDetail } from '../views/clinic/ClinicPets'

// Overview row labels ('Species', 'Breed', etc.) are unique in the DOM, but
// several values (species, breed, gender, microchipId) also render in the
// pet hero chips above the tabs — so assertions scope to the label's own
// row via closest('div') rather than matching the value text globally.
function rowContains(label: string, value: string) {
  expect(screen.getByText(label).closest('div')).toHaveTextContent(value)
}

describe('PetDetail — Overview tab', () => {
  it('shows species, breed, gender, weight, microchipId, allergies, and underlyingConditions', () => {
    render(<PetDetail petId={1} onAddVaccination={vi.fn()} />)
    rowContains('Species', 'canine')
    rowContains('Breed', 'Labrador')
    rowContains('Gender', 'male')
    rowContains('Date of birth', new Date(mockPet.birthDate).toLocaleDateString())
    rowContains('Weight', '22.4 kg')
    rowContains('Color', 'Golden')
    rowContains('Microchip ID', 'CHIP123')
    rowContains('Allergies', 'Pollen')
    rowContains('Underlying conditions', 'None')
  })
})

describe('PetDetail — Add Vaccination button permission guard', () => {
  beforeEach(() => { state.permissions = [] })

  it('hides Add Vaccination button when user lacks vaccination.create', async () => {
    render(<PetDetail petId={1} onAddVaccination={vi.fn()} />)
    await userEvent.click(screen.getByText('Vaccinations'))
    expect(screen.queryByText('Add Vaccination')).not.toBeInTheDocument()
  })

  it('shows Add Vaccination button when user has vaccination.create', async () => {
    state.permissions = ['vaccination.create']
    render(<PetDetail petId={1} onAddVaccination={vi.fn()} />)
    await userEvent.click(screen.getByText('Vaccinations'))
    expect(screen.getByText('Add Vaccination')).toBeInTheDocument()
  })
})
