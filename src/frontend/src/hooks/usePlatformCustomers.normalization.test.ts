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
import { describe, it, expect, vi } from 'vitest'

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
  caps: { maxBranches: 3, maxUsers: 10, maxOwners: 100 },
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
    })
  })
})
