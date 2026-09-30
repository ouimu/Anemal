/**
 * PlatformLayout — shell for the /platform/* section.
 * Requires a valid platform-plane JWT; redirects to /platform/login otherwise.
 * No clinic authStore dependency — uses platformAuthStore exclusively.
 */
import { Outlet, Navigate } from 'react-router-dom'
import { usePlatformAuthStore } from '../store/platformAuthStore'
import { useShellSidebar } from '../hooks/useShellSidebar'
import ResponsiveSidebar, { SidebarMenuButton } from '../components/ResponsiveSidebar'
import { useIdleLogout } from '../hooks/useIdleLogout'
import IdleLogoutModal from '../components/IdleLogoutModal'
import { clearServerState } from '../utils/queryClient'

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
  // HI-09: drop cached PII before clearing auth + navigating away.
  return () => {
    void clearServerState().finally(() => {
      clearAuth()
      window.location.href = '/platform/login'
    })
  }
}

export default function PlatformLayout() {
  const isAuth   = usePlatformAuthStore((s) => s.isAuthenticated())
  const name     = usePlatformAuthStore((s) => s.name)
  const clearAuth = usePlatformAuthStore((s) => s.clearAuth)
  const shell    = useShellSidebar()
  const logout = usePlatformLogout()

  const { warning, secondsLeft, stayLoggedIn } = useIdleLogout({
    timeoutMinutes: PLATFORM_IDLE_MINUTES,
    enabled: isAuth,
    onLogout: () => {
      void clearServerState().finally(() => {
        clearAuth()
        window.location.href = '/platform/login?reason=idle'
      })
    },
  })

  if (!isAuth) return <Navigate to="/platform/login" replace />

  return (
    <>
    <div className="min-h-screen bg-background">
      <ResponsiveSidebar
        mode={shell.mode}
        expanded={shell.expanded}
        drawerOpen={shell.drawerOpen}
        onToggleExpanded={shell.toggleExpanded}
        onCloseDrawer={shell.closeDrawer}
        items={NAV}
        header={{ title: 'Anemal', subtitle: 'Platform Console' }}
        footer={{
          name,
          roleLabel: 'Platform Admin',
          initial: (name ?? 'P').charAt(0).toUpperCase(),
          signOutLabel: 'Sign out',
          onSignOut: logout,
        }}
      />

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header
        className={`fixed top-0 right-0 z-40 h-16 bg-surface border-b border-outline-variant flex items-center gap-sm px-md transition-all duration-200 ${shell.offset.top}`}
      >
        {shell.mode === 'drawer' && <SidebarMenuButton onOpen={shell.openDrawer} label="Open menu" />}
        <span className="text-on-surface-variant text-body-sm">
          Platform Console
        </span>
      </header>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <main className={`${shell.offset.main} pt-16 min-h-screen overflow-y-auto transition-all duration-200`}>
        <Outlet />
      </main>
    </div>
    <IdleLogoutModal open={warning} secondsLeft={secondsLeft} onStay={stayLoggedIn} />
    </>
  )
}
