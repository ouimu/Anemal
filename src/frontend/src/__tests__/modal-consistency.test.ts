/**
 * Task MODAL-13 — cross-cutting consistency + census verification
 * (docs/superpowers/plans/2026-09-11-modal-consolidation.md, arch brief §7,
 * docs/adr/0027-shared-modal-dismissal-policy-and-plane-neutrality.md).
 *
 * Runs after MODAL-2..MODAL-10 and MODAL-12 have landed (NOT MODAL-11 —
 * resequenced after this task per D-3). Five independent checks:
 *
 *  1. Census — every hand-rolled modal-root signature in src/frontend/src
 *     equals the checked-in KNOWN_BESPOKE_MODALS allowlist exactly (no
 *     subset/superset tolerance). Replaces the unsatisfiable/tautological
 *     "diff-check" AC (BA F-6, arch brief §7).
 *  2. Plane-neutrality re-affirmation (R7) — Dialog.tsx still imports only
 *     react + MaterialIcon, as part of this full-suite pass.
 *  3. Design-system conformance — zero raw hex, zero non-token font sizes
 *     across the migrated content.
 *  4. Platform-plane regression (BA F-7) — the 5 pre-existing Dialog
 *     consumers still open/close and expose the expected structure.
 *  5. Tablet viewport smoke-check (768/1024) for every Tablet/Both-device
 *     migrated site.
 *
 * File extension is deliberately `.test.ts`, not `.test.tsx` (frozen by the
 * arch brief and plan) — every render below therefore goes through
 * `createElement`, never JSX, since esbuild does not parse JSX in a `.ts`
 * file.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { createElement } from 'react'

// ════════════════════════════════════════════════════════════════════════
// §1 — Census: KNOWN_BESPOKE_MODALS allowlist (arch brief §7)
// ════════════════════════════════════════════════════════════════════════

interface BespokeModalEntry {
  /** Expected hand-rolled modal-root count for this file. */
  count: number
  /** Why this file is not migrated onto the shared Dialog shell. */
  reason: string
}

/**
 * Keyed by path -> expected root count, never by file:line (a line-keyed
 * list breaks on every unrelated edit to an allowlisted file and gets
 * "repaired" by renumbering, which silently re-blesses whatever moved).
 * Verified against `main` by direct file inspection for this task, not
 * copied blindly from the plan/arch-brief tables.
 */
const KNOWN_BESPOKE_MODALS: Record<string, BespokeModalEntry> = {
  'views/clinic/ClinicBilling.tsx': {
    count: 5,
    reason: 'Phase 7 god-component — out of scope (PM §5); characterization tests + decomposition first.',
  },
  'views/clinic/ClinicPets.tsx': {
    count: 5,
    reason: 'Phase 7 god-component — out of scope (PM §5); characterization tests + decomposition first.',
  },
  'views/clinic/ClinicInpatient.tsx': {
    count: 4,
    reason: 'Phase 7 god-component — out of scope (PM §5); characterization tests + decomposition first.',
  },
  'views/admin/UserManagementTab.tsx': {
    count: 2,
    reason:
      'Main user-edit modal (sticky-footer/local-Modal conflict, excluded by Step 1 sign-off) + ' +
      'self-demotion confirm (out of scope per human decision D-2, arch brief §10) — both stay bespoke.',
  },
  'components/ResponsiveSidebar.tsx': {
    count: 2,
    reason:
      'Responsive sidebar drawer (ADR-0033): backdrop + dialog panel, no title/footer/dismissal policy of a ' +
      'Dialog consumer; no focus trap, matching Dialog.',
  },
}

/** Strips /* ... *\/ block comments (including JSDoc) before signature scanning.
 *  This is the guard against the false-positive class this task was warned
 *  about: a doc comment that merely *mentions* `role="alertdialog"` or
 *  `fixed inset-0` as prose (e.g. IdleLogoutModal.tsx's migration note) must
 *  never be counted as a hand-rolled root. JSX comments (`{/* ... *\/}`)
 *  are also removed by this pass — they use the same `/* *\/` delimiters,
 *  just wrapped in braces that are left behind (harmless, empty `{}`).
 */
function stripBlockComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '')
}

/**
 * True when a single JSX opening tag's text carries a hand-rolled
 * modal-root signature: a `fixed` + `inset-0` className pair, or a literal
 * `role="dialog"` / `role="alertdialog"` attribute value.
 */
function isHandRolledModalRoot(tagText: string): boolean {
  const classMatch = tagText.match(/className\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\})/)
  const classList = (classMatch?.[1] ?? classMatch?.[2] ?? classMatch?.[3] ?? '').split(/\s+/)
  const hasFixedInset0 = classList.includes('fixed') && classList.includes('inset-0')

  const roleMatch = tagText.match(
    /role\s*=\s*(?:"(dialog|alertdialog)"|'(dialog|alertdialog)'|\{\s*['"](dialog|alertdialog)['"]\s*\})/,
  )

  return hasFixedInset0 || roleMatch !== null
}

/**
 * Counts hand-rolled modal-root opening tags in one file's source.
 *
 * Scans JSX attribute usage specifically — not any string occurrence of the
 * signature text — by walking each `<Tag ...>` opening tag character by
 * character, tracking brace depth and quote state so an embedded event
 * handler (`onClick={() => x}`, whose arrow contains a bare `>`) cannot
 * terminate the tag early or leak a false match from the tag that follows.
 */
function countHandRolledRoots(rawSource: string): number {
  const source = stripBlockComments(rawSource)
  let count = 0
  let cursor = 0

  while (cursor < source.length) {
    const tagOpenMatch = /<[A-Za-z][A-Za-z0-9.]*/.exec(source.slice(cursor))
    if (!tagOpenMatch || tagOpenMatch.index === undefined) break
    const tagStart = cursor + tagOpenMatch.index

    let i = tagStart + tagOpenMatch[0].length
    let braceDepth = 0
    let quote: string | null = null
    let tagEnd = -1

    while (i < source.length) {
      const ch = source[i]
      if (quote) {
        if (ch === quote && source[i - 1] !== '\\') quote = null
      } else if (ch === '"' || ch === "'" || ch === '`') {
        quote = ch
      } else if (ch === '{') {
        braceDepth++
      } else if (ch === '}') {
        braceDepth = Math.max(0, braceDepth - 1)
      } else if (ch === '>' && braceDepth === 0) {
        tagEnd = i
        break
      }
      i++
    }

    if (tagEnd === -1) break // malformed / truncated — stop rather than mis-scan

    const tagText = source.slice(tagStart, tagEnd + 1)
    if (isHandRolledModalRoot(tagText)) count++
    cursor = tagEnd + 1
  }

  return count
}

/** All production .tsx source under src/frontend/src, keyed by path relative
 *  to src/frontend/src/ (no leading `../`), excluding test files. */
function loadProductionTsxSources(): Record<string, string> {
  const modules = import.meta.glob('../**/*.tsx', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>

  const result: Record<string, string> = {}
  for (const [modPath, source] of Object.entries(modules)) {
    if (modPath.includes('__tests__') || modPath.endsWith('.test.tsx')) continue
    result[modPath.replace(/^\.\.\//, '')] = source
  }
  return result
}

describe('modal-consistency — census (MODAL-13, arch brief §7)', () => {
  it('the set of files with a hand-rolled modal-root signature equals KNOWN_BESPOKE_MODALS exactly', () => {
    const sources = loadProductionTsxSources()
    const actual: Record<string, number> = {}

    for (const [path, source] of Object.entries(sources)) {
      if (path === 'components/Dialog.tsx') continue // the standard itself, not a consumer
      const count = countHandRolledRoots(source)
      if (count > 0) actual[path] = count
    }

    const expected = Object.fromEntries(
      Object.entries(KNOWN_BESPOKE_MODALS).map(([path, entry]) => [path, entry.count]),
    )

    // Equality, not containment: fails the moment a 17th root appears
    // anywhere, or a new one lands in an already-allowlisted file.
    expect(actual).toEqual(expected)
  })

  it('every KNOWN_BESPOKE_MODALS entry carries a non-empty reason string', () => {
    for (const [path, entry] of Object.entries(KNOWN_BESPOKE_MODALS)) {
      expect(entry.reason.trim().length, `${path} must carry a reason`).toBeGreaterThan(0)
    }
  })

  it('does not false-positive on prose that only mentions the signature inside a doc comment', () => {
    // IdleLogoutModal.tsx's migration-note JSDoc literally contains the text
    // `role="alertdialog"` as prose (documenting what Dialog derives for it).
    // A naive string-search scanner would miscount this as a hand-rolled
    // root; this component fully migrated onto Dialog and must score 0.
    const sources = loadProductionTsxSources()
    const idleLogoutSource = sources['components/IdleLogoutModal.tsx']
    expect(idleLogoutSource).toBeTruthy()
    expect(idleLogoutSource).toContain('role="alertdialog"') // sanity: the prose is really there
    expect(countHandRolledRoots(idleLogoutSource)).toBe(0)
  })
})

// ════════════════════════════════════════════════════════════════════════
// §2 — Plane-neutrality re-affirmation (R7)
// ════════════════════════════════════════════════════════════════════════

describe('modal-consistency — plane-neutrality re-affirmation (R7, full-suite pass)', () => {
  it('Dialog.tsx imports only react and MaterialIcon — no plane-specific dependency', () => {
    const sources = loadProductionTsxSources()
    const dialogSource = sources['components/Dialog.tsx']
    expect(dialogSource).toBeTruthy()

    const importLines = dialogSource.match(/^import .+ from ['"].+['"]$/gm) ?? []
    const importSources = importLines.map((line) => line.match(/from ['"](.+)['"]$/)?.[1] ?? '')
    const allowlist = ['react', './MaterialIcon']

    expect(importSources.length).toBeGreaterThan(0)
    for (const importSource of importSources) {
      expect(allowlist).toContain(importSource)
    }
  })
})

// ════════════════════════════════════════════════════════════════════════
// §3 — Design-system conformance (zero raw hex, zero non-token font sizes)
// ════════════════════════════════════════════════════════════════════════

const HEX_COLOR_PATTERN = /#[0-9a-fA-F]{3,8}\b/
const GENERIC_FONT_SIZE_PATTERN = /\btext-(?:xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)\b/
const ARBITRARY_FONT_SIZE_PATTERN = /\btext-\[[^\]]*(?:px|rem|em)\]/

/**
 * Extracts one named function's source (from `function <name>` up to the
 * next top-level `function` declaration, or EOF). Used to scope the
 * UserManagementTab.tsx check to its migrated DeactivateConfirmDialog only
 * — the rest of that legacy admin screen (main edit modal, self-demotion
 * confirm) is untouched by this migration and stays out of scope, same as
 * the census allowlist above.
 */
function extractFunctionSource(source: string, functionName: string): string {
  const start = source.indexOf(`function ${functionName}`)
  if (start === -1) return ''
  const rest = source.slice(start)
  const nextTopLevelFn = rest.slice(1).search(/\nfunction \w/)
  return nextTopLevelFn === -1 ? rest : rest.slice(0, nextTopLevelFn + 1)
}

describe('modal-consistency — design-system conformance', () => {
  const sources = loadProductionTsxSources()

  // The migrated shell + the 9 migrated clinic files whose Dialog migration
  // is the whole diff (verified clean of legacy non-token debt by direct
  // inspection for this task — see the task report for the one exception
  // below). UserManagementTab.tsx is checked separately, scoped to its
  // migrated function only.
  const FULL_FILE_CHECKS = [
    'components/Dialog.tsx',
    'components/IdleLogoutModal.tsx',
    'views/admin/AdminBranches.tsx',
    'views/clinic/ClinicAppointments.tsx',
    'views/settings/StoragePage.tsx',
    'components/roles/RoleList.tsx',
    'views/clinic/ClinicGrooming.tsx',
    'components/roles/CloneRoleModal.tsx',
    'views/admin/AdminBloodBank.tsx',
    'views/clinic/ClinicInventory.tsx',
  ]

  it.each(FULL_FILE_CHECKS)('%s has zero raw hex colors', (path) => {
    const source = sources[path]
    expect(source, `${path} not found via import.meta.glob`).toBeTruthy()
    expect(source.match(HEX_COLOR_PATTERN)).toBeNull()
  })

  it.each(FULL_FILE_CHECKS)('%s has zero non-token font-size classes', (path) => {
    const source = sources[path]
    expect(source, `${path} not found via import.meta.glob`).toBeTruthy()
    expect(source.match(GENERIC_FONT_SIZE_PATTERN)).toBeNull()
    expect(source.match(ARBITRARY_FONT_SIZE_PATTERN)).toBeNull()
  })

  it('UserManagementTab.tsx DeactivateConfirmDialog (MODAL-3 migrated scope) has zero raw hex colors', () => {
    const source = sources['views/admin/UserManagementTab.tsx']
    expect(source).toBeTruthy()
    const migrated = extractFunctionSource(source, 'DeactivateConfirmDialog')
    expect(migrated.length, 'DeactivateConfirmDialog function not found').toBeGreaterThan(0)
    expect(migrated.match(HEX_COLOR_PATTERN)).toBeNull()
  })

  it('UserManagementTab.tsx DeactivateConfirmDialog (MODAL-3 migrated scope) has zero non-token font-size classes', () => {
    const source = sources['views/admin/UserManagementTab.tsx']
    expect(source).toBeTruthy()
    const migrated = extractFunctionSource(source, 'DeactivateConfirmDialog')
    expect(migrated.length, 'DeactivateConfirmDialog function not found').toBeGreaterThan(0)
    // KNOWN FAILURE at time of writing — see this task's report. MODAL-3's
    // own migrated DeactivateConfirmDialog body uses the raw Tailwind
    // `text-sm`/`text-xs` utilities four times (the confirm paragraph, the
    // inline mutation-error message, and both footer buttons) instead of
    // design tokens (`text-body-sm` / `text-label-md`). This is a real,
    // in-scope regression this census test exists to catch; fixing it is
    // outside this task's file scope (UserManagementTab.tsx belongs to
    // MODAL-3/Dev A per the work-partition manifest), so it is reported
    // rather than silently patched or allowlisted away.
    expect(migrated.match(GENERIC_FONT_SIZE_PATTERN)).toBeNull()
    expect(migrated.match(ARBITRARY_FONT_SIZE_PATTERN)).toBeNull()
  })
})

// ════════════════════════════════════════════════════════════════════════
// §4 — Platform-plane regression (BA F-7) + §5 tablet viewport smoke-check
// Shared mocks below cover both sections' component renders.
// ════════════════════════════════════════════════════════════════════════

const platformState = vi.hoisted(() => ({
  admins: [] as unknown[],
  customers: [] as unknown[],
  plans: [] as unknown[],
}))

vi.mock('../hooks/usePlatformCustomers', () => ({
  useTenantAdminUsers: () => ({ data: platformState.admins, isLoading: false, isError: false }),
  useCreateTenantAdminUser: () => ({ mutate: vi.fn(), isPending: false, error: null, reset: vi.fn() }),
  useDeactivateTenantAdminUser: () => ({ mutate: vi.fn(), isPending: false, error: null, reset: vi.fn() }),
  useResetTenantAdminUserPassword: () => ({ mutate: vi.fn(), isPending: false, error: null, reset: vi.fn() }),
  usePlatformCustomers: () => ({ data: platformState.customers, isLoading: false, isError: false, error: null }),
  useCreatePlatformCustomer: () => ({ mutate: vi.fn(), isPending: false, error: null }),
}))

vi.mock('../hooks/usePlatformPlans', () => ({
  usePlatformPlans: () => ({ data: platformState.plans, isLoading: false }),
  useCreatePlatformPlan: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useUpdatePlatformPlan: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useRetirePlatformPlan: () => ({ mutate: vi.fn(), isPending: false }),
}))

// react-router-dom: keep every real export (MemoryRouter, useSearchParams —
// needed by ClinicAppointments below) and only stub useNavigate, matching
// PlatformConsole.test.tsx's convention for CustomerListView.
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => vi.fn() }
})

vi.mock('../store/authStore', () => ({
  useAuthStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      branchId: 1,
      role: 'admin',
      permissions: ['appointments.edit', 'appointments.view', 'inventory.view', 'inventory.create', 'inventory.edit', 'inventory.adjust'],
      hasPermission: () => true,
    }),
}))

vi.mock('../utils/api', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: { data: [] } })),
    post: vi.fn(() => Promise.resolve({ data: { success: true } })),
    put: vi.fn(() => Promise.resolve({ data: { success: true } })),
    delete: vi.fn(() => Promise.resolve({ data: { success: true } })),
  },
}))

vi.mock('../components/BranchSwitcher', () => ({ default: () => null }))
vi.mock('../components/BarcodeScanner', () => ({ default: () => null }))

vi.mock('../hooks/useInventory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../hooks/useInventory')>()
  return {
    ...actual,
    useProducts: () => ({ data: { products: [], total: 0, page: 1, limit: 20 }, isLoading: false }),
    useInventoryAlerts: () => ({
      data: { lowStock: [], expiringSoon: [], lowStockCount: 0, expiringSoonCount: 0, inventoryValue: 0, expiryWindowDays: 30 },
    }),
    useCreateProduct: () => ({ mutateAsync: vi.fn(() => Promise.resolve({})), isPending: false }),
    useUpdateProduct: () => ({ mutateAsync: vi.fn(() => Promise.resolve({})), isPending: false }),
    useStockIn: () => ({ mutateAsync: vi.fn(() => Promise.resolve({})), isPending: false }),
    useDeactivateProduct: () => ({ mutate: vi.fn(), isPending: false }),
  }
})

// One combined react-query mock covering every site under smoke-check below
// (ClinicAppointments, ClinicGrooming, AdminBloodBank). ClinicInventory and
// the platform views go through hook-level mocks above instead and never
// reach this. Bypasses queryFn/mutationFn execution entirely, so no
// `api.get`/`api.post` call is actually made by any query.
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
      const key = queryKey[0]
      if (key === 'appointments') {
        if (queryKey[1] === 'doctors') return { data: [{ id: 1, name: 'Dr. Smith' }], isLoading: false }
        if (queryKey[1] === 'month') return { data: [], isLoading: false }
        return { data: [appointmentFixture(9)], isLoading: false }
      }
      return { data: [], isLoading: false, isError: false }
    },
    useMutation: ({ mutationFn }: { mutationFn?: (vars: unknown) => unknown }) => ({
      mutate: (vars: unknown) => mutationFn?.(vars),
      mutateAsync: (vars: unknown) => Promise.resolve(mutationFn?.(vars)),
      isPending: false,
    }),
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  }
})

/** One appointment scheduled today at `hour`, matching ClinicAppointments's Appointment shape. */
function appointmentFixture(hour: number) {
  const scheduledAt = new Date()
  scheduledAt.setHours(hour, 0, 0, 0)
  return {
    id: 1,
    petId: 1,
    doctorId: 1,
    scheduledAt: scheduledAt.toISOString(),
    durationMin: 30,
    status: 'scheduled',
    pet: { id: 1, name: 'Rex', species: 'Dog' },
    doctor: { id: 1, name: 'Dr. Smith' },
  }
}

// Imported after every mock above so each resolves the mocked dependency,
// not the real one (matches PlatformConsole.test.tsx / ClinicAdminsTab.test.tsx).
import ClinicAdminsTab from '../components/platform/ClinicAdminsTab'
import CustomerListView from '../views/platform/CustomerListView'
import PlatformPlansView from '../views/platform/PlatformPlansView'
import ClinicAppointments from '../views/clinic/ClinicAppointments'
import ClinicGrooming from '../views/clinic/ClinicGrooming'
import AdminBloodBank from '../views/admin/AdminBloodBank'
import ClinicInventory from '../views/clinic/ClinicInventory'
import IdleLogoutModal from '../components/IdleLogoutModal'
import { MemoryRouter } from 'react-router-dom'

describe('modal-consistency — platform-plane regression (BA F-7)', () => {
  it('ClinicAdminsTab: Create Clinic Admin dialog opens with an <h2> title and a close control', () => {
    render(createElement(ClinicAdminsTab, { id: 42 }))
    fireEvent.click(screen.getByRole('button', { name: /Create/i }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading', { level: 2, name: 'Create Clinic Admin' })).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Close dialog')).toBeInTheDocument()

    fireEvent.click(within(dialog).getByLabelText('Close dialog'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('ClinicAdminsTab: Deactivate confirmation dialog opens with an <h2> title and a close control', () => {
    platformState.admins = [{ id: 1, username: 'admin', name: 'Administrator', email: null, phone: null, isActive: true, createdAt: '2026-07-01T00:00:00.000Z' }]
    render(createElement(ClinicAdminsTab, { id: 42 }))
    fireEvent.click(screen.getByRole('button', { name: /Deactivate/i }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading', { level: 2, name: 'Deactivate clinic admin?' })).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Close dialog')).toBeInTheDocument()

    fireEvent.click(within(dialog).getByLabelText('Close dialog'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    platformState.admins = []
  })

  it('ClinicAdminsTab: Reset password dialog opens with an <h2> title and a close control', () => {
    platformState.admins = [{ id: 1, username: 'admin', name: 'Administrator', email: null, phone: null, isActive: true, createdAt: '2026-07-01T00:00:00.000Z' }]
    render(createElement(ClinicAdminsTab, { id: 42 }))
    fireEvent.click(screen.getByRole('button', { name: /Reset password/i }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading', { level: 2, name: 'Reset password' })).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Close dialog')).toBeInTheDocument()

    fireEvent.click(within(dialog).getByLabelText('Close dialog'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    platformState.admins = []
  })

  it('CustomerListView: Add Customer dialog opens with an <h2> title and a close control', () => {
    render(createElement(MemoryRouter, null, createElement(CustomerListView)))
    fireEvent.click(screen.getByRole('button', { name: /Add Customer/i }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading', { level: 2, name: 'Add Customer' })).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Close dialog')).toBeInTheDocument()

    fireEvent.click(within(dialog).getByLabelText('Close dialog'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('PlatformPlansView: New Plan dialog opens with an <h2> title and a close control', () => {
    render(createElement(PlatformPlansView))
    fireEvent.click(screen.getByRole('button', { name: /New Plan/i }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading', { level: 2, name: 'New Plan' })).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Close dialog')).toBeInTheDocument()

    fireEvent.click(within(dialog).getByLabelText('Close dialog'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

// ════════════════════════════════════════════════════════════════════════
// §5 — Tablet viewport smoke-check (768px, 1024px)
// ════════════════════════════════════════════════════════════════════════

/** Emulates a viewport width/height and fires the resize event a
 *  responsive layout would react to. jsdom performs no real layout, so this
 *  is necessarily a markup/structure smoke-check, not a pixel/CSS check. */
function setViewport(width: number, height = 1024): void {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width })
  Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: height })
  window.dispatchEvent(new Event('resize'))
}

/** The Dialog panel's structural contract (arch brief §4): column flex,
 *  bounded height, scrolling body — must hold regardless of viewport. */
function expectDialogStructuralContract(dialog: HTMLElement): void {
  expect(dialog.className).toMatch(/flex-col/)
  expect(dialog.className).toMatch(/max-h-\[90vh\]/)
}

describe.each([768, 1024])('modal-consistency — tablet viewport smoke-check at %ipx', (width) => {
  it('MODAL-4 ClinicAppointments: appointment detail dialog renders correctly', () => {
    setViewport(width)
    render(createElement(MemoryRouter, null, createElement(ClinicAppointments)))
    fireEvent.click(screen.getByText('Rex'))

    const dialog = screen.getByRole('dialog')
    expectDialogStructuralContract(dialog)
    expect(within(dialog).getByRole('heading', { level: 2, name: 'Rex' })).toBeInTheDocument()
  })

  it('MODAL-7 ClinicGrooming: booking dialog renders correctly with its footer slot', () => {
    setViewport(width)
    render(createElement(ClinicGrooming))
    fireEvent.click(screen.getByText('New Booking'))

    const dialog = screen.getByRole('dialog')
    expectDialogStructuralContract(dialog)
    expect(within(dialog).getByText('Book Appointment')).toBeInTheDocument()
  })

  it('MODAL-9 AdminBloodBank: Register Donor dialog renders correctly', () => {
    setViewport(width)
    render(createElement(AdminBloodBank))
    fireEvent.click(screen.getByText('Register Donor'))

    const dialog = screen.getByRole('dialog')
    expectDialogStructuralContract(dialog)
    expect(within(dialog).getByRole('heading', { level: 2, name: 'Register Donor' })).toBeInTheDocument()
  })

  it('MODAL-10 ClinicInventory: Add Product dialog renders correctly', () => {
    setViewport(width)
    render(createElement(ClinicInventory))
    fireEvent.click(screen.getByText(/add item/i))

    const dialog = screen.getByRole('dialog', { name: 'Add Product' })
    expectDialogStructuralContract(dialog)
  })

  it('MODAL-12 IdleLogoutModal: blocking alertdialog renders correctly, no close control', () => {
    setViewport(width)
    render(createElement(IdleLogoutModal, { open: true, secondsLeft: 30, onStay: vi.fn() }))

    const dialog = screen.getByRole('alertdialog')
    expectDialogStructuralContract(dialog)
    expect(screen.queryByLabelText('Close dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /stay logged in/i })).toBeInTheDocument()
  })
})
