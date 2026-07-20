/**
 * T-5F-02 — Platform Console screens frontend QA (@qa-agent)
 *
 * Framework: Vitest + React Testing Library (matches RoleEditorView.test.tsx).
 * Strategy: mock the platform hooks (network) and react-router, then drive the
 * REAL view components (CustomerListView, CustomerDetailView, PlatformPlansView,
 * PlatformAuditView). Adversarial: assert the INTENDED component contract and let
 * the wiring bugs surface as failures (documented in the QA summary).
 *
 * AC coverage (task brief, frontend):
 *  AC-F1 Customer list renders subdomain, plan, status, userCount.
 *  AC-F2 "Add Customer" form requires planId (native required <select>).
 *  AC-F3 CustomerDetail has 4 tabs; Usage tab shows progress bars.
 *  AC-F4 Suspend button calls suspend API.
 *  AC-F5 Plans CRUD: create appears in list; retired plan shows "Retired".
 *  AC-F6 Audit view filters drive the hook (date range, action, tenantId).
 *
 * Note: `usePlatformCustomerUsage` (usePlatformCustomers.ts) and `usePlatformAudit`
 * (usePlatformAudit.ts) already normalize their raw backend envelopes into the
 * shapes UsageTab / the audit table expect. That real, unmocked normalization logic
 * is covered by a dedicated hook test — see
 * `src/frontend/src/hooks/usePlatformCustomers.normalization.test.ts` (ADR-0007 D6c).
 * The tests below mock the hooks themselves and feed them the already-normalized
 * shape, so they exercise component rendering, not hook normalization.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'

// CustomerDetailView's OverviewTab calls the raw `useQuery` (not a custom hook)
// for the company-types picker — mock it so the view doesn't need a real
// QueryClientProvider, matching the pattern used by Dashboard.i18n/OwnerPanel tests.
// The queryFn is captured (not invoked) so BUG-007's regression test can assert
// which API client + path CustomerDetailView wires up, without needing a live
// QueryClientProvider render.
const queryFns = vi.hoisted(() => [] as Array<() => unknown>)
vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryFn }: { queryFn: () => unknown }) => {
    queryFns.push(queryFn)
    return { data: [], isLoading: false }
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

// Plane client separation (BUG-007): the clinic `api` client must never be used
// for platform-plane calls — company-types must go through `platformApi`.
vi.mock('../utils/api', () => ({
  default: { get: vi.fn(() => Promise.reject(new Error('clinic api client must not be called from platform views'))) },
}))
vi.mock('../utils/platformApi', () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: { data: [] } })) },
}))

// ── Hoisted mutation spies ──────────────────────────────────────────────────
const h = vi.hoisted(() => ({
  createCustomer:   vi.fn(),
  suspend:          vi.fn(),
  reactivate:       vi.fn(),
  createPlan:       vi.fn(),
  retirePlan:       vi.fn(),
  navigate:         vi.fn(),
  auditQueryFn:     vi.fn(),
  setCustomerQuota: vi.fn(),
}))

// ── react-router-dom mock ───────────────────────────────────────────────────
vi.mock('react-router-dom', () => ({
  useNavigate: () => h.navigate,
  useParams:   () => ({ id: '42' }),
}))

// ── Hook mocks (state injected per-test) ────────────────────────────────────
const state = vi.hoisted(() => ({
  customers: [] as unknown[],
  plans:     [] as unknown[],
  customer:  null as unknown,
  usage:     null as unknown,
  audit:     [] as unknown[],
}))

vi.mock('../hooks/usePlatformCustomers', () => ({
  usePlatformCustomers:      () => ({ data: state.customers, isLoading: false, isError: false }),
  usePlatformCustomer:       () => ({ data: state.customer }),
  usePlatformCustomerUsage:  () => ({ data: state.usage, isLoading: false, isError: false }),
  useCreatePlatformCustomer: () => ({ mutate: h.createCustomer, isPending: false, error: null }),
  useUpdatePlatformCustomer: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useSuspendCustomer:        () => ({ mutate: h.suspend, isPending: false }),
  useReactivateCustomer:     () => ({ mutate: h.reactivate, isPending: false }),
  useSetCustomerQuota:       () => ({ mutate: h.setCustomerQuota, isPending: false, error: null }),
}))

vi.mock('../hooks/usePlatformPlans', () => ({
  usePlatformPlans:       () => ({ data: state.plans, isLoading: false }),
  useCreatePlatformPlan:  () => ({ mutate: h.createPlan, isPending: false, error: null }),
  useUpdatePlatformPlan:  () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useRetirePlatformPlan:  () => ({ mutate: h.retirePlan, isPending: false }),
}))

vi.mock('../hooks/usePlatformAudit', () => ({
  usePlatformAudit: (filters: unknown) => {
    h.auditQueryFn(filters)
    return { data: state.audit, isLoading: false, isError: false, refetch: vi.fn() }
  },
}))

// Imported AFTER mocks so the views resolve the mocked hooks.
import CustomerListView from '../views/platform/CustomerListView'
import CustomerDetailView from '../views/platform/CustomerDetailView'
import PlatformPlansView from '../views/platform/PlatformPlansView'
import PlatformAuditView from '../views/platform/PlatformAuditView'

beforeEach(() => {
  vi.clearAllMocks()
  state.customers = []
  state.plans     = []
  state.customer  = null
  state.usage     = null
  state.audit     = []
  queryFns.length = 0
})

// ─────────────────────────────────────────────────────────────────────────────
// AC-F1 — Customer list renders subdomain, plan, status, userCount
// ─────────────────────────────────────────────────────────────────────────────
describe('AC-F1 — CustomerListView rows', () => {
  it('✅ renders subdomain, name, plan, status badge, and userCount', () => {
    state.customers = [
      { id: 1, subdomain: 'happypaws', name: 'Happy Paws', planName: 'Professional', status: 'active', userCount: 7 },
    ]
    state.plans = [{ id: 5, name: 'Professional', isRetired: false }]
    render(<CustomerListView />)

    expect(screen.getByText('happypaws')).toBeInTheDocument()
    expect(screen.getByText('Happy Paws')).toBeInTheDocument()
    expect(screen.getByText('Professional')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
    // status badge — text is the status string
    expect(screen.getByText(/active/i)).toBeInTheDocument()
  })

  it('✅ empty list → "No customers yet" empty state', () => {
    render(<CustomerListView />)
    expect(screen.getByText(/No customers yet/i)).toBeInTheDocument()
  })

  it('✅ clicking a row navigates to the detail route', () => {
    state.customers = [
      { id: 9, subdomain: 'sub9', name: 'Nine', planName: 'Starter', status: 'active', userCount: 1 },
    ]
    render(<CustomerListView />)
    fireEvent.click(screen.getByText('Nine'))
    expect(h.navigate).toHaveBeenCalledWith('/platform/customers/9')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// AC-F2 — Add Customer form requires planId
// ─────────────────────────────────────────────────────────────────────────────
describe('AC-F2 — Add Customer form requires planId', () => {
  it('✅ plan <select> is marked required (native validation gate)', () => {
    state.plans = [{ id: 5, name: 'Professional', isRetired: false }]
    render(<CustomerListView />)
    fireEvent.click(screen.getByRole('button', { name: /Add Customer/i }))
    const select = screen.getByLabelText(/Plan/i) as HTMLSelectElement
    expect(select).toBeRequired()
    // default option has empty value → invalid until a real plan is chosen
    expect(select.value).toBe('')
    expect(select.checkValidity()).toBe(false)
  })

  it('✅ retired plans are NOT offered in the plan dropdown', () => {
    state.plans = [
      { id: 5, name: 'Professional', isRetired: false },
      { id: 6, name: 'Legacy', isRetired: true },
    ]
    render(<CustomerListView />)
    fireEvent.click(screen.getByRole('button', { name: /Add Customer/i }))
    const select = screen.getByLabelText(/Plan/i)
    expect(within(select).queryByText('Legacy')).not.toBeInTheDocument()
    expect(within(select).getByText('Professional')).toBeInTheDocument()
  })

  it('✅ submitting a complete form calls createCustomer with a numeric planId', () => {
    state.plans = [{ id: 5, name: 'Professional', isRetired: false }]
    render(<CustomerListView />)
    fireEvent.click(screen.getByRole('button', { name: /Add Customer/i }))
    fireEvent.change(screen.getByLabelText(/Clinic Name/i), { target: { value: 'New Clinic' } })
    fireEvent.change(screen.getByLabelText(/Subdomain/i),   { target: { value: 'newclinic' } })
    fireEvent.change(screen.getByLabelText(/Plan/i),        { target: { value: '5' } })
    fireEvent.submit(screen.getByText(/Create Customer/i).closest('form')!)
    expect(h.createCustomer).toHaveBeenCalledTimes(1)
    const payload = h.createCustomer.mock.calls[0][0]
    expect(payload.planId).toBe(5)
    expect(typeof payload.planId).toBe('number')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// AC-F3 — CustomerDetail has 4 tabs; Usage tab shows progress bars
// ─────────────────────────────────────────────────────────────────────────────
describe('AC-F3 — CustomerDetailView tabs + usage', () => {
  beforeEach(() => {
    state.customer = { id: 42, name: 'Detail Co', subdomain: 'detailco', status: 'active' }
  })

  it('✅ renders exactly 4 tabs: Overview, Plan & Quota, Provisioning, Usage', () => {
    render(<CustomerDetailView />)
    expect(screen.getByRole('button', { name: 'Overview' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Plan & Quota/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Provisioning' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Usage' })).toBeInTheDocument()
  })

  it('✅ Usage tab renders Branches/Staff/Customers progress bars (component-expected shape)', () => {
    // Shape the COMPONENT expects (nested current/limit). See contract test below
    // for why the live backend payload does NOT match this.
    state.usage = {
      branches: { current: 2, limit: 3 },
      staff:    { current: 5, limit: 10 },
      owners:   { current: 40, limit: 100 },
    }
    render(<CustomerDetailView />)
    fireEvent.click(screen.getByRole('button', { name: 'Usage' }))
    expect(screen.getByText('Live Usage')).toBeInTheDocument()
    expect(screen.getByText('Branches')).toBeInTheDocument()
    expect(screen.getByText('Staff')).toBeInTheDocument()
    expect(screen.getByText('Customers')).toBeInTheDocument()
  })

  it('fetches company-types via platformApi, never the clinic api client (BUG-007)', async () => {
    const apiModule = await import('../utils/api')
    const platformApiModule = await import('../utils/platformApi')
    render(<CustomerDetailView />)

    expect(queryFns.length).toBeGreaterThan(0)
    // Invoke the captured company-types queryFn directly (mirrors how React
    // Query itself would call it) and assert it resolves via platformApi.
    await queryFns[queryFns.length - 1]()

    expect(platformApiModule.default.get).toHaveBeenCalledWith('/platform/company-types')
    expect(apiModule.default.get).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Plan & Quota tab — Max Pets per-tenant override
// ─────────────────────────────────────────────────────────────────────────────
describe('Quota tab — Max Pets override', () => {
  it('✅ setting a Max Pets override submits it via PUT quota, and shows the effective value on load', () => {
    state.customer = {
      id: 42, name: 'Detail Co', subdomain: 'detailco', status: 'active',
      planId: 1, maxBranches: null, maxUsers: null, maxOwners: null, maxPets: 300,
    }
    render(<CustomerDetailView />)
    fireEvent.click(screen.getByRole('button', { name: /Plan & Quota/i }))

    expect(screen.getByLabelText('Max Pets')).toHaveValue(300)
    fireEvent.change(screen.getByLabelText('Max Pets'), { target: { value: '400' } })
    fireEvent.click(screen.getByText('Save Quotas'))

    expect(h.setCustomerQuota).toHaveBeenCalledWith(
      expect.objectContaining({ maxPets: 400 }),
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// AC-F4 — Suspend button calls suspend API
// ─────────────────────────────────────────────────────────────────────────────
describe('AC-F4 — suspend / reactivate', () => {
  it('✅ active tenant → "Suspend Tenant" button calls suspend.mutate', () => {
    state.customer = { id: 42, name: 'Detail Co', subdomain: 'detailco', status: 'active' }
    render(<CustomerDetailView />)
    // Overview tab is default; suspend button lives there
    fireEvent.click(screen.getByRole('button', { name: /Suspend Tenant/i }))
    expect(h.suspend).toHaveBeenCalledTimes(1)
  })

  it('✅ suspended tenant → shows "Reactivate Tenant" instead', () => {
    state.customer = { id: 42, name: 'Detail Co', subdomain: 'detailco', status: 'suspended' }
    render(<CustomerDetailView />)
    expect(screen.getByRole('button', { name: /Reactivate Tenant/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Suspend Tenant/i })).not.toBeInTheDocument()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// AC-F5 — Plans CRUD: create appears in list; retired plan shows "Retired"
// ─────────────────────────────────────────────────────────────────────────────
describe('AC-F5 — PlatformPlansView CRUD', () => {
  it('✅ active plan row renders with edit + retire actions', () => {
    state.plans = [{ id: 1, key: 'pro', name: 'Professional', price: 1200, maxBranches: 3, maxUsers: 20, maxOwners: 5000, isRetired: false }]
    render(<PlatformPlansView />)
    expect(screen.getByText('Professional')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Retire Professional/i })).toBeInTheDocument()
  })

  it('✅ retired plan shows "Retired" badge and no retire button (soft-delete)', () => {
    state.plans = [{ id: 2, key: 'legacy', name: 'Legacy', price: 0, maxBranches: 1, maxUsers: 5, maxOwners: 500, isRetired: true }]
    render(<PlatformPlansView />)
    expect(screen.getByText('Retired')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Retire Legacy/i })).not.toBeInTheDocument()
  })

  it('✅ "New Plan" opens create modal; submit calls createPlan', () => {
    render(<PlatformPlansView />)
    fireEvent.click(screen.getByRole('button', { name: /New Plan/i }))
    const form = screen.getByText(/^Create$|Save/i).closest('form')!
    fireEvent.submit(form)
    expect(h.createPlan).toHaveBeenCalledTimes(1)
  })

  it('✅ retire action on an active plan calls retirePlan.mutate', () => {
    state.plans = [{ id: 1, key: 'pro', name: 'Professional', price: 1200, maxBranches: 3, maxUsers: 20, maxOwners: 5000, isRetired: false }]
    render(<PlatformPlansView />)
    fireEvent.click(screen.getByRole('button', { name: /Retire Professional/i }))
    expect(h.retirePlan).toHaveBeenCalledTimes(1)
  })

  it('✅ creating a plan with a Max Pets value submits maxPets in the payload', () => {
    render(<PlatformPlansView />)
    fireEvent.click(screen.getByRole('button', { name: /New Plan/i }))
    fireEvent.change(screen.getByLabelText(/^Key/),          { target: { value: 'test_plan' } })
    fireEvent.change(screen.getByLabelText(/Display Name/),  { target: { value: 'Test Plan' } })
    fireEvent.change(screen.getByLabelText(/Max Branches/),  { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText(/Max Users/),     { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText(/Max Pets/),      { target: { value: '500' } })
    const form = screen.getByText(/^Create Plan$/).closest('form')!
    fireEvent.submit(form)
    expect(h.createPlan).toHaveBeenCalledTimes(1)
    const payload = h.createPlan.mock.calls[0][0] as { maxPets: number }
    expect(payload.maxPets).toBe(500)
  })

  it('✅ plans table renders a Pets column with correct values, including infinity for null', () => {
    state.plans = [
      { id: 1, key: 'clinic_plus', name: 'Clinic Plus', price: 0, maxBranches: 10, maxUsers: 100, maxOwners: null, maxPets: null, features: [], isRetired: false, createdAt: null },
    ]
    render(<PlatformPlansView />)
    // Both Clients and Pets columns render '∞' for their null values.
    expect(screen.getAllByText('∞')).toHaveLength(2)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// AC-F6 — Audit view filters drive the hook
// ─────────────────────────────────────────────────────────────────────────────
describe('AC-F6 — PlatformAuditView filters', () => {
  it('✅ typing filters passes from/to/action/tenantId into usePlatformAudit', () => {
    render(<PlatformAuditView />)
    fireEvent.change(screen.getByLabelText('From'),      { target: { value: '2026-01-01' } })
    fireEvent.change(screen.getByLabelText('To'),        { target: { value: '2026-01-31' } })
    fireEvent.change(screen.getByLabelText('Action'),    { target: { value: 'tenant.suspend' } })
    fireEvent.change(screen.getByLabelText('Tenant ID'), { target: { value: '12' } })

    const lastCall = h.auditQueryFn.mock.calls.at(-1)![0] as {
      from?: string; to?: string; action?: string; tenantId?: number
    }
    expect(lastCall.from).toBe('2026-01-01')
    expect(lastCall.to).toBe('2026-01-31')
    expect(lastCall.action).toBe('tenant.suspend')
    expect(lastCall.tenantId).toBe(12)
  })

  it('✅ Clear resets all filters back to undefined', () => {
    render(<PlatformAuditView />)
    fireEvent.change(screen.getByLabelText('Action'), { target: { value: 'plan.delete' } })
    fireEvent.click(screen.getByRole('button', { name: /Clear/i }))
    const lastCall = h.auditQueryFn.mock.calls.at(-1)![0] as { action?: string }
    expect(lastCall.action).toBeUndefined()
  })

  it('✅ empty audit list → "No audit entries found" empty state', () => {
    render(<PlatformAuditView />)
    expect(screen.getByText(/No audit entries found/i)).toBeInTheDocument()
  })
})
