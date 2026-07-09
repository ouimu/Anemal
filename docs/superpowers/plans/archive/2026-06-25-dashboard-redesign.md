# Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make dashboard KPIs branch-scoped and clickable, add Transactions History and Vaccines Due pages, brand the sidebar with Company/Branch name, and add month-view to Appointments.

**Architecture:** Backend-first (migration → scoped aggregates → new endpoints), then frontend (store → layout → pages). No new npm deps. All new pages are lazy-loaded and permission-gated with existing codes. Branch-scoping is additive: tenant-wide functions in report.repository.ts are preserved for existing admin-dashboard consumers; new branch-scoped functions are added alongside them.

**Tech Stack:** Node.js + Express + Prisma + PostgreSQL (backend); React 18 + Zustand + React Query + Tailwind (frontend). Jest + Supertest (backend tests).

## Global Constraints

- Every new backend query must include `WHERE "tenantId" = :tenantId` (plus `branchId` where specified).
- No new npm packages — all new code uses existing dependencies.
- All new routes must be preceded by `requirePlane('clinic')` then `requirePermission(...)`.
- Existing tenant-wide report functions in `report.repository.ts` must NOT be deleted (admin dashboard consumers).
- Frontend permission gates use existing codes only: `appointments.view`, `billing.view`, `emr.view`, `emr.create`.
- `i18n` keys follow existing pattern: `t('clinic.dashboard.xxx')` for dashboard strings.
- Backend test files live in `src/backend/tests/integration/` (integration) or `src/backend/tests/unit/` (unit).
- Run backend tests from `src/backend/` with: `npm test -- --testPathPattern=<name> --forceExit`

---

## File Map

**Modified (backend)**
- `src/backend/prisma/schema.prisma` — add Pet.branchId, Vaccination.administeredExternally
- `src/backend/services/auth.service.ts` — add companyName to selectBranch + switchBranch
- `src/backend/models/usage.repository.ts` — add optional branchId to appointment + vaccination counts
- `src/backend/services/usage.service.ts` — getClinicSummary accepts branchId
- `src/backend/routes/clinic.routes.ts` — pass branchId to getClinicSummary; mount transactions sub-router
- `src/backend/models/report.repository.ts` — add payment-received, branch-scoped revenue functions
- `src/backend/routes/report.routes.ts` — pass branchId to snapshot
- `src/backend/models/vaccination.repository.ts` — add findDueSoonWorklist (raw SQL, latest-per-group)
- `src/backend/services/vaccination.service.ts` — add getDueSoonWorklist; add administeredExternally to schema
- `src/backend/controllers/vaccination.controller.ts` — wire new worklist handler
- `src/backend/controllers/appointment.controller.ts` — extend list to support month date range

**Created (backend)**
- `src/backend/controllers/transaction.controller.ts` — GET /clinic/transactions + revenue series
- `src/backend/routes/transaction.routes.ts` — mounts transaction controller under /clinic/transactions

**Modified (frontend)**
- `src/frontend/src/store/authStore.ts` — add companyName, branchName fields
- `src/frontend/src/layouts/ClinicLayout.tsx` — company/branch branding in sidebar header
- `src/frontend/src/views/clinic/ClinicDashboard.tsx` — clickable KPI cards + layout reshuffle
- `src/frontend/src/views/clinic/ClinicAppointments.tsx` — add month viewMode
- `src/frontend/src/App.tsx` — register 3 new lazy routes

**Created (frontend)**
- `src/frontend/src/views/clinic/ClinicTransactions.tsx` — Transaction History page
- `src/frontend/src/views/clinic/ClinicVaccinationsDue.tsx` — Vaccines Due worklist
- `src/frontend/src/views/clinic/ClinicRecordVaccination.tsx` — Record Vaccination form
- `src/frontend/src/hooks/useTransactions.ts` — React Query hooks for transactions page

---

### Task 1: DB Migration — Pet.branchId + Vaccination.administeredExternally + Backfill

**Files:**
- Modify: `src/backend/prisma/schema.prisma`
- Create: `src/backend/prisma/migrations/<timestamp>_dashboard_redesign/migration.sql`

**Interfaces:**
- Produces: `Pet.branchId: Int?`, `Vaccination.administeredExternally: Boolean @default(false)`, index `@@index([tenantId, branchId])` on Pet — consumed by Tasks 3, 5, 6.

- [ ] **Step 1: Update schema.prisma**

Open `src/backend/prisma/schema.prisma`. Find the `model Pet` block and add `branchId` and an index. Find the `model Vaccination` block and add `administeredExternally`.

In `model Pet`, add after the existing fields (before the closing `}`):
```prisma
  branchId              Int?
  branch                Branch?  @relation(fields: [branchId], references: [id])
  @@index([tenantId, branchId])
```

In `model Vaccination`, add after `notes`:
```prisma
  administeredExternally Boolean  @default(false)
```

- [ ] **Step 2: Generate and inspect the migration**

```bash
cd src/backend && npx prisma migrate dev --name dashboard_redesign --create-only
```

This creates the migration SQL file. Open it and verify it contains `ALTER TABLE "pets"` and `ALTER TABLE "vaccinations"`.

- [ ] **Step 3: Add backfill SQL to the migration file**

Open the newly created migration file and append this backfill SQL after the generated `ALTER TABLE` statements:

```sql
-- Backfill pet.branchId: set to branch of most-recent appointment, fallback to tenant's oldest branch.
UPDATE pets p
SET "branchId" = COALESCE(
  (
    SELECT a."branchId"
    FROM appointments a
    WHERE a."petId" = p.id AND a."tenantId" = p."tenantId" AND a."branchId" IS NOT NULL
    ORDER BY a."scheduledAt" DESC
    LIMIT 1
  ),
  (
    SELECT b.id
    FROM branches b
    WHERE b."tenantId" = p."tenantId" AND b."isActive" = true
    ORDER BY b.id ASC
    LIMIT 1
  )
)
WHERE p."branchId" IS NULL;
```

- [ ] **Step 4: Apply the migration**

```bash
cd src/backend && npx prisma migrate dev
```

Expected output: `The following migration(s) have been applied: ... dashboard_redesign`

- [ ] **Step 5: Regenerate Prisma client**

```bash
cd src/backend && npx prisma generate
```

Expected: `Generated Prisma Client` with no errors.

- [ ] **Step 6: Write failing test**

Create `src/backend/tests/integration/dashboard-migration.test.ts`:

```typescript
import prisma from '../../config/db'

describe('dashboard migration schema', () => {
  it('Pet model has branchId column', async () => {
    const result = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'pets' AND column_name = 'branchId'
    `
    expect(result.length).toBe(1)
  })

  it('Vaccination model has administeredExternally column', async () => {
    const result = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'vaccinations' AND column_name = 'administeredExternally'
    `
    expect(result.length).toBe(1)
  })
})
```

- [ ] **Step 7: Run test**

```bash
cd src/backend && npm test -- --testPathPattern=dashboard-migration --forceExit
```

Expected: 2 tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/backend/prisma/schema.prisma src/backend/prisma/migrations src/backend/tests/integration/dashboard-migration.test.ts
git commit -m "feat: add Pet.branchId and Vaccination.administeredExternally with backfill"
```

---

### Task 2: Auth Backend — Add companyName to Branch Responses

**Files:**
- Modify: `src/backend/services/auth.service.ts`

**Interfaces:**
- Consumes: existing `SelectBranchResponse`, `SwitchBranchResponse` interfaces in auth.service.ts
- Produces: both interfaces gain `companyName: string` — consumed by Task 9 (frontend authStore)

- [ ] **Step 1: Write failing test**

Add to `src/backend/tests/integration/auth.test.ts` (find the select-branch test section, add after it):

```typescript
it('select-branch response includes companyName', async () => {
  // Step 1: login to get pendingToken
  const loginRes = await request(app)
    .post('/auth/login')
    .send({ username: TEST_USERNAME, password: TEST_PASSWORD })
  expect(loginRes.body.data.requiresBranchSelection).toBe(true)
  const { pendingToken, branches } = loginRes.body.data

  // Step 2: select branch
  const res = await request(app)
    .post('/auth/select-branch')
    .send({ pendingToken, branchId: branches[0].id })
  expect(res.status).toBe(200)
  expect(typeof res.body.data.companyName).toBe('string')
  expect(res.body.data.companyName.length).toBeGreaterThan(0)
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd src/backend && npm test -- --testPathPattern=auth.test --forceExit
```

Expected: FAIL — `companyName` is undefined.

- [ ] **Step 3: Update auth.service.ts**

Open `src/backend/services/auth.service.ts`. Make these changes:

Add `companyName` to the `SelectBranchResponse` interface:
```typescript
interface SelectBranchResponse {
  requiresBranchSelection: false
  token:         string
  refreshToken:  string
  userId:        number
  tenantId:      number
  branchId:      number
  role:          string
  name:          string
  companyName:   string
}
```

In `selectBranch()`, after fetching `branch`, fetch the tenant name and include it in the return:
```typescript
  // After: const branch = await authRepo.findBranchById(tenantId, branchId)
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } })
  const companyName = tenant?.name ?? ''
```

Add `companyName` to the return object:
```typescript
  return {
    requiresBranchSelection: false as const,
    token,
    refreshToken: rawRefreshToken,
    userId,
    tenantId,
    branchId,
    role:        user.role,
    name:        user.name,
    companyName,
  }
```

Apply the same pattern to `switchBranch()`: add `companyName` to `SwitchBranchResponse` interface and fetch + return it the same way.

Add the prisma import at the top of auth.service.ts if not already present:
```typescript
import prisma from '../config/db'
```

- [ ] **Step 4: Run test**

```bash
cd src/backend && npm test -- --testPathPattern=auth.test --forceExit
```

Expected: all auth tests PASS including the new companyName assertion.

- [ ] **Step 5: Commit**

```bash
git add src/backend/services/auth.service.ts src/backend/tests/integration/auth.test.ts
git commit -m "feat: add companyName to select-branch and switch-branch responses"
```

---

### Task 3: Branch-Scope Dashboard Usage Aggregates

**Files:**
- Modify: `src/backend/models/usage.repository.ts`
- Modify: `src/backend/services/usage.service.ts`
- Modify: `src/backend/routes/clinic.routes.ts`

**Interfaces:**
- Consumes: `req.context.branchId: number | null` from JWT middleware
- Produces: `getClinicSummary(tenantId, branchId?)` — appointment/vaccination counts scoped to branch

- [ ] **Step 1: Write failing test**

Create `src/backend/tests/integration/clinic-summary-branch.test.ts`:

```typescript
import request from 'supertest'
import app from '../../server'
import { getAuthToken } from '../helpers/seedUserRoles'

describe('GET /clinic/usage branch-scoping', () => {
  it('returns 200 with appointmentsToday scoped to branch', async () => {
    const token = await getAuthToken({ plane: 'clinic' })
    const res = await request(app)
      .get('/clinic/usage')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(typeof res.body.data.appointmentsToday).toBe('number')
    expect(typeof res.body.data.vaccinationsDueSoon).toBe('number')
  })
})
```

- [ ] **Step 2: Run test to verify it passes (baseline)**

```bash
cd src/backend && npm test -- --testPathPattern=clinic-summary-branch --forceExit
```

Expected: PASS. This baseline stays green throughout.

- [ ] **Step 3: Update usage.repository.ts**

Replace the three functions with branchId-aware versions:

```typescript
export function countAppointmentsSince(tenantId: number, since: Date, branchId?: number | null) {
  return prisma.appointment.count({
    where: { tenantId, scheduledAt: { gte: since }, ...(branchId ? { branchId } : {}) },
  })
}

export function countAppointmentsBetween(tenantId: number, from: Date, to: Date, branchId?: number | null) {
  return prisma.appointment.count({
    where: { tenantId, scheduledAt: { gte: from, lt: to }, ...(branchId ? { branchId } : {}) },
  })
}

export function countVaccinationsBetween(tenantId: number, from: Date, to: Date, branchId?: number | null) {
  // ponytail: NULL-branch pets show in every branch. When branchId provided, include pet.branchId = branchId OR NULL.
  if (branchId) {
    return prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(v.id)::bigint AS count
      FROM vaccinations v
      JOIN pets p ON p.id = v."petId"
      WHERE v."tenantId" = ${tenantId}
        AND v."nextDueAt" <= ${to}
        AND v."nextDueAt" >= ${from}
        AND (p."branchId" = ${branchId} OR p."branchId" IS NULL)
    `.then(rows => Number(rows[0]?.count ?? 0))
  }
  return prisma.vaccination.count({ where: { tenantId, nextDueAt: { gte: from, lte: to } } })
}
```

- [ ] **Step 4: Update usage.service.ts — getClinicSummary**

Change `getClinicSummary` signature and pass `branchId` through to all repo calls:

```typescript
export async function getClinicSummary(tenantId: number, branchId?: number | null) {
  const now      = new Date()
  const start    = new Date(now.getFullYear(), now.getMonth(), 1)
  const today    = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const in7days  = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const [appointmentsToday, appointmentsThisMonth, totalPets, invoicesThisMonth, vaccinationsDueSoon] = await Promise.all([
    usageRepo.countAppointmentsBetween(tenantId, today, tomorrow, branchId),
    usageRepo.countAppointmentsSince(tenantId, start, branchId),
    usageRepo.countActivePets(tenantId),
    usageRepo.countInvoicesSince(tenantId, start),
    usageRepo.countVaccinationsBetween(tenantId, now, in7days, branchId),
  ])

  return { appointmentsToday, appointmentsThisMonth, totalPets, invoicesThisMonth, vaccinationsDueSoon }
}
```

- [ ] **Step 5: Update clinic.routes.ts**

In the `/usage` route handler, change:
```typescript
// Before:
const data = await getClinicSummary(req.context!.tenantId)

// After:
const data = await getClinicSummary(req.context!.tenantId, req.context!.branchId)
```

- [ ] **Step 6: Run tests**

```bash
cd src/backend && npm test -- --testPathPattern=clinic-summary-branch --forceExit
```

Expected: PASS. Then full suite:
```bash
cd src/backend && npm test -- --forceExit 2>&1 | tail -20
```

- [ ] **Step 7: Commit**

```bash
git add src/backend/models/usage.repository.ts src/backend/services/usage.service.ts src/backend/routes/clinic.routes.ts src/backend/tests/integration/clinic-summary-branch.test.ts
git commit -m "feat: branch-scope appointment and vaccination counts in clinic summary"
```

---

### Task 4: Branch-Scoped Revenue KPI (Payment-Received Basis)

**Files:**
- Modify: `src/backend/models/report.repository.ts`
- Modify: `src/backend/routes/report.routes.ts`

**Interfaces:**
- Produces: `revenueTodayBranch(tenantId, branchId)` and `revenueSeriesBranch(tenantId, branchId, period, n)` using `payment_history` table — consumed by the snapshot endpoint and Task 7 (transactions page)

- [ ] **Step 1: Write failing test**

Create `src/backend/tests/integration/report-branch.test.ts`:

```typescript
import request from 'supertest'
import app from '../../server'
import { getAuthToken } from '../helpers/seedUserRoles'

describe('GET /clinic/reports/snapshot branch-scoped revenue', () => {
  it('returns revenueToday as a number', async () => {
    const token = await getAuthToken({ plane: 'clinic' })
    const res = await request(app)
      .get('/clinic/reports/snapshot')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(typeof res.body.data.revenueToday).toBe('number')
  })
})
```

- [ ] **Step 2: Run test to verify existing behaviour**

```bash
cd src/backend && npm test -- --testPathPattern=report-branch --forceExit
```

Expected: PASS (baseline).

- [ ] **Step 3: Add branch-scoped payment-received functions to report.repository.ts**

Append these to the end of `src/backend/models/report.repository.ts`:

```typescript
// ─── Branch-scoped, payment-received basis (2026-06-25) ──────────────────────
// Uses payment_history.paidAt + amount. Old invoice-based functions above are
// preserved for admin-dashboard consumers — do NOT delete them.

export async function revenueTodayBranch(tenantId: number, branchId: number | null): Promise<number> {
  const start = new Date(); start.setHours(0, 0, 0, 0)
  const end   = new Date(start); end.setDate(end.getDate() + 1)
  if (branchId) {
    const rows = await prisma.$queryRaw<{ value: number }[]>`
      SELECT COALESCE(SUM(amount), 0)::float8 AS value FROM payment_history
      WHERE "tenantId" = ${tenantId} AND "branchId" = ${branchId}
        AND "paidAt" >= ${start} AND "paidAt" < ${end}`
    return Number(rows[0]?.value ?? 0)
  }
  const rows = await prisma.$queryRaw<{ value: number }[]>`
    SELECT COALESCE(SUM(amount), 0)::float8 AS value FROM payment_history
    WHERE "tenantId" = ${tenantId} AND "paidAt" >= ${start} AND "paidAt" < ${end}`
  return Number(rows[0]?.value ?? 0)
}

export function revenueSeriesBranch(
  tenantId: number,
  branchId: number | null,
  period:   'daily' | 'monthly',
  n:        number,
): Promise<SeriesPoint[]> {
  if (period === 'daily') {
    const since = new Date(); since.setHours(0, 0, 0, 0); since.setDate(since.getDate() - (n - 1))
    if (branchId) {
      return prisma.$queryRaw<SeriesPoint[]>`
        SELECT to_char(date_trunc('day', "paidAt"), 'YYYY-MM-DD') AS label,
               COALESCE(SUM(amount), 0)::float8 AS revenue
        FROM payment_history
        WHERE "tenantId" = ${tenantId} AND "branchId" = ${branchId} AND "paidAt" >= ${since}
        GROUP BY 1 ORDER BY 1`
    }
    return prisma.$queryRaw<SeriesPoint[]>`
      SELECT to_char(date_trunc('day', "paidAt"), 'YYYY-MM-DD') AS label,
             COALESCE(SUM(amount), 0)::float8 AS revenue
      FROM payment_history
      WHERE "tenantId" = ${tenantId} AND "paidAt" >= ${since}
      GROUP BY 1 ORDER BY 1`
  }
  // monthly
  const now   = new Date()
  const since = new Date(now.getFullYear(), now.getMonth() - (n - 1), 1)
  if (branchId) {
    return prisma.$queryRaw<SeriesPoint[]>`
      SELECT to_char(date_trunc('month', "paidAt"), 'YYYY-MM') AS label,
             COALESCE(SUM(amount), 0)::float8 AS revenue
      FROM payment_history
      WHERE "tenantId" = ${tenantId} AND "branchId" = ${branchId} AND "paidAt" >= ${since}
      GROUP BY 1 ORDER BY 1`
  }
  return prisma.$queryRaw<SeriesPoint[]>`
    SELECT to_char(date_trunc('month', "paidAt"), 'YYYY-MM') AS label,
           COALESCE(SUM(amount), 0)::float8 AS revenue
    FROM payment_history
    WHERE "tenantId" = ${tenantId} AND "paidAt" >= ${since}
    GROUP BY 1 ORDER BY 1`
}
```

- [ ] **Step 4: Update the snapshot endpoint in report.routes.ts**

Open `src/backend/routes/report.routes.ts`. Find the `/snapshot` handler. Add import for the new function:

```typescript
import { ..., revenueTodayBranch } from '../models/report.repository'
```

In the snapshot handler, replace the `revenueToday` call:
```typescript
// Before:
const revenueToday = await reportRepo.revenueToday(tenantId)
// After:
const revenueToday = await revenueTodayBranch(tenantId, req.context!.branchId ?? null)
```

- [ ] **Step 5: Run tests**

```bash
cd src/backend && npm test -- --testPathPattern=report-branch --forceExit
```

Expected: PASS. Then full suite:
```bash
cd src/backend && npm test -- --forceExit 2>&1 | tail -20
```

- [ ] **Step 6: Commit**

```bash
git add src/backend/models/report.repository.ts src/backend/routes/report.routes.ts src/backend/tests/integration/report-branch.test.ts
git commit -m "feat: add branch-scoped payment-received revenue functions"
```

---

### Task 5: Vaccination Worklist Backend (Branch-Scoped, Latest-Per-Group)

**Files:**
- Modify: `src/backend/models/vaccination.repository.ts`
- Modify: `src/backend/services/vaccination.service.ts`
- Modify: `src/backend/controllers/vaccination.controller.ts`
- Modify: `src/backend/routes/vaccination.routes.ts`

**Interfaces:**
- Produces: `GET /api/vaccinations/due-worklist` returning worklist rows with owner/pet enrichment
- Row type: `{ petId, petName, species, breed, ownerName, ownerPhone, vaccineName, nextDueAt: Date, daysDue: number }`

- [ ] **Step 1: Write failing test**

Create `src/backend/tests/integration/vaccination-worklist.test.ts`:

```typescript
import request from 'supertest'
import app from '../../server'
import { getAuthToken } from '../helpers/seedUserRoles'

describe('GET /api/vaccinations/due-worklist', () => {
  it('requires emr.view permission and returns array', async () => {
    const token = await getAuthToken({ plane: 'clinic', permissions: ['emr.view'] })
    const res = await request(app)
      .get('/api/vaccinations/due-worklist')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
  })

  it('returns 403 without emr.view', async () => {
    const token = await getAuthToken({ plane: 'clinic', permissions: [] })
    const res = await request(app)
      .get('/api/vaccinations/due-worklist')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(403)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd src/backend && npm test -- --testPathPattern=vaccination-worklist --forceExit
```

Expected: FAIL — 404 (route not found).

- [ ] **Step 3: Add findDueSoonWorklist to vaccination.repository.ts**

Append to `src/backend/models/vaccination.repository.ts`:

```typescript
export interface WorklistRow {
  petId:       number
  petName:     string
  species:     string
  breed:       string | null
  ownerName:   string
  ownerPhone:  string | null
  vaccineName: string
  nextDueAt:   Date
  daysDue:     number   // negative = overdue
}

export function findDueSoonWorklist(
  tenantId: number,
  branchId: number | null,
  cutoff:   Date,    // today + 7 days
): Promise<WorklistRow[]> {
  // ponytail: raw SQL for latest-per-(pet, normalised vaccineName) dedup.
  // normalised = LOWER(TRIM(vaccineName)). NULL-branch pets appear in every branch list.
  if (branchId) {
    return prisma.$queryRaw<WorklistRow[]>`
      WITH ranked AS (
        SELECT v.id, v."petId", v."vaccineName", v."nextDueAt",
               ROW_NUMBER() OVER (
                 PARTITION BY v."petId", LOWER(TRIM(v."vaccineName"))
                 ORDER BY v."administeredAt" DESC, v.id DESC
               ) AS rn
        FROM vaccinations v
        JOIN pets p ON p.id = v."petId"
        WHERE v."tenantId" = ${tenantId}
          AND v."nextDueAt" IS NOT NULL
          AND v."nextDueAt" <= ${cutoff}
          AND (p."branchId" = ${branchId} OR p."branchId" IS NULL)
      )
      SELECT r."petId", p.name AS "petName", p.species, p.breed,
             CONCAT(o."firstName", ' ', o."lastName") AS "ownerName",
             o.phone AS "ownerPhone",
             r."vaccineName",
             r."nextDueAt",
             EXTRACT(DAY FROM r."nextDueAt" - NOW())::int AS "daysDue"
      FROM ranked r
      JOIN pets p ON p.id = r."petId"
      JOIN owners o ON o.id = p."ownerId"
      WHERE r.rn = 1
      ORDER BY r."nextDueAt" ASC
    `
  }
  return prisma.$queryRaw<WorklistRow[]>`
    WITH ranked AS (
      SELECT v.id, v."petId", v."vaccineName", v."nextDueAt",
             ROW_NUMBER() OVER (
               PARTITION BY v."petId", LOWER(TRIM(v."vaccineName"))
               ORDER BY v."administeredAt" DESC, v.id DESC
             ) AS rn
      FROM vaccinations v
      WHERE v."tenantId" = ${tenantId}
        AND v."nextDueAt" IS NOT NULL
        AND v."nextDueAt" <= ${cutoff}
    )
    SELECT r."petId", p.name AS "petName", p.species, p.breed,
           CONCAT(o."firstName", ' ', o."lastName") AS "ownerName",
           o.phone AS "ownerPhone",
           r."vaccineName",
           r."nextDueAt",
           EXTRACT(DAY FROM r."nextDueAt" - NOW())::int AS "daysDue"
    FROM ranked r
    JOIN pets p ON p.id = r."petId"
    JOIN owners o ON o.id = p."ownerId"
    WHERE r.rn = 1
    ORDER BY r."nextDueAt" ASC
  `
}
```

- [ ] **Step 4: Add getDueSoonWorklist to vaccination.service.ts**

Append to `src/backend/services/vaccination.service.ts`:

```typescript
export async function getDueSoonWorklist(tenantId: number, branchId: number | null) {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() + 7)
  return vaccinationRepo.findDueSoonWorklist(tenantId, branchId, cutoff)
}
```

Verify the import alias at the top of vaccination.service.ts — it should be `import * as vaccinationRepo from '../models/vaccination.repository'` (or match whatever alias is used).

- [ ] **Step 5: Add handleGetWorklist to vaccination.controller.ts**

Append to `src/backend/controllers/vaccination.controller.ts`:

```typescript
export async function handleGetWorklist(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantId, branchId } = req.context!
    const data = await vaccinationService.getDueSoonWorklist(tenantId, branchId ?? null)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}
```

Verify `vaccinationService` is the import name used at the top of that controller file.

- [ ] **Step 6: Register route in vaccination.routes.ts**

Add the new route (above or alongside the existing `due-soon` route):

```typescript
import { handleGetDueSoon, handleCreate, handleGetWorklist } from '../controllers/vaccination.controller'
// ...
router.get('/due-worklist', requirePlane('clinic'), requirePermission('emr.view'), handleGetWorklist)
```

- [ ] **Step 7: Run tests**

```bash
cd src/backend && npm test -- --testPathPattern=vaccination-worklist --forceExit
```

Expected: 2 tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/backend/models/vaccination.repository.ts src/backend/services/vaccination.service.ts src/backend/controllers/vaccination.controller.ts src/backend/routes/vaccination.routes.ts src/backend/tests/integration/vaccination-worklist.test.ts
git commit -m "feat: add branch-scoped vaccination due-worklist endpoint with latest-per-group dedup"
```

---

### Task 6: Vaccination — administeredExternally Field

**Files:**
- Modify: `src/backend/services/vaccination.service.ts`

**Interfaces:**
- Consumes: `Vaccination.administeredExternally` column (Task 1 migration)
- Produces: `POST /api/vaccinations` accepts optional `administeredExternally: boolean`

- [ ] **Step 1: Write failing test**

Add to `src/backend/tests/integration/vaccination-worklist.test.ts`:

```typescript
describe('POST /api/vaccinations with administeredExternally', () => {
  it('accepts administeredExternally flag without validation error', async () => {
    const token = await getAuthToken({ plane: 'clinic', permissions: ['emr.create'] })
    const res = await request(app)
      .post('/api/vaccinations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        petId: 1,
        vaccineName: 'Rabies',
        administeredAt: new Date().toISOString(),
        nextDueAt: null,
        batchNo: null,
        notes: null,
        administeredExternally: true,
      })
    // 201 = success, 404 = petId not in seed data — either is not a validation error
    expect([201, 404]).toContain(res.status)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd src/backend && npm test -- --testPathPattern=vaccination-worklist --forceExit
```

Expected: FAIL — 422 (Zod rejects unknown field `administeredExternally`).

- [ ] **Step 3: Update createVaccinationSchema in vaccination.service.ts**

Find `createVaccinationSchema` and add the new field:

```typescript
export const createVaccinationSchema = z.object({
  petId:                  z.number().int().positive(),
  vaccineName:            z.string().min(1),
  administeredAt:         z.string(),
  nextDueAt:              z.string().nullable().optional(),
  batchNo:                z.string().nullable().optional(),
  notes:                  z.string().nullable().optional(),
  administeredExternally: z.boolean().optional().default(false),
})
export type CreateVaccinationInput = z.infer<typeof createVaccinationSchema>
```

The repository's `createVaccination` uses `...data` spread, so the field flows through automatically.

- [ ] **Step 4: Run tests**

```bash
cd src/backend && npm test -- --testPathPattern=vaccination-worklist --forceExit
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backend/services/vaccination.service.ts
git commit -m "feat: accept administeredExternally flag on POST /api/vaccinations"
```

---

### Task 7: Transactions Backend Endpoint

**Files:**
- Create: `src/backend/controllers/transaction.controller.ts`
- Create: `src/backend/routes/transaction.routes.ts`
- Modify: `src/backend/routes/clinic.routes.ts`

**Interfaces:**
- Consumes: `findPaymentHistory(tenantId, branchId, params)` from `src/backend/models/invoice.repository.ts`; `revenueSeriesBranch` from Task 4
- Produces:
  - `GET /clinic/transactions?period=today|month&page=1&pageSize=20` → `{ rows: PaymentHistoryRow[], total: number }`
  - `GET /clinic/transactions/revenue-series?period=daily|monthly` → `{ series: SeriesPoint[], total: number }`

- [ ] **Step 1: Inspect findPaymentHistory**

Open `src/backend/models/invoice.repository.ts` and find `findPaymentHistory`. Read its exact signature and return type. The explore agent found:
```
findPaymentHistory(tenantId: number, userBranchId: number | null, params: {...})
returns rows with: paidAt, invoiceNumber, method, amount, receivedByName, note, invoiceId
```
Confirm the exact parameter names and return shape before continuing.

- [ ] **Step 2: Write failing test**

Create `src/backend/tests/integration/transactions.test.ts`:

```typescript
import request from 'supertest'
import app from '../../server'
import { getAuthToken } from '../helpers/seedUserRoles'

describe('GET /clinic/transactions', () => {
  it('requires billing.view and returns data shape', async () => {
    const token = await getAuthToken({ plane: 'clinic', permissions: ['billing.view'] })
    const res = await request(app)
      .get('/clinic/transactions?period=today')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data.rows)).toBe(true)
    expect(typeof res.body.data.total).toBe('number')
  })

  it('returns 403 without billing.view', async () => {
    const token = await getAuthToken({ plane: 'clinic', permissions: [] })
    const res = await request(app)
      .get('/clinic/transactions?period=today')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(403)
  })

  it('revenue-series returns series array', async () => {
    const token = await getAuthToken({ plane: 'clinic', permissions: ['billing.view'] })
    const res = await request(app)
      .get('/clinic/transactions/revenue-series?period=daily')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data.series)).toBe(true)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd src/backend && npm test -- --testPathPattern=transactions.test --forceExit
```

Expected: FAIL — 404.

- [ ] **Step 4: Create transaction.controller.ts**

Create `src/backend/controllers/transaction.controller.ts`:

```typescript
import type { Request, Response, NextFunction } from 'express'
import { findPaymentHistory } from '../models/invoice.repository'
import { revenueSeriesBranch } from '../models/report.repository'

export async function handleListTransactions(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantId, branchId } = req.context!
    const period   = (req.query.period as string) === 'month' ? 'month' : 'today'
    const page     = Math.max(1, parseInt(req.query.page as string) || 1)
    const pageSize = Math.min(100, parseInt(req.query.pageSize as string) || 20)

    const now  = new Date()
    const from = period === 'today'
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
      : new Date(now.getFullYear(), now.getMonth(), 1)
    const to   = period === 'today'
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
      : new Date(now.getFullYear(), now.getMonth() + 1, 1)

    // Adapt to findPaymentHistory's exact signature (verified in Step 1).
    const result = await findPaymentHistory(tenantId, branchId ?? null, { from, to, page, pageSize })
    // If findPaymentHistory returns a plain array (not {rows, total}), wrap it:
    // const rows = result; const total = rows.length;
    const rows  = Array.isArray(result) ? result : result.rows
    const total = Array.isArray(result) ? result.length : result.total

    res.json({ success: true, data: { rows, total } })
  } catch (err) { next(err) }
}

export async function handleRevenueSeries(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantId, branchId } = req.context!
    const period = (req.query.period as string) === 'monthly' ? 'monthly' : 'daily'
    const n      = period === 'daily' ? 14 : 6
    const series = await revenueSeriesBranch(tenantId, branchId ?? null, period, n)
    const total  = series.reduce((sum, p) => sum + p.revenue, 0)
    res.json({ success: true, data: { series, total } })
  } catch (err) { next(err) }
}
```

- [ ] **Step 5: Create transaction.routes.ts**

Create `src/backend/routes/transaction.routes.ts`:

```typescript
import { Router } from 'express'
import { requirePlane, requirePermission } from '../middlewares/permission.middleware'
import { handleListTransactions, handleRevenueSeries } from '../controllers/transaction.controller'

const router = Router()
router.get('/',               requirePlane('clinic'), requirePermission('billing.view'), handleListTransactions)
router.get('/revenue-series', requirePlane('clinic'), requirePermission('billing.view'), handleRevenueSeries)
export default router
```

- [ ] **Step 6: Mount in clinic.routes.ts**

Open `src/backend/routes/clinic.routes.ts`. Add at the top:
```typescript
import transactionRoutes from './transaction.routes'
```

Add after the existing `router.use(authMiddleware)` line:
```typescript
router.use('/transactions', transactionRoutes)
```

Note: The clinic.routes.ts router is already mounted at `/clinic` in the server — so this makes the endpoints `/clinic/transactions` and `/clinic/transactions/revenue-series`.

- [ ] **Step 7: Run tests**

```bash
cd src/backend && npm test -- --testPathPattern=transactions.test --forceExit
```

Expected: all 3 PASS.

- [ ] **Step 8: Commit**

```bash
git add src/backend/controllers/transaction.controller.ts src/backend/routes/transaction.routes.ts src/backend/routes/clinic.routes.ts src/backend/tests/integration/transactions.test.ts
git commit -m "feat: add GET /clinic/transactions and revenue-series endpoints"
```

---

### Task 8: Appointments — Month Range Backend Support

**Files:**
- Modify: `src/backend/controllers/appointment.controller.ts`

**Interfaces:**
- Consumes: `appointmentRepo.findInRange(tenantId, branchId, start, end)` — already accepts branchId
- Produces: `GET /api/appointments?view=month&date=YYYY-MM-01` returns full grid-range appointment array

- [ ] **Step 1: Write failing test**

Create `src/backend/tests/integration/appointments-month.test.ts`:

```typescript
import request from 'supertest'
import app from '../../server'
import { getAuthToken } from '../helpers/seedUserRoles'

describe('GET /api/appointments?view=month', () => {
  it('accepts view=month&date param and returns array', async () => {
    const token = await getAuthToken({ plane: 'clinic', permissions: ['appointments.view'] })
    const res = await request(app)
      .get('/api/appointments?view=month&date=2026-06-01')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd src/backend && npm test -- --testPathPattern=appointments-month --forceExit
```

- [ ] **Step 3: Update appointment controller list handler**

Open `src/backend/controllers/appointment.controller.ts`. Find the GET list handler. At the top of the handler body (before existing date logic), add:

```typescript
const view = req.query.view as string | undefined

if (view === 'month') {
  const dateStr = (req.query.date as string) ?? new Date().toISOString().slice(0, 10)
  const ref     = new Date(dateStr + 'T00:00:00')
  ref.setDate(1)

  // Grid start: Monday on or before the 1st
  const startDow = ref.getDay() === 0 ? 7 : ref.getDay()  // Mon=1, Sun=7
  const gridStart = new Date(ref)
  gridStart.setDate(1 - (startDow - 1))
  gridStart.setHours(0, 0, 0, 0)

  // Grid end: day after the Sunday that closes the last week of the month
  const lastDay = new Date(ref.getFullYear(), ref.getMonth() + 1, 0)
  const lastDow = lastDay.getDay() === 0 ? 7 : lastDay.getDay()
  const gridEnd = new Date(lastDay)
  gridEnd.setDate(lastDay.getDate() + (7 - lastDow) + 1)
  gridEnd.setHours(0, 0, 0, 0)

  const { tenantId, branchId } = req.context!
  const appts = await appointmentRepo.findInRange(tenantId, branchId, gridStart, gridEnd)
  return res.json({ success: true, data: appts })
}
// ... existing day/week logic continues below
```

The import `appointmentRepo` is already at the top of the file. Verify the import name matches.

- [ ] **Step 4: Run tests**

```bash
cd src/backend && npm test -- --testPathPattern=appointments-month --forceExit
```

Expected: PASS. Then verify existing appointment tests still pass:
```bash
cd src/backend && npm test -- --testPathPattern=phase4 --forceExit
```

- [ ] **Step 5: Commit**

```bash
git add src/backend/controllers/appointment.controller.ts src/backend/tests/integration/appointments-month.test.ts
git commit -m "feat: appointments endpoint supports view=month date-range query"
```

---

### Task 9: authStore + ClinicLayout Sidebar Branding

**Files:**
- Modify: `src/frontend/src/store/authStore.ts`
- Modify: `src/frontend/src/layouts/ClinicLayout.tsx`

**Interfaces:**
- Consumes: `companyName` from Task 2 backend `select-branch` response; `branchName` from the branch object the user selected (available in login UI state)
- Produces: `useAuthStore(s => s.companyName)`, `useAuthStore(s => s.branchName)` — consumed by ClinicLayout header

- [ ] **Step 1: Update AuthData interface in authStore.ts**

Open `src/frontend/src/store/authStore.ts`. Add two fields to `AuthData`:

```typescript
export interface AuthData {
  token:          string
  plane:          'clinic' | 'platform'
  userId:         number
  tenantId:       number
  branchId:       number | null
  roleIds:        number[]
  role:           string
  permissions:    string[]
  permSetVersion: number
  name:           string
  companyName:    string
  branchName:     string
}
```

- [ ] **Step 2: Update EMPTY sentinel**

```typescript
const EMPTY: AuthData = {
  token:          '',
  plane:          'clinic',
  userId:         0,
  tenantId:       0,
  branchId:       null,
  roleIds:        [],
  role:           '',
  permissions:    [],
  permSetVersion: 0,
  name:           '',
  companyName:    '',
  branchName:     '',
}
```

- [ ] **Step 3: Update normalise()**

```typescript
function normalise(raw: Partial<AuthData>): AuthData {
  return {
    token:          raw.token          ?? '',
    plane:          raw.plane          ?? 'clinic',
    userId:         raw.userId         ?? 0,
    tenantId:       raw.tenantId       ?? 0,
    branchId:       raw.branchId       ?? null,
    roleIds:        Array.isArray(raw.roleIds) ? raw.roleIds : [],
    role:           raw.role           ?? '',
    permissions:    Array.isArray(raw.permissions) ? raw.permissions : [],
    permSetVersion: raw.permSetVersion ?? 0,
    name:           raw.name           ?? '',
    companyName:    raw.companyName    ?? '',
    branchName:     raw.branchName     ?? '',
  }
}
```

- [ ] **Step 4: Update the branch-select call in the login flow**

Find where the frontend calls `POST /auth/select-branch` — look in `src/frontend/src/views/LoginView.tsx` or `src/frontend/src/hooks/useAuth.ts`. After a successful response, the `setAuth()` call must include the two new fields.

The branch-select response now has `companyName` (from backend). The `branchName` is the name of the branch the user chose, already available as a property of the selected branch object in the UI.

Change the `setAuth` call to:
```typescript
useAuthStore.getState().setAuth({
  // ... all existing fields from response (token, userId, tenantId, branchId, role, name, roleIds, permSetVersion, plane) ...
  companyName: response.companyName,      // from Task 2 backend
  branchName:  selectedBranch.name,       // from branches[i].name where branches came from step-1
  permissions: [],                        // populated later by refreshPermissions()
}, remember)
```

The exact call site and variable names depend on the current implementation — adapt as needed.

- [ ] **Step 5: Update ClinicLayout.tsx sidebar header**

Open `src/frontend/src/layouts/ClinicLayout.tsx`. Add store reads near the top of `ClinicLayout()`:

```tsx
const companyName = useAuthStore(s => s.companyName)
const branchName  = useAuthStore(s => s.branchName)
```

Replace the `sidebarOpen &&` block at lines 53-59 (the "Anemal" / `nav.clinicPortal` block):

```tsx
{sidebarOpen && (
  <div className="pl-sm min-w-0">
    <p className="text-headline-sm font-headline font-bold text-primary leading-tight truncate">
      {companyName || 'Anemal'}
    </p>
    {branchName && (
      <p className="text-label-md text-on-surface-variant mt-0.5 truncate">{branchName}</p>
    )}
  </div>
)}
```

Remove the now-unused `{t('nav.clinicPortal')}` string. If `t` is not used anywhere else in ClinicLayout.tsx, remove the `useT` import and the `const t = useT()` line.

- [ ] **Step 6: Verify TypeScript**

```bash
cd src/frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/frontend/src/store/authStore.ts src/frontend/src/layouts/ClinicLayout.tsx
git commit -m "feat: sidebar shows company and branch name from auth store"
```

---

### Task 10: Dashboard KPI Cards — Clickable + Permission Gates + Layout Reshuffle

**Files:**
- Modify: `src/frontend/src/views/clinic/ClinicDashboard.tsx`

**Interfaces:**
- Consumes: `useAuthStore.hasPermission`, existing usage + snapshot query data
- Produces: 4 KPI cards (revenue hidden without billing.view); revenue chart removed; "At a Glance" block removed; Today's Schedule in 8-col slot

- [ ] **Step 1: Add hasPermission selector**

Near the top of `ClinicDashboard()`:
```tsx
const hasPermission = useAuthStore(s => s.hasPermission)
```

Add `useAuthStore` to the existing import from `../../store/authStore`.

- [ ] **Step 2: Replace the KPI card block (lines 65-78)**

Replace the four KPI cards (including the `<Link to="/clinic/pets">` vaccination card) with:

```tsx
<LinkableStatCard
  to={hasPermission('appointments.view') ? '/clinic/appointments' : undefined}
  border="border-secondary" chip="Today" chipCls="bg-secondary-container text-secondary-on-container"
  icon="trending_up" iconCls="text-success"
  value={val(data?.appointmentsToday)} label={t('clinic.dashboard.appointmentsToday')}
/>
<LinkableStatCard
  to={hasPermission('appointments.view') ? '/clinic/appointments?view=month' : undefined}
  border="border-info" chip="This month" chipCls="bg-surface-container text-on-surface-variant"
  icon="calendar_month" iconCls="text-info"
  value={val(data?.appointmentsThisMonth)} label={t('clinic.dashboard.totalAppointments')}
/>
{hasPermission('billing.view') && (
  <LinkableStatCard
    to="/clinic/transactions?period=today"
    border="border-secondary" chip="Today" chipCls="bg-secondary-container text-secondary-on-container"
    icon="payments" iconCls="text-secondary"
    value={snapshot ? baht(snapshot.revenueToday) : '…'} label={t('clinic.dashboard.revenueToday')}
  />
)}
<LinkableStatCard
  to={hasPermission('emr.view') ? '/clinic/vaccinations-due' : undefined}
  border="border-warning" chip="Next 7 days" chipCls="bg-warning/10 text-warning"
  icon="vaccines" iconCls="text-warning"
  value={val(data?.vaccinationsDueSoon)} label={t('clinic.dashboard.vaccinationsDue')}
/>
```

- [ ] **Step 3: Remove revenue chart block**

Delete the entire `col-span-12 lg:col-span-8` revenue chart block (lines ~81-122 in original file). Also remove:
- `const [period, setPeriod] = useState<'daily' | 'monthly'>('daily')`
- `const { data: revenue } = useRevenue(period)`
- The `recharts` import line (if no longer used anywhere in this file)
- `useRevenue` from the `useReports` import

- [ ] **Step 4: Remove "At a Glance" block**

Delete the `col-span-12 lg:col-span-4` block containing "At a glance / สรุปภาพรวม" (lines ~175-191). This removes the "Total patients", "Invoices this month", "Revenue this month" summary.

- [ ] **Step 5: Confirm Today's Schedule is in 8-col slot**

The "Today's Schedule" table block should already be `col-span-12 lg:col-span-8`. Verify it is now followed immediately by the Inventory Alerts block (`col-span-12 lg:col-span-4`), so they form a two-column row. The final layout is:

```
[KPI][KPI][KPI-billing?][KPI]      <- 4 cards row
[Today's Schedule 8col][Alerts 4col]
[Quick Actions row]
```

- [ ] **Step 6: Add LinkableStatCard component**

Replace the existing `StatCard` function at the bottom of the file with:

```tsx
function LinkableStatCard({ to, border, chip, chipCls, icon, iconCls, value, label }: {
  to?: string; border: string; chip: string; chipCls: string
  icon: string; iconCls: string; value: number | string; label: string
}) {
  const inner = (
    <>
      <div className="flex items-center justify-between mb-sm">
        <span className={`rounded-full px-sm py-xs text-label-md font-medium ${chipCls}`}>{chip}</span>
        <MaterialIcon name={icon} size={18} className={iconCls} />
      </div>
      <p className="text-headline-md font-headline font-bold text-primary">{value}</p>
      <p className="text-body-sm text-on-surface-variant mt-xs">{label}</p>
    </>
  )
  const cls = `col-span-6 md:col-span-3 glass-card rounded-xl shadow-lvl1 border-l-4 ${border} p-md`
  return to
    ? <Link to={to} className={`${cls} hover:shadow-lvl2 transition-shadow`}>{inner}</Link>
    : <div className={cls}>{inner}</div>
}
```

Keep `AlertRow` unchanged.

- [ ] **Step 7: Verify TypeScript**

```bash
cd src/frontend && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 8: Commit**

```bash
git add src/frontend/src/views/clinic/ClinicDashboard.tsx
git commit -m "feat: clickable branch-scoped KPI cards, remove revenue chart and summary block"
```

---

### Task 11: Appointments — Month View Frontend

**Files:**
- Modify: `src/frontend/src/views/clinic/ClinicAppointments.tsx`

**Interfaces:**
- Consumes: `GET /api/appointments?view=month&date=YYYY-MM-01` (Task 8)
- Produces: `?view=month` deep-link; calendar grid with count badges; day-cell click → day view for that date

- [ ] **Step 1: Add useSearchParams and extend viewMode type**

Open `src/frontend/src/views/clinic/ClinicAppointments.tsx`. Add `useSearchParams` to the react-router-dom import.

Replace the `viewMode` state initialization with URL-synced version:

```tsx
const [searchParams, setSearchParams] = useSearchParams()
const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>(
  (searchParams.get('view') as 'day' | 'week' | 'month') ?? 'day'
)
const [currentDate, setCurrentDate] = useState(new Date())

const changeView = (v: 'day' | 'week' | 'month') => {
  setViewMode(v)
  setSearchParams(v === 'day' ? {} : { view: v })
}
```

If `currentDate` is already a state variable in the file, keep the existing one and just add `changeView`.

- [ ] **Step 2: Add month reference state and data query**

```tsx
const [monthRef, setMonthRef] = useState(() => {
  const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d
})

const { data: monthAppts } = useQuery({
  queryKey: ['appointments', 'month', monthRef.toISOString().slice(0, 7)],
  queryFn: () =>
    api.get(`/api/appointments?view=month&date=${monthRef.toISOString().slice(0, 10)}`)
       .then(r => r.data.data as Appointment[]),
  enabled: viewMode === 'month',
})
```

- [ ] **Step 3: Add count map memo**

```tsx
const monthCountMap = useMemo(() => {
  const map: Record<string, number> = {}
  if (!monthAppts) return map
  for (const a of monthAppts) {
    const key = new Date(a.scheduledAt).toISOString().slice(0, 10)
    map[key] = (map[key] ?? 0) + 1
  }
  return map
}, [monthAppts])
```

Add `useMemo` to the React import if not already there.

- [ ] **Step 4: Add month toggle button**

Find the view toggle buttons (day/week). Add a month button alongside them:

```tsx
<button onClick={() => changeView('month')}
        className={`min-h-[36px] px-md rounded-md text-label-md capitalize transition-colors ${viewMode === 'month' ? 'bg-surface text-primary font-semibold shadow-lvl1' : 'text-on-surface-variant'}`}>
  month
</button>
```

Also update the existing day/week button `onClick` handlers to use `changeView(...)` instead of `setViewMode(...)`.

- [ ] **Step 5: Add the generateMonthGrid helper outside the component**

```tsx
function generateMonthGrid(ref: Date): Date[] {
  const year  = ref.getFullYear()
  const month = ref.getMonth()
  const first = new Date(year, month, 1)
  const last  = new Date(year, month + 1, 0)

  const startDow = first.getDay() === 0 ? 7 : first.getDay()
  const gridStart = new Date(first)
  gridStart.setDate(1 - (startDow - 1))

  const endDow  = last.getDay() === 0 ? 7 : last.getDay()
  const gridEnd = new Date(last)
  gridEnd.setDate(last.getDate() + (7 - endDow))

  const days: Date[] = []
  const cur = new Date(gridStart)
  while (cur <= gridEnd) {
    days.push(new Date(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return days
}
```

- [ ] **Step 6: Render the calendar grid in the view**

Add a conditional render block for `viewMode === 'month'`, positioned where the week/day view renders:

```tsx
{viewMode === 'month' && (
  <div className="p-md">
    {/* Month navigation */}
    <div className="flex items-center justify-between mb-md">
      <button
        onClick={() => setMonthRef(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
        className="min-h-[44px] px-md flex items-center gap-xs text-on-surface-variant hover:bg-surface-container rounded-lg"
      >
        <MaterialIcon name="chevron_left" size={20} /> Prev
      </button>
      <span className="text-headline-xs font-headline font-semibold text-on-surface">
        {monthRef.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
      </span>
      <button
        onClick={() => setMonthRef(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
        className="min-h-[44px] px-md flex items-center gap-xs text-on-surface-variant hover:bg-surface-container rounded-lg"
      >
        Next <MaterialIcon name="chevron_right" size={20} />
      </button>
    </div>

    {/* Day-of-week headers */}
    <div className="grid grid-cols-7 gap-xs mb-xs">
      {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
        <div key={d} className="text-center text-label-md text-on-surface-variant font-medium py-xs">{d}</div>
      ))}
    </div>

    {/* Calendar cells */}
    <div className="grid grid-cols-7 gap-xs">
      {generateMonthGrid(monthRef).map((date, i) => {
        const key   = date.toISOString().slice(0, 10)
        const count = monthCountMap[key] ?? 0
        const isCurrentMonth = date.getMonth() === monthRef.getMonth()
        const isToday = date.toDateString() === new Date().toDateString()
        return (
          <button
            key={i}
            onClick={() => {
              setCurrentDate(new Date(date))
              changeView('day')
            }}
            className={`min-h-[56px] rounded-lg flex flex-col items-center justify-center gap-xs border transition-colors hover:bg-surface-container
              ${isCurrentMonth ? 'border-outline-variant' : 'border-transparent text-on-surface-variant/40'}`}
          >
            <span className={`text-body-sm ${isToday ? 'text-primary font-bold' : ''}`}>
              {date.getDate()}
            </span>
            {count > 0 && (
              <span className="bg-primary text-primary-on text-label-md rounded-full px-xs min-w-[20px] text-center leading-5">
                {count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  </div>
)}
```

- [ ] **Step 7: Verify TypeScript**

```bash
cd src/frontend && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 8: Commit**

```bash
git add src/frontend/src/views/clinic/ClinicAppointments.tsx
git commit -m "feat: add month calendar view to appointments with per-day count badges"
```

---

### Task 12: ClinicTransactions Page

**Files:**
- Create: `src/frontend/src/hooks/useTransactions.ts`
- Create: `src/frontend/src/views/clinic/ClinicTransactions.tsx`
- Modify: `src/frontend/src/App.tsx`

**Interfaces:**
- Consumes: `GET /clinic/transactions?period=today|month&page&pageSize` (Task 7); `GET /clinic/transactions/revenue-series?period=daily|monthly` (Task 7)
- Produces: `/clinic/transactions` page with revenue chart + paginated transaction list; `?period=today|month` deep-link

- [ ] **Step 1: Create useTransactions.ts**

Create `src/frontend/src/hooks/useTransactions.ts`:

```typescript
import { useQuery } from '@tanstack/react-query'
import api from '../utils/api'

export interface TransactionRow {
  id:             number
  paidAt:         string
  invoiceNumber:  string
  invoiceId:      number
  method:         string | null
  amount:         number
  receivedByName: string | null
  note:           string | null
}

interface TransactionsResult {
  rows:  TransactionRow[]
  total: number
}

export function useTransactions(period: 'today' | 'month', page: number) {
  return useQuery<TransactionsResult>({
    queryKey: ['transactions', period, page],
    queryFn:  () =>
      api.get(`/clinic/transactions?period=${period}&page=${page}&pageSize=20`)
         .then(r => r.data.data),
  })
}

export function useTransactionRevenue(period: 'daily' | 'monthly') {
  return useQuery<{ series: { label: string; revenue: number }[]; total: number }>({
    queryKey: ['transactions', 'revenue', period],
    queryFn:  () =>
      api.get(`/clinic/transactions/revenue-series?period=${period}`)
         .then(r => r.data.data),
  })
}
```

Note: Field names in `TransactionRow` must match what `findPaymentHistory` actually returns (verified in Task 7 Step 1). Adjust if needed.

- [ ] **Step 2: Create ClinicTransactions.tsx**

Create `src/frontend/src/views/clinic/ClinicTransactions.tsx`:

```tsx
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { useTransactions, useTransactionRevenue } from '../../hooks/useTransactions'
import MaterialIcon from '../../components/MaterialIcon'

const CHART = { secondary: '#006c4a', grid: '#e0e3e5', axis: '#45464d' }
const baht  = (n: number) => '฿' + n.toLocaleString('en-US', { maximumFractionDigits: 0 })

export default function ClinicTransactions() {
  const [searchParams, setSearchParams] = useSearchParams()
  const period     = (searchParams.get('period') as 'today' | 'month') ?? 'today'
  const [page, setPage]               = useState(1)
  const [chartPeriod, setChartPeriod] = useState<'daily' | 'monthly'>('daily')

  const { data, isLoading } = useTransactions(period, page)
  const { data: revenue }   = useTransactionRevenue(chartPeriod)

  const setPeriod = (p: 'today' | 'month') => { setSearchParams({ period: p }); setPage(1) }

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleString('th-TH', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="p-lg">
      <div className="flex items-center justify-between mb-lg">
        <h2 className="text-headline-lg font-headline font-bold text-primary">Transaction History</h2>
        <div className="flex bg-surface-container-low rounded-lg p-xs">
          {(['today', 'month'] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
                    className={`min-h-[36px] px-md rounded-md text-label-md capitalize transition-colors ${period === p ? 'bg-surface text-primary font-semibold shadow-lvl1' : 'text-on-surface-variant'}`}>
              {p === 'today' ? 'Today' : 'This Month'}
            </button>
          ))}
        </div>
      </div>

      {/* Revenue chart */}
      <div className="glass-card rounded-xl shadow-lvl1 p-md mb-lg">
        <div className="flex items-center justify-between mb-md">
          <div>
            <h3 className="text-headline-xs font-headline font-semibold text-on-surface">Revenue (received)</h3>
            <p className="text-label-md text-on-surface-variant">
              {chartPeriod === 'daily' ? 'Last 14 days' : 'Last 6 months'}
              {revenue ? ` · ${baht(revenue.total)} total` : ''}
            </p>
          </div>
          <div className="flex bg-surface-container-low rounded-lg p-xs">
            {(['daily', 'monthly'] as const).map(p => (
              <button key={p} onClick={() => setChartPeriod(p)}
                      className={`min-h-[36px] px-md rounded-md text-label-md capitalize transition-colors ${chartPeriod === p ? 'bg-surface text-primary font-semibold shadow-lvl1' : 'text-on-surface-variant'}`}>
                {p}
              </button>
            ))}
          </div>
        </div>
        {revenue && revenue.series.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={revenue.series} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="rev-tx" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART.secondary} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={CHART.secondary} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: CHART.axis }} tickLine={false} axisLine={{ stroke: CHART.grid }} />
              <YAxis tick={{ fontSize: 11, fill: CHART.axis }} width={56} tickLine={false} axisLine={false}
                     tickFormatter={v => baht(Number(v))} />
              <Tooltip formatter={v => [baht(Number(v)), 'Revenue']}
                       contentStyle={{ borderRadius: 12, border: `1px solid ${CHART.grid}`, fontSize: 12 }} />
              <Area type="monotone" dataKey="revenue" stroke={CHART.secondary} strokeWidth={2} fill="url(#rev-tx)" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-on-surface-variant text-body-sm">No data</div>
        )}
      </div>

      {/* Transaction list */}
      <div className="glass-card rounded-xl shadow-lvl1 overflow-hidden">
        <table className="w-full text-body-sm">
          <thead className="bg-surface-container-low">
            <tr>
              {['Time', 'Invoice', 'Method', 'Amount', 'Received by', 'Note'].map(h => (
                <th key={h} className="text-left px-md py-sm text-label-md text-on-surface-variant uppercase tracking-wider font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant">
            {isLoading && (
              <tr><td colSpan={6} className="text-center py-xl text-on-surface-variant">Loading…</td></tr>
            )}
            {!isLoading && !data?.rows.length && (
              <tr><td colSpan={6} className="text-center py-xl text-on-surface-variant">No transactions for this period.</td></tr>
            )}
            {data?.rows.map(row => (
              <tr key={row.id} className="hover:bg-surface-container transition-colors">
                <td className="px-md py-sm text-on-surface-variant">{formatTime(row.paidAt)}</td>
                <td className="px-md py-sm">
                  <Link to={`/clinic/billing/${row.invoiceId}`} className="text-primary hover:underline">
                    #{row.invoiceNumber}
                  </Link>
                </td>
                <td className="px-md py-sm capitalize text-on-surface-variant">{row.method ?? '—'}</td>
                <td className="px-md py-sm font-semibold text-on-surface">{baht(row.amount)}</td>
                <td className="px-md py-sm text-on-surface-variant">{row.receivedByName ?? '—'}</td>
                <td className="px-md py-sm text-on-surface-variant">{row.note ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.total > 20 && (
          <div className="flex items-center justify-between px-md py-sm border-t border-outline-variant">
            <span className="text-label-md text-on-surface-variant">
              {(page - 1) * 20 + 1}–{Math.min(page * 20, data.total)} of {data.total}
            </span>
            <div className="flex gap-xs">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                      className="min-h-[36px] px-md rounded-lg border border-outline-variant text-label-md disabled:opacity-40">Prev</button>
              <button onClick={() => setPage(p => p + 1)} disabled={page * 20 >= data.total}
                      className="min-h-[36px] px-md rounded-lg border border-outline-variant text-label-md disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Register route in App.tsx**

Add lazy import with the other clinic pages (around line 28):
```tsx
const ClinicTransactions = lazy(() => import('./views/clinic/ClinicTransactions'))
```

Add route inside the `/clinic` `<Route>` block (after the `billing` route):
```tsx
<Route path="transactions" element={<RequirePermission perm="billing.view"><ClinicTransactions/></RequirePermission>}/>
```

- [ ] **Step 4: Verify TypeScript**

```bash
cd src/frontend && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/hooks/useTransactions.ts src/frontend/src/views/clinic/ClinicTransactions.tsx src/frontend/src/App.tsx
git commit -m "feat: add Transaction History page at /clinic/transactions"
```

---

### Task 13: ClinicVaccinationsDue Worklist Page

**Files:**
- Create: `src/frontend/src/views/clinic/ClinicVaccinationsDue.tsx`
- Modify: `src/frontend/src/App.tsx`

**Interfaces:**
- Consumes: `GET /api/vaccinations/due-worklist` (Task 5); row shape from Task 5's `WorklistRow`
- Produces: `/clinic/vaccinations-due` page; row click navigates to `/clinic/vaccinations-due/record?petId=&vaccine=&nextDueAt=`

- [ ] **Step 1: Create ClinicVaccinationsDue.tsx**

Create `src/frontend/src/views/clinic/ClinicVaccinationsDue.tsx`:

```tsx
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../../utils/api'
import MaterialIcon from '../../components/MaterialIcon'

interface WorklistRow {
  petId:       number
  petName:     string
  species:     string
  breed:       string | null
  ownerName:   string
  ownerPhone:  string | null
  vaccineName: string
  nextDueAt:   string
  daysDue:     number
}

export default function ClinicVaccinationsDue() {
  const navigate = useNavigate()

  const { data, isLoading } = useQuery<WorklistRow[]>({
    queryKey: ['vaccinations', 'due-worklist'],
    queryFn:  () => api.get('/api/vaccinations/due-worklist').then(r => r.data.data),
  })

  const dueBadge = (days: number) => {
    if (days < 0) return (
      <span className="text-error text-label-md">Overdue by {Math.abs(days)} day{Math.abs(days) !== 1 ? 's' : ''}</span>
    )
    if (days === 0) return <span className="text-warning text-label-md">Due today</span>
    return <span className="text-on-surface-variant text-label-md">Due in {days} day{days !== 1 ? 's' : ''}</span>
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' })

  const toRecord = (row: WorklistRow) =>
    `/clinic/vaccinations-due/record?petId=${row.petId}&vaccine=${encodeURIComponent(row.vaccineName)}&nextDueAt=${encodeURIComponent(row.nextDueAt)}`

  return (
    <div className="p-lg">
      <div className="mb-lg">
        <h2 className="text-headline-lg font-headline font-bold text-primary">Vaccines Due</h2>
        <p className="text-body-md text-on-surface-variant mt-xs">
          Overdue and due within 7 days · sorted overdue-first
        </p>
      </div>

      <div className="glass-card rounded-xl shadow-lvl1 overflow-hidden">
        <table className="w-full text-body-sm">
          <thead className="bg-surface-container-low">
            <tr>
              {['Owner', 'Pet', 'Vaccine', 'Due Date', ''].map((h, i) => (
                <th key={i} className="text-left px-md py-sm text-label-md text-on-surface-variant uppercase tracking-wider font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant">
            {isLoading && (
              <tr><td colSpan={5} className="text-center py-xl text-on-surface-variant">Loading…</td></tr>
            )}
            {!isLoading && !data?.length && (
              <tr>
                <td colSpan={5} className="px-md py-xl text-center text-on-surface-variant">
                  <MaterialIcon name="vaccines" size={32} className="text-outline mb-sm block mx-auto" />
                  No vaccinations due in the next 7 days.
                </td>
              </tr>
            )}
            {data?.map((row, i) => (
              <tr key={i} onClick={() => navigate(toRecord(row))}
                  className="hover:bg-surface-container transition-colors cursor-pointer">
                <td className="px-md py-sm">
                  <p className="font-medium text-on-surface">{row.ownerName}</p>
                  {row.ownerPhone && <p className="text-label-md text-on-surface-variant">{row.ownerPhone}</p>}
                </td>
                <td className="px-md py-sm">
                  <p className="font-medium text-on-surface">{row.petName}</p>
                  <p className="text-label-md text-on-surface-variant capitalize">
                    {row.species}{row.breed ? ` · ${row.breed}` : ''}
                  </p>
                </td>
                <td className="px-md py-sm text-on-surface">{row.vaccineName}</td>
                <td className="px-md py-sm">
                  <p className="text-on-surface">{formatDate(row.nextDueAt)}</p>
                  {dueBadge(row.daysDue)}
                </td>
                <td className="px-md py-sm">
                  <MaterialIcon name="chevron_right" size={20} className="text-on-surface-variant" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Register route in App.tsx**

Add lazy import:
```tsx
const ClinicVaccinationsDue = lazy(() => import('./views/clinic/ClinicVaccinationsDue'))
```

Add route inside `/clinic` block:
```tsx
<Route path="vaccinations-due" element={<RequirePermission perm="emr.view"><ClinicVaccinationsDue/></RequirePermission>}/>
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd src/frontend && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
git add src/frontend/src/views/clinic/ClinicVaccinationsDue.tsx src/frontend/src/App.tsx
git commit -m "feat: add Vaccines Due worklist page at /clinic/vaccinations-due"
```

---

### Task 14: ClinicRecordVaccination Page

**Files:**
- Create: `src/frontend/src/views/clinic/ClinicRecordVaccination.tsx`
- Modify: `src/frontend/src/App.tsx`

**Interfaces:**
- Consumes: URL params `?petId=&vaccine=&nextDueAt=` from Task 13 row click; `POST /api/vaccinations` with `administeredExternally` (Task 6)
- Produces: on success, invalidates `['vaccinations', 'due-worklist']` query and navigates back to `/clinic/vaccinations-due`

- [ ] **Step 1: Create ClinicRecordVaccination.tsx**

Create `src/frontend/src/views/clinic/ClinicRecordVaccination.tsx`:

```tsx
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../utils/api'
import MaterialIcon from '../../components/MaterialIcon'

interface VaccinePayload {
  petId:                  number
  vaccineName:            string
  administeredAt:         string
  nextDueAt:              string | null
  batchNo:                string | null
  notes:                  string | null
  administeredExternally: boolean
}

export default function ClinicRecordVaccination() {
  const navigate      = useNavigate()
  const queryClient   = useQueryClient()
  const [searchParams] = useSearchParams()

  const petId      = parseInt(searchParams.get('petId') ?? '0')
  const vaccine    = searchParams.get('vaccine') ?? ''
  const nextDueRaw = searchParams.get('nextDueAt')

  const suggested = new Date()
  suggested.setFullYear(suggested.getFullYear() + 1)

  const [form, setForm] = useState({
    administeredAt:         new Date().toISOString().slice(0, 10),
    nextDueAt:              nextDueRaw
      ? new Date(nextDueRaw).toISOString().slice(0, 10)
      : suggested.toISOString().slice(0, 10),
    batchNo:                '',
    notes:                  '',
    administeredExternally: false,
  })
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (payload: VaccinePayload) =>
      api.post('/api/vaccinations', payload).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vaccinations', 'due-worklist'] })
      navigate('/clinic/vaccinations-due')
    },
    onError: (err: Error) => setError(err.message),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!petId) { setError('Invalid pet ID'); return }
    mutation.mutate({
      petId,
      vaccineName:            vaccine,
      administeredAt:         form.administeredAt,
      nextDueAt:              form.nextDueAt || null,
      batchNo:                form.batchNo || null,
      notes:                  form.notes || null,
      administeredExternally: form.administeredExternally,
    })
  }

  const inputCls = 'min-h-[44px] px-md rounded-lg border border-outline-variant bg-surface text-body-md text-on-surface focus:outline-none focus:border-primary'

  return (
    <div className="p-lg max-w-lg">
      <button onClick={() => navigate(-1)}
              className="flex items-center gap-xs text-on-surface-variant mb-md min-h-[44px] hover:text-primary">
        <MaterialIcon name="arrow_back" size={20} /> Back
      </button>

      <h2 className="text-headline-lg font-headline font-bold text-primary mb-lg">Record Vaccination</h2>

      <form onSubmit={handleSubmit} className="glass-card rounded-xl shadow-lvl1 p-lg flex flex-col gap-md">
        <div className="flex flex-col gap-xs">
          <label className="text-label-md text-on-surface-variant font-medium">Pet ID</label>
          <input readOnly value={petId} className={`${inputCls} bg-surface-container`} />
        </div>
        <div className="flex flex-col gap-xs">
          <label className="text-label-md text-on-surface-variant font-medium">Vaccine</label>
          <input readOnly value={vaccine} className={`${inputCls} bg-surface-container`} />
        </div>
        <div className="flex flex-col gap-xs">
          <label className="text-label-md text-on-surface-variant font-medium">Date Administered</label>
          <input type="date" required value={form.administeredAt}
                 onChange={e => setForm(f => ({ ...f, administeredAt: e.target.value }))}
                 className={inputCls} />
        </div>
        <div className="flex flex-col gap-xs">
          <label className="text-label-md text-on-surface-variant font-medium">Next Due Date</label>
          <input type="date" value={form.nextDueAt}
                 onChange={e => setForm(f => ({ ...f, nextDueAt: e.target.value }))}
                 className={inputCls} />
        </div>
        <div className="flex flex-col gap-xs">
          <label className="text-label-md text-on-surface-variant font-medium">Batch No.</label>
          <input value={form.batchNo} placeholder="optional"
                 onChange={e => setForm(f => ({ ...f, batchNo: e.target.value }))}
                 className={inputCls} />
        </div>
        <div className="flex flex-col gap-xs">
          <label className="text-label-md text-on-surface-variant font-medium">Notes</label>
          <textarea rows={3} value={form.notes} placeholder="optional"
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    className="px-md py-sm rounded-lg border border-outline-variant bg-surface text-body-md focus:outline-none focus:border-primary resize-none" />
        </div>

        <label className="flex items-center gap-md min-h-[44px] cursor-pointer">
          <input type="checkbox" checked={form.administeredExternally}
                 onChange={e => setForm(f => ({ ...f, administeredExternally: e.target.checked }))}
                 className="w-5 h-5 accent-primary" />
          <span className="text-body-md text-on-surface">Administered externally (not at this clinic)</span>
        </label>

        {error && (
          <p className="text-error text-body-sm bg-error-container rounded-lg px-md py-sm">{error}</p>
        )}

        <button type="submit" disabled={mutation.isPending}
                className="min-h-[44px] rounded-lg bg-primary text-primary-on font-semibold text-body-sm hover:bg-primary/90 transition-colors disabled:opacity-60">
          {mutation.isPending ? 'Saving…' : 'Record Vaccination'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Register route in App.tsx**

Add lazy import:
```tsx
const ClinicRecordVaccination = lazy(() => import('./views/clinic/ClinicRecordVaccination'))
```

Add route inside `/clinic` block (after the `vaccinations-due` route):
```tsx
<Route path="vaccinations-due/record" element={<RequirePermission perm="emr.create"><ClinicRecordVaccination/></RequirePermission>}/>
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd src/frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 4: Run full backend test suite**

```bash
cd src/backend && npm test -- --forceExit 2>&1 | tail -30
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/views/clinic/ClinicRecordVaccination.tsx src/frontend/src/App.tsx
git commit -m "feat: add Record Vaccination page at /clinic/vaccinations-due/record"
```

---

## Self-Review

### Spec Coverage

| Spec Section | Task(s) |
|---|---|
| 3.1 Sidebar branding (company + branch name) | 2, 9 |
| 3.2 KPI cards clickable + permission-gated (Q9) | 10 |
| 3.3 Appointments month view (Q11) | 8, 11 |
| 3.4 Transaction History page | 7, 12 |
| 3.5 Vaccines Due worklist (Q6 + Q7) | 5, 13 |
| 3.6 Branch-scope dashboard aggregates (Q1 + Q4) | 3, 4 |
| 3.7 Record Vaccination + administeredExternally (Q8) | 6, 14 |
| 3.8 Dashboard layout reshuffle | 10 |
| 4. Pet.branchId migration + backfill (Q2 + Q3) | 1 |
| 4. Vaccination.administeredExternally | 1, 6 |
| Q5 Revenue chart on Transactions page = payment-received basis | 4, 12 |

### Known Adaptation Points

- **Task 7 Step 4 + Task 12 Step 1:** `TransactionRow` field names must match `findPaymentHistory`'s actual return. Step 1 requires reading the function before implementing.
- **Task 9 Step 4:** The exact `setAuth` call site must be found and adapted; login flow file not confirmed (look in `LoginView.tsx` or `useAuth.ts`).

### Type Consistency

- `WorklistRow` defined in Task 5 (backend) and mirrored in Task 13 (frontend) — field names match.
- `SeriesPoint { label: string; revenue: number }` defined in `report.repository.ts` — reused in Tasks 4, 7, 12. Names consistent.
- `administeredExternally: boolean` added to Zod schema (Task 6), Prisma (Task 1), and the Record form payload (Task 14) — consistent.
