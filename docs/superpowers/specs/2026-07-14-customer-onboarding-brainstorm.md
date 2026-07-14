# Brainstorm — Customer Onboarding: First Clinic-Admin User at Tenant Creation

- **Document type:** Step-1 Brainstorm (pre-plan, pre-code)
- **Author:** @ba-agent (unattended scheduled run, 2026-07-14)
- **Pipeline position:** Step 1 of the Standard Pipeline (CLAUDE.md). Requires human sign-off before Step 2 (@pm-agent task breakdown) and before /grill-with-docs.
- **Related spec:** `.claude/specs/RBAC_Platform_Restructure_Spec.md` (SPEC-RBAC-PLATFORM-01)
- **Related skills:** `anemal-platform-console`, `anemal-rbac-matrix`, `anemal-ba-toolkit`

---

## 1. Business Objective

When a platform admin provisions a new customer (tenant), the customer must be able to log in immediately. Today the platform creates only the tenant shell — no clinic-side user exists, so a freshly onboarded clinic has **zero way to authenticate**. The objective is to close this onboarding gap by creating the tenant's first `clinic_admin` user as part of customer creation.

**Value:** Onboarding becomes self-contained (one action, one screen) instead of requiring manual DB intervention or an out-of-band script.

---

## 2. AS-IS (confirmed by code reading)

### 2.1 Backend

`createCustomer()` in `src/backend/services/platform-customers.service.ts` (line 172):

1. Validates subdomain uniqueness (`SubdomainConflictError` on conflict).
2. Validates optional `companyTypeId` (D-2-06).
3. Inserts one `Tenant` row via `customersRepo.createTenant()` with `name`, `subdomain`, `planId`, `companyTypeId`.
4. Writes a `platform_audit_logs` entry (`action: 'customer.create'`).

**No clinic user, no password, no role assignment is created.** `CreateCustomerInput` contains only `name`, `subdomain`, `planId?`, `companyTypeId?`.

### 2.2 Frontend

`src/frontend/src/views/platform/CustomerListView.tsx` — `/platform/customers` renders a table of tenants with an inline "Add Customer" modal (`PlatformModal`). Form state (`CreateCustomerPayload`) holds exactly `name`, `subdomain`, `planId`. Submit calls `useCreatePlatformCustomer()`. Subdomain input lowercases and strips whitespace on change.

### 2.3 Existing clinic-user creation machinery (reusable)

`createUser()` in `src/backend/services/user.service.ts` (line 49) is the canonical clinic-plane staff-creation flow:

- Requires at least one contact channel (email OR phone) — rule D-2-02.
- Requires `username` (unique per `(tenantId, username)`, `User.email` is nullable).
- Maps legacy role string `admin` → system role key `clinic_admin` via `LEGACY_ROLE_TO_SYSTEM_KEY`, resolves the seeded system role row with `roleRepo.findSystemRoleByKey('clinic_admin')` (system roles live in `roles` with `tenantId = NULL`, `isSystem = true`).
- Hashes with `bcrypt.hash(password, config.bcryptRounds)` (the platform-admin script `src/backend/scripts/create-platform-admin.ts` uses cost 12 — same convention).
- Calls `userRepo.createUserWithRole(tenantId, data, roleId)` which creates the `users` row plus the `user_roles` join row (with denormalized `tenantId` for isolation).
- Checks quota via `subscriptionService.assertCanAddUser(tenantId)` — irrelevant edge for a brand-new tenant (0 users) but should be kept consistent.

### 2.4 Prisma models (confirmed)

- `User` (`users`): `tenantId` (required), `name`, `username` (VarChar 20, unique per tenant), `email?`, `phone?`, `passwordHash`, `role` (LegacyRole enum: `admin|doctor|staff` — still required), `roleId?`, `isActive`, ... **There is NO `mustChangePassword` / `forcePasswordChange` field.** A forced-password-change mechanism does not exist anywhere in the codebase today.
- `ClinicRole` (`roles`): system role `clinic_admin` seeded with `tenantId = NULL`, `isSystem = true`.
- `UserRole` (`user_roles`): `(userId, roleId, tenantId)` — tenantId denormalized for isolation.

---

## 3. TO-BE (proposed)

### 3.1 Flow

Platform admin opens "Add Customer" modal → fills tenant fields **plus new admin-user fields** → submits → backend creates, **in one DB transaction**:

1. `Tenant` row (as today).
2. `User` row: `tenantId = <new tenant id>`, `role = 'admin'` (legacy enum), `passwordHash = bcrypt(generatedPassword, config.bcryptRounds)`.
3. `UserRole` row linking the user to the seeded system `clinic_admin` role (`tenantId` denormalized to the new tenant).

Then (outside the transaction): `platform_audit_logs` entry, and the API response returns the generated password **once** for display in the platform UI.

### 3.2 Proposed new form fields (pending human decision — see §7)

| Field | Required? | Notes |
|---|---|---|
| Admin name | Yes (proposed) | `User.name` is required in schema; also used for greeting/audit. Could default to "Administrator" but an explicit field is cheap and better. |
| Admin username | Yes (proposed) | `User.username` is required and is the login identifier (D-1 username login). Could be auto-derived (e.g. `admin`) — safe because uniqueness is per-tenant. Recommend defaulting to `admin` with an editable field. |
| Admin email | Yes (proposed) | Satisfies D-2-02 (email OR phone required). Email preferred: it is the future credential-delivery channel when Phase 10/11 dispatch lands. |
| Password | No input | Auto-generated server-side; never typed by the platform admin (avoids weak/shared passwords and keeps the platform admin from choosing customer credentials). |

### 3.3 Backend API change

Extend `CreateCustomerInput` / `POST /platform/customers` payload with `adminName`, `adminUsername`, `adminEmail`. Response gains a one-time `adminInitialPassword` field (returned exactly once, never persisted in plaintext, never logged — the audit-log `details` must NOT contain it).

### 3.4 Password generation (proposal — SECURITY-RELEVANT, needs explicit human confirmation)

- `crypto.randomBytes` → 16-character string from an unambiguous alphanumeric-plus-symbols alphabet (exclude `0/O`, `1/l/I`).
- Hash with `bcrypt`, cost from `config.bcryptRounds` (matches existing convention; the platform-admin script uses cost 12).
- Plaintext exists only in the HTTP response of the create call; it is not stored, not audited, not logged.

**This is flagged, not decided.** Credential-handling policy must not be silently chosen by an unattended run. See §7.

### 3.5 Credential delivery (proposal — needs explicit human confirmation)

Recommended default: **display-once in the platform UI** (AWS/GitHub token pattern) — a success panel in the modal showing username + generated password with a copy button and a "this will not be shown again" warning.

- Email delivery is explicitly **out of scope for now**: Phase 10/11 (SMTP/LINE/SMS dispatch) is ⏸ "needs credentials" per CLAUDE.md. Do not assume it.
- "Must change password on first login": **no such mechanism exists** in the `User` model or auth flow. Adding one (schema field + login-flow interception + change-password screen enforcement) is a non-trivial scope expansion. Recommend deferring, but this is a human call. See §7.

---

## 4. RBAC / Tenant-Correctness Requirements

| # | Rule | Enforcement point |
|---|---|---|
| R-1 | New user's `tenantId` = the tenant created in the same transaction; never any other value. | Service constructs it from the just-created tenant row, not from request input. |
| R-2 | Role assigned = seeded system `clinic_admin` (`roles.key = 'clinic_admin'`, `tenantId NULL`, `isSystem = true`), resolved via `roleRepo.findSystemRoleByKey` — no new role rows created. | Reuse `LEGACY_ROLE_TO_SYSTEM_KEY` path from `user.service.ts`. |
| R-3 | `user_roles.tenantId` = new tenant id (denormalized isolation column). | `userRepo.createUserWithRole` already does this — reuse it. |
| R-4 | The endpoint stays platform-plane: `requirePlane('platform')` + existing platform permission guard on `/platform/customers` (unchanged). | Route middleware (already in place). |
| R-5 | Plane separation: this is a **provisioning** write — the platform plane creates a clinic identity record but never reads clinic clinical/PII data. The admin email/name entered here originates from the platform admin, not from clinic data, so no cross-plane read occurs. Flag for /grill-with-docs review anyway, since "platform never touches PII" is an absolute rule and this write touches the `users` table. | Design review (Step 3.5). |
| R-6 | Plaintext password never appears in `platform_audit_logs.details`, server logs, or error messages. | Code review + QA check. |
| R-7 | Deny-by-default unchanged: no new permission codes are strictly required (the action is already covered by the existing customer-create platform permission), but /grill should confirm whether a distinct `platform.customers.create_admin_user` code is warranted for auditability. | RBAC matrix review. |

---

## 5. Transactional Integrity

**Problem:** If tenant creation succeeds but user creation fails (e.g. bcrypt error, DB hiccup, unique violation), we get today's broken state — an orphan tenant with no login — plus a confusing partial-success UX.

**Recommendation:** Wrap tenant insert + user insert + user_roles insert in a single `prisma.$transaction`. All-or-nothing: any failure rolls back the tenant too, and the API returns one clear error. The audit-log write stays outside the transaction (audit failure should not roll back provisioning — consistent with current behavior) but must run only after commit.

Edge cases for /grill-with-docs:

- Username collision inside a brand-new tenant is impossible (first user), so P2002 on username should never fire — but email-uniqueness is enforced in the service layer per-tenant; confirm behavior.
- `assertCanAddUser` quota check: a new tenant with a plan allowing 0 users would block its own first admin — decide whether provisioning bypasses the quota check (recommended: yes, first admin is exempt, or simply skip the check since count is 0 < any positive max).
- What happens to existing tenants already created without an admin user (backfill)? Out of scope here, but note as a follow-up question.

---

## 6. Solution Options Considered

**Option A — Extend create-customer flow only.** One modal, one API call, one transaction. Closes onboarding gap but no ongoing management surface — any password reset or added admin needs a script.

**Option B — Separate "Provision admin user" single action on CustomerDetailView.** Keeps create-customer unchanged; usable for backfilling. Two-step onboarding, no edit/deactivate/reset surface.

**Option C — Emailed invite link.** Requires email dispatch (Phase 10/11, blocked on credentials) and an invite/token subsystem that doesn't exist. **Not viable now.**

**Option D — Selected (2026-07-14, human sign-off in chat).** Extend create-customer to auto-create the first `clinic_admin` (transaction, Option A's mechanics) **plus** add a new "Clinic Admins" tab on `CustomerDetailView` giving the platform admin ongoing CRUD over clinic_admin users for that tenant: create additional clinic_admin users, deactivate, and set/reset password (typed or generated) at any time. Subsumes B (tab handles backfill for existing admin-less tenants — no separate migration/script needed) and closes the "password lost before handoff" gap (R-D) since the platform admin can just reset it from the tab.

---

## 7. Decisions (resolved 2026-07-14, human sign-off in chat)

| # | Question | **Decision** |
|---|---|---|
| Q-1 | Password generation policy | 16-char crypto-random (unambiguous alphabet), bcrypt `config.bcryptRounds`. Applies to both initial auto-create and any later "generate" action in the tab. |
| Q-2 | Credential delivery | Display-once in platform UI. For initial creation: shown in the new **Clinic Admins tab**, not the create-customer response/modal (create-customer flow stays a plain success, admin then opens the tab to see the generated credentials). For password reset: same display-once pattern. |
| Q-3 | Create-customer form fields | Tenant fields only (name/subdomain/planId/companyTypeId) — **unchanged**. No admin-name/username/email fields added to the create-customer modal. The first clinic_admin is auto-generated server-side (see Q-3b) and surfaced in the tab, not entered by the platform admin at tenant-creation time. |
| Q-3b | Auto-generated first-admin identity | Username: `admin` (per-tenant unique, safe as first user). Name: `"Administrator"` (editable later in the tab? — edit scope TBD at plan time, deactivate/reset are confirmed, rename not explicitly requested — default to not-editable for v1, flag at grill). Email: none by default (D-2-02 requires email OR phone; **need a placeholder or make email/phone optional at auto-create time** — flag for /grill-with-docs, this is a schema-rule interaction, not a UI decision). |
| Q-4 | Forced password change on first login | Deferred — not requested, no schema field exists. Not in this scope. |
| Q-5 | Quota (`assertCanAddUser`) for admin creation | First auto-created admin is exempt (count is 0, always passes in practice, but the transaction should not hard-block on quota=0 edge case). Additional clinic_admin users created via the tab **do** count against the tenant's user quota — normal `assertCanAddUser` check applies. |
| Q-6 | Backfill for existing admin-less tenants | Solved by the tab: platform admin opens Clinic Admins tab on any existing tenant, uses "Create" to add a clinic_admin. No migration/backfill script needed. |
| Q-7 | Audit logging | `customer.create` audit entry gains `adminUserId` detail (no password). New platform-audit actions for tab operations: `tenant.admin_user.create`, `tenant.admin_user.deactivate`, `tenant.admin_user.password_reset` — **never** log the plaintext password in any of them. |
| Q-8 (new) | Tab scope — role assignable | **clinic_admin only.** Platform never assigns/manages other clinic roles (doctor/staff) — those are managed inside the clinic app by the clinic_admin. Tab lists/creates/deactivates clinic_admin-role users only. |
| Q-9 (new) | Delete semantics | **Deactivate (soft), not hard delete.** Sets `User.isActive = false`, same mechanism as existing clinic staff deactivation. Preserves FK integrity (audit trails, createdBy references). No reactivate requested yet — flag at grill whether reactivate is in scope or a clear follow-up. |
| Q-10 (new) | Password-set mechanism | Platform admin can **either** type a new password directly **or** click "generate" for a crypto-random one — both paths hash with `config.bcryptRounds`, both display the result once (typed: admin already knows it, so echo back is optional; generated: must be shown). |

---

## 8. New Surface — "Clinic Admins" Tab (CustomerDetailView)

New tab alongside existing Customer Detail tabs (Overview/Usage/Provisioning per implementation-status-matrix). Scope: **clinic_admin-role users of this tenant only.**

- **List:** username, name, email/phone, status (active/deactivated), created date.
- **Create:** name, username, email-or-phone (server enforces D-2-02), password (typed or "generate" button) → creates `User` + `UserRole(clinic_admin)` in this tenant, counts against quota, writes `tenant.admin_user.create` audit entry, displays password once if generated.
- **Deactivate:** sets `isActive = false`, writes `tenant.admin_user.deactivate` audit entry. Confirmation dialog (irreversible-feeling action from platform UI even though it's a soft delete).
- **Reset password:** typed or generate, re-hashes, writes `tenant.admin_user.password_reset` audit entry (no password in details), displays once.
- **No role picker** — role is always clinic_admin, no other roles selectable (Q-8).

Endpoints (proposed, naming TBD at plan time): `GET/POST /platform/customers/:id/admin-users`, `PATCH /platform/customers/:id/admin-users/:userId/deactivate`, `PATCH /platform/customers/:id/admin-users/:userId/password`. All under existing platform-plane guard; confirm at grill whether a distinct permission code is warranted vs reusing the existing customer-management permission (Q-7 area).

---

## 9. Risks

- **R-A (High):** Plaintext password leakage into logs/audit. Mitigation: explicit QA check, password never serialized outside the one-time response field, verified for all three flows (create, first-admin auto-create, reset).
- **R-B (Medium):** Plane-separation ambiguity — platform plane writing to the clinic `users` table, now on an ongoing basis (not just at tenant creation). Mitigation: /grill-with-docs must explicitly bless this as a bounded platform-plane exception (identity provisioning only, never clinical/PII data).
- **R-C (Medium):** Partial provisioning without a transaction on first-admin auto-create. Mitigation: §5 (unchanged from Option A).
- **R-D (Resolved by Option D):** Lost displayed-once password — now recoverable via the tab's reset action.
- **R-E (New):** D-2-02 (email OR phone required) interaction with auto-generated first admin having neither by default — must be resolved at grill (placeholder value? relax the rule for platform-provisioned first admins? require platform admin to supply email/phone at tenant-creation time after all?).

---

## 10. Handoff

**Step 1 brainstorm: human-approved 2026-07-14 (chat sign-off, Option D + §7 decisions).**

Next: @pm-agent task breakdown (Step 2) → @ba-agent validation, in particular R-E (D-2-02 interaction) and R-B (plane-separation bound) (Step 3) → /grill-with-docs (Step 3.5, mandatory — must specifically probe R-E, Q-3b editability, Q-9 reactivate) → /write-plan.

---

> **STATUS: STEP 1 APPROVED.** Proceeding to Step 2 (@pm-agent task breakdown).
