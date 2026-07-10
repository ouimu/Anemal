// src/frontend/src/__tests__/PetDetail.admitButton.test.tsx
// B4 — "Admit to Inpatient" entry point on PetDetail's hero card, gated by
// inpatient.manage, opens AdmitModal with petId pre-filled. Uses a real
// QueryClientProvider (not the whole-module react-query mock used by the
// crm.edit button test) since AdmitModal itself calls useQuery for the doctors
// dropdown — see docs/superpowers/specs/2026-07-10-inpatient-crud-design.md §1 PETFIX-3b.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockPet = {
  id: 1, ownerId: 1, name: 'Rex', species: 'canine', breed: 'Labrador', color: 'Golden',
  birthDate: '2020-01-15', gender: 'male', weightKg: 22.4, microchipId: 'CHIP123',
  allergies: 'Pollen', underlyingConditions: 'None', isActive: true,
  owner: { id: 1, firstName: 'Jane', lastName: 'Doe', phone: '0812345678', address: '123 Main St', isActive: true, pets: [] },
}

const state: { permissions: string[] } = { permissions: [] }
const postMock = vi.fn().mockResolvedValue({ data: { data: { id: 900 } } })
const getMock = vi.fn((url: string) => {
  if (url === '/api/pets/1') return Promise.resolve({ data: { data: mockPet } })
  if (url === '/api/appointments/doctors') return Promise.resolve({ data: { data: [{ id: 7, name: 'Dr. Somchai' }] } })
  return Promise.resolve({ data: { data: null } })
})

vi.mock('../utils/api', () => ({
  default: { get: (...args: unknown[]) => getMock(...(args as [string])), post: (...args: unknown[]) => postMock(...args) },
}))
vi.mock('../store/authStore', () => ({
  useAuthStore: (selector: (s: { hasPermission: (code: string) => boolean }) => unknown) =>
    selector({ hasPermission: (code: string) => state.permissions.includes(code) }),
}))

import { PetDetail } from '../views/clinic/ClinicPets'

function renderPetDetail() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <PetDetail petId={1} onAddVaccination={vi.fn()} />
    </QueryClientProvider>
  )
}

describe('PetDetail — Admit to Inpatient entry point (B4, AC5)', () => {
  beforeEach(() => {
    state.permissions = []
    postMock.mockClear()
  })

  it('shows the Admit button when the user has inpatient.manage', async () => {
    state.permissions = ['inpatient.manage']
    renderPetDetail()
    expect(await screen.findByText('Admit to Inpatient')).toBeInTheDocument()
  })

  it('hides the Admit button when the user lacks inpatient.manage', async () => {
    renderPetDetail()
    await screen.findByText('Rex', { selector: 'h3' })
    expect(screen.queryByText('Admit to Inpatient')).not.toBeInTheDocument()
  })

  it('opens AdmitModal with petId pre-filled and submits POST /api/hospitalizations', async () => {
    state.permissions = ['inpatient.manage']
    renderPetDetail()

    await userEvent.click(await screen.findByText('Admit to Inpatient'))
    expect(await screen.findByText('Admit to Inpatient', { selector: 'h3' })).toBeInTheDocument()

    await userEvent.type(screen.getByPlaceholderText('Reason for admission'), 'Observation')
    await userEvent.click(screen.getByText('Admit Patient'))

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith('/api/hospitalizations', expect.objectContaining({ petId: 1, reason: 'Observation' }))
    })
  })
})
