/**
 * BUG-006 regression: the grooming status-update mutation must PUT to the
 * `/status` sub-resource, not the bare booking resource — the backend route
 * for status transitions lives at PUT /api/grooming/bookings/:id/status.
 */
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

const { putSpy, mutationFns } = vi.hoisted(() => ({
  putSpy: vi.fn(() => Promise.resolve({ data: { success: true } })),
  mutationFns: [] as Array<(vars: unknown) => unknown>,
}))

vi.mock('../../../utils/api', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: { data: [] } })),
    put: putSpy,
  },
}))

// Capture every mutationFn passed to useMutation so the test can invoke the
// status-update one directly, matching this suite's existing convention of
// mocking @tanstack/react-query wholesale instead of rendering a real
// QueryClientProvider tree.
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: [], isLoading: false, isError: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: ({ mutationFn }: { mutationFn: (vars: unknown) => unknown }) => {
    mutationFns.push(mutationFn)
    return { mutate: mutationFn, isPending: false }
  },
}))

import ClinicGrooming from '../ClinicGrooming'

describe('ClinicGrooming — status update URL (BUG-006)', () => {
  it('PUTs to /api/grooming/bookings/:id/status, not the bare booking URL', async () => {
    render(<ClinicGrooming />)

    // The second registered mutation is `updateStatus` (BookingModal's own
    // `create` mutation only mounts inside the modal, so on the base view
    // only `updateStatus` is registered).
    expect(mutationFns.length).toBeGreaterThan(0)
    const updateStatusFn = mutationFns[mutationFns.length - 1]
    updateStatusFn({ id: 42, status: 'in_progress' })

    expect(putSpy).toHaveBeenCalledWith('/api/grooming/bookings/42/status', { status: 'in_progress' })
  })
})
