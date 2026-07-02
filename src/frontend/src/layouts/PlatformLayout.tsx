/**
 * PlatformLayout — shell for the /platform/* section.
 * Requires a valid platform-plane JWT; redirects to /platform/login otherwise.
 * No clinic authStore dependency — uses platformAuthStore exclusively.
 */
import { NavLink, Outlet, Navigate } from 'react-router-dom'
import { usePlatformAuthStore } from '../store/platformAuthStore'
import { useUiStore } from '../store/uiStore'
import MaterialIcon from '../components/MaterialIcon'
import { useIdleLogout } from '../hooks/useIdleLogout'
import IdleLogoutModal from '../components/IdleLogoutModal'

const NAV = [
  { to: '/platform/customers', icon: 'business',        label: 'Customers' },
  { to: '/platform/plans',     icon: 'credit_card',     label: 'Plans' },
  { to: '/platform/settings',  icon: 'settings',        label: 'Settings' },
  { to: '/platform/audit',     icon: 'manage_search',   label: 'Audit Log' },
]

const PLATFORM_IDLE_MINUTES = Number(import.meta.env.VITE_PLATFORM_IDLE_TIMEOUT_MINUTES) || 30

/** Simple logout for platform plane. */
function usePlatformLogout() {
  const clearAuth = usePlatformAuthStore((s) => s.clearAuth)
  return () => {
    clearAuth()
    window.location.href = '/platform/login'
  }
}

export default function PlatformLayout() {
  const isAuth   = usePlatformAuthStore((s) => s.isAuthenticated())
  const name     = usePlatformAuthStore((s) => s.name)
  const clearAuth = usePlatformAuthStore((s) => s.clearAuth)
  const { sidebarOpen, toggleSidebar } = useUiStore()
  const logout = usePlatformLogout()

  const { warning, secondsLeft, stayLoggedIn } = useIdleLogout({
    timeoutMinutes: PLATFORM_IDLE_MINUTES,
    enabled: isAuth,
    onLogout: () => {
      clearAuth()
      window.location.href = '/platform/login?reason=idle'
    },
  })

  if (!isAuth) return <Navigate to="/platform/login" replace />

  const sidebarW  = sidebarOpen ? 'w-56' : 'w-14'
  const mainClass = sidebarOpen ? 'ml-56' : 'ml-14'

  const navClass = (isActive: boolean): string => {
    if (sidebarOpen) {
      return isActive
        ? 'flex items-center gap-md px-lg min-h-[44px] border-r-4 border-primary bg-surface-container-low text-primary font-bold'
        : 'flex items-center gap-md px-lg min-h-[44px] mx-sm rounded-lg text-on-surface-variant hover:bg-surface-container transition-colors'
    }
    return isActive
      ? 'flex items-center justify-center min-h-[44px] w-full border-r-4 border-primary bg-surface-container-low text-primary'
      : 'flex items-center justify-center min-h-[44px] mx-1 rounded-lg text-on-surface-variant hover:bg-surface-container transition-colors'
  }

  return (
    <>
    <div className="min-h-screen bg-background">
      {/* ── Sidebar (fixed) ─────────────────────────────────────────────── */}
      <aside
        className={`fixed left-0 top-0 h-screen z-50 ${sidebarW} bg-surface shadow-sm flex flex-col transition-all duration-200 overflow-hidden`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-sm pt-md pb-md border-b border-outline-variant min-h-[64px] flex-shrink-0">
          {sidebarOpen && (
            <div className="pl-sm min-w-0">
              <p className="text-headline-sm font-headline font-bold text-primary leading-tight truncate">
                Anemal
              </p>
              <p className="text-label-md text-on-surface-variant mt-0.5">Platform Console</p>
            </div>
          )}
          <button
            onClick={toggleSidebar}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-surface-container text-on-surface-variant transition-colors flex-shrink-0 ml-auto"
            aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            <MaterialIcon name={sidebarOpen ? 'menu_open' : 'menu'} size={22} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex flex-col flex-1 py-sm overflow-y-auto">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => navClass(isActive)}
            >
              <MaterialIcon name={item.icon} size={22} className="flex-shrink-0" />
              {sidebarOpen && (
                <span className="text-body-md whitespace-nowrap">{item.label}</span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-outline-variant p-sm flex-shrink-0">
          {sidebarOpen && (
            <div className="flex items-center gap-sm px-sm mb-sm">
              <div className="w-10 h-10 rounded-full bg-primary text-on-primary flex items-center justify-center text-label-md font-bold flex-shrink-0 select-none">
                {(name ?? 'P').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-body-sm font-medium text-on-surface truncate">{name}</p>
                <p className="text-label-md text-on-surface-variant">Platform Admin</p>
              </div>
            </div>
          )}
          <button
            onClick={logout}
            className={`w-full min-h-[44px] flex items-center justify-center gap-sm text-on-surface-variant hover:bg-surface-container border border-outline-variant rounded-lg transition-colors text-body-sm ${sidebarOpen ? 'px-md' : ''}`}
          >
            <MaterialIcon name="logout" size={18} />
            {sidebarOpen && <span>Sign out</span>}
          </button>
        </div>
      </aside>

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header
        className={`fixed top-0 right-0 z-40 h-16 bg-surface border-b border-outline-variant flex items-center px-md transition-all duration-200 ${sidebarOpen ? 'left-56' : 'left-14'}`}
      >
        <span className="text-on-surface-variant text-body-sm">
          Platform Console
        </span>
      </header>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <main className={`${mainClass} pt-16 min-h-screen overflow-y-auto transition-all duration-200`}>
        <Outlet />
      </main>
    </div>
    <IdleLogoutModal open={warning} secondsLeft={secondsLeft} onStay={stayLoggedIn} />
    </>
  )
}
