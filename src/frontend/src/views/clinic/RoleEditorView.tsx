/**
 * RoleEditorView — Clinic Role Editor page (/clinic-admin/roles).
 *
 * Guarded by `roles.view` permission (route-level in App.tsx).
 * "Create Role" button and mutations are guarded by `roles.manage`.
 *
 * AC-1..AC-10 are all delegated to child components.
 */
import { useCallback } from 'react'
import MaterialIcon from '../../components/MaterialIcon'
import RoleList from '../../components/roles/RoleList'
import {
  useRolesQuery,
  usePermissionCatalogueQuery,
} from '../../hooks/useRoles'
import { useAuthStore } from '../../store/authStore'

/** Role permission code required to edit/clone/delete roles */
const MANAGE_PERM = 'roles.manage'

/**
 * Main page component for the Clinic Role Editor.
 * Fetches roles and permission catalogue in parallel on mount.
 */
export default function RoleEditorView() {
  const rolesQuery   = useRolesQuery()
  const catalogQuery = usePermissionCatalogueQuery()
  const permissions  = useAuthStore((s) => s.permissions)

  const canManage = permissions.includes(MANAGE_PERM)

  /**
   * AC-9: Assign-staff entry point.
   * T-5F-03 multi-role picker is not yet implemented — this is a placeholder callback
   * that will be replaced when T-5F-03 is delivered.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleAssignStaff = useCallback((_roleId: string, _roleName: string) => {
    // TODO T-5F-03: open multi-role picker
  }, [])

  const isLoading = rolesQuery.isLoading || catalogQuery.isLoading
  const isError   = rolesQuery.isError || catalogQuery.isError

  return (
    <div className="pt-16 p-margin-desktop space-y-xl min-h-screen bg-background">

      {/* Page header */}
      <div className="flex flex-col gap-md sm:flex-row sm:justify-between sm:items-end">
        <div>
          <h2 className="text-headline-lg font-headline font-bold text-primary">
            Roles &amp; Permissions
          </h2>
          <p className="text-body-md text-on-surface-variant mt-xs">
            Manage access levels for your clinic staff.
          </p>
        </div>

        {/* "Create Role" — visible only with roles.manage (clone is the creation path) */}
        {canManage && (
          <button
            type="button"
            disabled
            title="Clone a system role to create a custom role"
            className="px-lg py-base bg-primary text-on-primary font-bold rounded-lg shadow-sm
                       hover:opacity-90 transition-opacity flex items-center gap-xs
                       min-h-[44px] min-w-[44px] opacity-50 cursor-not-allowed w-full sm:w-auto"
          >
            <MaterialIcon name="add" size={20} />
            Create Role
          </button>
        )}
      </div>

      {/* Role list panel */}
      <div className="bg-surface rounded-xl shadow-sm border border-outline-variant overflow-hidden">

        {/* Loading skeleton */}
        {isLoading && (
          <div className="animate-pulse divide-y divide-outline-variant">
            {[1, 2, 3].map((n) => (
              <div key={n} className="px-lg py-md space-y-xs border-b border-outline-variant">
                <div className="h-5 bg-surface-container-high rounded w-48" />
                <div className="h-4 bg-surface-container rounded w-32 mt-xs" />
              </div>
            ))}
          </div>
        )}

        {/* Error state */}
        {isError && !isLoading && (
          <div className="flex flex-col items-center justify-center py-2xl gap-md text-center">
            <MaterialIcon name="error_outline" size={48} className="text-error" />
            <p className="text-headline-xs font-headline text-error">Failed to load roles</p>
            <button
              type="button"
              onClick={() => {
                void rolesQuery.refetch()
                void catalogQuery.refetch()
              }}
              className="px-lg py-base border border-outline-variant rounded-lg text-on-surface
                         font-bold hover:bg-surface-container min-h-[44px] flex items-center gap-xs
                         transition-colors"
            >
              <MaterialIcon name="refresh" size={16} />
              Retry
            </button>
          </div>
        )}

        {/* Loaded state */}
        {!isLoading && !isError && rolesQuery.data && catalogQuery.data && (
          <RoleList
            roles={rolesQuery.data}
            catalogue={catalogQuery.data}
            canManage={canManage}
            onAssignStaff={handleAssignStaff}
          />
        )}
      </div>
    </div>
  )
}
