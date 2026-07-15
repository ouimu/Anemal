# BA Sign-off — Clinic Password UI + First-Admin Protection + Discoverable Deactivate/Restore

- **Document type:** Step-3 BA validation sign-off (CLAUDE.md Standard Pipeline)
- **Inputs reviewed:**
  - `docs/superpowers/specs/2026-07-15-clinic-password-ui-and-admin-protection-design.md` (Step 1 brainstorm)
  - `docs/superpowers/plans/2026-07-15-clinic-password-ui-and-user-management-pm-tasks.md` (Step 2 PM tasks)
  - `anemal-rbac-matrix`, `anemal-ba-toolkit`, backend source (`user.service.ts`, `platform-customers.service.ts`, `platform-customers.repository.ts`)
- **Author:** @ba-agent
- **Date:** 2026-07-15
- **Branch:** `feature/clinic-password-ui-and-user-management`

## Decision

**APPROVED WITH CONDITIONS.** Scope, task mapping, permission codes, and test coverage are sound.
Three conditions (C-1..C-3 below) must be carried into `/grill-with-docs` (Step 3.5) and resolved
before `/write-plan`. None require re-brainstorming; all are guard-completeness questions inside
the already-locked Section B scope.

## Authorization validation (RBAC / plane / tenant)

| Check | Verdict | Evidence |
|---|---|---|
| Deny-by-default respected | PASS | A1/B/C all sit behind existing `requirePlane('clinic')` + `requirePermission('staff.manage')`; A2 behind auth + clinic plane only, which is correct for self-service (acts only on the caller's own identity, `userId` from JWT, never from params) |
| No new permission codes needed | PASS | Reuses `staff.manage`; no catalogue change, no matrix regression risk |
| Plane separation | PASS | All routes clinic-plane. Note: platform-plane CO-4/CO-5 (ADR-0015) remain a separate, already-bounded exception — see C-3 |
| Server as security boundary | PASS | B1 guard is server-side in `user.service.ts` on **both** write paths (`deactivateUser` + `updateUser isActive:false`); B2/C UI lock is UX-only, and ADMIN-PROT-3/USER-DISC-1 ACs correctly require surfacing a backend 403 on stale client state |
| Tenant isolation | PASS | `findPrimaryAdminId(tenantId)` is tenant-scoped by signature; ADMIN-PROT-1/2 ACs include two-tenant cross-checks; 403-vs-404 distinction from ADR-0014 correctly preserved (business rule on a visible in-tenant row = 403, cross-tenant = 404) |
| No access regression | PASS | No role loses access; second-admin-can-still-be-deactivated AC proves the guard is id-scoped, not role-scoped |

## §6 open questions — BA answers (authoritative recommendation; grill still confirms)

### Q1 — Primary-admin identity: legacy `role='admin'` (min id) **← CONFIRMED**

Legacy and RBAC are **kept in sync on every write path today**, so legacy is not a "worse" source
of truth for this rule — it is an equivalent, simpler one:

- Platform provisioning writes both: `createTenantAdminUser` sets `role: 'admin'` **and** creates
  the `clinic_admin` `userRole` in one transaction (`platform-customers.repository.ts:331-353`).
- Clinic-plane create/update map legacy→system role via `LEGACY_ROLE_TO_SYSTEM_KEY`
  (`user.service.ts:18-22`), so `role='admin'` ⇔ `clinic_admin` for every system-role user.
- The threat being mitigated is lockout of the **auto-provisioned first admin**, which always has
  `role='admin'`. A custom role granting admin-equivalent permissions is not auto-provisioned and
  is not the lockout vector; it needs no protection now (matches the brainstorm's own read).

**Ruling:** `role='admin'` + `ORDER BY id ASC` within `tenantId`, as designed. Add one line to the
guard's doc comment: *if the legacy `role` column is ever retired, this rule migrates to
"lowest-id user holding the `clinic_admin` system role via `user_roles`"* — the two are equivalent
today, so no behavior change is being deferred.

### Q2 — Self-edit and A1: **hide A1 on own row; route self to A2**

When a `clinic_admin` opens the Edit modal on **their own** row, do **not** render the
reset-password section; render a short pointer to Preferences ("Change your own password in
Settings → Preferences"). Rationale:

- A1 has no current-password check. Offering it to self makes "change my own password without
  knowing the current one" a one-click UI flow — the exact walk-up/unattended-session risk the
  current-password field in A2 exists to mitigate.
- Server-side, PR #26 Q-G2 still permits self-reset via `PATCH /users/:id/password`; that residual
  stays accepted (no server change in this branch — it is not privilege escalation, the caller
  already holds `staff.manage`). This is a UI-routing decision only; server remains the boundary
  for what it was designed to allow.
- Adds one condition (`editingUser.id === currentUser.id`) — no new endpoint, no ponytail concern.

### Q3 — Restore permission: **`staff.manage` only, no extra gate**

- Symmetric with deactivate; an extra gate would require a new permission code (catalogue change,
  matrix regression testing) with no stated business objective — fails "recommend standard before
  custom" and deny-by-default hygiene (new codes need owners in the matrix).
- Restoring an admin restores previously-granted access; it is not escalation. The no-escalation
  rule that matters (a clinic admin cannot grant roles exceeding their own) is already enforced at
  role assignment, not at activation toggling.
- See C-2 for the one real gap on this path (quota), which is a subscription rule, not a
  permission gate.

### Q4 — Deactivate confirm copy: **simple confirm, with the user's name in the copy**

- Deactivation is fully reversible (Restore is being shipped in the same branch) and the only
  catastrophic target (primary admin) is hard-blocked server-side by B1. Typed-name confirm is a
  guard for irreversible actions (it belongs to the §7 permanent-delete follow-up, where it should
  be required).
- Copy must name the target to prevent wrong-row clicks, e.g. **"Deactivate {name}? They will no
  longer be able to log in. You can restore them later."** Confirm button label: "Deactivate", not
  "OK". Restore needs no confirm (non-destructive), per the PM task — agreed.

## Conditions (carry into /grill-with-docs — resolve before /write-plan)

**C-1 — Role-demotion bypass of the deactivation guard.** The brainstorm explicitly allows role
edits to the primary admin. But `PUT /users/:id` changing the primary admin's role from `admin` to
`staff`/`doctor` achieves the same lockout as deactivation (loses `staff.manage`; and shifts
`findPrimaryAdminId` to another user or `null`). Recommendation: extend the B1 guard to also block
the primary admin's `role` transitioning **away from** `'admin'` (same 403, message "Cannot change
the primary clinic admin's role"). One extra condition in the same guard; still zero new
endpoints. Grill must confirm or consciously accept the residual.

**C-2 — Restore vs subscription quota.** `createUser` calls
`subscriptionService.assertCanAddUser(tenantId)`, but the restore path (`PUT /users/:id`
`{isActive:true}`) appears not to re-check the active-user quota — restore could exceed a plan
limit that create enforces. Verify at grill; if confirmed, either add the quota check to the
`isActive:false→true` transition in this branch (small, in-scope for C) or log it as an explicit
accepted residual with rationale ("quota counts total users, not active" would make it a
non-issue — verify which definition `assertCanAddUser` uses).

**C-3 — Platform-plane deactivation path is outside the guard.** CO-4
(`platform-customers.service` deactivate clinic_admin, ADR-0015) does not go through
`user.service.deactivateUser`, so the platform console **can** deactivate a tenant's primary
admin. Recommendation: leave it exempt **deliberately** — the platform operator is the recovery
path for a locked tenant (can create a new admin via CO-2), so blocking it would remove the escape
hatch. Grill confirms; document the exemption in the guard's comment and in ADR-0015's amendment
trail so it reads as a decision, not a hole.

## Minor implementation cautions (for /write-plan, no grill needed)

- ADMIN-PROT-3 computes `primaryAdminId` from the **fetched** users list. If that list is ever
  filtered/paginated server-side, the client-side `min(id)` can be wrong. Acceptable today
  (server guard is the boundary; worst case is a spurious enabled button that 403s per the
  existing AC) — but the plan should note the list must be the unfiltered tenant user list.
- A2's 401 (wrong current password) must not trigger any global "session expired → logout"
  interceptor the frontend may have on 401 responses. Verify the API client's 401 handling before
  wiring; surface inline instead.
- PWD-UI-1/PWD-UI-2: password inputs `type="password"`, `autocomplete="new-password"` /
  `"current-password"`, and never log or toast the submitted value.

## Definition-of-Ready check (anemal-ba-toolkit)

Objective ✓ (close 3 production gaps) · Actors/roles ✓ (`clinic_admin`, `doctor`, `clinic_staff`,
role keys per matrix) · Permission codes ✓ (`staff.manage`; A2 auth-only, justified) · Business
rules ✓ (B1 invariant + C-1 extension proposed) · Exceptions ✓ (403 semantics, stale-client,
mismatch, 401/422) · NFR impact ✓ (none material: no schema, no new deps, one extra indexed
`findFirst` per deactivation attempt) · Acceptance criteria testable ✓ · Risks & dependencies ✓
(C-1..C-3 recorded).

## Handoff

To `/grill-with-docs` (Step 3.5, MANDATORY) with C-1, C-2, C-3 and the four §6 rulings above as
the grill agenda. `/write-plan` remains blocked until every grill finding is resolved.

**Signed:** @ba-agent, 2026-07-15
