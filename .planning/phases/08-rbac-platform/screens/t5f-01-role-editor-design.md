# T-5F-01 — Clinic Role Editor Screen Spec
**Route:** `/clinic-admin/roles`  
**Permission guard:** `requirePlane('clinic')` + `requirePermission('roles.manage')`  
**Agent:** @uiux-agent  
**Breakpoints validated:** 768 px (portrait tablet) + 1024 px (landscape tablet)  
**Design system:** Compassionate Care System (CCS)

---

## 1. Screen Layout

### Shell (shared across all clinic screens)

```
┌──────────────────────────────────────────────────────────┐
│  TopNav  (fixed h-16 bg-surface shadow-sm z-40)          │
├─────────┬────────────────────────────────────────────────┤
│         │                                                │
│Sidebar  │  Content area                                  │
│w-64     │  pt-16 pl-64 (left-hand)                      │
│(fixed)  │  or pt-16 pr-64 (right-hand)                  │
│         │                                                │
└─────────┴────────────────────────────────────────────────┘
```

**Sidebar** (`fixed top-0 bottom-0 left-0 z-40 w-64 bg-surface shadow-sm flex flex-col py-lg`):
- Active item: `flex items-center gap-md px-md py-base rounded-lg text-primary font-bold border-r-4 border-primary bg-surface-container-low`
- Inactive item: `flex items-center gap-md px-md py-base rounded-lg text-on-surface-variant hover:bg-surface-container transition-colors`
- Active nav icon: `admin_panel_settings` (Material Symbols, FILL=1 on active)
- At 768 px: sidebar hidden, hamburger in TopNav opens as overlay drawer (`fixed inset-0 z-30 bg-black/40`)

**TopNav** (`fixed top-0 right-0 left-64 h-16 bg-surface shadow-sm flex justify-between items-center px-margin-desktop z-40`):
- Left: search input (at 768 px: left-0 since sidebar is an overlay)
- Right: notification bell, help icon (both `min-h-[44px] min-w-[44px]`)
- At 768 px: `left-0` (full-width since sidebar is hidden)

**Content area** (`ml-64 min-h-screen bg-background`):
- Inner: `pt-16 p-margin-desktop space-y-xl`
- At 768 px: `ml-0` (sidebar is overlay, not in-flow)

---

## 2. Content Area — Role Editor

### 2a. Page Header

```
Roles & Permissions                         [+ Create Role]
Manage access levels for your clinic staff
```

**Classes:**
```
<div class="flex justify-between items-end">
  <div>
    <h2 class="font-headline-lg text-headline-lg text-primary">Roles &amp; Permissions</h2>
    <p class="font-body-md text-on-surface-variant">Manage access levels for your clinic staff.</p>
  </div>
  <button class="px-lg py-base bg-primary text-on-primary font-bold rounded-lg shadow-sm
                 hover:opacity-90 transition-opacity flex items-center gap-xs
                 min-h-[44px] min-w-[44px]">
    <span class="material-symbols-outlined text-[20px]">add</span>
    Create Role
  </button>
</div>
```

"Create Role" button: visible only when user holds `roles.manage`. Hidden via `<Can perm="roles.manage">`.

---

### 2b. Role List Panel

Full-width card (`bg-surface rounded-xl shadow-sm border border-outline-variant overflow-hidden`).

Each row is a **role accordion item** — collapsed by default, expands to show permissions.

#### Role Row (collapsed)

```
┌──────────────────────────────────────────────────────────┐
│ [expand chevron]  Role Name   [SYSTEM badge]   3 users   │
│                               [Assign staff] [Clone][Del]│
└──────────────────────────────────────────────────────────┘
```

**Row classes:**
```
<div class="flex items-center justify-between px-lg py-md min-h-[48px]
            border-b border-outline-variant hover:bg-surface-container-low
            transition-colors cursor-pointer">
```

**Left group:**
```
<div class="flex items-center gap-md">
  <!-- expand chevron -->
  <span class="material-symbols-outlined text-on-surface-variant transition-transform duration-200
               [data-expanded=true]:rotate-180">
    expand_more
  </span>
  <!-- role name -->
  <span class="font-headline-xs text-on-surface">Clinic Admin</span>
  <!-- system badge (is_system=true) -->
  <span class="px-md py-xs bg-surface-container-high rounded-full
               text-label-md text-on-surface-variant font-bold">
    SYSTEM
  </span>
</div>
```

**Right group:**
```
<div class="flex items-center gap-md">
  <!-- assigned user count chip -->
  <span class="flex items-center gap-xs text-label-md text-on-surface-variant">
    <span class="material-symbols-outlined text-[16px]">group</span>
    3 staff
  </span>
  <!-- Assign to staff (AC-9 entry point) -->
  <button class="px-md py-xs border border-outline-variant rounded-lg
                 text-label-md text-on-surface hover:bg-surface-container
                 transition-colors min-h-[44px] min-w-[44px]
                 flex items-center gap-xs">
    <span class="material-symbols-outlined text-[16px]">person_add</span>
    Assign staff
  </button>
  <!-- Clone (shown for system roles) -->
  <button class="px-md py-xs border border-outline-variant rounded-lg
                 text-label-md text-secondary hover:bg-surface-container
                 transition-colors min-h-[44px] min-w-[44px]
                 flex items-center gap-xs">
    <span class="material-symbols-outlined text-[16px]">content_copy</span>
    Clone
  </button>
  <!-- Delete (shown for custom roles only) -->
  <button class="px-md py-xs border border-error rounded-lg
                 text-label-md text-error hover:bg-error-container
                 transition-colors min-h-[44px] min-w-[44px]
                 flex items-center gap-xs">
    <span class="material-symbols-outlined text-[16px]">delete</span>
    Delete
  </button>
</div>
```

**Badge logic:**
- `is_system = true`: show `SYSTEM` badge (bg-surface-container-high); show Clone, hide Delete
- `is_system = false`: no badge; show Delete, hide Clone (clone CTA only on system roles)
- `assignedUserCount > 0`: show count chip with `group` icon

---

#### Role Row (expanded — permissions panel)

Expands below the row header with `animate-accordion-down` (height 0 → auto, 200 ms ease).

```
<div class="px-lg py-lg bg-surface-container-low space-y-lg border-b border-outline-variant">

  <!-- System role banner (AC-2) -->
  [if is_system]
  <div class="flex items-center justify-between p-md bg-secondary-container rounded-lg">
    <div class="flex items-center gap-md">
      <span class="material-symbols-outlined text-secondary">lock</span>
      <span class="text-body-sm text-on-secondary-container font-bold">
        System roles are read-only. Clone to create a customisable version.
      </span>
    </div>
    <button class="px-lg py-base bg-secondary text-on-primary font-bold rounded-lg
                   hover:opacity-90 transition-opacity min-h-[44px]
                   flex items-center gap-xs">
      <span class="material-symbols-outlined text-[16px]">content_copy</span>
      Clone to edit
    </button>
  </div>

  <!-- Permission modules (one section per module) -->
  <div class="space-y-md">
    <h4 class="font-headline-xs text-headline-xs text-primary">Appointments</h4>
    <div class="grid grid-cols-2 gap-md">
      [PermissionToggle] appointments.view
      [PermissionToggle] appointments.create
      [PermissionToggle] appointments.edit
      [PermissionToggle] appointments.delete
    </div>
  </div>
  ... (one section per module)

  <!-- Save button — custom roles only -->
  [if !is_system]
  <div class="flex justify-end pt-md border-t border-outline-variant">
    <button class="px-xl py-base bg-primary text-on-primary font-bold rounded-lg
                   shadow-sm hover:opacity-90 transition-opacity min-h-[44px]
                   flex items-center gap-xs">
      <span class="material-symbols-outlined text-[16px]">save</span>
      Save changes
    </button>
  </div>
</div>
```

---

## 3. PermissionToggle Component

Used inside the expanded role panel for each permission code.

### Anatomy

```
┌──────────────────────────────────────────────────────────┐
│  [icon]  appointments.create   Create appointments  [○●] │
└──────────────────────────────────────────────────────────┘
```

**Classes (enabled, editable):**
```
<div class="flex items-center justify-between p-md bg-surface rounded-lg
            border border-outline-variant min-h-[44px]">
  <div class="flex items-center gap-md">
    <span class="material-symbols-outlined text-[18px] text-on-surface-variant">
      calendar_today
    </span>
    <div>
      <p class="font-headline-xs text-on-surface">Create appointments</p>
      <p class="text-label-md text-on-surface-variant font-code">appointments.create</p>
    </div>
  </div>
  <label class="relative inline-flex items-center cursor-pointer min-h-[44px] min-w-[44px]
                items-center justify-end">
    <input type="checkbox" class="sr-only peer" checked />
    <div class="w-11 h-6 bg-surface-variant peer-focus:outline-none rounded-full peer
                peer-checked:after:translate-x-full peer-checked:after:border-white
                after:content-[''] after:absolute after:top-[2px] after:left-[2px]
                after:bg-white after:border-gray-300 after:border after:rounded-full
                after:h-5 after:w-5 after:transition-all peer-checked:bg-secondary">
    </div>
  </label>
</div>
```

**States:**

| State | Visual change |
|-------|--------------|
| ON (custom, editable) | `peer-checked:bg-secondary` thumb right |
| OFF (custom, editable) | `bg-surface-variant` thumb left |
| ON (system role) | `peer-checked:bg-outline-variant opacity-60 cursor-not-allowed` |
| OFF (system role) | `bg-surface-variant opacity-60 cursor-not-allowed` |
| DISABLED — user lacks perm (AC-5) | `opacity-50 cursor-not-allowed` + tooltip |
| Loading (save in flight) | Spinner overlay on the toggle row |

**System-role toggle (read-only):**
```
<input type="checkbox" class="sr-only peer" disabled />
<div class="w-11 h-6 bg-surface-variant opacity-60 rounded-full peer
            peer-checked:bg-outline-variant cursor-not-allowed ...">
```

**AC-5 — user lacks the permission (disabled with tooltip):**
```
<div class="relative group">
  <input type="checkbox" class="sr-only peer" disabled />
  <div class="w-11 h-6 bg-surface-variant opacity-50 rounded-full ... cursor-not-allowed">
  </div>
  <!-- Tooltip -->
  <div class="absolute right-0 bottom-full mb-xs px-md py-xs bg-on-surface text-surface
              text-label-md rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100
              pointer-events-none transition-opacity z-50">
    You don't have this permission
  </div>
</div>
```

---

## 4. Permission Modules — Grouping

Permissions are displayed grouped by module in this order (mirrors the permission catalogue):

| Module header | Permission codes shown |
|---|---|
| Dashboard | `dashboard.view` |
| Appointments | `appointments.view` `appointments.create` `appointments.edit` `appointments.delete` |
| Pets & Owners | `crm.view` `crm.create` `crm.edit` `crm.delete` |
| EMR / Clinical | `emr.view` `emr.create` `emr.edit` `emr.attach` |
| Prescriptions | `prescriptions.view` `prescriptions.create` `prescriptions.dispense` |
| Inventory | `inventory.view` `inventory.create` `inventory.edit` `inventory.adjust` |
| Billing | `billing.view` `billing.create` `billing.payment` `billing.void` |
| Inpatient | `inpatient.view` `inpatient.manage` |
| Grooming | `grooming.view` `grooming.manage` |
| Blood Bank | `bloodbank.view` `bloodbank.manage` |
| Loyalty | `loyalty.view` `loyalty.manage` |
| Reports | `reports.revenue.view` `reports.inventory.view` `reports.cost.view` `reports.export` |
| Clinic Settings | `clinic.profile.view` `clinic.profile.edit` `clinic.branch.view` `clinic.branch.manage` `clinic.hours.edit` `clinic.payment.edit` `clinic.integrations.edit` |
| Staff & Users | `staff.view` `staff.manage` `staff.assign_role` |
| Roles | `roles.view` `roles.manage` |
| Audit | `audit.view` |

Each module section:
```
<div class="space-y-sm">
  <h4 class="font-headline-xs text-headline-xs text-primary uppercase tracking-wider pb-xs
             border-b border-outline-variant">Appointments</h4>
  <div class="grid grid-cols-2 gap-sm">
    <!-- PermissionToggle × N -->
  </div>
</div>
```

At 768 px: `grid-cols-1` (single column, full width toggles).  
At 1024 px: `grid-cols-2` (two-column toggle grid).

---

## 5. Modals & Overlays

### 5a. Clone Role — Name Prompt (AC-3)

Triggered by clicking "Clone" or "Clone to edit" CTA.  
Modal: `fixed inset-0 z-50 flex items-center justify-center bg-black/40`

```
<div class="bg-surface rounded-xl shadow-lvl3 p-xl w-[480px] max-w-[calc(100vw-32px)] space-y-lg">
  <div class="flex items-center justify-between">
    <h3 class="font-headline-sm text-headline-sm text-primary">Clone Role</h3>
    <button class="min-h-[44px] min-w-[44px] flex items-center justify-center
                   hover:bg-surface-container rounded-full">
      <span class="material-symbols-outlined text-on-surface-variant">close</span>
    </button>
  </div>
  <p class="text-body-sm text-on-surface-variant">
    Creates a new editable role with the same permissions as <strong>[source role name]</strong>.
  </p>
  <div class="space-y-xs">
    <label class="font-label-md text-primary font-bold">New role name</label>
    <input type="text" placeholder="e.g. Senior Doctor"
           class="w-full px-md py-base border border-outline-variant rounded-lg
                  focus:ring-2 focus:ring-primary focus:border-transparent
                  min-h-[44px] font-body-md text-body-md" />
    <p class="text-label-md text-on-surface-variant">Must be unique within your clinic.</p>
  </div>
  <div class="flex gap-md justify-end">
    <button class="px-lg py-base border border-outline-variant rounded-lg text-on-surface
                   font-bold hover:bg-surface-container min-h-[44px]">Cancel</button>
    <button class="px-lg py-base bg-primary text-on-primary font-bold rounded-lg
                   hover:opacity-90 min-h-[44px] flex items-center gap-xs">
      <span class="material-symbols-outlined text-[16px]">content_copy</span>
      Clone role
    </button>
  </div>
</div>
```

**After clone:** `POST /clinic/roles/clone` → new role appended to list, list scrolls to it, row highlighted with `ring-2 ring-secondary` for 2 s then fades.

---

### 5b. Delete Role — Confirmation Dialog (AC-6 / AC-7)

**Path A — 0 assigned users (AC-7):**
```
<div class="bg-surface rounded-xl shadow-lvl3 p-xl w-[400px] max-w-[calc(100vw-32px)] space-y-lg">
  <h3 class="font-headline-sm text-headline-sm text-error">Delete Role</h3>
  <p class="text-body-sm text-on-surface-variant">
    Are you sure you want to delete <strong>[role name]</strong>?
    This action cannot be undone.
  </p>
  <div class="flex gap-md justify-end">
    <button ...>Cancel</button>
    <button class="px-lg py-base bg-error text-on-primary font-bold rounded-lg
                   hover:opacity-90 min-h-[44px]">Delete</button>
  </div>
</div>
```

**Path B — ≥1 assigned user (AC-6) — 409 response:**
```
<div class="bg-surface rounded-xl shadow-lvl3 p-xl w-[440px] ... space-y-lg">
  <div class="flex items-center gap-md">
    <span class="material-symbols-outlined text-error text-[28px]">warning</span>
    <h3 class="font-headline-sm text-headline-sm text-error">Cannot Delete Role</h3>
  </div>
  <div class="p-md bg-error-container rounded-lg flex items-center gap-md">
    <span class="material-symbols-outlined text-on-error-container">info</span>
    <p class="text-body-sm text-on-error-container font-bold">
      Reassign 3 staff before deleting this role.
    </p>
  </div>
  <p class="text-body-sm text-on-surface-variant">
    The following staff are assigned to this role and must be moved first:
  </p>
  <!-- Staff list (from 409 response body) -->
  <ul class="space-y-xs">
    <li class="flex items-center gap-md p-sm bg-surface-container-low rounded-lg">
      <div class="w-8 h-8 rounded-full bg-secondary-container flex items-center
                  justify-center text-secondary font-bold text-label-md">JM</div>
      <span class="text-body-sm text-on-surface">Dr. James Miller</span>
    </li>
  </ul>
  <div class="flex justify-end">
    <button class="px-lg py-base border border-outline-variant rounded-lg text-on-surface
                   font-bold hover:bg-surface-container min-h-[44px]">Close</button>
  </div>
</div>
```

---

## 6. Interaction States

### 6a. Expand / Collapse (AC-2)

- Click anywhere on the role row header → toggles expanded state
- Chevron rotates 180° (`transition-transform duration-200`)
- Panel height animates open/closed (`transition-all duration-200 ease-in-out`)
- Only one role expanded at a time on 768 px (accordion); multiple allowed on 1024 px
- State tracked in local component state (`expandedRoleId`)

### 6b. Permission Toggle (AC-4)

- Toggle fires `onChange` callback; change is accumulated in a local delta (`{ add: string[], remove: string[] }`)
- "Save changes" button becomes active (primary) once there is a pending delta
- On click → `PUT /clinic/roles/:roleId/permissions` with `{ add, remove }`
- Button shows spinner (`animate-spin` on `progress_activity` icon) during request
- On success: toast notification (`bg-secondary-container text-on-secondary-container`) "Permissions updated"
- On error: toast (`bg-error-container text-on-error-container`) with API error message
- If the edited role is the current user's own role → call `refreshPermissions()` after success (AC-8) → controls re-evaluate

### 6c. Loading State (initial list fetch)

```
<!-- Skeleton rows × 3 -->
<div class="animate-pulse space-y-xs px-lg py-md border-b border-outline-variant">
  <div class="h-5 bg-surface-container-high rounded w-48"></div>
  <div class="h-4 bg-surface-container rounded w-32 mt-xs"></div>
</div>
```

### 6d. Empty State (no roles returned)

```
<div class="flex flex-col items-center justify-center py-2xl gap-md text-center">
  <span class="material-symbols-outlined text-[48px] text-outline">admin_panel_settings</span>
  <p class="font-headline-xs text-on-surface-variant">No roles found</p>
  <p class="text-body-sm text-on-surface-variant">
    Contact Anemal support if system roles are missing.
  </p>
</div>
```

### 6e. Error State (API fetch failure)

```
<div class="flex flex-col items-center justify-center py-2xl gap-md text-center">
  <span class="material-symbols-outlined text-[48px] text-error">error_outline</span>
  <p class="font-headline-xs text-error">Failed to load roles</p>
  <button class="px-lg py-base border border-outline-variant rounded-lg text-on-surface
                 font-bold hover:bg-surface-container min-h-[44px] flex items-center gap-xs">
    <span class="material-symbols-outlined text-[16px]">refresh</span>
    Retry
  </button>
</div>
```

---

## 7. Breakpoint Layouts

### 7a. 768 px — Portrait Tablet

- Sidebar: hidden (overlay drawer via hamburger in TopNav)
- TopNav: `left-0` full width
- Content: `ml-0 pt-16 p-gutter`
- Page header: stacked (`flex-col gap-md items-start`); "Create Role" full-width button
- Role list: full width
- Permission toggle grid: `grid-cols-1` (single column)
- Role row actions (Clone/Delete/Assign): wrap into a `flex-wrap gap-xs` row; icon-only buttons with `title` tooltip at small sizes
- Modals: `w-[calc(100vw-32px)] max-h-[80vh] overflow-y-auto`

### 7b. 1024 px — Landscape Tablet

- Sidebar: `w-64 fixed` (expanded default; collapse toggle available)
- Content: `ml-64 pt-16 p-margin-desktop`
- Page header: side-by-side (`flex justify-between items-end`)
- Role list: full content-area width
- Permission toggle grid: `grid-cols-2`
- Role row actions: all visible inline with labels

### Right-hand mode

When `uiStore.side === 'right'`:
- Sidebar: `right-0` instead of `left-0`
- TopNav: `right-64 left-0` instead of `right-0 left-64`
- Content: `mr-64` instead of `ml-64`

---

## 8. API Endpoints

| Action | Method + Path | Permission | When called |
|--------|---------------|------------|-------------|
| Load role list | `GET /clinic/roles` | `roles.view` | On mount |
| Load permissions catalogue | `GET /clinic/permissions` | `roles.view` | On mount (once, cached) |
| Clone system role | `POST /clinic/roles/clone` | `roles.manage` | Clone modal confirm |
| Update role permissions | `PUT /clinic/roles/:roleId/permissions` | `roles.manage` | "Save changes" click |
| Delete role | `DELETE /clinic/roles/:roleId` | `roles.manage` | Delete confirm |
| Assign staff entry point | (links to T-5F-03 multi-role picker) | `staff.assign_role` | "Assign staff" click |

`GET /clinic/roles` response shape:
```json
[
  {
    "id": "uuid",
    "name": "Clinic Admin",
    "isSystem": true,
    "permissions": ["dashboard.view", "appointments.view", ...],
    "assignedUserCount": 3
  }
]
```

`PUT /clinic/roles/:roleId/permissions` request:
```json
{ "add": ["emr.view"], "remove": ["billing.void"] }
```

---

## 9. Guards & Conditional Rendering

```tsx
// Route guard (shell-level)
<RequirePermission perm="roles.view" fallback={<Redirect to="/403" />}>
  <RoleEditorPage />
</RequirePermission>

// "Create Role" button — requires manage
<Can perm="roles.manage">
  <CreateRoleButton />
</Can>

// Clone button — only on system roles, requires manage
{role.isSystem && (
  <Can perm="roles.manage">
    <CloneButton />
  </Can>
)}

// Delete button — only on custom roles, requires manage
{!role.isSystem && (
  <Can perm="roles.manage">
    <DeleteButton />
  </Can>
)}

// Toggle disabled when user lacks the permission (AC-5)
const userPerms = usePermissions()
const canToggle = !role.isSystem && userPerms.includes(permCode)
```

---

## 10. Toast Notification Component

Positioned: `fixed bottom-lg right-lg z-50` (or `bottom-lg left-lg` in right-hand mode)

```
<div class="flex items-center gap-md px-lg py-md rounded-xl shadow-lvl2
            [success: bg-secondary-container text-on-secondary-container]
            [error:   bg-error-container   text-on-error-container]
            animate-slide-up">
  <span class="material-symbols-outlined text-[20px]">
    [check_circle | error_outline]
  </span>
  <p class="text-body-sm font-bold">Permissions updated</p>
  <button class="ml-auto min-h-[44px] min-w-[44px] flex items-center justify-center
                 hover:opacity-70 rounded-full">
    <span class="material-symbols-outlined text-[16px]">close</span>
  </button>
</div>
```

Auto-dismiss after 4 s.

---

## 11. Acceptance Criteria Checklist

- [x] AC-1: Role list shows name, SYSTEM badge (`is_system=true`), and `assignedUserCount` chip
- [x] AC-2: Expand row reveals permissions by module; system-role toggles are `disabled`; "Clone to edit" CTA shown in banner
- [x] AC-3: Clone CTA opens name-prompt modal → `POST /clinic/roles/clone` → new role in list
- [x] AC-4: Custom role toggle changes accumulate in delta; "Save changes" → `PUT /clinic/roles/:roleId/permissions`
- [x] AC-5: Permissions the user doesn't hold render as `disabled` with hover tooltip "You don't have this permission"
- [x] AC-6: `DELETE` returning 409 → modal shows "Reassign N staff before deleting this role" with user list
- [x] AC-7: `DELETE` returning 200 → role removed from list, success toast
- [x] AC-8: After saving own role → `refreshPermissions()` called, controls re-evaluate
- [x] AC-9: "Assign staff" button on each role row opens T-5F-03 multi-role picker
- [x] AC-10: All toggles/buttons ≥44×44px; tokens only (no raw hex); Material Symbols; 768 px + 1024 px layouts specified
