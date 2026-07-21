import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AdminBranches from '../views/admin/AdminBranches'

const branches = [
  { id: 1, name: 'Main Branch', phone: null, email: null, address: null, isActive: true },
]

const users = [
  { id: 1, name: 'Dr. System', role: { key: 'doctor' } },
  { id: 2, name: 'Dr. Cloned Senior Vet', role: { key: 'tenant_1_senior_vet' } },
  { id: 3, name: 'Front Desk', role: { key: 'clinic_staff' } },
]

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) =>
    queryKey[0] === 'branches'
      ? { data: branches, isLoading: false }
      : queryKey[0] === 'shifts'
      ? { data: [], isLoading: false }
      : { data: users, isLoading: false },
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

describe('AdminBranches — doctor picker key-match (ADR-0019)', () => {
  it('lists the system doctor in the Doctor Shifts picker (role-object shape, key match)', () => {
    render(<AdminBranches />)
    fireEvent.click(screen.getByText('Main Branch'))
    // ADR-0019: key-match only — the plain "doctor" system role is bookable
    // for branch shift assignment; a cloned custom role is not.
    expect(screen.getByText('Dr. System')).toBeInTheDocument()
    expect(screen.queryByText('Dr. Cloned Senior Vet')).toBeNull()
    expect(screen.queryByText('Front Desk')).toBeNull()
  })
})
