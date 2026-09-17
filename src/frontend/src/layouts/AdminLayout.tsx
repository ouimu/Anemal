// Admin-only shell — redirects non-admins to /clinic/dashboard
import { NavLink, Outlet, Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useLogout } from '../hooks/useAuth'
import { useUiStore } from '../store/uiStore'
import { useAdminSettings } from '../hooks/useAdmin'
import { useT } from '../i18n'
import MaterialIcon from '../components/MaterialIcon'
import TopNav from '../components/TopNav'
import { ADMIN_NAV_PERMS, CLINIC_NAV_PERMS } from './navAccess'

const NAV = [
  { to: '/clinic-admin/dashboard',    icon: 'dashboard',    label: 'nav.overview',           perm: 'clinic.profile.view' },
  // Clinic-wide settings shell (/settings/*) surfaced from the dashboard sidebar,
  // directly under Overview — distinct from the appointment/notification config below.
  // Cross-tree link (target route lives under /settings, not /clinic-admin) —
  // still gated so it doesn't appear for a user who'd land on /settings/403.
  { to: '/settings/clinic-profile',   icon: 'tune',         label: 'nav.clinicSettings',      perm: 'clinic.profile.view' },
  { to: '/clinic-admin/users',        icon: 'group',        label: 'nav.users',               perm: 'staff.view' },
  { to: '/clinic-admin/usage',        icon: 'bar_chart',    label: 'nav.usage',                perm: 'clinic.profile.view' },
  { to: '/clinic-admin/settings',     icon: 'event',        label: 'nav.appointmentSettings',  perm: 'clinic.profile.view' },
  { to: '/clinic-admin/subscription', icon: 'credit_card',  label: 'nav.subscription',         perm: 'clinic.profile.view' },
  { to: '/clinic-admin/blood-bank',   icon: 'bloodtype',    label: 'nav.bloodBank',            perm: 'bloodbank.view' },
  { to: '/clinic-admin/audit',        icon: 'policy',       label: 'nav.auditLog',             perm: 'audit.view' },
  { to: '/clinic-admin/roles',        icon: 'admin_panel_settings', label: 'nav.roles',        perm: 'roles.view' },
]

export default function AdminLayout() {
  const name          = useAuthStore(s => s.name)
  const hasPermission = useAuthStore(s => s.hasPermission)
  const logout   = useLogout()
  const t        = useT()
  const { sidebarOpen, toggleSidebar } = useUiStore()
  const { data } = useAdminSettings()

  // RBAC-based entry (F-3): the legacy role==='admin' gate blocked any role
  // without that exact string even when the RBAC matrix granted it an
  // admin-tree permission (e.g. doctor/clinic_staff -> bloodbank.view).
  // Only bounce away when the role holds NO admin-tree permission but does
  // hold a clinic-tree one — otherwise render and let each route's
  // RequirePermission decide (avoids a redirect loop when a role holds
  // permissions in neither tree).
  const hasAnyAdminPerm  = ADMIN_NAV_PERMS.some(hasPermission)
  const hasAnyClinicPerm = CLINIC_NAV_PERMS.some(hasPermission)
  if (!hasAnyAdminPerm && hasAnyClinicPerm) return <Navigate to="/clinic/dashboard" replace />

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
              <p className="text-label-md text-on-surface-variant mt-0.5">{t('nav.adminPanel')}</p>
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
                {(name ?? 'A').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-body-sm font-medium text-on-surface truncate">{name}</p>
                <p className="text-label-md text-on-surface-variant capitalize">admin</p>
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
