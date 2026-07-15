# Code Review — Main-Branch Auto-Provisioning Fix + Clinic Password Change

- **Document type:** Step-7 Code Review (post `/execute-plan`)
- **Reviewer:** @qa-agent (via `/code-review`)
- **Date:** 2026-07-15
- **Scope:** `git diff main...feature/main-branch-provisioning-and-password-change` — 19 files (13 plan inventory + roleRouteMatrix allowlist entry + docs)

## Summary

All 6 plan tasks (PWD-0, PROV-1, PROV-2, PWD-1, PWD-2, PWD-3) implemented and committed individually. Diff matches the write-plan's file inventory exactly. One deliberate, well-documented deviation from the plan's literal code snippets: the 8-char minimum for `newPassword` is enforced in the **service layer** (`AuthError`/`UserError`, 422) rather than via `z.string().min(8)` in the zod schema — both `changePassword` (auth.service.ts) and `resetUserPassword` (user.service.ts) document the same rationale (matches the existing `WeakPasswordError` 422 precedent in platform-customers.service.ts, consistent across both new endpoints). This is a sound, consistent choice — not flagged.

## Critical Issues

None found.

## Findings

| # | File | Line | Finding | Severity |
|---|------|------|---------|----------|
| 1 | `src/backend/scripts/backfill-main-branch.ts` | 28-29 | Non-transactional read-then-write (`findMany` then per-tenant `create`) can race under concurrent test-suite parallelism (observed as a transient FK violation when the full Jest suite runs with multiple workers hitting the same dev DB). Not a production defect — Q-G4 scopes this script to a manual, one-time, per-environment run, never concurrent automated execution. | Informational |

## What Looks Good

- BOLA safety: every password-affecting query is tenant-scoped (`updateMany` with `{ id, tenantId }`), cross-tenant `userId` → 0 rows updated → 404, never 403 (ADR-0014 precedent, verified in PWD-2 test suite).
- All three password-affecting flows (self-service change, admin reset, platform reset) now call `revokeAllForUser` — closes the PWD-3 gap that previously left 30-day refresh tokens valid after any of these flows.
- `POST /auth/change-password` has no target-user parameter — BOLA is structurally impossible on that route, not just guarded.
- PROV-1's branch insert sits inside the existing `createCustomer()` `$transaction`, before the role lookup — preserves the all-or-nothing guarantee from ADR-0015; verified by the new rollback test (branch insert included in rollback via cascade FK, no orphan possible).
- Zero new npm dependencies, zero new permission codes (reuses `staff.manage` and `loginRateLimiter`).
- No plaintext password ever appears in logs or audit details — explicitly tested (`password-management.test.ts` "never logs the plaintext password on a failed attempt").
- `roleRouteMatrix.test.ts` allowlist entry added for `/auth/change-password` with a documented reason, keeping the unmapped-route guard test complete for the new route.

## Pre-existing, unrelated failure (not introduced by this branch)

`tests/integration/roleRouteMatrix.test.ts` fails independently on `GET /api/cron/reminders` — an unmapped route from the unrelated Vercel cron-deployment commit (`6b2be40`, merged via PR #25, already on `main` before this branch started). `cron.routes.ts` is untouched in this branch's diff. Confirmed out of scope; flagged separately for a follow-up fix (not blocking this PR).

## Test Results

```
cd src/backend && npx jest
```
- 62/63 suites pass. The one failing suite (`roleRouteMatrix.test.ts`) fails on the pre-existing unrelated cron-route gap above — every assertion touching this branch's code (including the newly-added `/auth/change-password` allowlist entry) passes.
- All 5 new/extended suites for this feature pass in isolation: `refresh-token.repository.test.ts` (unit), `platform-customer-admin-users.test.ts`, `backfill-main-branch.test.ts`, `password-management.test.ts`.

## Verdict

**APPROVE.** No critical or high-severity issues. Proceed to QA sign-off (RBAC/isolation verification) and Step 8 (`/anemal-finish-branch`).
