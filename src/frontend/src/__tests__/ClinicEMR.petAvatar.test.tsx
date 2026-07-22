// src/frontend/src/__tests__/ClinicEMR.petAvatar.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

const getMock = vi.fn()
vi.mock('../utils/api', () => ({ default: { get: (...args: unknown[]) => getMock(...(args as [string, unknown])) } }))
vi.mock('../store/authStore', () => ({
  useAuthStore: (selector?: (s: { userId: number; hasPermission: (perm: string) => boolean }) => unknown) => {
    const state = { userId: 1, hasPermission: () => true }
    return selector ? selector(state) : state
  },
}))
vi.mock('../components/AuthedPetImage', () => ({
  default: ({ alt }: { alt: string }) => <div data-testid="authed-pet-image">{alt}</div>,
}))

import ClinicEMR from '../views/clinic/ClinicEMR'

const pet = { id: 42, name: 'Rex', species: 'canine', photoUrl: 'tenants/1/photo/pet-42.jpg', owner: { firstName: 'Jane', lastName: 'Doe', phone: '0812345678' } }

beforeEach(() => {
  getMock.mockReset()
  getMock.mockImplementation((url: string, config?: { params?: Record<string, unknown> }) => {
    if (url === '/api/search') {
      const q = config?.params?.q as string | undefined
      if (q && q.length >= 2) return Promise.resolve({ data: { data: [{ petId: 42, petName: 'Rex', species: 'canine', ownerName: 'Jane Doe', phone: '0812345678' }] } })
      return Promise.resolve({ data: { data: [] } })
    }
    if (url === '/api/pets/42') return Promise.resolve({ data: { data: pet } })
    if (url === '/api/medical-records') return Promise.resolve({ data: { data: { records: [] } } })
    return Promise.resolve({ data: { data: null } })
  })
})

function renderEMR() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter><ClinicEMR /></MemoryRouter>
    </QueryClientProvider>
  )
}

describe('ClinicEMR — pet avatar photo display (ADR-0022 AuthedPetImage swap)', () => {
  it('renders the sidebar pet avatar via AuthedPetImage when the pet has a photo', async () => {
    renderEMR()
    await userEvent.type(screen.getByPlaceholderText(/pet or owner/i), 'Rex')
    await userEvent.click(await screen.findByText('Rex'))
    expect(await screen.findByTestId('authed-pet-image')).toHaveTextContent('Rex')
  })
})
