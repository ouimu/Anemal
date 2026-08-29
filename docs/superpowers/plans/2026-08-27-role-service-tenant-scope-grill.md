# Role Service Tenant Scope — Grill Record (Step 3.5)

**Date:** 2026-08-27
**Method:** `grill-with-docs` (relentless interview, human-driven), against
[2026-08-27-role-service-tenant-scope-pm-tasks.md](2026-08-27-role-service-tenant-scope-pm-tasks.md) (RST-1..RST-6)
and [2026-08-27-role-service-tenant-scope-ba-signoff.md](2026-08-27-role-service-tenant-scope-ba-signoff.md)
**Status:** ✅ All findings resolved. Cleared for `/superpowers:write-plan` (Step 4).

---

## Findings raised and resolved

### G-1 — RST-6's FK-violation catch was over-specified

> ⚠️ **CORRECTION (2026-08-27, QA round 2, finding R2-B1):** the "only Restrict FK"
> claim below is **wrong**. `prisma migrate diff` shows `users_roleId_fkey`
> (`User.roleId` → `ClinicRole.id`) is **also** `ON DELETE RESTRICT` — Prisma picks
> Restrict because the FK scalar `User.roleId` is required, even though the relation
> field reads `ClinicRole?`. There are **two** Restrict FKs on `ClinicRole`, not one.
> The conclusion below ("safe today") is still correct by coincidence — both FKs map
> to the same user-facing "role is in use" message, so the blanket `P2003` catch still
> behaves correctly — but the reasoning that produced it was based on an incomplete
> inventory. Do not cite "only one Restrict FK" from this section again; see the QA
> sign-off doc **§9 (R3-B4 / R3-F1)** and the HANDOFF incident writeup for the corrected
> inventory. Caveat (R3-F1): `users_roleId_fkey` is RESTRICT in the live dev/test DB but
> SET NULL in the committed migration chain — a tracked drift; either reading still
> refuses the delete, so "safe today" holds.

**Raised:** RST-6 (as drafted by @pm-agent) caught `PrismaClientKnownRequestError` code `P2003`
unconditionally, with no check on *which* FK/relation triggered it. Confirmed via schema read
(`src/backend/prisma/schema.prisma`, grep for `onDelete:` on `ClinicRole` relations) that
`UserRole.role` (line 941, `onDelete: Restrict`) is currently the **only** Restrict FK referencing
`ClinicRole`, so the blanket catch is safe today — but a future schema change adding a second
Restrict FK on `ClinicRole` would silently misreport an unrelated violation as "role assigned to
users."

**Resolution:** Checked existing codebase convention for this exact pattern — `owner.service.ts:104`,
`owner.service.ts:133`, `platform-customers.service.ts:469`, `user.service.ts:214` all catch
`PrismaClientKnownRequestError` by `err.code` **only**, with no `meta.field_name` narrowing anywhere
in the codebase. Narrowing RST-6 alone would be inconsistent with the established pattern and adds
complexity against a risk that doesn't exist yet (YAGNI). **Decision: keep RST-6's catch as a plain
`err.code === 'P2003'` check, matching the codebase-wide convention exactly. No task-list change
needed — RST-6 as drafted in the pm-tasks doc is correct as-is.**

### G-2 — `listRoles`'s "global count" behavior is silent, no user-facing notice needed

**Raised:** RST-5 changes a customer-visible number (`assignedUserCount` chip in `RoleList.tsx`) for
system roles, from a platform-wide total to a per-tenant total. This is a real, visible drop in the
displayed number on deploy day, with no in-app copy explaining why.

**Resolution:** Human decision — treat as a silent bug fix, no release note or customer
communication required. Rationale: the old number was incorrect (a cross-tenant data disclosure,
per BA sign-off G-1/R2-ME-01), not a feature the correct number is expected to match. **No task-list
change.**

### G-3 — an existing test's comment documents the bug as intended behavior

**Raised:** `src/backend/tests/integration/roleEditor-t5f01.test.ts:142` carries the comment
`// Admin A and Admin B both hold clinic_admin → count is global to the role (≥2)`, describing
exactly the cross-tenant leak RST-5 fixes. The assertion itself
(`toBeGreaterThanOrEqual(1)`, not `toBe(2)`) will **not** go red after RST-5 — tenant A's own admin
still counts as 1 — but the comment becomes false documentation if left unchanged.

**Resolution:** Human decision — fix the comment. **New task added: RST-7** (see updated pm-tasks
doc) — update the comment at `roleEditor-t5f01.test.ts:142` to describe the corrected, per-tenant
counting behavior, and add a note that the ≥1 assertion holds precisely *because* it no longer
double-counts. Comment-only change to an existing test file; no new test logic, no new file.

---

## Findings considered and explicitly not carried forward

- **Full backend suite re-run to confirm main's test count is still 1295/1295** — not run during
  this grill (would take significant time and duplicate what Step 6/8 already gate on). Deferred to
  `@qa-agent` (Step 7) and the red-suite ship gate at `/anemal-finish-branch` (Step 8), which already
  re-verify main's status before merge per CLAUDE.md and the existing hand-off section in the
  pm-tasks doc. Not a Step 3.5 blocker.
- **A new ADR for this change** — considered and declined. The governing precedent is already
  ratified: ADR-0025 D-1 ("a pre-check gating a state-changing operation must use the identical
  tenant scope as the write"). This branch closes a deviation from that existing rule; it does not
  establish a new architectural position. No new ADR needed — cite ADR-0025 D-1 in the PR body
  (already required by BA sign-off condition C-8).
- **Glossary update** — no new domain term introduced. `tenant-scoped pre-check`, `defence-in-depth`,
  and `cross-tenant disclosure` are all already-established vocabulary in this project's ADRs and BA
  toolkit; nothing to add.

---

## Task-list delta from this grill

One task added to `docs/superpowers/plans/2026-08-27-role-service-tenant-scope-pm-tasks.md`:

- **RST-7** — fix the stale "count is global to the role" comment in
  `src/backend/tests/integration/roleEditor-t5f01.test.ts:142` (per G-3 above).

RST-1 through RST-6 are unchanged from the post-BA-sign-off rework — this grill did not find defects
in their design, only in one adjacent test comment and confirmed two implementation choices
(RST-6's catch specificity, RST-5's silent-fix framing) that required no code change.

---

## Sign-off

All findings raised in this grill are resolved. No open items block `/superpowers:write-plan`
(Step 4). Proceed to Step 4, then `@ponytail-agent` (Step 5).
