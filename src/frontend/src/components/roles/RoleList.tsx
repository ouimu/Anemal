/**
 * RoleList — expandable role accordion with inline permission editing.
 *
 * AC-1: Shows name, SYSTEM badge, assignedUserCount chip.
 * AC-2: Expand reveals RolePermissionEditor; system roles are read-only.
 * AC-3: Clone button → opens CloneRoleModal.
 * AC-4: Custom role edit → delta → PUT on Save.
 * AC-6: Delete 409 → "Reassign N staff" error dialog.
 * AC-7: Delete 200 → removed from list.
 * AC-8: Edited own role → refreshPermissions().
 * AC-9: "Assign staff" entry point (TODO placeholder for T-5F-03).
 */
import { useState } from 'react'
import MaterialIcon from '../MaterialIcon'
import RolePermissionEditor from './RolePermissionEditor'
import CloneRoleModal from './CloneRoleModal'
import {
  type Role,
  type PermissionCatalogue,
  useUpdateRolePermissionsMutation,
  useDeleteRoleMutation,
} from '../../hooks/useRoles'
import { useAuthStore } from '../../store/authStore'
import { useT } from '../../i18n'

// ── Toast helper (inline, no external lib needed) ────────────────────────────

interface ToastState {
  type: 'success' | 'error'
  message: string
}

// ── Delete confirmation dialog ───────────────────────────────────────────────

interface DeleteDialogProps {
  roleName: string
  assignedCount: number | null
  onConfirm: () => void
  onClose: () => void
  isDeleting: boolean
}

function DeleteDialog({ roleName, assignedCount, onConfirm, onClose, isDeleting }: DeleteDialogProps) {
  const t = useT()
  const hasUsers = assignedCount !== null && assignedCount > 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      aria-modal="true"
      role="dialog"
    >
      <div className="bg-surface rounded-xl shadow-lvl3 p-xl w-[440px] max-w-[calc(100vw-32px)] space-y-lg">
        {hasUsers ? (
          /* AC-6: 409 path */
          <>
            <div className="flex items-center gap-md">
              <MaterialIcon name="warning" size={28} className="text-error flex-shrink-0" />
              <h3 className="text-headline-sm font-headline font-semibold text-error">
                Cannot Delete Role
              </h3>
            </div>
            <div className="p-md bg-error-container rounded-lg flex items-center gap-md">
              <MaterialIcon name="info" size={18} className="text-error-on-container flex-shrink-0" />
              <p className="text-body-sm text-error-on-container font-bold">
                {t('roles.deleteBlocked').replace('{n}', String(assignedCount))}
              </p>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-lg py-base border border-outline-variant rounded-lg text-on-surface
                           font-bold hover:bg-surface-container min-h-[44px] transition-colors"
              >
                Close
              </button>
            </div>
          </>
        ) : (
          /* AC-7: 200 path */
          <>
            <h3 className="text-headline-sm font-headline font-semibold text-error">{t('roles.deleteRole')}</h3>
            <p className="text-body-sm text-on-surface-variant">
              Are you sure you want to delete <strong className="text-on-surface">{roleName}</strong>?
              This action cannot be undone.
            </p>
            <div className="flex gap-md justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={isDeleting}
                className="px-lg py-base border border-outline-variant rounded-lg text-on-surface
                           font-bold hover:bg-surface-container min-h-[44px] transition-colors
                           disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={isDeleting}
                className="px-lg py-base bg-error text-on-primary font-bold rounded-lg
                           hover:opacity-90 min-h-[44px] flex items-center gap-xs transition-opacity
                           disabled:opacity-50"
              >
                {isDeleting ? (
                  <MaterialIcon name="progress_activity" size={16} className="animate-spin" />
                ) : null}
                Delete
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  roles: Role[]
  catalogue: PermissionCatalogue
  canManage: boolean
  onAssignStaff: (roleId: string, roleName: string) => void
  /** Called after successful clone so the parent can highlight the new row */
  onCloned?: (newRoleId: string) => void
}

// ── RoleList ─────────────────────────────────────────────────────────────────

/**
 * Renders the full role accordion panel.
 * Expand/collapse is managed locally; only one row expanded on small viewports.
 */
export default function RoleList({
  roles,
  catalogue,
  canManage,
  onAssignStaff,
  onCloned,
}: Props) {
  const t = useT()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [cloneSource, setCloneSource] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null)
  const [deleteAssignedCount, setDeleteAssignedCount] = useState<number | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [highlightId, setHighlightId] = useState<string | null>(null)

  const userPermissions = useAuthStore((s) => s.permissions)
  const userRoleIds     = useAuthStore((s) => s.roleIds)
  const refreshPerms    = useAuthStore((s) => s.refreshPermissions)

  const updateMut = useUpdateRolePermissionsMutation()
  const deleteMut = useDeleteRoleMutation()

  /** Show auto-dismissing toast */
  const showToast = (t: ToastState) => {
    setToast(t)
    window.setTimeout(() => setToast(null), 4_000)
  }

  const toggleExpand = (id: string) =>
    setExpandedId((prev) => (prev === id ? null : id))

  const handleSave = (role: Role, delta: { add: string[]; remove: string[] }) => {
    updateMut.mutate(
      { roleId: role.id, ...delta },
      {
        onSuccess: async () => {
          showToast({ type: 'success', message: 'Permissions updated' })
          // AC-8: refresh own permissions if the edited role is in current user's roles
          if (userRoleIds.map(String).includes(role.id)) {
            await refreshPerms()
          }
        },
        onError: (err) => {
          showToast({ type: 'error', message: err.message ?? 'Failed to update permissions' })
        },
      }
    )
  }

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return
    deleteMut.mutate(deleteTarget.id, {
      onSuccess: () => {
        setDeleteTarget(null)
        setDeleteAssignedCount(null)
        showToast({ type: 'success', message: `Role "${deleteTarget.name}" deleted` })
      },
      onError: (err) => {
        const axiosErr = err as { response?: { status: number; data?: { data?: { assignedCount: number } } } }
        if (axiosErr.response?.status === 409) {
          const count = axiosErr.response.data?.data?.assignedCount ?? 1
          setDeleteAssignedCount(count)
        } else {
          setDeleteTarget(null)
          showToast({ type: 'error', message: err.message ?? 'Failed to delete role' })
        }
      },
    })
  }

  const handleCloned = (newRoleId: string) => {
    setCloneSource(null)
    setHighlightId(newRoleId)
    window.setTimeout(() => setHighlightId(null), 2_500)
    onCloned?.(newRoleId)
  }

  if (roles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-2xl gap-md text-center">
        <MaterialIcon name="admin_panel_settings" size={48} className="text-outline" />
        <p className="text-headline-xs font-headline text-on-surface-variant">No roles found</p>
        <p className="text-body-sm text-on-surface-variant">
          Contact Anemal support if system roles are missing.
        </p>
      </div>
    )
  }

  return (
    <>
      {/* Role rows */}
      {roles.map((role) => {
        const isExpanded  = expandedId === role.id
        const isHighlight = highlightId === role.id

        return (
          <div
            key={role.id}
            className={`border-b border-outline-variant last:border-b-0
                        ${isHighlight ? 'ring-2 ring-secondary ring-inset transition-all duration-200' : ''}`}
          >
            {/* Collapsed row header */}
            <div
              role="button"
              tabIndex={0}
              aria-expanded={isExpanded}
              onClick={() => toggleExpand(role.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleExpand(role.id) }}
              className="flex items-center justify-between px-lg py-md min-h-[48px]
                         hover:bg-surface-container-low transition-colors cursor-pointer"
            >
              {/* Left: chevron + name + badge */}
              <div className="flex items-center gap-md min-w-0">
                <MaterialIcon
                  name="expand_more"
                  size={20}
                  className={`text-on-surface-variant transition-transform duration-200 flex-shrink-0
                              ${isExpanded ? 'rotate-180' : ''}`}
                />
                <span className="text-headline-xs font-headline font-semibold text-on-surface truncate">
                  {role.name}
                </span>
                {role.isSystem && (
                  <span className="px-md py-xs bg-surface-container-high rounded-full
                                   text-label-md text-on-surface-variant font-bold flex-shrink-0">
                    {t('roles.systemBadge')}
                  </span>
                )}
              </div>

              {/* Right: count chip + action buttons */}
              <div
                role="none"
                className="flex items-center gap-md flex-wrap justify-end flex-shrink-0 ml-md"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Assigned user count chip */}
                {role.assignedUserCount > 0 && (
                  <span className="flex items-center gap-xs text-label-md text-on-surface-variant flex-shrink-0">
                    <MaterialIcon name="group" size={16} />
                    {t('roles.assignedCount').replace('{n}', String(role.assignedUserCount))}
                  </span>
                )}

                {/* Assign staff (AC-9) */}
                <button
                  type="button"
                  onClick={() => onAssignStaff(role.id, role.name)}
                  className="px-md py-xs border border-outline-variant rounded-lg
                             text-label-md text-on-surface hover:bg-surface-container
                             transition-colors min-h-[44px] min-w-[44px]
                             flex items-center gap-xs"
                  title="Assign staff to this role"
                >
                  <MaterialIcon name="person_add" size={16} />
                  <span className="hidden sm:inline">{t('roles.assignStaff')}</span>
                </button>

                {/* Clone — system roles only, requires manage */}
                {role.isSystem && canManage && (
                  <button
                    type="button"
                    onClick={() => setCloneSource(role.name)}
                    className="px-md py-xs border border-outline-variant rounded-lg
                               text-label-md text-secondary hover:bg-surface-container
                               transition-colors min-h-[44px] min-w-[44px]
                               flex items-center gap-xs"
                    title="Clone this role"
                  >
                    <MaterialIcon name="content_copy" size={16} />
                    <span className="hidden sm:inline">Clone</span>
                  </button>
                )}

                {/* Delete — custom roles only, requires manage */}
                {!role.isSystem && canManage && (
                  <button
                    type="button"
                    onClick={() => { setDeleteTarget(role); setDeleteAssignedCount(null) }}
                    className="px-md py-xs border border-error rounded-lg
                               text-label-md text-error hover:bg-error-container
                               transition-colors min-h-[44px] min-w-[44px]
                               flex items-center gap-xs"
                    title="Delete this role"
                  >
                    <MaterialIcon name="delete" size={16} />
                    <span className="hidden sm:inline">Delete</span>
                  </button>
                )}
              </div>
            </div>

            {/* Expanded permission panel */}
            {isExpanded && (
              <RolePermissionEditor
                roleId={role.id}
                isSystem={role.isSystem}
                currentPermissions={role.permissions}
                catalogue={catalogue}
                userPermissions={userPermissions}
                onClone={() => setCloneSource(role.name)}
                onSave={(delta) => handleSave(role, delta)}
                isSaving={updateMut.isPending}
              />
            )}
          </div>
        )
      })}

      {/* Clone modal (AC-3) */}
      {cloneSource && (
        <CloneRoleModal
          sourceRoleName={cloneSource}
          onClose={() => setCloneSource(null)}
          onCloned={handleCloned}
        />
      )}

      {/* Delete dialog (AC-6 / AC-7) */}
      {deleteTarget && (
        <DeleteDialog
          roleName={deleteTarget.name}
          assignedCount={deleteAssignedCount}
          onConfirm={handleDeleteConfirm}
          onClose={() => { setDeleteTarget(null); setDeleteAssignedCount(null) }}
          isDeleting={deleteMut.isPending}
        />
      )}

      {/* Toast notification */}
      {toast && (
        <div
          className={`fixed bottom-lg right-lg z-50 flex items-center gap-md px-lg py-md rounded-xl shadow-lvl2
                      ${toast.type === 'success'
                        ? 'bg-secondary-container text-on-secondary-container'
                        : 'bg-error-container text-error-on-container'
                      }`}
        >
          <MaterialIcon
            name={toast.type === 'success' ? 'check_circle' : 'error_outline'}
            size={20}
          />
          <p className="text-body-sm font-bold">{toast.message}</p>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="ml-auto min-h-[44px] min-w-[44px] flex items-center justify-center
                       hover:opacity-70 rounded-full transition-opacity"
            aria-label="Dismiss"
          >
            <MaterialIcon name="close" size={16} />
          </button>
        </div>
      )}
    </>
  )
}
