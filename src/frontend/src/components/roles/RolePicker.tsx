/**
 * RolePicker — role-assignment section for the staff editor (T-5F-03).
 *
 * Shows the user's current roles as removable chips and provides a searchable
 * dropdown to add grantable roles.  All role mutations (add / remove) are
 * immediate API calls — they do not wait for the parent form's Save button.
 *
 * @prop userId          - ID of the staff member being edited.
 * @prop currentRoles    - Roles currently assigned (from useUserRolesQuery).
 * @prop onRolesChanged  - Called after any successful add/remove so the parent
 *                         can refresh its display data if needed.
 */
import { useState, useRef, useEffect } from 'react'
import type { AxiosError } from 'axios'
import { useAuthStore } from '../../store/authStore'
import { useT } from '../../i18n'
import {
  useClinicRolesQuery,
  useAssignRoleMutation,
  useRemoveRoleMutation,
  type Role,
} from '../../hooks/useUserRoles'

// ─── Grantability helper ──────────────────────────────────────────────────────

/**
 * Returns true if every permission in targetRole.permissions is also present
 * in adminPermissions (acting admin's effective set).
 * An empty targetRole.permissions set is always grantable.
 */
function isGrantable(targetRole: Role, adminPermissions: ReadonlySet<string>): boolean {
  return targetRole.permissions.every((code) => adminPermissions.has(code))
}

/** Heuristic: is this role an admin-level role that triggers self-demotion warning? */
function isAdminLevelRole(role: Role): boolean {
  return (
    role.name === 'clinic_admin' ||
    role.permissions.includes('staff.assign_role') ||
    role.permissions.includes('staff.manage')
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface RoleChipProps {
  role:       Role
  onRemove:   (roleId: number) => void
  isRemoving: boolean
}

/** A chip representing one assigned role with a 44×44 px remove button. */
function RoleChip({ role, onRemove, isRemoving }: RoleChipProps) {
  return (
    <div
      className={[
        'flex items-center gap-xs',
        'bg-secondary-container text-on-secondary-container',
        'rounded-full pl-md pr-xs py-xs',
        'border border-outline-variant',
        'text-label-md font-bold',
        'min-h-[36px]',
        isRemoving ? 'opacity-70' : '',
      ].join(' ')}
      role="listitem"
    >
      {role.isSystem && (
        <span
          className="material-symbols-outlined text-[16px] text-secondary"
          aria-label="System role"
          title="System role — cannot be deleted"
        >
          verified
        </span>
      )}
      <span>{role.name}</span>

      <button
        type="button"
        onClick={() => onRemove(role.id)}
        disabled={isRemoving}
        aria-label={`Remove role ${role.name}`}
        className={[
          'flex items-center justify-center',
          'min-h-[44px] min-w-[44px]',
          '-mr-xs rounded-full',
          'text-on-surface-variant',
          'hover:bg-surface-container hover:text-error',
          'transition-colors',
          'disabled:opacity-50 disabled:cursor-not-allowed',
        ].join(' ')}
      >
        {isRemoving ? (
          <span className="material-symbols-outlined text-[18px] animate-spin">
            progress_activity
          </span>
        ) : (
          <span className="material-symbols-outlined text-[18px]">close</span>
        )}
      </button>
    </div>
  )
}

function EmptyRolesState() {
  const t = useT()
  return (
    <div className="flex items-center gap-sm px-md py-sm bg-error-container rounded-lg w-full">
      <span className="material-symbols-outlined text-on-error-container text-[20px]">
        warning
      </span>
      <p className="text-body-sm text-on-error-container">
        {t('roles.noRoles')}
      </p>
    </div>
  )
}

interface LastRoleErrorBannerProps {
  onDismiss: () => void
}

function LastRoleErrorBanner({ onDismiss }: LastRoleErrorBannerProps) {
  const t = useT()
  return (
    <div
      role="alert"
      className={[
        'flex items-start gap-sm',
        'mt-sm px-md py-sm',
        'bg-error-container rounded-lg',
        'border border-error/30',
      ].join(' ')}
    >
      <span className="material-symbols-outlined text-on-error-container text-[20px] shrink-0 mt-[2px]">
        error
      </span>
      <div className="flex-1">
        <p className="text-body-sm text-on-error-container font-bold">
          {t('roles.cannotRemoveLast')}
        </p>
        <p className="text-body-sm text-on-error-container">
          {t('roles.lastRoleDesc')}
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="ml-auto min-h-[44px] min-w-[44px] flex items-center justify-center text-on-error-container hover:opacity-70 transition-opacity"
      >
        <span className="material-symbols-outlined text-[20px]">close</span>
      </button>
    </div>
  )
}

interface SelfDemotionDialogProps {
  onCancel:  () => void
  onConfirm: () => void
}

function SelfDemotionDialog({ onCancel, onConfirm }: SelfDemotionDialogProps) {
  const t = useT()
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="self-demote-title"
      className={[
        'fixed inset-0 z-[100] flex items-center justify-center',
        'bg-primary/30',
        'p-md',
      ].join(' ')}
    >
      <div className="bg-surface rounded-xl shadow-lvl3 w-full max-w-[400px] p-lg space-y-md">
        <div className="flex justify-center">
          <div className="w-12 h-12 rounded-full bg-error-container flex items-center justify-center">
            <span className="material-symbols-outlined text-on-error-container text-[24px]">
              admin_panel_settings
            </span>
          </div>
        </div>
        <h2
          id="self-demote-title"
          className="text-headline-xs text-on-surface text-center"
        >
          {t('roles.selfDemotionTitle')}
        </h2>
        <p className="text-body-sm text-on-surface-variant text-center">
          {t('roles.selfDemotionDesc')}
        </p>
        <div className="flex gap-md pt-sm">
          <button
            type="button"
            onClick={onCancel}
            className={[
              'flex-1 min-h-[44px]',
              'border border-outline-variant rounded-lg',
              'text-body-sm font-bold text-on-surface',
              'hover:bg-surface-container transition-colors',
            ].join(' ')}
          >
            {t('roles.keepRole')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={[
              'flex-1 min-h-[44px]',
              'bg-error text-on-primary rounded-lg',
              'text-body-sm font-bold',
              'hover:opacity-90 transition-opacity',
            ].join(' ')}
          >
            {t('roles.removeAnyway')}
          </button>
        </div>
      </div>
    </div>
  )
}

interface RoleOptionProps {
  role:          Role
  isAssigned:    boolean
  isGrantable:   boolean
  isAdding:      boolean
  onSelect:      (roleId: number) => void
}

function RoleOption({ role, isAssigned, isGrantable: grantable, isAdding, onSelect }: RoleOptionProps) {
  const disabled = isAssigned || !grantable

  return (
    <li role="option" aria-selected={isAssigned} aria-disabled={disabled}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && onSelect(role.id)}
        className={[
          'w-full flex items-center gap-md',
          'px-md min-h-[52px]',
          'text-left transition-colors',
          isAssigned
            ? 'bg-surface-container-low text-on-surface-variant cursor-default'
            : grantable
              ? 'hover:bg-surface-container text-on-surface cursor-pointer'
              : 'opacity-40 cursor-not-allowed text-on-surface-variant',
        ].join(' ')}
      >
        <span
          className={[
            'material-symbols-outlined text-[20px] shrink-0',
            isAssigned ? 'text-secondary' : 'text-outline',
          ].join(' ')}
        >
          {isAssigned ? 'check_circle' : grantable ? 'radio_button_unchecked' : 'lock'}
        </span>

        <div className="flex-1 min-w-0">
          <p className="text-body-sm font-bold truncate">{role.name}</p>
          {role.isSystem && (
            <p className="text-label-md text-on-surface-variant">System role</p>
          )}
          {!grantable && (
            <p className="text-label-md text-on-surface-variant">
              Requires permissions you do not hold
            </p>
          )}
        </div>

        {isAdding && (
          <span className="material-symbols-outlined text-[20px] text-secondary animate-spin shrink-0">
            progress_activity
          </span>
        )}
      </button>
    </li>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export interface RolePickerProps {
  /** ID of the staff member whose roles are being managed. */
  userId:         number
  /** Current assigned roles (fetched by the parent via useUserRolesQuery). */
  currentRoles:   Role[]
  /** Called after any successful add or remove. */
  onRolesChanged: () => void
}

/**
 * RolePicker — role-assignment section embedded inside the staff editor.
 *
 * Gate with `<Can perm="staff.assign_role">` before rendering.
 */
export default function RolePicker({ userId, currentRoles, onRolesChanged }: RolePickerProps) {
  const t                  = useT()
  const authUserId         = useAuthStore((s) => s.userId)
  const authPermissions    = useAuthStore((s) => s.permissions)
  const refreshPermissions = useAuthStore((s) => s.refreshPermissions)

  const adminPermSet = new Set(authPermissions)

  const { data: allRoles = [], isError: rolesLoadError } = useClinicRolesQuery()
  const assignMutation  = useAssignRoleMutation()
  const removeMutation  = useRemoveRoleMutation()

  // Local UI state
  const [pickerOpen,       setPickerOpen]       = useState(false)
  const [searchQuery,      setSearchQuery]       = useState('')
  const [removingIds,      setRemovingIds]       = useState<Set<number>>(new Set())
  const [addingId,         setAddingId]          = useState<number | null>(null)
  const [errorBanner,      setErrorBanner]       = useState<'last-role' | 'forbidden' | null>(null)
  const [selfDemoteRoleId, setSelfDemoteRoleId]  = useState<number | null>(null)

  const panelRef   = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  // Close picker on outside click
  useEffect(() => {
    if (!pickerOpen) return
    function handleClick(e: MouseEvent) {
      if (
        panelRef.current   && !panelRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setPickerOpen(false)
        setSearchQuery('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [pickerOpen])

  // ── Computed values ──────────────────────────────────────────────────────

  const assignedIds    = new Set(currentRoles.map((r) => r.id))
  const grantableRoles = allRoles.filter((r) => isGrantable(r, adminPermSet))
  const allAssigned    = allRoles.length > 0 && allRoles.every((r) => assignedIds.has(r.id))

  const filteredRoles  = allRoles.filter((r) =>
    r.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const isSelf = userId === authUserId

  // ── Handlers ─────────────────────────────────────────────────────────────

  async function handleAddRole(roleId: number): Promise<void> {
    setAddingId(roleId)
    setPickerOpen(false)
    setSearchQuery('')
    try {
      await assignMutation.mutateAsync({ userId, roleId })
      onRolesChanged()
      if (isSelf) await refreshPermissions()
    } catch (err) {
      const status = (err as AxiosError)?.response?.status
      setErrorBanner(status === 403 ? 'forbidden' : null)
    } finally {
      setAddingId(null)
    }
  }

  function handleRemoveRequest(roleId: number): void {
    if (currentRoles.length === 1) {
      setErrorBanner('last-role')
      return
    }
    const role = currentRoles.find((r) => r.id === roleId)
    if (isSelf && role && isAdminLevelRole(role)) {
      setSelfDemoteRoleId(roleId)
      return
    }
    void executeRemove(roleId)
  }

  async function executeRemove(roleId: number): Promise<void> {
    setRemovingIds((prev) => new Set(prev).add(roleId))
    try {
      await removeMutation.mutateAsync({ userId, roleId })
      setErrorBanner(null)
      onRolesChanged()
      if (isSelf) await refreshPermissions()
    } catch (err) {
      const status = (err as AxiosError)?.response?.status
      if (status === 409) {
        setErrorBanner('last-role')
      }
    } finally {
      setRemovingIds((prev) => {
        const next = new Set(prev)
        next.delete(roleId)
        return next
      })
    }
  }

  function confirmSelfDemotion(): void {
    if (selfDemoteRoleId !== null) {
      const id = selfDemoteRoleId
      setSelfDemoteRoleId(null)
      void executeRemove(id)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {selfDemoteRoleId !== null && (
        <SelfDemotionDialog
          onCancel={() => setSelfDemoteRoleId(null)}
          onConfirm={confirmSelfDemotion}
        />
      )}

      <section aria-labelledby="roles-section-label" className="pt-lg">
        <div className="flex items-center justify-between mb-md">
          <div>
            <h3
              id="roles-section-label"
              className="text-headline-xs text-on-surface"
            >
              Roles
            </h3>
            <p className="text-body-sm text-on-surface-variant mt-xs">
              Effective permissions are the union of all assigned roles.
            </p>
          </div>
        </div>

        {/* Current role chips */}
        <div
          className="flex flex-wrap gap-sm min-h-[44px] items-start"
          aria-label="Assigned roles"
          role="list"
        >
          {currentRoles.length === 0 && <EmptyRolesState />}
          {currentRoles.map((role) => (
            <RoleChip
              key={role.id}
              role={role}
              isRemoving={removingIds.has(role.id)}
              onRemove={handleRemoveRequest}
            />
          ))}
        </div>

        {/* Error / info banners */}
        {errorBanner === 'last-role' && (
          <LastRoleErrorBanner onDismiss={() => setErrorBanner(null)} />
        )}
        {errorBanner === 'forbidden' && (
          <div
            role="alert"
            className="flex items-center gap-sm mt-sm px-md py-sm bg-error-container rounded-lg"
          >
            <span className="material-symbols-outlined text-on-error-container text-[20px]">
              error
            </span>
            <p className="text-body-sm text-on-error-container">
              {t('roles.cannotGrant')}
            </p>
          </div>
        )}

        {/* Roles catalogue load error */}
        {rolesLoadError && (
          <div
            role="alert"
            className="flex items-center gap-sm mt-sm px-md py-sm bg-error-container rounded-lg"
          >
            <span className="material-symbols-outlined text-on-error-container text-[20px]">
              warning
            </span>
            <p className="text-body-sm text-on-error-container">
              {t('roles.loadError')}
            </p>
          </div>
        )}

        {/* Add role trigger */}
        {!allAssigned && (
          <div className="relative mt-sm">
            <button
              ref={triggerRef}
              type="button"
              onClick={() => { setPickerOpen((o) => !o); setSearchQuery('') }}
              aria-expanded={pickerOpen}
              aria-controls="role-picker-panel"
              className={[
                'flex items-center gap-xs',
                'min-h-[44px] px-md',
                'border border-dashed border-outline',
                'rounded-lg',
                'text-on-surface-variant text-body-sm',
                'hover:bg-surface-container hover:border-primary hover:text-primary',
                'transition-colors',
              ].join(' ')}
            >
              <span className="material-symbols-outlined text-[20px]">add</span>
              {t('roles.addRole')}
            </button>

            {/* Picker dropdown */}
            {pickerOpen && (
              <div
                ref={panelRef}
                id="role-picker-panel"
                role="dialog"
                aria-label="Add role picker"
                className={[
                  'absolute z-50 mt-xs',
                  'w-full md:w-[360px]',
                  'bg-surface rounded-xl shadow-lvl2',
                  'border border-outline-variant',
                  'overflow-hidden',
                ].join(' ')}
              >
                {/* Search input */}
                <div className="p-md border-b border-outline-variant">
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-md top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px] pointer-events-none">
                      search
                    </span>
                    <input
                      type="search"
                      placeholder="Search roles..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className={[
                        'w-full pl-xl pr-md py-sm',
                        'min-h-[44px]',
                        'bg-surface-container-low rounded-lg',
                        'border border-outline-variant',
                        'text-body-sm text-on-surface',
                        'placeholder:text-on-surface-variant',
                        'focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent',
                      ].join(' ')}
                      autoFocus
                    />
                  </div>
                </div>

                {/* Role list */}
                <ul
                  role="listbox"
                  aria-label="Available roles"
                  className="max-h-[280px] overflow-y-auto"
                >
                  {filteredRoles.length === 0 && (
                    <li className="px-md py-lg text-center text-body-sm text-on-surface-variant">
                      No roles match your search.
                    </li>
                  )}
                  {filteredRoles.map((role) => (
                    <RoleOption
                      key={role.id}
                      role={role}
                      isAssigned={assignedIds.has(role.id)}
                      isGrantable={isGrantable(role, adminPermSet)}
                      isAdding={addingId === role.id}
                      onSelect={handleAddRole}
                    />
                  ))}
                </ul>

                {/* Footer */}
                <div className="px-md py-sm border-t border-outline-variant bg-surface-container-low">
                  <p className="text-label-md text-on-surface-variant">
                    {grantableRoles.length} role{grantableRoles.length !== 1 ? 's' : ''} available to grant
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </>
  )
}
