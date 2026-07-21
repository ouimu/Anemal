# Billing VAT Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded 7%-exclusive VAT in billing with a clinic-configurable `vatMode` (`none`/`exclusive`/`inclusive`) + `vatRate` on `TenantSettings`, resolved server-side on every invoice (no more client-suppliable `taxRate`).

**Architecture:** `TenantSettings` gains `vatMode`/`vatRate` (migration backfills existing tenants to `exclusive`/`7` — zero behavior change). They ride on the *existing* `GET`/`PUT /api/settings/clinic` endpoints (`clinic.profile.view` / `clinic.profile.edit` — no new permission, no new route). `invoice.service.createInvoice()` drops the request-body `taxRate` entirely and resolves `vatMode`/`vatRate` from `TenantSettings` via the existing `getOrCreateSettings` upsert (which auto-backfills a missing row with schema defaults, closing BA Finding F3 for free). A single `computeVat()` pure function implements the 3-mode formula and is unit-tested directly. Frontend mirrors the same formula in `ClinicBilling.tsx` for the live cart preview, fetches `vatMode`/`vatRate` off the settings query the billing screen already has access to, and the Clinic Profile screen gets a VAT section using the existing profile PUT.

**Tech Stack:** Node/Express/Prisma/Zod (backend), React/TanStack Query/Tailwind (frontend), Jest + supertest (backend tests), Vitest + Testing Library (frontend tests).

## Global Constraints

- No new permission code, no new endpoint (ADR-0020 D3) — `vatMode`/`vatRate` are two more fields on the existing `clinicProfileSchema` / `GET|PUT /api/settings/clinic`.
- `vatRate` valid range is `0–100` (design spec, BA Finding F4 — resolver must also defensively clamp, not just trust the PUT-time Zod validation).
- Missing `TenantSettings` row is handled by the existing `getOrCreateSettings` upsert (`create: { tenantId }` applies schema defaults `vatMode='exclusive'`, `vatRate=7`) — BA Finding F3. No new fallback code needed.
- `taxable = subtotal - discount` in all three modes (ADR-0020, inclusive+discount interaction verified correct — no formula change from the design spec).
- Reuse the existing `round2()` pattern (`Math.round(n * 100) / 100`) for every new derived amount — no new rounding policy.
- Breaking change: `POST /api/invoices` no longer accepts `taxRate` in the request body (`createInvoiceSchema` stays `.strict()`) — every caller (hospitalization discharge, tests) must drop the field in the same task sequence that removes it, or those calls 400.
- `Invoice`/`InvoiceItem` Prisma models are unchanged — they still store the *resolved* `taxRate`/`taxAmount`/`totalAmount` per invoice; only the source of `taxRate` moves from the request body to `TenantSettings`. No retroactive recalculation of historical invoices.
- i18n keys go in both the English block and the Thai block of `src/frontend/src/i18n/index.ts` (flat `'clinic.x.y': '...'` key pattern, Phase 9 convention).

## File Structure

| File | Change |
|---|---|
| `src/backend/prisma/schema.prisma` | Modify — add `vatMode`/`vatRate` to `TenantSettings` |
| `src/backend/prisma/migrations/<ts>_add_tenant_settings_vat/migration.sql` | **Create** — the only new file outside test files |
| `src/backend/services/tenant-settings.service.ts` | Modify — extend `TenantSettingsInput` |
| `src/backend/controllers/settings.controller.ts` | Modify — extend `clinicProfileSchema` |
| `src/backend/services/invoice.service.ts` | Modify — drop `taxRate` from schema, add `computeVat()`, resolve settings server-side |
| `src/backend/services/hospitalization.service.ts` | Modify — drop hardcoded `taxRate: 7` at the discharge call site |
| `src/backend/services/pdf.service.ts` | Modify — VAT line hidden when `taxAmount<=0`, mode-aware label |
| `src/frontend/src/hooks/useClinicSettings.ts` | Modify — add `VatMode` type, extend `ClinicSettingsData`/`ClinicProfileInput` |
| `src/frontend/src/views/settings/ClinicProfilePage.tsx` | Modify — add VAT section (mode selector + rate input) |
| `src/frontend/src/hooks/useInvoices.ts` | Modify — drop `taxRate` from `CreateInvoicePayload` |
| `src/frontend/src/views/clinic/ClinicBilling.tsx` | Modify — drop `TAX_RATE`, add `calcVat()`, fetch settings, mode-aware labels |
| `src/frontend/src/i18n/index.ts` | Modify — add VAT mode/label keys (EN + TH) |
| `src/backend/tests/integration/settings-api.test.ts` | Modify — VAT roundtrip + permission-boundary tests |
| `src/backend/tests/integration/phase4.test.ts` | Modify — drop request-side `taxRate: 7` (2 call sites) |
| `src/backend/tests/integration/pdf.test.ts` | Modify — drop request-side `taxRate: 7` (2 call sites) |
| `src/backend/tests/integration/vat-config.test.ts` | **Create** — 3-mode calculation coverage (new capability, own suite) |
| `src/frontend/src/__tests__/ClinicBilling.test.tsx` | Modify — unit-test `calcVat()` for all 3 modes |

---

### Task 1: Prisma schema — add `vatMode`/`vatRate` to `TenantSettings`

**Files:**
- Modify: `src/backend/prisma/schema.prisma:88-123` (inside `model TenantSettings { ... }`)

**Interfaces:**
- Produces: `TenantSettings.vatMode: string` (default `"exclusive"`), `TenantSettings.vatRate: Decimal` (default `7`, `@db.Decimal(5,2)`) — consumed by Task 2 (service type) and Task 5 (invoice resolution).

- [ ] **Step 1: Add the two fields to the model**

Insert immediately after the `labApiKey String?` line (schema.prisma line 123):

```prisma
  labApiKey            String?
  \ Billing VAT Configuration (ADR-0020) — tenant-wide, admin-editable
  vatMode              String   @default("exclusive") @db.VarChar(20) // 'none' | 'exclusive' | 'inclusive'
  vatRate              Decimal  @default(7) @db.Decimal(5, 2)
```

- [ ] **Step 2: Generate the migration**

Run: `cd D:\Development\AnimalClinic && npx prisma migrate dev --name add_tenant_settings_vat --schema=src/backend/prisma/schema.prisma`

Expected: creates `src/backend/prisma/migrations/<timestamp>_add_tenant_settings_vat/migration.sql` containing two `ALTER TABLE "TenantSettings" ADD COLUMN ... NOT NULL DEFAULT ...` statements. Postgres backfills existing rows to the default in the same statement — no separate `UPDATE` needed (zero behavior change for existing tenants, satisfies the backfill requirement).

- [ ] **Step 3: Verify the migration SQL**

Read the generated `migration.sql` and confirm it contains exactly:
```sql
ALTER TABLE "TenantSettings" ADD COLUMN "vatMode" VARCHAR(20) NOT NULL DEFAULT 'exclusive';
ALTER TABLE "TenantSettings" ADD COLUMN "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 7;
```

- [ ] **Step 4: Commit**

```bash
git add src/backend/prisma/schema.prisma src/backend/prisma/migrations
git commit -m "feat(billing): add vatMode/vatRate to TenantSettings"
```

---

### Task 2: `tenant-settings.service.ts` — extend `TenantSettingsInput`

**Files:**
- Modify: `src/backend/services/tenant-settings.service.ts:11-36`

**Interfaces:**
- Consumes: nothing new (existing `getOrCreateSettings`/`updateSettings` already pass through unknown-to-them fields).
- Produces: `TenantSettingsInput.vatMode?: string`, `TenantSettingsInput.vatRate?: number` — consumed by Task 3 (`updateClinicProfile` passes `rest` of this type through).

- [ ] **Step 1: Add the two optional fields to the interface**

In the `TenantSettingsInput` interface, after the `labApiKey?: string` line:

```typescript
  labApiKey?:           string
  vatMode?:             string
  vatRate?:             number
```

- [ ] **Step 2: Commit**

```bash
git add src/backend/services/tenant-settings.service.ts
git commit -m "feat(billing): extend TenantSettingsInput with vatMode/vatRate"
```

(No new test here — `updateSettings()`'s generic field-diff loop already handles any key present in the interface; Task 6 exercises it end-to-end via the HTTP layer.)

---

### Task 3: `settings.controller.ts` — extend `clinicProfileSchema`

**Files:**
- Modify: `src/backend/controllers/settings.controller.ts:15-23`

**Interfaces:**
- Consumes: `TenantSettingsInput` (Task 2).
- Produces: `clinicProfileSchema` now validates `vatMode`/`vatRate` on `PUT /api/settings/clinic`; `getClinicSettings` (unchanged handler) returns them on `GET` because `settingsSvc.getSettings()` returns the full Prisma row.

- [ ] **Step 1: Add the two fields to the Zod schema**

```typescript
export const clinicProfileSchema = z.object({
  name:    z.string().trim().min(1).max(255).optional(),
  logoUrl: z.string().url().optional().or(z.literal('')),
  address: z.string().trim().max(1000).optional(),
  phone:   z.string().trim().max(50).optional(),
  email:   z.string().email().optional().or(z.literal('')),
  taxId:   z.string().trim().max(50).optional(),
  website: z.string().trim().max(255).optional(),
  vatMode: z.enum(['none', 'exclusive', 'inclusive']).optional(),
  vatRate: z.number().min(0).max(100).optional(),
}).strict()
```

- [ ] **Step 2: Commit**

```bash
git add src/backend/controllers/settings.controller.ts
git commit -m "feat(billing): validate vatMode/vatRate on PUT /api/settings/clinic"
```

---

### Task 4: Settings API tests — VAT roundtrip + permission boundary

**Files:**
- Modify: `src/backend/tests/integration/settings-api.test.ts` (append new `describe` block after line 180, before `TC-S004`)

**Interfaces:**
- Consumes: `adminA`, `staffA`, `doctorA`, `adminB` tokens and `tidA` (already set up in this file's `beforeAll`, Tasks 1-3 implemented).

- [ ] **Step 1: Write the failing tests**

Insert after the `TC-S003` block (after line 180, before the `TC-S004` describe):

```typescript
describe('TC-S008 — VAT config rides on the existing clinic settings endpoints (ADR-0020)', () => {
  it('admin PUT vatMode/vatRate → 200, roundtrips on GET', async () => {
    const put = await request(server)
      .put('/api/settings/clinic')
      .set('Authorization', `Bearer ${adminA}`)
      .send({ vatMode: 'inclusive', vatRate: 8.5 })
    expect(put.status).toBe(200)
    expect(put.body.data.vatMode).toBe('inclusive')
    expect(Number(put.body.data.vatRate)).toBe(8.5)

    const get = await request(server).get('/api/settings/clinic').set('Authorization', `Bearer ${adminA}`)
    expect(get.status).toBe(200)
    expect(get.body.data.vatMode).toBe('inclusive')
    expect(Number(get.body.data.vatRate)).toBe(8.5)

    // Reset to defaults so later tests (invoice creation) see the standard 7% exclusive.
    await request(server).put('/api/settings/clinic').set('Authorization', `Bearer ${adminA}`)
      .send({ vatMode: 'exclusive', vatRate: 7 })
  })

  it('staff can read vatMode/vatRate via GET (clinic.profile.view)', async () => {
    const res = await request(server).get('/api/settings/clinic').set('Authorization', `Bearer ${staffA}`)
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveProperty('vatMode')
    expect(res.body.data).toHaveProperty('vatRate')
  })

  it('staff PUT vatMode → 403 (no clinic.profile.edit)', async () => {
    const res = await request(server)
      .put('/api/settings/clinic')
      .set('Authorization', `Bearer ${staffA}`)
      .send({ vatMode: 'none' })
    expect(res.status).toBe(403)
  })

  it('invalid vatMode → 400', async () => {
    const res = await request(server)
      .put('/api/settings/clinic')
      .set('Authorization', `Bearer ${adminA}`)
      .send({ vatMode: 'bogus' })
    expect(res.status).toBe(400)
  })

  it('vatRate out of 0-100 range → 400', async () => {
    const res = await request(server)
      .put('/api/settings/clinic')
      .set('Authorization', `Bearer ${adminA}`)
      .send({ vatRate: 150 })
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd D:\Development\AnimalClinic && npx jest src/backend/tests/integration/settings-api.test.ts -t "TC-S008"`
Expected: FAIL — `vatMode`/`vatRate` not yet recognized (or PASS coincidentally, but only after Tasks 1-3 are actually in place; if run before those tasks, expect `additionalProperties`/400 failures on the valid-field tests).

- [ ] **Step 3: Run again after Tasks 1-3 land**

Run: `cd D:\Development\AnimalClinic && npx jest src/backend/tests/integration/settings-api.test.ts -t "TC-S008"`
Expected: PASS (5/5).

- [ ] **Step 4: Commit**

```bash
git add src/backend/tests/integration/settings-api.test.ts
git commit -m "test(billing): VAT config roundtrip + permission boundary on settings API"
```

---

### Task 5: `invoice.service.ts` — `computeVat()` + server-side resolution, drop request `taxRate`

**Files:**
- Modify: `src/backend/services/invoice.service.ts`

**Interfaces:**
- Consumes: `tenantSettingsRepo.getOrCreateSettings(tenantId): Promise<{ vatMode: string; vatRate: Decimal; ... }>` from `src/backend/models/tenant-settings.repository.ts` (existing, Task 1 adds the two fields to its return shape automatically since it does a full-row upsert).
- Produces: `export type VatMode = 'none' | 'exclusive' | 'inclusive'`, `export function computeVat(mode: VatMode, rate: number, taxable: number): { taxRate: number; taxAmount: number; totalAmount: number }` — consumed by Task 8 (backend VAT test suite) directly, and internally by `createInvoice`.

- [ ] **Step 1: Remove `taxRate` from the request schema**

In `createInvoiceSchema` (line 19-27), delete the `taxRate` line:

```typescript
export const createInvoiceSchema = z.object({
  medicalRecordId: z.number().int().positive().optional().nullable(),
  petId:           z.number().int().positive().optional().nullable(),
  items:           z.array(invoiceItemSchema).default([]),
  discount:        z.number().nonnegative().default(0),
  discountReason:  z.string().max(255).optional().nullable(),
  notes:           z.string().optional().nullable(),
}).strict()
```

- [ ] **Step 2: Add the `VatMode` type and `computeVat()` pure function**

Add after the `round2` helper (after line 41):

```typescript
const round2 = (n: number): number => Math.round(n * 100) / 100

export type VatMode = 'none' | 'exclusive' | 'inclusive'

// Server is the sole source of truth for VAT (ADR-0020 D2). taxable = subtotal - discount
// in all three modes. Rate is defensively clamped 0-100 even though the settings PUT already
// validates it (BA Finding F4 — this function is the security boundary, not the UI).
export function computeVat(
  mode: VatMode, rate: number, taxable: number,
): { taxRate: number; taxAmount: number; totalAmount: number } {
  const safeRate = Math.min(100, Math.max(0, Number(rate) || 0))
  if (mode === 'none') {
    return { taxRate: 0, taxAmount: 0, totalAmount: round2(taxable) }
  }
  if (mode === 'inclusive') {
    const taxAmount = round2(taxable - taxable / (1 + safeRate / 100))
    return { taxRate: safeRate, taxAmount, totalAmount: round2(taxable) }
  }
  // exclusive
  const taxAmount = round2((taxable * safeRate) / 100)
  return { taxRate: safeRate, taxAmount, totalAmount: round2(taxable + taxAmount) }
}
```

- [ ] **Step 3: Resolve tenant VAT settings and use `computeVat()` in `createInvoice`**

Add the repository import near the top (after the existing `invoiceRepo` import, line 5):

```typescript
import * as tenantSettingsRepo from '../models/tenant-settings.repository'
```

Replace lines 79-83 (`const subtotal ... const totalAmount = round2(taxable + taxAmount)`) with:

```typescript
  const subtotal = round2(builtItems.reduce((sum, i) => sum + i.totalPrice, 0))
  const discount = Math.min(round2(data.discount), subtotal)
  const taxable  = subtotal - discount

  // Resolve VAT server-side from tenant settings — never from the request body
  // (ADR-0020 D2, closes the cashier taxRate-tampering vector). getOrCreateSettings
  // upserts a row with schema defaults (vatMode='exclusive', vatRate=7) if none exists
  // yet for this tenant, so this never throws for a tenant with no settings row (BA F3).
  const settings = await tenantSettingsRepo.getOrCreateSettings(tenantId)
  const { taxRate, taxAmount, totalAmount } = computeVat(
    settings.vatMode as VatMode, Number(settings.vatRate), taxable,
  )
```

The `return invoiceRepo.createInvoice(...)` call below stays unchanged — `taxRate`, `taxAmount`, `totalAmount` now come from the destructured `computeVat()` result instead of `data.taxRate`.

- [ ] **Step 4: Commit**

```bash
git add src/backend/services/invoice.service.ts
git commit -m "feat(billing): resolve VAT server-side via computeVat(), drop client taxRate"
```

---

### Task 6: `hospitalization.service.ts` — drop hardcoded `taxRate: 7`

**Files:**
- Modify: `src/backend/services/hospitalization.service.ts:96-100`

**Interfaces:**
- Consumes: `invoiceService.createInvoice()` (Task 5's new `.strict()` schema — `taxRate` is now an unknown key and would 400/throw if left in).

- [ ] **Step 1: Remove the field**

```typescript
    invoice = await invoiceService.createInvoice(tenantId, branchId, {
      petId: h.petId,
      items: [{ description: `Hospitalization (${days} day${days > 1 ? 's' : ''})`, itemType: 'service', qty: days, unitPrice: rate }],
      discount: 0,
    }, createdBy)
```

- [ ] **Step 2: Run the existing discharge test to confirm it still passes**

Run: `cd D:\Development\AnimalClinic && npx jest src/backend/tests/integration/phase4.test.ts -t "discharge generates an invoice"`
Expected: PASS (this test doesn't assert on `taxRate`/`taxAmount` values, only that `invoice` is not null — see Task 7 for the other `taxRate: 7` call sites in this same file).

- [ ] **Step 3: Commit**

```bash
git add src/backend/services/hospitalization.service.ts
git commit -m "fix(billing): drop hardcoded taxRate from hospitalization discharge invoice"
```

---

### Task 7: Fix remaining `taxRate: 7` request bodies in existing tests

**Files:**
- Modify: `src/backend/tests/integration/phase4.test.ts:99` and `:187`
- Modify: `src/backend/tests/integration/pdf.test.ts:63` and `:187`

**Interfaces:**
- Consumes: Task 5's `.strict()` `createInvoiceSchema` (these 4 call sites currently send `taxRate: 7` in the POST body and will 400 once `taxRate` is an unknown key).

- [ ] **Step 1: `phase4.test.ts` line 99 — remove `taxRate: 7`**

```typescript
    const inv = await request(server).post('/api/invoices').set('Authorization', `Bearer ${adminA}`)
      .send({ petId, items: [{ description: 'Consult', itemType: 'service', qty: 1, unitPrice: 1000 }] })
```

(Comment on line 97 already says "+7% VAT" — that's still accurate since the seeded tenant's `TenantSettings` defaults to `exclusive`/`7` per Task 1's migration backfill.)

- [ ] **Step 2: `phase4.test.ts` line 187 — remove `taxRate: 7`**

```typescript
        petId: petRes.body.data.id,
        items: [{ description: 'ค่าตรวจ Exam 250', itemType: 'service', qty: 1, unitPrice: 250 }],
      })
```

- [ ] **Step 3: `pdf.test.ts` line 63 — remove `taxRate: 7`**

```typescript
    .send({
      petId: petRes.body.data.id,
      items: [{ description: 'Consultation', itemType: 'service', qty: 1, unitPrice: 500 }],
    })
```

- [ ] **Step 4: `pdf.test.ts` line 187 — remove `taxRate: 7`**

```typescript
      .send({
        petId: petRes.body.data.id,
        items: [{ description: 'ค่าตรวจ Exam 250', itemType: 'service', qty: 1, unitPrice: 250 }],
      })
```

- [ ] **Step 5: Run both suites**

Run: `cd D:\Development\AnimalClinic && npx jest src/backend/tests/integration/phase4.test.ts src/backend/tests/integration/pdf.test.ts`
Expected: PASS (all tests in both files — no test in either file asserts a specific `taxRate`/`taxAmount` value, they only check `status`/existence, per the exploration of these files during planning).

- [ ] **Step 6: Commit**

```bash
git add src/backend/tests/integration/phase4.test.ts src/backend/tests/integration/pdf.test.ts
git commit -m "test(billing): drop request-side taxRate now that createInvoiceSchema is strict"
```

---

### Task 8: New backend test suite — 3-mode VAT calculation + missing-settings-row fallback

**Files:**
- Create: `src/backend/tests/integration/vat-config.test.ts`

**Interfaces:**
- Consumes: `computeVat` from `src/backend/services/invoice.service.ts` (Task 5) for pure unit assertions; live `POST /api/invoices` + `PUT /api/settings/clinic` for the end-to-end mode assertions.

- [ ] **Step 1: Write the pure-function unit tests (no server needed)**

```typescript
// Unit coverage for the 3-mode VAT formula (ADR-0020) — pure function, no DB/HTTP needed.
import { computeVat } from '../../services/invoice.service'

describe('computeVat — pure 3-mode formula (ADR-0020)', () => {
  it('none: no tax, total = taxable', () => {
    expect(computeVat('none', 7, 1000)).toEqual({ taxRate: 0, taxAmount: 0, totalAmount: 1000 })
  })

  it('exclusive: tax added on top', () => {
    expect(computeVat('exclusive', 7, 1000)).toEqual({ taxRate: 7, taxAmount: 70, totalAmount: 1070 })
  })

  it('inclusive: tax extracted, total unchanged', () => {
    const r = computeVat('inclusive', 7, 1070)
    expect(r.taxRate).toBe(7)
    expect(r.totalAmount).toBe(1070)
    expect(r.taxAmount).toBeCloseTo(70, 1)
  })

  it('inclusive + discount: discount applied before VAT extraction (ADR-0020 verified-correct case)', () => {
    // taxable = 1070 (inclusive price) - 100 (discount) = 970
    const r = computeVat('inclusive', 7, 970)
    expect(r.totalAmount).toBe(970)
    expect(r.taxAmount).toBeCloseTo(63.46, 1)
  })

  it('defensive clamp: out-of-range rate is clamped to [0,100] (BA Finding F4)', () => {
    expect(computeVat('exclusive', 150, 1000).taxRate).toBe(100)
    expect(computeVat('exclusive', -5, 1000).taxRate).toBe(0)
  })
})
```

- [ ] **Step 2: Run to verify they fail (module doesn't export `computeVat` yet if Task 5 hasn't landed, or pass if it has — run before Task 5 to confirm red)**

Run: `cd D:\Development\AnimalClinic && npx jest src/backend/tests/integration/vat-config.test.ts`
Expected: PASS once Task 5 is complete (this task should be sequenced after Task 5 in execution).

- [ ] **Step 3: Add the end-to-end mode-switch test against a live tenant**

Append to the same file — reuses the standard login/seed pattern from `settings-api.test.ts`:

```typescript
import request from 'supertest'
import { Server } from 'http'
import bcrypt from 'bcrypt'
import app from '../../app'
import prisma from '../../config/db'
import { seedUserRoles, cleanupUserRoles } from '../helpers/seedUserRoles'

describe('VAT mode end-to-end — invoice reflects tenant TenantSettings, not request body', () => {
  const SUB = 'vat-config-e2e'
  const PASSWORD = 'TestPass1!'
  let server: Server
  let tid = 0
  let admin = ''
  let petId = 0

  beforeAll(async () => {
    await new Promise<void>(resolve => { server = app.listen(0, resolve) })
    server.keepAliveTimeout = 0

    const t = await prisma.tenant.create({ data: { name: 'VAT E2E', subdomain: SUB } })
    tid = t.id
    await prisma.branch.create({ data: { tenantId: tid, name: 'Main' } })
    const passwordHash = await bcrypt.hash(PASSWORD, 4)
    const adminRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_admin', tenantId: null } })
    await prisma.user.create({ data: { tenantId: tid, name: 'Admin', username: 'vat_e2e_admin', email: 'vat@e2e.test', passwordHash, roleId: adminRole.id } })
    const u = await prisma.user.findFirstOrThrow({ where: { tenantId: tid, username: 'vat_e2e_admin' } })
    await seedUserRoles(prisma, [{ userId: u.id, tenantId: tid, roleKey: 'clinic_admin' }])

    const step1 = await request(server).post('/auth/login').send({ subdomain: SUB, username: 'vat_e2e_admin', password: PASSWORD })
    admin = step1.body.data.requiresBranchSelection === false
      ? step1.body.data.token
      : (await request(server).post('/auth/select-branch').send({ pendingToken: step1.body.data.pendingToken, branchId: step1.body.data.branches[0].id })).body.data.token

    const ownerRes = await request(server).post('/api/owners').set('Authorization', `Bearer ${admin}`)
      .send({ firstName: 'Vat', lastName: 'Owner', phone: `09${Date.now()}`.slice(0, 10) })
    const petRes = await request(server).post('/api/pets').set('Authorization', `Bearer ${admin}`)
      .send({ ownerId: ownerRes.body.data.id, name: 'Taxy', species: 'dog' })
    petId = petRes.body.data.id
  })

  afterAll(async () => {
    await cleanupUserRoles(prisma, [tid])
    await prisma.tenantSettings.deleteMany({ where: { tenantId: tid } })
    await prisma.user.deleteMany({ where: { tenantId: tid } })
    await prisma.branch.deleteMany({ where: { tenantId: tid } })
    await prisma.tenant.deleteMany({ where: { id: tid } })
    await prisma.$disconnect()
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  })

  it('new tenant with no TenantSettings row defaults to exclusive/7% (BA Finding F3)', async () => {
    const res = await request(server).post('/api/invoices').set('Authorization', `Bearer ${admin}`)
      .send({ petId, items: [{ description: 'Exam', itemType: 'service', qty: 1, unitPrice: 100 }] })
    expect(res.status).toBe(201)
    expect(Number(res.body.data.taxRate)).toBe(7)
    expect(Number(res.body.data.taxAmount)).toBe(7)
    expect(Number(res.body.data.totalAmount)).toBe(107)
  })

  it('switching tenant to vatMode=none → new invoice has zero tax', async () => {
    await request(server).put('/api/settings/clinic').set('Authorization', `Bearer ${admin}`).send({ vatMode: 'none' })
    const res = await request(server).post('/api/invoices').set('Authorization', `Bearer ${admin}`)
      .send({ petId, items: [{ description: 'Exam', itemType: 'service', qty: 1, unitPrice: 100 }] })
    expect(res.status).toBe(201)
    expect(Number(res.body.data.taxAmount)).toBe(0)
    expect(Number(res.body.data.totalAmount)).toBe(100)
  })

  it('switching tenant to vatMode=inclusive, rate=10 → tax extracted, total unchanged', async () => {
    await request(server).put('/api/settings/clinic').set('Authorization', `Bearer ${admin}`).send({ vatMode: 'inclusive', vatRate: 10 })
    const res = await request(server).post('/api/invoices').set('Authorization', `Bearer ${admin}`)
      .send({ petId, items: [{ description: 'Exam', itemType: 'service', qty: 1, unitPrice: 110 }] })
    expect(res.status).toBe(201)
    expect(Number(res.body.data.totalAmount)).toBe(110)
    expect(Number(res.body.data.taxAmount)).toBeCloseTo(10, 1)
  })

  it('a client-supplied taxRate in the request body is rejected (breaking change, D2)', async () => {
    const res = await request(server).post('/api/invoices').set('Authorization', `Bearer ${admin}`)
      .send({ petId, items: [{ description: 'Exam', itemType: 'service', qty: 1, unitPrice: 100 }], taxRate: 99 })
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 4: Run the full new suite**

Run: `cd D:\Development\AnimalClinic && npx jest src/backend/tests/integration/vat-config.test.ts`
Expected: PASS (9/9 — 5 unit + 4 e2e).

- [ ] **Step 5: Commit**

```bash
git add src/backend/tests/integration/vat-config.test.ts
git commit -m "test(billing): 3-mode VAT calculation + missing-settings-row fallback coverage"
```

---

### Task 9: `pdf.service.ts` — mode-aware, hideable VAT line

**Files:**
- Modify: `src/backend/services/pdf.service.ts:123-141`

**Interfaces:**
- Consumes: `inv.subtotal`, `inv.discount`, `inv.taxRate`, `inv.taxAmount`, `inv.totalAmount` (all already loaded via `invoiceRepo.findInvoiceById`, unchanged).

- [ ] **Step 1: Replace the totals block**

Replace lines 123-141 with:

```typescript
  // ── Totals block ─────────────────────────────────────────────────────────────
  const subtotal    = Number(inv.subtotal)
  const discount    = Number(inv.discount)
  const taxRate     = Number(inv.taxRate)
  const taxAmount   = Number(inv.taxAmount)
  const totalAmount = Number(inv.totalAmount)
  const taxable     = subtotal - discount

  row2(doc, y,      'Subtotal',               baht(subtotal))
  y += 16
  if (discount > 0) {
    row2(doc, y, `Discount${inv.discountReason ? ` (${inv.discountReason})` : ''}`, `-${baht(discount)}`)
    y += 16
  }
  // Hide the VAT line entirely for vatMode='none' invoices (taxAmount is 0) — ADR-0020 F6.
  // Mode isn't stored on Invoice itself; inclusive vs exclusive is derived from whether
  // totalAmount equals taxable (inclusive: tax was already in the price) or exceeds it
  // (exclusive: tax was added on top) — no schema change needed for the label.
  if (taxAmount > 0) {
    const isInclusive = Math.abs(totalAmount - taxable) < 0.01
    const label = isInclusive ? `VAT ${taxRate}% (incl.)` : `VAT ${taxRate}%`
    row2(doc, y, label, baht(taxAmount))
    y += 16
  }
  hRule(doc, y)
  y += 8
  row2(doc, y, 'Total', baht(totalAmount), { bold: true, large: true })
  y += 22
```

- [ ] **Step 2: Run the PDF test suite**

Run: `cd D:\Development\AnimalClinic && npx jest src/backend/tests/integration/pdf.test.ts`
Expected: PASS — existing tests only assert `%PDF` magic bytes / status codes, not line contents, so this is a safe visual change under current coverage.

- [ ] **Step 3: Commit**

```bash
git add src/backend/services/pdf.service.ts
git commit -m "feat(billing): mode-aware, hideable VAT line on invoice PDF (ADR-0020 F6)"
```

---

### Task 10: `useClinicSettings.ts` — add `VatMode` type + extend data shapes

**Files:**
- Modify: `src/frontend/src/hooks/useClinicSettings.ts`

**Interfaces:**
- Produces: `export type VatMode = 'none' | 'exclusive' | 'inclusive'`, `ClinicSettingsData.vatMode: VatMode`, `ClinicSettingsData.vatRate: string`, `ClinicProfileInput.vatMode?: VatMode`, `ClinicProfileInput.vatRate?: number` — consumed by Task 11 (`ClinicProfilePage.tsx`) and Task 13 (`ClinicBilling.tsx`).

- [ ] **Step 1: Add the type and extend both interfaces**

At the top of the file, after the imports:

```typescript
export type VatMode = 'none' | 'exclusive' | 'inclusive'
```

In `ClinicSettingsData`, after `taxId: string | null,`:

```typescript
  taxId:                string | null
  vatMode:               VatMode
  vatRate:                string
```

In `ClinicProfileInput`, after `taxId?: string,`:

```typescript
  taxId?:   string
  vatMode?: VatMode
  vatRate?: number
```

- [ ] **Step 2: Commit**

```bash
git add src/frontend/src/hooks/useClinicSettings.ts
git commit -m "feat(billing): add VatMode type + vatMode/vatRate to clinic settings hook"
```

---

### Task 11: `ClinicProfilePage.tsx` — VAT section UI

**Files:**
- Modify: `src/frontend/src/views/settings/ClinicProfilePage.tsx`

**Interfaces:**
- Consumes: `VatMode`, `ClinicSettingsData.vatMode/vatRate`, `ClinicProfileInput.vatMode/vatRate` (Task 10).

- [ ] **Step 1: Extend `FormState` and its initializer**

```typescript
interface FormState {
  name:    string
  phone:   string
  address: string
  taxId:   string
  website: string
  email:   string
  logoUrl: string
  vatMode: VatMode
  vatRate: string
}
```

Update the import line to bring in the type:

```typescript
import { useClinicSettings, useUpdateClinicProfile, type VatMode } from '../../hooks/useClinicSettings'
```

Update the `useState<FormState>` initializer:

```typescript
  const [form, setForm] = useState<FormState>({
    name: '', phone: '', address: '', taxId: '', website: '', email: '', logoUrl: '',
    vatMode: 'exclusive', vatRate: '7',
  })
```

Update the `useEffect` that hydrates from `data`:

```typescript
  useEffect(() => {
    if (!data) return
    setForm({
      name:    data.tenant.name ?? '',
      phone:   data.phone    ?? '',
      address: data.address  ?? '',
      taxId:   data.taxId    ?? '',
      website: data.website  ?? '',
      email:   data.email    ?? '',
      logoUrl: data.logoUrl  ?? '',
      vatMode: data.vatMode  ?? 'exclusive',
      vatRate: data.vatRate  ?? '7',
    })
  }, [data])
```

- [ ] **Step 2: Include the new fields in `handleSave`'s payload**

`handleSave` currently calls `update.mutateAsync(form)` — `form` already includes `vatMode`/`vatRate` after Step 1, but `vatRate` is a string in form state and the API expects a number. Update the save call:

```typescript
  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    try {
      await update.mutateAsync({ ...form, vatRate: Number(form.vatRate) })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch {
      // error displayed via update.error
    }
  }
```

- [ ] **Step 3: Add the VAT section to the JSX**

Insert after the "Tax ID" field block (after line 193's closing `</div>`, before the "Website URL" block):

```tsx
        {/* VAT Configuration (ADR-0020) */}
        <div className="flex flex-col gap-xs">
          <label className="text-body-sm font-medium text-on-surface-variant">VAT</label>
          <div className="flex gap-sm">
            {([['none', 'No VAT'], ['exclusive', 'VAT Exclusive'], ['inclusive', 'VAT Inclusive']] as const).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setForm(p => ({ ...p, vatMode: mode }))}
                className={`min-h-[44px] px-md rounded-xl text-body-sm font-medium border transition-colors ${
                  form.vatMode === mode ? 'border-primary bg-surface-container-low text-primary' : 'border-outline-variant text-on-surface-variant'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {form.vatMode !== 'none' && (
            <div className="flex items-center gap-sm mt-xs">
              <label className="text-body-sm text-on-surface-variant" htmlFor="vatRate">Rate (%)</label>
              <input
                id="vatRate"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={form.vatRate}
                onChange={e => setForm(p => ({ ...p, vatRate: e.target.value }))}
                className="w-28 min-h-[44px] px-md border border-outline-variant rounded-xl text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary"
              />
            </div>
          )}
        </div>
```

- [ ] **Step 4: Verify with a manual dev-server check (no dedicated test file exists for this page)**

Run: `cd D:\Development\AnimalClinic && npm --prefix src/frontend run build`
Expected: TypeScript compiles cleanly (no type errors from the new `FormState` fields).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/views/settings/ClinicProfilePage.tsx
git commit -m "feat(billing): VAT mode + rate section on Clinic Profile settings page"
```

---

### Task 12: `useInvoices.ts` — drop `taxRate` from the create-invoice request type

**Files:**
- Modify: `src/frontend/src/hooks/useInvoices.ts:49-57`

**Interfaces:**
- Produces: `CreateInvoicePayload` without `taxRate` — consumed by Task 13 (`ClinicBilling.tsx`'s `finalize()` call).

- [ ] **Step 1: Remove the field**

```typescript
export interface CreateInvoicePayload {
  medicalRecordId?: number | null
  petId?:           number | null
  items:            NewInvoiceItem[]
  discount?:        number
  discountReason?:  string | null
  notes?:           string | null
}
```

(Note: `Invoice.taxRate: string` at line 22, the *response* type, is left unchanged — the server still returns the resolved rate per invoice for receipts, per ADR-0020 F7.)

- [ ] **Step 2: Commit**

```bash
git add src/frontend/src/hooks/useInvoices.ts
git commit -m "feat(billing): drop taxRate from CreateInvoicePayload (server resolves VAT)"
```

---

### Task 13: `ClinicBilling.tsx` — `calcVat()`, live settings fetch, mode-aware cart/labels

**Files:**
- Modify: `src/frontend/src/views/clinic/ClinicBilling.tsx`

**Interfaces:**
- Consumes: `useClinicSettings` (Task 10, `src/frontend/src/hooks/useClinicSettings.ts`), `CreateInvoicePayload` without `taxRate` (Task 12).
- Produces: `export function calcVat(mode: VatMode, rate: number, taxable: number): { taxAmount: number; total: number }` — consumed by Task 14 (frontend test).

- [ ] **Step 1: Replace the `TAX_RATE` constant and imports**

Replace line 1-11:

```typescript
import { useState } from 'react'
import { useT } from '../../i18n'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../utils/api'
import MaterialIcon from '../../components/MaterialIcon'
import { useProducts, type Product } from '../../hooks/useInventory'
import { useCreateInvoice, useRecordPayment, type Invoice } from '../../hooks/useInvoices'
import { useClinicSettings, type VatMode } from '../../hooks/useClinicSettings'
import { useAuthStore } from '../../store/authStore'

const baht = (n: number) => '฿' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const round2 = (n: number) => Math.round(n * 100) / 100
const LOYALTY_REDEEM_RATIO = 0.2 // points can cover at most 20% of an invoice

// Mirrors backend computeVat() in invoice.service.ts (ADR-0020) — used for the live
// cart preview before the invoice exists server-side. Exported for unit testing.
export function calcVat(mode: VatMode, rate: number, taxable: number): { taxAmount: number; total: number } {
  if (mode === 'none') return { taxAmount: 0, total: round2(taxable) }
  if (mode === 'inclusive') {
    const taxAmount = round2(taxable - taxable / (1 + rate / 100))
    return { taxAmount, total: round2(taxable) }
  }
  const taxAmount = round2((taxable * rate) / 100)
  return { taxAmount, total: round2(taxable + taxAmount) }
}

const VAT_SUFFIX: Record<VatMode, string> = { none: '', exclusive: ' (Ex. VAT)', inclusive: ' (Inc. VAT)' }
```

- [ ] **Step 2: Fetch clinic VAT settings inside the component**

Add after the `recordPayment = useRecordPayment()` line (existing line 44):

```typescript
  const { data: clinicSettings } = useClinicSettings()
  const vatMode: VatMode = clinicSettings?.vatMode ?? 'exclusive'
  const vatRate = Number(clinicSettings?.vatRate ?? 7)
```

- [ ] **Step 3: Replace the tax/total calc**

Replace the old lines (previously `const tax = ((subtotal - discountNum) * TAX_RATE) / 100` and `const total = subtotal - discountNum + tax`):

```typescript
  const taxable = subtotal - discountNum
  const { taxAmount: tax, total } = calcVat(vatMode, vatRate, taxable)
```

- [ ] **Step 4: Drop `taxRate` from the `finalize()` request**

```typescript
      const invoice = await createInvoice.mutateAsync({
        medicalRecordId: recordId,
        petId: pet?.petId ?? null,
        items: cart.map((c) => ({ description: c.description || '(item)', itemType: c.itemType, qty: c.qty, unitPrice: c.unitPrice, productId: c.productId ?? null })),
        discount: discountNum,
      })
```

- [ ] **Step 5: Mode-aware price-column label + hideable VAT row in the cart summary**

Add a small header row above the cart's editable rows (insert right before the `{/* Editable cart rows */}` comment, inside the `divide-y divide-outline-variant` container, only shown once items exist):

```tsx
              {cart.length > 0 && (
                <div className="flex items-center gap-sm px-md py-xs text-label-md text-on-surface-variant uppercase tracking-wider">
                  <span className="w-[18px] flex-shrink-0" />
                  <span className="flex-1">{t('clinic.billing.description')}</span>
                  <span className="w-16 text-center">Qty</span>
                  <span className="w-24 text-right">Price{VAT_SUFFIX[vatMode]}</span>
                  <span className="w-24 text-right">Total</span>
                  <span className="w-[44px]" />
                </div>
              )}
```

Replace the totals `Row` for tax (previously `<Row label={\`Tax (${TAX_RATE}%)\`} value={baht(tax)} />`):

```tsx
              {vatMode !== 'none' && <Row label={`VAT (${vatRate}%)${vatMode === 'inclusive' ? ' incl.' : ''}`} value={baht(tax)} />}
```

- [ ] **Step 6: Run the frontend build to catch type errors**

Run: `cd D:\Development\AnimalClinic && npm --prefix src/frontend run build`
Expected: compiles cleanly.

- [ ] **Step 7: Commit**

```bash
git add src/frontend/src/views/clinic/ClinicBilling.tsx
git commit -m "feat(billing): mode-aware VAT calc, labels, and cart summary in ClinicBilling"
```

---

### Task 14: Frontend test — `calcVat()` unit coverage

**Files:**
- Modify: `src/frontend/src/__tests__/ClinicBilling.test.tsx`

**Interfaces:**
- Consumes: `calcVat` exported from `../views/clinic/ClinicBilling` (Task 13).

- [ ] **Step 1: Write the failing tests**

Add near the top of the file, after the existing imports (after line 20's `import type { Invoice } from '../hooks/useInvoices'`):

```typescript
import { calcVat } from '../views/clinic/ClinicBilling'

describe('calcVat — mirrors backend computeVat() 3-mode formula (ADR-0020)', () => {
  it('none: zero tax, total = taxable', () => {
    expect(calcVat('none', 7, 1000)).toEqual({ taxAmount: 0, total: 1000 })
  })

  it('exclusive: tax added on top', () => {
    expect(calcVat('exclusive', 7, 1000)).toEqual({ taxAmount: 70, total: 1070 })
  })

  it('inclusive: tax extracted, total unchanged', () => {
    const r = calcVat('inclusive', 7, 1070)
    expect(r.total).toBe(1070)
    expect(r.taxAmount).toBeCloseTo(70, 1)
  })

  it('inclusive + discount: discount subtracted from inclusive price before VAT extraction', () => {
    const r = calcVat('inclusive', 7, 970) // 1070 - 100 discount
    expect(r.total).toBe(970)
    expect(r.taxAmount).toBeCloseTo(63.46, 1)
  })
})
```

- [ ] **Step 2: Run to verify they fail (before Task 13) / pass (after)**

Run: `cd D:\Development\AnimalClinic && npm --prefix src/frontend run test -- ClinicBilling.test.tsx`
Expected: PASS once Task 13 is complete (sequence this task after Task 13).

- [ ] **Step 3: Commit**

```bash
git add src/frontend/src/__tests__/ClinicBilling.test.tsx
git commit -m "test(billing): unit-test calcVat for all 3 VAT modes"
```

---

### Task 15: i18n keys — VAT labels (English + Thai)

**Files:**
- Modify: `src/frontend/src/i18n/index.ts`

**Interfaces:**
- Produces: `clinic.billing.vatLabel`, `clinic.billing.vatInclusiveSuffix`, `clinic.billing.priceExVat`, `clinic.billing.priceIncVat`, `clinic.settings.vatSection`, `clinic.settings.vatNone`, `clinic.settings.vatExclusive`, `clinic.settings.vatInclusive`, `clinic.settings.vatRate` — available to `useT()` calls in Tasks 11/13 if a later pass wires them in (this task adds the keys per the Phase 9 i18n pattern; wiring the exact JSX strings from Tasks 11/13 through `t()` is a mechanical follow-up already covered by those tasks' hardcoded English strings, which stay as the fallback if a key is ever missing).

- [ ] **Step 1: Add English keys**

After `'clinic.billing.allReceivers': 'All staff',` (line 277):

```typescript
  'clinic.billing.vatLabel': 'VAT',
  'clinic.billing.vatInclusiveSuffix': 'incl.',
  'clinic.billing.priceExVat': 'Price (Ex. VAT)',
  'clinic.billing.priceIncVat': 'Price (Inc. VAT)',
  'clinic.settings.vatSection': 'VAT',
  'clinic.settings.vatNone': 'No VAT',
  'clinic.settings.vatExclusive': 'VAT Exclusive',
  'clinic.settings.vatInclusive': 'VAT Inclusive',
  'clinic.settings.vatRate': 'Rate (%)',
```

- [ ] **Step 2: Add matching Thai keys**

After `'clinic.billing.allReceivers': 'พนักงานทั้งหมด',` (the Thai mirror of line 277, in the Thai block starting ~line 561):

```typescript
  'clinic.billing.vatLabel': 'ภาษีมูลค่าเพิ่ม',
  'clinic.billing.vatInclusiveSuffix': 'รวมแล้ว',
  'clinic.billing.priceExVat': 'ราคา (ไม่รวม VAT)',
  'clinic.billing.priceIncVat': 'ราคา (รวม VAT)',
  'clinic.settings.vatSection': 'ภาษีมูลค่าเพิ่ม',
  'clinic.settings.vatNone': 'ไม่มีภาษี',
  'clinic.settings.vatExclusive': 'แยกภาษี',
  'clinic.settings.vatInclusive': 'รวมภาษีในราคา',
  'clinic.settings.vatRate': 'อัตรา (%)',
```

- [ ] **Step 3: Run the frontend build**

Run: `cd D:\Development\AnimalClinic && npm --prefix src/frontend run build`
Expected: compiles cleanly (flat key dictionary, no TS shape to break).

- [ ] **Step 4: Commit**

```bash
git add src/frontend/src/i18n/index.ts
git commit -m "feat(billing): add VAT i18n keys (EN + TH)"
```

---

### Task 16: Full regression run

**Files:** none (verification only)

- [ ] **Step 1: Run the full backend suite**

Run: `cd D:\Development\AnimalClinic && npm --prefix src/backend run test`
Expected: all tests pass (no regressions in `invoice.test.ts`, `phase4.test.ts`, `pdf.test.ts`, `settings-api.test.ts`, `vat-config.test.ts`, or any other suite touching invoices/settings/hospitalization).

- [ ] **Step 2: Run the full frontend suite**

Run: `cd D:\Development\AnimalClinic && npm --prefix src/frontend run test`
Expected: all tests pass (no regressions in `ClinicBilling.test.tsx` or elsewhere).

- [ ] **Step 3: Report the final test counts**

Record the new backend/frontend test totals for the PM-agent tracking docs (CLAUDE.md phase table, `implementation-status-matrix.md`) — out of scope for this plan itself, handled by `@pm-agent` at Step 8 (`/anemal-finish-branch`).

---

## Self-Review Notes (for the plan author / Ponytail gate)

- **Spec coverage:** Design decisions 1-6 → Tasks 1, 3, 5, 9, 11, 13. BA Findings F1/F2 already resolved in the design doc (no task needed — the plan simply uses `clinic.profile.edit`/`clinic.profile.view` throughout). F3 → Task 5 Step 3 (uses existing `getOrCreateSettings` upsert). F4 → Task 5 Step 2 (`computeVat` clamp) + Task 8 (test). Grill findings F5 → Task 6. F6 → Task 9. F7 → Task 12 (response type untouched). F8 → Tasks 4, 7, 8, 14.
- **File count:** 1 new non-test file (the migration, which Prisma generates, not hand-authored) + 2 new test files (`vat-config.test.ts` is new; everything else is a modify). Well under the 15-new-file Ponytail threshold.
- **Endpoint count:** 0 new endpoints, 0 new permissions — confirmed against `settings.routes.ts` (existing `GET`/`PUT /clinic`) and `invoice.service.ts` (existing `POST /api/invoices` contract, made stricter not wider).
- **Dependency count:** 0 new npm packages.
