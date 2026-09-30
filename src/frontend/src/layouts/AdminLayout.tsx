// Admin-only shell — redirects non-admins to /clinic/dashboard
import { Outlet, Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useLogout } from '../hooks/useAuth'
import { useShellSidebar } from '../hooks/useShellSidebar'
import { useAdminSettings } from '../hooks/useAdmin'
import { useT } from '../i18n'
import ResponsiveSidebar from '../components/ResponsiveSidebar'
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
  const shell    = useShellSidebar()
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

  const items = NAV
    .filter(item => !item.perm || hasPermission(item.perm))
    .map(item => ({ to: item.to, icon: item.icon, label: t(item.label) }))

  return (
    <div className="min-h-screen bg-background">
      <ResponsiveSidebar
        mode={shell.mode}
        expanded={shell.expanded}
        drawerOpen={shell.drawerOpen}
        onToggleExpanded={shell.toggleExpanded}
        onCloseDrawer={shell.closeDrawer}
        items={items}
        header={{ title: data?.tenant.name ?? 'Anemal', subtitle: t('nav.adminPanel') }}
        footer={{
          name,
          roleLabel: 'admin',
          initial: (name ?? 'A').charAt(0).toUpperCase(),
          signOutLabel: t('menu.signOut'),
          onSignOut: logout,
        }}
      />

      {/* ── Top Nav (fixed, offset by sidebar) ──────────────────────────── */}
      <TopNav shell={shell} />

      {/* ── Main content ────────────────────────────────────────────────── */}
      <main className={`${shell.offset.main} pt-16 min-h-screen overflow-y-auto transition-all duration-200`}>
        <Outlet />
      </main>
    </div>
  )
}
