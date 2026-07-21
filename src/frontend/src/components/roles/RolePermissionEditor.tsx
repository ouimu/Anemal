/**
 * RolePermissionEditor — displays permission toggles grouped by module.
 *
 * AC-2: System roles → all toggles disabled + "Clone to edit" banner.
 * AC-4: Custom roles → track { add, remove } delta, reveal "Save changes".
 * AC-5: Permissions the current user doesn't hold → disabled toggle + tooltip.
 */
import { useState } from 'react'
import MaterialIcon from '../MaterialIcon'
import { type PermissionCatalogue } from '../../hooks/useRoles'
import { useT } from '../../i18n'

// ── Module icon mapping (best-effort; fallback to 'lock') ────────────────────
const MODULE_ICONS: Record<string, string> = {
  dashboard:        'dashboard',
  appointments:     'calendar_today',
  crm:              'pets',
  emr:              'medical_services',
  prescriptions:    'medication',
  inventory:        'inventory_2',
  billing:          'payments',
  inpatient:        'hotel',
  grooming:         'content_cut',
  bloodbank:        'water_drop',
  loyalty:          'card_giftcard',
  reports:          'bar_chart',
  clinic:           'business',
  staff:            'group',
  roles:            'admin_panel_settings',
  audit:            'fact_check',
}

// ── Module display labels ────────────────────────────────────────────────────
const MODULE_LABELS: Record<string, string> = {
  dashboard:     'Dashboard',
  appointments:  'Appointments',
  crm:           'Pets & Owners',
  emr:           'EMR / Clinical',
  prescriptions: 'Prescriptions',
  inventory:     'Inventory',
  billing:       'Billing',
  inpatient:     'Inpatient',
  grooming:      'Grooming',
  bloodbank:     'Blood Bank',
  loyalty:       'Loyalty',
  reports:       'Reports',
  clinic:        'Clinic Settings',
  staff:         'Staff & Users',
  roles:         'Roles',
  audit:         'Audit',
}

// ── Permission display labels ────────────────────────────────────────────────
function permLabel(code: string): string {
  const [, action] = code.split('.')
  const words = (action ?? code)
    .replace(/_/g, ' ')
    .split('.')
    .join(' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

interface PermDelta {
  add: string[]
  remove: string[]
}

interface Props {
  roleId: string
  isSystem: boolean
  currentPermissions: string[]
  catalogue: PermissionCatalogue
  /** The current user's own permissions (for AC-5 self-escalation guard) */
  userPermissions: string[]
  /** Called when user clicks "Clone to edit" inside the banner. Absent for
   *  the sealed clinic_admin role (D-4), which hides the banner entirely. */
  onClone?: () => void
  /** Called when user clicks "Save changes" with the computed delta */
  onSave: (delta: PermDelta) => void
  /** True while the save request is in flight */
  isSaving: boolean
}

/**
 * Module-grouped toggle grid shown inside an expanded role row.
 * Handles all local delta state; calls onSave with {add, remove}.
 */
export default function RolePermissionEditor({
  isSystem,
  currentPermissions,
  catalogue,
  userPermissions,
  onClone,
  onSave,
  isSaving,
}: Props) {
  const t = useT()
  // Local permission state (starts from currentPermissions)
  const [active, setActive] = useState<Set<string>>(() => new Set(currentPermissions))

  const original = new Set(currentPermissions)

  const toggle = (code: string) => {
    if (isSystem) return
    setActive((prev) => {
      const next = new Set(prev)
      if (next.has(code)) {
        next.delete(code)
      } else {
        next.add(code)
      }
      return next
    })
  }

  const delta: PermDelta = {
    add:    [...active].filter((p) => !original.has(p)),
    remove: [...original].filter((p) => !active.has(p)),
  }
  const hasDelta = delta.add.length > 0 || delta.remove.length > 0

  // Ordered module list (matches spec section 4)
  const moduleOrder = [
    'dashboard', 'appointments', 'crm', 'emr', 'prescriptions',
    'inventory', 'billing', 'inpatient', 'grooming', 'bloodbank',
    'loyalty', 'reports', 'clinic', 'staff', 'roles', 'audit',
  ]

  return (
    <div className="px-lg py-lg bg-surface-container-low space-y-lg border-b border-outline-variant">

      {/* System-role read-only banner (AC-2). The Clone trigger is hidden
          for the sealed clinic_admin role (D-4) — onClone is undefined. */}
      {isSystem && (
        <div className="flex items-center justify-between p-md bg-secondary-container rounded-lg">
          <div className="flex items-center gap-md">
            <MaterialIcon name="lock" size={20} className="text-secondary flex-shrink-0" />
            <span className="text-body-sm text-on-surface-container font-bold">
              System roles are read-only. Clone to create a customisable version.
            </span>
          </div>
          {onClone && (
            <button
              type="button"
              onClick={onClone}
              className="px-lg py-base bg-secondary text-on-primary font-bold rounded-lg
                         hover:opacity-90 transition-opacity min-h-[44px]
                         flex items-center gap-xs flex-shrink-0"
            >
              <MaterialIcon name="content_copy" size={16} />
              {t('roles.cloneToEdit')}
            </button>
          )}
        </div>
      )}

      {/* Permission modules */}
      <div className="space-y-lg">
        {moduleOrder.map((mod) => {
          const codes = catalogue[mod]
          if (!codes || codes.length === 0) return null

          const icon = MODULE_ICONS[mod] ?? 'lock'
          const label = MODULE_LABELS[mod] ?? mod

          return (
            <div key={mod} className="space-y-sm">
              <h4 className="text-headline-xs font-headline font-semibold text-primary
                             uppercase tracking-wider pb-xs border-b border-outline-variant
                             flex items-center gap-sm">
                <MaterialIcon name={icon} size={16} className="text-on-surface-variant" />
                {label}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-sm">
                {codes.map((code) => (
                  <PermToggle
                    key={code}
                    code={code}
                    isOn={active.has(code)}
                    isSystemRole={isSystem}
                    userHasPerm={userPermissions.includes(code)}
                    onChange={() => toggle(code)}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Save button — custom roles only (AC-4) */}
      {!isSystem && (
        <div className="flex justify-end pt-md border-t border-outline-variant">
          <button
            type="button"
            onClick={() => onSave(delta)}
            disabled={!hasDelta || isSaving}
            className="px-xl py-base bg-primary text-on-primary font-bold rounded-lg
                       shadow-sm hover:opacity-90 transition-opacity min-h-[44px]
                       flex items-center gap-xs
                       disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isSaving ? (
              <MaterialIcon name="progress_activity" size={16} className="animate-spin" />
            ) : (
              <MaterialIcon name="save" size={16} />
            )}
            {t('roles.savePermissions')}
          </button>
        </div>
      )}
    </div>
  )
}

// ── PermToggle sub-component ──────────────────────────────────────────────────

interface ToggleProps {
  code: string
  isOn: boolean
  isSystemRole: boolean
  userHasPerm: boolean
  onChange: () => void
}

/** Individual permission toggle with disabled states and AC-5 tooltip. */
function PermToggle({ code, isOn, isSystemRole, userHasPerm, onChange }: ToggleProps) {
  const t = useT()
  // Editable only when: not a system role AND current user holds the permission
  const isEditable = !isSystemRole && userHasPerm
  const isDisabled = isSystemRole || !userHasPerm

  return (
    <div
      className={`flex items-center justify-between p-md bg-surface rounded-lg
                  border border-outline-variant min-h-[44px]
                  ${isDisabled ? 'opacity-60' : ''}`}
    >
      <div className="flex items-center gap-md min-w-0">
        <div className="min-w-0">
          <p className="text-headline-xs font-headline font-semibold text-on-surface leading-tight truncate">
            {permLabel(code)}
          </p>
          <p className="text-label-md text-on-surface-variant font-code truncate">{code}</p>
        </div>
      </div>

      {/* Toggle with AC-5 tooltip wrapper */}
      <div className="relative group flex-shrink-0 ml-md">
        <label className="relative inline-flex items-center min-h-[44px] min-w-[44px] justify-end cursor-pointer">
          <input
            type="checkbox"
            checked={isOn}
            onChange={isEditable ? onChange : undefined}
            disabled={isDisabled}
            className="sr-only peer"
            aria-label={`${permLabel(code)} permission`}
          />
          <div
            className={`
              w-11 h-6 rounded-full relative transition-colors
              after:content-[''] after:absolute after:top-[2px] after:left-[2px]
              after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all
              peer-checked:after:translate-x-full
              ${isSystemRole
                ? 'bg-surface-variant peer-checked:bg-secondary cursor-not-allowed'
                : !userHasPerm
                  ? 'bg-surface-variant cursor-not-allowed'
                  : isOn
                    ? 'bg-secondary cursor-pointer'
                    : 'bg-surface-variant cursor-pointer'
              }
            `}
          />
        </label>

        {/* AC-5: Tooltip when user doesn't hold the permission */}
        {!isSystemRole && !userHasPerm && (
          <div
            className="absolute right-0 bottom-full mb-xs px-md py-xs bg-on-surface text-surface
                        text-label-md rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100
                        pointer-events-none transition-opacity z-50"
          >
            {t('roles.noPermission')}
          </div>
        )}
      </div>
    </div>
  )
}
