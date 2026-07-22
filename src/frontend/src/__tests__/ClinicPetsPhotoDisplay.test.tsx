// src/frontend/src/__tests__/ClinicPetsPhotoDisplay.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../components/AuthedPetImage', () => ({
  default: ({ alt }: { alt: string }) => <div data-testid="authed-pet-image">{alt}</div>,
}))
vi.mock('../utils/api', () => ({ default: {} }))
vi.mock('../store/authStore', () => ({
  useAuthStore: (selector: (s: { hasPermission: (code: string) => boolean }) => unknown) => selector({ hasPermission: () => false }),
}))

const petWithPhoto = {
  id: 9, ownerId: 1, name: 'Rex', species: 'canine', photoUrl: 'tenants/1/photo/pet-9.jpg',
  owner: { id: 1, firstName: 'Jane', lastName: 'Doe', phone: '0812345678', isActive: true, pets: [] },
}
const ownerWithPhotoPet = {
  id: 1, firstName: 'Jane', lastName: 'Doe', phone: '0812345678', isActive: true,
  pets: [petWithPhoto],
}

vi.mock('@tanstack/react-query', () => ({
  useQuery: (opts: { queryKey: unknown[] }) => {
    const key = opts.queryKey[0]
    if (key === 'owner') return { data: { data: ownerWithPhotoPet }, isLoading: false }
    return { data: { data: petWithPhoto }, isLoading: false }
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

import { OwnerPanel, PetDetail } from '../views/clinic/ClinicPets'

describe('ClinicPets — pet photo display sites (ADR-0022 AuthedPetImage swap)', () => {
  it('grid card renders a pet with photoUrl via AuthedPetImage', () => {
    render(<OwnerPanel ownerId={1} onSelectPet={vi.fn()} onAddPet={vi.fn()} />)
    expect(screen.getByTestId('authed-pet-image')).toHaveTextContent('Rex')
  })

  it('detail hero renders the pet photo via AuthedPetImage', () => {
    render(<MemoryRouter><PetDetail petId={9} onAddVaccination={vi.fn()} /></MemoryRouter>)
    expect(screen.getByTestId('authed-pet-image')).toHaveTextContent('Rex')
  })
})
