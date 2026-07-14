# Task breakdown — Customer Onboarding: First Clinic-Admin User + Clinic Admins Tab (Step 2, @pm-agent)

Input: brainstorm doc `docs/superpowers/specs/2026-07-14-customer-onboarding-brainstorm.md`
(STATUS: STEP 1 APPROVED — Option D, §7 decisions Q1–Q10, §8 tab spec).

Actor/role applicable across all tasks: **Platform admin** (`platform_super_admin`,
`platform.customers.manage` — existing permission, reused; see CO-6 for the one open question on
whether a distinct code is warranted). Device = **Web** (Platform Console is desktop/web-only,
no tablet requirement — confirmed against `anemal-platform-console`).

---

## ⛔ BLOCKING — R-E must be resolved before /write-plan

**R-E (brainstorm §9, Q-3b in §7):** D-2-02 (`user.service.ts` line 51: "at least one contact
[email or phone] required") is a hard business rule on `User` creation. The auto-generated first
`clinic_admin` (username `admin`, name `"Administrator"`) has **neither** email nor phone by
default. This is a genuine rule conflict, not a UI detail — CO-1 below (extend `createCustomer()`)
cannot be implemented until one of these is chosen:

1. Relax D-2-02 specifically for platform-provisioned users (schema/service rule change — needs
   @ba-agent + @db-agent sign-off, since D-2-02 is an existing documented business rule).
2. Use a placeholder value (e.g., a synthetic non-deliverable email) — needs a decision on the
   placeholder's exact form and whether it's mutable later, and whether it trips any uniqueness
   constraint (`User.email` uniqueness scope must be checked).
3. Require the platform admin to supply email/phone at tenant-creation time after all — this
   reopens Q-3 (brainstorm decided **no** new create-customer form fields) and would need
   re-confirmation from the human who signed off on Option D.

**This is called out here, not resolved.** No task below invents an answer. CO-1 is written with
a placeholder `«R-E-DECISION»` marker in its acceptance criteria for the exact contact-field
handling — /grill-with-docs must close this (brainstorm §10 already names R-E as a mandatory grill
probe) and the resolution must be written back into this file (or a superseding revision) before
`/write-plan` runs. Per CLAUDE.md, `/write-plan` is blocked on `/grill-with-docs` regardless, so
this is a natural gate — but flagging explicitly per instruction: **do not let CO-1 proceed to
`/write-plan` with R-E unresolved even if grill covers other topics first.**

---

## Backend tasks

### Task CO-1 — Auto-create first `clinic_admin` in `createCustomer()` transaction

Actor/role: Platform admin (`platform.customers.manage`)   Device: Web

Description: In `src/backend/services/platform-customers.service.ts`, wrap the existing tenant
insert plus a new `User` + `UserRole` insert in a single `prisma.$transaction`. New user:
`tenantId` = the tenant just created (never from request input, R-1), `username = 'admin'`,
`name = 'Administrator'`, `role = 'admin'` (legacy enum) resolved to system role `clinic_admin`
via the existing `LEGACY_ROLE_TO_SYSTEM_KEY` / `roleRepo.findSystemRoleByKey('clinic_admin')` path
(reused from `user.service.ts`, R-2), `passwordHash = bcrypt.hash(generated, config.bcryptRounds)`
using the CO-3 password generator. `user_roles.tenantId` denormalized to the new tenant (R-3, via
`userRepo.createUserWithRole`). Skip `subscriptionService.assertCanAddUser` for this specific
auto-create call (Q-5 — first admin exempt). Audit log write (`customer.create`, gains
`adminUserId` detail, **no password**, Q-7) happens after commit, unchanged plane guard (R-4,
unchanged route middleware).

Acceptance Criteria:
- [ ] Tenant + User + UserRole all insert inside one `prisma.$transaction`; any failure (e.g.
      simulated bcrypt/DB error on the user insert) rolls back the tenant row too — no orphan
      tenant-without-admin state is reachable (test: force the user insert to throw, assert
      `prisma.tenant.findUnique` returns null after).
- [ ] New user's `tenantId` is read from the transaction's own tenant-creation result, never
      echoed from caller input (R-1) — no `tenantId` field exists on `CreateCustomerInput`.
- [ ] Role resolves to the seeded system `clinic_admin` row (`roles.key = 'clinic_admin'`,
      `tenantId = NULL`, `isSystem = true`); no new `roles` row is created by this task.
- [ ] `user_roles.tenantId` = new tenant id (R-3).
- [ ] `«R-E-DECISION»` — contact field (email/phone) handling per the resolved R-E answer;
      placeholder until grill closes R-E.
- [ ] `assertCanAddUser` is NOT called for this auto-create path (Q-5); a tenant on a
      zero-seat/trial plan still gets its first admin created successfully.
- [ ] `platform_audit_logs` gains one `customer.create` entry with `details.adminUserId` set to
      the new user's id; `details` contains no password field, no `passwordHash` field (R-6).
- [ ] Existing `createCustomer()` callers/tests that assert on `CreateCustomerInput` shape and the
      pre-existing `customer.create` audit fields (`name`, `subdomain`, `planId`) still pass
      unmodified in behavior aside from the added `adminUserId` detail.
- [ ] Negative/authorization case: a request without `platform.customers.manage` (existing
      middleware, unchanged) is rejected 403 before reaching this code path — confirmed by
      existing route-guard test, not new middleware.

Permission(s): `platform.customers.manage` (existing, unchanged)
Dependencies: R-E resolution (blocking, see above), CO-3 (password generator)

---

### Task CO-2 — `POST /platform/customers/:id/admin-users` (create additional clinic_admin)

Actor/role: Platform admin (`platform.customers.manage`)   Device: Web

Description: New route + controller + service function `createTenantAdminUser(tenantId, data,
performedById)` scoped to an existing tenant (path param `:id`, tenant looked up first —
`CustomerNotFoundError` if missing, mirrors `getCustomer`/`updateCustomer` pattern). Accepts
`{ name, username, email?, phone?, password? }` — D-2-02 enforced (email OR phone required, same
rule as `user.service.ts`), password optional: if omitted, server generates one (CO-3); if
provided, hash it directly (Q-10). Creates `User` + `UserRole(clinic_admin)` for the target
tenant only (Q-8 — role is always `clinic_admin`, no role param accepted). Runs
`subscriptionService.assertCanAddUser(tenantId)` (Q-5 — counts against quota, unlike CO-1).
Writes `tenant.admin_user.create` audit entry (Q-7), response includes the plaintext password
**only when server-generated or when the platform admin typed one and the response echoes it
back per Q-10** — never persisted or logged.

Acceptance Criteria:
- [ ] Route mounted in `src/backend/routes/platform-customers.routes.ts` as
      `POST /:id/admin-users`, guarded by `authMiddleware, requirePlane('platform')` (existing
      router-level `.use`) and `requirePlatformPermission('platform.customers.manage')` (reuses
      existing code per brainstorm §4 R-7 recommendation — no new permission code added by this
      task; CO-6 tracks the open question of whether a distinct code is warranted later).
- [ ] Request validated via a Zod schema (matches repo convention — see
      `createCustomerSchema`/`setQuotaSchema` in the same routes file) requiring `name`,
      `username`, and at least one of `email`/`phone` (422 `VALIDATION_ERROR` style, matching
      existing `validate.middleware` behavior) — mirrors D-2-02 exactly.
- [ ] 404 `CUSTOMER_NOT_FOUND` when `:id` does not match an existing tenant.
- [ ] Created user's `tenantId` = `:id` from the path, never from body (BOLA guard, consistent
      with PR #20's hospitalization branch-isolation precedent).
- [ ] Role is always the seeded `clinic_admin` system role — no `role`/`roleId` field is accepted
      in the request body at all (Q-8).
- [ ] `assertCanAddUser(tenantId)` runs and returns `409 QUOTA_EXCEEDED` (existing error) when the
      tenant is at its user cap — test: seed a tenant at `maxUsers`, assert 409, assert no `User`
      row was created.
- [ ] Password: if `password` omitted in body, CO-3's generator produces one; if provided,
      it is hashed as typed (Q-10); response body includes the plaintext exactly once under a
      field that is NOT `passwordHash` (e.g. `generatedPassword` or `password`), and this field
      is absent from `platform_audit_logs.details` (R-6, R-A).
- [ ] `tenant.admin_user.create` audit entry written with `targetTenantId`, `performedByPlatformUserId`,
      and `details` containing at minimum the new user's id/username — no password (Q-7).
- [ ] Duplicate `username` within the same tenant → 409 (existing P2002 handling pattern from
      `user.service.ts` reused), not a 500.
- [ ] Negative/authorization case: request from a platform user lacking `platform.customers.manage`
      is rejected 403; request bearing a **clinic-plane** JWT (wrong plane) is rejected by
      `requirePlane('platform')` before reaching the handler.

Permission(s): `platform.customers.manage` (existing, unchanged)
Dependencies: CO-3

---

### Task CO-3 — Password generator + shared reset/create hashing helper

Actor/role: N/A (infra task, no user-facing behavior change)   Device: N/A

Description: Add `generateSecurePassword(): string` (16-char crypto-random from an unambiguous
alphanumeric-plus-symbols alphabet excluding `0/O`, `1/l/I`, per brainstorm §3.4/Q-1) in a shared
location (e.g. `src/backend/utils/password.ts` — new file, or co-located with the existing
`create-platform-admin.ts` script's generation logic if it already has one; check for reuse
before adding a second implementation). Used by CO-1, CO-2, and CO-5 (reset).

Acceptance Criteria:
- [ ] `generateSecurePassword()` returns a 16-character string built from `crypto.randomBytes`
      (not `Math.random`), alphabet excludes `0`, `O`, `1`, `l`, `I`.
- [ ] Uniqueness/randomness sanity test: 1000 generated passwords contain no duplicates (test,
      not a security proof, but catches a broken RNG wiring).
- [ ] If `src/backend/scripts/create-platform-admin.ts` already implements equivalent logic,
      this task refactors it to import the shared helper instead of keeping two implementations
      (grep for a second `randomBytes`-based password generator after this task returns nothing
      new) — otherwise this is the first implementation and the script is left as a candidate for
      a follow-up refactor (note in PR description, not blocking).
- [ ] Hashing convention confirmed: all three call sites (CO-1, CO-2, CO-5) hash with
      `bcrypt.hash(password, config.bcryptRounds)` — no call site hardcodes a cost factor.

Permission(s): none
Dependencies: none

---

### Task CO-4 — `PATCH /platform/customers/:id/admin-users/:userId/deactivate`

Actor/role: Platform admin (`platform.customers.manage`)   Device: Web

Description: New route + controller + service function `deactivateTenantAdminUser(tenantId,
userId, performedById)`. Sets `User.isActive = false` (soft delete, Q-9) scoped to `tenantId`
(BOLA guard — `userId` alone is not trusted). Only operates on users holding the `clinic_admin`
role for that tenant (Q-8 scope — reject if the target user is not a clinic_admin of this tenant,
so the tab cannot be used to deactivate arbitrary users). Writes `tenant.admin_user.deactivate`
audit entry (Q-7). No reactivate endpoint in this task (Q-9 — flagged as a follow-up, not built
here; if grill decides reactivate is in scope, that is a new task, not a silent addition here).

Acceptance Criteria:
- [ ] Route: `PATCH /:id/admin-users/:userId/deactivate`, same permission guard as CO-2.
- [ ] Sets `isActive = false` on the target user scoped by both `tenantId` AND `userId` in the
      same query (single WHERE clause, not two round-trips that could race) — a `userId` that
      exists but belongs to a different tenant returns 404, not a cross-tenant mutation (BOLA
      test, matches PR #20 precedent).
- [ ] 404 when the target user does not hold the `clinic_admin` role for this tenant (Q-8 — e.g.
      attempting to deactivate a `doctor`/`clinic_staff` user via this endpoint is rejected; this
      endpoint is admin-user-scoped only).
- [ ] Idempotency: deactivating an already-inactive user either succeeds as a no-op or returns a
      defined error — pick one and assert it (no undefined 500).
- [ ] `tenant.admin_user.deactivate` audit entry written with `targetTenantId`, `userId`,
      `performedByPlatformUserId` (Q-7).
- [ ] Negative/authorization case: missing `platform.customers.manage` → 403; wrong plane → 403
      (same guard pattern as CO-2).

Permission(s): `platform.customers.manage` (existing, unchanged)
Dependencies: CO-2 (reuses its tenant/role-scoping logic)

---

### Task CO-5 — `PATCH /platform/customers/:id/admin-users/:userId/password`

Actor/role: Platform admin (`platform.customers.manage`)   Device: Web

Description: New route + controller + service function `resetTenantAdminUserPassword(tenantId,
userId, newPassword?, performedById)`. Same tenant/role scoping as CO-4. Accepts optional
`password` in body — typed (re-hash as given) or omitted (CO-3 generates one), matching Q-10.
Response includes the plaintext once (same display-once contract as CO-2's create response).
Writes `tenant.admin_user.password_reset` audit entry with **no password in details** (Q-7, R-6).

Acceptance Criteria:
- [ ] Route: `PATCH /:id/admin-users/:userId/password`, same permission guard as CO-2/CO-4.
- [ ] Same tenant+userId scoping and clinic_admin-role restriction as CO-4 (404 on mismatch).
- [ ] Typed password path: body `password` is hashed with `bcrypt`/`config.bcryptRounds` and
      persisted; response echoes it back once (Q-10 — "typed: echo back is optional" per
      brainstorm, this task's implementation choice: echo back for UI consistency with the
      generated path — confirm with @uiux-agent at Step 6, not a blocking decision here).
- [ ] Generated path (`password` omitted): CO-3's generator produces a new password, hashed and
      persisted, returned once in the response.
- [ ] `tenant.admin_user.password_reset` audit entry contains no password/passwordHash field
      anywhere in `details` (R-6, R-A — explicit QA check required per brainstorm §9).
- [ ] Negative/authorization case: same as CO-4.

Permission(s): `platform.customers.manage` (existing, unchanged)
Dependencies: CO-3, CO-4 (scoping logic)

---

### Task CO-6 — `GET /platform/customers/:id/admin-users` (list)

Actor/role: Platform admin (`platform.customers.view` — read-only, distinct from the `.manage`
guard on the write endpoints above, matching the existing view/manage split on this router)
Device: Web

Description: New route + controller + service function `listTenantAdminUsers(tenantId)` — returns
`clinic_admin`-role users for the tenant only (Q-8), never the full user list (no doctor/staff
rows leak through this endpoint). Fields: `id, username, name, email, phone, isActive, createdAt`
— never `passwordHash`.

Acceptance Criteria:
- [ ] Route: `GET /:id/admin-users`, guarded by `requirePlatformPermission('platform.customers.view')`
      (read-only guard, matching the `GET /:id` and `GET /:id/quota` convention in the same
      router file).
- [ ] Response contains only users holding the `clinic_admin` role for `tenantId` — a tenant with
      a mix of clinic_admin/doctor/staff users returns only the clinic_admin rows (test with
      seeded mixed-role tenant).
- [ ] `passwordHash` never appears in the response (use the existing `safe()`-style stripping
      pattern from `user.service.ts`).
- [ ] Empty list (not 404) for a tenant with zero clinic_admin users (should not happen after
      CO-1 ships, but must not error for pre-existing/backfill tenants per Q-6).
- [ ] Negative/authorization case: missing `platform.customers.view` → 403; wrong plane → 403.
- [ ] **Open item flagged for /grill-with-docs (brainstorm §4 R-7):** whether a distinct
      `platform.customers.create_admin_user` / `.manage_admin_user` permission code should replace
      reuse of `platform.customers.manage`/`.view` for auditability. This task builds on the
      existing codes; a permission-code split is a follow-up if grill decides it's warranted —
      not built speculatively here (Ponytail Gate criterion 1/4).

Permission(s): `platform.customers.view` (existing, unchanged)
Dependencies: none (can build in parallel with CO-1–CO-5)

---

## Frontend tasks

### Task CO-7 — "Clinic Admins" tab shell on `CustomerDetailView`

Actor/role: Platform admin   Device: Web

Description: Add a 5th tab (`{ id: 'admins', label: 'Clinic Admins' }`) to the existing 4-tab
array in `src/frontend/src/views/platform/CustomerDetailView.tsx` (alongside Overview/Plan &
Quota/Provisioning/Usage). New `ClinicAdminsTab({ id }: { id: number })` component, list-only in
this task (create/deactivate/reset are CO-8/CO-9/CO-10) — fetches CO-6's `GET
/:id/admin-users` via a new `usePlatformCustomerAdminUsers(id)` React Query hook, renders a table
(username, name, email/phone, status badge active/deactivated, created date) matching the visual
pattern of `UsageTab`/existing platform tables.

Acceptance Criteria:
- [ ] Tab appears in the tab bar in the correct position, keyboard/tap accessible, follows the
      existing `tabClass(t.id)` active-state pattern.
- [ ] Table renders all clinic_admin users for the tenant with the 5 listed columns; empty state
      shown (not a blank table) when zero rows.
- [ ] Loading and error states follow the existing `isLoading`/`isError` pattern used by
      `UsageTab`.
- [ ] No Compassionate Care design-token violations (no raw hex, Material Symbols only, existing
      Tailwind scale) — reviewed by @uiux-agent at Step 6.
- [ ] Negative/authorization case: a platform user without `platform.customers.view` never
      reaches `CustomerDetailView` at all (existing route guard, unchanged) — confirmed by
      inspection, not new middleware.

Permission(s): `platform.customers.view` (existing, unchanged)
Dependencies: CO-6

---

### Task CO-8 — Create clinic_admin form (typed-or-generated password)

Actor/role: Platform admin   Device: Web

Description: "Create" button/modal on the Clinic Admins tab — fields: name, username,
email-or-phone (client mirrors D-2-02: at least one required, server is the authority), password
(toggle between "type it" input and "generate" button per Q-10). Submits to CO-2. On success,
shows a display-once panel (copy button, "will not be shown again" warning per brainstorm §3.5)
with username + password — dismissing it does not re-fetch it (truly one-time).

Acceptance Criteria:
- [ ] Form client-side validates at least one of email/phone before submit (matches D-2-02); server
      422 is still the authority (client validation is UX only, not trusted).
- [ ] "Generate" button fills a read-only password preview (or leaves it server-side — pick one
      approach and document); typed path lets the platform admin enter their own password.
- [ ] On success: table re-fetches (via query invalidation) and a display-once credentials panel
      shows username + password with a copy-to-clipboard control and the one-time warning copy.
- [ ] On 409 `QUOTA_EXCEEDED`: inline error shown, form stays open with entered values intact
      (matches the `AdmitModal`/`EditModal` inline-error pattern used elsewhere in the repo, e.g.
      `ClinicInpatient.tsx`).
- [ ] On 409 duplicate-username: inline error shown, distinguishable from the quota error.
- [ ] All interactive controls ≥44×44px (Compassionate Care touch-target rule, applies even on
      Web per house convention) — reviewed by @uiux-agent.
- [ ] Negative/authorization case: same route-guard inspection as CO-7 (no new client-side
      permission logic needed — server enforces).

Permission(s): `platform.customers.manage` (existing, unchanged)
Dependencies: CO-2, CO-7

---

### Task CO-9 — Deactivate action + confirmation dialog

Actor/role: Platform admin   Device: Web

Description: Per-row "Deactivate" action on the Clinic Admins tab table, gated to active rows
only (deactivated rows show a disabled/absent action). Confirmation dialog before calling CO-4
(brainstorm Q-9 — "irreversible-feeling action from platform UI even though it's a soft delete").

Acceptance Criteria:
- [ ] Deactivate action only rendered/enabled for rows with `isActive = true`.
- [ ] Confirmation dialog requires explicit confirm before the API call fires — accidental
      single-click cannot deactivate.
- [ ] On success: row status badge updates to "deactivated" (via query invalidation, not manual
      row mutation) without a full page reload.
- [ ] On error: inline/toast error shown, row state unchanged.
- [ ] Negative/authorization case: same guard inspection pattern as CO-8.

Permission(s): `platform.customers.manage` (existing, unchanged)
Dependencies: CO-4, CO-7

---

### Task CO-10 — Reset password action (typed-or-generated)

Actor/role: Platform admin   Device: Web

Description: Per-row "Reset password" action opens the same typed-or-generate control used in
CO-8's create form (reuse the sub-component, not a second implementation — Ponytail Gate
criterion 2), calls CO-5, shows the display-once credentials panel on success.

Acceptance Criteria:
- [ ] Reset control is a reused component/hook from CO-8 (grep confirms no second
      typed-or-generate password UI implementation exists after this task).
- [ ] On success: display-once panel shows the new password with the same one-time warning copy
      as CO-8; no re-fetchable persistence of the plaintext anywhere in frontend state after the
      panel is dismissed (verify no plaintext lingers in a Zustand store or React Query cache
      beyond the initial response).
- [ ] On error: inline error, panel does not appear.
- [ ] Reset is available for both active and deactivated clinic_admin rows (a deactivated admin
      can still have its password reset — brainstorm does not restrict this to active-only; if
      grill decides otherwise, that is a plan-time correction, not assumed here).
- [ ] Negative/authorization case: same guard inspection pattern as CO-8.

Permission(s): `platform.customers.manage` (existing, unchanged)
Dependencies: CO-5, CO-7, CO-8 (reused sub-component)

---

## Ponytail Gate pre-check (informational, not a substitute for @ponytail-agent's Step 5 review)

- **Files touched (est.):** `platform-customers.service.ts`, `platform-customers.routes.ts`,
  `platform-customers.controller.ts` (extend), 1 new util (`utils/password.ts`), 1 new
  `platform-customers.repository.ts` extension or new admin-users repository module,
  `CustomerDetailView.tsx` (extend), 2-3 new frontend components (tab, create form, reused
  password-input), 1 new hook file (`usePlatformCustomerAdminUsers` + mutations) — **est.
  10-13 files**, under the >15-file Ponytail threshold but close; @db-agent should confirm at
  Step 6 whether a separate repository module is warranted or whether extending the existing one
  keeps file count down.
- **New endpoints:** 4 (CO-2 create, CO-4 deactivate, CO-5 reset, CO-6 list) — **over the >3-new-API
  Ponytail threshold (criterion 7).** This is flagged now so `/write-plan` and
  `@ponytail-agent` go in with eyes open; the brainstorm's Option D scope (full CRUD tab) is what
  drives this, not speculative building — the four endpoints map 1:1 to the four Q-7/§8 tab
  operations (list/create/deactivate/reset), none are extra. `@ponytail-agent` should evaluate
  whether this is justified scope vs. a signal to split the tab into a smaller v1 (e.g., create +
  list only, defer deactivate/reset to a follow-up) — that judgment call belongs to Step 5, not
  pre-empted here.
- **Subsystems touched:** Platform Console backend (routes/controller/service/repo), Platform
  Console frontend (view/components/hooks), shared password utility — **3 subsystems**, at the
  >3-subsystem threshold boundary; worth a explicit ponytail look.
- No new third-party dependencies (crypto/bcrypt already in use). No schema/migration required
  (existing `User`/`UserRole`/`platform_audit_logs` tables cover this — @db-agent to confirm no
  migration needed, R-E resolution pending may change this if a placeholder-email approach needs
  a schema note, e.g. nullable-email confirmation).

---

## Handoff

@ba-agent (Step 3): validate this breakdown, in particular close **R-E** (blocking) and confirm
R-B (plane-separation bound — brainstorm §9 flags platform writing to `users` on an ongoing basis,
not just at creation, as needing explicit blessing).
@db-agent: confirm no migration is needed for CO-1–CO-6 (reuses existing `User`/`UserRole`/
`platform_audit_logs` tables); review tenant-scoping on CO-2/CO-4/CO-5/CO-6 for BOLA safety
(pattern per PR #20 precedent).
@uiux-agent: design CO-7–CO-10 tab/forms for Compassionate Care token compliance, touch targets,
and the display-once credentials panel copy/interaction (Step 6∥).
/grill-with-docs (Step 3.5, MANDATORY): must specifically probe R-E (blocking), R-B, Q-3b
editability of "Administrator" name, Q-9 reactivate scope, and the Ponytail 4-endpoint flag above.
@dev-agent: implements CO-1–CO-10 task-by-task with TDD per `/execute-plan`, after Ponytail Gate
(Step 5) approval.
@qa-agent: verifies R-6/R-A (no plaintext password ever logged/audited) across all three password
paths (CO-1 auto-create, CO-2 create, CO-5 reset), BOLA scoping on CO-4/CO-5 (cross-tenant
userId probe), and Q-8 role-scope enforcement (deactivate/reset rejected for non-clinic_admin
users) — Step 7.
