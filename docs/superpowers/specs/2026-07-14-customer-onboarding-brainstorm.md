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

**Option A — Extend create-customer flow (recommended).** One modal, one API call, one transaction. Pros: atomic, simplest UX, closes the gap completely. Cons: modal grows by three fields. Complexity: L.

**Option B — Separate "Provision admin user" action on CustomerDetailView.** Pros: keeps create-customer unchanged; usable for backfilling existing admin-less tenants. Cons: two-step onboarding, tenant can still exist login-less, more API surface. Complexity: M.

**Option C — Emailed invite link (set-your-own-password).** Pros: platform never sees a password at all. Cons: requires email dispatch (Phase 10/11, blocked on credentials) and a token/invite subsystem that does not exist. Complexity: H. **Not viable now.**

Recommendation: **A**, with B's "provision admin" action noted as a possible follow-up for backfill.

---

## 7. Open Questions Requiring Human Sign-off (NOT resolved here)

| # | Question | Proposed default (unconfirmed) |
|---|---|---|
| Q-1 | Password generation policy: length, alphabet, generator (crypto-random 16 chars proposed). **Security-relevant — must be explicitly confirmed by a human, not decided by an unattended run.** | 16-char crypto-random, bcrypt `config.bcryptRounds` |
| Q-2 | Credential delivery: display-once in platform UI vs email (email blocked on Phase 10/11 credentials) vs invite link. | Display-once |
| Q-3 | Which admin fields go on the create-customer form: name + username + email all required? Username auto-defaulted to `admin`? | All three, username prefilled `admin` |
| Q-4 | "Must change password on first login": required now (new schema field + login-flow work) or deferred? No such mechanism exists today. | Defer; track as follow-up |
| Q-5 | Should the first-admin creation bypass `assertCanAddUser` quota, or rely on count-0 always passing? | Exempt/skip for first admin |
| Q-6 | Backfill path for existing admin-less tenants (Option B action)? | Separate follow-up item |
| Q-7 | Distinct audit/permission code for admin-user provisioning, or fold into existing `customer.create` audit action with an `adminUserId` detail field (never the password)? | Fold in, add `adminUserId` to details |

---

## 8. Risks

- **R-A (High):** Plaintext password leakage into logs/audit if implementation is careless. Mitigation: explicit QA check (R-6), never serialize the password anywhere but the one-time response field.
- **R-B (Medium):** Plane-separation ambiguity — platform writing to the clinic `users` table. Mitigation: /grill-with-docs must explicitly bless provisioning-writes as an allowed exception (or reshape the design).
- **R-C (Medium):** Partial provisioning without a transaction. Mitigation: §5.
- **R-D (Low):** Displayed-once password lost by the platform admin before handoff. Mitigation: clinic-side password reset exists via clinic admin tooling? Confirm during grilling; may motivate a platform-side "reset first-admin password" follow-up.

---

## 9. Handoff

Next pipeline steps after human approval: @pm-agent task breakdown (Step 2) → @ba-agent validation of final decisions (Step 3) → /grill-with-docs (Step 3.5, mandatory) → /write-plan.

---

> **STATUS: BLOCKED — awaiting human brainstorm sign-off.**
> Pipeline Step 1 cannot proceed to @pm-agent task breakdown or /grill-with-docs until a human
> reviews and approves this design in a live session. The open questions in §7 — password
> generation policy, credential delivery mechanism, form fields, and forced password change —
> must be explicitly decided by a human before any plan or code is written.
