/**
 * Unit tests for composable route guards (T-5E-02).
 *
 * Strategy: mock useAuthStore so each test controls auth state;
 * mock react-router-dom primitives (Navigate, Outlet) so we can
 * assert redirects without a real router.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, renderHook } from '@testing-library/react'

/** Explicit shape used for mocking so return types stay as `boolean`. */
interface MockStoreState {
  isAuthenticated: () => boolean
  plane: 'clinic' | 'platform'
  hasPermission: (code: string) => boolean
  permissions: string[]
  permissionsLoaded: boolean
  clearAuth: () => void
}

// ── Hoist the mock ref so it is defined before vi.mock factories run ───────
const mockStoreState: MockStoreState = vi.hoisted(() => ({
  isAuthenticated: (): boolean => false,
  plane: 'clinic' as 'clinic' | 'platform',
  hasPermission: (_code: string): boolean => false,
  permissions: [] as string[],
  permissionsLoaded: true,
  clearAuth: (): void => {},
}))

// ── Mock react-router-dom ──────────────────────────────────────────────────
// mockPathname is mutable per-test (see setLocation) so RequirePermission's
// derived-tree redirect (`pathname.split('/')[1]`) can be exercised against
// different route depths without a real router.
let mockPathname = '/clinic/billing'

vi.mock('react-router-dom', () => ({
  Navigate: ({ to }: { to: string }) => <div data-testid="navigate" data-to={to} />,
  Outlet:   () => <div data-testid="outlet" />,
  useLocation: () => ({ pathname: mockPathname }),
}))

/** Sets the pathname RequirePermission's useLocation() mock returns. */
function setLocation(pathname: string): void {
  mockPathname = pathname
}

// ── Mock authStore ─────────────────────────────────────────────────────────
vi.mock('../store/authStore', () => ({
  useAuthStore: (selector: (s: MockStoreState) => unknown) =>
    selector(mockStoreState),
}))

// ── Mock idle-logout dependencies used by RequireAuth ──────────────────────
vi.mock('../hooks/useAdmin', () => ({
  useAdminSettings: () => ({ data: { idleTimeoutMinutes: 15 } }),
}))
vi.mock('../hooks/useIdleLogout', () => ({
  useIdleLogout: () => ({ warning: false, secondsLeft: 30, stayLoggedIn: vi.fn() }),
}))

import { RequireAuth }       from './RequireAuth'
import { RequirePlane }      from './RequirePlane'
import { RequirePermission } from './RequirePermission'
import { Can }               from './Can'
import { usePermissions }    from './usePermissions'

/** Resets and applies overrides to the shared mock state. */
function setStore(overrides: Partial<MockStoreState>): void {
  mockStoreState.isAuthenticated  = (): boolean => false
  mockStoreState.plane            = 'clinic'
  mockStoreState.hasPermission    = (_code: string): boolean => false
  mockStoreState.permissions      = []
  mockStoreState.permissionsLoaded = true
  mockStoreState.clearAuth        = (): void => {}
  Object.assign(mockStoreState, overrides)
}

beforeEach(() => {
  setStore({})
  setLocation('/clinic/billing')
})

// ── RequireAuth ───────────────────────────────────────────────────────────
describe('RequireAuth', () => {
  it('redirects to /login when not authenticated', () => {
    setStore({ isAuthenticated: (): boolean => false })
    render(<RequireAuth />)
    const nav = screen.getByTestId('navigate')
    expect(nav).toHaveAttribute('data-to', '/login')
  })

  it('renders Outlet when authenticated and no children provided', () => {
    setStore({ isAuthenticated: (): boolean => true })
    render(<RequireAuth />)
    expect(screen.getByTestId('outlet')).toBeDefined()
  })

  it('renders children when authenticated and children provided', () => {
    setStore({ isAuthenticated: (): boolean => true })
    render(<RequireAuth><span data-testid="child">ok</span></RequireAuth>)
    expect(screen.getByTestId('child')).toBeDefined()
  })
})

// ── RequirePlane ──────────────────────────────────────────────────────────
describe('RequirePlane', () => {
  it('redirects to /login when not authenticated', () => {
    setStore({ isAuthenticated: (): boolean => false, plane: 'clinic' })
    render(<RequirePlane plane="clinic" />)
    expect(screen.getByTestId('navigate')).toHaveAttribute('data-to', '/login')
  })

  it('redirects clinic session to /clinic/dashboard when trying platform plane', () => {
    setStore({ isAuthenticated: (): boolean => true, plane: 'clinic' })
    render(<RequirePlane plane="platform" />)
    expect(screen.getByTestId('navigate')).toHaveAttribute(
      'data-to',
      '/clinic/dashboard',
    )
  })

  it('redirects platform session to /platform/customers when trying clinic plane', () => {
    setStore({ isAuthenticated: (): boolean => true, plane: 'platform' })
    render(<RequirePlane plane="clinic" />)
    expect(screen.getByTestId('navigate')).toHaveAttribute(
      'data-to',
      '/platform/customers',
    )
  })

  it('renders Outlet when authenticated on correct plane', () => {
    setStore({ isAuthenticated: (): boolean => true, plane: 'clinic' })
    render(<RequirePlane plane="clinic" />)
    expect(screen.getByTestId('outlet')).toBeDefined()
  })

  it('renders children when authenticated on correct plane and children provided', () => {
    setStore({ isAuthenticated: (): boolean => true, plane: 'platform' })
    render(
      <RequirePlane plane="platform">
        <span data-testid="child">ok</span>
      </RequirePlane>,
    )
    expect(screen.getByTestId('child')).toBeDefined()
  })
})

// ── RequirePermission ─────────────────────────────────────────────────────
describe('RequirePermission', () => {
  it('redirects to /login when not authenticated', () => {
    setStore({ isAuthenticated: (): boolean => false })
    render(<RequirePermission perm="billing.view" />)
    expect(screen.getByTestId('navigate')).toHaveAttribute('data-to', '/login')
  })

  it('shows spinner when authenticated but permissions not yet loaded', () => {
    setStore({
      isAuthenticated: (): boolean => true,
      permissionsLoaded: false,
    })
    render(<RequirePermission perm="billing.view" />)
    expect(screen.queryByTestId('navigate')).toBeNull()
    expect(document.querySelector('.material-symbols-outlined')).not.toBeNull()
  })

  it('redirects to the tree-scoped /clinic/403 when authenticated but permission missing', () => {
    setStore({
      isAuthenticated: (): boolean => true,
      hasPermission: (_code: string): boolean => false,
    })
    setLocation('/clinic/billing')
    render(<RequirePermission perm="billing.view" />)
    expect(screen.getByTestId('navigate')).toHaveAttribute('data-to', '/clinic/403')
  })

  it('derives the tree from the first URL segment, not a hand-maintained map — proven on the two-segment-deep /settings/storage/connecting route', () => {
    setStore({
      isAuthenticated: (): boolean => true,
      hasPermission: (_code: string): boolean => false,
    })
    setLocation('/settings/storage/connecting')
    render(<RequirePermission perm="clinic.integrations.edit" />)
    expect(screen.getByTestId('navigate')).toHaveAttribute('data-to', '/settings/403')
  })

  it('derives the tree from the first URL segment on the other two-segment-deep route, /clinic/vaccinations-due/record', () => {
    setStore({
      isAuthenticated: (): boolean => true,
      hasPermission: (_code: string): boolean => false,
    })
    setLocation('/clinic/vaccinations-due/record')
    render(<RequirePermission perm="vaccination.create" />)
    expect(screen.getByTestId('navigate')).toHaveAttribute('data-to', '/clinic/403')
  })

  it('derives /clinic-admin/403 for a denial inside the clinic-admin tree', () => {
    setStore({
      isAuthenticated: (): boolean => true,
      hasPermission: (_code: string): boolean => false,
    })
    setLocation('/clinic-admin/users')
    render(<RequirePermission perm="staff.view" />)
    expect(screen.getByTestId('navigate')).toHaveAttribute('data-to', '/clinic-admin/403')
  })

  it('renders Outlet when permission is held', () => {
    setStore({
      isAuthenticated: (): boolean => true,
      hasPermission: (_code: string): boolean => true,
    })
    render(<RequirePermission perm="billing.view" />)
    expect(screen.getByTestId('outlet')).toBeDefined()
  })

  it('OR-list: passes when any one code in `any` array is held', () => {
    setStore({
      isAuthenticated: (): boolean => true,
      hasPermission: (code: string): boolean => code === 'billing.create',
    })
    render(
      <RequirePermission
        perm="billing.view"
        any={['billing.view', 'billing.create']}
      />,
    )
    expect(screen.getByTestId('outlet')).toBeDefined()
  })

  it('OR-list: redirects to the tree-scoped /clinic/403 when none of the codes in `any` array are held', () => {
    setStore({
      isAuthenticated: (): boolean => true,
      hasPermission: (_code: string): boolean => false,
    })
    setLocation('/clinic/billing')
    render(
      <RequirePermission
        perm="billing.view"
        any={['billing.view', 'billing.create']}
      />,
    )
    expect(screen.getByTestId('navigate')).toHaveAttribute('data-to', '/clinic/403')
  })

  it('renders children when permission is held and children provided', () => {
    setStore({
      isAuthenticated: (): boolean => true,
      hasPermission: (_code: string): boolean => true,
    })
    render(
      <RequirePermission perm="billing.view">
        <span data-testid="child">ok</span>
      </RequirePermission>,
    )
    expect(screen.getByTestId('child')).toBeDefined()
  })
})

// ── Can ───────────────────────────────────────────────────────────────────
describe('Can', () => {
  it('renders null (no DOM node) when permission missing', () => {
    setStore({ hasPermission: (_code: string): boolean => false })
    const { container } = render(
      <Can perm="billing.create">
        <span data-testid="child">visible</span>
      </Can>,
    )
    expect(container.firstChild).toBeNull()
    expect(screen.queryByTestId('child')).toBeNull()
  })

  it('renders children when permission held', () => {
    setStore({ hasPermission: (_code: string): boolean => true })
    render(
      <Can perm="billing.create">
        <span data-testid="child">visible</span>
      </Can>,
    )
    expect(screen.getByTestId('child')).toBeDefined()
  })

  it('OR-list: renders children when any code is held', () => {
    setStore({ hasPermission: (code: string): boolean => code === 'billing.view' })
    render(
      <Can any={['billing.view', 'billing.create']}>
        <span data-testid="child">visible</span>
      </Can>,
    )
    expect(screen.getByTestId('child')).toBeDefined()
  })

  it('OR-list: renders null when no code in list is held', () => {
    setStore({ hasPermission: (_code: string): boolean => false })
    const { container } = render(
      <Can any={['billing.view', 'billing.create']}>
        <span data-testid="child">visible</span>
      </Can>,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders null when neither perm nor any is provided', () => {
    setStore({ hasPermission: (_code: string): boolean => true })
    const { container } = render(
      <Can>
        <span data-testid="child">visible</span>
      </Can>,
    )
    expect(container.firstChild).toBeNull()
  })
})

// ── usePermissions ────────────────────────────────────────────────────────
describe('usePermissions', () => {
  it('returns permissions array from store', () => {
    setStore({ permissions: ['billing.view', 'pets.read'] })
    const { result } = renderHook(() => usePermissions())
    expect(result.current.permissions).toEqual(['billing.view', 'pets.read'])
  })

  it('hasPermission returns true for held code', () => {
    setStore({
      permissions: ['billing.view'],
      hasPermission: (code: string): boolean => code === 'billing.view',
    })
    const { result } = renderHook(() => usePermissions())
    expect(result.current.hasPermission('billing.view')).toBe(true)
  })

  it('hasPermission returns false for missing code', () => {
    setStore({
      permissions: [],
      hasPermission: (_code: string): boolean => false,
    })
    const { result } = renderHook(() => usePermissions())
    expect(result.current.hasPermission('billing.create')).toBe(false)
  })

  it('hasPermission reference is stable across re-renders', () => {
    setStore({
      permissions: [],
      hasPermission: (_code: string): boolean => false,
    })
    const { result, rerender } = renderHook(() => usePermissions())
    const first = result.current.hasPermission
    rerender()
    expect(result.current.hasPermission).toBe(first)
  })
})
