# Anemal — Phase History & Status Tracking

Shipped-phase changelog (test counts + PR/ADR mapping) and status of in-flight work. Kept out of `CLAUDE.md` so that file stays session-generic. Deep design detail lives in the ADRs — this is the index, not a duplicate. `@pm-agent` appends one row here LAST on every shipped task, alongside `.claude/specs/implementation-status-matrix.md` and the HTML docs.

---

## Current status / next action

- **PR #62 merged 2026-08-26** (`d85eee0`) — `fix(auth): recoverable 403, honest permission refresh, plane-correct 401`, implementing **ADR-0026**. Closes the three auth backlog items raised by PR #54 (`AUTH-BL-1`, `AUTH-BL-2`, `AUTH-BL-3`) and the two QA carry-forwards (`F-5` vacuous `sessionStorage` assertion, `N-1` untested malformed-body path). Frontend-only: `git diff` against `main` over `src/backend` is empty.
  - **The reported defect (`AUTH-BL-3`)** — a user denied a page was *trapped*. The `/403` stub sat outside `RequireAuth` with no nav and no logout, and `LoginView` bounces already-authenticated users away from `/login`, so the only exit was closing the tab. Denials now render **in-shell** as a nested `403` child route inside each of the three clinic trees, with a working sidebar and a reachable sign-out.
  - **The redirect-loop hazard** — the obvious fix (a shell that reuses `ClinicLayout`) ships an unbounded loop via `ClinicLayout.tsx:31`'s admin redirect: `/403` -> dashboard -> denied -> `/403`. @ba-agent caught it before implementation; `App.realRouting.test.tsx` now carries a bounded `LoopGuard` (40 navigations) that fails in ~2s instead of hanging.
  - **Why a prefix map was rejected** — `'/clinic-admin/users'.startsWith('/clinic')` is `true`, so a tree-prefix map routes every admin denial into `/clinic/403` — straight into that loop. @ponytail-agent rejected round 1 and the plan came back *smaller*: delete the absolute `/403` route entirely and derive the tree with `pathname.split('/')[1]`, which cannot drift from `App.tsx`.
  - **Nav honesty (`R-1`)** — `AdminLayout` previously rendered `NAV.map(...)` with **no permission filter at all**; `ClinicLayout` gave Dashboard `perm: undefined`. Both now hide entries the user cannot open. **ADR-0026 decision 4 holds that this is cosmetic and never enforcement** — every hidden route is still denied by its own guard.
  - **Honest refresh (`AUTH-BL-1`/`AUTH-BL-2`)** — `refreshPermissions()` now has a total contract returning `{ ok: boolean }` over every exit (no token, network throw, 401, non-ok, malformed body, success). `permissionsLoaded`/`permissions` are mutated only on success, never fabricated to `[]`/`true` from "could not tell" — INV-PERM-1. `RoleList` shows a persistent warning toast with a reload control instead of silently swallowing a rejected refresh.
  - **QA BLOCKED this branch once, correctly.** The code was right but nothing could prove it: `App.tsx` had **zero coverage**, and 7 mutations — including *stripping route guards* — shipped green. Closed with `App.routeManifest.test.ts` (source-level parity over all 27 guards, plus an F-9 classifier that also catches *adding* a new unguarded route) and `App.realRouting.test.tsx`. Final sign-off: **18/18 AC, 0 unproven**.
- **Verified state of `main` (2026-08-26):** Backend **1295 passing / 0 failing / 91 suites** (unchanged — PR #62 touched no backend file). Frontend **410 passing / 60 files** (was 351 / 55). `tsc --noEmit` clean on both; frontend eslint 0 errors (2 pre-existing warnings).
- **Known gaps, pre-existing:** (1) backend `npm run lint` cannot run — eslint is not installed at all (no dependency declared, no binary, no config of any kind; the frontend by contrast has eslint ^8.57.1 + `.eslintrc.cjs` and works). (2) **New, found 2026-08-26:** the backend suite is green under `npm test` (which uses `--runInBand`) but flaky under bare parallel `npx jest` — 1-3 random login-dependent tests fail per run. Cause is bcrypt cost, not the code under test: fixtures mix `bcrypt.hash(pw, 10)` and `(pw, 4)`, and verify cost is read from the stored hash, so cost-10 fixtures saturate the CPU across 11 workers until logins exceed the 5s timeout. Not a ship blocker — the canonical command is serial — but see Backlog.
- **Prior close-out retained for the record (2026-08-21, PRs #57/#59/#56):** `main` went green for the first time in ~2 weeks (backend had been red since 2026-08-06). PR #57 repaired the 28 backend failures stranded by ADR-0019 + PR #53 — 7 tests deleted (`docs/superpowers/plans/2026-08-20-backend-tests-post-adr-0019-deleted-coverage.md`), 8 rewritten to single-role semantics, 12 fixture fixes, 1 real production fix (`claimInvoicePaid`, now **ADR-0025**). PR #59 made 32 fixture identifiers crash-safe across 26 integration files and excluded `.claude/worktrees/` from jest. PR #56 fixed 8 frontend files failing at collection. **Correction (2026-08-21):** the original claim that `PUT /api/invoices/:id/payment` "had no authorization test at all" was **wrong**. The enumeration sweep in `roleRouteMatrix.test.ts` already exercised it for every role and for plane isolation (`walkRoutes` reads the `requirePermission` annotation off the handler), and mutation-testing confirms that sweep catches deletion of either guard. `bill-20/21/22` are a **visibility** improvement — greppable tests named for the route that assert the 403 *reason* — not the closing of a coverage hole.
- **On resume:** read newest `docs/superpowers/plans/HANDOFF-*.md` first (none currently exist — no feature is mid-flight). `.claude/roadmap/ACTIVE/remaining-tasks.md` does not exist in the tree and must not be recreated.

---

## Backlog

Deferred items raised during shipped work, not yet scheduled to a phase.

| ID | Item | Raised in | Notes |
|----|------|-----------|-------|
| — | `services/role.service.ts:184` `countRoleUsage` is not tenant-scoped in its own query | Surfaced during PR #57 backend test repair | Guarded upstream by caller's tenant check; flagged for defence-in-depth, not an active isolation gap |
| — | `prisma/schema.prisma:225` comment still describes the retired `userRoles` union from before ADR-0019 | Surfaced during PR #57 backend test repair | Doc-only drift; schema itself is correct single-role |
| — | Audit logging for repeated payment-route authorization probes | Surfaced during PR #59 (`bill-20/21/22` deny tests) | Deny tests confirm 403s are returned; no logging/alerting on repeated probe attempts yet |
| `TEST-BL-1` | Backend suite flaky under parallel `npx jest` (green under `npm test`/`--runInBand`) — fixtures mix `bcrypt.hash(pw, 10)` and `(pw, 4)`; verify cost comes from the stored hash, so cost-10 fixtures starve the CPU across 11 workers and logins exceed the 5s timeout | Found 2026-08-26 during PR #62 close-out | 1-3 random login-dependent tests per run. Login helpers also read `res.body.data.token` without asserting `res.status`, so the real cause surfaces as an unrelated `TypeError`. Separately, `backfill-main-branch.test.ts:55` asserts `second.inserted === 0` while `backfillMainBranch()` scans the WHOLE database — racy by construction under parallel workers |
| `AUTH-BL-4` | Clinic dashboard calls `/api/reports/snapshot` unconditionally, without checking whether the caller holds `reports.revenue.view` | Surfaced in PR #62 Protocol 5 smoke run | Server correctly returns 403 — the guard works. Cosmetic console noise, not a leak |
| `F-6` | Layouts render an unknown-permission state (`permissionsLoaded === false`) as an empty nav rather than a loading state | QA, PR #62 | Cosmetic — declined by QA and agreed |
| `F-8` | `RequirePermission.tsx:4` and `:33` docblocks still say "Redirects to /403"; the absolute route was deleted | QA, PR #62 | Doc-only drift. The `authStore` docblock *was* corrected |
| — | backend `npm run lint` cannot run — eslint is not installed at all (no eslint dependency declared, no binary, no config file of any kind; the frontend by contrast has eslint ^8.57.1 + .eslintrc.cjs and works) | Pre-existing, reconfirmed 2026-08-21 during PR #57/#59/#56 close-out | Declared script, no flat config present; untouched by these PRs |

**Resolved 2026-08-26 (PR #62, ADR-0026):** `AUTH-BL-1` (401 on `refreshPermissions()` now clears auth and hard-redirects, plane-correct), `AUTH-BL-2` (non-ok/non-401 no longer strands `permissionsLoaded` — total `{ ok: boolean }` contract), `AUTH-BL-3` (`/403` dead end replaced by an in-shell, navigable denial in all three clinic trees), and QA carry-forwards `F-5` (vacuous `sessionStorage` assertion) and `N-1` (untested malformed-body path in `fetchMe`).

**Resolved 2026-08-21 (PRs #57/#59/#56):** the 28 backend test failures from ADR-0019/PR #53 drift; the 8 zero-collecting frontend test files (broken `@tanstack/react-query` mock); crash-unsafe integration-test fixtures (no unique suffixing, could strand rows); the missing authorization test on `PUT /api/invoices/:id/payment`.

QA carry-forwards from the PR #54 sign-off: **F-5** and **N-1** were closed by PR #62 (see above). **N-2** remains open and is still assessed as likely won't-fix.

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
| Auth recovery paths (recoverable 403 + honest refresh) | `/403` dead end replaced by an in-shell nested `403` child route in all three clinic trees (absolute `/403` deleted; tree derived via `pathname.split('/')[1]`, not a `startsWith` prefix map that would send `/clinic-admin/*` into a redirect loop); `AdminLayout` gains a permission filter it never had and `ClinicLayout`'s is completed; `refreshPermissions()` given a total `{ ok: boolean }` contract so "could not tell" is never written as "authoritatively none" (INV-PERM-1); plane-correct 401. Closes `AUTH-BL-1/2/3` + QA `F-5`/`N-1`. QA blocked once on proof — `App.tsx` had zero coverage and 7 mutations shipped green — closed with a source-level route-manifest parity test and a bounded-`LoopGuard` real-routing suite | #62 | 0026 | 1295 BE (unchanged, backend untouched) / 410 (351→410, +59) |

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
| 0026 | Authorization UI is recoverable and honest — a denial renders in-shell with working nav and sign-out, nav hiding is cosmetic and never enforcement, and a permission refresh that could not resolve is never reported as "no permissions" | #62 |

Other trackers: `.claude/roadmap/archive/bugfix-pipeline-2026-07-tracker.md` (2026-07 bugfix pipeline, all shipped), `.claude/roadmap/archive/pet-emr-inpatient-fixes.md`. (`.claude/roadmap/ACTIVE/remaining-tasks.md` is retired and absent from the tree — the Backlog section above replaces it.)
