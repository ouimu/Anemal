// src/frontend/src/__tests__/ClinicPetsMedicalTab.test.tsx
// PET-MED-1/2 — Medical tab "View all in EMR" drill-in link + emr.view-aware
// degraded empty state when the server omits medicalRecords/vaccinations.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

const state: { permissions: string[] } = { permissions: [] }
const getMock = vi.fn()

vi.mock('../utils/api', () => ({
  default: { get: (...args: unknown[]) => getMock(...(args as [string])) },
}))
vi.mock('../store/authStore', () => ({
  useAuthStore: (selector: (s: { hasPermission: (code: string) => boolean }) => unknown) =>
    selector({ hasPermission: (code: string) => state.permissions.includes(code) }),
}))

import { PetDetail } from '../views/clinic/ClinicPets'

function renderPetDetail() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <PetDetail petId={1} onAddVaccination={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('PetDetail — Medical tab', () => {
  beforeEach(() => {
    state.permissions = ['crm.view', 'emr.view']
    getMock.mockReset()
  })

  it('shows "View all in EMR" link when emr.view is held and records exist', async () => {
    getMock.mockResolvedValue({ data: { data: {
      id: 1, name: 'Rex', species: 'canine',
      medicalRecords: [{ id: 1, createdAt: new Date().toISOString(), assessment: 'Checkup' }],
    } } })
    renderPetDetail()
    fireEvent.click(await screen.findByText('Medical'))
    expect(await screen.findByText('View all in EMR')).toBeInTheDocument()
  })

  it('shows degraded message when emr.view is absent (field omitted by server)', async () => {
    state.permissions = ['crm.view']
    getMock.mockResolvedValue({ data: { data: { id: 1, name: 'Rex', species: 'canine' } } })
    renderPetDetail()
    fireEvent.click(await screen.findByText('Medical'))
    expect(await screen.findByText("You don't have access to clinical records.")).toBeInTheDocument()
  })

  it('shows normal empty state when emr.view held but no records', async () => {
    getMock.mockResolvedValue({ data: { data: { id: 1, name: 'Rex', species: 'canine', medicalRecords: [] } } })
    renderPetDetail()
    fireEvent.click(await screen.findByText('Medical'))
    expect(await screen.findByText('No medical records yet.')).toBeInTheDocument()
  })

  it('hides Add Vaccination button when vaccinations is absent (emr.view denied)', async () => {
    state.permissions = ['crm.view']
    getMock.mockResolvedValue({ data: { data: { id: 1, name: 'Rex', species: 'canine' } } })
    renderPetDetail()
    fireEvent.click(await screen.findByText('Vaccinations'))
    expect(screen.queryByText('Add Vaccination')).not.toBeInTheDocument()
    expect(await screen.findByText("You don't have access to clinical records.")).toBeInTheDocument()
  })
})
