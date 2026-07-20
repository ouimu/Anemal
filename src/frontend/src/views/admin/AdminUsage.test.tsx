import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { test, expect, vi } from 'vitest'
import AdminUsage from './AdminUsage'
import api from '../../utils/api'
import adminUsageSource from './AdminUsage.tsx?raw'

vi.mock('../../utils/api')
vi.mock('../../hooks/useAdmin', () => ({
  useAdminSettings: () => ({ data: { tenant: { subdomain: 'testclinic' } } }),
}))
vi.mock('../../store/authStore', () => ({
  useAuthStore: (selector: (state: { branchId: number | null }) => unknown) => selector({ branchId: null }),
}))
vi.mock('../../components/BranchSwitcher', () => ({ default: () => null }))

const mockedApiGet = vi.mocked(api.get)

function renderWithClient() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <AdminUsage />
    </QueryClientProvider>,
  )
}

test('renders real caps.maxUsers, caps.maxOwners and caps.maxPets from the API response, not a hardcoded constant', async () => {
  mockedApiGet.mockResolvedValue({
    data: { data: {
      totalPets: 5, totalOwners: 4, totalUsers: 3, activeUsers: 3,
      appointmentsThisMonth: 0, appointmentsToday: 0, invoicesThisMonth: 0, planTier: 'starter',
      caps: { maxBranches: 1, maxUsers: 10, maxOwners: 500, maxPets: 500 },
    } },
  })
  renderWithClient()
  expect(await screen.findByText('3 / 10')).toBeInTheDocument()
  expect(await screen.findByText('4 / 500')).toBeInTheDocument()
  expect(await screen.findByText('5 / 500')).toBeInTheDocument()
})

test('renders infinity for a null cap', async () => {
  mockedApiGet.mockResolvedValue({
    data: { data: {
      totalPets: 5, totalOwners: 4, totalUsers: 3, activeUsers: 3,
      appointmentsThisMonth: 0, appointmentsToday: 0, invoicesThisMonth: 0, planTier: 'clinic_plus',
      caps: { maxBranches: null, maxUsers: null, maxOwners: null, maxPets: null },
    } },
  })
  renderWithClient()
  expect(await screen.findByText('3 / ∞')).toBeInTheDocument()
  expect(await screen.findByText('4 / ∞')).toBeInTheDocument()
  expect(await screen.findByText('5 / ∞')).toBeInTheDocument()
})

test('PLAN_LIMITS identifier no longer exists in the source (regression guard)', () => {
  expect(adminUsageSource).not.toContain('PLAN_LIMITS')
})
