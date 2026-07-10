// src/frontend/src/__tests__/ClinicEMR.weightSync.test.tsx
// B4 — saveRecord must invalidate both ['pet-emr', petId] and ['pet', petId] query
// keys (grill finding §8.7 in the design spec) so PetDetail's weight display stays
// fresh after an EMR save that syncs Pet.weightKg.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const getMock = vi.fn()
const postMock = vi.fn().mockResolvedValue({ data: { data: { id: 99 } } })

vi.mock('../utils/api', () => ({
  default: {
    get: (...args: unknown[]) => getMock(...(args as [string, unknown])),
    post: (...args: unknown[]) => postMock(...args),
  },
}))
vi.mock('../store/authStore', () => ({
  useAuthStore: () => ({ userId: 1 }),
}))

import ClinicEMR from '../views/clinic/ClinicEMR'

const pet = { id: 42, name: 'Rex', species: 'canine', owner: { firstName: 'Jane', lastName: 'Doe', phone: '0812345678' } }

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

function renderWithClient() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
  render(
    <QueryClientProvider client={queryClient}>
      <ClinicEMR />
    </QueryClientProvider>
  )
  return { invalidateSpy }
}

describe('ClinicEMR — saveRecord query invalidation', () => {
  it('invalidates both pet-emr and pet query keys after save', async () => {
    const { invalidateSpy } = renderWithClient()

    await userEvent.type(screen.getByPlaceholderText(/pet or owner/i), 'Rex')
    const result = await screen.findByText('Rex')
    await userEvent.click(result)

    await screen.findByText('Rex', { selector: 'p' })
    await userEvent.click(screen.getByText(/new emr record/i))

    await userEvent.click(screen.getByText(/save record/i))

    await waitFor(() => {
      expect(postMock).toHaveBeenCalled()
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['pet-emr', 42] })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['pet', 42] })
    })
  })
})
