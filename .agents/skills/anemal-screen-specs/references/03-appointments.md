# Screen Spec: Appointments (Clinic Schedule)
> Prototype: `stitch_vet_clinic_design_system/appointment_scheduling_1024x768/code.html`
> Component: `src/frontend/src/views/clinic/ClinicAppointments.tsx`
> Status: **Implemented** (Phase 2) — spec written retroactively 2026-06-10 from prototype + shipped component

---

## Layout

```
pt-16 pl-56 (or pl-14 collapsed) — via ClinicLayout main offset
Root: flex flex-col h-full overflow-hidden
Content row: flex flex-1 overflow-hidden
  ├─ Calendar grid: flex-1 overflow-auto (min-w-[600px] inner)
  └─ Booking panel (conditional): w-80 flex-shrink-0 border-l border-outline-variant
```

> Prototype shows a left staff/room sidebar (3 cols) + 9-col calendar; the shipped
> component replaces it with a header filter bar + slide-in right booking panel.
> Both are spec-compliant; new work should follow the shipped layout.

---

## Page header (toolbar)

```
flex items-center gap-md px-lg py-md border-b border-outline-variant bg-surface flex-shrink-0 flex-wrap gap-y-sm

Date nav (left):
  chevron buttons: min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-surface-container-low rounded-lg
    Icons: chevron_left / chevron_right size=24
  Date label: text-body-md font-semibold min-w-[160px] text-center
    day mode → "Wednesday, June 10, 2026" · week mode → "Jun 8 – Jun 14, 2026"
  "Today" button: px-md py-sm min-h-[44px] rounded-lg border border-outline-variant text-body-sm hover:bg-surface-container-low

Day/Week toggle:
  flex rounded-lg overflow-hidden border border-outline-variant
  Active:   px-lg py-sm min-h-[44px] text-body-sm font-medium capitalize bg-primary text-primary-on
  Inactive: same + hover:bg-surface-container-low

Doctor filter:
  select — bg-surface-container-low rounded-lg px-md py-sm min-h-[44px] text-body-sm
  border border-outline-variant focus:ring-2 focus:ring-primary
  First option "All doctors", then role=doctor users

CTA (right, after flex-1 spacer):
  flex items-center gap-sm bg-primary text-primary-on rounded-lg px-lg py-sm min-h-[44px]
  text-body-sm font-semibold hover:bg-primary/90
  Icon: add size=18 + "Book Appointment"
```

---

## Calendar grid

```
Columns: inline style gridTemplateColumns: `64px repeat(${days.length}, 1fr)`
  day mode → 1 day column · week mode → 7 day columns
Hours: 08:00–20:00 (HOURS constant, hourly rows)

Day header row (sticky):
  grid sticky top-0 bg-surface z-10 border-b border-outline-variant
  Cell: h-12 flex items-center justify-center border-l border-outline-variant/50 text-body-sm font-semibold
  Today's label: text-secondary

Time row:
  grid border-b border-outline-variant/30, minHeight 64
  Time label cell: flex items-start pt-sm px-sm text-label-md text-on-surface-variant border-r border-outline-variant/50
  Slot cell: border-l border-outline-variant/30 p-xs min-h-[64px]
             hover:bg-surface-container-low/50 cursor-pointer
  Click empty slot → open booking panel pre-filled with that hour

Appointment card (inside slot):
  rounded-lg px-sm py-xs text-body-sm font-medium mb-xs cursor-pointer hover:opacity-80
  + STATUS_COLORS class (below)
  Line 1: pet name — font-semibold truncate
  Line 2: doctor · HH:mm — text-label-md opacity-80 truncate
  Click card → detail modal (stopPropagation so slot click doesn't fire)
```

### Status chip colors (STATUS_COLORS)

| Status | Classes |
|---|---|
| `scheduled` | `bg-primary-fixed text-on-surface` |
| `arrived` | `bg-secondary-container text-secondary-on-container` |
| `in_progress` | `bg-warning/20 text-warning` |
| `completed` | `bg-success/20 text-success` |
| `cancelled` | `bg-surface-container-high text-on-surface-variant line-through` |
| `no_show` | `bg-error-container text-error` |

---

## Booking panel (right slide-in, `w-80`)

```
w-80 flex-shrink-0 border-l border-outline-variant bg-surface flex flex-col

Header: flex items-center justify-between px-lg py-md border-b border-outline-variant
  H3 "Book Appointment": text-headline-sm font-headline font-bold
  Close: min-h-[44px] min-w-[44px] icon close size=20

Form: flex-1 overflow-y-auto p-lg flex flex-col gap-md
  Error banner: text-error text-body-sm bg-error-container rounded-lg px-md py-sm
  Field label: text-body-sm font-medium text-on-surface-variant mb-xs block
  Inputs/selects: w-full bg-surface-container-low rounded-lg px-md py-sm min-h-[44px]
    text-body-sm border border-outline-variant focus:ring-2 focus:ring-primary

Fields:
  1. Patient — search input (icon `search` prefix, pl-9), autocomplete dropdown:
       absolute top-full bg-surface border border-outline-variant rounded-lg shadow-lg z-10 max-h-40 overflow-y-auto
       Result row (min-h-[44px]): pet name font-medium + "owner · phone" text-on-surface-variant
     Selected chip: bg-surface-container-low rounded-lg, icon `pets` text-secondary, clear button
  2. Doctor — select (role=doctor users)
  3. Date + Time — flex gap-md; time options 08:00–20:00 in 30-min steps
  4. Duration — select: 15 / 30 / 45 / 60 / 90 / 120 min
  5. Reason — optional textarea min-h-[80px] resize-none

Submit: w-full min-h-[44px] bg-primary text-primary-on rounded-lg text-body-sm font-semibold
        hover:bg-primary/90 disabled:opacity-50 ("Booking…" while saving)
Validation: pet + doctor required (client-side message before POST)
```

---

## Appointment detail modal

```
Overlay: fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-lg
Dialog:  bg-surface rounded-xl shadow-lg w-full max-w-sm p-xl

Header: pet name (text-headline-sm font-headline font-bold) + close button
Body rows (text-body-sm, labels text-on-surface-variant): Doctor · Time + duration · Reason (if any)

Status grid: grid grid-cols-2 gap-sm — one button per status
  min-h-[44px] rounded-lg text-body-sm font-medium capitalize
  Current: ring-2 ring-primary · Others: bg-surface-container-low hover:bg-surface-container
  Click → PUT status, close modal
```

---

## Behaviour / API

| Action | Call | Notes |
|---|---|---|
| Load calendar | `GET /api/appointments?date=YYYY-MM-DD[&week=true][&doctorId=N]` | React Query key `['appointments', date, viewMode, doctorId]`, staleTime 30s |
| Load doctors | `GET /users` → filter `role === 'doctor'` | staleTime 5 min |
| Pet/owner search | `GET /api/search?q=<term>` | enabled at ≥2 chars, staleTime 10s |
| Book | `POST /api/appointments` `{ petId, doctorId, scheduledAt(ISO), durationMin, reason\|null }` | Backend rejects double-booking |
| Update status | `PUT /api/appointments/:id/status` `{ status }` | Invalidates `['appointments']` on success |

---

## Prototype-only elements (not in shipped component)

From the Stitch prototype — adopt these classes if the features are built later:
- Staff availability card: `bg-surface p-lg rounded-2xl shadow-sm border border-outline-variant`; dots `w-2 h-2 rounded-full bg-success` (available) / `bg-warning` (break)
- Room status pills: available `p-md rounded-xl bg-sage-light text-secondary border border-secondary/10`, busy `bg-surface-container-low text-on-surface-variant border border-outline-variant`
- Prototype appointment card style: `border-l-4 border-secondary bg-sage-light rounded shadow-sm`

## Deferred items

- Room filter / room assignment UI (room field exists on the model)
- Walk-in queue view
- Drag-to-reschedule on the calendar grid
