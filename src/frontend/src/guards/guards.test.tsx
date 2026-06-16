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
}

// ── Hoist the mock ref so it is defined before vi.mock factories run ───────
const mockStoreState: MockStoreState = vi.hoisted(() => ({
  isAuthenticated: (): boolean => false,
  plane: 'clinic' as 'clinic' | 'platform',
  hasPermission: (_code: string): boolean => false,
  permissions: [] as string[],
}))

// ── Mock react-router-dom ──────────────────────────────────────────────────
vi.mock('react-router-dom', () => ({
  Navigate: ({ to }: { to: string }) => <div data-testid="navigate" data-to={to} />,
  Outlet:   () => <div data-testid="outlet" />,
}))

// ── Mock authStore ─────────────────────────────────────────────────────────
vi.mock('../store/authStore', () => ({
  useAuthStore: (selector: (s: MockStoreState) => unknown) =>
    selector(mockStoreState),
}))

import { RequireAuth }       from './RequireAuth'
import { RequirePlane }      from './RequirePlane'
import { RequirePermission } from './RequirePermission'
import { Can }               from './Can'
import { usePermissions }    from './usePermissions'

/** Resets and applies overrides to the shared mock state. */
function setStore(overrides: Partial<MockStoreState>): void {
  mockStoreState.isAuthenticated = (): boolean => false
  mockStoreState.plane           = 'clinic'
  mockStoreState.hasPermission   = (_code: string): boolean => false
  mockStoreState.permissions     = []
  Object.assign(mockStoreState, overrides)
}

beforeEach(() => {
  setStore({})
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

  it('redirects platform session to /platform/dashboard when trying clinic plane', () => {
    setStore({ isAuthenticated: (): boolean => true, plane: 'platform' })
    render(<RequirePlane plane="clinic" />)
    expect(screen.getByTestId('navigate')).toHaveAttribute(
      'data-to',
      '/platform/dashboard',
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

  it('redirects to /403 when authenticated but permission missing', () => {
    setStore({
      isAuthenticated: (): boolean => true,
      hasPermission: (_code: string): boolean => false,
    })
    render(<RequirePermission perm="billing.view" />)
    expect(screen.getByTestId('navigate')).toHaveAttribute('data-to', '/403')
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

  it('OR-list: redirects /403 when none of the codes in `any` array are held', () => {
    setStore({
      isAuthenticated: (): boolean => true,
      hasPermission: (_code: string): boolean => false,
    })
    render(
      <RequirePermission
        perm="billing.view"
        any={['billing.view', 'billing.create']}
      />,
    )
    expect(screen.getByTestId('navigate')).toHaveAttribute('data-to', '/403')
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
