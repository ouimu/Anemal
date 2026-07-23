// Settings shell — role-filtered sidebar; no hard redirect (all roles may visit /settings)
import { useEffect } from 'react'
import { NavLink, Link, Outlet } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useLogout } from '../hooks/useAuth'
import { useAdminSettings } from '../hooks/useAdmin'
import { useUiStore } from '../store/uiStore'
import { useT } from '../i18n'
import MaterialIcon from '../components/MaterialIcon'
import TopNav from '../components/TopNav'

// Clinic-wide settings only. Per-user "My Preferences" is now its own standalone
// page (/preferences), reached from the profile menu — not this clinic shell.
const ALL_NAV = [
  { to: '/settings/clinic-profile', icon: 'business',      label: 'Clinic Profile',  roles: ['admin'] },
  { to: '/settings/hours',          icon: 'schedule',      label: 'Operating Hours', roles: ['admin'] },
  { to: '/settings/notifications',  icon: 'notifications', label: 'Notifications',   roles: ['admin'] },
  { to: '/settings/payment',        icon: 'payments',      label: 'Payment',         roles: ['admin'] },
  { to: '/settings/integrations',   icon: 'hub',           label: 'Integrations',    roles: ['admin'] },
  { to: '/settings/storage',        icon: 'dns',           label: 'Storage',         roles: ['admin'] },
  { to: '/settings/branches',       icon: 'apartment',     label: 'Branches',        roles: ['admin'] },
]

export default function SettingsLayout() {
  const role   = useAuthStore(s => s.role)
  const name   = useAuthStore(s => s.name)
  const logout = useLogout()
  const t      = useT()
  const { data } = useAdminSettings()
  const { sidebarOpen, toggleSidebar } = useUiStore()

  // Exit target for the Back button: admins return to the clinic-admin console,
  // everyone else to the clinic app dashboard.
  const dashboardPath = role === 'admin' ? '/clinic-admin/dashboard' : '/clinic/dashboard'

  // LAYOUT-04: auto-collapse sidebar on mount for narrow viewports (tablet portrait)
  useEffect(() => {
    if (window.innerWidth < 768 && sidebarOpen) toggleSidebar()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const NAV = ALL_NAV.filter(item => item.roles.includes(role ?? ''))

  const sidebarW  = sidebarOpen ? 'w-56' : 'w-14'
  const mainClass = sidebarOpen ? 'ml-56' : 'ml-14'

  const navClass = (isActive: boolean) => {
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
                {data?.tenant.name ?? 'Anemal'}
              </p>
              <p className="text-label-md text-on-surface-variant mt-0.5">{t('nav.clinicSettings')}</p>
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
          {/* Back to Dashboard — exit the settings shell (fixes no-exit trap) */}
          <Link
            to={dashboardPath}
            className={
              sidebarOpen
                ? 'flex items-center gap-md px-lg min-h-[44px] mx-sm rounded-lg text-on-surface-variant hover:bg-surface-container transition-colors'
                : 'flex items-center justify-center min-h-[44px] mx-1 rounded-lg text-on-surface-variant hover:bg-surface-container transition-colors'
            }
          >
            <MaterialIcon name="arrow_back" size={22} className="flex-shrink-0" />
            {sidebarOpen && (
              <span className="text-body-md whitespace-nowrap">{t('nav.backToDashboard')}</span>
            )}
          </Link>

          <div className="h-px bg-outline-variant mx-sm my-sm" />

          {NAV.map(item => (
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
              <div className="w-10 h-10 rounded-full bg-primary text-primary-on flex items-center justify-center text-label-md font-bold flex-shrink-0 select-none">
                {(name ?? 'U').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-body-sm font-medium text-on-surface truncate">{name}</p>
                <p className="text-label-md text-on-surface-variant capitalize">{role}</p>
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

      {/* ── Top Nav (fixed, offset by sidebar) ──────────────────────────── */}
      <TopNav />

      {/* ── Main content ────────────────────────────────────────────────── */}
      <main className={`${mainClass} pt-16 min-h-screen overflow-y-auto transition-all duration-200`}>
        <Outlet />
      </main>
    </div>
  )
}
