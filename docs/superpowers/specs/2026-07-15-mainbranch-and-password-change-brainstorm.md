# Brainstorm — Main-Branch Auto-Provisioning Fix + Clinic Password Change

- **Document type:** Step-1 Brainstorm + Step-3 BA validation (combined, pre-plan, pre-code)
- **Author:** @ba-agent (2026-07-15)
- **Pipeline position:** Steps 1+3 of the Standard Pipeline (CLAUDE.md). Next gate: /grill-with-docs (Step 3.5, MANDATORY) before /write-plan.
- **Related spec:** `.claude/specs/RBAC_Platform_Restructure_Spec.md` (SPEC-RBAC-PLATFORM-01)
- **Related ADRs:** ADR-0014 (branch-isolation BOLA precedent), ADR-0015 (platform provisions clinic_admin identity)
- **Related skills:** `anemal-rbac-matrix`, `anemal-platform-console`, `anemal-db-context`, `anemal-ba-toolkit`

Two related items, one branch: **Item A** fixes a provisioning defect introduced alongside ADR-0015; **Item B** closes the clinic-plane password-management gap that ADR-0015's platform-only reset endpoint left open.

---

## 1. Business Objectives

| Item | Objective |
|---|---|
| A | A tenant provisioned via the Platform Console must be operational from day one: it must have its first branch, exactly like seed-created tenants, so staff/doctor users can log in and branch-scoped modules work. |
| B | Clinic users must be able to manage their own credentials: any clinic user can change their own password; a clinic_admin can reset a staff/doctor password without platform intervention. Today the ONLY password-reset path in the product is a platform-superadmin endpoint that covers clinic_admin users only. |

---

## 2. In Scope / Out of Scope

**In scope**
- A-1: Branch auto-creation inside the existing `createCustomer()` transaction.
- A-2: Idempotent backfill for existing branch-less tenants.
- B-1: `POST /auth/change-password` — self-service, current password required, clinic plane.
- B-2: `PATCH /users/:id/password` — clinic_admin resets a clinic user's password, tenant-scoped, BOLA-safe.
- B-3: Refresh-token revocation on password change/reset (including retrofitting the existing platform reset endpoint).

**Out of scope**
- Forced password change on first login (`mustChangePassword`) — no schema field exists; deferred since ADR-0015 Q-4.
- Email/SMS credential delivery or "forgot password" (unauthenticated) flow — blocked on Phase 10/11 dispatch infra.
- Password complexity policy beyond the existing `min(8)` convention (`createUserSchema`, `user.controller.ts:13`).
- Platform-plane password reset changes beyond token revocation (endpoint shipped in PR #23, stays as-is).
- Access-token (JWT) immediate invalidation infrastructure (tokenVersion) — see Q-G3.
- Branch management UI changes — clinic branch CRUD already exists (`branch.routes.ts`, `clinic.branch.manage`).

---

## 3. ITEM A — Main-Branch Auto-Provisioning

### 3.1 AS-IS (confirmed by code reading)

- `createCustomer()` (`src/backend/services/platform-customers.service.ts:241`) runs a `$transaction` creating `Tenant` + first `clinic_admin` `User` (username `admin`, `roleId` + `user_roles` row) — **zero `Branch` rows, no `user_branches` rows**.
- `src/backend/prisma/seed.ts:57-71` by contrast creates a `Main Branch` per tenant (unique `(tenantId, name)` constraint) and `user_branches` rows for non-admin users (`seed.ts:124-141`).
- Login behavior (`src/backend/services/auth.service.ts`):
  - `role === 'admin'` **bypasses branch selection entirely** — full JWT issued with `branchId: undefined` = all-branches scope (lines 64-98); the bypass is repeated in `selectBranch()` (line 148). Admins have **no** `user_branches` rows even in seed data.
  - staff/doctor get 403 "You are not assigned to any branch" when `getUserBranches()` returns empty (lines 100-104).
- Consequence for a Platform-Console-provisioned tenant: the auto-created admin **can** log in, but the tenant has no branch, so (a) no staff/doctor can ever complete login, (b) every branch-scoped module (appointments, inventory stock, hospitalization, dashboard) has no branch context to operate in, (c) the admin's only recovery is manually creating a branch via `POST /branches` (`clinic.branch.manage`). Degraded-but-recoverable is still a defect: seed parity says every tenant starts with a Main Branch.

### 3.2 TO-BE (proposed fix — exact placement)

Inside the **existing** `prisma.$transaction` in `createCustomer()` (`platform-customers.service.ts:264-298`), after `customersRepo.createTenant(...)`:

```
const branch = await tx.branch.create({
  data: { tenantId: createdTenant.id, name: 'Main Branch' },
})
```

- **Name:** `'Main Branch'` — matches seed convention; unique `(tenantId, name)` cannot collide in a brand-new tenant.
- **`user_branches` row for the auto-created admin: NOT needed.** Confirmed: the `role === 'admin'` bypass in both `login()` and `selectBranch()` means admins never consult `user_branches`; seed creates none for admins either. Creating one would be dead data and inconsistent with seed.
- **Quota (`assertCanAddBranch`): intentionally NOT called** in this path, mirroring the Q-5 first-admin exemption. Justification (verified): `plan.maxBranches` is `Int @default(1)` (`schema.prisma:906`), zod validation on plan create/update and quota override is `.int().positive()` (`platform-plans.controller.ts:20,30`) — **a 0-branch quota is unreachable** via any API; no-plan fallback is `null` = unlimited (`subscription.service.ts:52`). Branch count is 0 at this point, so the check could never fail anyway. The auto-created Main Branch counts as 1 toward `maxBranches` thereafter (expected).
- **Audit:** add `branchId` to the existing `customer.create` audit `details` (alongside `adminUserId`). No new audit action.
- **API/UI change:** none — request/response shapes unchanged (branch is an internal provisioning detail; Customer Detail usage panel will pick it up via existing counts).

### 3.3 Backfill (required)

Tenants created via the Platform Console between PR #23 and this fix exist with zero branches in any real environment. Backfill: idempotent data migration/script — `INSERT` a `Main Branch` for every tenant having zero `Branch` rows (active or not). Safe to re-run (guard on count = 0); seed tenants unaffected. `@db-agent` to decide Prisma migration vs one-off script at plan time; recommend a script committed under `src/backend/scripts/` consistent with `create-platform-admin.ts` precedent, run as a deploy step.

---

## 4. ITEM B — Clinic Password Change / Reset

### 4.1 AS-IS (confirmed by code reading)

| Capability | Exists? | Evidence |
|---|---|---|
| Self-service change own password | **No** | No `/auth/change-password` route anywhere (`auth.routes.ts` full read); no password field in any clinic-plane update schema. |
| clinic_admin resets staff/doctor password | **No** | `updateUserSchema` (`user.controller.ts:17-24`) is `.strict()` with fields name/username/email/phone/role/isActive only — password is rejected. |
| Platform resets clinic_admin password | Yes | `PATCH /platform/customers/:id/admin-users/:userId/password` (`platform-customers.routes.ts:68`, `platform.customers.manage`), clinic_admin-role rows only (ADR-0015 B-1). |
| Token invalidation on reset | **No** | Platform reset (`platform-customers.service.ts:520-534`) re-hashes and audits — does **not** revoke refresh tokens. Repo has `revokeFamily`/`revokeById` (`refresh-token.repository.ts:95,107`) but no revoke-all-for-user. Refresh TTL = 30 days (`auth.service.ts:15`); access JWT TTL = 8h. |

Net effect: a staff member who forgets their password, or a clinic that wants to rotate a doctor's credentials, has **no path at all** — not even via platform superadmin (that endpoint is clinic_admin-role-scoped, B-1).

### 4.2 TO-BE — two new clinic-plane capabilities

**B-1: Self-service change password**

- `POST /auth/change-password` — `authMiddleware` + `requirePlane('clinic')`. Body: `{ currentPassword, newPassword }` (zod `.strict()`, newPassword `min(8)` matching `createUserSchema`).
- Server verifies `currentPassword` with `bcrypt.compare` against the caller's own row (`userId`/`tenantId` from `req.context`, **never** from the body — there is no target-user parameter, so BOLA is structurally impossible).
- On success: hash with `config.bcryptRounds`, update, revoke all of the caller's refresh-token families (new repo fn, §4.3). Response 204; plaintext never logged/echoed.
- Wrong current password → 401 generic message (no oracle beyond what login already provides); apply `loginRateLimiter` or equivalent to resist online guessing (it is a password-verification oracle for an already-authenticated attacker holding a stolen session).

**B-2: Admin resets a user's password**

- `PATCH /users/:id/password` — `requirePlane('clinic')` + `requirePermission('staff.manage')`. Body: `{ newPassword }` (min 8). No current password required (that is the point of an admin reset).
- **BOLA-safe per ADR-0014 precedent:** `tenantId` comes from `req.context` only; repository performs a scoped `updateMany({ where: { id, tenantId } })` and 0 affected rows → 404 (cross-tenant = 404 per `anemal-db-context`).
- Revokes the target user's refresh-token families (§4.3).
- v1 keeps it minimal: admin types the new password (no server-side "generate + display once" — that pattern exists on the platform tab; clinic admin is talking to the staff member directly). Generate button = possible follow-up, not v1.
- Audit: clinic-plane `audit_logs` model exists (`schema.prisma:761`) but `user.service.ts` mutations do not currently write to it — for consistency, do **not** add a one-off audit write here; flag holistic clinic-audit coverage as existing debt (see Risks R-4).

**Explicitly NOT built:** unauthenticated "forgot password" (needs email/SMS dispatch — Phase 10/11). The recovery chain is: staff forgets → clinic_admin resets (B-2); clinic_admin forgets → another clinic_admin resets (pending Q-G1) or platform admin resets via the PR #23 tab. No dead ends.

### 4.3 Token invalidation decision

**Decision (recommended): any password change or reset revokes ALL refresh-token families for the affected user**, via a new `revokeAllForUser(userId)` in `refresh-token.repository.ts` (`updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } })`). Applied to: B-1, B-2, **and retrofitted into the existing platform reset** (`resetTenantAdminPassword`) — currently a 30-day-refresh-token hole after a platform reset.

**Accepted residual:** outstanding 8h access JWTs stay valid until expiry (no tokenVersion mechanism exists; `permSetVersion` only tracks role/permission changes). This matches the existing residual for user deactivation. Building immediate access-token invalidation is a cross-cutting feature, out of scope — confirm acceptability at grill (Q-G3).

---

## 5. Authorization Design (deny-by-default check)

| Route | Plane | Permission | New code? |
|---|---|---|---|
| `POST /auth/change-password` | clinic | authenticated-self (no permission code — same class as `GET /auth/me`; the route can only ever act on the caller's own row) | No |
| `PATCH /users/:id/password` | clinic | `staff.manage` (existing — already gates create-user-with-password, update, deactivate on `user.routes.ts:14-16`) | **No new code — recommended.** Alternative `staff.reset_password` rejected as custom-before-standard; a role trusted to create users with passwords and deactivate them is trusted to reset passwords. Revisit at grill if a view/reset split is wanted for custom roles. |
| `PATCH /platform/customers/:id/admin-users/:userId/password` | platform | `platform.customers.manage` (existing, unchanged) | No |
| Branch auto-create (Item A) | platform (provisioning) | covered by existing customer-create guard; no new route | No |

- **Zero new permission codes.** Deny-by-default holds: both new routes carry `requirePlane('clinic')` and either a permission guard or structural self-scoping.
- **Plane separation holds:** Item A widens the ADR-0015 provisioning write by one row (`branches` — operational config, not clinical/PII; written once at creation from server constants, no clinic-data read → within B-2 bound of ADR-0015). Item B is purely clinic-plane; platform endpoint untouched except token revocation. No plane fusion.
- **Matrix impact:** default grid unchanged (`staff.manage` = clinic_admin-only today; custom roles holding `staff.manage` gain reset — consistent with them already being able to create/deactivate users). `@pm-agent` to record the two new routes in `references/permission-matrix.md` route map.

## 6. Gap Analysis (AS-IS → TO-BE)

```
ID: PROV-1            Objective: platform-provisioned tenant operational from day one
AS-IS: createCustomer() creates Tenant + admin user, zero Branch rows; staff/doctor login 403s; branch-scoped modules contextless
Gap/Risk: every real Platform-Console tenant since PR #23 is broken   TO-BE: Main Branch created in same $transaction; backfill script for existing tenants
Priority: Must   Owner-agent: dev (+db for backfill)
Acceptance: createCustomer → tenant has exactly 1 active branch named 'Main Branch'; transaction rollback on branch-insert failure leaves no tenant; staff user created+assigned in new tenant can complete two-step login; backfill idempotent (2nd run inserts 0 rows)
```
```
ID: PWD-1             Objective: clinic user can change own password
AS-IS: no route; only recovery is platform reset, and only for clinic_admins
Gap/Risk: no credential hygiene; forgotten staff password = dead end   TO-BE: POST /auth/change-password, current password verified, refresh tokens revoked
Priority: Must   Owner-agent: dev
Acceptance: correct current pw → 204 + old refresh token rejected on /auth/refresh; wrong current pw → 401, hash unchanged; rate-limited; plaintext absent from logs; platform token → 403 (plane guard)
```
```
ID: PWD-2             Objective: clinic_admin resets staff/doctor password
AS-IS: updateUserSchema .strict() rejects password; no endpoint       Gap/Risk: admin cannot recover a locked-out staff member   TO-BE: PATCH /users/:id/password under staff.manage, tenant-scoped updateMany, 404 cross-tenant
Priority: Must   Owner-agent: dev (+qa BOLA/isolation tests)
Acceptance: same-tenant target → 204 + target's refresh tokens revoked; cross-tenant id → 404 (not 403); no staff.manage → 403; doctor/staff role token → 403; plaintext absent from logs
```
```
ID: PWD-3             Objective: password reset actually terminates stolen/old sessions
AS-IS: platform reset leaves 30-day refresh tokens valid              Gap/Risk: reset does not evict an attacker holding a refresh token   TO-BE: revokeAllForUser() on all three reset/change paths; 8h access-token residual documented
Priority: Must   Owner-agent: dev
Acceptance: after each of the 3 flows, pre-existing refresh token → 401 on /auth/refresh
```

## 7. Open Questions for /grill-with-docs (Step 3.5)

| # | Question | BA-recommended default (open, not decided) |
|---|---|---|
| **Q-G1** | Can a clinic_admin reset ANOTHER clinic_admin's password (same tenant), or only staff/doctor? | **Allow (default).** Consistency: `staff.manage` already lets a clinic_admin update/deactivate a peer admin via `PUT /users/:id` — restricting only the password field would be security theater; and the platform Clinic Admins tab is the backstop either way. Counter-argument to probe at grill: admin-vs-admin takeover inside a tenant (rogue admin resets peer, locks them out). If restricted, define the error (403 with role check) and note the asymmetry with PUT /users/:id. |
| **Q-G2** | Self-reset via B-2: may an admin call `PATCH /users/:id/password` on their own id (bypassing current-password check of B-1)? | Allow (it is not an escalation — they already hold the session), but grill should confirm; blocking it adds a special case with no security gain. |
| **Q-G3** | Is the 8h access-token residual after password reset acceptable (no tokenVersion infra)? | Accept for v1 — matches the existing deactivation residual; building JWT invalidation is a separate cross-cutting feature. |
| **Q-G4** | Backfill delivery: script vs Prisma migration; who runs it against Vercel/Neon prod? | Script under `src/backend/scripts/`, run as a release step; grill to confirm ops path for the Neon environment. |
| **Q-G5** | Rate-limiting scope for `POST /auth/change-password` | Reuse `loginRateLimiter`; grill to confirm keying (per-IP today) is adequate for an authenticated oracle. |

## 8. Risks

- **R-1 (High):** Plaintext password leakage into logs/errors on the two new endpoints. Mitigation: same QA check as PR #23 (never serialize body in errors/audit).
- **R-2 (Medium):** BOLA regression on `PATCH /users/:id/password`. Mitigation: ADR-0014 pattern (context-derived tenantId, scoped updateMany, 404 semantics) + @qa-agent isolation tests per qa-protocols.
- **R-3 (Low):** Backfill mis-scoped (creates duplicate branches or misses suspended tenants). Mitigation: guard on branch-count 0 regardless of `isActive`; idempotency acceptance test.
- **R-4 (Low, existing debt):** clinic-plane `audit_logs` unused by user-management mutations — password resets go unaudited on the clinic side. Not expanded here; recorded as follow-up backlog item.
- **R-5 (Low):** Retrofitting revocation into the platform reset changes behavior of a shipped endpoint (PR #23) — regression tests must be updated deliberately, not deleted.

## 9. NFR Impact

Negligible: one extra insert per tenant creation (rare); token revocation is a single indexed `updateMany`; bcrypt cost unchanged. No new dependencies, no schema migration except none at all for Item A/B (only the backfill data script) — `revokeAllForUser` uses existing columns.

## 10. BA Sign-off

**SIGN-OFF: APPROVED to proceed to /grill-with-docs (Step 3.5).** No blocking concerns. Conditions:

1. Q-G1 (admin-resets-admin) MUST be resolved at grill before /write-plan — it changes the B-2 controller logic.
2. Q-G3 (8h residual) must be explicitly accepted or scoped at grill.
3. Grill must confirm Item A's branch write sits inside the ADR-0015 plane-exception bounds (it does per this analysis — server-constant write, no clinic-data read — but the ADR's bounds are role-scoped to `users` writes, so the ADR wording should be extended to cover the provisioning-time `branches` write, or a one-line ADR amendment recorded via /domain-modeling at grill time).

Handoff: @pm-agent for task breakdown (Step 2 artifacts can be derived from §6 acceptance rows), then /grill-with-docs.

---

## 11. /grill-with-docs Resolution (Step 3.5 — 2026-07-15)

All five open questions resolved. None blocking.

| # | Resolution |
|---|---|
| **Q-G1** | **RESOLVED: Allow.** clinic_admin may reset another clinic_admin's password in the same tenant via `PATCH /users/:id/password`. Decision made by human (product owner), not defaulted — matches existing `PUT /users/:id` precedent (clinic_admin already updates/deactivates peer admins). Accepted residual risk: a rogue clinic_admin could lock out a peer admin; mitigation is the existing Platform Console Clinic Admins tab (PR #23) as backstop recovery path — no additional guard built for v1. |
| **Q-G2** | **RESOLVED: Allow** self-reset via B-2 (admin resets own password without current-password check). No special-case guard added — not a privilege escalation since the caller already holds an authenticated session. |
| **Q-G3** | **RESOLVED: Accept** the 8h access-JWT residual after password change/reset. Consistent with the existing deactivation residual (no `tokenVersion` infra exists). Documented as a known limitation, not a defect — no new work item. |
| **Q-G4** | **RESOLVED:** Backfill ships as a script under `src/backend/scripts/` (precedent: `create-platform-admin.ts`), run manually as a release step against the target environment (Neon prod) once, by whoever ships the branch. Idempotent — safe to re-run. Not wired into CI/deploy automation (out of scope, no infra for that exists yet). |
| **Q-G5** | **RESOLVED:** `POST /auth/change-password` reuses `loginRateLimiter` (per-IP keying), matching the existing login oracle's mitigation level. No new rate-limit infra. |

**ADR-0015 amendment note (per BA sign-off condition 3):** ADR-0015's plane-exception wording is scoped to `users` writes from the platform plane during tenant provisioning. This branch extends that exception by one row type: a single `branches` insert (server-constant `name: 'Main Branch'`, no clinic-data read) in the same transaction. Recorded as an ADR-0015 amendment (not a new ADR) — see `docs/adr/0015-platform-provisions-clinic-admin-identity.md` amendment appended during `/write-plan`/`@db-agent` review, and the domain glossary entry for "Main Branch auto-provisioning."

**GRILL SIGN-OFF: ALL FINDINGS RESOLVED. Cleared to proceed to /write-plan (Step 4).**
