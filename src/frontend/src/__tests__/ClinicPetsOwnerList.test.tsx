// src/frontend/src/__tests__/ClinicPetsOwnerList.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const owners = [
  { id: 1, firstName: 'Active', lastName: 'Owner', phone: '0810000001', isActive: true, pets: [] },
  { id: 2, firstName: 'Inactive', lastName: 'Owner', phone: '0810000002', isActive: false, pets: [] },
]
const getMock = vi.fn().mockResolvedValue({
  data: { data: { owners } },
})
vi.mock('../utils/api', () => ({
  default: { get: (...args: unknown[]) => getMock(...args) },
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: { owners }, isLoading: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

const state: { permissions: string[] } = { permissions: [] }
vi.mock('../store/authStore', () => ({
  useAuthStore: (selector: (s: { hasPermission: (code: string) => boolean }) => unknown) =>
    selector({ hasPermission: (code: string) => state.permissions.includes(code) }),
}))

import ClinicPets from '../views/clinic/ClinicPets'

describe('ClinicPets owner list — Show inactive checkbox', () => {
  beforeEach(() => { state.permissions = []; getMock.mockClear() })

  it('does not render the Show inactive checkbox without crm.delete', async () => {
    render(<ClinicPets />)
    expect(screen.queryByLabelText(/show inactive/i)).not.toBeInTheDocument()
  })

  it('renders the Show inactive checkbox with crm.delete', async () => {
    state.permissions = ['crm.delete']
    render(<ClinicPets />)
    expect(await screen.findByLabelText(/show inactive/i)).toBeInTheDocument()
  })

  it('renders an Inactive badge on inactive owner rows', async () => {
    render(<ClinicPets />)
    expect(await screen.findByText('Inactive')).toBeInTheDocument()
  })
})
