# Unify User Role Assignment — Plan A: Migration + Backend + Docs

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Split context:** This plan is Part A of a 2-plan split ordered by @ponytail-agent (Step 5 rejection, `docs/superpowers/plans/2026-07-20-unify-user-role-assignment-ponytail-gate.md`, commit `718077f`) of the original single plan (`docs/superpowers/plans/2026-07-20-unify-user-role-assignment.md`, commit `5b4ce5c`), which tripped Criterion 4 (scope size, ~30 files / 4 subsystems). The split is **scope-packaging only** — no design, spec, or acceptance-criteria content changed. Part B (frontend) is `docs/superpowers/plans/2026-07-20-unify-user-role-assignment-plan-b-frontend.md`.

**Coupling fix applied in this plan (ponytail's prescribed option (a)):** the original single plan's Task 8 changed `GET /users`' `UserResponse.role` from a string to `{id,name,key,isSystem}` and added `isPrimaryAdmin` in the same task that also made `createUser`/`updateUser` roleId-based. That coupled the response-shape change to a frontend consumer (`UserManagementTab.tsx`) that isn't updated until Plan B. **This plan does NOT change the response shape.** `safe()` here is only adjusted to stop reading the dropped `User.role` column — it keeps returning `role` as a **string** (the pre-existing contract), now sourced from `roleRef.key` via a small transitional mapper. The response-object shape + `isPrimaryAdmin` field land in Plan B's first task, bundled atomically with their sole consumers (`UserManagementTab.tsx`, `AdminBranches.tsx`). This means: **after Plan A merges alone, every existing screen keeps working unmodified** (Users list still shows a role string, Edit User modal's old `<select>` still round-trips correctly against the new `roleId`-based API — see Task 6's note on the legacy `<select>`'s payload compatibility). Main stays green and deployable after this plan merges on its own.

**Goal:** Retire the drift-prone legacy `User.role` column and the now-superseded multi-role capability with an auditable migration, move the backend user/role/auth services to a `roleId`-based model, close a real privilege-escalation gap, and update the two FR/RBAC docs that described multi-role as current — all while keeping every existing frontend screen working unmodified against this plan alone.

**Architecture:** Same as the original plan's — `roleId` (FK to `roles`/`ClinicRole`, NOT NULL) becomes the single source of truth. A pre-migration script collapses any existing multi-role user (system role wins; ambiguous cases produce a manual-resolution report and block that tenant). The legacy `User.role` column and `LegacyRole` enum are dropped in the same migration window. Backend services move to `roleId`-based reads/writes, gain a `staff.assign_role` gate + no-escalation check, and `auth.service.ts` gains a private mapper keeping the JWT's legacy `role` claim byte-identical. `user.service.ts`'s `safe()` gets a **transitional** legacy-string mapper (this plan) that Plan B later replaces with the full object shape.

**Tech Stack:** Node.js + Express + PostgreSQL 15 + Prisma, Jest (`--runInBand --forceExit`).

## Global Constraints

- Every query/write touching `users`, `user_roles`, or `roles` must be tenant-scoped (`WHERE tenantId = :tenantId`) — no exceptions (CLAUDE.md, ABSOLUTE).
- Deny-by-default: no new route may ship without `requirePlane` + `requirePermission`/`requireAnyPermission`.
- No new npm dependencies.
- No new backend endpoints net (0 added, 3 removed: `POST /clinic/roles/users/:userId/roles`, `DELETE /clinic/roles/users/:userId/roles/:roleId`, `GET /users/:userId/roles`).
- `User.roleId` must be an absolute invariant post-migration: every user has exactly one role, always (grill F-4).
- **This plan must not change any existing API response shape that a shipped frontend screen currently reads.** `UserResponse.role` stays a string throughout this plan (see coupling-fix note above). `RoleDto` gaining a new `key` field (Task 11) is additive/safe — no existing consumer reads it, so it does not violate this constraint.
- `auth.service.ts`'s legacy-string mapper (D-8, option (a)) must NOT touch any frontend file — this plan is backend + docs only, zero frontend files touched.
- Backend test command: `npm --prefix src/backend run test -- <path>`. Migration command (run from `src/backend`): `npx prisma migrate dev --name <name>`.

---

## Phase 0 — Pre-migration verification and collapse

### Task 1: Verify and re-run the `roleId` backfill (T-URA-1.1)

**Files:**
- Modify: none (verification + script re-run only)
- Reference: `src/backend/prisma/backfill-user-roles.ts` (existing, idempotent)

**Interfaces:**
- Consumes: `backfillUserRoles()` (existing function, no signature change).
- Produces: a live dev DB state where `SELECT COUNT(*) FROM users WHERE "roleId" IS NULL` returns `0` — the hard precondition every later task in this plan depends on.

- [ ] **Step 1: Confirm the precondition currently fails**

Run (from `src/backend`, with the dev DB reachable):

```bash
npx prisma db execute --stdin <<'SQL'
SELECT id, username, "roleId" FROM users WHERE "roleId" IS NULL ORDER BY id;
SQL
```

Expected: 5 rows returned (`staff_a`, `doctor_a`, `admin_b`, `doctor_b`, `staff_b` per BA sign-off V3). This is the documented current-broken state — do not skip this check assuming the design doc's "already run once" claim holds; it does not.

- [ ] **Step 2: Re-run the backfill script**

```bash
npx ts-node src/backend/prisma/backfill-user-roles.ts
```

Expected output ends with `[backfill-user-roles] Done. migrated=<n>, skipped=<m>, already_done=<k>` where `<n> ≥ 5`.

- [ ] **Step 3: Re-verify zero NULLs**

```bash
npx prisma db execute --stdin <<'SQL'
SELECT COUNT(*) FROM users WHERE "roleId" IS NULL;
SQL
```

Expected: `count = 0`. If any tenant still shows a NULL `roleId` (e.g. a `superadmin` legacy row not yet migrated to `platform_users`, T-5C-03 scope), STOP — do not proceed to Task 2.

- [ ] **Step 4: Record the verification note**

No code changes in this task. Record the verification output (Step 1 and Step 3 results) in this plan's PR description at Step 8 (`/anemal-finish-branch`) per CLAUDE.md doc-tracking convention.

---

### Task 2: Write the multi-role pre-check + classification query (T-URA-1.2)

**Files:**
- Create: `src/backend/prisma/scripts/collapse-multi-role.ts`
- Test: `src/backend/tests/scripts/collapse-multi-role.test.ts`

**Interfaces:**
- Produces: `classifyMultiRoleUsers(prismaClient: PrismaClient): Promise<{ autoCollapsible: AutoCollapsibleCase[]; ambiguous: AmbiguousCase[] }>` where:
  ```ts
  interface AutoCollapsibleCase {
    userId: number
    tenantId: number
    systemRoleId: number
    removedRoleIds: number[]
  }
  interface AmbiguousCase {
    userId: number
    tenantId: number
    roleIds: number[]
    reason: 'multiple-system-roles' | 'multiple-custom-roles-no-system'
  }
  ```
- Consumed by: Task 3's `collapseMultiRoleUsers()` in the same file.

- [ ] **Step 1: Write the failing test**

```ts
// src/backend/tests/scripts/collapse-multi-role.test.ts
import { PrismaClient } from '@prisma/client'
import { classifyMultiRoleUsers } from '../../prisma/scripts/collapse-multi-role'

const prisma = new PrismaClient()

describe('classifyMultiRoleUsers', () => {
  let tenantId: number
  let systemDoctorRoleId: number
  let systemStaffRoleId: number
  let customRoleAId: number
  let customRoleBId: number

  beforeAll(async () => {
    const tenant = await prisma.tenant.create({ data: { name: 'Collapse Test', subdomain: 'collapse-test-1' } })
    tenantId = tenant.id
    const doctorRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor', tenantId: null } })
    const staffRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_staff', tenantId: null } })
    systemDoctorRoleId = doctorRole.id
    systemStaffRoleId = staffRole.id
    const customA = await prisma.clinicRole.create({
      data: { tenantId, key: `tenant_${tenantId}_accountant`, name: 'Accountant', isSystem: false, permVersion: 1 },
    })
    const customB = await prisma.clinicRole.create({
      data: { tenantId, key: `tenant_${tenantId}_billing`, name: 'Billing', isSystem: false, permVersion: 1 },
    })
    customRoleAId = customA.id
    customRoleBId = customB.id
  })

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => {})
    await prisma.$disconnect()
  })

  it('classifies a system+custom user as auto-collapsible, keeping the system role', async () => {
    const user = await prisma.user.create({
      data: { tenantId, name: 'Doctor A', username: 'doctor_a_collapse', passwordHash: 'x', role: 'doctor', roleId: systemDoctorRoleId },
    })
    await prisma.userRole.createMany({
      data: [
        { userId: user.id, roleId: systemDoctorRoleId, tenantId },
        { userId: user.id, roleId: customRoleAId, tenantId },
      ],
    })

    const { autoCollapsible, ambiguous } = await classifyMultiRoleUsers(prisma)

    const found = autoCollapsible.find(c => c.userId === user.id)
    expect(found).toBeDefined()
    expect(found!.systemRoleId).toBe(systemDoctorRoleId)
    expect(found!.removedRoleIds).toEqual([customRoleAId])
    expect(ambiguous.find(a => a.userId === user.id)).toBeUndefined()
  })

  it('classifies a 2-system-role user as ambiguous', async () => {
    const user = await prisma.user.create({
      data: { tenantId, name: 'Two System', username: 'two_system_collapse', passwordHash: 'x', role: 'doctor', roleId: systemDoctorRoleId },
    })
    await prisma.userRole.createMany({
      data: [
        { userId: user.id, roleId: systemDoctorRoleId, tenantId },
        { userId: user.id, roleId: systemStaffRoleId, tenantId },
      ],
    })

    const { ambiguous, autoCollapsible } = await classifyMultiRoleUsers(prisma)

    const found = ambiguous.find(a => a.userId === user.id)
    expect(found).toBeDefined()
    expect(found!.reason).toBe('multiple-system-roles')
    expect(autoCollapsible.find(c => c.userId === user.id)).toBeUndefined()
  })

  it('classifies a 2-custom-role user with no system role as ambiguous', async () => {
    const user = await prisma.user.create({
      data: { tenantId, name: 'Two Custom', username: 'two_custom_collapse', passwordHash: 'x', role: 'staff', roleId: customRoleAId },
    })
    await prisma.userRole.createMany({
      data: [
        { userId: user.id, roleId: customRoleAId, tenantId },
        { userId: user.id, roleId: customRoleBId, tenantId },
      ],
    })

    const { ambiguous } = await classifyMultiRoleUsers(prisma)

    const found = ambiguous.find(a => a.userId === user.id)
    expect(found).toBeDefined()
    expect(found!.reason).toBe('multiple-custom-roles-no-system')
  })

  it('does not classify a single-role user at all', async () => {
    const user = await prisma.user.create({
      data: { tenantId, name: 'Single Role', username: 'single_role_collapse', passwordHash: 'x', role: 'doctor', roleId: systemDoctorRoleId },
    })
    await prisma.userRole.create({ data: { userId: user.id, roleId: systemDoctorRoleId, tenantId } })

    const { autoCollapsible, ambiguous } = await classifyMultiRoleUsers(prisma)

    expect(autoCollapsible.find(c => c.userId === user.id)).toBeUndefined()
    expect(ambiguous.find(a => a.userId === user.id)).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix src/backend run test -- tests/scripts/collapse-multi-role.test.ts`
Expected: FAIL — `Cannot find module '../../prisma/scripts/collapse-multi-role'`.

- [ ] **Step 3: Write the classification implementation**

```ts
// src/backend/prisma/scripts/collapse-multi-role.ts
/**
 * collapse-multi-role.ts — D-7 multi-role retirement (ADR-0019).
 *
 * Classifies every user holding >1 `user_roles` row into:
 *   - auto-collapsible: exactly one system role + 1+ custom roles → system role wins.
 *   - ambiguous: 2+ system roles, OR 2+ custom roles with no system role → halts,
 *     goes to a manual-resolution report, never auto-picked.
 *
 * Must run (via collapseMultiRoleUsers, Task 3) BEFORE the roleId NOT NULL +
 * column-drop migration (Task 4) — it is what guarantees "exactly one
 * user_roles row per user" going into that step.
 */
import type { PrismaClient } from '@prisma/client'

export interface AutoCollapsibleCase {
  userId: number
  tenantId: number
  systemRoleId: number
  removedRoleIds: number[]
}

export interface AmbiguousCase {
  userId: number
  tenantId: number
  roleIds: number[]
  reason: 'multiple-system-roles' | 'multiple-custom-roles-no-system'
}

export interface ClassificationResult {
  autoCollapsible: AutoCollapsibleCase[]
  ambiguous: AmbiguousCase[]
}

/**
 * Find every user with more than one `user_roles` row (across all tenants)
 * and classify each into auto-collapsible or ambiguous.
 *
 * @param prisma - Prisma client (test suites pass a shared instance).
 */
export async function classifyMultiRoleUsers(prisma: PrismaClient): Promise<ClassificationResult> {
  const grouped = await prisma.userRole.groupBy({
    by: ['userId'],
    _count: { roleId: true },
    having: { roleId: { _count: { gt: 1 } } },
  })

  const autoCollapsible: AutoCollapsibleCase[] = []
  const ambiguous: AmbiguousCase[] = []

  for (const g of grouped) {
    const rows = await prisma.userRole.findMany({
      where: { userId: g.userId },
      include: { role: { select: { id: true, isSystem: true } } },
    })
    if (rows.length === 0) continue

    const tenantId = rows[0].tenantId
    const systemRoles = rows.filter(r => r.role.isSystem)
    const customRoles = rows.filter(r => !r.role.isSystem)

    if (systemRoles.length === 1) {
      autoCollapsible.push({
        userId: g.userId,
        tenantId,
        systemRoleId: systemRoles[0].roleId,
        removedRoleIds: customRoles.map(r => r.roleId),
      })
    } else if (systemRoles.length >= 2) {
      ambiguous.push({ userId: g.userId, tenantId, roleIds: rows.map(r => r.roleId), reason: 'multiple-system-roles' })
    } else {
      ambiguous.push({ userId: g.userId, tenantId, roleIds: rows.map(r => r.roleId), reason: 'multiple-custom-roles-no-system' })
    }
  }

  return { autoCollapsible, ambiguous }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix src/backend run test -- tests/scripts/collapse-multi-role.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/backend/prisma/scripts/collapse-multi-role.ts src/backend/tests/scripts/collapse-multi-role.test.ts
git commit -m "feat(migration): classify multi-role users into auto-collapsible/ambiguous (D-7)"
```

---

### Task 3: Write the collapse + audit-report execution function (T-URA-1.3)

**Files:**
- Modify: `src/backend/prisma/scripts/collapse-multi-role.ts` (append)
- Test: `src/backend/tests/scripts/collapse-multi-role.test.ts` (append)

**Interfaces:**
- Consumes: `classifyMultiRoleUsers` (Task 2), `AutoCollapsibleCase`, `AmbiguousCase`.
- Produces: `collapseMultiRoleUsers(prisma: PrismaClient): Promise<CollapseReport>` plus a runnable CLI entrypoint (`if (require.main === module)`), mirroring `backfill-user-roles.ts`'s own entrypoint pattern.

- [ ] **Step 1: Write the failing test (append to the same file)**

```ts
// append to src/backend/tests/scripts/collapse-multi-role.test.ts
import { collapseMultiRoleUsers } from '../../prisma/scripts/collapse-multi-role'

describe('collapseMultiRoleUsers', () => {
  let tenantId: number
  let systemDoctorRoleId: number
  let systemStaffRoleId: number
  let customRoleId: number

  beforeAll(async () => {
    const tenant = await prisma.tenant.create({ data: { name: 'Collapse Exec Test', subdomain: 'collapse-test-2' } })
    tenantId = tenant.id
    const doctorRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor', tenantId: null } })
    const staffRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_staff', tenantId: null } })
    systemDoctorRoleId = doctorRole.id
    systemStaffRoleId = staffRole.id
    const custom = await prisma.clinicRole.create({
      data: { tenantId, key: `tenant_${tenantId}_accountant2`, name: 'Accountant', isSystem: false, permVersion: 1 },
    })
    customRoleId = custom.id
  })

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => {})
  })

  it('collapses an auto-collapsible user to the system role and logs it', async () => {
    const user = await prisma.user.create({
      data: { tenantId, name: 'Collapse Me', username: 'collapse_me', passwordHash: 'x', role: 'doctor', roleId: systemDoctorRoleId },
    })
    await prisma.userRole.createMany({
      data: [
        { userId: user.id, roleId: systemDoctorRoleId, tenantId },
        { userId: user.id, roleId: customRoleId, tenantId },
      ],
    })

    const report = await collapseMultiRoleUsers(prisma)

    const entry = report.collapsed.find(c => c.userId === user.id)
    expect(entry).toBeDefined()
    expect(entry!.keptRoleId).toBe(systemDoctorRoleId)
    expect(entry!.removedRoleIds).toEqual([customRoleId])

    const remainingRoles = await prisma.userRole.findMany({ where: { userId: user.id } })
    expect(remainingRoles).toHaveLength(1)
    expect(remainingRoles[0].roleId).toBe(systemDoctorRoleId)

    const refreshedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(refreshedUser.roleId).toBe(systemDoctorRoleId)
  })

  it('leaves an ambiguous user untouched and reports it', async () => {
    const user = await prisma.user.create({
      data: { tenantId, name: 'Ambiguous', username: 'ambiguous_user', passwordHash: 'x', role: 'doctor', roleId: systemDoctorRoleId },
    })
    await prisma.userRole.createMany({
      data: [
        { userId: user.id, roleId: systemDoctorRoleId, tenantId },
        { userId: user.id, roleId: systemStaffRoleId, tenantId },
      ],
    })

    const report = await collapseMultiRoleUsers(prisma)

    expect(report.manualResolutionNeeded.find(a => a.userId === user.id)).toBeDefined()
    const remainingRoles = await prisma.userRole.findMany({ where: { userId: user.id } })
    expect(remainingRoles).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix src/backend run test -- tests/scripts/collapse-multi-role.test.ts`
Expected: FAIL — `collapseMultiRoleUsers is not a function`.

- [ ] **Step 3: Implement `collapseMultiRoleUsers` (append to the script file)**

```ts
// append to src/backend/prisma/scripts/collapse-multi-role.ts
import { PrismaClient } from '@prisma/client'

export interface CollapseLogEntry {
  userId: number
  tenantId: number
  keptRoleId: number
  removedRoleIds: number[]
  timestamp: string
}

export interface CollapseReport {
  collapsed: CollapseLogEntry[]
  manualResolutionNeeded: AmbiguousCase[]
}

/**
 * Execute the D-7 survivor rule: collapse every auto-collapsible multi-role
 * user to their system role, leave ambiguous cases untouched, and return an
 * auditable report (attach to the migration PR — CORR-1.4).
 *
 * @param prisma - Prisma client.
 */
export async function collapseMultiRoleUsers(prisma: PrismaClient): Promise<CollapseReport> {
  const { autoCollapsible, ambiguous } = await classifyMultiRoleUsers(prisma)

  const collapsed: CollapseLogEntry[] = []

  for (const c of autoCollapsible) {
    await prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({
        where: { userId: c.userId, tenantId: c.tenantId, roleId: { in: c.removedRoleIds } },
      })
      await tx.user.update({ where: { id: c.userId }, data: { roleId: c.systemRoleId } })
    })

    collapsed.push({
      userId: c.userId,
      tenantId: c.tenantId,
      keptRoleId: c.systemRoleId,
      removedRoleIds: c.removedRoleIds,
      timestamp: new Date().toISOString(),
    })
  }

  return { collapsed, manualResolutionNeeded: ambiguous }
}

// Run directly when invoked as a script (mirrors backfill-user-roles.ts's own entrypoint).
if (require.main === module) {
  const prisma = new PrismaClient()
  collapseMultiRoleUsers(prisma)
    .then((report) => {
      console.log(`[collapse-multi-role] Collapsed ${report.collapsed.length} user(s):`)
      for (const entry of report.collapsed) {
        console.log(
          `  userId=${entry.userId} tenantId=${entry.tenantId} kept=${entry.keptRoleId} ` +
          `removed=[${entry.removedRoleIds.join(', ')}] at ${entry.timestamp}`
        )
      }
      if (report.manualResolutionNeeded.length > 0) {
        console.warn(`[collapse-multi-role] ${report.manualResolutionNeeded.length} user(s) NEED MANUAL RESOLUTION:`)
        for (const a of report.manualResolutionNeeded) {
          console.warn(`  userId=${a.userId} tenantId=${a.tenantId} roleIds=[${a.roleIds.join(', ')}] reason=${a.reason}`)
        }
        console.warn('[collapse-multi-role] These tenants must NOT proceed to the column-drop migration until resolved.')
      } else {
        console.log('[collapse-multi-role] No ambiguous cases. Safe to proceed to the column-drop migration.')
      }
    })
    .catch((err) => {
      console.error('[collapse-multi-role] Fatal error:', err)
      process.exit(1)
    })
    .finally(() => prisma.$disconnect())
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix src/backend run test -- tests/scripts/collapse-multi-role.test.ts`
Expected: PASS (6 tests total).

- [ ] **Step 5: Run the script against the real dev DB and confirm the current live case**

```bash
npx ts-node src/backend/prisma/scripts/collapse-multi-role.ts
```

Expected: output includes a line for `doctor_a`'s collapse (`kept=<Doctor roleId>`, `removed=[<Accountant roleId>]`) — the exact live bug-reporter scenario (BA sign-off V2). Save this output; it is the audit log CORR-1.4 requires attached to the migration PR at Step 8.

- [ ] **Step 6: Commit**

```bash
git add src/backend/prisma/scripts/collapse-multi-role.ts src/backend/tests/scripts/collapse-multi-role.test.ts
git commit -m "feat(migration): execute multi-role collapse with audit log + manual-resolution report (D-7)"
```

---

### Task 4: Schema migration — drop `User.role`/`LegacyRole`, `roleId` NOT NULL, remove 3 endpoints (T-URA-1.4, F-5)

**Files:**
- Modify: `src/backend/prisma/schema.prisma:133-186` (User model + LegacyRole enum)
- Create: `src/backend/prisma/migrations/<timestamp>_drop_legacy_role/migration.sql` (generated), `.../down.sql` (hand-written)
- Modify: `src/backend/routes/user.routes.ts:12` (remove `GET /:userId/roles`)
- Modify: `src/backend/routes/role.routes.ts:40-44` (remove `POST/DELETE .../users/:userId/roles`)

**Interfaces:**
- Consumes: nothing (schema-only change); depends on Task 1 (zero NULLs) and Task 3 (multi-role collapsed) having run against the target DB first.
- Produces: `User.roleId: Int` (NOT NULL); no `User.role` field; no `LegacyRole` enum. Every later task in this plan depends on this shape.

- [ ] **Step 1: Back up the dev DB before migrating**

```bash
docker exec vetclinic-pg pg_dump -U postgres vetclinic_dev > backup_pre_drop_legacy_role_$(date +%Y%m%d%H%M%S).sql
```

Expected: a non-empty `.sql` dump file. This is the actual rollback mechanism (CORR-2.1) — keep it until this migration is verified stable in every environment it's applied to.

- [ ] **Step 2: Edit `schema.prisma` — drop the column and enum**

In `src/backend/prisma/schema.prisma`, inside `model User`, remove line 145 (`role LegacyRole`) and change line 147 from:

```prisma
  roleId              Int?
```

to:

```prisma
  roleId              Int
```

Remove the now-unused `enum LegacyRole { admin doctor staff }` block (lines 181-186, or current location if line numbers have drifted).

- [ ] **Step 3: Generate the migration**

```bash
cd src/backend && npx prisma migrate dev --name drop_legacy_role_column --create-only
```

Expected: a new migration folder containing `migration.sql` with `ALTER TABLE "users" DROP COLUMN "role";`, `ALTER TABLE "users" ALTER COLUMN "roleId" SET NOT NULL;`, and `DROP TYPE "LegacyRole";` — verify the generated SQL contains these three operations before proceeding.

- [ ] **Step 4: Write the hand-written `down.sql`**

Create `src/backend/prisma/migrations/<the-folder-just-generated>/down.sql` (same naming convention as the `rbac_foundation` precedent):

```sql
-- down.sql — reverses drop_legacy_role_column
-- Run BEFORE re-running up if a rollback is needed.
-- LOSSY for custom-role users: their real role identity does not round-trip
-- (they are repopulated as legacy 'staff'). Emergency escape hatch only —
-- the real fallback is the pg_dump backup taken in Task 4 Step 1.

CREATE TYPE "LegacyRole" AS ENUM ('admin', 'doctor', 'staff');

ALTER TABLE "users" ADD COLUMN "role" "LegacyRole";

UPDATE "users" u
SET "role" = CASE
  WHEN r."key" = 'clinic_admin' THEN 'admin'::"LegacyRole"
  WHEN r."key" = 'doctor'       THEN 'doctor'::"LegacyRole"
  ELSE 'staff'::"LegacyRole"
END
FROM "roles" r
WHERE u."roleId" = r."id";

ALTER TABLE "users" ALTER COLUMN "role" SET NOT NULL;

ALTER TABLE "users" ALTER COLUMN "roleId" DROP NOT NULL;
```

- [ ] **Step 5: Remove the 3 dead endpoints (route files, not SQL)**

Must land in the same deploy window as the column drop. In `src/backend/routes/user.routes.ts`, remove line 12:

```ts
router.get('/:userId/roles', requirePlane('clinic'), requirePermission('staff.assign_role'), userController.getUserRoles)
```

(F-5, grill finding — no consumer remains once `RolePicker.tsx` is deleted in Plan B.)

In `src/backend/routes/role.routes.ts`, remove lines 40-44:

```ts
// Assign a role to a user — requires staff.assign_role
router.post('/users/:userId/roles', requirePermission('staff.assign_role'), validate(assignUserRoleSchema), roleController.assignRoleToUser)

// Remove a role from a user — requires staff.assign_role
router.delete('/users/:userId/roles/:roleId', requirePermission('staff.assign_role'), roleController.removeRoleFromUser)
```

Leave the underlying controller/service handler code in place for now — Task 5 removes the now-orphaned handler code as its own reviewable step.

- [ ] **Step 6: Apply the migration to the dev DB**

```bash
npx prisma migrate dev
```

Expected: applies with no errors (fails immediately with a `NOT NULL constraint` violation if Task 1/Task 3 were skipped and any NULL or multi-role row remains — that failure mode is intentional).

- [ ] **Step 7: Verify the removed routes 404**

```bash
npm --prefix src/backend run dev &
sleep 3
curl -s -o /dev/null -w "%{http_code}\n" -X GET http://localhost:3000/users/1/roles
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/clinic/roles/users/1/roles
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE http://localhost:3000/clinic/roles/users/1/roles/1
kill %1
```

Expected: all three print `404`.

- [ ] **Step 8: `npx prisma validate` and note the expected scope-map test failures**

```bash
npx prisma validate
npm --prefix src/backend run test 2>&1 | tail -100
```

Expected: `prisma validate` passes. The test run WILL show failures in any fixture still doing `prisma.user.create({ data: { role: 'admin', ... } })` — this is the concrete scope map Tasks 5-12 fix (the ones inside this plan's boundary) plus any remaining ones noted for Task 15's final sweep.

- [ ] **Step 9: Commit**

```bash
git add src/backend/prisma/schema.prisma src/backend/prisma/migrations src/backend/routes/user.routes.ts src/backend/routes/role.routes.ts
git commit -m "feat(schema): drop legacy User.role/LegacyRole, roleId NOT NULL, remove 3 multi-role endpoints (D-7, F-5)"
```

---

## Phase 1 — Backend service layer

### Task 5: `role.controller.ts`/`role.routes.ts` — remove orphaned multi-role handlers

**Files:**
- Modify: `src/backend/controllers/role.controller.ts:126-149,172-191` (remove `assignRoleToUser`, `removeRoleFromUser` handlers and the now-unused `assignUserRoleSchema` export if nothing else imports it)
- Modify: `src/backend/services/role.service.ts:194-260` (remove `assignRoleToUser`, `removeRoleFromUser` functions)
- Modify: `src/backend/models/role.repository.ts:178-213` (remove `findUserInTenant`, `assignRoleToUser`, `removeRoleFromUser`, `countUserRoles` — confirm each has zero other callers first)
- Test: `src/backend/tests/integration/roleManagement.test.ts` (remove the corresponding multi-role assign/remove test cases)

**Interfaces:** pure removal — confirms Task 4's route removal has no dangling handler code.

- [ ] **Step 1: Grep for other callers of the functions to be removed**

```bash
grep -rn "findUserInTenant\|countUserRoles" src/backend --include="*.ts" | grep -v "role.repository.ts\|role.service.ts"
```

Expected: no matches outside `role.repository.ts`/`role.service.ts` themselves (if matches ARE found, do not remove that specific function).

- [ ] **Step 2: Remove the orphaned test cases first**

Open `src/backend/tests/integration/roleManagement.test.ts` and delete every `describe`/`it` block that calls `POST /clinic/roles/users/:userId/roles` or `DELETE /clinic/roles/users/:userId/roles/:roleId`.

- [ ] **Step 3: Run the suite to confirm it's still green minus the removed cases**

Run: `npm --prefix src/backend run test -- tests/integration/roleManagement.test.ts`
Expected: PASS, fewer total tests, all remaining ones green.

- [ ] **Step 4: Remove the handler/service/repository code**

In `role.controller.ts`, delete the `assignRoleToUser` and `removeRoleFromUser` exported functions. Grep first (`grep -rn "assignUserRoleSchema" src/backend --include="*.ts"`) before removing the `assignUserRoleSchema` export.

In `role.service.ts`, delete `assignRoleToUser` and `removeRoleFromUser`.

In `role.repository.ts`, delete `findUserInTenant`, `assignRoleToUser`, `removeRoleFromUser`, `countUserRoles` — only the ones confirmed orphaned in Step 1.

- [ ] **Step 5: Run the full role-related suite + a compile check**

```bash
npm --prefix src/backend run test -- tests/integration/roleManagement.test.ts
npx tsc --noEmit
```

Expected: PASS, no compile errors.

- [ ] **Step 6: Commit**

```bash
git add src/backend/controllers/role.controller.ts src/backend/services/role.service.ts src/backend/models/role.repository.ts src/backend/tests/integration/roleManagement.test.ts
git commit -m "chore(rbac): remove orphaned multi-role assign/remove handlers (D-7 cleanup)"
```

---

### Task 6: `user.service.ts` — `roleId`-based create/update, `safe()` stays backward-compatible (T-URA-2.1 + backward-compatible portion of T-URA-2.3)

**Files:**
- Modify: `src/backend/services/user.service.ts:14-22,57-81,83-118,120-147,243-278` (`LEGACY_ROLE_TO_SYSTEM_KEY` removal, `safe()`, `createUser`, `updateUser`, `assignUserBranches`)
- Modify: `src/backend/models/user.repository.ts:9-16,20-32,34-39,158-176` (`CreateUserData.role` → drop; `findUsers`/`findUserById`/`updateUserBranch` → `include: { roleRef: true }`)
- Modify: `src/backend/types/index.ts:104-120,122-132` (`CreateUserRequest`, `UpdateUserRequest` gain `roleId`; `UserResponse.role` stays `string` — NOT the object shape, that's Plan B)
- Test: `src/backend/__tests__/userManagement.test.ts`

**Interfaces:**
- Consumes: `roleRepo.findRoleById(roleId: number)` (existing, `role.repository.ts:43`).
- Produces: `createUser(tenantId, body): Promise<UserResponse>` and `updateUser(tenantId, userId, body): Promise<UserResponse>` now accept `roleId: number` instead of `role: string`. **`UserResponse.role` stays a plain string** — this task adds a small transitional, module-private mapper (`toLegacyRoleString`) so `safe()` can still produce that string once the `User.role` column is gone (Task 4 already dropped it). Plan B's first task replaces this transitional mapper with the full `{id,name,key,isSystem}` object + `isPrimaryAdmin` field, bundled with its consumers.

- [ ] **Step 1: Update the shared type definitions**

In `src/backend/types/index.ts`:

```ts
export interface CreateUserRequest {
  name:     string
  username: string
  email?:   string
  phone?:   string
  password: string
  roleId:   number              // was: role: 'doctor' | 'staff'
}

export interface UpdateUserRequest {
  name?:     string
  username?: string
  email?:    string
  phone?:    string
  roleId?:   number             // was: role?: 'admin' | 'doctor' | 'staff'
  isActive?: boolean
}

export interface UserResponse {
  id:        number
  tenantId:  number
  name:      string
  username:  string
  email:     string | null
  phone:     string | null
  role:      string             // UNCHANGED contract — Plan B replaces this with an object.
  isActive:  boolean
  createdAt: string
}
```

- [ ] **Step 2: Write the failing test**

Add to `src/backend/__tests__/userManagement.test.ts`:

```ts
it('createUser accepts roleId and persists the correct role FK, role stays a string in the response', async () => {
  const doctorRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor', tenantId: null } })
  const created = await userService.createUser(tenantId, {
    name: 'New Doctor', username: 'new_doctor_ura', email: 'newdoc@test.com',
    password: 'TestPass1!', roleId: doctorRole.id,
  })
  expect(created.role).toBe('doctor')
  const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: created.id } })
  expect(dbUser.roleId).toBe(doctorRole.id)
})

it('createUser rejects an unknown roleId', async () => {
  await expect(userService.createUser(tenantId, {
    name: 'Bad', username: 'bad_role_ura', email: 'bad@test.com',
    password: 'TestPass1!', roleId: 999999,
  })).rejects.toMatchObject({ statusCode: 400 })
})

it('updateUser accepts roleId and replaces the user role, response role stays a string', async () => {
  const staffRole  = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_staff', tenantId: null } })
  const doctorRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor', tenantId: null } })
  const user = await userService.createUser(tenantId, {
    name: 'Switchable', username: 'switchable_ura', email: 'sw@test.com',
    password: 'TestPass1!', roleId: staffRole.id,
  })
  const updated = await userService.updateUser(tenantId, user.id, { roleId: doctorRole.id })
  expect(updated.role).toBe('doctor')
})

it('a custom-role user\'s response role maps to the legacy "staff" string', async () => {
  const customRole = await prisma.clinicRole.create({
    data: { tenantId, key: `tenant_${tenantId}_accountant_ura6`, name: 'Accountant', isSystem: false, permVersion: 1 },
  })
  const created = await userService.createUser(tenantId, {
    name: 'Custom Role User', username: 'custom_role_ura6', email: 'cr@test.com',
    password: 'TestPass1!', roleId: customRole.id,
  })
  expect(created.role).toBe('staff')
})

it('LEGACY_ROLE_TO_SYSTEM_KEY no longer exists in user.service.ts', () => {
  const source = require('fs').readFileSync(require.resolve('../services/user.service.ts'), 'utf8')
  expect(source).not.toContain('LEGACY_ROLE_TO_SYSTEM_KEY')
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm --prefix src/backend run test -- __tests__/userManagement.test.ts`
Expected: FAIL (type errors on `roleId`; `LEGACY_ROLE_TO_SYSTEM_KEY` still present; `safe()` still reads the dropped `user.role` column and will throw at runtime).

- [ ] **Step 4: Update `user.repository.ts` to include `roleRef`**

```ts
// findUsers, findUserById — add include
export function findUsers(tenantId: number, branchId?: number | null) {
  return prisma.user.findMany({
    where: {
      tenantId,
      ...(branchId ? { OR: [{ userBranches: { some: { branchId } } }, { userBranches: { none: {} } }] } : {}),
    },
    include: { roleRef: true },
    orderBy: { createdAt: 'asc' },
  })
}

export function findUserById(tenantId: number, userId: number) {
  return prisma.user.findFirst({ where: { id: userId, tenantId }, include: { roleRef: true } })
}
```

Update `CreateUserData` (drop `role`):

```ts
export interface CreateUserData {
  name:         string
  username:     string
  email:        string | null
  phone:        string | null
  passwordHash: string
}
```

Update `updateUserBranch`'s `select` (line 158-176) to include the role via `roleRef` instead of the dropped `role` column, and its return type accordingly:

```ts
export async function updateUserBranch(
  tenantId: number,
  userId:   number,
  branchId: number | null,
): Promise<{ id: number; tenantId: number; name: string; username: string; email: string | null; phone: string | null; roleRef: { id: number; name: string; key: string; isSystem: boolean } | null; branchId: number | null; isActive: boolean; createdAt: Date } | null> {
  const count = await prisma.user.updateMany({ where: { id: userId, tenantId }, data: { branchId } })
  if (count.count === 0) return null
  return prisma.user.findFirst({
    where: { id: userId, tenantId },
    select: {
      id: true, tenantId: true, name: true, username: true,
      email: true, phone: true, roleRef: true,
      branchId: true, isActive: true, createdAt: true,
    },
  })
}
```

- [ ] **Step 5: Add the transitional mapper and rewrite `safe()`**

In `src/backend/services/user.service.ts`, delete the `LEGACY_ROLE_TO_SYSTEM_KEY` const (lines 14-22) and add, right after the imports:

```ts
/**
 * TRANSITIONAL — maps a role's stable `key` to the legacy 3-value role
 * string that UserResponse.role has always returned, now that the
 * User.role column is gone (Task 4). Deliberately duplicates the same
 * mapping shape as auth.service.ts's toLegacyRoleString (D-8) — that one is
 * module-private to auth.service.ts by design (D-8 confines it there for
 * the JWT claim specifically), so this is a small, intentional, temporary
 * duplication for the response-shape boundary, not drift.
 *
 * REMOVED in the frontend companion PR (Plan B, task "safe() gains
 * role-object + isPrimaryAdmin") once UserManagementTab.tsx/AdminBranches.tsx
 * are updated to consume the full role object atomically with that change.
 */
function toLegacyRoleStringTransitional(roleKey: string): 'admin' | 'doctor' | 'staff' {
  if (roleKey === 'clinic_admin') return 'admin'
  if (roleKey === 'doctor') return 'doctor'
  return 'staff'
}
```

Replace `safe()` (lines 57-70):

```ts
function safe(user: {
  id: number; tenantId: number; name: string; username: string
  email: string | null; phone?: string | null
  passwordHash?: string; isActive: boolean; createdAt: Date
  roleRef: { id: number; name: string; key: string; isSystem: boolean } | null
}): UserResponse {
  const { passwordHash: _pw, roleRef, ...rest } = user
  if (!roleRef) throw new UserError('User has no role assigned — data integrity error', 500)
  return {
    ...rest,
    role:      toLegacyRoleStringTransitional(roleRef.key),
    email:     rest.email ?? null,
    phone:     rest.phone ?? null,
    createdAt: rest.createdAt.toISOString(),
  }
}
```

- [ ] **Step 6: Rewrite `createUser`/`updateUser`**

```ts
export async function createUser(tenantId: number, body: CreateUserRequest): Promise<UserResponse> {
  if (!body.email && !body.phone) {
    throw new UserError('At least one contact (email or phone) is required', 422)
  }

  await subscriptionService.assertCanAddUser(tenantId)

  const roleRow = await roleRepo.findRoleById(body.roleId)
  if (!roleRow) throw new UserError(`Unknown role: ${body.roleId}`, 400)

  const passwordHash = await bcrypt.hash(body.password, config.bcryptRounds)
  try {
    const user = await userRepo.createUserWithRole(
      tenantId,
      { name: body.name, username: body.username, email: body.email ?? null, phone: body.phone ?? null, passwordHash },
      roleRow.id,
    )
    return safe(user)
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new UserError('Username or email already in use within this clinic', 409)
    }
    throw err
  }
}

export async function updateUser(
  tenantId: number, userId: number, body: UpdateUserRequest
): Promise<UserResponse> {
  const existing = await userRepo.findUserById(tenantId, userId)
  if (!existing) throw new UserError('User not found', 404)

  await assertNotPrimaryAdminDeactivation(tenantId, userId, { isActive: body.isActive, roleId: body.roleId })

  if (body.isActive === true && existing.isActive === false) {
    await subscriptionService.assertCanAddUser(tenantId)
  }

  if (body.roleId !== undefined) {
    const roleRow = await roleRepo.findRoleById(body.roleId)
    if (!roleRow) throw new UserError(`Unknown role: ${body.roleId}`, 400)

    await userRepo.replaceUserRole(tenantId, userId, roleRow.id)
  }

  const user = await userRepo.updateUser(tenantId, userId, body)
  if (!user) throw new UserError('User not found', 404)
  return safe(user)
}
```

(`assertNotPrimaryAdminDeactivation`'s new `roleId`-based signature is written in Task 7, immediately after this one — this task's call already passes `roleId`, which will not type-check standalone; land Task 7 in the same working session before any intermediate build gate.)

Note: `userRepo.createUserWithRole`'s transaction (line 50-64, unchanged by this task) does not itself return `roleRef` — its `tx.user.create({ data: { tenantId, ...data, roleId } })` call returns the created row without the relation included. Add `include: { roleRef: true }` to that `tx.user.create` call so `safe()` receives it:

```ts
// src/backend/models/user.repository.ts, inside createUserWithRole's transaction
const user = await tx.user.create({
  data: { tenantId, ...data, roleId },
  include: { roleRef: true },
})
```

And `userRepo.updateUser` (line 66-69) similarly needs its `findFirst` to include `roleRef`:

```ts
export async function updateUser(tenantId: number, userId: number, data: UpdateUserRequest) {
  await prisma.user.updateMany({ where: { id: userId, tenantId }, data })
  return prisma.user.findFirst({ where: { id: userId, tenantId }, include: { roleRef: true } })
}
```

- [ ] **Step 7: Fix `assignUserBranches`' dead `role` reference**

`assignUserBranches` (lines 243-278) returns an `AssignBranchesResponse` with `role: user.role` (line 275) — this still reads the dropped column. Update `AssignBranchesResponse` and the function:

```ts
export interface AssignBranchesResponse {
  id:               number
  name:             string
  username:         string
  role:             string
  assignedBranches: { id: number; name: string }[]
}

export async function assignUserBranches(
  tenantId:  number,
  userId:    number,
  branchIds: number[],
): Promise<AssignBranchesResponse> {
  const user = await userRepo.findUserById(tenantId, userId)
  if (!user) throw new UserError('User not found', 404)

  if (branchIds.length > 0) {
    const validBranches = await prisma.branch.findMany({ where: { id: { in: branchIds }, tenantId }, select: { id: true } })
    if (validBranches.length !== branchIds.length) {
      throw new UserError('One or more branches not found in this tenant', 404)
    }
  }

  const userRoleRows = await userRepo.findUserRolesWithDetails(tenantId, userId)
  const isAdmin = userRoleRows.some(ur => ur.role.key?.includes('admin'))

  if (!isAdmin && branchIds.length === 0) {
    throw new UserError('Staff and Doctor must be assigned to at least one branch', 422)
  }

  await userRepo.replaceUserBranches(tenantId, userId, branchIds)

  const assignedBranches = await userRepo.getUserBranches(tenantId, userId)
  return {
    id:               user.id,
    name:             user.name,
    username:         user.username,
    role:             user.roleRef ? toLegacyRoleStringTransitional(user.roleRef.key) : 'staff',
    assignedBranches,
  }
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm --prefix src/backend run test -- __tests__/userManagement.test.ts`
Expected: still some failures from `assertNotPrimaryAdminDeactivation`'s signature (Task 7 fixes this) — expected mid-sequence. Confirm specifically that the 5 new tests from Step 2 do NOT fail on `roleId`/`role`-string handling; full green comes after Task 7.

- [ ] **Step 9: Commit**

```bash
git add src/backend/services/user.service.ts src/backend/models/user.repository.ts src/backend/types/index.ts src/backend/__tests__/userManagement.test.ts
git commit -m "feat(users): roleId-based create/update, safe() stays backward-compatible via transitional mapper"
```

---

### Task 7: `user.service.ts` — re-point primary-admin lockout guard to `role.key` (T-URA-2.2)

**Files:**
- Modify: `src/backend/services/user.service.ts:41-55` (`assertNotPrimaryAdminDeactivation`)
- Modify: `src/backend/models/user.repository.ts:246-260` (`findPrimaryAdminId`)
- Test: `src/backend/tests/integration/user-primary-admin-protection.test.ts`

**Interfaces:**
- Produces: `assertNotPrimaryAdminDeactivation(tenantId: number, userId: number, change: { isActive?: boolean; roleId?: number }): Promise<void>` (signature changed from `change.role?: string`). `findPrimaryAdminId(tenantId: number): Promise<number | null>` now resolves via `roleRef.key === 'clinic_admin'`.

- [ ] **Step 1: Write the failing test**

Add to `src/backend/tests/integration/user-primary-admin-protection.test.ts` (reuse the file's existing `primaryAdminId`, `admin2Id`, tenant/token fixtures):

```ts
it('blocks demoting the primary admin to a custom role cloned from Doctor', async () => {
  const doctorSystemRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor', tenantId: null } })
  const clonedDoctorRole = await prisma.clinicRole.create({
    data: { tenantId: tid, key: `tenant_${tid}_senior_vet`, name: 'Senior Vet', isSystem: false, permVersion: 1, sourceRoleId: doctorSystemRole.id },
  })

  const res = await request(server)
    .put(`/users/${primaryAdminId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ roleId: clonedDoctorRole.id })

  expect(res.status).toBe(403)
  expect(res.body.error).toMatch(/primary clinic admin/i)
})

it('allows demoting a non-primary admin-role user to Doctor', async () => {
  const doctorRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor', tenantId: null } })
  const res = await request(server)
    .put(`/users/${admin2Id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ roleId: doctorRole.id })

  expect(res.status).toBe(200)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix src/backend run test -- tests/integration/user-primary-admin-protection.test.ts`
Expected: FAIL (guard still reads the legacy `role` string param signature; `findPrimaryAdminId` still queries the now-dropped `role` column and will error at runtime).

- [ ] **Step 3: Update `findPrimaryAdminId`**

```ts
export async function findPrimaryAdminId(tenantId: number): Promise<number | null> {
  const admin = await prisma.user.findFirst({
    where:   { tenantId, roleRef: { key: 'clinic_admin' } },
    orderBy: { id: 'asc' },
    select:  { id: true },
  })
  return admin?.id ?? null
}
```

- [ ] **Step 4: Update `assertNotPrimaryAdminDeactivation`**

```ts
async function assertNotPrimaryAdminDeactivation(
  tenantId: number,
  userId: number,
  change: { isActive?: boolean; roleId?: number },
): Promise<void> {
  const primaryAdminId = await userRepo.findPrimaryAdminId(tenantId)
  if (primaryAdminId === null || userId !== primaryAdminId) return

  if (change.isActive === false) {
    throw new UserError('Cannot deactivate the primary clinic admin', 403)
  }
  if (change.roleId !== undefined) {
    const targetRole = await roleRepo.findRoleById(change.roleId)
    if (!targetRole || targetRole.key !== 'clinic_admin') {
      throw new UserError("Cannot change the primary clinic admin's role", 403)
    }
  }
}
```

`deactivateUser` (its other call site) is unchanged — still passes `{ isActive: false }`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm --prefix src/backend run test -- tests/integration/user-primary-admin-protection.test.ts`
Expected: PASS (all cases, including the 2 new ones). Also re-run `userManagement.test.ts` from Task 6 — it should now be fully green.

- [ ] **Step 6: Commit**

```bash
git add src/backend/services/user.service.ts src/backend/models/user.repository.ts src/backend/tests/integration/user-primary-admin-protection.test.ts
git commit -m "fix(users): re-point primary-admin lockout guard to role.key === 'clinic_admin'"
```

---

### Task 8: `auth.service.ts` — legacy-compatible JWT `role` claim mapper (T-URA-2.8, D-8, F-1)

**Files:**
- Modify: `src/backend/services/auth.service.ts:37-117,124-181,194-228,233-252,266-318`
- Modify: `src/backend/models/auth.repository.ts:9-26` (`findUserByTenantUsername`, `findUserById` — add `include: { roleRef: { select: { key: true } } }`)
- Test: `<AUTH_TEST_FILE>` (confirm via `find src/backend/tests -iname "*auth*"`)

**Interfaces:**
- Produces: private `toLegacyRoleString(roleKey: string): 'admin' | 'doctor' | 'staff'` in `auth.service.ts` — NOT exported. Every `user.role` read in this file routes through it. `JwtPayload.role` claim's runtime values are unchanged.

- [ ] **Step 1: Confirm the test file location**

```bash
find src/backend/tests -iname "*auth*"
```

- [ ] **Step 2: Write the failing test**

Add to `<AUTH_TEST_FILE>` (reuse the file's existing tenant/branch/user fixture helpers):

```ts
it('admin login still skips branch selection after the roleId migration', async () => {
  const res = await request(server)
    .post('/auth/login')
    .send({ subdomain: SUB, username: 'admin_user_auth_test', password: PASSWORD })
  expect(res.status).toBe(200)
  expect(res.body.data.requiresBranchSelection).toBe(false)
  expect(res.body.data.role).toBe('admin')
})

it('a custom-role user cloned from Doctor logs in with mapped claim "staff" and routes non-admin', async () => {
  const doctorSystemRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor', tenantId: null } })
  const clonedRole = await prisma.clinicRole.create({
    data: { tenantId: tid, key: `tenant_${tid}_senior_vet_auth`, name: 'Senior Vet', isSystem: false, permVersion: 1, sourceRoleId: doctorSystemRole.id },
  })
  await prisma.user.update({ where: { id: someBranchAssignedUserId }, data: { roleId: clonedRole.id } })
  await prisma.userRole.deleteMany({ where: { userId: someBranchAssignedUserId } })
  await prisma.userRole.create({ data: { userId: someBranchAssignedUserId, roleId: clonedRole.id, tenantId: tid } })

  const res = await request(server)
    .post('/auth/login')
    .send({ subdomain: SUB, username: 'branch_assigned_user_auth_test', password: PASSWORD })
  expect(res.status).toBe(200)
  expect(res.body.data.requiresBranchSelection).toBe(true)
  const decoded = jwt.decode(res.body.data.pendingToken) as { role: string }
  expect(decoded.role).toBe('staff')
})
```

(Adjust fixture variable names to match `<AUTH_TEST_FILE>`'s actual `beforeAll` setup.)

- [ ] **Step 3: Run test to verify it fails**

Run: `npm --prefix src/backend run test -- <AUTH_TEST_FILE>`
Expected: FAIL — `user.role` no longer exists on the Prisma `User` model post-Task-4, so every one of the 7+ read sites in this file currently errors.

- [ ] **Step 4: Add the mapper and route every `user.role` read through it**

At the top of `src/backend/services/auth.service.ts`, after the existing imports:

```ts
/**
 * Map a role's stable `key` to the legacy 3-value role string the JWT `role`
 * claim and 9 frontend consumers still expect (D-8, option (a) — BA sign-off
 * F-1, confined to this file). Every custom/cloned role (including
 * `clinic_staff` itself) maps to `'staff'`.
 *
 * NOT exported — deliberately private to this file. Renaming the claim to
 * `roleKey` (option b) is the D-6 follow-up, not this mapper's job.
 */
function toLegacyRoleString(roleKey: string): 'admin' | 'doctor' | 'staff' {
  if (roleKey === 'clinic_admin') return 'admin'
  if (roleKey === 'doctor') return 'doctor'
  return 'staff'
}
```

In `src/backend/models/auth.repository.ts`:

```ts
export function findUserByTenantUsername(tenantId: number, username: string) {
  return prisma.user.findUnique({
    where: { tenantId_username: { tenantId, username } },
    include: { roleRef: { select: { key: true } } },
  })
}

export function findUserById(tenantId: number, userId: number) {
  return prisma.user.findFirst({
    where: { id: userId, tenantId },
    include: { roleRef: { select: { key: true } } },
  })
}
```

In `auth.service.ts`, every read of `user.role` becomes `toLegacyRoleString(user.roleRef!.key)`:

- `login()` line 65: `const legacyRole = toLegacyRoleString(user.roleRef!.key); const isAdmin = legacyRole === 'admin'`
- `login()` lines 69-98 (admin branch): every `role: user.role` → `role: legacyRole`
- `login()` lines 107-116 (non-admin branch, `signPendingToken`): `role: user.role` → `role: legacyRole`
- `selectBranch()` line 177: add `const legacyRole = toLegacyRoleString(user.roleRef!.key)` right after `authRepo.findUserById` (line 138), use it here.
- `switchBranch()` lines 208, 217: add `const legacyRole = toLegacyRoleString(user.roleRef!.key)` right after `authRepo.findUserById` (line 198), use at both sites.
- `refreshClinicToken()` line 310: `role: toLegacyRoleString(user.roleRef!.key)`.

The `!` non-null assertions are safe: `roleId` is NOT NULL post-Task-4 and every `User` row has a `roleRef` relation by FK invariant.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm --prefix src/backend run test -- <AUTH_TEST_FILE>`
Expected: PASS.

- [ ] **Step 6: Confirm no remaining `user.role` reads**

```bash
grep -n "user\.role\b" src/backend/services/auth.service.ts
```

Expected: zero matches.

- [ ] **Step 7: Commit**

```bash
git add src/backend/services/auth.service.ts src/backend/models/auth.repository.ts src/backend/tests/integration/*auth*
git commit -m "feat(auth): confine legacy role-claim mapping to auth.service.ts (D-8, F-1) — JWT contract unchanged"
```

---

### Task 9: Permission gate + no-escalation check on the role-change branch (T-URA-2.6, T-URA-2.7, CORR-3)

**Files:**
- Modify: `src/backend/services/user.service.ts` (add gate + subset check inside `createUser`/`updateUser`)
- Modify: `src/backend/controllers/user.controller.ts:36-62` (supply `callerPerms`/`hasAssignRole`)
- Test: `src/backend/__tests__/userManagement.test.ts`

**Interfaces:**
- Consumes: `resolvePermissions(userId, tenantId): Promise<Set<string>>` (existing, `permission.service.ts`).
- Produces: `createUser`/`updateUser` gain two new parameters: `callerPerms: Set<string>`, `hasAssignRole: boolean` (matches `role.service.ts`'s existing `callerPerms: Set<string>` convention). Return type unchanged (`UserResponse` with `role: string`, per Task 6).

- [ ] **Step 1: Write the failing test**

Add to `src/backend/__tests__/userManagement.test.ts`:

```ts
it('rejects a roleId change from a caller lacking staff.assign_role', async () => {
  const doctorRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor', tenantId: null } })
  const target = await userService.createUser(tenantId, {
    name: 'Target', username: 'target_gate_ura', email: 't@test.com', password: 'TestPass1!', roleId: doctorRole.id,
  }, new Set(['staff.manage', 'staff.view']), true)

  await expect(userService.updateUser(
    tenantId, target.id, { roleId: doctorRole.id },
    new Set(['staff.manage']), false,
  )).rejects.toMatchObject({ statusCode: 403 })
})

it('allows a name-only edit without staff.assign_role', async () => {
  const doctorRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor', tenantId: null } })
  const target = await userService.createUser(tenantId, {
    name: 'Target2', username: 'target2_gate_ura', email: 't2@test.com', password: 'TestPass1!', roleId: doctorRole.id,
  }, new Set(['staff.manage', 'staff.view']), true)

  const updated = await userService.updateUser(
    tenantId, target.id, { name: 'Renamed' },
    new Set(['staff.manage']), false,
  )
  expect(updated.name).toBe('Renamed')
})

it('rejects assigning a role whose permissions exceed the caller\'s own', async () => {
  const adminRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_admin', tenantId: null } })
  const doctorRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor', tenantId: null } })
  const target = await userService.createUser(tenantId, {
    name: 'Target3', username: 'target3_gate_ura', email: 't3@test.com', password: 'TestPass1!', roleId: doctorRole.id,
  }, new Set(['staff.manage', 'staff.view', 'staff.assign_role']), true)

  await expect(userService.updateUser(
    tenantId, target.id, { roleId: adminRole.id },
    new Set(['staff.manage', 'staff.view', 'staff.assign_role']),
    true,
  )).rejects.toMatchObject({ statusCode: 403 })
})

it('allows a clinic_admin-level caller to assign any role within their permission set', async () => {
  const doctorRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor', tenantId: null } })
  const adminRoleWithPerms = await prisma.clinicRole.findFirstOrThrow({
    where: { key: 'clinic_admin', tenantId: null },
    include: { permissions: true },
  })
  const target = await userService.createUser(tenantId, {
    name: 'Target4', username: 'target4_gate_ura', email: 't4@test.com', password: 'TestPass1!', roleId: doctorRole.id,
  }, new Set(['staff.manage', 'staff.view', 'staff.assign_role']), true)

  const fullAdminPerms = new Set([...adminRoleWithPerms.permissions.map(p => p.permissionCode), 'staff.assign_role'])
  const updated = await userService.updateUser(
    tenantId, target.id, { roleId: adminRoleWithPerms.id },
    fullAdminPerms, true,
  )
  expect(updated.role).toBe('admin')
})
```

Note: every other existing call to `userService.createUser`/`updateUser` in this test file (Tasks 6-8's own tests) must ALSO be updated to pass the two new parameters, or those tests will now fail with a TS arity error. Update Task 6's 5 tests and Task 7's fixtures to pass `new Set(['staff.manage', 'staff.view', 'staff.assign_role'])` and `true` as the trailing two args (the tests were exercising service-layer behavior directly, so this is a mechanical update, not a behavior change to those tests).

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix src/backend run test -- __tests__/userManagement.test.ts`
Expected: FAIL — arity mismatch on every call site.

- [ ] **Step 3: Implement the gate + subset check**

```ts
export async function createUser(
  tenantId: number,
  body: CreateUserRequest,
  callerPerms: Set<string>,
  hasAssignRole: boolean,
): Promise<UserResponse> {
  if (!body.email && !body.phone) {
    throw new UserError('At least one contact (email or phone) is required', 422)
  }

  await subscriptionService.assertCanAddUser(tenantId)

  if (!hasAssignRole) {
    throw new UserError('Assigning a role requires the staff.assign_role permission', 403)
  }

  const roleRow = await roleRepo.findRoleById(body.roleId)
  if (!roleRow) throw new UserError(`Unknown role: ${body.roleId}`, 400)

  const escalations = roleRow.permissions
    .map(p => p.permissionCode)
    .filter(code => !callerPerms.has(code))
  if (escalations.length > 0) {
    throw new UserError(`Cannot assign a role whose permissions exceed your own: ${escalations.join(', ')}`, 403)
  }

  const passwordHash = await bcrypt.hash(body.password, config.bcryptRounds)
  try {
    const user = await userRepo.createUserWithRole(
      tenantId,
      { name: body.name, username: body.username, email: body.email ?? null, phone: body.phone ?? null, passwordHash },
      roleRow.id,
    )
    return safe(user)
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new UserError('Username or email already in use within this clinic', 409)
    }
    throw err
  }
}

export async function updateUser(
  tenantId: number, userId: number, body: UpdateUserRequest,
  callerPerms: Set<string>, hasAssignRole: boolean,
): Promise<UserResponse> {
  const existing = await userRepo.findUserById(tenantId, userId)
  if (!existing) throw new UserError('User not found', 404)

  await assertNotPrimaryAdminDeactivation(tenantId, userId, { isActive: body.isActive, roleId: body.roleId })

  if (body.isActive === true && existing.isActive === false) {
    await subscriptionService.assertCanAddUser(tenantId)
  }

  if (body.roleId !== undefined) {
    if (!hasAssignRole) {
      throw new UserError('Assigning a role requires the staff.assign_role permission', 403)
    }

    const roleRow = await roleRepo.findRoleById(body.roleId)
    if (!roleRow) throw new UserError(`Unknown role: ${body.roleId}`, 400)

    const escalations = roleRow.permissions
      .map(p => p.permissionCode)
      .filter(code => !callerPerms.has(code))
    if (escalations.length > 0) {
      throw new UserError(`Cannot assign a role whose permissions exceed your own: ${escalations.join(', ')}`, 403)
    }

    await userRepo.replaceUserRole(tenantId, userId, roleRow.id)
  }

  const user = await userRepo.updateUser(tenantId, userId, body)
  if (!user) throw new UserError('User not found', 404)
  return safe(user)
}
```

- [ ] **Step 4: Wire the controller**

In `src/backend/controllers/user.controller.ts`:

```ts
import { resolvePermissions } from '../services/permission.service'

export async function createUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const callerPerms = await resolvePermissions(req.context!.userId, req.context!.tenantId)
    const data = await userService.createUser(
      req.context!.tenantId, req.body, callerPerms, callerPerms.has('staff.assign_role'),
    )
    res.status(201).json({ success: true, data })
  } catch (err) { next(err) }
}

export async function updateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const callerPerms = await resolvePermissions(req.context!.userId, req.context!.tenantId)
    const data = await userService.updateUser(
      req.context!.tenantId, Number(req.params.id), req.body, callerPerms, callerPerms.has('staff.assign_role'),
    )
    res.json({ success: true, data })
  } catch (err) { next(err) }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm --prefix src/backend run test -- __tests__/userManagement.test.ts`
Expected: PASS (all tests, including the 4 new ones and the mechanically-updated earlier ones).

- [ ] **Step 6: Commit**

```bash
git add src/backend/services/user.service.ts src/backend/controllers/user.controller.ts src/backend/__tests__/userManagement.test.ts
git commit -m "feat(users): staff.assign_role gate + no-escalation check on role-change branch (CORR-3)"
```

---

### Task 10: `role.service.ts` — reject cloning the Admin system role (T-URA-2.4)

**Files:**
- Modify: `src/backend/services/role.service.ts:77-109` (`cloneRole`)
- Test: `src/backend/tests/integration/roleManagement.test.ts`

**Interfaces:** `cloneRole(...)` now throws `ForbiddenError` (403) when `sourceRole.key === 'clinic_admin'`, before any other work. No signature change.

- [ ] **Step 1: Write the failing test**

```ts
it('rejects cloning the clinic_admin system role, regardless of caller permissions', async () => {
  const adminRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_admin', tenantId: null }, include: { permissions: true } })
  const fullPerms = new Set(adminRole.permissions.map(p => p.permissionCode))

  await expect(roleService.cloneRole(tenantId, 'Admin', 'Super Admin Clone', fullPerms))
    .rejects.toBeInstanceOf(ForbiddenError)
})

it('still allows cloning Doctor and Staff system roles', async () => {
  const doctorRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor', tenantId: null }, include: { permissions: true } })
  const perms = new Set(doctorRole.permissions.map(p => p.permissionCode))
  const cloned = await roleService.cloneRole(tenantId, 'Doctor', 'Vet Specialist', perms)
  expect(cloned.name).toBe('Vet Specialist')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix src/backend run test -- tests/integration/roleManagement.test.ts`
Expected: FAIL — cloning Admin currently succeeds.

- [ ] **Step 3: Add the rejection check**

```ts
export async function cloneRole(
  tenantId:       number,
  sourceRoleName: string,
  newName:        string,
  callerPerms:    Set<string>,
): Promise<RoleDto> {
  const sourceRole = await roleRepo.findRoleByName(sourceRoleName, null)
  if (!sourceRole) {
    throw new NotFoundError(`System role '${sourceRoleName}'`)
  }

  if (sourceRole.key === 'clinic_admin') {
    throw new ForbiddenError('The Admin role cannot be cloned. Assign the Admin role directly instead.')
  }

  const existing = await roleRepo.findRoleByName(newName, tenantId)
  // ...rest unchanged
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix src/backend run test -- tests/integration/roleManagement.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backend/services/role.service.ts src/backend/tests/integration/roleManagement.test.ts
git commit -m "feat(roles): reject cloning the sealed clinic_admin system role (D-4)"
```

---

### Task 11: `RoleDto`/`role.controller.ts` — expose `key` on role list responses (implementation gap found during write-plan)

**Files:**
- Modify: `src/backend/services/role.service.ts:23-52` (`RoleDto`, `toDto`)
- Test: `src/backend/tests/integration/roleManagement.test.ts`

**Interfaces:** `RoleDto.key: string` (new, additive field). No existing consumer reads it yet — safe under this plan's "no response-shape change that breaks a shipped screen" constraint (this is a pure addition, nothing today reads `GET /clinic/roles` and asserts on the absence of a `key` field). Consumed by Plan B's Task 3 (`RoleList.tsx` Admin clone-button gating).

- [ ] **Step 1: Write the failing test**

```ts
it('GET /clinic/roles includes each role\'s key', async () => {
  const res = await request(server)
    .get('/clinic/roles')
    .set('Authorization', `Bearer ${adminToken}`)
  expect(res.status).toBe(200)
  const adminRow = res.body.data.find((r: { name: string }) => r.name === 'Admin')
  expect(adminRow.key).toBe('clinic_admin')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix src/backend run test -- tests/integration/roleManagement.test.ts`
Expected: FAIL — `adminRow.key` is `undefined`.

- [ ] **Step 3: Add `key` to `RoleDto` and `toDto`**

```ts
export interface RoleDto {
  id:                 number
  name:               string
  key:                string
  isSystem:           boolean
  tenantId:           number | null
  permVersion:        number
  permissions:        string[]
  assignedUserCount?: number
}

function toDto(role: {
  id:          number
  name:        string
  key:         string
  isSystem:    boolean
  tenantId:    number | null
  permVersion: number
  permissions: { permissionCode: string }[]
}): RoleDto {
  return {
    id:          role.id,
    name:        role.name,
    key:         role.key,
    isSystem:    role.isSystem,
    tenantId:    role.tenantId,
    permVersion: role.permVersion,
    permissions: role.permissions.map(p => p.permissionCode),
  }
}
```

No repository change needed — `listRoles`/`findRoleById` already return `key` on every row via Prisma's default no-`select` scalar behavior.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix src/backend run test -- tests/integration/roleManagement.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backend/services/role.service.ts src/backend/tests/integration/roleManagement.test.ts
git commit -m "feat(roles): expose role.key on GET /clinic/roles (additive; consumed by Plan B)"
```

---

### Task 12: `rbac.middleware.ts` dead-code check (T-URA-2.9)

**Files:**
- Delete (conditionally): `src/backend/middlewares/rbac.middleware.ts`
- Delete (conditionally): its unit test

**Interfaces:** none — pure dead-code removal, gated on a grep check.

- [ ] **Step 1: Confirm zero non-test references**

```bash
grep -rln "rbac.middleware\|rbacMiddleware" src/backend --include="*.ts" | grep -v "rbac.middleware.test"
```

Expected: only `rbac.middleware.ts` itself.

- [ ] **Step 2a: If zero references (expected) — delete both files**

```bash
rm src/backend/middlewares/rbac.middleware.ts
find src/backend -iname "*rbac.middleware.test*" -delete
```

- [ ] **Step 2b: If any reference IS found — stop, do not delete, record it**

Leave the file in place; note the referencing file path in this plan's PR notes for Step 8.

- [ ] **Step 3: Run the full backend suite**

```bash
npm --prefix src/backend run test 2>&1 | tail -30
```

Expected: no new failures attributable to the deleted file.

- [ ] **Step 4: Commit**

```bash
git add -A src/backend/middlewares
git commit -m "chore: remove dead rbac.middleware.ts (superseded by permission.middleware.ts)"
```

---

## Phase 3 — Documentation supersession (URA-5, CORR-1.2 binds these to Plan A)

### Task 13: Retire FR-14b in `anemal-functional-reqs`

**Files:** Modify: `.claude/skills/anemal-functional-reqs/SKILL.md:76`

**Interfaces:** none (doc-only).

- [ ] **Step 1: Confirm current content (line 76)**

```
| Multi-role (RBAC) | FR-14b | A clinic user may hold **multiple roles**; effective permissions = union; **Clinic Admin assigns roles** (`staff.assign_role`, no escalation, ≥1 role). CR-01 |
```

- [ ] **Step 2: Replace with the retirement note**

```
| Multi-role (RBAC) | ~~FR-14b~~ RETIRED 2026-07-20 | **Superseded by ADR-0019** — a clinic user holds exactly **one** role via `roleId`; combined access is achieved by cloning a role with the right permission mix (e.g. "Doctor + Accounting"), not by stacking roles. **Clinic Admin assigns the role** (`staff.assign_role`, no escalation — permissions of the assigned role must be ⊆ the assigner's own). See `docs/adr/0019-single-role-per-user-retires-multi-role.md`, `docs/superpowers/plans/2026-07-20-unify-user-role-assignment-plan-a-backend.md`, and `-plan-b-frontend.md`. |
```

- [ ] **Step 3: No automated test (doc-only)** — visually confirm the markdown table still renders correctly.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/anemal-functional-reqs/SKILL.md
git commit -m "docs(fr): retire FR-14b multi-role — superseded by ADR-0019 single-role model"
```

---

### Task 14: Retire CR-01 in `anemal-rbac-matrix` (SKILL.md + permission-matrix.md §5)

**Files:**
- Modify: `.claude/skills/anemal-rbac-matrix/SKILL.md:16,65-71`
- Modify: `.claude/skills/anemal-rbac-matrix/references/permission-matrix.md:174-197`

**Interfaces:** none (doc-only).

- [ ] **Step 1: Update `SKILL.md`'s model summary (line 16)**

Current:

```
- **User** holds **one or more roles** via `user_roles` (CR-01). Server resolves the **union**
  of all roles' permissions (current implementation: 5-minute in-memory cache keyed by
  `tenantId:userId`; `permSetVersion` in the JWT detects stale tokens). UI mirrors it via
  `usePermissions()` for hide/disable only. A Clinic Admin assigns/removes a user's roles.
```

Replace with:

```
- **User** holds **exactly one role** via `roleId` (single-role model, ADR-0019 — retires the
  earlier CR-01 multi-role design). Server resolves that role's permission set (current
  implementation: 5-minute in-memory cache keyed by `tenantId:userId`; `permSetVersion` in the
  JWT detects stale tokens). UI mirrors it via `usePermissions()` for hide/disable only. A
  Clinic Admin assigns a user's role (`staff.assign_role`, no escalation — the assigned role's
  permissions must be a subset of the assigner's own).
```

- [ ] **Step 2: Replace the "Multi-role users (CR-01)" section (lines 65-71)**

```
## Single-role users (ADR-0019, retires CR-01)
A user holds exactly one role via `User.roleId` (NOT NULL). Effective permissions = that role's
permission set (no union — the earlier CR-01 multi-role design, and the `user_roles` join table's
many-to-many capacity, are retired; `user_roles` now holds exactly one row per user, kept in sync
by `replaceUserRole`). Clinic Admin (perm `staff.assign_role`) assigns a user's role but may only
grant a role whose permissions are a **subset of their own** (no escalation) — enforced server-side
on the `PUT /users/:id`/`POST /users` role-change branch, not just on a dedicated role-assignment
route. Combined access needs are met by cloning a role with the right permission mix, not by
stacking roles on one user. See `docs/adr/0019-single-role-per-user-retires-multi-role.md`.
```

- [ ] **Step 3: Update `permission-matrix.md` §5 (lines 174-197)**

Replace the section header and opening paragraph:

```
## 5. Single-role retirement of the earlier multi-role addendum (ADR-0019, retires CR-01)

Users are linked to a role one-to-one via `User.roleId` (NOT NULL). The `user_roles` join
table now holds exactly one row per user (kept in sync by `replaceUserRole`) — its
many-to-many *shape* is retained at the schema level for backward-compatible query patterns,
but the product no longer supports more than one row per user. Effective permission set =
that single role's permissions (no union).
```

Keep the `staff.assign_role`/`staff.assign_branch` permission-code table and runtime-rule text largely as-is, but replace the stale route reference (`POST/DELETE /users/:id/roles → staff.assign_role`, now removed by Task 4) with:

```
Runtime rule: assigning a role requires `staff.assign_role`, and the assigned role's permissions
must be ⊆ the assigner's effective permissions (no escalation) — enforced in `user.service.ts`'s
`createUser`/`updateUser` role-change branch. A user must always hold exactly one role (ADR-0019 —
this is now an absolute invariant, not a "≥ 1" minimum).
Route map: `PUT /users/:id` (with `roleId` in the body) → `staff.manage` + `staff.assign_role`;
`POST /users` (create) → `staff.manage` + `staff.assign_role`.
```

- [ ] **Step 4: No automated test (doc-only)** — visually confirm both files render correctly.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/anemal-rbac-matrix/SKILL.md .claude/skills/anemal-rbac-matrix/references/permission-matrix.md
git commit -m "docs(rbac): retire CR-01 multi-role addendum, describe single-role model (ADR-0019)"
```

---

## Phase 4 — Plan A verification sweep

### Task 15: Backend regression run + scope-map reconciliation

**Files:** none (verification only — any fixes go in follow-up per-file commits).

**Interfaces:** none.

- [ ] **Step 1: Run the full backend suite**

```bash
npm --prefix src/backend run test 2>&1 | tee /tmp/plan-a-backend-run.txt | tail -80
```

Expected: green, except for any test file not touched by Tasks 5-11 that still constructs a `User` fixture with a `role: 'admin'` string literal (Task 4's scope map). For each remaining failure, apply the same `role: 'x'` → `roleId: <lookup>` pattern used in Tasks 6-10's test edits, one file per commit (`test: update <file> fixtures for roleId migration`).

- [ ] **Step 2: TypeScript compile check**

```bash
cd src/backend && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Confirm migration is applied and idempotent**

```bash
npx prisma migrate status
```

Expected: no pending migrations.

- [ ] **Step 4: Confirm this plan does not touch any frontend file**

```bash
git diff --stat origin/main...HEAD -- src/frontend
```

Expected: empty output — this plan's entire diff is `src/backend`, `.claude/skills`, and `docs/`.

- [ ] **Step 5: Final commit (if any Step 1-2 fixes were needed and not yet committed)**

```bash
git add -A
git commit -m "test: final regression sweep for Plan A (unify-user-role-assignment backend)"
```

---

## Self-review notes (for the plan author, not a task)

- **Coupling fix verified:** `UserResponse.role` stays `string` throughout every task in this plan (Task 6's transitional mapper, Task 9's gate, Task 11's additive `RoleDto.key`). No task here changes a response shape a shipped frontend screen currently reads. Step 4 of Task 15 is the mechanical proof — `git diff` against `src/frontend` must be empty.
- **Spec coverage:** URA-1 → Tasks 1-4; URA-2 → Tasks 5-12 (T-URA-2.9 = Task 12; `RoleDto.key` gap = Task 11); URA-5 → Tasks 13-14. Grill findings F-1 (Task 8), F-5 (Task 4 Step 5) covered. F-4 enforced structurally by `roleId` NOT NULL (Task 4).
- **Ponytail re-submission note:** this plan is ~15 tasks touching backend services (`user.service.ts`, `role.service.ts`, `auth.service.ts`, their controllers/routes/repositories), one migration, and 2 doc files — 1 subsystem (backend) + docs, well inside the ≤10-file/≤3-subsystem guideline per file (each task touches 1-4 files). Estimated total unique files touched: ~18 across the whole plan (services, controllers, routes, repository, types, schema, migration, 2 scripts, docs) — still a real number given the column-drop's irreducible blast radius, but now scoped to one subsystem and independently mergeable/green, which is what Criterion 4 actually tests for (packaging, not raw count in isolation).
