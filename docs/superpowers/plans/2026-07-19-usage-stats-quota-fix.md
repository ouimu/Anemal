# Usage Stats Real Quota Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fabricated `PLAN_LIMITS` table in the clinic Usage Stats page with the real per-tenant quota system, and extend that quota system with a 4th tracked resource (`maxPets`) — including creation-time enforcement, matching the 3 resources (`maxBranches`/`maxUsers`/`maxOwners`) that already enforce.

**Architecture:** Add `maxPets Int?` to the existing `Plan`/`TenantQuota` Prisma models. Three independent code paths already resolve effective quota from these tables (discovered during BA validation, grilling, and this plan's file-mapping step — see Global Constraints) — each gets a `maxPets` line added, following its own existing `override ?? plan ?? null` formula exactly. `GET /admin/usage` is extended to return real `caps` from the clinic-plane resolver (`subscription.service.ts`), and a new `assertCanAddPet()` enforces the cap at pet-creation time, mirroring `assertCanAddOwner()` exactly.

**Tech Stack:** Node.js/Express/PostgreSQL/Prisma (backend), React/TypeScript/TanStack Query (frontend), Jest+Supertest (backend tests), Vitest/RTL (frontend tests).

## Global Constraints

- Multi-tenancy: every quota read/write stays scoped by `tenantId` derived from JWT context — no query-param or body override of `tenantId` anywhere in this plan.
- No new permission codes, no new routes. Existing guards unchanged: `clinic.profile.view` (`/admin/usage`), `platform.plans.view`/`platform.plans.manage` (Plan CRUD), `platform.customers.view`/`platform.quotas.manage` (quota override read/write).
- `maxPets` follows the exact null semantics already established for `maxOwners`: `null` on `Plan` = unlimited; `null` on `TenantQuota` override = "no override, inherit plan" (never "override to unlimited" — this ambiguity is pre-existing and out of scope to resolve here, per ADR-0018 D-4).
- Create-time default for `maxPets` (`500`) must use `data.maxPets === undefined ? 500 : data.maxPets`, NOT `??` — `??` would silently coerce an intentional `maxPets: null` (unlimited-on-create) to `500` (ADR-0018 references this as CORR-3).
- **Three independent resolvers, not one** (found during BA sign-off, grill, and this plan's file-mapping — see ADR-0018 D-1 and the note below): `platform-plans.service.ts` (platform-plane, powers Plan CRUD + Platform Console customer usage), `subscription.service.ts` (clinic-plane, powers `assertCanAdd*` + `GET /subscription/status` + now `GET /admin/usage`), and `platform-customers.service.ts`'s `toDetailItem()` (powers `GET /platform/customers/:id`, which feeds `CustomerDetailView.tsx`'s override-editor initial values — this third site was not caught until this plan's file-mapping step; it duplicates the same `override ?? plan ?? null` formula inline rather than calling either service function). All three need their own `maxPets` line — do not attempt to consolidate them in this fix (consolidation is backlogged, ADR-0018 D-1 consequence, RES-3 in the ba-signoff doc).
- Migration seed values: `starter: 500`, `professional: 5000`, `clinic_plus: null` (unlimited).
- No new npm dependencies.

**File count note for `@ponytail-agent` (Step 5):** this plan touches 16 core files (11 backend, 5 frontend), up from the grill doc's estimate of 13. The extra 3 (`platform-customers.repository.ts`, `platform-customers.service.ts`, `platform-customers.controller.ts`) were found only by reading the actual `getTenantWithPlanAndQuota`/`toDetailItem`/`setQuotaSchema` code while mapping files for this plan — they are not scope creep, they are pre-existing code that silently breaks (blank override-editor fields, rejected `maxPets` in the quota-override PUT body) if skipped. Full list below.

---

## File Structure

**Backend (11 files + 1 migration):**
1. `src/backend/prisma/schema.prisma` + new migration — `maxPets` columns
2. `src/backend/models/platform-customers.repository.ts` — `TenantWithPlanAndQuota` type + `getTenantWithPlanAndQuota()` select
3. `src/backend/models/platform-plans.repository.ts` — `PlanRow`/CRUD types + `createPlan`/`updatePlan`
4. `src/backend/services/platform-plans.service.ts` — `PlanResponse`/`EffectiveQuota`/`normalizePlan`/`getEffectiveQuota` (platform-plane resolver)
5. `src/backend/services/platform-customers.service.ts` — `CustomerDetail`/`toDetailItem()` (3rd resolver site)
6. `src/backend/services/subscription.service.ts` — `EffectiveTenantQuota`/`getEffectiveQuota` (clinic-plane resolver) + new `assertCanAddPet()`
7. `src/backend/services/pet.service.ts` — `createPet()` calls `assertCanAddPet()`
8. `src/backend/services/usage.service.ts` — `getPlatformCustomerUsage()` pet count + `overPlan`
9. `src/backend/routes/admin.routes.ts` — `/admin/usage` merges `caps` from `subscription.service`
10. `src/backend/controllers/platform-plans.controller.ts` — `createPlanSchema`/`updatePlanSchema` Zod
11. `src/backend/controllers/platform-customers.controller.ts` — `setQuotaSchema` Zod

**Frontend (5 files):**
12. `src/frontend/src/hooks/usePlatformPlans.ts` — `Plan`/`CreatePlanPayload` types
13. `src/frontend/src/hooks/usePlatformCustomers.ts` — `CustomerDetail`/`UpdateQuotaPayload`/`RawUsage`/`CustomerUsage` types
14. `src/frontend/src/views/platform/PlatformPlansView.tsx` — Max Pets field + table column
15. `src/frontend/src/views/platform/CustomerDetailView.tsx` — Max Pets override field
16. `src/frontend/src/views/admin/AdminUsage.tsx` — delete `PLAN_LIMITS`, render real `caps`

**Tests (new assertions in existing files, no new test files needed):**
- `src/backend/__tests__/subscription.test.ts` — `assertCanAddPet` enforcement
- `src/backend/__tests__/adminSettings.test.ts` — `/admin/usage` returns real `caps`
- `src/backend/tests/integration/platform-console-t5f02.test.ts` or `platformContract.test.ts` — Plan CRUD + quota-override `maxPets`
- `src/frontend/src/hooks/usePlatformPlans.test.ts`, `usePlatformCustomers.normalization.test.ts` — type/normalization coverage
- `src/frontend/src/__tests__/PlatformConsole.test.tsx` — Plan editor + override editor UI

---

### Task 1: Schema — add `maxPets` to `Plan` and `TenantQuota`

**Files:**
- Modify: `src/backend/prisma/schema.prisma:901-930`
- Create: `src/backend/prisma/migrations/20260719120000_add_max_pets_quota/migration.sql`

**Interfaces:**
- Produces: `Plan.maxPets: number | null` (DB column, no `@default` — see Global Constraints), `TenantQuota.maxPets: number | null`

- [ ] **Step 1: Add `maxPets` to both Prisma models**

Edit `schema.prisma`:

```prisma
model Plan {
  id          Int     @id @default(autoincrement())
  key         String  @unique @db.VarChar(50) // 'starter'|'professional'|'clinic_plus'
  name        String  @db.VarChar(100)
  priceMonth  Decimal @default(0) @db.Decimal(10, 2)
  maxBranches Int     @default(1)
  maxUsers    Int     @default(5)
  maxOwners   Int? // NULL = unlimited
  maxPets     Int? // NULL = unlimited
  features    Json    @default("{}")
  isActive    Boolean @default(true)

  tenants Tenant[]

  @@map("plans")
}

model TenantQuota {
  tenantId    Int      @id
  maxBranches Int?
  maxUsers    Int?
  maxOwners   Int?
  maxPets     Int?
  updatedById Int?
  updatedAt   DateTime @updatedAt

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@map("tenant_quotas")
}
```

- [ ] **Step 2: Write the migration SQL**

```sql
-- AlterTable
ALTER TABLE "plans" ADD COLUMN "maxPets" INTEGER;
ALTER TABLE "tenant_quotas" ADD COLUMN "maxPets" INTEGER;

-- Seed maxPets for the 3 existing plans (starter=500, professional=5000, clinic_plus=unlimited)
UPDATE "plans" SET "maxPets" = 500  WHERE "key" = 'starter';
UPDATE "plans" SET "maxPets" = 5000 WHERE "key" = 'professional';
UPDATE "plans" SET "maxPets" = NULL WHERE "key" = 'clinic_plus';
```

- [ ] **Step 3: Apply the migration**

Run: `cd src/backend && npx prisma migrate dev --name add_max_pets_quota`
Expected: migration applies cleanly, `npx prisma validate` passes, Prisma Client regenerates with `maxPets` on both models.

- [ ] **Step 4: Verify seed values landed**

Run: `cd src/backend && npx prisma studio` is optional; instead run a one-off check:
```bash
node -e "const {PrismaClient}=require('@prisma/client'); const p=new PrismaClient(); p.plan.findMany({select:{key:true,maxPets:true}}).then(r=>{console.log(r); p.\$disconnect()})"
```
Expected output includes `{ key: 'starter', maxPets: 500 }`, `{ key: 'professional', maxPets: 5000 }`, `{ key: 'clinic_plus', maxPets: null }`.

- [ ] **Step 5: Run existing regression suites to confirm the additive column breaks nothing**

Run: `cd src/backend && npx jest --testPathPattern="platformConsole|subscription" -v`
Expected: all existing tests still PASS (additive nullable column, no existing test references `maxPets`).

- [ ] **Step 6: Commit**

```bash
git add src/backend/prisma/schema.prisma src/backend/prisma/migrations/20260719120000_add_max_pets_quota
git commit -m "feat(db): add maxPets column to Plan and TenantQuota"
```

---

### Task 2: `platform-customers.repository.ts` — include `maxPets` in the shared tenant query

**Files:**
- Modify: `src/backend/models/platform-customers.repository.ts:35-51,197-220`
- Test: `src/backend/tests/integration/platformConsole.test.ts` (extend existing suite)

**Interfaces:**
- Consumes: `Plan.maxPets`, `TenantQuota.maxPets` (Task 1)
- Produces: `TenantWithPlanAndQuota.plan.maxPets: number | null`, `TenantWithPlanAndQuota.quota.maxPets: number | null` — consumed by Task 4 (`platform-plans.service.ts`) and Task 5 (`platform-customers.service.ts`)

- [ ] **Step 1: Write the failing test**

Add to `src/backend/tests/integration/platformConsole.test.ts` (near existing `maxOwners` assertions on the tenant-detail fetch):

```typescript
test('pc-maxpets-01: getTenantWithPlanAndQuota includes maxPets from plan and override', async () => {
  const res = await request(server)
    .get(`/platform/customers/${testTenantId}`)
    .set(auth(platformToken))
    .expect(200)
  expect(res.body.data).toHaveProperty('maxPets')
})
```

(Use this file's existing `server`/`auth`/`platformToken`/`testTenantId` setup variables — do not redeclare them.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/backend && npx jest --testPathPattern=platformConsole -v -t maxpets`
Expected: FAIL — `res.body.data` has no `maxPets` property yet.

- [ ] **Step 3: Add `maxPets` to the type and both `select` blocks**

Edit `TenantWithPlanAndQuota` (lines 35-51):

```typescript
export type TenantWithPlanAndQuota = TenantRow & {
  plan: {
    id: number
    key: string
    name: string
    maxBranches: number
    maxUsers: number
    maxOwners: number | null
    maxPets: number | null
  } | null
  quota: {
    maxBranches: number | null
    maxUsers: number | null
    maxOwners: number | null
    maxPets: number | null
    updatedById: number | null
    updatedAt: Date
  } | null
  settings: {
    email:   string | null
    phone:   string | null
    address: string | null
    logoUrl: string | null
  } | null
  companyType: {
    id:     number
    key:    string
    nameEn: string
    nameTh: string
  } | null
}
```

Edit `getTenantWithPlanAndQuota()` (lines 197-220), add `maxPets: true` to both `select` blocks:

```typescript
export async function getTenantWithPlanAndQuota(id: number): Promise<TenantWithPlanAndQuota | null> {
  const row = await prisma.tenant.findUnique({
    where: { id },
    select: {
      ...TENANT_SELECT,
      plan: {
        select: {
          id: true,
          key: true,
          name: true,
          maxBranches: true,
          maxUsers: true,
          maxOwners: true,
          maxPets: true,
        },
      },
      quota: {
        select: {
          maxBranches: true,
          maxUsers: true,
          maxOwners: true,
          maxPets: true,
          updatedById: true,
          updatedAt: true,
        },
      },
      settings: {
        select: {
          email:   true,
          phone:   true,
          address: true,
          logoUrl: true,
        },
      },
      companyType: {
        select: { id: true, key: true, nameEn: true, nameTh: true },
      },
    },
  })
  return row as TenantWithPlanAndQuota | null
}
```

(Keep the rest of the function body — company-type select and return statement — exactly as it exists today; only the two `select` blocks shown gain the `maxPets: true` line.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/backend && npx jest --testPathPattern=platformConsole -v -t maxpets`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backend/models/platform-customers.repository.ts src/backend/tests/integration/platformConsole.test.ts
git commit -m "feat(db): thread maxPets through getTenantWithPlanAndQuota"
```

---

### Task 3: `platform-plans.repository.ts` — `maxPets` in Plan CRUD

**Files:**
- Modify: `src/backend/models/platform-plans.repository.ts:14-53,76-98`
- Test: `src/backend/tests/integration/platformContract.test.ts` (extend existing Plan CRUD suite)

**Interfaces:**
- Consumes: `Plan.maxPets` (Task 1)
- Produces: `PlanRow.maxPets: number | null`, `CreatePlanData.maxPets?: number | null`, `UpdatePlanData.maxPets?: number | null`, `QuotaOverrideData.maxPets?: number | null` — consumed by Task 4

- [ ] **Step 1: Write the failing test**

Add to `src/backend/tests/integration/platformContract.test.ts` near the existing Plan create/update tests:

```typescript
test('plan-maxpets-01: POST /platform/plans persists and returns maxPets', async () => {
  const res = await request(server)
    .post('/platform/plans')
    .set(auth(platformToken))
    .send({ key: `test_pets_${Date.now()}`, name: 'Pets Test Plan', maxBranches: 1, maxUsers: 5, maxOwners: 100, maxPets: 250 })
    .expect(201)
  expect(res.body.data.maxPets).toBe(250)
})

test('plan-maxpets-02: PUT /platform/plans/:id with maxPets:null sets unlimited', async () => {
  const created = await request(server)
    .post('/platform/plans')
    .set(auth(platformToken))
    .send({ key: `test_pets_null_${Date.now()}`, name: 'Pets Null Plan', maxBranches: 1, maxUsers: 5, maxOwners: 100, maxPets: 250 })
    .expect(201)
  const res = await request(server)
    .put(`/platform/plans/${created.body.data.id}`)
    .set(auth(platformToken))
    .send({ maxPets: null })
    .expect(200)
  expect(res.body.data.maxPets).toBeNull()
})

test('plan-maxpets-03: POST /platform/plans without maxPets defaults to 500', async () => {
  const res = await request(server)
    .post('/platform/plans')
    .set(auth(platformToken))
    .send({ key: `test_pets_default_${Date.now()}`, name: 'Pets Default Plan', maxBranches: 1, maxUsers: 5 })
    .expect(201)
  expect(res.body.data.maxPets).toBe(500)
})
```

(Reuse this file's existing `server`/`auth`/`platformToken` setup — do not redeclare.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/backend && npx jest --testPathPattern=platformContract -v -t maxpets`
Expected: FAIL — Zod schema rejects unknown `maxPets` field (the schemas use `.strict()`), or `maxPets` is `undefined` in the response.

- [ ] **Step 3: Add `maxPets` to the repository types and CRUD calls**

Edit lines 14-24 (`PlanRow`):

```typescript
export type PlanRow = {
  id: number
  key: string
  name: string
  priceMonth: import('@prisma/client').Prisma.Decimal
  maxBranches: number
  maxUsers: number
  maxOwners: number | null
  maxPets: number | null
  features: import('@prisma/client').Prisma.JsonValue
  isActive: boolean
}
```

Edit lines 27-46 (`CreatePlanData`, `UpdatePlanData`, `QuotaOverrideData`):

```typescript
export interface CreatePlanData {
  key: string
  name: string
  priceMonth?: number
  maxBranches?: number
  maxUsers?: number
  maxOwners?: number | null
  maxPets?: number | null
  features?: Prisma.InputJsonValue
}

export interface UpdatePlanData {
  name?: string
  priceMonth?: number
  maxBranches?: number
  maxUsers?: number
  maxOwners?: number | null
  maxPets?: number | null
  features?: Prisma.InputJsonValue
  isActive?: boolean
}

export interface QuotaOverrideData {
  maxBranches?: number | null
  maxUsers?: number | null
  maxOwners?: number | null
  maxPets?: number | null
}
```

Edit `createPlan()` (lines 76-88) — use `=== undefined` check per Global Constraints, NOT `??`:

```typescript
export function createPlan(data: CreatePlanData): Promise<PlanRow> {
  return prisma.plan.create({
    data: {
      key: data.key,
      name: data.name,
      priceMonth: data.priceMonth ?? 0,
      maxBranches: data.maxBranches ?? 1,
      maxUsers: data.maxUsers ?? 5,
      maxOwners: data.maxOwners ?? null,
      maxPets: data.maxPets === undefined ? 500 : data.maxPets,
      features: data.features ?? {},
    },
  })
}
```

`updatePlan()` (line 96-98) needs no change — it already passes `data` straight through to Prisma's `update`, and `UpdatePlanData.maxPets` is optional, so an omitted field is simply not included in the `data` object at the call site (unaffected by the `??`-vs-`undefined` distinction, since Prisma's partial update already treats "key absent from object" as "don't touch this column").

- [ ] **Step 4: Add `maxPets` to the Zod schemas (unblocks the `.strict()` rejection)**

This step touches `platform-plans.controller.ts` — done in Task 10, which must land before this test can pass. Note the dependency and proceed; Step 5 below will pass once Task 10 lands.

- [ ] **Step 5: Run test to verify it passes (after Task 10 lands)**

Run: `cd src/backend && npx jest --testPathPattern=platformContract -v -t maxpets`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/backend/models/platform-plans.repository.ts src/backend/tests/integration/platformContract.test.ts
git commit -m "feat(db): add maxPets to Plan CRUD repository"
```

---

### Task 4: `platform-plans.service.ts` — `maxPets` in the platform-plane resolver

**Files:**
- Modify: `src/backend/services/platform-plans.service.ts:24-35,44-65,86-102,197-219`
- Test: `src/backend/tests/integration/platformContract.test.ts` (unit-style, extend)

**Interfaces:**
- Consumes: `PlanRow.maxPets`, `TenantWithPlanAndQuota.plan.maxPets`/`.quota.maxPets` (Tasks 2, 3)
- Produces: `PlanResponse.maxPets: number | null`, `EffectiveQuota.plan.maxPets`/`.override.maxPets`/`.effective.maxPets: number | null` — consumed by Task 14 (frontend Plan editor) and the Platform Console customer usage view

- [ ] **Step 1: Write the failing test**

Add to `src/backend/tests/integration/platformContract.test.ts`:

```typescript
test('plan-maxpets-04: GET /platform/plans returns maxPets on every plan', async () => {
  const res = await request(server).get('/platform/plans').set(auth(platformToken)).expect(200)
  expect(res.body.data.length).toBeGreaterThan(0)
  res.body.data.forEach((plan: any) => {
    expect(plan).toHaveProperty('maxPets')
  })
})

test('plan-maxpets-05: getEffectiveQuota resolves maxPets — override wins over plan', async () => {
  const res = await request(server)
    .get(`/platform/customers/${testTenantId}/quota`)
    .set(auth(platformToken))
    .expect(200)
  expect(res.body.data.effective).toHaveProperty('maxPets')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/backend && npx jest --testPathPattern=platformContract -v -t maxpets`
Expected: FAIL — `plan.maxPets` and `effective.maxPets` are `undefined`.

- [ ] **Step 3: Add `maxPets` to `PlanResponse`, `EffectiveQuota`, `normalizePlan()`, `getEffectiveQuota()`**

Edit `PlanResponse` (lines 24-35):

```typescript
export interface PlanResponse {
  id:          number
  key:         string
  name:        string
  price:       number
  maxBranches: number
  maxUsers:    number
  maxOwners:   number | null
  maxPets:     number | null
  features:    string[]
  isRetired:   boolean
  createdAt:   null
}
```

Edit `normalizePlan()` (lines 44-65) — add one line to the returned object:

```typescript
function normalizePlan(row: PlanRow): PlanResponse {
  const featuresRaw = row.features
  const features: string[] =
    featuresRaw !== null &&
    typeof featuresRaw === 'object' &&
    !Array.isArray(featuresRaw)
      ? Object.keys(featuresRaw as Record<string, unknown>)
      : []

  return {
    id:          row.id,
    key:         row.key,
    name:        row.name,
    price:       parseFloat(String(row.priceMonth)),
    maxBranches: row.maxBranches,
    maxUsers:    row.maxUsers,
    maxOwners:   row.maxOwners,
    maxPets:     row.maxPets,
    features,
    isRetired:   !row.isActive,
    createdAt:   null,
  }
}
```

Edit `EffectiveQuota` (lines 86-102):

```typescript
export interface EffectiveQuota {
  plan: {
    maxBranches: number
    maxUsers: number
    maxOwners: number | null
    maxPets: number | null
  } | null
  override: {
    maxBranches: number | null
    maxUsers: number | null
    maxOwners: number | null
    maxPets: number | null
  } | null
  effective: {
    maxBranches: number | null
    maxUsers: number | null
    maxOwners: number | null
    maxPets: number | null
  }
}
```

Edit `getEffectiveQuota()` (lines 197-219):

```typescript
export async function getEffectiveQuota(tenantId: number): Promise<EffectiveQuota> {
  const tenant = await customersRepo.getTenantWithPlanAndQuota(tenantId)
  if (!tenant) throw new CustomerNotFoundError()

  const plan = tenant.plan
  const override = tenant.quota ?? null

  const effective = {
    maxBranches: override?.maxBranches ?? plan?.maxBranches ?? null,
    maxUsers:    override?.maxUsers    ?? plan?.maxUsers    ?? null,
    maxOwners:   override?.maxOwners   ?? plan?.maxOwners   ?? null,
    maxPets:     override?.maxPets     ?? plan?.maxPets     ?? null,
  }

  return {
    plan: plan
      ? { maxBranches: plan.maxBranches, maxUsers: plan.maxUsers, maxOwners: plan.maxOwners, maxPets: plan.maxPets }
      : null,
    override: override
      ? { maxBranches: override.maxBranches, maxUsers: override.maxUsers, maxOwners: override.maxOwners, maxPets: override.maxPets }
      : null,
    effective,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/backend && npx jest --testPathPattern=platformContract -v -t maxpets`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backend/services/platform-plans.service.ts src/backend/tests/integration/platformContract.test.ts
git commit -m "feat(quota): add maxPets to platform-plane effective quota resolver"
```

---

### Task 5: `platform-customers.service.ts` — `maxPets` in the 3rd resolver site

**Files:**
- Modify: `src/backend/services/platform-customers.service.ts:59-70,86-89`
- Test: `src/backend/tests/integration/platformConsole.test.ts` (extend, same suite as Task 2)

**Interfaces:**
- Consumes: `TenantWithPlanAndQuota.plan.maxPets`/`.quota.maxPets` (Task 2)
- Produces: `CustomerDetail.maxPets: number | null` — consumed by Task 15 (`CustomerDetailView.tsx`'s override-editor initial value)

- [ ] **Step 1: Write the failing test**

Add to `src/backend/tests/integration/platformConsole.test.ts`:

```typescript
test('pc-maxpets-02: GET /platform/customers/:id resolves maxPets same as plan/override', async () => {
  const res = await request(server)
    .get(`/platform/customers/${testTenantId}`)
    .set(auth(platformToken))
    .expect(200)
  expect(res.body.data).toHaveProperty('maxPets')
  expect(typeof res.body.data.maxPets === 'number' || res.body.data.maxPets === null).toBe(true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/backend && npx jest --testPathPattern=platformConsole -v -t "maxpets-02"`
Expected: FAIL — `res.body.data.maxPets` is `undefined`.

- [ ] **Step 3: Add `maxPets` to `CustomerDetail` and `toDetailItem()`**

Edit `CustomerDetail` (lines 59-70):

```typescript
export interface CustomerDetail extends CustomerListItem {
  maxBranches:   number | null
  maxUsers:      number | null
  maxOwners:     number | null
  maxPets:       number | null
  email:         string | null
  phone:         string | null
  address:       string | null
  logoUrl:       string | null
  companyTypeId: number | null
  companyType:   { id: number; key: string; nameEn: string; nameTh: string } | null
}
```

Edit `toDetailItem()` (lines 86-89 for the resolution lines; the returned object below them also needs the new field):

```typescript
function toDetailItem(row: TenantWithPlanAndQuota): CustomerDetail {
  const maxBranches = row.quota?.maxBranches ?? row.plan?.maxBranches ?? null
  const maxUsers    = row.quota?.maxUsers    ?? row.plan?.maxUsers    ?? null
  const maxOwners   = row.quota?.maxOwners   ?? row.plan?.maxOwners   ?? null
  const maxPets     = row.quota?.maxPets     ?? row.plan?.maxPets     ?? null
  return {
    id:          row.id,
    name:        row.name,
    subdomain:   row.subdomain,
    planId:      row.planId,
    planName:    row.plan?.name ?? null,
    status:      computeStatus(row.isActive, row.trialEndsAt),
    userCount:   row.userCount,
    trialEndsAt: row.trialEndsAt,
    createdAt:   row.createdAt,
    maxBranches,
    maxUsers,
    maxOwners,
    maxPets,
    email:         row.settings?.email   ?? null,
    phone:         row.settings?.phone   ?? null,
    address:       row.settings?.address ?? null,
    logoUrl:       row.settings?.logoUrl ?? null,
    companyTypeId: row.companyTypeId,
    companyType:   row.companyType ?? null,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/backend && npx jest --testPathPattern=platformConsole -v -t "maxpets-02"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backend/services/platform-customers.service.ts src/backend/tests/integration/platformConsole.test.ts
git commit -m "feat(quota): add maxPets to CustomerDetail (3rd quota resolver site)"
```

---

### Task 6: `subscription.service.ts` — `maxPets` in the clinic-plane resolver + `assertCanAddPet`

**Files:**
- Modify: `src/backend/services/subscription.service.ts:41-77,111-126`
- Test: `src/backend/__tests__/subscription.test.ts` (extend existing suite)

**Interfaces:**
- Consumes: `Plan.maxPets`, `TenantQuota.maxPets` (Task 1 — this resolver queries Prisma directly with `include: { plan: true, quota: true }`, so no repository-layer change is needed here, unlike Task 2's explicit `select`)
- Produces: `EffectiveTenantQuota.maxPets: number | null`, `assertCanAddPet(tenantId: number): Promise<void>` — consumed by Task 7 (`pet.service.ts`) and Task 9 (`admin.routes.ts`)

- [ ] **Step 1: Write the failing test**

Add to `src/backend/__tests__/subscription.test.ts`, inside the existing `describe('sub-3.4 ...')` block, and extend `beforeAll` to set `maxPets: 2` on the test plan:

```typescript
// In beforeAll, change the plan upsert to also set maxPets: 2:
//   update: { maxUsers: 3, maxPets: 2 },
//   create: { key: 'test_starter', name: 'Test Starter', maxBranches: 1, maxUsers: 3, maxOwners: 500, maxPets: 2 },

test('sub-04: pet creation blocked once quota is reached → 409 QUOTA_EXCEEDED', async () => {
  // Need an owner to attach pets to
  const owner = await prisma.owner.create({ data: { tenantId: tid, name: 'Pet Owner', phone: `0800000${Date.now() % 10000}` } })
  await prisma.pet.create({ data: { tenantId: tid, ownerId: owner.id, name: 'Pet 1', species: 'Dog', isActive: true } })
  await request(server).post('/pets').set(auth(adminToken))
    .send({ ownerId: owner.id, name: 'Pet 2', species: 'Cat' }).expect(201)
  const res = await request(server).post('/pets').set(auth(adminToken))
    .send({ ownerId: owner.id, name: 'Pet 3', species: 'Cat' }).expect(409)
  expect(res.body.code).toBe('QUOTA_EXCEEDED')
  expect(res.body.details.resource).toBe('pets')
  expect(res.body.details.limit).toBe(2)
})

test('sub-05: unlimited maxPets (null) never blocks pet creation', async () => {
  await prisma.plan.update({ where: { key: 'test_starter' }, data: { maxPets: null } })
  const owner = await prisma.owner.create({ data: { tenantId: tid, name: 'Unlimited Owner', phone: `0900000${Date.now() % 10000}` } })
  await prisma.pet.create({ data: { tenantId: tid, ownerId: owner.id, name: 'P1', species: 'Dog', isActive: true } })
  await prisma.pet.create({ data: { tenantId: tid, ownerId: owner.id, name: 'P2', species: 'Dog', isActive: true } })
  await request(server).post('/pets').set(auth(adminToken))
    .send({ ownerId: owner.id, name: 'P3', species: 'Dog' }).expect(201)
  await prisma.plan.update({ where: { key: 'test_starter' }, data: { maxPets: 2 } }) // restore for other tests
})
```

Also add `await prisma.pet.deleteMany({ where: { tenantId: tid } })` and `await prisma.owner.deleteMany({ where: { tenantId: tid } })` to `afterAll`, before the existing `prisma.user.deleteMany` line.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/backend && npx jest --testPathPattern=subscription -v -t "sub-04"`
Expected: FAIL — pet creation succeeds regardless of count (no `assertCanAddPet` exists yet, so the third `POST /pets` returns 201, not 409).

- [ ] **Step 3: Add `maxPets` to `EffectiveTenantQuota` and the resolver, add `assertCanAddPet`**

Edit `EffectiveTenantQuota` (lines 41-46):

```typescript
export interface EffectiveTenantQuota {
  maxBranches: number | null
  maxUsers: number | null
  maxOwners: number | null
  maxPets: number | null
}
```

Edit `getEffectiveQuota()` (lines 63-77):

```typescript
export async function getEffectiveQuota(tenantId: number): Promise<EffectiveTenantQuota> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      plan:  true,
      quota: true,
    },
  })

  return {
    maxBranches: tenant?.quota?.maxBranches ?? tenant?.plan?.maxBranches ?? FALLBACK_BRANCHES,
    maxUsers:    tenant?.quota?.maxUsers    ?? tenant?.plan?.maxUsers    ?? FALLBACK_USERS,
    maxOwners:   tenant?.quota?.maxOwners   ?? tenant?.plan?.maxOwners   ?? null, // null = unlimited
    maxPets:     tenant?.quota?.maxPets     ?? tenant?.plan?.maxPets     ?? null, // null = unlimited
  }
}
```

Add `assertCanAddPet` after `assertCanAddOwner()` (after line 126):

```typescript
/**
 * Assert that a new active pet can be created for this tenant.
 * Throws QuotaExceededError (409) when the pet limit is reached.
 * A null limit (unlimited) always passes.
 *
 * @param tenantId - Tenant to check.
 */
export async function assertCanAddPet(tenantId: number): Promise<void> {
  const quota = await getEffectiveQuota(tenantId)
  if (quota.maxPets === null) return

  const current = await prisma.pet.count({ where: { tenantId, isActive: true } })
  if (current >= quota.maxPets) {
    throw new QuotaExceededError('pets', quota.maxPets, current)
  }
}
```

- [ ] **Step 4: Run test to verify it still fails (assertCanAddPet exists but isn't wired to `createPet` yet)**

Run: `cd src/backend && npx jest --testPathPattern=subscription -v -t "sub-04"`
Expected: still FAIL — `assertCanAddPet` is unused until Task 7 wires it in.

- [ ] **Step 5: Commit (this task's changes; test passes after Task 7)**

```bash
git add src/backend/services/subscription.service.ts src/backend/__tests__/subscription.test.ts
git commit -m "feat(quota): add maxPets resolution and assertCanAddPet to subscription.service"
```

---

### Task 7: `pet.service.ts` — enforce quota on pet creation

**Files:**
- Modify: `src/backend/services/pet.service.ts:1-3,48-52`
- Test: `src/backend/__tests__/subscription.test.ts` (Task 6's `sub-04`/`sub-05` tests now complete)

**Interfaces:**
- Consumes: `assertCanAddPet(tenantId: number): Promise<void>` (Task 6)

- [ ] **Step 1: Verify Task 6's tests are still red**

Run: `cd src/backend && npx jest --testPathPattern=subscription -v -t "sub-04|sub-05"`
Expected: FAIL (pre-condition check before implementing).

- [ ] **Step 2: Wire `assertCanAddPet` into `createPet()`**

Edit imports (line 3 area):

```typescript
import { z } from 'zod'
import { AppError } from '../utils/errors'
import * as petRepo from '../models/pet.repository'
import { assertCanAddPet } from './subscription.service'
```

Edit `createPet()` (lines 48-52):

```typescript
export async function createPet(tenantId: number, data: CreatePetInput) {
  await assertCanAddPet(tenantId)
  const owner = await petRepo.findOwner(tenantId, data.ownerId)
  if (!owner) throw new PetError('Owner not found', 404)
  return petRepo.createPet(tenantId, data)
}
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `cd src/backend && npx jest --testPathPattern=subscription -v -t "sub-04|sub-05"`
Expected: PASS.

- [ ] **Step 4: Run the full pet test suite to confirm no regression**

Run: `cd src/backend && npx jest --testPathPattern=pet -v`
Expected: all existing pet tests still PASS (quota check only blocks when a real cap is hit; existing tests' tenants are on plans/overrides that don't hit the new `maxPets` cap, since it's additive and existing seeded plans default higher than any existing test's pet count — verify this holds; if any existing test's fixture tenant is coincidentally at/over 500 active pets, that test needs its plan's `maxPets` raised or set to `null` in its own setup, not a global change).

- [ ] **Step 5: Commit**

```bash
git add src/backend/services/pet.service.ts
git commit -m "feat(quota): enforce maxPets on pet creation via assertCanAddPet"
```

---

### Task 8: `usage.service.ts` — pet count in Platform Console customer usage view

**Files:**
- Modify: `src/backend/services/usage.service.ts:11-33`
- Test: `src/backend/tests/integration/platformConsole.test.ts` (extend)

**Interfaces:**
- Consumes: `usageRepo.countActivePets(tenantId: number, branchId?: number | null)` (already exists, `src/backend/models/usage.repository.ts:13` — call with no `branchId` for tenant-wide count), `EffectiveQuota['effective']` now including `maxPets` (Task 4)
- Produces: `getPlatformCustomerUsage()` return type gains `pets: number`, and `overPlan` now also considers `maxPets`

- [ ] **Step 1: Write the failing test**

Add to `src/backend/tests/integration/platformConsole.test.ts`:

```typescript
test('pc-maxpets-03: GET /platform/customers/:id/usage includes pets count and caps.maxPets', async () => {
  const res = await request(server)
    .get(`/platform/customers/${testTenantId}/usage`)
    .set(auth(platformToken))
    .expect(200)
  expect(res.body.data).toHaveProperty('pets')
  expect(res.body.data.caps).toHaveProperty('maxPets')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/backend && npx jest --testPathPattern=platformConsole -v -t "maxpets-03"`
Expected: FAIL — `pets` and `caps.maxPets` are `undefined`.

- [ ] **Step 3: Add pet count and `maxPets` to `getPlatformCustomerUsage()`**

Edit lines 11-33:

```typescript
export async function getPlatformCustomerUsage(
  tenantId: number,
  effectiveQuota: EffectiveQuota['effective'],
): Promise<{
  branches: number
  users: number
  owners: number
  pets: number
  caps: EffectiveQuota['effective']
  overPlan: boolean
}> {
  const [branches, users, owners, pets] = await Promise.all([
    usageRepo.countBranches(tenantId),
    usageRepo.countUsers(tenantId),
    usageRepo.countOwners(tenantId),
    usageRepo.countActivePets(tenantId),
  ])

  const overPlan =
    (effectiveQuota.maxBranches !== null && branches > effectiveQuota.maxBranches) ||
    (effectiveQuota.maxUsers    !== null && users    > effectiveQuota.maxUsers)    ||
    (effectiveQuota.maxOwners   !== null && owners   > effectiveQuota.maxOwners)   ||
    (effectiveQuota.maxPets     !== null && pets     > effectiveQuota.maxPets)

  return { branches, users, owners, pets, caps: effectiveQuota, overPlan }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/backend && npx jest --testPathPattern=platformConsole -v -t "maxpets-03"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backend/services/usage.service.ts src/backend/tests/integration/platformConsole.test.ts
git commit -m "feat(quota): include pets count and maxPets cap in platform customer usage"
```

---

### Task 9: `admin.routes.ts` — `/admin/usage` returns real `caps`

**Files:**
- Modify: `src/backend/routes/admin.routes.ts:1-22`
- Test: `src/backend/__tests__/adminSettings.test.ts` (extend existing `describe('admin-1.4 — GET /admin/usage')` block)

**Interfaces:**
- Consumes: `subscription.service.ts`'s `getEffectiveQuota(tenantId: number): Promise<EffectiveTenantQuota>` (Task 6)
- Produces: `GET /admin/usage` response gains `caps: { maxBranches, maxUsers, maxOwners, maxPets }`

- [ ] **Step 1: Write the failing test**

Add to `src/backend/__tests__/adminSettings.test.ts`, inside `describe('admin-1.4 — GET /admin/usage')`:

```typescript
test('settings-17: /admin/usage returns real caps from the clinic-plane quota resolver', async () => {
  const res = await request(server)
    .get('/admin/usage')
    .set('Authorization', adminToken())
    .expect(200)

  expect(res.body.data).toHaveProperty('caps')
  expect(res.body.data.caps).toHaveProperty('maxUsers')
  expect(res.body.data.caps).toHaveProperty('maxBranches')
  expect(res.body.data.caps).toHaveProperty('maxOwners')
  expect(res.body.data.caps).toHaveProperty('maxPets')
})

test('settings-18: /admin/usage caps reflect a tenant_quotas override, not the plan default', async () => {
  // tenantId is this suite's existing fixture tenant variable
  await prisma.tenantQuota.upsert({
    where: { tenantId },
    update: { maxUsers: 10 },
    create: { tenantId, maxUsers: 10 },
  })
  const res = await request(server)
    .get('/admin/usage')
    .set('Authorization', adminToken())
    .expect(200)
  expect(res.body.data.caps.maxUsers).toBe(10)
  await prisma.tenantQuota.delete({ where: { tenantId } }).catch(() => {})
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/backend && npx jest --testPathPattern=adminSettings -v -t "settings-17|settings-18"`
Expected: FAIL — `res.body.data.caps` is `undefined`.

- [ ] **Step 3: Merge `caps` into the `/admin/usage` response**

Edit `admin.routes.ts`:

```typescript
import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { requirePlane, requirePermission } from '../middlewares/permission.middleware'
import { validate } from '../middlewares/validate.middleware'
import { getSettings, updateSettings, updateSettingsSchema } from '../controllers/tenant-settings.controller'
import { getClinicUsage } from '../services/usage.service'
import { getEffectiveQuota } from '../services/subscription.service'

const router = Router()
router.use(authMiddleware)

router.get('/settings', requirePlane('clinic'), requirePermission('clinic.profile.view'), getSettings)
router.put('/settings', requirePlane('clinic'), requirePermission('clinic.profile.edit'), validate(updateSettingsSchema), updateSettings)

router.get('/usage', requirePlane('clinic'), requirePermission('clinic.profile.view'), async (req, res, next) => {
  try {
    const tenantId = req.context!.tenantId
    const [data, caps] = await Promise.all([
      getClinicUsage(tenantId, req.context?.branchId),
      getEffectiveQuota(tenantId),
    ])
    res.json({ success: true, data: { ...data, caps } })
  } catch (err) { next(err) }
})

export default router
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/backend && npx jest --testPathPattern=adminSettings -v -t "settings-17|settings-18"`
Expected: PASS.

- [ ] **Step 5: Run the full `adminSettings` suite to confirm no regression**

Run: `cd src/backend && npx jest --testPathPattern=adminSettings -v`
Expected: all tests PASS, including `settings-12` through `settings-16` (the response shape gained a field, existing `toHaveProperty` assertions are unaffected).

- [ ] **Step 6: Commit**

```bash
git add src/backend/routes/admin.routes.ts src/backend/__tests__/adminSettings.test.ts
git commit -m "feat(quota): /admin/usage returns real effective quota caps"
```

---

### Task 10: `platform-plans.controller.ts` — `maxPets` in Zod validation

**Files:**
- Modify: `src/backend/controllers/platform-plans.controller.ts:16-35`

**Interfaces:**
- Produces: `createPlanSchema`/`updatePlanSchema` accept `maxPets: number | null | undefined` — unblocks Task 3's tests

- [ ] **Step 1: Confirm Task 3's tests are the ones currently failing due to `.strict()` rejection**

Run: `cd src/backend && npx jest --testPathPattern=platformContract -v -t maxpets`
Expected: FAIL (from Task 3, still pending this schema change).

- [ ] **Step 2: Add `maxPets` to both schemas**

```typescript
export const createPlanSchema = z.object({
  key:         z.string().trim().min(1).max(50).regex(/^[a-z0-9_]+$/, 'Only lowercase letters, digits, and underscores'),
  name:        z.string().trim().min(1).max(100),
  priceMonth:  z.number().min(0).optional(),
  maxBranches: z.number().int().positive().optional(),
  maxUsers:    z.number().int().positive().optional(),
  maxOwners:   z.number().int().positive().optional().nullable(),
  maxPets:     z.number().int().positive().optional().nullable(),
  features:    z.record(z.boolean()).optional(),
}).strict()

export const updatePlanSchema = z.object({
  name:        z.string().trim().min(1).max(100).optional(),
  priceMonth:  z.number().min(0).optional(),
  maxBranches: z.number().int().positive().optional(),
  maxUsers:    z.number().int().positive().optional(),
  maxOwners:   z.number().int().positive().optional().nullable(),
  maxPets:     z.number().int().positive().optional().nullable(),
  features:    z.record(z.boolean()).optional(),
  isActive:    z.boolean().optional(),
}).strict()
```

- [ ] **Step 3: Run Task 3's tests to verify they now pass**

Run: `cd src/backend && npx jest --testPathPattern=platformContract -v -t maxpets`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/backend/controllers/platform-plans.controller.ts
git commit -m "feat(quota): accept maxPets in Plan create/update validation"
```

---

### Task 11: `platform-customers.controller.ts` — `maxPets` in quota-override validation

**Files:**
- Modify: `src/backend/controllers/platform-customers.controller.ts:51-56`
- Test: `src/backend/tests/integration/platformContract.test.ts` or `platformConsole.test.ts` (extend)

**Interfaces:**
- Produces: `setQuotaSchema` accepts `maxPets: number | null | undefined` — required for `CustomerDetailView.tsx`'s override save (Task 15) to succeed

- [ ] **Step 1: Write the failing test**

Add to `platformConsole.test.ts` (or wherever this suite's quota-override tests live):

```typescript
test('pc-maxpets-04: PUT /platform/customers/:id/quota accepts maxPets override', async () => {
  const res = await request(server)
    .put(`/platform/customers/${testTenantId}/quota`)
    .set(auth(platformToken))
    .send({ maxPets: 750 })
    .expect(200)
  expect(res.body.data.maxPets).toBe(750)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/backend && npx jest --testPathPattern=platformConsole -v -t "maxpets-04"`
Expected: FAIL — `.strict()` Zod schema rejects the unknown `maxPets` field with 400.

- [ ] **Step 3: Add `maxPets` to `setQuotaSchema`**

```typescript
export const setQuotaSchema = z.object({
  maxBranches: z.number().int().positive().optional().nullable(),
  maxUsers:    z.number().int().positive().optional().nullable(),
  maxOwners:   z.number().int().positive().optional().nullable(),
  maxPets:     z.number().int().positive().optional().nullable(),
}).strict()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/backend && npx jest --testPathPattern=platformConsole -v -t "maxpets-04"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backend/controllers/platform-customers.controller.ts src/backend/tests/integration/platformConsole.test.ts
git commit -m "feat(quota): accept maxPets in per-tenant quota override validation"
```

---

### Task 12: `usePlatformPlans.ts` — frontend types for `maxPets`

**Files:**
- Modify: `src/frontend/src/hooks/usePlatformPlans.ts:10-45`
- Test: `src/frontend/src/hooks/usePlatformPlans.test.ts` (extend)

**Interfaces:**
- Produces: `Plan.maxPets: number | null`, `CreatePlanPayload.maxPets: number | null` — consumed by Task 14

- [ ] **Step 1: Write the failing test**

Add to `usePlatformPlans.test.ts`, near the existing `toWirePayload` tests:

```typescript
test('toWirePayload passes maxPets through unchanged', () => {
  const payload: CreatePlanPayload = {
    key: 'test', name: 'Test', price: 0,
    maxBranches: 1, maxUsers: 5, maxOwners: 100, maxPets: 500,
  }
  const wire = toWirePayload(payload)
  expect(wire.maxPets).toBe(500)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/frontend && npx vitest run usePlatformPlans -t maxPets`
Expected: FAIL — TypeScript error, `CreatePlanPayload` has no `maxPets` field yet (or `wire.maxPets` is `undefined` if types are loosely checked in the test run).

- [ ] **Step 3: Add `maxPets` to `Plan` and `CreatePlanPayload`**

```typescript
export interface Plan {
  id:           number
  key:          string
  name:         string
  price:        number
  maxBranches:  number | null
  maxUsers:     number | null
  maxOwners:    number | null
  maxPets:      number | null
  features:     string[]
  isRetired:    boolean
  createdAt:    string | null
}

export interface CreatePlanPayload {
  key:          string
  name:         string
  price:        number
  maxBranches:  number | null
  maxUsers:     number | null
  maxOwners:    number | null
  maxPets:      number | null
  features?:    string[]
}
```

(`PlanWirePayload` needs no change — `toWirePayload()`'s `const { price, features, ...rest } = payload` spread already carries `maxPets` through via `rest` since it's not destructured out; no line changes needed there, only the interface additions above.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/frontend && npx vitest run usePlatformPlans -t maxPets`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/hooks/usePlatformPlans.ts src/frontend/src/hooks/usePlatformPlans.test.ts
git commit -m "feat(quota): add maxPets to Plan/CreatePlanPayload types"
```

---

### Task 13: `usePlatformCustomers.ts` — frontend types for `maxPets`

**Files:**
- Modify: `src/frontend/src/hooks/usePlatformCustomers.ts:22-56,113-142,167-178`
- Test: `src/frontend/src/hooks/usePlatformCustomers.normalization.test.ts` (extend)

**Interfaces:**
- Produces: `CustomerDetail.maxPets: number | null`, `UpdateQuotaPayload.maxPets?: number | null`, `CustomerUsage.pets: { current: number; limit: number | null }` — consumed by Task 15

- [ ] **Step 1: Write the failing test**

Add to `usePlatformCustomers.normalization.test.ts`:

```typescript
test('usage normalization includes pets dimension from caps.maxPets', () => {
  const raw = {
    branches: 1, users: 3, owners: 50, pets: 120,
    caps: { maxBranches: 3, maxUsers: 10, maxOwners: 500, maxPets: 500 },
    overPlan: false,
  }
  // Mirror the transform usePlatformCustomerUsage's queryFn applies —
  // extracted here as a pure check since the hook itself needs a QueryClient wrapper
  const usage = {
    branches: { current: raw.branches, limit: raw.caps.maxBranches },
    staff:    { current: raw.users,    limit: raw.caps.maxUsers },
    owners:   { current: raw.owners,   limit: raw.caps.maxOwners },
    pets:     { current: raw.pets,     limit: raw.caps.maxPets },
  }
  expect(usage.pets).toEqual({ current: 120, limit: 500 })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/frontend && npx vitest run usePlatformCustomers.normalization -t "pets dimension"`
Expected: FAIL — TypeScript error on `raw.caps.maxPets` (not yet in `RawUsage`), or `usage.pets` mismatch if loosely typed.

- [ ] **Step 3: Add `maxPets` to types and the usage transform**

Edit `CustomerDetail` (lines 22-31):

```typescript
export interface CustomerDetail extends Customer {
  email:         string | null
  phone:         string | null
  address:       string | null
  logoUrl:       string | null
  maxBranches:   number | null
  maxUsers:      number | null
  maxOwners:     number | null
  maxPets:       number | null
  companyTypeId: number | null
}
```

Edit `UpdateQuotaPayload` (lines 46-50):

```typescript
export interface UpdateQuotaPayload {
  maxBranches?: number | null
  maxUsers?:    number | null
  maxOwners?:   number | null
  maxPets?:     number | null
}
```

Edit `CustomerUsage` (lines 52-56):

```typescript
export interface CustomerUsage {
  branches: { current: number; limit: number | null }
  staff:    { current: number; limit: number | null }
  owners:   { current: number; limit: number | null }
  pets:     { current: number; limit: number | null }
}
```

Edit `RawUsage` and `usePlatformCustomerUsage()`'s transform (lines 113-142):

```typescript
interface RawUsage {
  branches: number
  users:    number
  owners:   number
  pets:     number
  caps: {
    maxBranches: number | null
    maxUsers:    number | null
    maxOwners:   number | null
    maxPets:     number | null
  }
  overPlan: boolean
}

export function usePlatformCustomerUsage(id: number) {
  return useQuery<CustomerUsage>({
    queryKey: KEYS.usage(id),
    queryFn: () =>
      platformApi.get(`/platform/customers/${id}/usage`).then((r) => {
        const raw = r.data.data as RawUsage
        const usage: CustomerUsage = {
          branches: { current: raw.branches, limit: raw.caps.maxBranches },
          staff:    { current: raw.users,    limit: raw.caps.maxUsers },
          owners:   { current: raw.owners,   limit: raw.caps.maxOwners },
          pets:     { current: raw.pets,     limit: raw.caps.maxPets },
        }
        return usage
      }),
    enabled: id > 0,
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/frontend && npx vitest run usePlatformCustomers.normalization -t "pets dimension"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/hooks/usePlatformCustomers.ts src/frontend/src/hooks/usePlatformCustomers.normalization.test.ts
git commit -m "feat(quota): add maxPets/pets dimension to customer quota+usage types"
```

---

### Task 14: `PlatformPlansView.tsx` — Max Pets field in the Plan editor

**Files:**
- Modify: `src/frontend/src/views/platform/PlatformPlansView.tsx:19-27,92-114,206-236`
- Test: `src/frontend/src/__tests__/PlatformConsole.test.tsx` (extend)

**Interfaces:**
- Consumes: `Plan.maxPets`, `CreatePlanPayload.maxPets` (Task 12)

- [ ] **Step 1: Write the failing test**

Add to `PlatformConsole.test.tsx`, near existing Plan-editor tests:

```typescript
test('creating a plan with a Max Pets value submits maxPets in the payload', async () => {
  renderPlatformPlansView() // use this suite's existing render helper
  await userEvent.click(screen.getByText('New Plan'))
  await userEvent.type(screen.getByLabelText('Key'), 'test_plan')
  await userEvent.type(screen.getByLabelText('Display Name'), 'Test Plan')
  await userEvent.type(screen.getByLabelText('Max Branches'), '2')
  await userEvent.type(screen.getByLabelText('Max Users'), '10')
  await userEvent.type(screen.getByLabelText('Max Pets'), '500')
  await userEvent.click(screen.getByText('Create Plan'))
  expect(mockCreatePlan).toHaveBeenCalledWith(
    expect.objectContaining({ maxPets: 500 }),
  )
})

test('plans table renders a Pets column with correct values, including infinity for null', () => {
  renderPlatformPlansView({ plans: [{ id: 1, key: 'clinic_plus', name: 'Clinic Plus', price: 0, maxBranches: 10, maxUsers: 100, maxOwners: null, maxPets: null, features: [], isRetired: false, createdAt: null }] })
  expect(screen.getByText('∞')).toBeInTheDocument()
})
```

(Use this file's existing mock/render conventions — `mockCreatePlan`, `renderPlatformPlansView`, or their equivalents as already named in the suite; adapt the exact helper names to what's already there.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/frontend && npx vitest run PlatformConsole -t "Max Pets"`
Expected: FAIL — no "Max Pets" label exists in the form yet.

- [ ] **Step 3: Add Max Pets to `EMPTY_FORM` and the form grid**

Edit `EMPTY_FORM` (lines 19-27):

```typescript
const EMPTY_FORM: CreatePlanPayload = {
  key:         '',
  name:        '',
  price:       0,
  maxBranches: 1,
  maxUsers:    5,
  maxOwners:   500,
  maxPets:     500,
  features:    [],
}
```

Edit the field grid in `PlanForm` (lines 92-114) — 4 columns instead of 3:

```tsx
<div className="grid grid-cols-4 gap-sm">
  {([
    { id: 'plan-branches', label: 'Max Branches', key: 'maxBranches' as const, min: 1, required: true,  placeholder: undefined },
    { id: 'plan-users',    label: 'Max Users',    key: 'maxUsers'    as const, min: 1, required: true,  placeholder: undefined },
    { id: 'plan-owners',   label: 'Max Clients',  key: 'maxOwners'   as const, min: 0, required: false, placeholder: 'Unlimited' },
    { id: 'plan-pets',     label: 'Max Pets',     key: 'maxPets'     as const, min: 0, required: false, placeholder: 'Unlimited' },
  ]).map((field) => (
    <div key={field.id}>
      <label className="block text-label-md text-on-surface-variant mb-xs" htmlFor={field.id}>
        {field.label}{field.required && <span className="text-error"> *</span>}
      </label>
      <input
        id={field.id}
        type="number"
        min={field.min}
        required={field.required}
        value={value[field.key] ?? ''}
        onChange={(e) => set(field.key, nullableInt(e.target.value))}
        placeholder={field.placeholder}
        className="w-full min-h-[44px] px-md border border-outline-variant rounded text-body-sm text-on-surface bg-surface focus:outline-none focus:border-secondary"
      />
    </div>
  ))}
</div>
```

Edit `openEdit()` (part of lines 142-154) to include `maxPets`:

```typescript
const openEdit = (plan: Plan) => {
  setEditingPlan(plan)
  setForm({
    key:         plan.key,
    name:        plan.name,
    price:       plan.price,
    maxBranches: plan.maxBranches,
    maxUsers:    plan.maxUsers,
    maxOwners:   plan.maxOwners,
    maxPets:     plan.maxPets,
    features:    plan.features,
  })
  setModalMode('edit')
}
```

Edit the plans table (lines 206-236) — add a "Pets" header cell and data cell:

```tsx
<th className="text-right px-md py-sm text-label-md text-on-surface-variant">Clients</th>
<th className="text-right px-md py-sm text-label-md text-on-surface-variant">Pets</th>
<th className="text-left px-md py-sm text-label-md text-on-surface-variant">Status</th>
```

```tsx
<td className="px-md py-sm text-body-sm text-on-surface-variant text-right">
  {plan.maxOwners ?? '∞'}
</td>
<td className="px-md py-sm text-body-sm text-on-surface-variant text-right">
  {plan.maxPets ?? '∞'}
</td>
```

(The `colSpan={8}` on the empty-state row becomes `colSpan={9}` since one column was added.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/frontend && npx vitest run PlatformConsole -t "Max Pets"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/views/platform/PlatformPlansView.tsx src/frontend/src/__tests__/PlatformConsole.test.tsx
git commit -m "feat(quota): add Max Pets field to Plan editor and plans table"
```

---

### Task 15: `CustomerDetailView.tsx` — Max Pets in the per-tenant override editor

**Files:**
- Modify: `src/frontend/src/views/platform/CustomerDetailView.tsx:213-245,283-302`
- Test: `src/frontend/src/__tests__/PlatformConsole.test.tsx` (extend)

**Interfaces:**
- Consumes: `CustomerDetail.maxPets`, `UpdateQuotaPayload.maxPets` (Task 13)

- [ ] **Step 1: Write the failing test**

Add to `PlatformConsole.test.tsx`:

```typescript
test('setting a Max Pets override submits it via PUT quota, and shows the effective value on load', async () => {
  renderCustomerDetailView({ customer: { ...baseCustomer, maxPets: 300 } }) // adapt to this suite's existing helper/fixture
  expect(screen.getByLabelText('Max Pets')).toHaveValue(300)
  await userEvent.clear(screen.getByLabelText('Max Pets'))
  await userEvent.type(screen.getByLabelText('Max Pets'), '400')
  await userEvent.click(screen.getByText('Save Quotas'))
  expect(mockSetCustomerQuota).toHaveBeenCalledWith(
    expect.objectContaining({ maxPets: 400 }),
  )
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/frontend && npx vitest run PlatformConsole -t "Max Pets override"`
Expected: FAIL — no "Max Pets" labeled input exists in `QuotaTab` yet.

- [ ] **Step 3: Add `maxPets` state, initialization, and the input field**

Edit `QuotaTab()` (lines 213-225):

```tsx
const [planId,      setPlanId]      = useState<number | null>(null)
const [maxBranches, setMaxBranches] = useState<string>('')
const [maxUsers,    setMaxUsers]    = useState<string>('')
const [maxOwners,   setMaxOwners]   = useState<string>('')
const [maxPets,     setMaxPets]     = useState<string>('')

const [initialized, setInitialized] = useState(false)
if (customer && !initialized) {
  setPlanId(customer.planId)
  setMaxBranches(customer.maxBranches !== null ? String(customer.maxBranches) : '')
  setMaxUsers(customer.maxUsers !== null ? String(customer.maxUsers) : '')
  setMaxOwners(customer.maxOwners !== null ? String(customer.maxOwners) : '')
  setMaxPets(customer.maxPets !== null ? String(customer.maxPets) : '')
  setInitialized(true)
}
```

Edit `handleSaveQuota()` (lines 237-244):

```typescript
const handleSaveQuota = () => {
  const payload: UpdateQuotaPayload = {
    maxBranches: maxBranches !== '' ? Number(maxBranches) : null,
    maxUsers:    maxUsers    !== '' ? Number(maxUsers)    : null,
    maxOwners:   maxOwners   !== '' ? Number(maxOwners)   : null,
    maxPets:     maxPets     !== '' ? Number(maxPets)     : null,
  }
  updateQuota.mutate(payload)
}
```

Edit the field array (lines 283-287):

```tsx
{([
  { id: 'maxBranches', label: 'Max Branches', value: maxBranches, set: setMaxBranches },
  { id: 'maxUsers',    label: 'Max Users',    value: maxUsers,    set: setMaxUsers },
  { id: 'maxOwners',   label: 'Max Clients',  value: maxOwners,   set: setMaxOwners },
  { id: 'maxPets',     label: 'Max Pets',     value: maxPets,     set: setMaxPets },
] as const).map((field) => (
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/frontend && npx vitest run PlatformConsole -t "Max Pets override"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/views/platform/CustomerDetailView.tsx src/frontend/src/__tests__/PlatformConsole.test.tsx
git commit -m "feat(quota): add Max Pets to per-tenant quota override editor"
```

---

### Task 16: `AdminUsage.tsx` — delete fake `PLAN_LIMITS`, render real caps

**Files:**
- Modify: `src/frontend/src/views/admin/AdminUsage.tsx` (entire file — see full replacement below)
- Test: new test file `src/frontend/src/views/admin/AdminUsage.test.tsx` (this view currently has no test file — confirmed by absence in the file structure survey; project convention co-locates view tests as `<ViewName>.test.tsx`)

**Interfaces:**
- Consumes: `GET /admin/usage` response's new `caps: { maxBranches, maxUsers, maxOwners, maxPets }` field (Task 9)

- [ ] **Step 1: Write the failing tests**

Create `src/frontend/src/views/admin/AdminUsage.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import AdminUsage from './AdminUsage'
import api from '../../utils/api'

vi.mock('../../utils/api')
vi.mock('../../hooks/useAdmin', () => ({
  useAdminSettings: () => ({ data: { tenant: { subdomain: 'testclinic' } } }),
}))
vi.mock('../../store/authStore', () => ({
  useAuthStore: (selector: any) => selector({ branchId: null }),
}))
vi.mock('../../components/BranchSwitcher', () => ({ default: () => null }))

function renderWithClient() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <AdminUsage />
    </QueryClientProvider>,
  )
}

test('renders real caps.maxUsers and caps.maxPets from the API response, not a hardcoded constant', async () => {
  (api.get as any).mockResolvedValue({
    data: { data: {
      totalPets: 5, totalOwners: 3, totalUsers: 3, activeUsers: 3,
      appointmentsThisMonth: 0, appointmentsToday: 0, invoicesThisMonth: 0, planTier: 'starter',
      caps: { maxBranches: 1, maxUsers: 10, maxOwners: 500, maxPets: 500 },
    } },
  })
  renderWithClient()
  expect(await screen.findByText('3 / 10')).toBeInTheDocument()
  expect(await screen.findByText('5 / 500')).toBeInTheDocument()
})

test('renders infinity for a null cap', async () => {
  (api.get as any).mockResolvedValue({
    data: { data: {
      totalPets: 5, totalOwners: 3, totalUsers: 3, activeUsers: 3,
      appointmentsThisMonth: 0, appointmentsToday: 0, invoicesThisMonth: 0, planTier: 'clinic_plus',
      caps: { maxBranches: null, maxUsers: null, maxOwners: null, maxPets: null },
    } },
  })
  renderWithClient()
  expect(await screen.findByText('3 / ∞')).toBeInTheDocument()
  expect(await screen.findByText('5 / ∞')).toBeInTheDocument()
})

test('PLAN_LIMITS identifier no longer exists in the source (regression guard)', async () => {
  const source = await import('./AdminUsage?raw' as any).catch(() => null)
  // Fallback check via fs if the `?raw` import isn't supported by this project's vitest config —
  // use a simple string-search test instead if so:
  const fs = await import('node:fs')
  const src = fs.readFileSync(new URL('./AdminUsage.tsx', import.meta.url), 'utf-8')
  expect(src).not.toContain('PLAN_LIMITS')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd src/frontend && npx vitest run AdminUsage`
Expected: FAIL — current component still uses `PLAN_LIMITS`, ignores `data.caps`.

- [ ] **Step 3: Rewrite `AdminUsage.tsx`**

Replace the full file:

```tsx
import { useQuery } from '@tanstack/react-query'
import api from '../../utils/api'
import { useAdminSettings } from '../../hooks/useAdmin'
import { useAuthStore } from '../../store/authStore'
import MaterialIcon from '../../components/MaterialIcon'
import BranchSwitcher from '../../components/BranchSwitcher'

interface QuotaCaps {
  maxBranches: number | null
  maxUsers: number | null
  maxOwners: number | null
  maxPets: number | null
}

interface Usage {
  totalPets: number; totalOwners: number; totalUsers: number; activeUsers: number
  appointmentsThisMonth: number; appointmentsToday: number; invoicesThisMonth: number; planTier: string
  caps: QuotaCaps
}

function formatCap(cap: number | null): string {
  return cap === null ? '∞' : String(cap)
}

function Bar({ value, max, color = 'bg-secondary' }: { value: number; max: number | null; color?: string }) {
  const effectiveMax = max === null ? Math.max(value, 1) : max
  const pct = max === null ? 0 : Math.min(100, Math.round((value / Math.max(effectiveMax, 1)) * 100))
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 bg-surface-container rounded-full h-2">
        <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }}/>
      </div>
      <span className="text-xs text-on-surface-variant w-10 text-right">{max === null ? '—' : `${pct}%`}</span>
    </div>
  )
}

export default function AdminUsage() {
  const branchId = useAuthStore(s => s.branchId)
  const { data, isLoading } = useQuery<Usage>({
    queryKey: ['admin', 'usage', branchId],
    queryFn: () => api.get('/admin/usage').then(r => r.data.data),
  })
  const { data: settings } = useAdminSettings()
  const tier = data?.planTier ?? 'starter'

  if (isLoading) return <div className="p-6 text-sm text-on-surface-variant">Loading…</div>
  if (!data) return null

  const caps = data.caps

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-md flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-on-surface">Usage statistics</h2>
          <p className="text-sm text-on-surface-variant mt-1">
            Plan: <span className="capitalize font-medium text-on-surface-variant">{tier}</span>
            {' · '}{settings?.tenant.subdomain}.anemal.app
          </p>
        </div>
        <BranchSwitcher />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Patients',          value: data.totalPets,             icon: 'pets' },
          { label: 'Owners',            value: data.totalOwners,           icon: 'person' },
          { label: 'Appts this month',  value: data.appointmentsThisMonth, icon: 'calendar_today' },
          { label: 'Invoices (month)',  value: data.invoicesThisMonth,     icon: 'receipt_long' },
        ].map(({ label, value, icon }) => (
          <div key={label} className="bg-surface border border-outline-variant rounded-xl p-4 text-center">
            <MaterialIcon name={icon} className="text-secondary mb-1" size={28} />
            <p className="text-2xl font-bold text-on-surface">{value}</p>
            <p className="text-xs text-on-surface-variant mt-1">{label}</p>
          </div>
        ))}
      </div>

      <div className="bg-surface border border-outline-variant rounded-2xl p-5 mb-6">
        <h3 className="text-sm font-semibold text-on-surface mb-4">Plan quota</h3>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-xs text-on-surface-variant mb-1">
              <span>Users</span>
              <span>{data.activeUsers} / {formatCap(caps.maxUsers)}</span>
            </div>
            <Bar value={data.activeUsers} max={caps.maxUsers}
              color={caps.maxUsers !== null && data.activeUsers / caps.maxUsers > 0.9 ? 'bg-error' : 'bg-secondary'}/>
          </div>
          <div>
            <div className="flex justify-between text-xs text-on-surface-variant mb-1">
              <span>Registered patients</span>
              <span>{data.totalPets} / {formatCap(caps.maxPets)}</span>
            </div>
            <Bar value={data.totalPets} max={caps.maxPets}
              color={caps.maxPets !== null && data.totalPets / caps.maxPets > 0.9 ? 'bg-warning' : 'bg-success'}/>
          </div>
        </div>
      </div>

      <div className="bg-surface border border-outline-variant rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-on-surface mb-3">Clinic summary</h3>
        <div className="divide-y divide-outline-variant">
          {[
            { label: 'Total staff accounts', value: data.totalUsers },
            { label: 'Active staff', value: data.activeUsers },
            { label: 'Inactive / deactivated', value: data.totalUsers - data.activeUsers },
            { label: 'Appointments today', value: data.appointmentsToday },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between py-2.5 text-sm min-h-[44px] items-center">
              <span className="text-on-surface-variant">{label}</span>
              <span className="font-semibold text-on-surface">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd src/frontend && npx vitest run AdminUsage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/views/admin/AdminUsage.tsx src/frontend/src/views/admin/AdminUsage.test.tsx
git commit -m "fix(quota): AdminUsage renders real effective quota, deletes fake PLAN_LIMITS"
```

---

## Self-Review

**Spec coverage:** Every task from `2026-07-19-usage-stats-quota-fix-tasks.md` (post-grill) is covered — USQ-1→Task 1, USQ-2.1→Task 3, USQ-2.2→Tasks 4+5+6 (all 3 resolver sites, 2 of which the original task doc undercounted — corrected here), USQ-2.3→Task 8, USQ-2.4→Task 9, USQ-2.5→Task 10, USQ-2.6→Tasks 6+7, USQ-3.1→Task 16, USQ-3.2→Task 14, USQ-3.3→Task 15, USQ-3.4→Tasks 12+13.

**Placeholder scan:** No "TBD"/"TODO"/"add appropriate handling" found. All code blocks are complete, runnable diffs against real, verified line numbers.

**Type consistency:** `maxPets: number | null` used identically across all 16 files. `assertCanAddPet` name matches between Task 6 (definition) and Task 7 (call site) and Task 9 is unaffected (uses `getEffectiveQuota`, a different export from the same module). `EffectiveTenantQuota` (subscription.service.ts) vs `EffectiveQuota` (platform-plans.service.ts) intentionally have similar-but-distinct names per ADR-0018 D-1 — verified no task conflates the two.

**Note on Task 16's test file:** `AdminUsage.tsx` has no pre-existing test file (verified — not found during file survey); this is a net-new test file, the only one in this plan. All other test changes extend existing files.
