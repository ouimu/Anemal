import { useLocation } from 'react-router-dom'
import { useUiStore } from '../store/uiStore'
import { useT } from '../i18n'
import MaterialIcon from './MaterialIcon'
import ProfileMenu from './ProfileMenu'

export default function TopNav() {
  const { sidebarOpen } = useUiStore()
  const { pathname } = useLocation()
  const t = useT()

  const titleRaw   = t(`page.${pathname}`)
  const pageTitle  = titleRaw.startsWith('page.') ? 'Anemal' : titleRaw
  const leftOffset = sidebarOpen ? 'left-56' : 'left-14'

  return (
    <header
      className={`fixed top-0 right-0 ${leftOffset} h-16 z-40 bg-surface border-b border-outline-variant flex items-center justify-between px-lg transition-all duration-200`}
    >
      <h1 className="text-headline-sm font-headline font-semibold text-primary hidden sm:block">
        {pageTitle}
      </h1>

      <div className="relative flex items-center mx-auto sm:mx-0">
        <span className="absolute left-md pointer-events-none text-on-surface-variant">
          <MaterialIcon name="search" size={18} />
        </span>
        <input
          type="search"
          placeholder={t('top.searchPlaceholder')}
          className="w-64 lg:w-80 min-h-[44px] pl-10 pr-md bg-surface-container-low border border-outline-variant rounded-full text-body-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <div className="flex items-center gap-xs">
        <button
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-low transition-colors"
          aria-label={t('top.notifications')}
        >
          <MaterialIcon name="notifications" size={20} />
        </button>
        <button
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-low transition-colors"
          aria-label={t('top.help')}
        >
          <MaterialIcon name="help_outline" size={20} />
        </button>
        <ProfileMenu />
      </div>
    </header>
  )
}
