# Design — Clinic Password-Change UI + First-Admin Protection + Discoverable Deactivate/Restore

- **Document type:** Step-1/3 Brainstorm design (Superpowers `brainstorming` output → feeds `@pm-agent` → `@ba-agent`)
- **Author:** brainstorming session (live, with user)
- **Date:** 2026-07-15
- **Branch:** `feature/clinic-password-ui-and-user-management`
- **Depends on:** PR #26 (backend password endpoints already merged + deployed) — this branch is the frontend for them, plus a new backend business rule (first-admin protection).

## Problem

Three gaps surfaced during production use of the clinic-admin User Management screen:

1. **No password-change UI.** PR #26 shipped the backend endpoints (`POST /auth/change-password` self-service, `PATCH /users/:id/password` admin reset) but zero frontend. A clinic user cannot change their own password; a clinic_admin cannot reset a staff/doctor password from the UI.
2. **No first-admin protection.** Any `staff.manage` holder can deactivate *any* user, including the tenant's auto-provisioned primary admin — which would lock the clinic out of its own admin plane.
3. **Deactivate is undiscoverable.** "Delete a user" is only reachable by opening Edit User and unchecking an "Active account" checkbox. Users can't find it.

A fourth, larger requirement (manual permanent-delete after 30 days deactivated, with performer-name denormalization to preserve history) is **explicitly out of scope here** — captured in a separate follow-up spec (see §7).

## Scope (this branch)

### A. Password-change UI (frontend only — backend exists)

**A1 — Admin reset.**
- Location: the Edit User modal in `src/frontend/src/views/admin/UserManagementTab.tsx`, edit mode only (not the create form).
- A "Reset password" section: one new-password input + a "Reset password" button → `PATCH /users/:id/password` with `{ newPassword }`.
- Wrapped in `<Can perm="staff.manage">` (the same permission that already gates the modal's other admin actions).
- No current-password field (this is an admin reset — matches PR #26 Q-G2). Inline success confirmation on 204. Inline error via the existing `describeSaveError` pattern (surfaces the server's 422 "Password must be at least 8 characters").
- Server already revokes the target user's refresh tokens (PWD-3); no frontend token handling needed.

**A2 — Self-service change.**
- Location: a new "Change password" card on `src/frontend/src/views/settings/PreferencesPage.tsx` (`/settings/preferences` — RequireAuth + clinic plane, no permission gate, reachable by any clinic role).
- Three fields: current password, new password, confirm new password (client-side confirm-match check before submit) → `POST /auth/change-password` with `{ currentPassword, newPassword }`.
- On 204: inline success. On 401 (wrong current password) / 422 (too short): inline error surfaced from the server response.
- Server revokes the caller's other refresh-token families (PWD-3); the caller's current 8h access JWT keeps working (accepted residual per PR #26 Q-G3) — no forced re-login.

### B. First-admin deactivate protection (backend rule + frontend affordance)

**Identity rule (locked with user):** the protected "primary admin" is the **lowest-id user with legacy `role = 'admin'`** in the tenant. Robust across both platform-provisioned tenants (auto-created `admin`) and seeded dev tenants (`admin_a`/`admin_b`), needs no schema change. (Open for grill: legacy `role` vs RBAC `clinic_admin` role — see §6.)

**B1 — Backend.**
- New repository helper `findPrimaryAdminId(tenantId): Promise<number | null>` in `user.repository.ts` — `SELECT id ... WHERE tenantId AND role='admin' ORDER BY id ASC LIMIT 1` (Prisma `findFirst`, tenant-scoped).
- A shared guard in `user.service.ts`, e.g. `assertNotPrimaryAdminDeactivation(tenantId, userId)`, that throws `UserError('Cannot deactivate the primary clinic admin', 403)` when `userId === findPrimaryAdminId(tenantId)`.
- Called from **both** deactivation paths:
  - `deactivateUser` (`DELETE /users/:id`).
  - `updateUser` when the payload sets `isActive: false` (`PUT /users/:id`) — the Edit-modal "Active account" checkbox uses this path, so guarding only `deactivateUser` would leave a hole.
- Reactivation and all other edits to the primary admin remain allowed (name/role/password). Only the false-transition of `isActive` is blocked.

**B2 — Frontend.**
- Parent (`UserManagementTab`) computes `primaryAdminId = min(id)` among `users` with `role === 'admin'`, passes an `isPrimaryAdmin` boolean into the modal and into each row.
- In the modal: the "Active account" checkbox is disabled with a short lock note ("Primary admin — cannot be deactivated") when editing the primary admin.

### C. Discoverable deactivate / restore

- Active user rows get a direct **Deactivate** button (`DELETE /users/:id`), with a confirm step.
- Inactive user rows keep a direct **Restore** action (`PUT /users/:id` with `{ isActive: true }`).
- The primary-admin row shows a disabled lock icon in place of Deactivate.
- This replaces the "open the modal and uncheck a box" flow as the primary discovery path (the modal checkbox stays for now to avoid a larger refactor — ponytail: minimal change).

## Data flow

```
A1 admin reset:   Edit modal → PATCH /users/:id/password → user.service.resetUserPassword → setPasswordHash + revokeAllForUser
A2 self-service:  Preferences → POST /auth/change-password → auth.service.changePassword → bcrypt.compare + setPasswordHash + revokeAllForUser
B  protection:    DELETE|PUT /users/:id → guard(findPrimaryAdminId) → 403 if primary admin deactivation
C  deactivate:    row button → DELETE /users/:id (existing) ; restore → PUT /users/:id {isActive:true} (existing)
```

## Error handling

- All new frontend forms surface the server's real message (reuse/extend the `describeSaveError` helper added to `UserManagementTab` in commit 2a57c65) rather than a generic "failed."
- First-admin guard returns **403** (business rule — the user exists and is visible to the caller), distinct from the cross-tenant **404** BOLA pattern (ADR-0014). Documented distinction; verified by test.

## Testing

- **Backend (TDD):** `findPrimaryAdminId` unit test; `deactivateUser` + `updateUser` integration tests proving 403 on primary-admin deactivation via both paths, and that a *non-primary* admin (second admin) CAN be deactivated, and that reactivation/other edits of the primary admin still succeed. Tenant-isolation assertion (cross-tenant primary-admin id doesn't leak).
- **Frontend:** admin-reset field submits and shows success/error; self-service form confirm-mismatch blocks submit and success/error paths; primary-admin checkbox disabled; row Deactivate/Restore call correct endpoints; primary-admin row shows lock not Deactivate.

## §6 — Open questions for /grill-with-docs

1. **Primary-admin identity:** legacy `role='admin'` (min id) vs RBAC `clinic_admin` role (via `userRoles`). Legacy is simpler and matches the auto-provisioned admin; RBAC is the forward-looking source of truth. Does a custom role that grants admin-equivalence but not legacy `role='admin'` need protecting? (Likely no for now — the auto-created admin always has legacy `role='admin'`.)
2. **Self-reset via A1:** should the admin-reset field appear when a clinic_admin edits *their own* row? PR #26 allows it server-side (Q-G2). Decide whether the UI offers it or routes self to the self-service form.
3. **Restore permission:** is restoring a deactivated user gated by `staff.manage` only, or should reactivating an admin need anything extra? (Likely `staff.manage` only — consistent with deactivate.)
4. **Deactivate confirm copy:** does the row Deactivate need a typed-name confirm, or a simple confirm dialog? (Ponytail: simple confirm.)

## §7 — Follow-up (NOT in this branch — separate spec to be written)

Manual permanent user deletion:
- Only a clinic_admin can trigger it, and only for a user that has been deactivated for ≥30 days (`deactivatedAt` timestamp — new column).
- Not automatic — no scheduled purge; admin-initiated per user.
- Performer/author name is denormalized to a text snapshot on every table that references the user (appointments `doctorId`, medical records `doctorId`, vaccinations, prescriptions, payment history `receivedBy`, daily inpatient care `performedBy`) so patient/billing history survives the row deletion; the FK is set null on delete.
- This is a data-retention + denormalization data-model change (~6 tables, migration, write-path changes) that trips the Ponytail scope gate on its own and needs its own brainstorm → grill → plan cycle.

## Ponytail pre-check (this branch)

- Over-engineering? No — reuses existing endpoints (A), one repo helper + one shared guard (B), existing endpoints wired to buttons (C).
- New deps? Zero.
- New endpoints? Zero (A/C reuse PR #26 + existing; B adds a guard, not a route).
- Files: frontend `UserManagementTab.tsx`, `PreferencesPage.tsx` (+ maybe a small shared password-field component), backend `user.repository.ts`, `user.service.ts`, plus tests. Well under thresholds.
- Scope note: 2 subsystems (clinic auth/user mgmt frontend + user service backend). Under the >3 gate.
