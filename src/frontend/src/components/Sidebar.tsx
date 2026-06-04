// Legacy sidebar — no longer used in routing (AppShell is unused).
// Kept for reference; brand-* classes replaced with design-system tokens.
import React from 'react'
import { NavLink } from 'react-router-dom'
import { useUiStore } from '../store/uiStore'
import { useAuthStore } from '../store/authStore'
import MaterialIcon from './MaterialIcon'

interface NavItem { label: string; icon: string; to: string; adminOnly?: boolean }

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',    icon: 'dashboard',        to: '/dashboard' },
  { label: 'Appointments', icon: 'calendar_today',   to: '/appointments' },
  { label: 'Pets & Owners',icon: 'pets',             to: '/pets' },
  { label: 'EMR',          icon: 'medical_services', to: '/emr' },
  { label: 'Inventory',    icon: 'inventory_2',      to: '/inventory' },
  { label: 'Billing',      icon: 'payments',         to: '/billing' },
  { label: 'Admin',        icon: 'settings',         to: '/admin', adminOnly: true },
]

export default function Sidebar() {
  const { sidebarOpen, toggleSidebar } = useUiStore()
  const role = useAuthStore(s => s.role)

  return (
    <aside
      className={`flex flex-col h-full bg-surface shadow-sm transition-all duration-200 ${sidebarOpen ? 'w-56' : 'w-14'}`}
    >
      <button
        onClick={toggleSidebar}
        className="flex items-center justify-center min-h-[44px] min-w-[44px] hover:bg-surface-container text-on-surface-variant transition-colors self-end mx-1 mt-2 rounded-lg"
        aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
      >
        <MaterialIcon name={sidebarOpen ? 'menu_open' : 'menu'} size={20} />
      </button>

      <nav className="flex flex-col gap-1 mt-2 px-1 flex-1">
        {NAV_ITEMS.filter(item => !item.adminOnly || role === 'admin').map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              [
                'flex items-center gap-3 min-h-[44px] px-2 rounded-lg transition-colors',
                isActive
                  ? 'bg-surface-container-low text-primary font-bold'
                  : 'text-on-surface-variant hover:bg-surface-container',
              ].join(' ')
            }
          >
            <MaterialIcon name={item.icon} size={22} className="flex-shrink-0" />
            {sidebarOpen && (
              <span className="text-body-sm font-medium whitespace-nowrap overflow-hidden">{item.label}</span>
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
