import { useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useUiStore } from '../store/uiStore'
import MaterialIcon from './MaterialIcon'

const PAGE_TITLES: Record<string, string> = {
  '/clinic/dashboard':    'Dashboard',
  '/clinic/appointments': 'Schedule',
  '/clinic/pets':         'Pets & Owners',
  '/clinic/emr':          'EMR',
  '/clinic/inventory':    'Inventory',
  '/clinic/billing':      'Billing',
  '/admin/dashboard':     'Overview',
  '/admin/users':         'Users & Roles',
  '/admin/profile':       'Clinic Profile',
  '/admin/usage':         'Usage Stats',
  '/admin/settings':      'Settings',
  '/admin/subscription':  'Subscription',
}

export default function TopNav() {
  const { name } = useAuthStore()
  const { sidebarOpen } = useUiStore()
  const { pathname } = useLocation()

  const pageTitle  = PAGE_TITLES[pathname] ?? 'Anemal'
  const leftOffset = sidebarOpen ? 'left-56' : 'left-14'

  return (
    <header
      className={`fixed top-0 right-0 ${leftOffset} h-16 z-40 bg-surface border-b border-outline-variant flex items-center justify-between px-lg transition-all duration-200`}
    >
      {/* Left — page title */}
      <h1 className="text-headline-sm font-headline font-semibold text-primary hidden sm:block">
        {pageTitle}
      </h1>

      {/* Center — search */}
      <div className="relative flex items-center mx-auto sm:mx-0">
        <span className="absolute left-md pointer-events-none text-on-surface-variant">
          <MaterialIcon name="search" size={18} />
        </span>
        <input
          type="search"
          placeholder="Search patients, appointments…"
          className="w-64 lg:w-80 min-h-[44px] pl-10 pr-md bg-surface-container-low border border-outline-variant rounded-full text-body-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {/* Right — actions */}
      <div className="flex items-center gap-xs">
        <button
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-low transition-colors"
          aria-label="Notifications"
        >
          <MaterialIcon name="notifications" size={20} />
        </button>
        <button
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-low transition-colors"
          aria-label="Help"
        >
          <MaterialIcon name="help_outline" size={20} />
        </button>
        <div
          className="w-9 h-9 rounded-full bg-primary text-primary-on flex items-center justify-center text-label-md font-bold select-none flex-shrink-0"
          title={name ?? ''}
        >
          {(name ?? 'U').charAt(0).toUpperCase()}
        </div>
      </div>
    </header>
  )
}
