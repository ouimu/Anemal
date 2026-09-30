/**
 * ResponsiveSidebar — the one plane-neutral shell sidebar (ADR-0033).
 *
 * Presentational: the host layout owns the nav list, its role/permission filter,
 * its entry gate and sign-out; this component only renders what it is given, sized
 * by `mode` / `expanded` (w-56 / w-14). It reads no auth store, no i18n and no API
 * client (import allowlist enforced by ResponsiveSidebar.test.tsx). The mode itself
 * comes from `useShellSidebar`; it is never derived here from a CSS breakpoint.
 *
 * Layer: the sidebar (inline aside, drawer panel, backdrop) is z-[45] in every mode,
 * above the top bar (z-40) and below Dialog / IdleLogoutModal (z-50).
 * Rail-band expansion stays inline and pushes content; there is no overlay variant.
 *
 * The drawer is a navigation panel (a labelled aside that takes focus, closes on Escape,
 * backdrop tap or navigation), not a Dialog: it has no dismissal policy of its own, so it
 * deliberately carries no dialog role and is not one of the modal roots counted by the
 * MODAL-13 census.
 */
import { useEffect, useRef } from 'react'
import { NavLink, Link } from 'react-router-dom'
import MaterialIcon from './MaterialIcon'
import type { ViewportMode } from '../hooks/useViewportMode'

export interface SidebarNavItem {
  to: string
  icon: string
  /** Already rendered (translated or literal) by the host. */
  label: string
}

export interface ResponsiveSidebarProps {
  mode: ViewportMode
  expanded: boolean
  drawerOpen: boolean
  onToggleExpanded: () => void
  /**
   * Called on nav-item or preNav activation in drawer mode, and on backdrop tap and
   * Escape. The host passes `shell.closeDrawer`.
   */
  onCloseDrawer: () => void
  /** Already filtered by the host; rendered as-is in every mode. */
  items: readonly SidebarNavItem[]
  header: { title: string; subtitle?: string }
  /** Settings "Back to Dashboard" only. */
  preNav?: SidebarNavItem
  footer: {
    name: string | null
    roleLabel: string | null
    initial: string
    signOutLabel: string
    onSignOut: () => void
  }
}

const NAV_ACTIVE_LABELED =
  'flex items-center gap-md px-lg min-h-[44px] border-r-4 border-primary bg-surface-container-low text-primary font-bold'
const NAV_IDLE_LABELED =
  'flex items-center gap-md px-lg min-h-[44px] mx-sm rounded-lg text-on-surface-variant hover:bg-surface-container transition-colors'
const NAV_ACTIVE_ICON =
  'flex items-center justify-center min-h-[44px] w-full border-r-4 border-primary bg-surface-container-low text-primary'
const NAV_IDLE_ICON =
  'flex items-center justify-center min-h-[44px] mx-1 rounded-lg text-on-surface-variant hover:bg-surface-container transition-colors'

function navClass(isActive: boolean, labeled: boolean): string {
  if (labeled) return isActive ? NAV_ACTIVE_LABELED : NAV_IDLE_LABELED
  return isActive ? NAV_ACTIVE_ICON : NAV_IDLE_ICON
}

/** Hamburger that opens the drawer. Rendered by the top bar in drawer mode only. */
export function SidebarMenuButton({ onOpen, label }: { onOpen: () => void; label: string }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-surface-container text-on-surface-variant transition-colors flex-shrink-0"
    >
      <MaterialIcon name="menu" size={22} />
    </button>
  )
}

interface BodyProps extends ResponsiveSidebarProps {
  /** Show labels, title and footer identity (expanded inline, or the drawer panel). */
  labeled: boolean
  /** Show the collapse toggle (inline modes only). */
  showToggle: boolean
  /** Runs when a link is activated (drawer mode closes the drawer). */
  onNavigate?: () => void
}

function SidebarHeader({ header, labeled, showToggle, expanded, onToggleExpanded }: BodyProps): JSX.Element {
  return (
    <div className="flex items-center justify-between px-sm pt-md pb-md border-b border-outline-variant min-h-[64px] flex-shrink-0">
      {labeled && (
        <div className="pl-sm min-w-0">
          <p className="text-headline-sm font-headline font-bold text-primary leading-tight truncate">{header.title}</p>
          {header.subtitle && <p className="text-label-md text-on-surface-variant mt-0.5 truncate">{header.subtitle}</p>}
        </div>
      )}
      {showToggle && (
        <button
          type="button"
          onClick={onToggleExpanded}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-surface-container text-on-surface-variant transition-colors flex-shrink-0 ml-auto"
          aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          <MaterialIcon name={expanded ? 'menu_open' : 'menu'} size={22} />
        </button>
      )}
    </div>
  )
}

function SidebarNav({ items, preNav, labeled, onNavigate }: BodyProps): JSX.Element {
  return (
    <nav className="flex flex-col flex-1 py-sm overflow-y-auto">
      {preNav && (
        <>
          <Link
            to={preNav.to}
            onClick={onNavigate}
            aria-label={labeled ? undefined : preNav.label}
            className={navClass(false, labeled)}
          >
            <MaterialIcon name={preNav.icon} size={22} className="flex-shrink-0" />
            {labeled && <span className="text-body-md whitespace-nowrap">{preNav.label}</span>}
          </Link>
          <div className="h-px bg-outline-variant mx-sm my-sm" />
        </>
      )}
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          aria-label={labeled ? undefined : item.label}
          className={({ isActive }) => navClass(isActive, labeled)}
        >
          <MaterialIcon name={item.icon} size={22} className="flex-shrink-0" />
          {labeled && <span className="text-body-md whitespace-nowrap">{item.label}</span>}
        </NavLink>
      ))}
    </nav>
  )
}

function SidebarFooter({ footer, labeled }: BodyProps): JSX.Element {
  return (
    <div className="border-t border-outline-variant p-sm flex-shrink-0">
      {labeled && (
        <div className="flex items-center gap-sm px-sm mb-sm">
          <div className="w-10 h-10 rounded-full bg-primary text-on-primary flex items-center justify-center text-label-md font-bold flex-shrink-0 select-none">
            {footer.initial}
          </div>
          <div className="min-w-0">
            <p className="text-body-sm font-medium text-on-surface truncate">{footer.name}</p>
            <p className="text-label-md text-on-surface-variant capitalize">{footer.roleLabel}</p>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={footer.onSignOut}
        aria-label={footer.signOutLabel}
        className={`w-full min-h-[44px] flex items-center justify-center gap-sm text-on-surface-variant hover:bg-surface-container border border-outline-variant rounded-lg transition-colors text-body-sm ${labeled ? 'px-md' : ''}`}
      >
        <MaterialIcon name="logout" size={18} />
        {labeled && <span>{footer.signOutLabel}</span>}
      </button>
    </div>
  )
}

function SidebarBody(props: BodyProps): JSX.Element {
  return (
    <>
      <SidebarHeader {...props} />
      <SidebarNav {...props} />
      <SidebarFooter {...props} />
    </>
  )
}

const ASIDE_BASE = 'fixed left-0 top-0 h-screen z-[45] bg-surface shadow-sm flex flex-col overflow-hidden'

/**
 * Mounted only while the drawer is open, so mount = open and unmount = close:
 * focus moves into the panel on open and returns to the previously focused element
 * (the hamburger) on close; Escape asks the host to close.
 */
function DrawerPanel(props: ResponsiveSidebarProps): JSX.Element {
  const { onCloseDrawer } = props
  const panelRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panelRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onCloseDrawer()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      opener?.focus()
    }
  }, [onCloseDrawer])

  return (
    <>
      <div
        data-testid="sidebar-backdrop"
        aria-hidden="true"
        onClick={onCloseDrawer}
        className="fixed left-0 top-0 h-screen w-screen z-[45] bg-primary/30"
      />
      <aside
        ref={panelRef}
        aria-label={props.header.title}
        tabIndex={-1}
        className={`${ASIDE_BASE} w-56 outline-none`}
      >
        <SidebarBody {...props} labeled showToggle={false} onNavigate={onCloseDrawer} />
      </aside>
    </>
  )
}

/**
 * Inline (expanded / rail) aside, or the drawer panel below the rail band.
 * A closed drawer renders nothing: no node in the flow or the accessibility tree.
 */
export default function ResponsiveSidebar(props: ResponsiveSidebarProps): JSX.Element {
  if (props.mode === 'drawer') {
    return props.drawerOpen ? <DrawerPanel {...props} /> : <></>
  }
  return (
    <aside className={`${ASIDE_BASE} ${props.expanded ? 'w-56' : 'w-14'} transition-all duration-200`}>
      <SidebarBody {...props} labeled={props.expanded} showToggle />
    </aside>
  )
}
