// src/frontend/src/__tests__/ClinicEMR.petIdParam.test.tsx
// PET-MED-1 — ClinicEMR pre-selects the pet named by a ?petId= query param,
// so the Pet Profile Medical tab's "View all in EMR" drill-in lands on the
// right patient instead of the blank search screen.
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

const getMock = vi.fn((url: string) => {
  if (url === '/api/pets/42') return Promise.resolve({ data: { data: { id: 42, name: 'Rex', species: 'canine' } } })
  return Promise.resolve({ data: { data: [] } })
})

vi.mock('../utils/api', () => ({
  default: { get: (...args: unknown[]) => getMock(...(args as [string])) },
}))
vi.mock('../store/authStore', () => ({
  useAuthStore: () => ({ userId: 1 }),
}))

import ClinicEMR from '../views/clinic/ClinicEMR'

describe('ClinicEMR — ?petId= deep link', () => {
  it('pre-selects the pet from the petId query param', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/clinic/emr?petId=42']}>
          <ClinicEMR />
        </MemoryRouter>
      </QueryClientProvider>
    )
    expect(await screen.findByText('Rex')).toBeInTheDocument()
  })
})
