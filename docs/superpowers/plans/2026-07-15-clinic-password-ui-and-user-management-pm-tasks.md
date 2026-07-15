# Task Breakdown — Clinic Password UI + First-Admin Protection + Discoverable Deactivate/Restore

- **Document type:** Step-2 PM task breakdown (CLAUDE.md Standard Pipeline)
- **Input:** `docs/superpowers/specs/2026-07-15-clinic-password-ui-and-admin-protection-design.md` (Step 1, approved brainstorm)
- **Author:** @pm-agent
- **Date:** 2026-07-15
- **Branch:** `feature/clinic-password-ui-and-user-management`
- **Next step:** @ba-agent validation sign-off (Step 3), then `/grill-with-docs` (Step 3.5, MANDATORY, non-skippable) before `/write-plan` (Step 4).

## Scope confirmation

In scope, exactly as written in the brainstorm: **Section A** (password-change UI, frontend only), **Section B** (first-admin deactivate protection, backend rule + frontend affordance), **Section C** (discoverable deactivate/restore). §7 (manual permanent delete after 30 days, performer-name denormalization across ~6 tables) is **explicitly excluded** — no task below implements it; it is called out once in the Backlog note at the end of this document, matching the brainstorm's own deferral.

No new endpoints. No new dependencies. No schema change. This matches the brainstorm's Ponytail pre-check (2 subsystems, well under all 7 gate thresholds).

## Actors / roles (per `anemal-rbac-matrix`)

- `clinic_admin` — Web, holds `staff.manage`; performs admin reset (A1), deactivate/restore (C), sees first-admin lock (B2).
- `doctor`, `clinic_staff` — Web, no `staff.manage`; only touched by task B-4/C-4 negative cases and A2 (self-service, no permission gate — any authenticated clinic user).
- Device: **Web** for all tasks (User Management and Preferences are Web/counter screens, not tablet clinical-floor flows; brainstorm does not raise tablet layout concerns and none of the 3 sections touch a tablet screen).

---

## Section A — Password-change UI (frontend only)

### Task PWD-UI-1
**Task ID:** PWD-UI-1
**Actor/role:** clinic_admin
**Device:** Web
**Description:** Add a "Reset password" section to the Edit User modal in `src/frontend/src/views/admin/UserManagementTab.tsx` (edit mode only, not the create form): one new-password input + "Reset password" button, calling `PATCH /users/:id/password` with `{ newPassword }`. Wrap in `<Can perm="staff.manage">` (same gate as the modal's other admin actions). No current-password field. Reuse the existing `describeSaveError` helper (line 22) for inline error text on 422 ("Password must be at least 8 characters") and any other server error; inline success message on 204.
**Acceptance Criteria:**
- [ ] Reset-password section renders only in edit mode (absent from create form) and only inside `<Can perm="staff.manage">`
- [ ] Submitting a valid new password (>=8 chars) calls `PATCH /users/:id/password` with `{ newPassword }` and shows an inline success message on 204
- [ ] Submitting a password <8 chars server-side (422) shows the real server message via `describeSaveError`, not a generic "failed" string
- [ ] Negative/authorization case: a role without `staff.manage` (e.g. `doctor`, `clinic_staff`) never renders the reset-password section, verified by a test that mounts the modal under a non-`staff.manage` permission context
- [ ] No client-side re-login/token handling added — server-side revocation (PWD-3) already covers this
**Permission(s):** `staff.manage`
**Dependencies:** None (backend endpoint from PR #26 already exists)

### Task PWD-UI-2
**Task ID:** PWD-UI-2
**Actor/role:** any clinic user (`clinic_admin`, `doctor`, `clinic_staff`, custom roles)
**Device:** Web
**Description:** Add a "Change password" card to `src/frontend/src/views/settings/PreferencesPage.tsx` (`/settings/preferences`, RequireAuth + clinic plane, no permission gate). Three fields: current password, new password, confirm new password. Client-side confirm-match check blocks submit before any network call. On submit, call `POST /auth/change-password` with `{ currentPassword, newPassword }`.
**Acceptance Criteria:**
- [ ] Card renders for any authenticated clinic-plane user regardless of role/permission (no `<Can>` gate)
- [ ] Submitting with new-password !== confirm-new-password blocks the request client-side and shows an inline mismatch error, with zero network calls made (assert via mock/spy)
- [ ] Submitting matching passwords calls `POST /auth/change-password` with `{ currentPassword, newPassword }`; 204 shows inline success
- [ ] 401 (wrong current password) shows the real server message inline
- [ ] 422 (new password too short) shows the real server message inline
- [ ] Negative/authorization case: an unauthenticated session (no valid JWT) never reaches this card — covered by existing RequireAuth guard; add a test asserting the route redirects when unauthenticated
**Permission(s):** None (self-service; gated only by authentication + clinic plane)
**Dependencies:** None (backend endpoint from PR #26 already exists)

---

## Section B — First-admin deactivate protection

### Task ADMIN-PROT-1 (backend, TDD)
**Task ID:** ADMIN-PROT-1
**Actor/role:** clinic_admin (via `staff.manage`)
**Device:** Web (backend-only task, no UI)
**Description:** Add `findPrimaryAdminId(tenantId: number): Promise<number | null>` to `src/backend/models/user.repository.ts` — tenant-scoped `findFirst` for `role='admin'` ordered by `id ASC`. Write the unit test first in `src/backend/tests/unit/user.repository.test.ts`.
**Acceptance Criteria:**
- [ ] Returns the lowest-id user with `role='admin'` for the given `tenantId`
- [ ] Returns `null` when the tenant has no `role='admin'` user
- [ ] Tenant isolation: a `role='admin'` user in a different tenant never affects the result (test with two tenants, cross-check both directions)
- [ ] Query includes `tenantId` in the `WHERE` clause (per `anemal-db-context` — no unscoped query)
**Permission(s):** N/A (internal repository helper, not a route)
**Dependencies:** None

### Task ADMIN-PROT-2 (backend, TDD)
**Task ID:** ADMIN-PROT-2
**Actor/role:** clinic_admin
**Device:** Web (backend-only task, no UI)
**Description:** Add `assertNotPrimaryAdminDeactivation(tenantId, userId)` to `src/backend/services/user.service.ts`, calling `userRepo.findPrimaryAdminId`. Throws `new UserError('Cannot deactivate the primary clinic admin', 403)` when `userId === primaryAdminId`. Wire it into **both**:
- `deactivateUser` (line 239, `DELETE /users/:id` path) — call before `userRepo.setActive(tenantId, userId, false)`.
- `updateUser` (line 87) — call when `body.isActive === false` (the `PUT /users/:id` path used by the Edit-modal "Active account" checkbox), before `userRepo.updateUser` executes the false transition.

Write integration tests first (new file `src/backend/tests/integration/user-primary-admin-protection.test.ts` or extend an existing user integration test file).
**Acceptance Criteria:**
- [ ] `DELETE /users/:id` on the primary admin returns 403 with message "Cannot deactivate the primary clinic admin"
- [ ] `PUT /users/:id` with `{ isActive: false }` on the primary admin returns 403 with the same message
- [ ] `PUT /users/:id` with `{ isActive: false }` on a **second** (non-primary) admin succeeds (200/204) — proves the guard is scoped to the specific primary-admin id, not all admins
- [ ] Reactivating the primary admin (`PUT /users/:id` with `{ isActive: true }`) succeeds
- [ ] Other edits to the primary admin (name, role, password reset) succeed — only the `isActive: false` transition is blocked
- [ ] Negative/authorization case: a caller without `staff.manage` gets the existing 403 permission-denial (route-level `requirePermission`) before ever reaching this business-rule guard — assert ordering isn't inverted
- [ ] Tenant isolation: primary-admin id from tenant A never blocks a deactivation of a same-numeric-id user in tenant B (cross-tenant test, ties to ADR-0014 BOLA precedent — this 403 is a business rule, not a 404 BOLA hole; document the distinction in the test comment)
**Permission(s):** `staff.manage` (existing route guard; this task adds a business-rule layer beneath it)
**Dependencies:** ADMIN-PROT-1

### Task ADMIN-PROT-3 (frontend)
**Task ID:** ADMIN-PROT-3
**Actor/role:** clinic_admin
**Device:** Web
**Description:** In `src/frontend/src/views/admin/UserManagementTab.tsx`, compute `primaryAdminId = min(id)` among fetched `users` where `role === 'admin'`. Pass an `isPrimaryAdmin` boolean into the Edit User modal and into each user row. In the modal, disable the "Active account" checkbox with a short lock note ("Primary admin — cannot be deactivated") when editing the primary admin.
**Acceptance Criteria:**
- [ ] "Active account" checkbox is disabled and shows the lock note only when editing the computed primary-admin row
- [ ] Checkbox remains enabled/editable for every other user, including other `role='admin'` users
- [ ] If the backend 403s anyway (e.g. stale client list), the modal surfaces the real server error via `describeSaveError` rather than silently failing
- [ ] Negative case: a non-`staff.manage` role never sees the modal at all (existing gate), so this UI never renders for them
**Permission(s):** `staff.manage`
**Dependencies:** ADMIN-PROT-2 (frontend affordance describes a backend rule that must already 403)

---

## Section C — Discoverable deactivate/restore

### Task USER-DISC-1
**Task ID:** USER-DISC-1
**Actor/role:** clinic_admin
**Device:** Web
**Description:** In `src/frontend/src/views/admin/UserManagementTab.tsx`, add a direct **Deactivate** button to each active user's row, calling existing `DELETE /users/:id`, behind a simple confirm dialog (per brainstorm §6-Q4 ponytail ruling — no typed-name confirm). Add a direct **Restore** button to each inactive user's row, calling existing `PUT /users/:id` with `{ isActive: true }`. The primary-admin row shows a disabled lock icon in place of Deactivate (reuses `isPrimaryAdmin` from ADMIN-PROT-3). The modal checkbox path stays as a secondary route (unchanged).
**Acceptance Criteria:**
- [ ] Active, non-primary-admin rows show a Deactivate button; clicking it opens a simple confirm dialog, and confirming calls `DELETE /users/:id`
- [ ] Inactive rows show a Restore button; clicking it calls `PUT /users/:id` with `{ isActive: true }` directly (no confirm dialog required, per brainstorm — restoring is non-destructive)
- [ ] The primary-admin row shows a disabled lock icon instead of an active Deactivate button, and clicking/hovering it does not fire any request
- [ ] Row list re-fetches or optimistically updates after a successful Deactivate/Restore so state reflects immediately
- [ ] Server error on Deactivate/Restore (e.g. stale 403 from ADMIN-PROT-2 if the row list is stale) surfaces via `describeSaveError`
- [ ] Negative/authorization case: rows render without Deactivate/Restore buttons at all for a caller without `staff.manage` (existing `<Can>` gate around the row-action area)
**Permission(s):** `staff.manage`
**Dependencies:** ADMIN-PROT-2, ADMIN-PROT-3 (needs the primary-admin id and the backend guard already in place so the lock icon and the button are consistent with server behavior)

---

## Hand-off sequence (per CLAUDE.md Agent Router)

1. **@db-agent** — none required; no schema/migration change in this scope.
2. **@dev-agent** — implements ADMIN-PROT-1, ADMIN-PROT-2 (backend, TDD) first, then PWD-UI-1, PWD-UI-2, ADMIN-PROT-3, USER-DISC-1 (frontend), in that dependency order.
3. **@uiux-agent** — light-touch review only: confirm the reset-password section, change-password card, lock icon, and confirm dialog follow `anemal-design-system` tokens (44×44px tap targets still apply on Web per NFR Touch UX baseline) before @dev-agent finalizes JSX. No new screen/layout design needed — these are additive elements on existing screens.
4. **@qa-agent** — verifies all acceptance criteria above, plus the two RBAC-relevant checks called out per task (non-`staff.manage` negative cases; tenant-isolation negative case in ADMIN-PROT-1/2), per `.claude/roadmap/qa-protocols.md`.

## Backlog note (not a task in this branch)

§7 of the brainstorm (manual permanent delete after 30 days deactivated, with performer-name denormalization across ~6 tables) requires its own brainstorm → `/grill-with-docs` → plan cycle per the brainstorm's own Ponytail pre-check. Not broken into tasks here; do not pull it into this branch's execute-plan.

## Sign-off

- **Scope match:** All tasks above map 1:1 to brainstorm Sections A, B, C. No task implements §7. No new endpoints, dependencies, or schema changes introduced beyond what the brainstorm specified (ADMIN-PROT-1/2 add a repository helper + service guard, not a route).
- **Scope drift flagged:** None identified. One item left open for `/grill-with-docs` per the brainstorm's own §6: the primary-admin identity rule (legacy `role='admin'` vs RBAC `clinic_admin`) is implemented as designed (legacy, per the brainstorm's stated decision), but §6-Q1 is still listed as open for the grilling gate — this task list does not resolve it, it implements the brainstorm's stated default and defers final confirmation to Step 3.5.
- **Status:** Ready for @ba-agent validation (Step 3).
