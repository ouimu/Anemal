# Screen Spec: Clinic Dashboard
> Prototype: `stitch_vet_clinic_design_system/dashboard_overview_1024x768/code.html`  
> Component: `src/frontend/src/views/clinic/ClinicDashboard.tsx`  
> Status: **Implemented** (2026-06-04) — bento grid layout, stub data where Phase 2 API pending

---

## Layout

```
pt-16 pl-56 (or pl-14 collapsed) — via ClinicLayout main offset
Inner padding: p-lg
```

---

## Page header

```
flex items-start justify-between mb-lg

Left:
  H2 "Clinic Overview" — text-headline-lg font-headline font-bold text-primary
  Date string — text-body-md text-on-surface-variant mt-xs

Right:
  Link → /clinic/appointments
  flex items-center gap-sm bg-primary text-on-primary rounded-lg px-lg py-sm min-h-[44px]
  Icon: add size=18 + "New Appointment" text-body-sm font-semibold
  hover:bg-primary/90 transition-colors
```

---

## Bento grid (`.bento-grid` — 12 columns, 16px gap)

| Cols | Widget | Content |
|---|---|---|
| `col-span-6 md:col-span-3` | Today's Appointments | `appointmentsToday` from API; border-l-4 border-secondary |
| `col-span-6 md:col-span-3` | This Month | `appointmentsThisMonth`; border-l-4 border-info |
| `col-span-12 md:col-span-6` | System Status | Isolation, JWT, RBAC status rows |
| `col-span-12 lg:col-span-8` | Today's Schedule | Table with bg-primary header; Phase 2 stub |
| `col-span-12 lg:col-span-4` | Waiting Queue | Empty state + stats (totalPets, invoicesThisMonth) |
| `col-span-12` | Quick Actions | 4-button grid → Appointments, Pets, EMR, Billing |

---

## Stat card anatomy (col-span-3)

```
glass-card rounded-xl shadow-lvl1 border-l-4 p-md

Top row: flex items-center justify-between mb-sm
  Left chip: bg-secondary-container text-on-secondary-container rounded-full px-sm py-xs text-label-md
  Right icon: MaterialIcon (trending_up / calendar_month) text-success / text-info

Value: text-headline-md font-headline font-bold text-primary
Label: text-body-sm text-on-surface-variant mt-xs
```

---

## Table (Today's Schedule)

```
glass-card rounded-xl overflow-hidden

Header bar: bg-primary text-on-primary px-lg py-md
  flex items-center justify-between
  H3: text-headline-xs font-headline font-semibold
  "View all" link: text-label-md text-on-primary/80 hover:text-on-primary

thead: bg-surface-container-low
  th: text-left px-md py-sm text-label-md text-on-surface-variant uppercase tracking-wider font-medium
  Columns: Time | Patient | Owner | Doctor | Status

tbody: divide-y divide-outline-variant
  Row: hover:bg-surface-container transition-colors min-h-[48px]
  Status chip: rounded-full text-label-md uppercase (color by status)
```

---

## Quick Actions (col-span-12)

```
grid grid-cols-2 md:grid-cols-4 gap-md

Each action card:
  glass-card rounded-xl shadow-lvl1 p-md
  flex flex-col items-center gap-sm min-h-[88px] justify-center
  hover:shadow-lvl2 transition-shadow

  MaterialIcon: fill=1, size=28 (text-secondary or text-primary)
  Label: text-label-md text-on-surface-variant text-center leading-tight
```

Actions: New Appointment (add_circle) · Register Pet (pets) · New EMR Record (description) · Create Invoice (receipt)

---

## Phase 2 integration points

When Phase 2 APIs are available:
- Replace stub table rows with real appointment data
- Replace waiting queue empty state with real queue
- Add revenue card (Phase 3 billing API)
