/**
 * AdminBloodBank — clinic_staff view-only enforcement (MODAL-9).
 *
 * Added at Step 7 by @qa-agent. MODAL-9 carries this negative acceptance
 * criterion, added by BA sign-off §6 because the PM's task list omitted
 * `clinic_staff` as an actor on this screen entirely. Nothing in the branch
 * asserted it — `views/admin/__tests__/AdminBloodBank.test.tsx` covers the
 * three modals' open/submit/cancel/backdrop/Escape behaviour under a fully
 * privileged session only:
 *
 *   "clinic_staff is a third actor on this screen, view-only: the screen opens
 *    for clinic_staff (holds bloodbank.view) but any write modal must not
 *    submit — the underlying POST /blood-bank/... call returns 403 (server
 *    already enforces bloodbank.manage; verify no client-side bypass)"
 *
 * Per BA sign-off §4 Q3 the matrix is: clinic_admin V+E, doctor V+E,
 * clinic_staff V only. `blood-bank.routes.ts` implements exactly that —
 * `requirePlane('clinic')` + `bloodbank.view` on all three GETs,
 * `bloodbank.manage` on all three POSTs — and the route guard
 * `RequirePermission perm="bloodbank.view"` is asserted by
 * `__tests__/App.routeManifest.test.ts` ('blood-bank => bloodbank.view').
 *
 * `AdminBloodBank.tsx` has no client-side permission gate (unchanged by this
 * migration — the Step 7 diff audit found zero removed `Can`/`hasPermission`
 * lines in this file), so "must not submit" can only mean: the write goes to
 * the server, the server's denial is honoured, and nothing local fabricates a
 * donor/bag/transfusion that does not exist. BA §4 rates a wrong blood-bank
 * write as patient-safety severity, so a denial silently presenting as a
 * recorded collection is the failure this file exists to make impossible.
 *
 * Nothing here asserts screen-unreachability by legacy role string (BA F-3 /
 * R4): `AdminLayout.tsx:36` bounces both doctor and clinic_staff away from
 * this screen today for a stale-`role`-string reason that has nothing to do
 * with authorization. That is a known pre-existing defect filed separately,
 * and certifying it in a test is exactly what BA F-3 forbids.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

const DONOR = {
  id: 1,
  petId: 10,
  bloodType: 'DEA 1.1+',
  lastDonationAt: null,
  isEligible: true,
  notes: null,
  pet: { id: 10, name: 'Rex', species: 'dog' },
}

const BAG = {
  id: 7,
  donorId: 1,
  volumeMl: '450',
  collectedAt: '2026-09-01T00:00:00.000Z',
  expiryDate: '2026-12-01T00:00:00.000Z',
  status: 'available',
  donor: DONOR,
}

const SEARCH_HIT = {
  petId: 22,
  petName: 'Bella',
  species: 'dog',
  ownerId: 5,
  ownerName: 'Jane Doe',
  phone: '0800000000',
}

/** Forbidden envelope shaped as the blood-bank API returns it under a
 *  `requirePermission('bloodbank.manage')` denial — i.e. what a clinic_staff
 *  session gets back from every POST on this screen. */
function bloodbankForbidden(): unknown {
  return { response: { status: 403, data: { error: 'Missing permission: bloodbank.manage' } } }
}

const h = vi.hoisted(() => ({
  post: vi.fn((_url: string, _body?: unknown) => Promise.resolve({ data: { success: true } })),
  invalidateQueries: vi.fn(),
}))

vi.mock('../../../utils/api', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: { data: [] } })),
    post: h.post,
    put: vi.fn(() => Promise.resolve({ data: { success: true } })),
    delete: vi.fn(() => Promise.resolve({ data: { success: true } })),
  },
}))

vi.mock('../../../store/authStore', () => ({
  useAuthStore: (selector: (s: { branchId: number }) => unknown) => selector({ branchId: 1 }),
}))

vi.mock('../../../components/BranchSwitcher', () => ({ default: () => null }))

/**
 * Mutation shim with real success/failure semantics. The sibling
 * `AdminBloodBank.test.tsx` pins `isError: false`, so a rejected POST is not
 * expressible there at all — which is why the denial path had no coverage.
 */
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  const React = await import('react')
  return {
    ...actual,
    useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
      const [key, arg] = queryKey
      if (key === 'bb-donors') return { data: [DONOR], isLoading: false }
      if (key === 'bb-bags') return { data: [BAG], isLoading: false }
      if (key === 'bb-transfusions') return { data: [], isLoading: false }
      if (key === 'bb-search') return { data: arg ? [SEARCH_HIT] : [], isLoading: false }
      return { data: [], isLoading: false }
    },
    useMutation: ({
      mutationFn,
      onSuccess,
    }: {
      mutationFn?: (vars: unknown) => unknown
      onSuccess?: (data: unknown) => void
    }) => {
      const [error, setError] = React.useState<unknown>(null)
      return {
        mutate: (vars: unknown) => {
          setError(null)
          void Promise.resolve()
            .then(() => mutationFn?.(vars))
            .then(
              (data) => onSuccess?.(data),
              (err: unknown) => setError(err),
            )
        },
        isPending: false,
        isError: error !== null,
        error,
      }
    },
    useQueryClient: () => ({ invalidateQueries: h.invalidateQueries }),
  }
})

import AdminBloodBank from '../AdminBloodBank'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AdminBloodBank — clinic_staff holds bloodbank.view: the screen reads', () => {
  it('the screen and its donor inventory render — view is not blocked', () => {
    render(<AdminBloodBank />)
    expect(screen.getByText('Rex')).toBeInTheDocument()
  })
})

describe('AdminBloodBank — clinic_staff lacks bloodbank.manage: every write is denied server-side (MODAL-9 negative AC)', () => {
  it('MODAL-9-REGR: a denied donor registration keeps the dialog open and records nothing', async () => {
    h.post.mockRejectedValueOnce(bloodbankForbidden())
    render(<AdminBloodBank />)
    fireEvent.click(screen.getByText('Register Donor'))
    const dialog = screen.getByRole('dialog')

    fireEvent.change(within(dialog).getByPlaceholderText(/search pet by name/i), {
      target: { value: 'Bel' },
    })
    fireEvent.click(within(dialog).getByText('Bella'))
    fireEvent.click(within(dialog).getByText('Register'))

    await waitFor(() => {
      expect(screen.getByText('Missing permission: bloodbank.manage')).toBeInTheDocument()
    })
    expect(h.post).toHaveBeenCalledWith('/api/blood-bank/donors', expect.any(Object))
    // No donor was fabricated locally: the dialog is still open and the donor
    // list was never invalidated (which would imply a write landed).
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(h.invalidateQueries).not.toHaveBeenCalled()
  })

  it('MODAL-9-REGR: a denied collection keeps the dialog open and records no bag (patient-safety path)', async () => {
    h.post.mockRejectedValueOnce(bloodbankForbidden())
    render(<AdminBloodBank />)
    fireEvent.click(screen.getByText('Bag Inventory'))
    fireEvent.click(screen.getByText('Record Collection'))
    const dialog = screen.getByRole('dialog')

    fireEvent.change(within(dialog).getAllByRole('combobox')[0], { target: { value: String(DONOR.id) } })
    fireEvent.change(dialog.querySelector('input[type="date"]') as HTMLInputElement, {
      target: { value: '2026-12-01' },
    })
    fireEvent.click(within(dialog).getByText('Record Bag'))

    await waitFor(() => {
      expect(screen.getByText('Missing permission: bloodbank.manage')).toBeInTheDocument()
    })
    expect(h.post).toHaveBeenCalledWith('/api/blood-bank/collections', expect.any(Object))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(h.invalidateQueries).not.toHaveBeenCalled()
  })

  it('MODAL-9-REGR: the denied collection dialog keeps dismissal="explicit" — backdrop stays a no-op after the 403', async () => {
    h.post.mockRejectedValueOnce(bloodbankForbidden())
    render(<AdminBloodBank />)
    fireEvent.click(screen.getByText('Bag Inventory'))
    fireEvent.click(screen.getByText('Record Collection'))
    const dialog = screen.getByRole('dialog')

    fireEvent.change(within(dialog).getAllByRole('combobox')[0], { target: { value: String(DONOR.id) } })
    fireEvent.change(dialog.querySelector('input[type="date"]') as HTMLInputElement, {
      target: { value: '2026-12-01' },
    })
    fireEvent.click(within(dialog).getByText('Record Bag'))
    await waitFor(() => {
      expect(screen.getByText('Missing permission: bloodbank.manage')).toBeInTheDocument()
    })

    // A stray backdrop tap must not discard the entry the user now has to
    // take to someone who holds bloodbank.manage.
    fireEvent.click(dialog.parentElement as HTMLElement)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Missing permission: bloodbank.manage')).toBeInTheDocument()
  })

  it('counterpart: with bloodbank.manage granted, the same donor registration succeeds and closes', async () => {
    render(<AdminBloodBank />)
    fireEvent.click(screen.getByText('Register Donor'))
    const dialog = screen.getByRole('dialog')

    fireEvent.change(within(dialog).getByPlaceholderText(/search pet by name/i), {
      target: { value: 'Bel' },
    })
    fireEvent.click(within(dialog).getByText('Bella'))
    fireEvent.click(within(dialog).getByText('Register'))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(h.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['bb-donors'] })
  })
})
