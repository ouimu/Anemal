# Shared Layout Spec — Sidebar + TopNav
> Source: `design-alignment-plan.md` § 5, `stitch_vet_clinic_design_system/`  
> Applies to: all clinic and admin screens

---

## Sidebar

```
Position: fixed left-0 top-0 h-screen z-50
Width:     w-56 expanded | w-14 collapsed (toggle kept, reskin only)
BG:        bg-surface shadow-sm
Flex:      flex flex-col overflow-hidden transition-all duration-200
```

### Header (min-h-[64px])
```
flex items-center justify-between px-sm pt-md pb-md border-b border-outline-variant

[Expanded]:
  "Anemal" — text-headline-sm font-headline font-bold text-primary
  Branch/role label — text-label-md text-on-surface-variant

Toggle button: min-h-[44px] min-w-[44px] rounded-lg hover:bg-surface-container
  Icon: menu_open (expanded) | menu (collapsed) — MaterialIcon size=22
```

### Nav items (flex-col flex-1 py-sm)

**Inactive (expanded):**
```
flex items-center gap-md px-lg min-h-[44px] mx-sm rounded-lg
text-on-surface-variant hover:bg-surface-container transition-colors
```

**Active (expanded):**
```
flex items-center gap-md px-lg min-h-[44px]
border-r-4 border-primary bg-surface-container-low text-primary font-bold
(no rounded-lg, no mx-sm — full-width strip)
```

**Inactive (collapsed):**
```
flex items-center justify-center min-h-[44px] mx-1 rounded-lg
text-on-surface-variant hover:bg-surface-container transition-colors
```

**Active (collapsed):**
```
flex items-center justify-center min-h-[44px] w-full
border-r-4 border-primary bg-surface-container-low text-primary
```

### Clinic nav items

| Icon (Material Symbols) | Label | Route |
|---|---|---|
| `dashboard` | Dashboard | `/clinic/dashboard` |
| `pets` | Pets & Owners | `/clinic/pets` |
| `calendar_today` | Schedule | `/clinic/appointments` |
| `medical_services` | EMR | `/clinic/emr` |
| `inventory_2` | Inventory | `/clinic/inventory` |
| `payments` | Billing | `/clinic/billing` |

### Admin nav items

| Icon | Label | Route |
|---|---|---|
| `dashboard` | Overview | `/admin/dashboard` |
| `group` | Users & Roles | `/admin/users` |
| `business` | Clinic Profile | `/admin/profile` |
| `bar_chart` | Usage Stats | `/admin/usage` |
| `settings` | Settings | `/admin/settings` |
| `credit_card` | Subscription | `/admin/subscription` |

### Footer (border-t border-outline-variant p-sm)
```
[Expanded]:
  Avatar: w-10 h-10 rounded-full bg-primary text-on-primary (initial)
  Name: text-body-sm font-medium text-on-surface
  Role: text-label-md text-on-surface-variant capitalize

Logout button (full width, min-h-[44px]):
  flex items-center justify-center gap-sm
  border border-outline-variant rounded-lg
  text-on-surface-variant hover:bg-surface-container
  Icon: logout (MaterialIcon size=18)
```

---

## TopNav

```
Position: fixed top-0 right-0 h-16 z-40
Left:     left-56 (expanded) | left-14 (collapsed) — reads sidebarOpen from uiStore
BG:       bg-surface border-b border-outline-variant
Flex:     flex items-center justify-between px-lg
```

### Sections

**Left — page title:**
```
text-headline-sm font-headline font-semibold text-primary
(derive from current route via useLocation())
```

**Center — search input:**
```
w-80 min-h-[44px] rounded-full
bg-surface-container-low border border-outline-variant
pl-10 pr-md (prefix icon: search, size=18)
focus:border-primary focus:ring-2 focus:ring-primary/20
```

**Right — action row (gap-xs):**
```
notifications icon btn: min-h-[44px] min-w-[44px] rounded-lg hover:bg-surface-container-low
help_outline icon btn: same
User avatar: w-9 h-9 rounded-full bg-primary text-on-primary (initial)
```

---

## Content area offset

```
Main area: ml-56 (expanded) | ml-14 (collapsed) + pt-16
Transition: transition-all duration-200 (matches sidebar animation)
```

---

## Implementation files

| File | Role |
|---|---|
| `src/frontend/src/layouts/ClinicLayout.tsx` | Sidebar + TopNav + main for clinic routes |
| `src/frontend/src/layouts/AdminLayout.tsx` | Sidebar + TopNav + main for admin routes |
| `src/frontend/src/components/TopNav.tsx` | Reusable top nav bar |
| `src/frontend/src/components/MaterialIcon.tsx` | Icon wrapper |
| `src/frontend/store/uiStore.ts` | `sidebarOpen`, `toggleSidebar` state |
