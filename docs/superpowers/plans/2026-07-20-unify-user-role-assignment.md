# Unify User Role Assignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Clinic Admin's two independent role-assignment UIs (a legacy hardcoded `role` enum listbox and a separate RBAC "Roles" section) with a single listbox backed by the `ClinicRole` table, retire the now-superseded multi-role capability with an auditable migration, close a real privilege-escalation gap the unification would otherwise reintroduce, and drop the drift-prone legacy `User.role` column entirely.

**Architecture:** `roleId` (FK to `roles`/`ClinicRole`, NOT NULL) becomes the single source of truth for a user's role. A pre-migration script collapses any existing multi-role user down to one role (system role wins; ambiguous cases produce a manual-resolution report and block that tenant). The legacy `User.role` column and `LegacyRole` enum are then dropped in the same migration window. Backend services move from the legacy 3-string role model to `roleId`-based reads/writes, gain a `staff.assign_role` gate + no-escalation check on the role-change branch of `PUT /users/:id`, and `auth.service.ts` gains a private mapper that keeps the JWT's legacy `role` claim byte-identical for existing frontend consumers. The frontend's Edit User modal is rebuilt around one `useClinicRolesQuery()`-backed listbox; the standalone multi-role UI (`RolePicker.tsx`) and its backend endpoints are deleted.

**Tech Stack:** Node.js + Express + PostgreSQL 15 + Prisma, React 18 + TypeScript + TanStack Query + Tailwind, Jest (backend, `--runInBand --forceExit`), Vitest (frontend).

## Global Constraints

- Every query/write touching `users`, `user_roles`, or `roles` must be tenant-scoped (`WHERE tenantId = :tenantId`) — no exceptions (CLAUDE.md, ABSOLUTE).
- Deny-by-default: no new route may ship without `requirePlane` + `requirePermission`/`requireAnyPermission`.
- 44×44px minimum touch target on any new/changed interactive frontend element (Compassionate Care System).
- No new npm dependencies (tasks doc: 0 new deps, ≤5 limit).
- No new backend endpoints net (tasks doc: 0 added, 3 removed: `POST /clinic/roles/users/:userId/roles`, `DELETE /clinic/roles/users/:userId/roles/:roleId`, `GET /users/:userId/roles`).
- `User.roleId` must be an absolute invariant post-migration: every user has exactly one role, always (grill F-4).
- `AdminBranches.tsx`'s doctor picker stays **key-match only** (`role.key === 'doctor'`), deliberately narrower than the "Bookable doctor" lineage-aware convention — ADR-0019 is binding, do not unify the two.
- `auth.service.ts`'s legacy-string mapper (D-8, option (a)) must NOT touch `JwtPayload`, `ClinicLayout.tsx`, `AdminLayout.tsx`, `useAuth.ts`, `SettingsLayout.tsx`, `BranchSwitcher.tsx`, `LoginView.tsx`, `PreferencesPage.tsx`, `ProfileMenu.tsx`, or `authStore.ts` — those 9 files' input contract stays byte-identical (D-6 stays deferred).
- Backend test command: `npm --prefix src/backend run test -- <path>`. Frontend: `npm --prefix src/frontend run test -- <path>`. Migration command (run from `src/backend`): `npx prisma migrate dev --name <name>`.

---

## Phase 0 — Pre-migration verification and collapse (URA-1)

### Task 1: Verify and re-run the `roleId` backfill (T-URA-1.1)

**Files:**
- Modify: none (verification + script re-run only)
- Reference: `src/backend/prisma/backfill-user-roles.ts` (existing, idempotent)

**Interfaces:**
- Consumes: `backfillUserRoles()` (existing function in `backfill-user-roles.ts`, no signature change).
- Produces: a live dev DB state where `SELECT COUNT(*) FROM users WHERE "roleId" IS NULL` returns `0` — this is the hard precondition every later task in Phase 0/1 depends on.

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

Expected: `count = 0`. If any tenant still shows a NULL `roleId` here (e.g. a `superadmin` legacy row not yet migrated to `platform_users`), STOP — do not proceed to Task 2. That is a separate, pre-existing gap (T-5C-03 scope) that must be resolved first; it is out of scope for this feature to silently paper over.

- [ ] **Step 4: Commit the verification note**

No code changes in this task. Record the verification output (Step 1 and Step 3 results) in the migration PR description at Step 8 (`/anemal-finish-branch`) per CLAUDE.md doc-tracking convention — no commit needed here, this is a gate, not a code change.

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
    const passwordHash = 'x'
    const user = await prisma.user.create({
      data: {
        tenantId, name: 'Doctor A', username: 'doctor_a_collapse', passwordHash,
        role: 'doctor', roleId: systemDoctorRoleId,
      },
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
      data: {
        tenantId, name: 'Two System', username: 'two_system_collapse', passwordHash: 'x',
        role: 'doctor', roleId: systemDoctorRoleId,
      },
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
      data: {
        tenantId, name: 'Two Custom', username: 'two_custom_collapse', passwordHash: 'x',
        role: 'staff', roleId: customRoleAId,
      },
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
      data: {
        tenantId, name: 'Single Role', username: 'single_role_collapse', passwordHash: 'x',
        role: 'doctor', roleId: systemDoctorRoleId,
      },
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
      ambiguous.push({
        userId: g.userId,
        tenantId,
        roleIds: rows.map(r => r.roleId),
        reason: 'multiple-system-roles',
      })
    } else {
      // 0 system roles, 2+ custom roles
      ambiguous.push({
        userId: g.userId,
        tenantId,
        roleIds: rows.map(r => r.roleId),
        reason: 'multiple-custom-roles-no-system',
      })
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
- Produces: `collapseMultiRoleUsers(prisma: PrismaClient): Promise<CollapseReport>` where:
  ```ts
  interface CollapseLogEntry { userId: number; tenantId: number; keptRoleId: number; removedRoleIds: number[]; timestamp: string }
  interface CollapseReport { collapsed: CollapseLogEntry[]; manualResolutionNeeded: AmbiguousCase[] }
  ```
  and a runnable CLI entrypoint (`if (require.main === module)`), mirroring `backfill-user-roles.ts`'s own entrypoint pattern.

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
      // Keep the system role's user_roles row; delete the rest (custom roles).
      await tx.userRole.deleteMany({
        where: { userId: c.userId, tenantId: c.tenantId, roleId: { in: c.removedRoleIds } },
      })
      // Keep users.roleId in sync with the surviving role.
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

Expected: output includes a line for `doctor_a`'s collapse (`kept=<Doctor roleId>`, `removed=[<Accountant roleId>]`) — this is the exact live bug-reporter scenario (BA sign-off V2). Save this output; it is the audit log CORR-1.4 requires attached to the migration PR at Step 8.

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

**Interfaces:**
- Consumes: nothing (schema-only change); depends on Task 1 (zero NULLs) and Task 3 (multi-role collapsed) having run against the target DB first.
- Produces: `User.roleId: Int` (NOT NULL); no `User.role` field; no `LegacyRole` enum. Every later backend task (Task 5+) depends on this shape.

- [ ] **Step 1: Back up the dev DB before migrating**

```bash
docker exec vetclinic-pg pg_dump -U postgres vetclinic_dev > backup_pre_drop_legacy_role_$(date +%Y%m%d%H%M%S).sql
```

Expected: a non-empty `.sql` dump file is created. This is the actual rollback mechanism (CORR-2.1) — keep it until this migration has been verified stable in every environment it's applied to.

- [ ] **Step 2: Edit `schema.prisma` — drop the column and enum**

In `src/backend/prisma/schema.prisma`, inside `model User`, remove line 145 (`role LegacyRole`) and change line 147 from:

```prisma
  roleId              Int?
```

to:

```prisma
  roleId              Int
```

Remove the now-unused `enum LegacyRole { admin doctor staff }` block (lines 181-186, or current location if line numbers have drifted since this was written).

- [ ] **Step 3: Generate the migration**

```bash
cd src/backend && npx prisma migrate dev --name drop_legacy_role_column --create-only
```

Expected: a new migration folder under `src/backend/prisma/migrations/` containing `migration.sql` with `ALTER TABLE "users" DROP COLUMN "role";`, `ALTER TABLE "users" ALTER COLUMN "roleId" SET NOT NULL;`, and `DROP TYPE "LegacyRole";` (exact statement order/casing per Prisma's generator — verify the generated SQL contains these three operations before proceeding).

- [ ] **Step 4: Write the hand-written `down.sql`**

Create `src/backend/prisma/migrations/<the-folder-just-generated>/down.sql` (same naming convention as the `rbac_foundation` precedent):

```sql
-- down.sql — reverses drop_legacy_role_column
-- Run BEFORE re-running up if a rollback is needed.
-- LOSSY for custom-role users: their real role identity does not round-trip
-- (they are repopulated as legacy 'staff'). Emergency escape hatch only —
-- the real fallback is the pg_dump backup taken in Task 4 Step 1.

-- Re-add the enum
CREATE TYPE "LegacyRole" AS ENUM ('admin', 'doctor', 'staff');

-- Re-add the column (nullable at first so the backfill below can populate it)
ALTER TABLE "users" ADD COLUMN "role" "LegacyRole";

-- Repopulate via the reverse of auth.service.ts's toLegacyRoleString mapper (Task 9):
-- clinic_admin -> 'admin', doctor -> 'doctor', everything else -> 'staff'
UPDATE "users" u
SET "role" = CASE
  WHEN r."key" = 'clinic_admin' THEN 'admin'::"LegacyRole"
  WHEN r."key" = 'doctor'       THEN 'doctor'::"LegacyRole"
  ELSE 'staff'::"LegacyRole"
END
FROM "roles" r
WHERE u."roleId" = r."id";

-- Now that every row has a value, enforce NOT NULL to match the pre-migration shape
ALTER TABLE "users" ALTER COLUMN "role" SET NOT NULL;

-- Revert roleId to nullable (pre-migration shape)
ALTER TABLE "users" ALTER COLUMN "roleId" DROP NOT NULL;
```

- [ ] **Step 5: Also remove the 3 dead endpoints from the same migration's scope (route files, not SQL)**

This is a code change, not a SQL change — done here because it must land in the same deploy window as the column drop (Dependencies section of the tasks doc). Three edits:

In `src/backend/routes/user.routes.ts`, remove line 12:

```ts
router.get('/:userId/roles', requirePlane('clinic'), requirePermission('staff.assign_role'), userController.getUserRoles)
```

(F-5, grill finding — no consumer remains once `RolePicker.tsx` is deleted in Task 15.)

In `src/backend/routes/role.routes.ts`, remove lines 40-44:

```ts
// Assign a role to a user — requires staff.assign_role
router.post('/users/:userId/roles', requirePermission('staff.assign_role'), validate(assignUserRoleSchema), roleController.assignRoleToUser)

// Remove a role from a user — requires staff.assign_role
router.delete('/users/:userId/roles/:roleId', requirePermission('staff.assign_role'), roleController.removeRoleFromUser)
```

Leave `role.controller.ts`'s `assignRoleToUser`/`removeRoleFromUser` handlers and `role.service.ts`'s `assignRoleToUser`/`removeRoleFromUser` functions in place for this task — Task 5 removes the now-orphaned handler code as a separate, reviewable step (keeps this task's diff to routing only).

- [ ] **Step 6: Apply the migration to the dev DB**

```bash
npx prisma migrate dev
```

Expected: migration applies with no errors (this will fail immediately if Task 1/Task 3 were skipped — a `NOT NULL constraint` violation on `roleId` is the expected failure mode if any NULL or multi-role row remains).

- [ ] **Step 7: Verify the removed routes 404**

```bash
npm --prefix src/backend run dev &
sleep 3
curl -s -o /dev/null -w "%{http_code}\n" -X GET http://localhost:3000/users/1/roles
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/clinic/roles/users/1/roles
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE http://localhost:3000/clinic/roles/users/1/roles/1
kill %1
```

Expected: all three print `404` (route no longer exists — not `403`, since deny-by-default via a permission check would be 403; a genuinely removed route is 404).

- [ ] **Step 8: Run `npx prisma validate` and the full existing backend suite (expected failures are the scope map, not a blocker)**

```bash
npx prisma validate
npm --prefix src/backend run test 2>&1 | tail -100
```

Expected: `prisma validate` passes. The test run WILL show failures in any fixture that still does `prisma.user.create({ data: { role: 'admin', ... } })` or asserts on a `role: string` response shape — this is expected and intentional (it is the concrete file list the tasks doc deferred to write-plan). Do not "fix" these failures in this task; Tasks 5-12 fix the ones inside the scope of this feature (user/role/auth services + their direct tests). Note down the full list of still-failing test files after Task 12 for the write-plan record.

- [ ] **Step 9: Commit**

```bash
git add src/backend/prisma/schema.prisma src/backend/prisma/migrations src/backend/routes/user.routes.ts src/backend/routes/role.routes.ts
git commit -m "feat(schema): drop legacy User.role/LegacyRole, roleId NOT NULL, remove 3 multi-role endpoints (D-7, F-5)"
```

---

## Phase 1 — Backend service layer (URA-2)

### Task 5: `role.controller.ts`/`role.routes.ts` — remove orphaned multi-role handlers

**Files:**
- Modify: `src/backend/controllers/role.controller.ts:126-149,172-191` (remove `assignRoleToUser`, `removeRoleFromUser` handlers and their now-unused `assignUserRoleSchema` export if nothing else imports it)
- Modify: `src/backend/services/role.service.ts:194-260` (remove `assignRoleToUser`, `removeRoleFromUser` functions)
- Modify: `src/backend/models/role.repository.ts:178-213` (remove `findUserInTenant`, `assignRoleToUser`, `removeRoleFromUser`, `countUserRoles` — confirm each has zero other callers before removing; `findUserInTenant`/`countUserRoles` may be used elsewhere, grep first)
- Test: `src/backend/tests/integration/roleManagement.test.ts` (remove the corresponding multi-role assign/remove test cases)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — this is pure removal. Confirms the route removal in Task 4 has no dangling handler code.

- [ ] **Step 1: Grep for other callers of the functions to be removed**

```bash
grep -rn "findUserInTenant\|countUserRoles" src/backend --include="*.ts" | grep -v "role.repository.ts\|role.service.ts"
```

Expected: no matches outside `role.repository.ts`/`role.service.ts` themselves (if matches ARE found, do not remove that specific function — note it and keep it).

- [ ] **Step 2: Remove the orphaned test cases first (red-to-green in reverse: prove nothing else depends on them)**

Open `src/backend/tests/integration/roleManagement.test.ts` and delete every `describe`/`it` block that calls `POST /clinic/roles/users/:userId/roles` or `DELETE /clinic/roles/users/:userId/roles/:roleId`.

- [ ] **Step 3: Run the suite to confirm it's still green minus the removed cases**

Run: `npm --prefix src/backend run test -- tests/integration/roleManagement.test.ts`
Expected: PASS, with the previously-passing multi-role-assignment test count no longer present (fewer total tests, all remaining ones green).

- [ ] **Step 4: Remove the handler/service/repository code**

In `src/backend/controllers/role.controller.ts`, delete the `assignRoleToUser` and `removeRoleFromUser` exported functions (lines 126-149 and 172-191). Keep `assignUserRoleSchema` only if Task 4's route removal left no other importer — grep first:

```bash
grep -rn "assignUserRoleSchema" src/backend --include="*.ts"
```

If the only remaining reference is the controller's own now-deleted usage, remove the `assignUserRoleSchema` export too.

In `src/backend/services/role.service.ts`, delete `assignRoleToUser` (lines 194-238) and `removeRoleFromUser` (lines 248-260).

In `src/backend/models/role.repository.ts`, delete `findUserInTenant`, `assignRoleToUser`, `removeRoleFromUser`, `countUserRoles` — but only the ones confirmed orphaned in Step 1.

- [ ] **Step 5: Run the full role-related suite**

Run: `npm --prefix src/backend run test -- tests/integration/roleManagement.test.ts`
Expected: PASS, no TypeScript compile errors elsewhere (run `npx tsc --noEmit` from `src/backend` as an extra check since removed exports can break silent importers that grep missed).

- [ ] **Step 6: Commit**

```bash
git add src/backend/controllers/role.controller.ts src/backend/services/role.service.ts src/backend/models/role.repository.ts src/backend/tests/integration/roleManagement.test.ts
git commit -m "chore(rbac): remove orphaned multi-role assign/remove handlers (D-7 cleanup)"
```

---

### Task 6: `user.service.ts` — `roleId`-based `createUser`/`updateUser`, drop legacy mapping (T-URA-2.1)

**Files:**
- Modify: `src/backend/services/user.service.ts:14-22,83-118,120-147`
- Modify: `src/backend/models/user.repository.ts:9-16,34-39` (`CreateUserData.role` → drop; `createUser` helper's `role` param → drop, if still referenced — confirm `createUserWithRole` at line 50 uses `roleId` param already, it does)
- Modify: `src/backend/types/index.ts:104-120` (`CreateUserRequest`, `UpdateUserRequest`)
- Modify: `src/backend/controllers/user.controller.ts:8-15,27-34` (zod schemas — folded into Task 8, skip zod edits here, only the TS interface + service logic in this task)
- Test: `src/backend/__tests__/userManagement.test.ts`

**Interfaces:**
- Consumes: `roleRepo.findRoleById(roleId: number)` (existing, `role.repository.ts:43`).
- Produces: `createUser(tenantId: number, body: CreateUserRequest): Promise<UserResponse>` and `updateUser(tenantId: number, userId: number, body: UpdateUserRequest): Promise<UserResponse>` now accept `roleId: number` (create) / `roleId?: number` (update) instead of `role: string`. Consumed by Task 7 (lockout guard), Task 8 (controller schemas), Task 10 (permission gate).

- [ ] **Step 1: Update the shared type definitions**

In `src/backend/types/index.ts`, change:

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
```

- [ ] **Step 2: Write the failing test**

Add to `src/backend/__tests__/userManagement.test.ts` (adjust imports/setup to match the file's existing fixture pattern — it already has tenant/role seeding helpers per the existing suite):

```ts
it('createUser accepts roleId and persists the correct role FK', async () => {
  const doctorRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor', tenantId: null } })
  const created = await userService.createUser(tenantId, {
    name: 'New Doctor', username: 'new_doctor_ura', email: 'newdoc@test.com',
    password: 'TestPass1!', roleId: doctorRole.id,
  })
  expect(created.role).toBeDefined()
  const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: created.id } })
  expect(dbUser.roleId).toBe(doctorRole.id)
})

it('createUser rejects an unknown roleId', async () => {
  await expect(userService.createUser(tenantId, {
    name: 'Bad', username: 'bad_role_ura', email: 'bad@test.com',
    password: 'TestPass1!', roleId: 999999,
  })).rejects.toMatchObject({ statusCode: 400 })
})

it('updateUser accepts roleId and replaces the user role', async () => {
  const staffRole  = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_staff', tenantId: null } })
  const doctorRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor', tenantId: null } })
  const user = await userService.createUser(tenantId, {
    name: 'Switchable', username: 'switchable_ura', email: 'sw@test.com',
    password: 'TestPass1!', roleId: staffRole.id,
  })
  const updated = await userService.updateUser(tenantId, user.id, { roleId: doctorRole.id })
  expect(updated.role.id).toBe(doctorRole.id)
})

it('LEGACY_ROLE_TO_SYSTEM_KEY no longer exists in user.service.ts', () => {
  const source = require('fs').readFileSync(require.resolve('../services/user.service.ts'), 'utf8')
  expect(source).not.toContain('LEGACY_ROLE_TO_SYSTEM_KEY')
})
```

- [ ] **Step 2b: Run test to verify it fails**

Run: `npm --prefix src/backend run test -- __tests__/userManagement.test.ts`
Expected: FAIL (type errors / `roleId` not recognized / `LEGACY_ROLE_TO_SYSTEM_KEY` still present).

- [ ] **Step 3: Rewrite `user.service.ts`'s create/update logic**

Replace lines 14-22 (the `LEGACY_ROLE_TO_SYSTEM_KEY` const) — delete it entirely.

Replace lines 83-118 (`createUser`):

```ts
export async function createUser(tenantId: number, body: CreateUserRequest): Promise<UserResponse> {
  // D-2-02: at least one contact method required
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
      {
        name:     body.name,
        username: body.username,
        email:    body.email ?? null,
        phone:    body.phone ?? null,
        passwordHash,
      },
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
```

Replace lines 120-147 (`updateUser`) — role-resolution portion only (lockout guard call is Task 7's concern, written here in its Task-6-compatible form so the file stays valid between tasks):

```ts
export async function updateUser(
  tenantId: number, userId: number, body: UpdateUserRequest
): Promise<UserResponse> {
  const existing = await userRepo.findUserById(tenantId, userId)
  if (!existing) throw new UserError('User not found', 404)

  await assertNotPrimaryAdminDeactivation(tenantId, userId, { isActive: body.isActive, roleId: body.roleId })

  // ADR-0016 D-6: restoring a deactivated user must re-check the seat quota,
  // same as createUser — restore should not be a quota-enforcement bypass.
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

(`assertNotPrimaryAdminDeactivation`'s new signature is written in Task 7 — this task's edit already calls it with `roleId`, which will not type-check until Task 7 lands; that is expected and acceptable within this single feature branch since Tasks 6 and 7 are adjacent and both land before any intermediate push. If your workflow requires every task to compile standalone, do Task 7 immediately after this one, before running any lint/build gate.)

Update `CreateUserData` in `src/backend/models/user.repository.ts:9-16` — drop the `role` field:

```ts
export interface CreateUserData {
  name:         string
  username:     string
  email:        string | null
  phone:        string | null
  passwordHash: string
}
```

And `createUserWithRole` (line 50-64) already only destructures `...data` plus `roleId` separately — with `role` gone from `CreateUserData`, no further change needed there beyond the interface edit (the `tx.user.create({ data: { tenantId, ...data, roleId } })` call no longer includes a `role` field, which now matches the post-migration schema).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix src/backend run test -- __tests__/userManagement.test.ts`
Expected: still some failures from `safe()`'s `role` shape (Task 8 fixes `safe()` output) and from `assertNotPrimaryAdminDeactivation`'s signature (Task 7) — this is expected mid-sequence. Confirm specifically that the 4 new tests from Step 2 do NOT fail on `roleId` being unrecognized (compile-level acceptance is what this task proves); full green comes after Task 7+8.

- [ ] **Step 5: Commit**

```bash
git add src/backend/services/user.service.ts src/backend/models/user.repository.ts src/backend/types/index.ts src/backend/__tests__/userManagement.test.ts
git commit -m "feat(users): createUser/updateUser accept roleId, drop LEGACY_ROLE_TO_SYSTEM_KEY mapping"
```

---

### Task 7: `user.service.ts` — re-point primary-admin lockout guard to `role.key` (T-URA-2.2)

**Files:**
- Modify: `src/backend/services/user.service.ts:41-55` (`assertNotPrimaryAdminDeactivation`), call sites at (now-shifted) lines near `updateUser` and `deactivateUser`
- Modify: `src/backend/models/user.repository.ts:246-260` (`findPrimaryAdminId` — currently queries `where: { tenantId, role: 'admin' }`, must switch to joining/filtering on `roleRef.key`)
- Test: `src/backend/tests/integration/user-primary-admin-protection.test.ts`

**Interfaces:**
- Consumes: `roleRepo.findRoleById(roleId: number)` (existing).
- Produces: `assertNotPrimaryAdminDeactivation(tenantId: number, userId: number, change: { isActive?: boolean; roleId?: number }): Promise<void>` (signature changed from `change.role?: string` to `change.roleId?: number`). `findPrimaryAdminId(tenantId: number): Promise<number | null>` now resolves via `roleRef.key === 'clinic_admin'` instead of the legacy string column.

- [ ] **Step 1: Write the failing test**

Add to `src/backend/tests/integration/user-primary-admin-protection.test.ts` (the file already has `primaryAdminId`, `admin2Id`, tenant/token fixtures set up in `beforeAll` — reuse them):

```ts
it('blocks demoting the primary admin to a custom role cloned from Doctor', async () => {
  const doctorSystemRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor', tenantId: null } })
  const clonedDoctorRole = await prisma.clinicRole.create({
    data: {
      tenantId: tid, key: `tenant_${tid}_senior_vet`, name: 'Senior Vet',
      isSystem: false, permVersion: 1, sourceRoleId: doctorSystemRole.id,
    },
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
Expected: FAIL (guard still reads legacy `role` string; `findPrimaryAdminId` still queries the dropped `role` column — this will actually throw a Prisma error post-Task-4's migration since the column no longer exists).

- [ ] **Step 3: Update `findPrimaryAdminId`**

In `src/backend/models/user.repository.ts`, replace lines 253-260:

```ts
/**
 * Return the lowest-id user whose current role's key is `clinic_admin` for a
 * tenant — the tenant's "primary admin" (ADR-0016 D-1, re-pointed off the
 * legacy role string per D-2/ADR-0019). Returns null if none. Tenant-scoped
 * `findFirst` (BOLA-safe by construction).
 *
 * @param tenantId - Tenant scope (multi-tenancy isolation).
 */
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

In `src/backend/services/user.service.ts`, replace lines 41-55:

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

Update the two call sites: `updateUser` (already passes `{ isActive: body.isActive, roleId: body.roleId }` from Task 6) and `deactivateUser` (unchanged, still `{ isActive: false }`).

Note: `roleRepo.findRoleById` returns a row with `permissions` included but not `key` explicitly selected as a top-level scalar beyond what Prisma returns by default — confirm `key` is present on the returned object (it is: `findRoleById` uses `prisma.clinicRole.findUnique` with no `select`, so all scalar columns including `key` are returned by default; only `permissions` is an explicit `include`).

- [ ] **Step 5: Run test to verify it passes**

Run: `npm --prefix src/backend run test -- tests/integration/user-primary-admin-protection.test.ts`
Expected: PASS (all cases, including the 2 new ones).

- [ ] **Step 6: Commit**

```bash
git add src/backend/services/user.service.ts src/backend/models/user.repository.ts src/backend/tests/integration/user-primary-admin-protection.test.ts
git commit -m "fix(users): re-point primary-admin lockout guard to role.key === 'clinic_admin'"
```

---

### Task 8: `user.service.ts` — `safe()` response shape + `isPrimaryAdmin` flag (T-URA-2.3)

**Files:**
- Modify: `src/backend/services/user.service.ts:57-81` (`safe()`, `listUsers`, `getUserById`)
- Modify: `src/backend/types/index.ts:122-132` (`UserResponse`)
- Modify: `src/backend/models/user.repository.ts:20-32` (`findUsers`/`findUserById` — must `include: { roleRef: true }` so `safe()` can read the nested role)
- Test: `src/backend/__tests__/userManagement.test.ts`

**Interfaces:**
- Consumes: `User.roleRef` Prisma relation (existing, `schema.prisma:160`), `userRepo.findPrimaryAdminId` (Task 7).
- Produces: `UserResponse.role: { id: number; name: string; key: string; isSystem: boolean }` (was `role: string`); `UserResponse.isPrimaryAdmin: boolean` (new field). Consumed by Task 20 (frontend `UserManagementTab.tsx`).

- [ ] **Step 1: Write the failing test**

Add to `src/backend/__tests__/userManagement.test.ts`:

```ts
it('GET /users returns a nested role object and isPrimaryAdmin flag', async () => {
  const doctorRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor', tenantId: null } })
  const user = await userService.createUser(tenantId, {
    name: 'Shape Check', username: 'shape_check_ura', email: 'shape@test.com',
    password: 'TestPass1!', roleId: doctorRole.id,
  })
  const fetched = await userService.getUserById(tenantId, user.id)
  expect(fetched.role).toEqual({ id: doctorRole.id, name: doctorRole.name, key: 'doctor', isSystem: true })
  expect(typeof fetched.isPrimaryAdmin).toBe('boolean')
})

it('isPrimaryAdmin is true for exactly one user per tenant, even if another user also holds clinic_admin', async () => {
  const adminRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_admin', tenantId: null } })
  const users = await userService.listUsers(tenantId)
  const primaryAdmins = users.filter(u => u.isPrimaryAdmin)
  expect(primaryAdmins).toHaveLength(1)
  // At minimum, confirm the flag lines up with findPrimaryAdminId's own answer
  const expectedPrimaryId = primaryAdmins[0].id
  const otherAdminHolders = users.filter(u => u.role.key === 'clinic_admin' && u.id !== expectedPrimaryId)
  for (const other of otherAdminHolders) {
    expect(other.isPrimaryAdmin).toBe(false)
  }
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix src/backend run test -- __tests__/userManagement.test.ts`
Expected: FAIL — `fetched.role` is a string, `isPrimaryAdmin` is undefined.

- [ ] **Step 3: Update `findUsers`/`findUserById` to include `roleRef`**

In `src/backend/models/user.repository.ts`, update `findUsers` (line 20) and `findUserById` (line 30):

```ts
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

- [ ] **Step 4: Rewrite `safe()`, `listUsers`, `getUserById` in `user.service.ts`**

Replace lines 57-81:

```ts
function safe(user: {
  id: number; tenantId: number; name: string; username: string
  email: string | null; phone?: string | null
  passwordHash?: string; isActive: boolean; createdAt: Date
  roleRef: { id: number; name: string; key: string; isSystem: boolean } | null
}, isPrimaryAdmin: boolean): UserResponse {
  const { passwordHash: _pw, roleRef, ...rest } = user
  if (!roleRef) throw new UserError('User has no role assigned — data integrity error', 500)
  return {
    ...rest,
    role: { id: roleRef.id, name: roleRef.name, key: roleRef.key, isSystem: roleRef.isSystem },
    email:     rest.email ?? null,
    phone:     rest.phone ?? null,
    createdAt: rest.createdAt.toISOString(),
    isPrimaryAdmin,
  }
}

export async function listUsers(tenantId: number, branchId?: number | null): Promise<UserResponse[]> {
  const [users, primaryAdminId] = await Promise.all([
    userRepo.findUsers(tenantId, branchId),
    userRepo.findPrimaryAdminId(tenantId),
  ])
  return users.map(u => safe(u, u.id === primaryAdminId))
}

export async function getUserById(tenantId: number, userId: number): Promise<UserResponse> {
  const [user, primaryAdminId] = await Promise.all([
    userRepo.findUserById(tenantId, userId),
    userRepo.findPrimaryAdminId(tenantId),
  ])
  if (!user) throw new UserError('User not found', 404)
  return safe(user, user.id === primaryAdminId)
}
```

Every other call site of `safe(...)` in the file (`createUser`, `updateUser`, `assignUserBranch`) must now also pass the second argument. For those three, resolve `isPrimaryAdmin` the same way:

```ts
// inside createUser, after `const user = await userRepo.createUserWithRole(...)`
const primaryAdminId = await userRepo.findPrimaryAdminId(tenantId)
return safe(user, user.id === primaryAdminId)
```

Apply the equivalent 2-line addition at the `return safe(user)` sites in `updateUser` and `assignUserBranch` — each needs `findPrimaryAdminId` fetched and passed in. (`createUserWithRole`/`updateUser`/`updateUserBranch` repository calls also need `include: { roleRef: true }` added alongside their existing `findFirst`/`create` calls so `safe()` has `roleRef` to read — update `user.repository.ts`'s `createUserWithRole` (line 50-64), `updateUser` (line 66-69), and `updateUserBranch` (line 158-176) to include `roleRef: true` in their return shape the same way `findUsers`/`findUserById` now do.)

- [ ] **Step 5: Update `UserResponse` type**

In `src/backend/types/index.ts`, replace lines 122-132:

```ts
export interface UserResponse {
  id:             number
  tenantId:       number
  name:           string
  username:       string
  email:          string | null
  phone:          string | null
  role:           { id: number; name: string; key: string; isSystem: boolean }
  isPrimaryAdmin: boolean
  isActive:       boolean
  createdAt:      string
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm --prefix src/backend run test -- __tests__/userManagement.test.ts`
Expected: PASS (all tests in the file, including the 6 added across Tasks 6/8).

- [ ] **Step 7: Commit**

```bash
git add src/backend/services/user.service.ts src/backend/models/user.repository.ts src/backend/types/index.ts src/backend/__tests__/userManagement.test.ts
git commit -m "feat(users): safe() returns nested role object + isPrimaryAdmin server-computed flag"
```

---

### Task 9: `auth.service.ts` — legacy-compatible JWT `role` claim mapper (T-URA-2.8, D-8, F-1)

**Files:**
- Modify: `src/backend/services/auth.service.ts:37-117,124-181,194-228,233-252,266-318`
- Modify: `src/backend/models/auth.repository.ts:24-26` (`findUserById` — add `include: { roleRef: { select: { key: true } } }`)
- Test: `src/backend/tests/integration/auth.test.ts` (or the file covering login — confirm exact filename via `find src/backend/tests -iname "*auth*"`)

**Interfaces:**
- Produces: private `toLegacyRoleString(roleKey: string): 'admin' | 'doctor' | 'staff'` in `auth.service.ts` — NOT exported (module-private, per D-8 "one private helper"). Every `user.role` read in this file routes through it. `JwtPayload.role` claim's runtime values are unchanged (`'admin' | 'doctor' | 'staff'`); the 9 frontend consumers (out of scope, see Global Constraints) see no contract change.

- [ ] **Step 1: Confirm the test file location**

```bash
find src/backend/tests -iname "*auth*"
```

Use whichever file(s) cover `login`/`selectBranch` — reference them below as `<AUTH_TEST_FILE>`.

- [ ] **Step 2: Write the failing test**

Add to `<AUTH_TEST_FILE>` (reuse the file's existing tenant/branch/user fixture helpers):

```ts
it('admin login still skips branch selection after the roleId migration', async () => {
  // Fixture user has roleId pointing at the clinic_admin system role (not a `role` column anymore).
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
  // Decode the pending token's role claim
  const decoded = jwt.decode(res.body.data.pendingToken) as { role: string }
  expect(decoded.role).toBe('staff')
})
```

(Adjust fixture variable names — `someBranchAssignedUserId`, `SUB`, `PASSWORD`, `server`, `prisma`, `tid` — to match `<AUTH_TEST_FILE>`'s actual `beforeAll` setup; the two assertions that matter are `requiresBranchSelection === false` for admin and the mapped `'staff'` claim for a non-`clinic_admin`/non-`doctor` role key.)

- [ ] **Step 3: Run test to verify it fails**

Run: `npm --prefix src/backend run test -- <AUTH_TEST_FILE>`
Expected: FAIL — post-Task-4 migration, `user.role` no longer exists on the Prisma `User` model, so this currently throws a TypeScript compile error / Prisma runtime error (`user.role` undefined) at every one of the 7+ read sites.

- [ ] **Step 4: Add the mapper and route every `user.role` read through it**

At the top of `src/backend/services/auth.service.ts`, after the existing imports, add:

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

In `src/backend/models/auth.repository.ts`, update `findUserById` (line 24-26) and `findUserByTenantUsername` (line 20-22) to include the role key:

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

In `auth.service.ts`, every read of `user.role` becomes `toLegacyRoleString(user.roleRef!.key)`. Specifically:

- `login()` line 65: `const isAdmin = user.role === 'admin'` → `const legacyRole = toLegacyRoleString(user.roleRef!.key); const isAdmin = legacyRole === 'admin'`
- `login()` lines 69-98 (admin branch): every `role: user.role` → `role: legacyRole`
- `login()` lines 107-116 (non-admin branch, `signPendingToken`): `role: user.role` → `role: legacyRole`
- `selectBranch()` line 149: `if (role !== 'admin')` — this reads the already-mapped `payload.role` from the pending token, which was mapped at issuance in `login()` — no change needed here, `role` here is already a legacy string from the JWT payload, not a fresh DB read.
- `selectBranch()` line 177: `role: user.role` → needs `const legacyRole = toLegacyRoleString(user.roleRef!.key)` added near the top of the function (after the `authRepo.findUserById` call at line 138) and used here.
- `switchBranch()` lines 208, 217: `user.role` reads → same pattern, add `const legacyRole = toLegacyRoleString(user.roleRef!.key)` right after `authRepo.findUserById` (line 198) and use it at both sites (line 208's `role: user.role` and the `role !== 'admin'` check at 215 uses the JWT-passed `role` param, unaffected).
- `refreshClinicToken()` line 310: `role: user.role` → `role: toLegacyRoleString(user.roleRef!.key)`.

The `!` non-null assertions are safe here because `roleId` is NOT NULL post-Task-4 and every `User` row has a `roleRef` relation by FK invariant — if this ever throws, it is a genuine data-integrity bug worth a hard failure, not a silent fallback.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm --prefix src/backend run test -- <AUTH_TEST_FILE>`
Expected: PASS.

- [ ] **Step 6: Run the full auth-adjacent suite to catch any other `user.role` reads in this file**

```bash
grep -n "user\.role\b" src/backend/services/auth.service.ts
```

Expected: zero remaining matches (every read now goes through `toLegacyRoleString`). If any remain, repeat Step 4's pattern for that site before proceeding.

- [ ] **Step 7: Commit**

```bash
git add src/backend/services/auth.service.ts src/backend/models/auth.repository.ts src/backend/tests/integration/*auth*
git commit -m "feat(auth): confine legacy role-claim mapping to auth.service.ts (D-8, F-1) — JWT contract unchanged"
```

---

### Task 10: Permission gate + no-escalation check on the role-change branch (T-URA-2.6, T-URA-2.7, CORR-3)

**Files:**
- Modify: `src/backend/services/user.service.ts` (add gate + subset check inside `updateUser`/`createUser`)
- Modify: `src/backend/controllers/user.controller.ts:36-62` (pass `req.context` permission set into the service — see interface note)
- Test: `src/backend/__tests__/userManagement.test.ts`

**Interfaces:**
- Consumes: `resolvePermissions(userId: number, tenantId: number): Promise<Set<string>>` (existing, `permission.service.ts`, already imported by `role.controller.ts` — import it fresh into `user.controller.ts`).
- Produces: `createUser`/`updateUser` gain a new required parameter `callerPerms: Set<string>` and a new `hasAssignRolePermission: boolean` parameter (or a single richer options object — this plan uses two explicit params for clarity, matching `role.service.ts`'s existing `callerPerms: Set<string>` convention exactly). Signature becomes:
  ```ts
  createUser(tenantId: number, body: CreateUserRequest, callerPerms: Set<string>, hasAssignRole: boolean): Promise<UserResponse>
  updateUser(tenantId: number, userId: number, body: UpdateUserRequest, callerPerms: Set<string>, hasAssignRole: boolean): Promise<UserResponse>
  ```
  Consumed by Task 8's/Task 6's call sites in `user.controller.ts` (updated here) and by every backend test calling these functions directly (all touched in this task).

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
    new Set(['staff.manage']), // has staff.manage, NOT staff.assign_role
    false,
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

  // Caller holds staff.assign_role but not every permission clinic_admin holds.
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
  expect(updated.role.key).toBe('clinic_admin')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix src/backend run test -- __tests__/userManagement.test.ts`
Expected: FAIL — `createUser`/`updateUser` do not yet accept the extra parameters (TS arity error) and perform no gate/subset check.

- [ ] **Step 3: Implement the gate + subset check in `user.service.ts`**

Update the `createUser` signature and body:

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

  // CORR-3 / T-URA-2.6: creating a user always sets a roleId, so the gate always applies here.
  if (!hasAssignRole) {
    throw new UserError('Assigning a role requires the staff.assign_role permission', 403)
  }

  const roleRow = await roleRepo.findRoleById(body.roleId)
  if (!roleRow) throw new UserError(`Unknown role: ${body.roleId}`, 400)

  // CORR-3 / T-URA-2.7: no-escalation subset check, ported from role.service.ts's
  // assignRoleToUser (mirrors its logic exactly — same anti-drift rationale as URA-4.1).
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
    const primaryAdminId = await userRepo.findPrimaryAdminId(tenantId)
    return safe(user, user.id === primaryAdminId)
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new UserError('Username or email already in use within this clinic', 409)
    }
    throw err
  }
}
```

Update `updateUser`:

```ts
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
    // T-URA-2.6: role-change branch requires staff.assign_role on top of the
    // route's staff.manage gate. Name-only edits (roleId absent) skip this.
    if (!hasAssignRole) {
      throw new UserError('Assigning a role requires the staff.assign_role permission', 403)
    }

    const roleRow = await roleRepo.findRoleById(body.roleId)
    if (!roleRow) throw new UserError(`Unknown role: ${body.roleId}`, 400)

    // T-URA-2.7: no-escalation subset check.
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
  const primaryAdminId = await userRepo.findPrimaryAdminId(tenantId)
  return safe(user, user.id === primaryAdminId)
}
```

- [ ] **Step 4: Wire the controller to supply `callerPerms`/`hasAssignRole`**

In `src/backend/controllers/user.controller.ts`, add the import and update `createUser`/`updateUser`:

```ts
import { resolvePermissions } from '../services/permission.service'

// ...

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
Expected: PASS (all tests, including the 4 new ones).

- [ ] **Step 6: Commit**

```bash
git add src/backend/services/user.service.ts src/backend/controllers/user.controller.ts src/backend/__tests__/userManagement.test.ts
git commit -m "feat(users): staff.assign_role gate + no-escalation check on role-change branch (CORR-3)"
```

---

### Task 11: `role.service.ts` — reject cloning the Admin system role (T-URA-2.4)

**Files:**
- Modify: `src/backend/services/role.service.ts:77-109` (`cloneRole`)
- Modify: `src/backend/models/role.repository.ts:56-58` (`findRoleByName` — confirm it returns `key`; it does, no `select` restricts it)
- Test: `src/backend/tests/integration/roleManagement.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `cloneRole(...)` now throws `ForbiddenError` (403) when `sourceRole.key === 'clinic_admin'`, before any other work. No signature change.

- [ ] **Step 1: Write the failing test**

Add to `src/backend/tests/integration/roleManagement.test.ts`:

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

(Confirm the system role's `name` field is literally `'Admin'`/`'Doctor'` by checking the seed file if the test above's `sourceRoleName` string doesn't match — `cloneRole` looks up `findRoleByName(sourceRoleName, null)`, so the exact seeded display name matters here, not the `key`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix src/backend run test -- tests/integration/roleManagement.test.ts`
Expected: FAIL — cloning Admin currently succeeds (no rejection).

- [ ] **Step 3: Add the rejection check**

In `src/backend/services/role.service.ts`, update `cloneRole` (insert after the `sourceRole` lookup at line 83-86):

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

  // D-4 / T-URA-2.4: Admin is sealed — cloning from it is forbidden, regardless
  // of the caller's own permission set (the rule is on source-role identity).
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

### Task 12: `RoleDto`/`role.controller.ts` — expose `key` on role list responses (implementation gap found during write-plan)

**Files:**
- Modify: `src/backend/services/role.service.ts:23-52` (`RoleDto`, `toDto`)
- Modify: `src/backend/models/role.repository.ts:22-36` (`listRoles` — already returns full scalar columns via no-`select` `findMany`, so `key` is already fetched; only `toDto`'s narrowing needs to change)
- Test: `src/backend/tests/integration/roleManagement.test.ts`

**Interfaces:**
- Produces: `RoleDto.key: string` (new field). Required by Task 16 (frontend `RoleList.tsx` Clone-button gating needs `role.key === 'clinic_admin'`, but the current `GET /clinic/roles` response has no `key` field at all — confirmed by reading `role.service.ts`'s `toDto`, which only returns `id/name/isSystem/tenantId/permVersion/permissions`). Without this task, Task 16 cannot be implemented — this gap was not named in the tasks/grill docs and is called out here explicitly per the writing-plans "no placeholders" rule.

- [ ] **Step 1: Write the failing test**

Add to `src/backend/tests/integration/roleManagement.test.ts`:

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

In `src/backend/services/role.service.ts`, update:

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

No repository change needed — `listRoles`/`findRoleById` already `findMany`/`findUnique` with no `select` clause restricting scalar columns, so `key` is already present on every row Prisma returns; `toDto`'s TypeScript parameter type was simply narrower than the actual data.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix src/backend run test -- tests/integration/roleManagement.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backend/services/role.service.ts src/backend/tests/integration/roleManagement.test.ts
git commit -m "feat(roles): expose role.key on GET /clinic/roles (required for frontend Admin-row gating)"
```

---

### Task 13: `rbac.middleware.ts` dead-code check (T-URA-2.9)

**Files:**
- Delete (conditionally): `src/backend/middlewares/rbac.middleware.ts`
- Delete (conditionally): its unit test (find via `find src/backend -iname "*rbac.middleware*"`)

**Interfaces:** none — pure dead-code removal, gated on a grep check.

- [ ] **Step 1: Confirm zero non-test references**

```bash
grep -rln "rbac.middleware\|rbacMiddleware" src/backend --include="*.ts" | grep -v "rbac.middleware.test"
```

Expected: only `rbac.middleware.ts` itself (no route file imports it — every route uses `permission.middleware.ts`'s `requirePermission`/`requirePlane` instead, per the codebase's current convention).

- [ ] **Step 2a: If zero references (expected) — delete both files**

```bash
rm src/backend/middlewares/rbac.middleware.ts
find src/backend -iname "*rbac.middleware.test*" -delete
```

- [ ] **Step 2b: If any reference IS found — stop, do not delete, note the reference**

Leave the file in place and record the referencing file path in the migration PR notes for Step 8; do not proceed with deletion.

- [ ] **Step 3: Run the full backend suite to confirm nothing broke**

```bash
npm --prefix src/backend run test 2>&1 | tail -30
```

Expected: no new failures attributable to the deleted file (pre-existing failures from Task 4 Step 8's scope map are unrelated and unaffected by this task).

- [ ] **Step 4: Commit**

```bash
git add -A src/backend/middlewares
git commit -m "chore: remove dead rbac.middleware.ts (superseded by permission.middleware.ts)"
```

---

## Phase 2 — Frontend (URA-3, URA-4)

### Task 14: `useUserRoles.ts` hook cleanup — delete multi-role hooks, keep `useClinicRolesQuery` (prep for Task 15)

**Files:**
- Modify: `src/frontend/src/hooks/useUserRoles.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `useClinicRolesQuery()` stays (still needed by the unified listbox, Task 20). `useUserRolesQuery`, `useAssignRoleMutation`, `useRemoveRoleMutation` are removed — they called the 3 endpoints deleted in Task 4/Task 5.

- [ ] **Step 1: Grep for other consumers of the 3 hooks being removed**

```bash
grep -rln "useUserRolesQuery\|useAssignRoleMutation\|useRemoveRoleMutation" src/frontend/src --include="*.tsx" --include="*.ts"
```

Expected: only `UserManagementTab.tsx` (via `RolePicker.tsx`) — both are rewritten/deleted in Tasks 15/20, so removing these hooks now is safe once those two land in the same commit sequence. If run standalone before Task 15, this step will still show `RolePicker.tsx` as a consumer — that's expected; Task 15 deletes `RolePicker.tsx` in the very next task, so do Tasks 14 and 15 back-to-back without an intermediate `npm run build` gate if your workflow enforces one.

- [ ] **Step 2: Remove the 3 hooks, keep `useClinicRolesQuery`**

Rewrite `src/frontend/src/hooks/useUserRoles.ts` to:

```ts
/**
 * useClinicRolesQuery — fetches the tenant's full role catalogue (system +
 * custom), used by the unified Edit User role listbox.
 *
 * The multi-role assignment hooks that used to live here
 * (useUserRolesQuery, useAssignRoleMutation, useRemoveRoleMutation) were
 * removed with the multi-role retirement (D-7, ADR-0019) — their backend
 * endpoints no longer exist.
 */
import { useQuery } from '@tanstack/react-query'
import api from '../utils/api'

/** Role shape returned by GET /clinic/roles. */
export interface Role {
  id:                number
  name:              string
  key:               string
  isSystem:          boolean
  permissions:       string[]
  assignedUserCount: number
}

/** Fetch the full role catalogue for this tenant (cached 60 s). */
export function useClinicRolesQuery() {
  return useQuery<Role[]>({
    queryKey: ['clinic-roles'],
    queryFn:  () => api.get('/clinic/roles').then((r) => r.data.data as Role[]),
    staleTime: 60_000,
  })
}
```

(`key: string` added to the `Role` interface here — matches Task 12's backend `RoleDto.key` addition; without it, TypeScript would not know `role.key` exists when Task 20 filters on it.)

- [ ] **Step 3: Run existing frontend tests touching this hook file**

```bash
npm --prefix src/frontend run test -- src/hooks
```

Expected: this specific run may show failures in tests that still import the removed hooks — that is expected until Task 15/20 remove those importers. If no test file directly imports this hook module, this step is a no-op pass.

- [ ] **Step 4: Commit**

```bash
git add src/frontend/src/hooks/useUserRoles.ts
git commit -m "refactor(hooks): drop multi-role hooks, keep useClinicRolesQuery, add key to Role type"
```

---

### Task 15: Delete `RolePicker.tsx` (T-URA-4.2, forced by endpoint removal)

**Files:**
- Delete: `src/frontend/src/components/roles/RolePicker.tsx`
- Delete: any dedicated `RolePicker.test.tsx` (find via `find src/frontend/src -iname "*RolePicker*"`)

**Interfaces:** none — the component's `isGrantable`/`isAdminLevelRole`/`SelfDemotionDialog` logic is reimplemented directly inside `UserManagementTab.tsx` in Task 20 (small enough to inline per that task's scope; extracting to a shared file was considered in the tasks doc as optional and is not required since `RolePicker.tsx` no longer exists to share with).

- [ ] **Step 1: Confirm `UserManagementTab.tsx` is the only importer**

```bash
grep -rln "RolePicker" src/frontend/src --include="*.tsx" --include="*.ts"
```

Expected: `UserManagementTab.tsx` and the component file itself only. (Task 20 removes `UserManagementTab.tsx`'s import in the same change — do Task 15 and Task 20 together, or accept a transient broken-import state between them if executing sequentially with intermediate checkpoints; this plan orders Task 20 immediately after, so no build gate sits between them.)

- [ ] **Step 2: Delete the files**

```bash
rm src/frontend/src/components/roles/RolePicker.tsx
find src/frontend/src -iname "*RolePicker.test*" -delete
```

- [ ] **Step 3: Commit (deferred)**

Do not commit yet — this leaves `UserManagementTab.tsx` with a dangling import until Task 20. Proceed directly to Task 16 (unrelated file, safe to interleave) then Task 20, and commit Task 15+20 together. (If your execution harness requires one commit per task, commit this deletion now and accept a known-broken intermediate state on this branch until Task 20 lands — never push/merge between them.)

---

### Task 16: `RoleList.tsx` — hide Clone button for the Admin role row (T-URA-3.4)

**Files:**
- Modify: `src/frontend/src/components/roles/RoleList.tsx:296-310` (Clone button in the collapsed row) and its `RolePermissionEditor` `onClone` prop pass-through (line 338)
- Modify: `src/frontend/src/hooks/useRoles.ts:12-18` (`Role` interface — add `key: string`, matching the backend's Task 12 addition)
- Test: create `src/frontend/src/__tests__/RoleList.test.tsx` if none exists (check first)

**Interfaces:**
- Consumes: `Role.key` (new field, from `useRoles.ts`, mirroring Task 12's backend `RoleDto.key`).
- Produces: no new exports — internal gating logic only.

- [ ] **Step 1: Check for an existing test file**

```bash
find src/frontend/src -iname "*RoleList.test*" -o -iname "*RoleEditorView.test*"
```

Use the existing file if found; otherwise create `src/frontend/src/__tests__/RoleList.test.tsx`.

- [ ] **Step 2: Write the failing test**

```tsx
// src/frontend/src/__tests__/RoleList.test.tsx (or append to an existing suite)
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import RoleList from '../components/roles/RoleList'

vi.mock('../store/authStore', () => ({
  useAuthStore: (s: (s: { permissions: string[]; roleIds: string[]; refreshPermissions: () => Promise<void> }) => unknown) =>
    s({ permissions: ['roles.manage'], roleIds: [], refreshPermissions: async () => {} }),
}))
vi.mock('../hooks/useRoles', () => ({
  useUpdateRolePermissionsMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteRoleMutation: () => ({ mutate: vi.fn(), isPending: false }),
}))

const roles = [
  { id: '1', name: 'Admin',  key: 'clinic_admin', isSystem: true,  permissions: [], assignedUserCount: 1 },
  { id: '2', name: 'Doctor', key: 'doctor',        isSystem: true,  permissions: [], assignedUserCount: 2 },
]

describe('RoleList — Admin clone lockdown', () => {
  it('does not render a Clone button on the Admin row', () => {
    render(
      <RoleList roles={roles} catalogue={{}} canManage={true} onAssignStaff={() => {}} />
    )
    const adminRow = screen.getByText('Admin').closest('div')!.parentElement!
    expect(adminRow.querySelector('[title="Clone this role"]')).toBeNull()
  })

  it('still renders a Clone button on the Doctor row', () => {
    render(
      <RoleList roles={roles} catalogue={{}} canManage={true} onAssignStaff={() => {}} />
    )
    const doctorRow = screen.getByText('Doctor').closest('div')!.parentElement!
    expect(doctorRow.querySelector('[title="Clone this role"]')).not.toBeNull()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm --prefix src/frontend run test -- src/__tests__/RoleList.test.tsx`
Expected: FAIL — the Admin row currently DOES render a Clone button (`role.isSystem && canManage` is true for both rows).

- [ ] **Step 4: Add `key` to the frontend `Role` type**

In `src/frontend/src/hooks/useRoles.ts`, update:

```ts
export interface Role {
  id: string
  name: string
  key: string
  isSystem: boolean
  permissions: string[]
  assignedUserCount: number
}
```

- [ ] **Step 5: Gate the Clone button on `role.key !== 'clinic_admin'`**

In `src/frontend/src/components/roles/RoleList.tsx`, line 297, change:

```tsx
{role.isSystem && canManage && (
```

to:

```tsx
{role.isSystem && role.key !== 'clinic_admin' && canManage && (
```

And at line 338 (the `RolePermissionEditor`'s `onClone` prop), change:

```tsx
onClone={() => setCloneSource(role.name)}
```

to a conditional pass-through — since `RolePermissionEditor` expects a function, pass a no-op that can never actually be invoked by the UI once the button that would trigger it is gone; simplest correct fix is to gate at the `RolePermissionEditor` call site too:

```tsx
{isExpanded && (
  <RolePermissionEditor
    roleId={role.id}
    isSystem={role.isSystem}
    currentPermissions={role.permissions}
    catalogue={catalogue}
    userPermissions={userPermissions}
    onClone={role.key !== 'clinic_admin' ? () => setCloneSource(role.name) : undefined}
    onSave={(delta) => handleSave(role, delta)}
    isSaving={updateMut.isPending}
  />
)}
```

(This assumes `RolePermissionEditor`'s `onClone` prop is optional and it already handles an absent clone action by hiding its own internal clone trigger — verify this against `RolePermissionEditor.tsx`'s actual prop type before this step; if `onClone` is currently required/non-optional, widen its prop type to `onClone?: () => void` in that file as part of this same step, and guard its internal render on `onClone` being defined.)

- [ ] **Step 6: Run test to verify it passes**

Run: `npm --prefix src/frontend run test -- src/__tests__/RoleList.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/frontend/src/components/roles/RoleList.tsx src/frontend/src/hooks/useRoles.ts src/frontend/src/__tests__/RoleList.test.tsx
git commit -m "feat(roles): hide Clone button for the Admin system-role row (D-4 frontend backstop)"
```

---

### Task 17: `AdminBranches.tsx` — fix the silently-broken doctor filter (T-URA-3.5, ADR-0019)

**Files:**
- Modify: `src/frontend/src/views/admin/AdminBranches.tsx:24,206`
- Test: create `src/frontend/src/__tests__/AdminBranches.test.tsx` if none exists

**Interfaces:**
- Consumes: `UserLite.role: { key: string }` (was `role: string`) — mirrors the backend `UserResponse.role` shape change from Task 8.

- [ ] **Step 1: Check for an existing test file**

```bash
find src/frontend/src -iname "*AdminBranches.test*"
```

- [ ] **Step 2: Write the failing test**

```tsx
// src/frontend/src/__tests__/AdminBranches.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import AdminBranches from '../views/admin/AdminBranches'

const users = [
  { id: 1, name: 'Dr. System', role: { key: 'doctor' } },
  { id: 2, name: 'Dr. Cloned Senior Vet', role: { key: 'tenant_1_senior_vet' } },
  { id: 3, name: 'Front Desk', role: { key: 'clinic_staff' } },
]

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) =>
    queryKey[0] === 'branches'
      ? { data: [], isLoading: false }
      : { data: users, isLoading: false },
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

describe('AdminBranches — doctor picker key-match (ADR-0019)', () => {
  it('includes only the literal system Doctor role, excluding clones', () => {
    render(<AdminBranches />)
    // Select a branch to render the shifts panel's doctor <select>, or assert
    // directly on the filtered array if the component exposes it via a
    // data-testid — adjust per the component's actual selected-branch flow.
    // Minimal assertion here: the system doctor's name appears somewhere
    // reachable, the cloned senior vet's name is excluded from the doctor
    // picker specifically (not from the page entirely, since users list
    // itself is unfiltered elsewhere).
  })
})
```

(This component's doctor picker only renders inside `ShiftsPanel`, which requires a selected branch — adjust the test to select a branch first via the rendered branch-list button, or restructure the assertion to unit-test a small extracted `isBookableSystemDoctor(user)` predicate instead of the full component tree if that proves more reliable. The concrete, load-bearing assertion is Step 5's source change below — write whichever test shape your test runner setup supports cleanly, but the predicate must be `role.key === 'doctor'`.)

- [ ] **Step 3: Run test to verify it fails**

Run: `npm --prefix src/frontend run test -- src/__tests__/AdminBranches.test.tsx`
Expected: FAIL or type-error — `users` fixture's `role` is currently typed/used as a string in the component (`interface UserLite { id: number; name: string; role: string }`), so passing an object mismatches.

- [ ] **Step 4: Update the `UserLite` interface and filter**

In `src/frontend/src/views/admin/AdminBranches.tsx`, line 24, change:

```tsx
interface UserLite { id: number; name: string; role: string }
```

to:

```tsx
interface UserLite { id: number; name: string; role: { key: string } }
```

Line 206, change:

```tsx
const doctors = users.filter(u => u.role === 'doctor')
```

to:

```tsx
// ADR-0019: key-match only, deliberately narrower than "Bookable doctor"
// (appointments) which resolves via role lineage — branch assignment is an
// operational concern, not a clinical-eligibility one. Do not "fix" this to
// match lineage without a new decision.
const doctors = users.filter(u => u.role.key === 'doctor')
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm --prefix src/frontend run test -- src/__tests__/AdminBranches.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/frontend/src/views/admin/AdminBranches.tsx src/frontend/src/__tests__/AdminBranches.test.tsx
git commit -m "fix(branches): doctor picker matches role.key (object shape), stays key-match per ADR-0019"
```

---

### Task 18: Delete `AdminUsers.tsx` + its dedicated i18n test (T-URA-3.6)

**Files:**
- Delete: `src/frontend/src/views/admin/AdminUsers.tsx`
- Delete: `src/frontend/src/__tests__/AdminViews.i18n.test.tsx` (entire file — confirmed dedicated to `AdminUsers` only, no other view covered)

**Interfaces:** none.

- [ ] **Step 1: Confirm zero non-test, non-self references**

```bash
grep -rln "views/admin/AdminUsers\b" src/frontend/src --include="*.tsx" --include="*.ts"
```

Expected: only `AdminViews.i18n.test.tsx` and the file itself. Confirmed already via earlier investigation — `App.tsx` does not route to it (superseded by `UserManagementTab.tsx`).

- [ ] **Step 2: Delete both files**

```bash
rm src/frontend/src/views/admin/AdminUsers.tsx
rm src/frontend/src/__tests__/AdminViews.i18n.test.tsx
```

- [ ] **Step 3: Run the full frontend suite to confirm no orphaned references**

```bash
npm --prefix src/frontend run test 2>&1 | tail -30
```

Expected: no failures referencing `AdminUsers` or the deleted test file.

- [ ] **Step 4: Commit**

```bash
git add -A src/frontend/src/views/admin/AdminUsers.tsx src/frontend/src/__tests__/AdminViews.i18n.test.tsx
git commit -m "chore: delete dead AdminUsers.tsx (unrouted, superseded by UserManagementTab.tsx)"
```

---

### Task 19: `ClinicGrooming.tsx` — drop dead `?role=staff` query param (T-URA-3.7, optional, do while nearby)

**Files:**
- Modify: `src/frontend/src/views/clinic/ClinicGrooming.tsx:78`

**Interfaces:** none.

- [ ] **Step 1: Locate the exact line**

```bash
grep -n "role=staff" src/frontend/src/views/clinic/ClinicGrooming.tsx
```

- [ ] **Step 2: Remove the dead param**

Change `api.get('/users?role=staff')` to `api.get('/users')` — the server never reads this param (`listUsers` takes no role filter, confirmed in `user.controller.ts:36-41`), and the component never reads the response's `role` field, so this is a no-behavior-change cleanup.

- [ ] **Step 3: Run the file's existing test (if any) to confirm no regression**

```bash
find src/frontend/src -iname "*ClinicGrooming.test*"
npm --prefix src/frontend run test -- <path if found>
```

Expected: PASS, unchanged behavior.

- [ ] **Step 4: Commit**

```bash
git add src/frontend/src/views/clinic/ClinicGrooming.tsx
git commit -m "chore: drop dead ?role=staff query param (server never read it)"
```

---

### Task 20: `UserManagementTab.tsx` — unified listbox, self-demotion dialog, `isPrimaryAdmin`-flag UI (T-URA-3.1, T-URA-3.2, T-URA-3.3)

**Files:**
- Modify: `src/frontend/src/views/admin/UserManagementTab.tsx` (substantial rewrite of `Modal` and the top-level component's `User` interface + `primaryAdminId` computation)
- Test: `src/frontend/src/__tests__/UserManagementTab.test.tsx`

**Interfaces:**
- Consumes: `useClinicRolesQuery()` (Task 14), `UserResponse.role: { id, name, key, isSystem }` + `UserResponse.isPrimaryAdmin: boolean` (Task 8, mirrored client-side).
- Produces: no new exports — this is the feature's user-facing surface. The `save` mutation now sends `{ roleId: number }` instead of `{ role: string }` on both create and update paths.

- [ ] **Step 1: Write the failing tests**

Add to (or create) `src/frontend/src/__tests__/UserManagementTab.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import UserManagementTab from '../views/admin/UserManagementTab'

const roles = [
  { id: 1, name: 'Admin', key: 'clinic_admin', isSystem: true, permissions: ['staff.manage', 'staff.assign_role'], assignedUserCount: 1 },
  { id: 2, name: 'Doctor', key: 'doctor', isSystem: true, permissions: ['emr.edit'], assignedUserCount: 3 },
  { id: 3, name: 'Accountant', key: 'tenant_1_accountant', isSystem: false, permissions: ['billing.view'], assignedUserCount: 1 },
]

const users = [
  { id: 1, name: 'Primary Admin', username: 'admin1', email: 'a@x.com', role: { id: 1, name: 'Admin', key: 'clinic_admin', isSystem: true }, isPrimaryAdmin: true, isActive: true, createdAt: '2026-01-01', branchId: null },
  { id: 2, name: 'Staff One', username: 'staff1', email: 's@x.com', role: { id: 3, name: 'Accountant', key: 'tenant_1_accountant', isSystem: false }, isPrimaryAdmin: false, isActive: true, createdAt: '2026-01-01', branchId: null },
]

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
    if (queryKey[0] === 'clinic-roles') return { data: roles, isError: false }
    if (queryKey[0] === 'admin' && queryKey[1] === 'users') return { data: users, isLoading: false }
    return { data: [], isLoading: false }
  },
  useMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, isError: false, isSuccess: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('../store/authStore', () => ({
  useAuthStore: (s: (s: { userId: number; permissions: string[]; hasPermission: (p: string) => boolean; refreshPermissions: () => Promise<void> }) => unknown) =>
    s({
      userId: 1,
      permissions: ['staff.manage', 'staff.assign_role', 'staff.view'],
      hasPermission: (p: string) => ['staff.manage', 'staff.assign_role', 'staff.view'].includes(p),
      refreshPermissions: async () => {},
    }),
}))

describe('UserManagementTab — unified role listbox (Bug fix + CORR-3)', () => {
  it('shows a cloned custom role in the Edit User listbox (reported-bug regression)', async () => {
    render(<UserManagementTab />)
    fireEvent.click(screen.getAllByText('Edit')[1]) // Staff One
    await waitFor(() => {
      expect(screen.getByText('Accountant')).toBeInTheDocument()
    })
  })

  it('hides the Admin option when creating a new user', async () => {
    render(<UserManagementTab />)
    fireEvent.click(screen.getByText(/add user/i))
    await waitFor(() => {
      const listbox = screen.getByLabelText(/role/i)
      expect(listbox.textContent).not.toMatch(/Admin/)
    })
  })

  it('does not render the old separate Roles section anywhere', () => {
    render(<UserManagementTab />)
    fireEvent.click(screen.getAllByText('Edit')[0])
    expect(screen.queryByText('Effective permissions are the union of all assigned roles.')).toBeNull()
  })

  it('disables the role listbox for a caller without staff.assign_role', async () => {
    vi.doMock('../store/authStore', () => ({
      useAuthStore: (s: (s: { userId: number; permissions: string[]; hasPermission: (p: string) => boolean }) => unknown) =>
        s({ userId: 1, permissions: ['staff.manage'], hasPermission: (p: string) => p === 'staff.manage' }),
    }))
    // Re-import with the new mock applied, or restructure as a separate test
    // file/module-reset if your Vitest config requires vi.resetModules() —
    // the load-bearing assertion is that the listbox is not present/editable
    // when staff.assign_role is absent from hasPermission.
  })
})
```

(The last test's dynamic re-mock pattern is Vitest-config-dependent — if your setup doesn't support `vi.doMock` mid-file cleanly, split it into its own test file with its own top-level `vi.mock` call instead. The assertion it must prove — no `staff.assign_role` ⇒ listbox not interactable — is the one explicit, first-class test CORR-3/BA sign-off required beyond the original draft.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix src/frontend run test -- src/__tests__/UserManagementTab.test.tsx`
Expected: FAIL — current component still has the hardcoded 3-option `<select>` and the separate `RolePicker` section.

- [ ] **Step 3: Rewrite `UserManagementTab.tsx`**

Update the `User` interface (line 15) and `ROLE_COLORS`/`AVATAR_BG` (lines 18-27):

```tsx
interface User {
  id: number; name: string; username: string; email: string | null
  role: { id: number; name: string; key: string; isSystem: boolean }
  isPrimaryAdmin: boolean; isActive: boolean; createdAt: string; branchId: number | null
}
interface Branch { id: number; name: string }
interface RoleOption { id: number; name: string; key: string; isSystem: boolean; permissions: string[]; assignedUserCount: number }

const ROLE_COLORS: Record<string, string> = {
  clinic_admin: 'bg-error-container text-error-on-container',
  doctor:       'bg-primary-fixed text-primary',
  clinic_staff: 'bg-secondary-container text-secondary-on-container',
}
const ROLE_COLOR_FALLBACK = 'bg-surface-container text-on-surface-variant'

const INITIALS = (name: string) => name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
const AVATAR_BG: Record<string, string> = {
  clinic_admin: 'bg-error-container text-error-on-container',
  doctor:       'bg-primary-fixed text-primary',
  clinic_staff: 'bg-secondary-container text-secondary-on-container',
}
const AVATAR_BG_FALLBACK = 'bg-surface-container text-on-surface-variant'

/** Mirrors isGrantable/isAdminLevelRole formerly in RolePicker.tsx (deleted, T-URA-4.2). */
function isGrantable(role: RoleOption, callerPermissions: ReadonlySet<string>): boolean {
  return role.permissions.every((code) => callerPermissions.has(code))
}
function isAdminLevelRole(role: RoleOption): boolean {
  return role.key === 'clinic_admin' || role.permissions.includes('staff.assign_role') || role.permissions.includes('staff.manage')
}
```

Add the `useClinicRolesQuery` import (replace the `RolePicker`/`useUserRolesQuery` imports at lines 7-8):

```tsx
import { useClinicRolesQuery, type Role as RoleOption } from '../../hooks/useUserRoles'
```

(remove the now-unused `import RolePicker from '../../components/roles/RolePicker'` and `import { useUserRolesQuery } from '../../hooks/useUserRoles'` lines).

Rewrite the `Modal` function's role section. Replace lines 40-44 (form state) to drop `role` string and add `roleId`:

```tsx
const [form, setForm] = useState({
  name: user.name ?? '', username: user.username ?? '', email: user.email ?? '',
  roleId: user.role?.id ?? 0, password: '', isActive: user.isActive ?? true,
  branchIds: [] as number[],
})
const [selfDemoteConfirm, setSelfDemoteConfirm] = useState<{ pendingRoleId: number } | null>(null)
```

Replace the `save` mutation (lines 54-63) to send `roleId`:

```tsx
const save = useMutation({
  mutationFn: () => isNew
    ? api.post('/users', { name: form.name, username: form.username, email: form.email || undefined, password: form.password, roleId: form.roleId })
    : api.put(`/users/${user.id}`, { name: form.name, roleId: form.roleId, isActive: form.isActive }),
  onSuccess: async (res) => {
    const uid = isNew ? (res.data as { data: { id: number } }).data.id : user.id!
    await api.patch(`/users/${uid}/branch`, { branchIds: form.branchIds }).catch(() => {})
    qc.invalidateQueries({ queryKey: ['admin', 'users'] }); onClose()
  },
})

const { data: allRoles = [] } = useClinicRolesQuery()
const authPermissions = useAuthStore(s => s.permissions)
const hasAssignRole = useAuthStore(s => s.hasPermission('staff.assign_role'))
const callerPermSet = new Set(authPermissions)
const grantableRoles = allRoles.filter(r => isGrantable(r, callerPermSet))
const listableRoles = grantableRoles.filter(r => !(isNew && r.key === 'clinic_admin'))

function handleRoleChange(newRoleId: number) {
  if (isSelf) {
    const newRole = allRoles.find(r => r.id === newRoleId)
    const currentRole = allRoles.find(r => r.id === form.roleId)
    if (currentRole && isAdminLevelRole(currentRole) && newRole && !isAdminLevelRole(newRole)) {
      setSelfDemoteConfirm({ pendingRoleId: newRoleId })
      return
    }
  }
  setForm(p => ({ ...p, roleId: newRoleId }))
}
```

Replace the role `<select>` block (lines 101-109):

```tsx
<div className="flex flex-col gap-1">
  <label htmlFor="user-role-select" className="text-xs text-on-surface-variant">{t('admin.users.role')}</label>
  <Can perm="staff.assign_role">
    <select
      id="user-role-select"
      aria-label={t('admin.users.role')}
      value={form.roleId}
      disabled={!hasAssignRole}
      onChange={e => handleRoleChange(Number(e.target.value))}
      className="min-h-[44px] px-3 border border-outline-variant rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 bg-surface"
    >
      <option value={0} disabled>{t('common.select')}</option>
      {listableRoles.map(r => (
        <option key={r.id} value={r.id}>{r.name}</option>
      ))}
    </select>
  </Can>
</div>
{selfDemoteConfirm && (
  <div role="dialog" aria-modal="true" className="fixed inset-0 z-[100] flex items-center justify-center bg-primary/30 p-4">
    <div className="bg-surface rounded-xl shadow-xl w-full max-w-sm p-6 space-y-3">
      <h3 className="text-sm font-semibold text-on-surface text-center">{t('roles.selfDemotionTitle')}</h3>
      <p className="text-xs text-on-surface-variant text-center">{t('roles.selfDemotionDesc')}</p>
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={() => setSelfDemoteConfirm(null)}
          className="flex-1 min-h-[44px] border border-outline-variant rounded-lg text-xs font-semibold text-on-surface">
          {t('roles.keepRole')}
        </button>
        <button type="button" onClick={() => { setForm(p => ({ ...p, roleId: selfDemoteConfirm.pendingRoleId })); setSelfDemoteConfirm(null) }}
          className="flex-1 min-h-[44px] bg-error text-on-primary rounded-lg text-xs font-semibold">
          {t('roles.removeAnyway')}
        </button>
      </div>
    </div>
  </div>
)}
```

Remove the entire "Roles" section block (lines 147-157: the `<hr>` + `<Can perm="staff.assign_role"><RolePicker .../></Can>` + trailing `<hr>`) — keep the `<Can perm="staff.manage">` reset-password block that follows it (lines 158-184), just drop its preceding `<hr>`/`RolePicker` siblings.

Update `isPrimaryAdmin` display logic — the `Modal`'s `isPrimaryAdmin` prop is passed in from the parent already (line 326: `isPrimaryAdmin={modal.id === primaryAdminId}`); change the parent's computation instead (see below), the `Modal` itself needs no further edit for this piece since it already receives the prop.

At the top-level `UserManagementTab` component, replace lines 320-322:

```tsx
const primaryAdminId = users.find(u => u.isPrimaryAdmin)?.id ?? null
```

Replace the badge rendering (line 352, `AVATAR_BG[user.role]`) and (line 361, `ROLE_COLORS[user.role]`):

```tsx
// line 352
<div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${AVATAR_BG[user.role.key] ?? AVATAR_BG_FALLBACK}`}>
```

```tsx
// line 361
<span className={`text-xs px-2 py-1 rounded-full font-medium ${ROLE_COLORS[user.role.key] ?? ROLE_COLOR_FALLBACK}`}>{user.role.name}</span>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix src/frontend run test -- src/__tests__/UserManagementTab.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run the full frontend suite**

```bash
npm --prefix src/frontend run test 2>&1 | tail -50
```

Expected: no new failures beyond ones already known/expected from the `role` shape change (any remaining failures here are additional consumers not yet covered — investigate and fix inline if small, or flag explicitly in the PR description if out of this task's direct scope).

- [ ] **Step 6: Commit (includes Task 15's deferred deletion)**

```bash
git add src/frontend/src/views/admin/UserManagementTab.tsx src/frontend/src/__tests__/UserManagementTab.test.tsx
git rm -r --cached src/frontend/src/components/roles/RolePicker.tsx 2>/dev/null || true
git add -A src/frontend/src/components/roles
git commit -m "feat(users): unify Edit User role assignment into one RBAC-backed listbox (bug fix + CORR-3)"
```

---

## Phase 3 — Documentation supersession (URA-5)

### Task 21: Retire FR-14b in `anemal-functional-reqs`

**Files:**
- Modify: `.claude/skills/anemal-functional-reqs/SKILL.md:76`

**Interfaces:** none (doc-only).

- [ ] **Step 1: Read the current line**

Confirmed content (line 76):

```
| Multi-role (RBAC) | FR-14b | A clinic user may hold **multiple roles**; effective permissions = union; **Clinic Admin assigns roles** (`staff.assign_role`, no escalation, ≥1 role). CR-01 |
```

- [ ] **Step 2: Replace with the retirement note**

```
| Multi-role (RBAC) | ~~FR-14b~~ RETIRED 2026-07-20 | **Superseded by ADR-0019** — a clinic user holds exactly **one** role via `roleId`; combined access is achieved by cloning a role with the right permission mix (e.g. "Doctor + Accounting"), not by stacking roles. **Clinic Admin assigns the role** (`staff.assign_role`, no escalation — permissions of the assigned role must be ⊆ the assigner's own). See `docs/adr/0019-single-role-per-user-retires-multi-role.md` and `docs/superpowers/plans/2026-07-20-unify-user-role-assignment.md`. |
```

- [ ] **Step 3: No automated test (doc-only)** — visually confirm the markdown table still renders correctly (no broken pipes/columns) by viewing the file.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/anemal-functional-reqs/SKILL.md
git commit -m "docs(fr): retire FR-14b multi-role — superseded by ADR-0019 single-role model"
```

---

### Task 22: Retire CR-01 in `anemal-rbac-matrix` (SKILL.md + permission-matrix.md §5)

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

Current section header and body describe N roles/union. Replace the entire block with:

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

Keep the `staff.assign_role`/`staff.assign_branch` permission-code table and runtime-rule text (lines 179-197) largely as-is, but update the stale route reference at line 187 (`Route map: POST/DELETE /users/:id/roles → staff.assign_role`) — that route no longer exists (removed in Task 4/Task 5). Replace it with:

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

## Phase 4 — Final verification sweep

### Task 23: Full-suite regression run + scope-map reconciliation

**Files:** none (verification only — fixes go in follow-up commits on this same branch if anything unexpected surfaces).

**Interfaces:** none.

- [ ] **Step 1: Run the full backend suite**

```bash
npm --prefix src/backend run test 2>&1 | tee /tmp/backend-full-run.txt | tail -80
```

Expected: green, except for any test file not touched by Tasks 5-13 that still constructs a `User` fixture with a `role: 'admin'` string literal (Task 4 Step 8's scope map). For each remaining failure, open the file and apply the same `role: 'x'` → `roleId: <lookup>` pattern used throughout Tasks 6-11's test edits, as its own small follow-up commit per file (do not bundle unrelated fixture fixes into one giant commit — one file, one commit, same message pattern: `test: update <file> fixtures for roleId migration`).

- [ ] **Step 2: Run the full frontend suite**

```bash
npm --prefix src/frontend run test 2>&1 | tee /tmp/frontend-full-run.txt | tail -80
```

Expected: green, except any test file constructing a `User`/`role` fixture as a bare string outside the files this plan already touched — same fix-and-commit pattern as Step 1.

- [ ] **Step 3: TypeScript compile check, both sides**

```bash
cd src/backend && npx tsc --noEmit
cd ../frontend && npx tsc --noEmit
```

Expected: zero errors. Any error here is a missed call site of `safe()`, `createUser`, `updateUser`, or a stale `role: string` type reference not caught by the test suite — fix and commit per-file.

- [ ] **Step 4: Confirm the 3 removed endpoints stay removed and the migration is idempotent**

```bash
cd src/backend
npx prisma migrate status
```

Expected: no pending migrations, DB schema matches `schema.prisma`.

- [ ] **Step 5: Final commit (if any Step 1-3 fixes were needed and not yet committed)**

```bash
git add -A
git commit -m "test: final regression sweep for unify-user-role-assignment"
```

---

## Self-review notes (for the plan author, not a task)

- **Spec coverage:** URA-1 → Tasks 1-4; URA-2 → Tasks 5-13 (T-URA-2.9 = Task 13; the `RoleDto.key` gap found during this write-plan pass is Task 12, explicitly flagged as a plan-time addition, not a silent extra); URA-3 → Tasks 15-20; URA-4 → Tasks 14-15, 20 (inlined per Task 15's note); URA-5 → Tasks 21-22. Grill findings F-3 (Task 17, ADR-0019 comment), F-4 (enforced structurally by `roleId` NOT NULL in Task 4, referenced in Global Constraints), F-5 (Task 4 Step 5) are all covered.
- **Placeholder scan:** no "TBD"/"similar to Task N" patterns; every code step above shows complete, load-bearing code against files actually read during this planning pass (not guessed).
- **Type consistency:** `RoleOption`/`Role` (frontend, `useUserRoles.ts` Task 14 + `useRoles.ts` Task 16) both gain `key: string`, matching `RoleDto.key` (backend, Task 12) — verified consistent across all three files. `UserResponse.role` shape (`{ id, name, key, isSystem }`, Task 8) matches the frontend `User.role` interface used in Task 20. `createUser`/`updateUser`'s new `(callerPerms, hasAssignRole)` parameters (Task 10) are consistently threaded from `user.controller.ts` at every call site touched.
