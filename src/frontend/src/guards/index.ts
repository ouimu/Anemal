/**
 * Guards barrel — composable route and visibility guards for Anemal.
 *
 * Route guards (redirect on failure):
 *   RequireAuth       — any authenticated session
 *   RequirePlane      — plane-specific session (clinic | platform)
 *   RequirePermission — specific permission code, with optional OR-list
 *
 * Visibility guard (renders null on failure):
 *   Can               — inline permission gate, no DOM node when denied
 *
 * Hook:
 *   usePermissions    — reactive access to permissions array + hasPermission
 */
export { RequireAuth }       from './RequireAuth'
export { RequirePlane }      from './RequirePlane'
export { RequirePermission } from './RequirePermission'
export { Can }               from './Can'
export { usePermissions }    from './usePermissions'
