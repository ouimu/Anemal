// Doctor/Staff shell — redirects admins to /clinic-admin/dashboard
import { Outlet, Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useLogout } from '../hooks/useAuth'
import { useShellSidebar } from '../hooks/useShellSidebar'
import { useT } from '../i18n'
import ResponsiveSidebar from '../components/ResponsiveSidebar'
import TopNav from '../components/TopNav'
import { ADMIN_NAV_PERMS, CLINIC_NAV_PERMS } from './navAccess'

const NAV = [
  { to: '/clinic/dashboard',    icon: 'dashboard',        label: 'nav.dashboard',  perm: 'dashboard.view' },
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
  const companyName   = useAuthStore(s => s.companyName)
  const branchName    = useAuthStore(s => s.branchName)
  const hasPermission = useAuthStore(s => s.hasPermission)
  const logout = useLogout()
  const t      = useT()
  const shell  = useShellSidebar()

  // RBAC-based entry (F-3): the legacy role==='admin' gate blocked
  // clinic_admin (role 'admin') even when the RBAC matrix granted it a
  // clinic-tree permission (e.g. appointments/inventory/grooming). Only
  // bounce away when the role holds NO clinic-tree permission but does hold
  // an admin-tree one — otherwise render and let each route's
  // RequirePermission decide (avoids a redirect loop when a role holds
  // permissions in neither tree).
  const hasAnyClinicPerm = CLINIC_NAV_PERMS.some(hasPermission)
  const hasAnyAdminPerm  = ADMIN_NAV_PERMS.some(hasPermission)
  if (!hasAnyClinicPerm && hasAnyAdminPerm) return <Navigate to="/clinic-admin/dashboard" replace />

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
        header={{ title: companyName || 'Anemal', subtitle: branchName || undefined }}
        footer={{
          name,
          roleLabel: role,
          initial: (name ?? 'U').charAt(0).toUpperCase(),
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
