# Anemal — Phase History & Status Tracking

Shipped-phase changelog (test counts + PR/ADR mapping) and status of in-flight work. Kept out of `CLAUDE.md` so that file stays session-generic. Deep design detail lives in the ADRs — this is the index, not a duplicate. `@pm-agent` appends one row here LAST on every shipped task, alongside `.claude/specs/implementation-status-matrix.md` and the HTML docs.

---

## Current status / next action

- **`main` is fully green for the first time in ~2 weeks** (backend red since 2026-08-06). Three PRs merged to `main` today (2026-08-21) to close out the backend/frontend test-repair effort raised as backlog items from PR #54:
  - **PR #57** (`1daacca`) — `fix(tests): repair 28 backend failures stranded by ADR-0019 and PR #53`. The 28 backend failures (28 failed / 1265 passed / 1293 total, 9 suites) had two root causes: (A) **ADR-0019** retired multi-role-per-user — schema enforces `@@unique([tenantId, userId])` and `resolvePermissions` uses `findUnique`, but the suite still mocked `findMany` and seeded multi-role fixtures that violate the constraint, cascading into unrelated failures (e.g. `clinicUsage` 500 was a seed failure, not an endpoint bug); (B) **PR #53** changed `touchLastLogin` to `prisma.user.updateMany` without updating the `authService` mock stub. Disposition: 7 tests deleted (recorded in `docs/superpowers/plans/2026-08-20-backend-tests-post-adr-0019-deleted-coverage.md`), 8 rewritten to single-role semantics, 12 fixture fixes, 1 real production fix — `claimInvoicePaid` returned `409 INVOICE_ALREADY_PAID` for cross-tenant/wrong-branch/nonexistent invoices alike; now **ADR-0025** requires `409` describe only an invoice in the caller's own tenant+branch scope, everything else `404` (isolation was never at risk; the fix prevents a naive repair from creating an existence oracle).
  - **PR #59** (`81253bd`) — `fix(tests): make integration fixtures crash-safe, add payment-route deny tests`. All 32 hardcoded fixture identifiers across 26 `tests/integration/` files now carry a `Date.now()` suffix (an interrupted run previously stranded rows and cascaded 277 failures from one suite's `beforeAll`). Added `testPathIgnorePatterns` for `.claude/worktrees/` (a stray git worktree was making jest run every suite twice — 187 suites/2598 tests instead of 91/1289). Added `bill-20/21/22`: named RBAC deny tests for `PUT /api/invoices/:id/payment`. **Correction (2026-08-21):** the original claim that this route "had no authorization test at all" was wrong. The enumeration sweep in `roleRouteMatrix.test.ts` already exercised it for every role and for plane isolation (`walkRoutes` reads the `requirePermission` annotation off the handler), and mutation-testing confirms that sweep catches deletion of either guard. `bill-20/21/22` are a **visibility** improvement — greppable tests named for the route that assert the 403 *reason* and add a fresh-unpaid-invoice case proving no mutation occurs — not the closing of a coverage hole.
  - **PR #56** (`cad8e9c`) — `fix(test): spread real react-query module in 8 frontend mocks`. The 8 frontend test files that were failing at collection (0 tests each — Dashboard, Pets, Appointments, Branches, ClinicSettings, PetDetail had no real coverage despite a green-looking suite count) are fixed by spreading `importOriginal()` in the `@tanstack/react-query` mocks. Recovers 21 real tests.
- **Verified state of `main`:** Backend **1295 passing / 0 failing / 91 suites** (was 28 failing / 1293 total). Frontend **351 passing / 55 files** (was 330 passing with 8 files collecting zero). `tsc --noEmit` clean on both backend and frontend.
- **Known gap, pre-existing, untouched by these PRs:** backend `npm run lint` cannot run — eslint is not installed at all (no eslint dependency declared, no binary, no config file of any kind; the frontend by contrast has eslint ^8.57.1 + .eslintrc.cjs and works) (declared script, no flat config present).
- Backlog raised by prior work and still open — see **Backlog** section below: `AUTH-BL-1`, `AUTH-BL-2`, `AUTH-BL-3`, `services/role.service.ts:184` `countRoleUsage` tenant-scoping, `prisma/schema.prisma:225` stale comment, payment-probe audit logging, backend eslint flat-config gap.
- `docs/superpowers/plans/HANDOFF-backend-tests-post-adr-0019.md` is now resolved and deleted as part of this documentation pass.
- **On resume:** read newest `docs/superpowers/plans/HANDOFF-*.md` first. `.claude/roadmap/ACTIVE/remaining-tasks.md` does not currently exist in the tree.

---

## Backlog

Deferred items raised during shipped work, not yet scheduled to a phase.

| ID | Item | Raised in | Notes |
|----|------|-----------|-------|
| `AUTH-BL-1` | `refreshPermissions()` on a 401 should `clearAuth()` + hard `window.location.href` redirect instead of leaving stale state | PR #54 (login flash fix) | Frontend auth store |
| `AUTH-BL-2` | `refreshPermissions()` on a non-ok, non-401 response bare-returns, leaving `permissionsLoaded` stuck `false` forever | PR #54 | Frontend auth store |
| `AUTH-BL-3` | `/403` is an unrecoverable dead end for a legitimately zero-permission session — stub route sits outside `RequireAuth`, no nav, no logout, and `LoginView` bounces already-authenticated users away from `/login` | PR #54 | Needs a designed recovery path (logout affordance at minimum) |
| — | `services/role.service.ts:184` `countRoleUsage` is not tenant-scoped in its own query | Surfaced during PR #57 backend test repair | Guarded upstream by caller's tenant check; flagged for defence-in-depth, not an active isolation gap |
| — | `prisma/schema.prisma:225` comment still describes the retired `userRoles` union from before ADR-0019 | Surfaced during PR #57 backend test repair | Doc-only drift; schema itself is correct single-role |
| — | Audit logging for repeated payment-route authorization probes | Surfaced during PR #59 (`bill-20/21/22` deny tests) | Deny tests confirm 403s are returned; no logging/alerting on repeated probe attempts yet |
| — | backend `npm run lint` cannot run — eslint is not installed at all (no eslint dependency declared, no binary, no config file of any kind; the frontend by contrast has eslint ^8.57.1 + .eslintrc.cjs and works) | Pre-existing, reconfirmed 2026-08-21 during PR #57/#59/#56 close-out | Declared script, no flat config present; untouched by these PRs |

**Resolved this pass (2026-08-21, PRs #57/#59/#56):** the 28 backend test failures from ADR-0019/PR #53 drift; the 8 zero-collecting frontend test files (broken `@tanstack/react-query` mock); crash-unsafe integration-test fixtures (no unique suffixing, could strand rows); the missing authorization test on `PUT /api/invoices/:id/payment`.

QA also carried forward (from the PR #54 sign-off, next auth-touching branch): **F-5** (vacuous `sessionStorage` assertion at `useAuth.test.ts:208`), **N-1** (untested malformed-body path in `fetchMe`), **N-2** (likely won't-fix).

---

## Shipped phases

Tests = cumulative backend / frontend after that phase. `—` = pre-dates PR/ADR tracking.

| Phase | Focus | PR | ADR | Tests |
|-------|-------|----|-----|-------|
| 1–7 | Foundation → UI redesign | — | — | 226 |
| 8 | RBAC + Platform Console | — | — | ~394 BE |
| 9 | i18n Thai/English (16 screens, no library) | — | — | 95 FE |
| D-1–D-5 | Username login, company types, payment history, owner-first browse | — | — | 447 BE |
| Codex Audit | Batches 1–5: stop-ship fixes, decision docs, QA automation, doc repair, re-audit | #8–#13 | — | 835 / 143 |
| Pet/EMR Batch A | Pet edit, weight↔EMR sync, vitals free-text | #14 | — | 850 / 168 |
| Pet/EMR Item 3 | Inpatient create/edit/delete + board field fix | #15 | — | 864 / 181 |
| Remember-me redesign | Per-subdomain username recall (not session persistence) | #16 | 0010 | 864 / 207 |
| Care History view | Read-only inpatient Care History on CageCard, admitted-only | #17 | 0011 | 864 / 213 |
| Pet Profile Medical tab | Permission-aware read-only EMR rollup (Option C) | #18 | 0012 | 867 / 218 |
| Billing pipeline fixes | Thai PDF font, Payment History receipt + filters, performer-name FK | #19 | 0013 | 888 / 225 |
| Hospitalization branch isolation | BOLA fix — `branchId` from auth context, not query string | #20 | 0014 | 912 BE |
| Log Care vitals modal | HR/RR/feeding/medication fields + shared `VitalStepper` | #21 | — | 912 / 233 |
| RETEST-2026-07-13 | 3 P1 (tenant-leak, FK index, Tailwind token) + 4 test-gaps | #22 | — | 915 / 235 |
| Clinic Admins tab | Auto-create tenant's first `clinic_admin` + admin tab (bounded platform→clinic exception) | #23 | 0015 | 953 / 256 |
| Main Branch + password change | Auto Main Branch (PROV-1) + backfill; self-service change / admin reset, both revoke tokens | #26 | 0015am | 979 BE |
| Clinic password UI + lockout guard | Reset field + Change Password card; `assertNotPrimaryAdminDeactivation` blocks primary-admin deactivate/demote | #27 | 0016 | 993 / 283 |
| Settings IA restructure | Settings→Appointment, Preferences split out, sidebar dedup, remember-me single-prefill | #31 | 0017 | 993 / 283 |
| Usage Stats quota fix | `maxPets` 4th quota across 3 resolvers + enforcement; fixed hardcoded fake `PLAN_LIMITS` | #33 | 0018 | 1021 / 291 |
| Unify role — Plan A (backend) | Retire multi-role + `User.role` enum; `roleId` sole source; 404 on foreign `roleId`; index | #37 | 0019 | 1015 BE |
| Unify role — Plan B (frontend) | Single `ClinicRole` listbox; `GET /users` returns role obj + `isPrimaryAdmin` | #38 | 0019 | 1017 / 279 |
| Billing VAT config | Per-clinic VAT mode + rate, resolved server-side (`computeVat()`), not client `taxRate` | #39 | 0020 | 1031 / 283 |
| EMR file attachments | Presign → S3 PUT → confirm upload, MIME-allow-listed, private-bucket-safe | #41 | 0021 | 1058 / 289 |
| Local-disk driver PR1 (EMR) | `StorageDriver` + `LocalDiskDriver`, prod-guarded; multipart POST; multer size limit at ingest | #42 | 0022 | 1066 BE |
| Local-disk driver PR2 (pet-photo + S3 teardown) | Stable per-pet key, server-managed `photoUrl`, `AuthedPetImage`; deletes S3 stack + `@aws-sdk` | #43 | 0022 | 1078 / 301 |
| EMR attachment UX + Thai filenames | latin1→utf8 filename decode, type hint + `accept=`, delete-confirm, truncation fix | #45 | 0022 | 1081 / 304 |
| SMB driver Sub-PR A (backend core) | `TenantStorageConfig` + `SmbShareDriver`, async `getStorageDriver` across 5 call sites | #46 | 0023 | 1103 BE |
| SMB driver Sub-PR B (API + UI) | `GET`/`PUT /clinic/storage-config`, Clinic Settings Storage page | #47 | 0023 | 1124 / 308 |
| Google Drive Sub-PR A (driver core) | `GoogleDriveDriver`, tenant-scoped Drive paths, OAuth nonce; 11 grill gaps resolved | #47am | 0023 | 1149 BE |
| Google Drive Sub-PR B (OAuth + UI) | `authorize` + public `callback` (signed single-use state), Connect/Disconnect UI | #48 | 0023 | 1178 / 315 |
| OneDrive Sub-PR A (driver core) | `OneDriveDriver` via MS Graph, tenant-scoped app-folder paths, OD-13 approot-fallback spike; 2 grill rounds | #49 | 0023 | 1178 BE |
| OneDrive Sub-PR B (OAuth + UI) | `authorize`/`callback` (same signed-state pattern), disconnect + duplicate-account banner, 4th storage radio; closes ADR-0023 (all 3 sub-projects shipped) | #50 | 0023 | 1243 / 330 |
| **feature/tenant-storage-provider → main** | Final merge of the entire ADR-0023 feature branch (77 commits) into `main`, verified green post-merge | #51 | 0023 | 1243 / 330 |
| Codex review remediation (CRITICAL/HIGH) | 22+ commits closing CR-01/02, HI-01–09, R2-HI-01–04, R3-HI-01–07: cross-tenant FK guards, branch-scope precedence, refresh-token/appointment/discharge/bag-claim atomicity, RBAC role invariant, quota-lock gaps, unbounded audit-sanitize recursion, per-identity upload rate limit; R2-HI-01 closed via documented RLS deferral (not deployment) | #53 | — | 1243+ BE (2 new suites, exact count unverified — Postgres unreachable) / 330 FE |
| Login identity-resolution atomicity | Removed branch-select login flash: `/auth/me` folded into branch-selection mutation, session only established after both succeed, no half-built `sessionStorage` on failure | #54 | 0024 | — / 330 (309→330, +21) |
| Backend test repair (post ADR-0019/PR #53) | 28 stranded backend failures fixed: single-role Prisma mocks, `authService.touchLastLogin` mock stub; 7 deleted / 8 rewritten / 12 fixture fixes / 1 production fix (`claimInvoicePaid` 404-vs-409 tenant/branch scoping) | #57 | 0025 | 1289 BE (was 1265 passed / 28 failed) |
| Integration fixture hardening + payment deny tests | Unique-suffixed 32 fixture IDs across 26 integration files (crash-safety), `.claude/worktrees/` excluded from jest (was double-running every suite), `bill-20/21/22` named RBAC deny tests for invoice-payment route (visibility: the route was already covered by the `roleRouteMatrix` enumeration sweep — see correction in Current status) | #59 | — | 1292 BE (suite count 91, was inflated to 187 by worktree double-run) |
| Named guard tests on the invoice payment route | Targeted `billing.payment` + plane cases in `roleRouteMatrix.test.ts`, asserting the 403 *reason* so a wrong-plane denial is distinguishable from a missing-permission one; role↔permission facts derived from the DB rather than hard-coded | #58 | — | 1295 BE (91 suites) |
| Frontend mock repair (react-query) | Spread real `importOriginal()` react-query module into 8 mocks that were failing at collection with 0 tests each; recovers Dashboard/Pets/Appointments/Branches/ClinicSettings/PetDetail coverage | #56 | — | — / 351 (330→351, +21) |

## Pending phases

| Phase | Focus | Status |
|-------|-------|--------|
| 10 | Payment gateway + SaaS billing | ⏸ needs credentials |
| 11 | LINE/SMS dispatch | ⏸ needs credentials |

---

## ADR / design-doc index

ADRs in `docs/adr/`, design specs + plans + grill/QA records in `docs/superpowers/{specs,plans}/`.

| ADR | Topic | PRs |
|-----|-------|-----|
| 0010 | Remember-me = per-subdomain username recall (superseded by 0017 UI) | #16 |
| 0011 | Inpatient Care History (read-only, admitted-only) | #17 |
| 0012 | Pet Profile Medical tab (read-only EMR rollup) | #18 |
| 0013 | Billing pipeline fixes + `DailyInpatientCare.performedBy` FK | #19 |
| 0014 | Hospitalization branch isolation (BOLA, existence-leak 404 precedent) | #20 |
| 0015 | Platform provisions clinic-admin identity (+2026-07-15 amendment: Main Branch PROV-1) | #23, #26 |
| 0016 | Primary-admin lockout-protection scope (D-1..D-9) | #27 |
| 0017 | Settings IA restructure (supersedes 0010's chooser-modal UI) | #31 |
| 0018 | `maxPets` dual-resolver quota + enforcement | #33 |
| 0019 | Single-role-per-user retires multi-role (Plan A backend, Plan B frontend) | #37, #38 |
| 0020 | Clinic-configurable billing VAT | #39 |
| 0021 | EMR file attachments (presign/S3) | #41 |
| 0022 | Unified local-disk `StorageDriver` (Ponytail-required 2-PR split) | #42, #43, #45 |
| 0023 | Per-tenant BYO-storage — SMB (sub-1), Google Drive (sub-2), OneDrive (sub-3) — all shipped, merged to main | #46, #47, #48, #49, #50, #51 |
| 0024 | Login identity resolution is atomic — session established only after branch selection AND `/auth/me` both succeed | #54 |
| 0025 | Invoice-payment-claim existence disclosure scoped to caller's tenant+branch — `409 INVOICE_ALREADY_PAID` only for an invoice inside the caller's own scope, everything else `404` | #57 |

Other trackers: `.claude/roadmap/archive/bugfix-pipeline-2026-07-tracker.md` (2026-07 bugfix pipeline, all shipped), `.claude/roadmap/archive/pet-emr-inpatient-fixes.md`. (`.claude/roadmap/ACTIVE/remaining-tasks.md` is retired and absent from the tree — the Backlog section above replaces it.)
