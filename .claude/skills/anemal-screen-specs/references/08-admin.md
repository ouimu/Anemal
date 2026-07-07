# Screen Spec: Admin Control Center
> Prototype: `stitch_vet_clinic_design_system/admin_control_center_1024x768/code.html`  
> Layout: `src/frontend/src/layouts/AdminLayout.tsx`  
> Pages: `src/frontend/src/views/admin/Admin*.tsx` + re-exported Tab components

---

## Layout

```
AdminLayout provides the same sidebar + TopNav pattern as ClinicLayout.
Sidebar uses same white reskin; nav items differ (see 00-shared-layout.md).
All pages offset: ml-56/ml-14 pt-16
```

---

> Real mount point is `/clinic-admin/*` (legacy `/admin/*` paths now redirect-only, see
> `00-shared-layout.md`). Headings below use the current `/clinic-admin/*` prefix.

## Admin Dashboard (`/clinic-admin/dashboard` → AdminDashboard.tsx)

```
p-6 max-w-4xl mx-auto

Page header:
  H2: text-headline-sm font-headline font-bold text-primary
  Subtitle: text-body-sm text-on-surface-variant

Stat grid (grid-cols-2 md:grid-cols-3 gap-4):
  Each card: border rounded-xl p-4 (color varies by metric)
  MaterialIcon top + headline-md value + label-md label

Quick actions card: bg-surface border border-outline-variant rounded-xl
  Link rows: flex items-center gap-3 min-h-[44px] px-2 rounded-lg hover:bg-surface-container-low
  MaterialIcon size=18 text-on-surface-variant

Plan card: same card style
  Tier name: text-headline-md font-headline font-bold text-on-surface
  "Manage subscription →" link: border-primary text-primary hover:bg-surface-container-low
```

---

## Users & Roles (`/clinic-admin/users` → UserManagementTab.tsx)

```
p-6 max-w-4xl mx-auto

Page header: flex items-start justify-between
  H2: text-headline-sm + Add user button (bg-primary text-on-primary rounded-xl min-h-[44px] px-5)

Filter bar: flex flex-wrap gap-2
  Status filter: bg-gray-100 rounded-lg p-1 (pill tabs: all/active/inactive)
  Role filter: same pattern
  Count: text-xs text-on-surface-variant ml-auto

User list: bg-surface border border-outline-variant rounded-2xl divide-y
  Row (min-h-[64px] flex items-center gap-4 px-5 py-3):
    Avatar: w-10 h-10 rounded-full (role color bg)
    Name + email
    Role badge: text-xs px-3 py-1 rounded-full border capitalize
    Edit button: min-h-[44px] min-w-[44px] border rounded-xl
```

**Role badge colors:**
| Role | Classes |
|---|---|
| admin | `bg-red-100 text-red-700 border-red-200` |
| doctor | `bg-blue-100 text-blue-700 border-blue-200` |
| staff | `bg-green-100 text-green-700 border-green-200` |

**Add/Edit modal:**
```
fixed inset-0 bg-black/50 flex items-center justify-center z-50
Dialog: bg-white rounded-2xl max-w-md p-6 shadow-2xl
Inputs: min-h-[44px] border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary/20
CTA: bg-primary hover:bg-primary/90 text-on-primary rounded-xl min-h-[44px]
```

---

## Clinic Profile (`/clinic-admin/profile` → ClinicProfileTab.tsx)

```
form space-y-6

Sections with text-xs font-semibold text-on-surface-variant uppercase tracking-wider labels

Logo upload zone: w-20 h-20 border-2 border-dashed border-outline-variant rounded-xl
                  hover:border-primary transition-colors

Input grid: min-h-[44px] border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary/20

Save button: bg-primary hover:bg-primary/90 text-on-primary min-h-[44px] px-6 rounded-lg
```

---

## Settings (`/clinic-admin/settings` → ClinicSettingsTab.tsx)

```
Toggle component: w-11 h-6 rounded-full
  Active: bg-secondary (sage green)
  Inactive: bg-surface-container-high

Inputs: min-h-[44px] border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary/20

Save button: bg-primary hover:bg-primary/90 text-on-primary min-h-[44px] px-6 rounded-lg
```

---

## Subscription (`/clinic-admin/subscription` → SubscriptionTab.tsx)

---

## Unspecced admin screens (write-on-next-touch)

These routes are real and shipped but have no detailed spec in this file yet — a spec is
added only when the screen is next modified (see `SKILL.md` coverage table, ADR-0006 D4):

- `/clinic-admin/branches` → `AdminBranches.tsx` — not yet specced, write-on-next-touch (see SKILL.md coverage table).
- `/clinic-admin/blood-bank` → `AdminBloodBank.tsx` — not yet specced, write-on-next-touch (see SKILL.md coverage table).
- `/clinic-admin/audit` → `AdminAudit.tsx` — not yet specced, write-on-next-touch (see SKILL.md coverage table).
- `/clinic-admin/roles` → `RoleEditorView.tsx` — not yet specced, write-on-next-touch (see SKILL.md coverage table).

```
Plan cards: bg-surface border rounded-xl p-5 flex flex-col gap-3
  Current plan: border-primary ring-1 ring-primary/20
  "Current" badge: bg-secondary-container text-on-secondary-container rounded-full

Upgrade button: border border-primary text-primary rounded-lg min-h-[44px]
                hover:bg-surface-container-low
```

---

## Tab navigation style (AdminView.tsx legacy tabs)

```
Tab bar: flex gap-0 border-b border-outline-variant
Tab button: px-5 py-3 text-sm whitespace-nowrap border-b-2 transition-colors
  Active: border-primary text-primary font-medium
  Inactive: border-transparent text-on-surface-variant hover:text-on-surface
```
