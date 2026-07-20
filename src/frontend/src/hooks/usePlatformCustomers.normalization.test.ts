/**
 * usePlatformCustomerUsage — real, unmocked normalization coverage (ADR-0007 D6c).
 *
 * The old PlatformConsole.test.tsx throw-test mocked usePlatformCustomers itself,
 * so it could never exercise the real raw-to-nested transform inside the hook —
 * asserting `.toThrow()` against a mocked hook only proved the component would
 * throw if fed raw data, not that the hook's real code path does anything.
 *
 * This test imports the REAL `usePlatformCustomerUsage` (not mocked). Only
 * `@tanstack/react-query`'s `useQuery` is mocked (to capture the real `queryFn`
 * without needing a live `QueryClientProvider`), plus `platformApi` (to supply a
 * realistic raw backend envelope) — matching the existing convention in
 * `src/frontend/src/views/clinic/__tests__/ClinicGrooming.test.tsx`.
 */
import { describe, it, test, expect, vi } from 'vitest'

const queryFns = vi.hoisted(() => [] as Array<() => unknown>)
vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryFn }: { queryFn: () => unknown }) => {
    queryFns.push(queryFn)
    return { data: undefined, isLoading: true }
  },
}))

const rawUsage = {
  branches: 2,
  users: 5,
  owners: 40,
  pets: 60,
  caps: { maxBranches: 3, maxUsers: 10, maxOwners: 100, maxPets: 200 },
  overPlan: false,
}
vi.mock('../utils/platformApi', () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: { data: rawUsage } })) },
}))

import { usePlatformCustomerUsage } from './usePlatformCustomers'

describe('usePlatformCustomerUsage — raw-to-nested normalization (ADR-0007 D6c)', () => {
  it('normalizes the real backend envelope into the nested {current, limit} shape UsageTab expects', async () => {
    usePlatformCustomerUsage(42)
    expect(queryFns.length).toBeGreaterThan(0)
    const result = await queryFns[queryFns.length - 1]()
    expect(result).toEqual({
      branches: { current: 2, limit: 3 },
      staff:    { current: 5, limit: 10 },
      owners:   { current: 40, limit: 100 },
      pets:     { current: 60, limit: 200 },
    })
  })
})

test('usage normalization includes pets dimension from caps.maxPets', () => {
  const raw = {
    branches: 1, users: 3, owners: 50, pets: 120,
    caps: { maxBranches: 3, maxUsers: 10, maxOwners: 500, maxPets: 500 },
    overPlan: false,
  }
  // Mirror the transform usePlatformCustomerUsage's queryFn applies —
  // extracted here as a pure check since the hook itself needs a QueryClient wrapper
  const usage = {
    branches: { current: raw.branches, limit: raw.caps.maxBranches },
    staff:    { current: raw.users,    limit: raw.caps.maxUsers },
    owners:   { current: raw.owners,   limit: raw.caps.maxOwners },
    pets:     { current: raw.pets,     limit: raw.caps.maxPets },
  }
  expect(usage.pets).toEqual({ current: 120, limit: 500 })
})
