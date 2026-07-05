# Dashboard Redesign — Design Spec

**Date:** 2026-06-25
**Plane:** Clinic (`/clinic/*`)
**Status:** Approved design (brainstorm + grilling complete) → ready for write-plan

---

## 1. Summary

Rework the clinic dashboard so the four KPI cards are clickable drill-downs into
**branch-scoped** detail views, relocate the revenue chart to a new Transaction
History page, surface a dedicated Vaccines-Due worklist with a Record-Vaccination
flow, brand the sidebar with the Company + Branch name, and simplify the dashboard
layout.

The defining decision (Q1): **the dashboard becomes branch-aware** — both the KPI
numbers and their drill-downs are scoped to the logged-in branch, so a card and the
page it opens always show the same figure. This reverses the prior documented
decision in `report.repository.ts` / `usage.service.ts` ("summarise across ALL
branches — do NOT add branchId filters"). `@db-agent` must re-bless the change.

---

## 2. Decisions (from grilling)

| # | Decision |
|---|----------|
| Q1 | Branch-scope the whole dashboard — cards **and** drill-downs. |
| Q2 | Add `branchId` to **Pet** (home/primary branch). Pet/EMR/vaccination data stays **company-wide readable** so any branch can continue care for a visiting pet. |
| Q3 | Backfill pet home branch from the most-recent appointment → fallback oldest branch. **NULL-branch pets appear in every branch's worklist** (never lost). |
| Q4 | "รายได้วันนี้" = **money received** (`PaymentHistory.amount`), branch-scoped. Card total always equals its own list total. |
| Q5 | The relocated revenue chart also switches to **payment-received** basis (one page, one definition of revenue). |
| Q6 | Vaccine "due" = `nextDueAt ≤ today + 7 days`, **no lower bound** — overdue items persist until acted on; sort overdue-first. |
| Q7 | **Latest-per-(pet + normalized vaccineName)** dedup. Recording the next dose clears the item; no explicit "done" flag. |
| Q8 | Add `administeredExternally` boolean to Vaccination (+ a checkbox) so externally-given doses don't count as clinic activity. No inventory deduction exists today, so nothing to skip. |
| Q9 | Per-card graceful degrade: a card the user can't navigate to becomes a plain (non-link) stat; the **revenue card is hidden entirely** without `billing.view`. |
| Q10 | Transactions page reuses `billing.view` — no new permission code. |
| Q11 | Month = a third `viewMode` (`day | week | month`) with per-day count badges; clicking any day cell → Day view for that date. |

---

## 3. Work items

### 3.1 Sidebar branding (`ClinicLayout.tsx`)

- Replace hard-coded `Anemal` / `nav.clinicPortal` with **line 1 = Company name**,
  **line 2 = Branch name** (shown only when sidebar is expanded).
- `authStore`: add `companyName: string` and `branchName: string` (persisted,
  default `''`, added to `AuthData`, `EMPTY`, and `normalise`).
- **Data flow:**
  - `branchName` — captured **client-side**: the branch-select step already receives
    `branches: {id, name}[]`; store the selected branch's `name`. No backend change.
  - `companyName` — **needs backend**: add `companyName` (= `tenant.name`) to the
    `select-branch` response (`SelectBranchResponse`) and the `switch-branch`
    response. The login step-1 response already resolves the tenant; surface its name.
- Edge: if `branchName` is empty, render Company name only. No live branch-switch UI
  exists today, so names are set once at branch-select and persist across refresh.

### 3.2 Dashboard KPI cards → clickable, branch-scoped (Row 1)

| Card | Destination | Visibility gate (Q9) |
|------|-------------|----------------------|
| นัดหมายวันนี้ | `/clinic/appointments` (Day view, today — already default) | `appointments.view` else plain stat |
| นัดหมายเดือนนี้ | `/clinic/appointments?view=month` | `appointments.view` else plain stat |
| รายได้วันนี้ | `/clinic/transactions?period=today` | **hidden entirely** without `billing.view` |
| วัคซีนที่ถึงกำหนด | `/clinic/vaccinations-due` | `emr.view` else plain stat |

- KPI numbers are now branch-scoped (see 3.6). A card with no destination permission
  renders as a non-clickable stat (no 403 dead-end); the revenue card is omitted
  when the user lacks `billing.view`.

### 3.3 Appointments: Month view (`ClinicAppointments.tsx`)

- `viewMode` gains `'month'`. Deep-linkable via `?view=month`.
- Calendar grid (7 columns). Each day cell shows a **count badge** of that day's
  appointments. Grid includes leading/trailing spillover days of adjacent months
  with their counts.
- Click **any** day cell (incl. empty) → set `viewMode = 'day'` + `currentDate = that
  date`.
- **Data:** one fetch over the full visible grid range, grouped by day client-side.
  Reuses `appointmentRepo.findInRange(tenantId, branchId, start, end)` — already
  branch-scoped. Backend: `listAppointments` accepts a month/range mode (e.g.
  `?view=month&date=YYYY-MM-01`) computing `start = first of month grid`,
  `end = last of month grid + 1d`.

### 3.4 New page: Transaction History (`/clinic/transactions`)

- Route guard: `billing.view`. Lazy-loaded view `ClinicTransactions.tsx`.
- **Today / This Month toggle**, deep-linkable via `?period=today|month`.
- **Revenue chart** (relocated from dashboard) at top, payment-received basis
  (`PaymentHistory.amount` by `paidAt`, branch-scoped), keeps daily/monthly toggle.
- **Transaction list** below: one row per `PaymentHistory` record for this branch in
  the period — columns: time (`paidAt`), invoice #, method, amount, received by,
  note. Each row links to its invoice. **Paginated** (a month can be large).
- Backend: `GET /clinic/transactions?period=today|month` (+ pagination params)
  returning branch-scoped payment rows; and a payment-based, branch-scoped revenue
  series endpoint (or extend the existing revenue endpoint with a `basis=payments`
  + `branchId` variant).

### 3.5 New page: Vaccines Due (`/clinic/vaccinations-due`)

- Route guard: `emr.view`. Lazy-loaded view `ClinicVaccinationsDue.tsx`.
- **Branch-scoped by `pet.branchId`** (home branch). NULL-branch pets show in every
  branch's list.
- Worklist rule (Q6 + Q7): for each `(pet, normalized vaccineName)` group, take the
  **latest** vaccination row; include it when its `nextDueAt ≤ today + 7 days`
  (no lower bound). Sort overdue-first. `normalized = trim + lowercase` of vaccineName.
- **Columns:** owner name + phone · pet (name / species / breed) · vaccine name ·
  due date (with "overdue by X days" / "due in X days").
- Row click → Record Vaccination page (§3.7).
- Backend: replace/extend `GET /api/vaccinations/due-soon` to:
  - apply the latest-per-group + overdue window logic,
  - branch-scope via `pet.branchId`,
  - enrich with owner (firstName, lastName, phone) and pet (name, species, breed).

### 3.6 Branch-scope the dashboard aggregates

- `usage.service` / `usage.repository`: the appointment-today and appointment-month
  counts take `branchId` and filter on it.
- `report.repository`: `revenueToday` / the dashboard revenue snapshot switch to
  **payment-received** basis (`PaymentHistory.amount` by `paidAt`) **and** branch
  filtering.
- The vaccine "due" count card uses the same branch-scoped (by `pet.branchId`)
  worklist count as 3.5.
- `@db-agent` reviews the reversal of the "do NOT add branchId" decision.

### 3.7 New page: Record Vaccination

- Opened from a Vaccines-Due row. Route guard: `emr.create`.
- Pre-fills pet + vaccine name + a suggested next due date; fields: date administered
  (default today), batch no, notes, and an **`administeredExternally` checkbox**.
- Submits to existing `POST /api/vaccinations` (extended to accept
  `administeredExternally`). On success the worklist group clears (Q7).
- A pet visiting a non-home branch while overdue won't appear on that branch's
  worklist; staff record it via the existing pet-detail vaccination modal
  (company-wide) — the second, already-built recording path.

### 3.8 Dashboard layout reshuffle (`ClinicDashboard.tsx`)

- **Remove** the revenue chart block (moved to 3.4).
- **Remove** the "At a glance / สรุปภาพรวม" summary block.
- **Move Today's Appointments up** into the chart's old 8-col slot; **Inventory
  Alerts** stays beside it (4-col).
- **Bottom Quick Actions row — unchanged.**

---

## 4. Data model changes (Prisma migration)

```prisma
model Pet {
  // ...
  branchId Int?   // home/primary branch (nullable; visibility stays company-wide)
  // index: @@index([tenantId, branchId])
}

model Vaccination {
  // ...
  administeredExternally Boolean @default(false)
}
```

- **Backfill `pet.branchId`** (Q3): set to the branch of each pet's most-recent
  appointment; pets with no appointment → tenant's oldest branch (lowest id).
  `Appointment.branchId` is nullable, so the fallback also covers visit-less / legacy
  pets.
- New-pet registration: default `branchId` to the registering user's current
  `branchId` (dev-task detail).

---

## 5. Permissions (all reuse existing codes)

| Surface | Permission |
|---------|-----------|
| Dashboard | `dashboard.view` (existing) |
| Appointments (day/week/month) | `appointments.view` |
| Transaction History | `billing.view` |
| Vaccines Due | `emr.view` |
| Record Vaccination | `emr.create` |

No new permission codes. All are already in the role editor, so a Company Admin can
configure access today. Revenue card visibility gates on `billing.view`.

---

## 6. Out of scope / YAGNI

- No `billing.report` permission (reuse `billing.view`; add later if "report-but-not-
  invoices" is ever requested).
- No inventory deduction on vaccination (none exists today).
- No live branch-switch UI (names set at branch-select; switching = re-login).
- No mini-list month cells (count badge only).

---

## 7. Risks / assumptions

- **Branch-scoping reversal** touches shared reporting code — regression risk for any
  other consumer of `usage.service` / `report.repository`. QA must cover both branch
  and tenant-summary call sites.
- **Free-text `vaccineName`** — normalized grouping reduces but doesn't eliminate
  duplicate schedules from spelling variants. Accepted for v1.
- **Revenue meaning changes** (invoiced → received). Any external reference to the
  old dashboard revenue number must be re-validated.
- **Scope** crosses the Ponytail gate's size lines (migration + 3 pages + new view +
  ~3 endpoints). Pipeline: BA sign-off → write-plan → Ponytail gate → execute.
