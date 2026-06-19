// Doctor/Staff shell — redirects admins to /clinic-admin/dashboard
import { NavLink, Outlet, Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useLogout } from '../hooks/useAuth'
import { useUiStore } from '../store/uiStore'
import { useT } from '../i18n'
import MaterialIcon from '../components/MaterialIcon'
import TopNav from '../components/TopNav'

const NAV = [
  { to: '/clinic/dashboard',    icon: 'dashboard',        label: 'nav.dashboard',  perm: undefined },
  { to: '/clinic/pets',         icon: 'pets',             label: 'nav.pets',       perm: 'crm.view' },
  { to: '/clinic/appointments', icon: 'calendar_today',   label: 'nav.schedule',   perm: 'appointments.view' },
  { to: '/clinic/emr',          icon: 'medical_services', label: 'nav.emr',        perm: 'emr.view' },
  { to: '/clinic/inventory',    icon: 'inventory_2',      label: 'nav.inventory',  perm: 'inventory.view' },
  { to: '/clinic/billing',      icon: 'payments',         label: 'nav.billing',    perm: 'billing.create' },
  { to: '/clinic/inpatient',    icon: 'local_hospital',   label: 'nav.inpatient',  perm: 'inpatient.view' },
  { to: '/clinic/grooming',     icon: 'content_cut',      label: 'nav.grooming',   perm: 'grooming.view' },
]

export default function ClinicLayout() {
  const role          = useAuthStore(s => s.role)
  const name          = useAuthStore(s => s.name)
  const hasPermission = useAuthStore(s => s.hasPermission)
  const logout = useLogout()
  const t      = useT()
  const { sidebarOpen, toggleSidebar } = useUiStore()

  if (role === 'admin') return <Navigate to="/clinic-admin/dashboard" replace />

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
                Anemal
              </p>
              <p className="text-label-md text-on-surface-variant mt-0.5">{t('nav.clinicPortal')}</p>
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
          {NAV.filter(item => !item.perm || hasPermission(item.perm)).map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => navClass(isActive)}
            >
              <MaterialIcon name={item.icon} size={22} className="flex-shrink-0" />
              {sidebarOpen && (
                <span className="text-body-md whitespace-nowrap">{t(item.label)}</span>
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
            {sidebarOpen && <span>{t('menu.signOut')}</span>}
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
