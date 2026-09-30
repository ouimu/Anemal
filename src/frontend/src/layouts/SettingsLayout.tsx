// Settings shell — role-filtered sidebar; no hard redirect (all roles may visit /settings)
import { Outlet } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useLogout } from '../hooks/useAuth'
import { useAdminSettings } from '../hooks/useAdmin'
import { useShellSidebar } from '../hooks/useShellSidebar'
import { useT } from '../i18n'
import ResponsiveSidebar from '../components/ResponsiveSidebar'
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
  const shell  = useShellSidebar()

  // Exit target for the Back button: admins return to the clinic-admin console,
  // everyone else to the clinic app dashboard.
  const dashboardPath = role === 'admin' ? '/clinic-admin/dashboard' : '/clinic/dashboard'

  const items = ALL_NAV
    .filter(item => item.roles.includes(role ?? ''))
    .map(item => ({ to: item.to, icon: item.icon, label: item.label }))

  return (
    <div className="min-h-screen bg-background">
      <ResponsiveSidebar
        mode={shell.mode}
        expanded={shell.expanded}
        drawerOpen={shell.drawerOpen}
        onToggleExpanded={shell.toggleExpanded}
        onCloseDrawer={shell.closeDrawer}
        items={items}
        // Back to Dashboard — exit the settings shell (fixes no-exit trap)
        preNav={{ to: dashboardPath, icon: 'arrow_back', label: t('nav.backToDashboard') }}
        header={{ title: data?.tenant.name ?? 'Anemal', subtitle: t('nav.clinicSettings') }}
        footer={{
          name,
          roleLabel: role,
          initial: (name ?? 'U').charAt(0).toUpperCase(),
          signOutLabel: 'Sign out',
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
