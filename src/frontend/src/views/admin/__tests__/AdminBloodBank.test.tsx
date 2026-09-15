/**
 * AdminBloodBank — first real test coverage (MODAL-9).
 *
 * Added at Step 7 by @qa-agent. MODAL-9's acceptance criterion reads:
 *
 *   "Zero test coverage today (confirmed) — this task adds first coverage:
 *    open, submit, cancel, backdrop, Escape for each distinct modal in the file"
 *
 * What actually shipped from W2 was two render-only smoke assertions for
 * `Register Donor` inside `__tests__/modal-consistency.test.ts` (the tablet
 * viewport pass). `CollectionModal` and `TransfusionModal` had none at all,
 * and no submit / cancel / backdrop / Escape assertion existed for any of the
 * three. This file closes that gap.
 *
 * Why it matters more here than elsewhere in the feature:
 *   - `TransfusionModal` is the modal a rate-limited W2 agent left referencing
 *     the deleted local `Modal`; it was repaired by hand by the orchestrator
 *     mid-wave, so it is the least-exercised code path in the branch.
 *   - It carries `dismissal="explicit"` deliberately (a stray backdrop tap must
 *     not discard a half-entered transfusion match). Nothing asserted that, so
 *     a regression to the `dismissible` default would have shipped green.
 *   - It owns the blood-type compatibility guard (mismatch warning + explicit
 *     risk acknowledgement before Record enables). BA sign-off §4 rates a wrong
 *     blood-bank write as patient-safety severity; that guard had no test.
 *
 * Authorization note (BA F-3 / R4): these are client-behaviour tests only. The
 * authorization boundary for this screen is the server —
 * `blood-bank.routes.ts` declares `requirePlane('clinic')` +
 * `bloodbank.view` on every GET and `bloodbank.manage` on every POST — and the
 * route guard `RequirePermission perm="bloodbank.view"` is asserted by
 * `__tests__/App.routeManifest.test.ts`. Nothing here asserts
 * screen-unreachability by legacy role string.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import AdminBloodBank from '../AdminBloodBank'

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

const h = vi.hoisted(() => ({
  post: vi.fn(() => Promise.resolve({ data: { success: true } })),
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

// Query/mutation shim: resolves each screen query from a fixture by key and
// routes `mutate` straight at the real `mutationFn`, so the asserted POST body
// is the component's own payload, not a test-authored one.
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
      const [key, arg] = queryKey
      if (key === 'bb-donors') return { data: [DONOR], isLoading: false }
      if (key === 'bb-bags') return { data: [BAG], isLoading: false }
      if (key === 'bb-transfusions') return { data: [], isLoading: false }
      // PetSearch: mirror the component's `enabled: q.length >= 1` so the
      // result dropdown only appears once something has been typed.
      if (key === 'bb-search') return { data: arg ? [SEARCH_HIT] : [], isLoading: false }
      return { data: [], isLoading: false }
    },
    useMutation: ({ mutationFn }: { mutationFn?: (vars: unknown) => unknown }) => ({
      mutate: (vars: unknown) => mutationFn?.(vars),
      mutateAsync: (vars: unknown) => Promise.resolve(mutationFn?.(vars)),
      isPending: false,
      isError: false,
      error: null,
    }),
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  }
})

/** Opens one of the three modals from its own tab. */
function openModal(which: 'donor' | 'collection' | 'transfusion'): HTMLElement {
  if (which === 'collection') fireEvent.click(screen.getByText('Bag Inventory'))
  if (which === 'transfusion') fireEvent.click(screen.getByText('Transfusions'))

  const trigger = { donor: 'Register Donor', collection: 'Record Collection', transfusion: 'Record Transfusion' }[which]
  fireEvent.click(screen.getByText(trigger))
  return screen.getByRole('dialog')
}

/** Selects a pet through the shared PetSearch field inside `dialog`. */
function selectPet(dialog: HTMLElement): void {
  fireEvent.change(within(dialog).getByPlaceholderText(/search pet by name/i), { target: { value: 'Bel' } })
  fireEvent.click(within(dialog).getByText('Bella'))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AdminBloodBank — DonorModal (MODAL-9, dismissible default)', () => {
  it('opens from "Register Donor" with an <h2> title and a close control', () => {
    render(<AdminBloodBank />)
    const dialog = openModal('donor')
    expect(within(dialog).getByRole('heading', { level: 2, name: 'Register Donor' })).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Close dialog')).toBeInTheDocument()
  })

  it('Cancel closes without submitting', () => {
    render(<AdminBloodBank />)
    const dialog = openModal('donor')
    fireEvent.click(within(dialog).getByText('Cancel'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(h.post).not.toHaveBeenCalled()
  })

  it('backdrop click closes without submitting (dismissal defaults to dismissible)', () => {
    render(<AdminBloodBank />)
    const dialog = openModal('donor')
    fireEvent.click(dialog.parentElement as HTMLElement)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(h.post).not.toHaveBeenCalled()
  })

  it('Escape closes without submitting', () => {
    render(<AdminBloodBank />)
    openModal('donor')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(h.post).not.toHaveBeenCalled()
  })

  it('Register is disabled until a donor pet is chosen, then POSTs /api/blood-bank/donors', () => {
    render(<AdminBloodBank />)
    const dialog = openModal('donor')

    expect(within(dialog).getByText('Register').closest('button')).toBeDisabled()
    selectPet(dialog)
    fireEvent.click(within(dialog).getByText('Register'))

    expect(h.post).toHaveBeenCalledWith(
      '/api/blood-bank/donors',
      expect.objectContaining({ petId: SEARCH_HIT.petId, bloodType: 'DEA 1.1+' }),
    )
  })
})

describe('AdminBloodBank — CollectionModal (MODAL-9, dismissal="explicit")', () => {
  it('opens from "Record Collection" with an <h2> title and a close control', () => {
    render(<AdminBloodBank />)
    const dialog = openModal('collection')
    expect(within(dialog).getByRole('heading', { level: 2, name: 'Record Collection' })).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Close dialog')).toBeInTheDocument()
  })

  it('Cancel closes without submitting', () => {
    render(<AdminBloodBank />)
    const dialog = openModal('collection')
    fireEvent.click(within(dialog).getByText('Cancel'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(h.post).not.toHaveBeenCalled()
  })

  // MODAL-9's AC fixes the policy per modal: "'explicit' for any modal
  // recording a collection/transfusion match, 'dismissible' for view-only
  // detail". This modal records a collection, so a stray backdrop tap beside a
  // half-entered bag must not discard it. It shipped on the dismissible
  // default; corrected at Step 7 (@qa-agent) alongside the /code-review
  // finding that flagged the within-screen inconsistency.
  it('backdrop click is a NO-OP — the half-entered collection is not discarded', () => {
    render(<AdminBloodBank />)
    const dialog = openModal('collection')
    fireEvent.change(within(dialog).getAllByRole('combobox')[0], { target: { value: String(DONOR.id) } })

    fireEvent.click(dialog.parentElement as HTMLElement)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(within(screen.getByRole('dialog')).getAllByRole('combobox')[0]).toHaveValue(String(DONOR.id))
    expect(h.post).not.toHaveBeenCalled()
  })

  it('Escape closes (explicit keeps the keyboard cancel affordance) without submitting', () => {
    render(<AdminBloodBank />)
    openModal('collection')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(h.post).not.toHaveBeenCalled()
  })

  it('Record Bag stays disabled until donor + expiry are set, then POSTs /api/blood-bank/collections', () => {
    render(<AdminBloodBank />)
    const dialog = openModal('collection')

    expect(within(dialog).getByText('Record Bag').closest('button')).toBeDisabled()

    fireEvent.change(within(dialog).getAllByRole('combobox')[0], { target: { value: String(DONOR.id) } })
    fireEvent.change(dialog.querySelector('input[type="date"]') as HTMLInputElement, {
      target: { value: '2026-12-01' },
    })
    fireEvent.click(within(dialog).getByText('Record Bag'))

    expect(h.post).toHaveBeenCalledWith(
      '/api/blood-bank/collections',
      expect.objectContaining({ donorId: DONOR.id, volumeMl: 450 }),
    )
  })
})

describe('AdminBloodBank — TransfusionModal (MODAL-9, dismissal="explicit")', () => {
  it('opens from "Record Transfusion" with an <h2> title and a close control', () => {
    render(<AdminBloodBank />)
    const dialog = openModal('transfusion')
    expect(within(dialog).getByRole('heading', { level: 2, name: 'Record Transfusion' })).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Close dialog')).toBeInTheDocument()
  })

  // The reason this modal is 'explicit' and not the dismissible default: a
  // stray backdrop tap beside a half-entered transfusion match must not throw
  // the entry away. Regression guard on ADR-0027's derived-behaviour table.
  it('backdrop click is a NO-OP — the half-entered transfusion is not discarded', () => {
    render(<AdminBloodBank />)
    const dialog = openModal('transfusion')
    selectPet(dialog)

    fireEvent.click(dialog.parentElement as HTMLElement)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(within(screen.getByRole('dialog')).getByText('Bella', { exact: false })).toBeInTheDocument()
    expect(h.post).not.toHaveBeenCalled()
  })

  it('Escape closes (explicit keeps the keyboard cancel affordance) without submitting', () => {
    render(<AdminBloodBank />)
    openModal('transfusion')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(h.post).not.toHaveBeenCalled()
  })

  it('Cancel closes without submitting', () => {
    render(<AdminBloodBank />)
    const dialog = openModal('transfusion')
    fireEvent.click(within(dialog).getByText('Cancel'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(h.post).not.toHaveBeenCalled()
  })

  it('Record is disabled until a recipient pet is chosen, then POSTs /api/blood-bank/transfusions', () => {
    render(<AdminBloodBank />)
    const dialog = openModal('transfusion')

    expect(within(dialog).getByText('Record').closest('button')).toBeDisabled()
    selectPet(dialog)
    fireEvent.click(within(dialog).getByText('Record'))

    expect(h.post).toHaveBeenCalledWith(
      '/api/blood-bank/transfusions',
      expect.objectContaining({ recipientPetId: SEARCH_HIT.petId, volumeMl: 200 }),
    )
  })

  // Patient-safety guard (BA §4: "a non-clinician recording a transfusion
  // match — patient-safety severity"). Untested before this file.
  it('blood-type mismatch blocks Record until the risk is explicitly acknowledged', () => {
    render(<AdminBloodBank />)
    const dialog = openModal('transfusion')
    selectPet(dialog)

    const [recipientTypeSelect, bagSelect] = within(dialog).getAllByRole('combobox')
    fireEvent.change(recipientTypeSelect, { target: { value: 'DEA 1.1-' } }) // bag is DEA 1.1+
    fireEvent.change(bagSelect, { target: { value: String(BAG.id) } })

    expect(within(dialog).getByText(/blood type mismatch/i)).toBeInTheDocument()
    expect(within(dialog).getByText('Record').closest('button')).toBeDisabled()

    fireEvent.click(within(dialog).getByRole('checkbox'))
    expect(within(dialog).getByText('Record').closest('button')).not.toBeDisabled()

    fireEvent.click(within(dialog).getByText('Record'))
    expect(h.post).toHaveBeenCalledWith(
      '/api/blood-bank/transfusions',
      expect.objectContaining({ acknowledgeMismatch: true, recipientBloodType: 'DEA 1.1-' }),
    )
  })

  it('changing the selected bag resets a prior mismatch acknowledgement', () => {
    render(<AdminBloodBank />)
    const dialog = openModal('transfusion')
    selectPet(dialog)

    const [recipientTypeSelect, bagSelect] = within(dialog).getAllByRole('combobox')
    fireEvent.change(recipientTypeSelect, { target: { value: 'DEA 1.1-' } })
    fireEvent.change(bagSelect, { target: { value: String(BAG.id) } })
    fireEvent.click(within(dialog).getByRole('checkbox'))
    expect(within(dialog).getByText('Record').closest('button')).not.toBeDisabled()

    // Re-selecting a bag clears `ack` — the acknowledgement must not carry
    // over to a different bag/recipient pairing.
    fireEvent.change(bagSelect, { target: { value: String(BAG.id) } })
    expect(within(dialog).getByRole('checkbox')).not.toBeChecked()
    expect(within(dialog).getByText('Record').closest('button')).toBeDisabled()
  })
})
