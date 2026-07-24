# T-5F-03 — Multi-Role Assignment UI Spec
> Owner: @uiux-agent · Date: 2026-06-17 · Phase 8 RBAC + Platform Console  
> Implements: T-5F-03 requirements from `t5f-requirements.md §T-5F-03`  
> Reference prototype: `stitch_vet_clinic_design_system/admin_control_center_1024x768/code.html`  
> Design system: `anemal-design-system` · RBAC: `anemal-rbac-matrix`

---

## 1. Scope

The Roles section is a **new section added inside the existing user/staff editor drawer or modal** — it is not a standalone page. The staff editor opens when a clinic admin clicks "Edit" on a staff row in the Admin > User Management tab.

This spec covers only the Roles section anatomy. The rest of the staff editor (name, email, branch, status fields) is unchanged.

**Permission gate:** the entire Roles section is visible only when `<Can perm="staff.assign_role">` is true. If the actor lacks this permission, the section is completely hidden (not disabled — hidden).

---

## 2. Viewport contract

| Breakpoint | Layout | Notes |
|---|---|---|
| 768 px (tablet portrait) | Full-width slide-in drawer, `w-full` | Section stack vertically; chip row wraps |
| 1024 px (tablet landscape) | Right-anchored drawer `w-[480px]` | Same section layout; wider chip row |

The drawer sits above a `bg-primary/30` backdrop overlay. It does not replace the admin panel — it slides in from the right.

---

## 3. Component anatomy

```
StaffEditorDrawer
├── DrawerHeader (sticky)
│   ├── Title ("Edit Staff Member")
│   └── CloseButton (X, ≥44×44px)
├── DrawerBody (scrollable)
│   ├── [existing fields: name, email, branch, status ...]
│   ├── Divider
│   └── RolesSection                        ← THIS SPEC
│       ├── SectionHeader
│       │   ├── Label ("Roles")
│       │   └── SectionHelpText
│       ├── CurrentRoleChips
│       │   ├── RoleChip × N (one per assigned role)
│       │   └── EmptyRolesState (when chips = 0 — should not happen, guarded by backend)
│       └── AddRolePicker
│           ├── PickerTriggerButton ("Add role +")
│           └── RoleDropdownPanel (conditionally shown)
│               ├── PickerSearchInput
│               ├── RoleOptionList
│               │   ├── RoleOption (grantable) × M
│               │   └── RoleOption (not grantable, disabled) × K
│               └── PickerFooter (role count summary)
├── DrawerFooter (sticky)
│   ├── CancelButton
│   └── SaveButton (saves other fields; role ops are immediate via API)
└── [overlays, conditionally]
    ├── LastRoleErrorBanner
    ├── SelfDemotionConfirmDialog
    └── RemoveConfirmDialog (for role chips)
```

---

## 4. RolesSection — full Tailwind spec

### 4.1 Section wrapper

```tsx
<section aria-labelledby="roles-section-label" className="pt-lg">
  <div className="flex items-center justify-between mb-md">
    <div>
      <h3
        id="roles-section-label"
        className="font-headline-xs text-headline-xs text-on-surface"
      >
        Roles
      </h3>
      <p className="font-body-sm text-body-sm text-on-surface-variant mt-xs">
        Effective permissions are the union of all assigned roles.
      </p>
    </div>
  </div>
```

### 4.2 CurrentRoleChips container

```tsx
  <div
    className="flex flex-wrap gap-sm min-h-[44px] items-start"
    aria-label="Assigned roles"
  >
    {assignedRoles.map((role) => (
      <RoleChip key={role.id} role={role} onRemove={handleRemoveRole} />
    ))}
    {assignedRoles.length === 0 && (
      <EmptyRolesState />
    )}
  </div>
```

### 4.3 RoleChip component

Each chip represents one assigned role. The remove (X) button is the interactive target; the chip label is not separately interactive.

**Touch target:** the X button is `min-h-[44px] min-w-[44px]` with padding to expand the hit area while the chip visually appears smaller.

```tsx
// RoleChip.tsx
interface RoleChipProps {
  role: { id: number; name: string; isSystem: boolean }
  onRemove: (roleId: number) => void
  isRemoving?: boolean   // spinner state while DELETE in-flight
  disabled?: boolean     // true when can('staff.assign_role') = false (section is hidden anyway)
}

function RoleChip({ role, onRemove, isRemoving }: RoleChipProps) {
  return (
    <div
      className={[
        'flex items-center gap-xs',
        'bg-secondary-container text-on-secondary-container',
        'rounded-full pl-md pr-xs py-xs',
        'border border-outline-variant',
        'font-label-md text-label-md font-bold',
        'min-h-[36px]',           // chip visual height
      ].join(' ')}
      role="listitem"
    >
      {/* System badge icon */}
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

      {/* Remove button — 44×44 touch target via padding */}
      <button
        type="button"
        onClick={() => onRemove(role.id)}
        disabled={isRemoving}
        aria-label={`Remove role ${role.name}`}
        className={[
          'flex items-center justify-center',
          'min-h-[44px] min-w-[44px]',   // touch target
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
          <span className="material-symbols-outlined text-[18px]">
            close
          </span>
        )}
      </button>
    </div>
  )
}
```

**States:**

| State | Visual change |
|---|---|
| Default | `bg-secondary-container`, `text-on-secondary-container`, `border-outline-variant` |
| Removing (in-flight) | X replaced by `progress_activity` spinner, chip opacity 70% |
| System role | `verified` icon prefix |
| Error (last-role block) | chip unchanged; error banner appears below chip row (see §7.1) |

### 4.4 EmptyRolesState

Shown only if all roles have been removed (defensive; backend blocks last-role removal but the UI must handle the transient state):

```tsx
function EmptyRolesState() {
  return (
    <div className="flex items-center gap-sm px-md py-sm bg-error-container rounded-lg w-full">
      <span className="material-symbols-outlined text-on-error-container text-[20px]">
        warning
      </span>
      <p className="font-body-sm text-body-sm text-on-error-container">
        This user has no roles. Assign at least one role.
      </p>
    </div>
  )
}
```

### 4.5 AddRolePicker — trigger button

Placed below the chip row, full-width on 768 px, auto-width on 1024 px:

```tsx
<button
  type="button"
  onClick={() => setPickerOpen(true)}
  aria-expanded={pickerOpen}
  aria-controls="role-picker-panel"
  className={[
    'flex items-center gap-xs',
    'min-h-[44px] px-md',
    'border border-dashed border-outline',
    'rounded-lg',
    'text-on-surface-variant font-body-sm',
    'hover:bg-surface-container hover:border-primary hover:text-primary',
    'transition-colors mt-sm',
  ].join(' ')}
>
  <span className="material-symbols-outlined text-[20px]">add</span>
  Add role
</button>
```

### 4.6 RoleDropdownPanel — popover

The panel opens below the trigger on 1024 px and as a bottom sheet on 768 px.

```tsx
<div
  id="role-picker-panel"
  role="dialog"
  aria-label="Add role picker"
  className={[
    'absolute z-50 mt-xs',
    'w-full',                           // 768 px: full drawer width
    'md:w-[360px]',                     // 1024 px: fixed width
    'bg-surface rounded-xl shadow-lvl2',
    'border border-outline-variant',
    'overflow-hidden',
  ].join(' ')}
>
  {/* Search input */}
  <div className="p-md border-b border-outline-variant">
    <div className="relative">
      <span className="material-symbols-outlined absolute left-md top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">
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
          'font-body-sm text-body-sm text-on-surface',
          'placeholder:text-on-surface-variant',
          'focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent',
        ].join(' ')}
        autoFocus
      />
    </div>
  </div>

  {/* Role option list */}
  <ul
    role="listbox"
    aria-label="Available roles"
    className="max-h-[280px] overflow-y-auto"
  >
    {filteredRoles.map((role) => (
      <RoleOption
        key={role.id}
        role={role}
        isAssigned={assignedRoles.some((r) => r.id === role.id)}
        isGrantable={isGrantable(role, adminPermissions)}
        onSelect={handleAddRole}
      />
    ))}
    {filteredRoles.length === 0 && (
      <li className="px-md py-lg text-center font-body-sm text-on-surface-variant">
        No roles match your search.
      </li>
    )}
  </ul>

  {/* Footer */}
  <div className="px-md py-sm border-t border-outline-variant bg-surface-container-low">
    <p className="font-label-md text-label-md text-on-surface-variant">
      {grantableRoles.length} role{grantableRoles.length !== 1 ? 's' : ''} available to grant
    </p>
  </div>
</div>
```

### 4.7 RoleOption component

```tsx
interface RoleOptionProps {
  role: Role
  isAssigned: boolean
  isGrantable: boolean
  onSelect: (roleId: number) => void
}

function RoleOption({ role, isAssigned, isGrantable, onSelect }: RoleOptionProps) {
  const disabled = isAssigned || !isGrantable

  return (
    <li
      role="option"
      aria-selected={isAssigned}
      aria-disabled={disabled}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && onSelect(role.id)}
        className={[
          'w-full flex items-center gap-md',
          'px-md min-h-[52px]',           // ≥44 px touch target, extra space for label+desc
          'text-left',
          isAssigned
            ? 'bg-surface-container-low text-on-surface-variant cursor-default'
            : isGrantable
              ? 'hover:bg-surface-container text-on-surface cursor-pointer'
              : 'opacity-40 cursor-not-allowed text-on-surface-variant',
          'transition-colors',
        ].join(' ')}
      >
        {/* Leading icon: checkmark if assigned, lock if not grantable */}
        <span
          className={[
            'material-symbols-outlined text-[20px] shrink-0',
            isAssigned ? 'text-secondary' : 'text-outline',
          ].join(' ')}
        >
          {isAssigned ? 'check_circle' : isGrantable ? 'radio_button_unchecked' : 'lock'}
        </span>

        <div className="flex-1 min-w-0">
          <p className="font-body-sm text-body-sm font-bold truncate">{role.name}</p>
          {role.isSystem && (
            <p className="font-label-md text-label-md text-on-surface-variant">
              System role
            </p>
          )}
          {!isGrantable && (
            <p className="font-label-md text-label-md text-on-surface-variant">
              Requires permissions you do not hold
            </p>
          )}
        </div>

        {/* Trailing spinner when add is in-flight for this role */}
        {isAddingRoleId === role.id && (
          <span className="material-symbols-outlined text-[20px] text-secondary animate-spin shrink-0">
            progress_activity
          </span>
        )}
      </button>
    </li>
  )
}
```

**RoleOption states:**

| State | Icon | Row bg | Text |
|---|---|---|---|
| Grantable, not assigned | `radio_button_unchecked` (outline) | hover: `bg-surface-container` | `text-on-surface` |
| Already assigned | `check_circle` (secondary) | `bg-surface-container-low` | `text-on-surface-variant`, disabled |
| Not grantable (insufficient admin perms) | `lock` (outline, opacity 40%) | disabled | "Requires permissions you do not hold" |
| Add in-flight | same as grantable + spinner | — | — |

---

## 5. Grantability logic (client-side filter)

Per the RBAC matrix CR-01 and T-5F-03 AC-R2, grantability is computed client-side. The server enforces the same rule on write and will 403 if violated.

```ts
// utils/rbac.ts
/**
 * Returns true if every permission in targetRole.permissions
 * is also present in adminPermissions (the acting admin's effective set).
 * An empty targetRole.permissions set is always grantable.
 */
function isGrantable(targetRole: Role, adminPermissions: Set<string>): boolean {
  return targetRole.permissions.every((code) => adminPermissions.has(code))
}
```

The `adminPermissions` set comes from `usePermissions()` (authStore). The role list comes from `GET /clinic/roles`, fetched when the drawer opens (React Query with `staleTime: 60_000`).

Roles that are already assigned are shown as selected/disabled in the picker — they are NOT hidden. The `isAssigned` state is computed by comparing `role.id` against the current `assignedRoles` list.

---

## 6. Interaction flows

### 6.1 Adding a role

```
Actor opens drawer for staff member
  → GET /clinic/roles (fetched, cached 60s)
  → RolesSection renders chips for current roles
  → Actor taps "Add role"
  → RoleDropdownPanel opens
  → Actor selects a grantable, unassigned role
  → POST /clinic/roles/users/:userId/roles { roleId }
  → [optimistic] Add chip immediately with "adding" state
  → On 201: chip confirmed, picker closes (or stays open if multi-add)
  → On 403: remove optimistic chip, show toast "You cannot grant this role"
  → React Query invalidates staff list + role list
  → If acting admin is the edited user: call authStore.refreshPermissions()
```

### 6.2 Removing a role (happy path)

```
Actor taps X on a RoleChip
  → If this is the user's only role → show LastRoleErrorBanner (skip DELETE call)
  → Else if the role being removed is a clinic_admin role AND the actor is editing themselves
      → show SelfDemotionConfirmDialog
         → Actor cancels → no change
         → Actor confirms → proceed to DELETE
  → DELETE /clinic/roles/users/:userId/roles/:roleId
  → [optimistic] Replace X with spinner on chip
  → On 200: remove chip, React Query invalidates
  → On 409 (last-role, server-side): show LastRoleErrorBanner, restore chip
  → If acting admin is the edited user: call authStore.refreshPermissions()
```

### 6.3 Last-role guard

The client checks `assignedRoles.length === 1` before calling DELETE. If true, it does not fire the API call at all — it renders the error banner inline.

If the server returns 409 regardless (race condition), the UI must also handle it.

### 6.4 Self-demotion (D-6a)

Trigger: actor is editing their own record AND the chip being removed is a role that includes `clinic.profile.edit`, `staff.manage`, or `roles.manage` in its permission set (i.e., any role granting admin-level access).

Simpler heuristic for UI: if the role name is `clinic_admin` or the role's permissions include `staff.assign_role`, treat it as a self-demotion.

---

## 7. Overlay components

### 7.1 LastRoleErrorBanner

Appears inline below the chip row. Not a modal — stays visible until the actor adds another role or dismisses.

```tsx
<div
  role="alert"
  className={[
    'flex items-start gap-sm',
    'mt-sm px-md py-sm',
    'bg-error-container rounded-lg',
    'border border-error border-opacity-30',
  ].join(' ')}
>
  <span className="material-symbols-outlined text-on-error-container text-[20px] shrink-0 mt-[2px]">
    error
  </span>
  <div>
    <p className="font-body-sm text-body-sm text-on-error-container font-bold">
      Cannot remove last role
    </p>
    <p className="font-body-sm text-body-sm text-on-error-container">
      A user must keep at least one role. Assign another role before removing this one.
    </p>
  </div>
  <button
    type="button"
    onClick={dismissError}
    aria-label="Dismiss"
    className="ml-auto min-h-[44px] min-w-[44px] flex items-center justify-center text-on-error-container hover:opacity-70 transition-opacity"
  >
    <span className="material-symbols-outlined text-[20px]">close</span>
  </button>
</div>
```

### 7.2 SelfDemotionConfirmDialog

A modal dialog, centered, with backdrop. Rendered via React portal.

```tsx
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
  <div
    className={[
      'bg-surface rounded-xl shadow-lvl3',
      'w-full max-w-[400px]',
      'p-lg space-y-md',
    ].join(' ')}
  >
    {/* Icon */}
    <div className="flex justify-center">
      <div className="w-12 h-12 rounded-full bg-error-container flex items-center justify-center">
        <span className="material-symbols-outlined text-on-error-container text-[24px]">
          admin_panel_settings
        </span>
      </div>
    </div>

    {/* Title */}
    <h2
      id="self-demote-title"
      className="font-headline-xs text-headline-xs text-on-surface text-center"
    >
      Remove your own admin role?
    </h2>

    {/* Body */}
    <p className="font-body-sm text-body-sm text-on-surface-variant text-center">
      You may lose access to this screen and other admin functions after this change.
      Your remaining roles will still be active.
    </p>

    {/* Actions */}
    <div className="flex gap-md pt-sm">
      <button
        type="button"
        onClick={cancelSelfDemotion}
        className={[
          'flex-1 min-h-[44px]',
          'border border-outline-variant rounded-lg',
          'font-body-sm text-body-sm font-bold text-on-surface',
          'hover:bg-surface-container transition-colors',
        ].join(' ')}
      >
        Keep role
      </button>
      <button
        type="button"
        onClick={confirmSelfDemotion}
        className={[
          'flex-1 min-h-[44px]',
          'bg-error text-on-primary rounded-lg',
          'font-body-sm text-body-sm font-bold',
          'hover:opacity-90 transition-opacity',
        ].join(' ')}
      >
        Remove anyway
      </button>
    </div>
  </div>
</div>
```

---

## 8. State model (React / Zustand hook)

```ts
// hooks/useRoleAssignment.ts
interface UseRoleAssignmentReturn {
  assignedRoles:    Role[]
  pickerOpen:       boolean
  searchQuery:      string
  isAddingRoleId:   number | null
  removingRoleIds:  Set<number>
  errorBanner:      'last-role' | 'forbidden' | null
  confirmSelfDemote: { roleId: number } | null  // non-null = dialog open

  openPicker:       () => void
  closePicker:      () => void
  setSearchQuery:   (q: string) => void
  addRole:          (roleId: number) => Promise<void>
  removeRole:       (roleId: number) => Promise<void>
  confirmAndRemove: () => Promise<void>   // called after self-demotion confirm
  dismissError:     () => void
}
```

All role mutations (`addRole`, `removeRole`) are **immediate API calls** — they do not wait for the parent form's Save button. This matches AC-R1 ("selecting adds ... deselecting removes"). The parent Save button only saves the non-role fields (name, email, branch, status).

---

## 9. API calls summary

| Action | Method + path | Body | Success | Error handling |
|---|---|---|---|---|
| Fetch role catalogue for picker | `GET /clinic/roles` | — | `200 Role[]` | Show picker load error state |
| Assign a role | `POST /clinic/roles/users/:userId/roles` | `{ roleId: number }` | `201` | `403` → "Cannot grant this role"; `409` → unexpected, show generic error |
| Remove a role | `DELETE /clinic/roles/users/:userId/roles/:roleId` | — | `200` | `409` → LastRoleErrorBanner; `404` → already removed, dismiss gracefully |

All calls use the clinic-plane JWT. All go through the existing `apiClient` (withCredentials, base URL from env). React Query key: `['clinic-roles']` for the catalogue, `['staff', userId, 'roles']` for assigned roles.

---

## 10. Empty and edge-case states

| Scenario | UI response |
|---|---|
| Staff member has 0 grantable roles (admin has narrower perms than all available roles) | Picker shows all roles as disabled (lock icon); footer says "0 roles available to grant" |
| All roles are already assigned | Picker shows all as selected; "Add role" button is hidden (user has every role) |
| Role deleted elsewhere mid-session (404 on remove) | Silent success — chip disappears; toast "Role already removed" |
| Network error on add/remove | Revert optimistic update; toast "Network error. Please try again." |
| Actor has `staff.assign_role` but not `roles.view` (D-5a split not yet deployed) | Picker fails to load; show inline error "Cannot load roles. Contact your admin." |

---

## 11. Acceptance criteria checklist

| AC | Requirement | Design element |
|---|---|---|
| AC-R1 | Current roles as chips; picker adds/removes | RoleChip + RoleDropdownPanel → immediate POST/DELETE |
| AC-R2 | Picker shows only grantable roles (subset of admin perms) | `isGrantable()` client-side filter; disabled with `lock` icon + tooltip |
| AC-R3 | Last-role removal → error, not DELETE call | Client-side guard + `LastRoleErrorBanner`; also handles server 409 |
| AC-R4 | After assign/remove → server re-resolves; if self → `refreshPermissions()` | Post-mutation hook checks `userId === authStore.userId` |
| AC-R5 | Gate entire section on `staff.assign_role` | `<Can perm="staff.assign_role">` wraps `RolesSection` |
| AC-R6 | Chips ≥44px targets; tokens; Material Symbols | X button `min-h-[44px] min-w-[44px]`; all token classes; icons from Material Symbols Outlined |

---

## 12. Token compliance checklist

- [x] `bg-secondary-container` / `text-on-secondary-container` — chip background
- [x] `bg-surface-container-low` — picker search bg, assigned row bg
- [x] `bg-surface-container` — hover state for picker rows
- [x] `bg-error-container` / `text-on-error-container` — error banner
- [x] `bg-error` / `text-on-primary` — self-demotion confirm destructive button
- [x] `text-secondary` — checkmark icon on assigned role
- [x] `text-on-surface-variant` — secondary labels
- [x] `border-outline-variant` — chip border, panel border
- [x] `border-outline` — dashed add-role trigger button border
- [x] `shadow-lvl2` — picker panel drop shadow
- [x] `shadow-lvl3` — dialog shadow
- [x] No raw hex values anywhere
- [x] All interactive targets `min-h-[44px] min-w-[44px]`
- [x] All icons: Material Symbols Outlined (`close`, `add`, `check_circle`, `lock`, `radio_button_unchecked`, `verified`, `error`, `warning`, `admin_panel_settings`, `progress_activity`, `search`)
- [x] No emoji in any UI element

---

## 13. Responsive notes

**768 px (portrait tablet):**
- Drawer is `w-full`, slides in from bottom or right (follow existing drawer pattern)
- Chip row wraps; chips stack left-aligned
- Picker panel is full-width of drawer
- SelfDemotionConfirmDialog: `max-w-[400px]`, centered, padded from edges

**1024 px (landscape tablet):**
- Drawer is `w-[480px]`, fixed right
- Chip row has more horizontal space; chips remain `flex-wrap`
- Picker panel is `w-[360px]`, positioned below trigger

---

## 14. Dev handoff notes for @dev-agent

1. The `RolesSection` component receives `staffUserId` as a prop (the user being edited).
2. Role mutations fire immediately on user action — they do NOT wait for the parent form Save.
3. The parent form `onSubmit` should NOT include role fields in its payload.
4. Import `usePermissions` from `store/authStore` (already exists) to get `adminPermissions` for `isGrantable()`.
5. The `refreshPermissions()` call (`authStore.ts:40,119`) must be triggered after a successful add/remove **only when** `staffUserId === authStore.userId` (editing your own record).
6. React Query cache invalidation after role mutations: `queryClient.invalidateQueries(['staff'])` + `queryClient.invalidateQueries(['clinic-roles'])`.
7. Gate the entire `RolesSection` with `<Can perm="staff.assign_role">` — render null when not permitted.
8. `GET /clinic/roles` requires `roles.view` (after D-5a backend split). If the call returns 403, show the inline error state from §10 rather than crashing the drawer.
