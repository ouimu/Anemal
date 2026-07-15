# ADR-0016 — Primary-Admin Lockout Protection: Guard Scope, Restore-Quota, Platform Exemption

- **Status:** Accepted
- **Date:** 2026-07-15
- **Branch:** `feature/clinic-password-ui-and-user-management`
- **Context doc:** `docs/superpowers/specs/2026-07-15-clinic-password-ui-and-admin-protection-design.md` (§6 open questions)
- **Produced by:** Step 3.5 `/grill-with-docs` (mandatory gate), autonomous run — no human present (scheduled task). Findings resolved with documented defaults; nothing left blocking.

## Decision record

### D-1 — Primary-admin identity (brainstorm §6-Q1)

Confirmed: legacy `role = 'admin'` (lowest `id`) per tenant. `user.service.ts`
keeps legacy `role` and RBAC `clinic_admin` role assignment in sync on every
write path (`LEGACY_ROLE_TO_SYSTEM_KEY` mapping used in both `createUser` and
`updateUser`), so the legacy column is an equivalent, simpler signal for the
lockout threat than joining through `user_roles`. No schema change needed.

### D-2 — Self-edit routing (brainstorm §6-Q2)

Hide the A1 admin-reset section when a `clinic_admin` edits their own row;
route self to the A2 self-service form (`/settings/preferences`) instead. A1
has no current-password check (matches PR #26 Q-G2's admin-reset design) —
offering it against one's own row would let a walked-up session change the
admin's own password without proving current-password knowledge, defeating
A2's mitigation. Frontend-only routing decision; no server change.

### D-3 — Restore permission gate (brainstorm §6-Q3)

`staff.manage` only — same permission as deactivate. Restoring a user is not
a privilege escalation; a separate permission code would add a gate with no
distinct threat it defends against.

### D-4 — Deactivate confirm copy (brainstorm §6-Q4)

Simple confirm naming the target ("Deactivate {name}? You can restore them
later."), not a typed-name confirm. Typed-name confirmation is reserved for
the irreversible §7 permanent-delete flow (separate spec, out of scope here).

### D-5 (grill finding C-1) — Role-demotion-away-from-admin bypass — RESOLVED, guard extended

**Finding:** `updateUser` (`PUT /users/:id`) can change `body.role` away from
`'admin'` for the primary admin without touching `isActive`. Since
`findPrimaryAdminId` selects on `role = 'admin'`, a role change alone drops
the target's admin RBAC role (`replaceUserRole` swaps the assigned role) and
removes them from the primary-admin computation — functionally equivalent to
a lockout if they were the tenant's only admin, but the B1 guard (which only
checks `isActive: false`) does not catch it.

**Resolution:** the shared guard is renamed/extended in behavior (not name —
`assertNotPrimaryAdminDeactivation` keeps its name for minimal diff per
ponytail) to also throw 403 when `userId === findPrimaryAdminId(tenantId)`
AND the update would either (a) set `isActive: false`, or (b) set
`body.role` to anything other than `'admin'`. Reactivation and non-role,
non-isActive edits (name, password) remain unguarded/allowed. This becomes
task **ADMIN-PROT-2** in the pm-agent task list (guard already covers both
call sites; scope of "what triggers 403" is what's extended — no new call
site, no new file).

### D-6 (grill finding C-2) — Restore bypasses seat quota — RESOLVED, quota check added

**Finding:** `PUT /users/:id { isActive: true }` (restore) does not call
`subscriptionService.assertCanAddUser(tenantId)`, unlike `createUser`. A
tenant at its plan's seat limit could restore a deactivated user and exceed
the quota it would otherwise block at creation time.

**Resolution:** `updateUser` calls `assertCanAddUser(tenantId)` before
applying an `isActive: false → true` transition (i.e., only on the restore
path, not on every update). This becomes a new subtask under
**ADMIN-PROT-2** (same file, `user.service.ts`, same function — no new task
ID needed, folded into the existing guard-extension task to avoid scope
creep past the pm-agent's 7-task breakdown).

### D-7 (grill finding C-3) — Platform CO-4 bypasses the guard entirely — RESOLVED, deliberate documented exemption

**Finding:** `deactivateTenantAdminUser` (platform plane, CO-4,
`platform-customers.service.ts:491`) sets `isActive = false` on any
`clinic_admin` user directly via `customersRepo.deactivateTenantAdminUser`,
with zero call into the clinic-plane guard. A platform operator can
deactivate a tenant's primary admin (or its only admin) with no 403.

**Resolution:** accepted by design, **not extended to include the guard**.
Rationale, consistent with the ADR-0015 bounded-exception precedent
(platform→clinic-plane crossings are allowed when narrow, audited, and
justified):

- The platform plane is Anemal's own SaaS-operator recovery path. If a
  clinic's only admin needs deactivating for a support/compliance reason
  (account fraud, customer offboarding, breach response), platform ops is
  the intended escape hatch — the clinic-plane guard exists to stop a
  clinic's *own* staff from accidentally locking the clinic out, not to
  stop Anemal's own operators from being able to intervene.
- CO-4 already writes a `platform_audit_log` entry
  (`tenant.admin_user.deactivate`) — the action is fully attributable,
  unlike an unaudited backdoor.
- Blocking it would remove the only recovery mechanism for a
  fully-locked-out tenant (all clinic-plane sessions expired, no working
  admin credential) short of a manual DB fix.
- CO-5 (`resetTenantAdminUserPassword`) never touches `isActive`, so it was
  never in scope for this finding — verified by reading
  `platform-customers.service.ts:525-544`; no bypass exists there because
  there is nothing to bypass.

No code change. This decision is the record; no new task.

### D-8 (grill finding) — Concurrent-deactivation TOCTOU on `findPrimaryAdminId` — RESOLVED, accepted risk, no lock

**Finding:** two concurrent requests could each call
`findPrimaryAdminId(tenantId)`, read the same result, and race against a
concurrent role/isActive change on the primary admin row itself.

**Resolution:** accepted risk, no additional locking. This is an
admin-initiated, low-frequency, single-tenant-scoped action (deactivating a
user is not a hot path); Postgres's per-row `UPDATE` still serializes the
actual write to any single user row, so the only residual race is
read-then-act on the *guard check* itself, which at worst produces a rare
403 that a retry resolves cleanly (fails closed, not open — a missed race
means the request is rejected, never that a lockout guard is skipped).
`// ponytail: no pessimistic lock on findPrimaryAdminId — add
SELECT...FOR UPDATE if concurrent admin-management traffic is ever observed
in practice.`

### D-9 — Client-side checkbox disable vs. server enforcement

Confirmed no gap: B1 (backend guard) is unconditional and runs regardless of
how the request was formed; B2 (frontend disabled checkbox) is a UX
affordance only. Verified by reading the brainstorm spec — B1 is listed as a
required task independent of B2, and the guard sits in `user.service.ts`,
not gated behind any frontend flag.

## Consequences

- `user.service.ts`'s shared guard function grows two more trigger
  conditions (role-away-from-admin, isActive:false) and the restore path
  gains a quota check — all inside the single function `ADMIN-PROT-2`
  already scoped to touch, so the pm-agent's file/task count is unchanged.
- The platform CO-4 exemption is now a documented, intentional design
  decision rather than an unexamined gap — future audits should not flag it
  as a bug without reading this ADR first.
- No new task IDs, no new files, no new endpoints. Ponytail scope gate
  (Step 5) inputs are unaffected by this ADR.

## Glossary additions

- **Primary admin** — the lowest-`id` user with legacy `role = 'admin'` in a
  tenant; the user the lockout-protection guard treats as
  non-deactivatable/non-demotable via the clinic plane.
- **Lockout-equivalent action** — any state change (deactivation OR role
  change away from `'admin'`) that would remove the tenant's last admin
  identity from clinic-plane control.
- **Platform recovery exemption** — the deliberate, audited exception
  allowing platform-plane operations (CO-4) to bypass a clinic-plane-only
  guard, used when the guard's purpose (stopping clinic self-lockout) does
  not apply to Anemal's own SaaS-operator recovery path.

## Grill outcome

All findings resolved. Zero blocking questions remain. `/write-plan` (Step 4)
may proceed.
