# Idle-Timeout Auto-Logout — Backend & DB Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-tenant `idleTimeoutMinutes` setting (5–120, default 15) to the database and expose it through the existing `/admin/settings` API, so frontend work (Plan 2) has a value to read.

**Architecture:** One new `tenant_settings` column with a DB-level CHECK constraint (5–120), surfaced through the existing settings service/controller with matching Zod validation — no new endpoints.

**Tech Stack:** Express + Prisma + PostgreSQL (backend), Jest (tests).

**Split note:** This is Plan 1 of 3 for the idle-logout feature (split from the original combined plan per Ponytail Gate — original plan touched 5 subsystems / ~20 files, over the 3-subsystem / 10-file limit). See also:
- Plan 2: `docs/superpowers/plans/2026-07-01-idle-logout-frontend-core.md` (hook + guards — depends on this plan)
- Plan 3: `docs/superpowers/plans/2026-07-01-idle-logout-ux.md` (settings UI + login banner — depends on Plans 1 & 2)

## Global Constraints

- Idle timeout range (clinic): 5–120 minutes, default 15.
- No new backend endpoints, no new permission codes, no new npm dependencies.
- Full spec: [docs/superpowers/specs/2026-07-01-idle-logout-design.md](../specs/2026-07-01-idle-logout-design.md). BA sign-off recorded there.

---

### Task 1: Database — `idleTimeoutMinutes` column on `tenant_settings`

**Files:**
- Modify: `src/backend/prisma/schema.prisma` (TenantSettings model, ~line 87–122)
- Create: `src/backend/prisma/migrations/20260701000000_add_idle_timeout/migration.sql`
- Create: `src/backend/prisma/migrations/20260701000000_add_idle_timeout/down.sql`

**Interfaces:**
- Produces: `TenantSettings.idleTimeoutMinutes: number` (Prisma field, default 15), available to every later task via `prisma.tenantSettings`.

- [ ] **Step 1: Add the field to the Prisma schema**

In `src/backend/prisma/schema.prisma`, inside `model TenantSettings { ... }`, add after `planTier`:

```prisma
  // Phase idle-logout — client-side auto-logout threshold, admin-configurable
  idleTimeoutMinutes   Int      @default(15)
```

- [ ] **Step 2: Write the migration SQL**

`src/backend/prisma/migrations/20260701000000_add_idle_timeout/migration.sql`:

```sql
-- AlterTable
ALTER TABLE "tenant_settings" ADD COLUMN "idleTimeoutMinutes" INTEGER NOT NULL DEFAULT 15;

-- CreateCheckConstraint
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_idleTimeoutMinutes_check"
  CHECK ("idleTimeoutMinutes" BETWEEN 5 AND 120);
```

`src/backend/prisma/migrations/20260701000000_add_idle_timeout/down.sql`:

```sql
-- Down migration for add_idle_timeout
ALTER TABLE "tenant_settings" DROP CONSTRAINT IF EXISTS "tenant_settings_idleTimeoutMinutes_check";
ALTER TABLE "tenant_settings" DROP COLUMN IF EXISTS "idleTimeoutMinutes";
```

- [ ] **Step 3: Apply the migration**

Run (from `src/backend`): `npm run db:migrate -- --name add_idle_timeout`
Expected: `Your database is now in sync with your schema.` and `prisma generate` runs automatically, regenerating the Prisma client with `idleTimeoutMinutes` on `TenantSettings`.

If prompted for a migration name (Prisma may create its own timestamped folder instead of using the one you hand-wrote), delete your hand-written folder first and let Prisma generate it, then diff it against the SQL above to confirm it matches — the CHECK constraint is not something `prisma migrate dev` generates from the schema alone (Prisma has no native check-constraint syntax in this schema version's usage elsewhere in the file), so append it manually to the generated `migration.sql` if Prisma didn't include it.

- [ ] **Step 4: Commit**

```bash
git add src/backend/prisma/schema.prisma src/backend/prisma/migrations
git commit -m "feat: add idleTimeoutMinutes column to tenant_settings"
```

---

### Task 2: Backend — validate and persist `idleTimeoutMinutes` via existing settings API

**Files:**
- Modify: `src/backend/services/tenant-settings.service.ts:11-35` (`TenantSettingsInput` interface)
- Modify: `src/backend/controllers/tenant-settings.controller.ts:5-18` (`updateSettingsSchema`)
- Test: `src/backend/__tests__/adminSettings.test.ts`

**Interfaces:**
- Consumes: `TenantSettings.idleTimeoutMinutes` (Task 1).
- Produces: `GET /admin/settings` response includes `idleTimeoutMinutes`; `PUT /admin/settings` accepts and validates it (5–120 inclusive). Consumed by Plan 2 (`useAdminSettings`) and Plan 3 (`ClinicSettingsTab`).

- [ ] **Step 1: Write the failing tests**

Add to `src/backend/__tests__/adminSettings.test.ts`, inside the existing `describe('admin-1.4 — PUT /admin/settings', ...)` block (after `settings-08`, before `settings-09`):

```ts
  test('settings-08b: Update idle timeout minutes', async () => {
    // Type: happy_path
    const res = await request(server)
      .put('/admin/settings')
      .set('Authorization', adminToken())
      .send({ idleTimeoutMinutes: 30 })
      .expect(200)

    expect(res.body.data.idleTimeoutMinutes).toBe(30)
  })

  test('settings-08c: Idle timeout below 5 → 400', async () => {
    // Type: edge_case / input validation
    await request(server)
      .put('/admin/settings')
      .set('Authorization', adminToken())
      .send({ idleTimeoutMinutes: 4 })
      .expect(400)
  })

  test('settings-08d: Idle timeout above 120 → 400', async () => {
    // Type: edge_case / input validation
    await request(server)
      .put('/admin/settings')
      .set('Authorization', adminToken())
      .send({ idleTimeoutMinutes: 121 })
      .expect(400)
  })
```

Also add, inside `describe('admin-1.4 — GET /admin/settings', ...)`, after `settings-01`:

```ts
  test('settings-01b: Default idleTimeoutMinutes is 15', async () => {
    // Type: happy_path
    const res = await request(server)
      .get('/admin/settings')
      .set('Authorization', adminToken())
      .expect(200)

    expect(res.body.data.idleTimeoutMinutes).toBe(15)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `src/backend`): `npm test -- --testPathPattern=adminSettings`
Expected: `settings-08b`/`settings-08c`/`settings-08d` fail — `idleTimeoutMinutes` is stripped silently by the `.strict()`-less passthrough today (no validation error, field just isn't persisted), so `settings-08b` fails on the `toBe(30)` assertion and `settings-08c`/`08d` fail because no 400 is thrown for an unvalidated field.

- [ ] **Step 3: Add the field to the service input type**

In `src/backend/services/tenant-settings.service.ts`, in `TenantSettingsInput` (after `lineRemindersEnabled?: boolean`):

```ts
  idleTimeoutMinutes?:  number
```

- [ ] **Step 4: Add validation to the controller schema**

In `src/backend/controllers/tenant-settings.controller.ts`, in `updateSettingsSchema` (after `lineRemindersEnabled: z.boolean().optional(),`):

```ts
  idleTimeoutMinutes:   z.number().int().min(5).max(120).optional(),
```

- [ ] **Step 5: Run tests to verify they pass**

Run (from `src/backend`): `npm test -- --testPathPattern=adminSettings`
Expected: all `admin-1.4` tests PASS, including the four new ones.

- [ ] **Step 6: Commit**

```bash
git add src/backend/services/tenant-settings.service.ts src/backend/controllers/tenant-settings.controller.ts src/backend/__tests__/adminSettings.test.ts
git commit -m "feat: validate and persist idleTimeoutMinutes on admin settings API"
```

*(Note: the BA sign-off flagged a custom-role permission test as optional. Skipping it — `seedUserRoles` only supports the three system role keys, and building a custom-role fixture just to re-confirm that `requirePermission('clinic.profile.edit')` behaves as it already does everywhere else in the test suite is redundant test infrastructure for a non-blocking finding.)*

---

## Final Verification (run once, after both tasks)

- [ ] Backend full suite: `cd src/backend && npm test` — expect 0 failures.

**Next:** Once this plan is merged, proceed to `docs/superpowers/plans/2026-07-01-idle-logout-frontend-core.md` (Plan 2).
