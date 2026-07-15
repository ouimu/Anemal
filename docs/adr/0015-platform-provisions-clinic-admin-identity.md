---
status: accepted
---

# Platform plane provisions and manages clinic_admin identity as a bounded exception to plane separation

New tenants had no way to log in — `createCustomer()` only inserted a `Tenant` row, no clinic user. We chose Option D: auto-create the tenant's first `clinic_admin` user inside the tenant-creation transaction (username `admin`, no email/phone, password shown once), plus a "Clinic Admins" tab on the platform Customer Detail screen giving platform admins ongoing create/deactivate/reset-password over `clinic_admin`-role users for that tenant — the platform's only ongoing write access into the clinic-owned `users` table.

This is a deliberate, bounded exception to the platform/clinic plane-separation rule ("platform never touches clinic data" — see `RBAC_Platform_Restructure_Spec.md`). It is justified because `users` holds staff *identity* (name, username, credentials), not clinical or customer PII, and platform already provisions the tenant itself. The exception is held to four non-negotiable bounds:

- **B-1** — role-scoped: every endpoint only ever touches `clinic_admin`-role users, never doctor/staff rows.
- **B-2** — no clinic-data reads: everything written originates from platform-admin input or server-generated randomness, never joined against clinic clinical/PII tables.
- **B-3** — fully audited: every create/deactivate/reset writes a `platform_audit_logs` entry (plaintext password never included).
- **B-4** — soft delete only: platform can deactivate (`isActive = false`) but never hard-delete a clinic identity row.

**Rejected alternatives:** (a) emailed invite/set-your-own-password link — needs an email-dispatch subsystem that doesn't exist yet (Phase 10/11, blocked on credentials); (b) tenant-creation-time admin fields only, no ongoing management tab — leaves password-reset and multi-admin-tenant cases unsolved, reopens the original lockout problem every time an admin is deactivated.

**Deliberately deferred, not built:** a reactivate endpoint (recovery path is creating a replacement clinic_admin instead — the tenant is never truly locked out); rate-limiting on platform-admin actions (no such infra exists anywhere in the codebase yet; platform admin already holds equally destructive unrestricted powers like tenant suspend, so this feature isn't a uniquely elevated risk — if built, it should cover all high-risk platform actions together, not just this one).

See `docs/superpowers/specs/2026-07-14-customer-onboarding-brainstorm.md` and `docs/superpowers/plans/2026-07-14-customer-onboarding-tasks.md` (§Grill Findings) for the full design history.

## Amendment (2026-07-15) — provisioning-time exception extended to one `branches` row

`createCustomer()`'s tenant-creation transaction was found to create zero `Branch` rows, leaving every Platform-Console-provisioned tenant unable to complete staff/doctor login or use any branch-scoped module (seed-created tenants were unaffected — `seed.ts` creates a Main Branch manually). Fixed by inserting one `Branch` row (`name: 'Main Branch'`, server-constant, no clinic-data read) inside the same transaction as the B-1–B-4 bounded exception above.

This is scoped as an extension of B-2 (no clinic-data reads), not a new exception: the write is server-constant, happens once at tenant-creation time in the same transaction, and touches operational config (`branches`) rather than clinical/PII data. B-1 (role-scoped to `clinic_admin` users) does not apply to this row since it isn't a `users` write; B-3 (audited) and B-4 (soft-delete only — not applicable, branches are never deleted here) continue to hold via the existing `customer.create` audit entry, now including `branchId`.

See `docs/superpowers/specs/2026-07-15-mainbranch-and-password-change-brainstorm.md` for the full design history and the companion clinic-plane password-change feature (`/auth/change-password`, `PATCH /users/:id/password`) shipped in the same branch.
