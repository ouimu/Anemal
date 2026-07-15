# QA Sign-off — Clinic Password UI + First-Admin Protection + Discoverable Deactivate/Restore

- **Document type:** Step-7 QA sign-off (CLAUDE.md Standard Pipeline)
- **Branch:** `feature/clinic-password-ui-and-user-management`
- **Author:** @qa-agent (code review + protocol verification) + smoke walkthrough (this session)
- **Date:** 2026-07-15

## Code review verdict: Approve

Full report produced by `@qa-agent` against the diff `main...feature/clinic-password-ui-and-user-management`
(10 source files, ~1,000 added lines incl. tests). No critical issues. Three non-blocking
suggestions raised; #1 (silent error on Restore failure, e.g. seat-quota 409) was fixed in this
branch (commit `48cefbd`) before shipping. The remaining two (CO-4 inactive-admin residual edge
case, brittle axios-internals test helper) are accepted residuals, not blockers.

## Six-point QA verification (from source, not the plan)

1. **Tenant isolation** — PASS. `findPrimaryAdminId` and the restore-quota check are both
   `tenantId`-scoped by construction; cross-tenant tests pass.
2. **Guard fires on all paths** — PASS. `deactivateUser` (DELETE) and `updateUser` (PUT) both call
   `assertNotPrimaryAdminDeactivation`; verified 403 on `isActive:false` and on `role` away from
   `'admin'`.
3. **Second admin still deactivatable** — PASS. Guard is id-scoped (`userId === primaryAdminId`),
   not role-scoped.
4. **Restore-quota transition-only** — PASS. Fires only on the `false → true` transition.
5. **No secret leakage** — PASS. No logging of password values anywhere in the diff; correct
   `autocomplete` attributes; `safe()` strips `passwordHash` from every response.
6. **Standard dimensions (security/correctness/performance/maintainability)** — PASS with the
   fixed Restore-error suggestion above.

## Test results (observed)

| Suite | Result |
|---|---|
| Backend (`npx jest --runInBand`) | 993 passed / 993, 64 suites |
| Frontend (`npx vitest run`, post Restore-error fix) | 283 passed / 283, 45 files |

## Browser smoke walkthrough (Protocol 5, qa-protocols.md)

Manual pass against the running dev servers (localhost:5173 / :4000), `dev-clinic` tenant, seeded
users. Focus: the surfaces changed on this branch.

| Role | Page/Action | Status | Detail |
|---|---|---|---|
| clinic_admin (admin_a) | Login → Dashboard | OK | Correct landing page, no leakage |
| clinic_admin | Users — Edit modal, admin reset-password on Doctor A (non-self) | OK | `PATCH /users/2/password` → 204, "Password reset." shown |
| clinic_admin | Users — Edit modal on own row (Admin A) | OK | Reset-password field hidden; "Change your own password in Settings → Preferences." shown instead |
| clinic_admin | Users — primary-admin lock | OK | Active-account checkbox disabled + lock note on own row; disabled lock icon on row action, click fires no request |
| clinic_admin | Preferences — Change password: mismatch | OK | Client-side block, zero network calls, inline "do not match" message |
| clinic_admin | Preferences — Change password: wrong current password | OK | `POST /auth/change-password` → 401, inline "Current password is incorrect", **no forced logout/redirect** (`skipAuthRedirect` confirmed live) |
| clinic_admin | Users — row Deactivate (Staff Test) | OK | Confirm dialog copy exact match to spec; confirm → `DELETE /users/1691` → 200; row moves to Deactivated |
| clinic_admin | Users — row Restore (Staff Test) | OK | `PUT /users/1691 {isActive:true}` → 200, row restored to Active, no confirm step |
| doctor (doctor_a) | Preferences — Change password card | OK | Renders with no permission gate, as designed (self-service) |
| doctor | `/clinic-admin/users` direct nav | OK | Redirected to Dashboard — route/permission gate holds, no admin surface leak |

No console errors or failed network requests observed on any of the above (aside from a stale,
unrelated `Viewport height is too small: 0` warning from an earlier window-resize step in this
session, not attributable to the branch).

**Note:** Doctor A's password was changed to a test value during the admin-reset-password
verification step above (dev seed data only — no production/customer data involved).

## Sign-off

**QA-Agent Approval: ✅ APPROVE.** All acceptance criteria across Sections A, B, C verified live in
the browser in addition to the automated suites. Proceed to Step 8 (`/anemal-finish-branch`).
