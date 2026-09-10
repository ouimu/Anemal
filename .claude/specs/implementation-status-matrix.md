# Anemal — Implementation Status Matrix

**Updated:** 2026-09-10
**Status:** **PR #73 (2026-09-10, Lane C hotfix) hardened the Vaccinations module's tenant isolation, did not move its implementation status** — `findDueSoon` was already implemented; the fix closes a cross-tenant PII leak in its Prisma `include` (see module section below). `git diff` over `src/frontend` is empty. **PR #71 (2026-09-09) moved no module's status** — it is orchestration and documentation only (`git diff main...` over `src/`, empty; backend unchanged at 1310 / 93 suites). It restructures the agent team (`@arch-agent` at Step 3.4, `@scribe-agent` owning Step 8, four parallel Step 6 workers, a 9-criteria Ponytail gate, Lanes B/C/D) and repairs the documentation estate. Recorded here because the tracking rules require all five documents to be refreshed together; the module table below is unchanged by design, not by omission. All modules shipped through Phase 9 + storage (ADR-0023) + Codex security remediation + login identity resolution (ADR-0024) remain implemented and unchanged. PR #69 (2026-08-29) is docs/tests-only — no module status moved; non-comment production diff vs `main` is empty. It closes the PR #66 QA follow-up: round-2/round-3 blockers were all comment/test-assertion/doc defects (a previously-replaced tenant-isolation guard test had gone non-falsifiable; restored). It also records the incident where PR #66 originally merged on a fabricated QA approval from a duplicate scheduled-task instance — forward-fixed rather than reverted, since the tenant-scoping production logic was correct throughout. PR #67 (2026-08-27) is a backend tooling-only change — installs eslint (was declared but never installed), no module status moved. PR #66 (2026-08-27) tenant-scopes `countRoleUsage`/`listRoles` in `role.repository.ts`/`role.service.ts`, a defence-in-depth fix (callers already enforced tenant checks upstream). The pass before that (PR #62, ADR-0026) is frontend-only authorization-UI work and moved no module's status. The 2026-08-21 pass before it was test-suite repair only (PRs #57, #59, #56), with one real production fix (ADR-0025).

## Vaccinations — cross-tenant PII leak in `findDueSoon` (2026-09-10, PR #73, Lane C hotfix)

`findDueSoon`'s Prisma `include` followed `vaccination.petId -> pet -> owner` with no tenant filter applied to the included relations. `vaccinations.pet_id` carries no composite FK on `tenant_id` (`.claude/specs/database-schema.sql`), so a vaccination row whose `petId` pointed at a pet in another tenant — a data-integrity state the schema does not itself reject — leaked that pet's name and owner's name/phone into the response. Fix: the query now selects `pet.tenantId` and drops any row that fails the tenant check before returning, mirroring the existing defense-in-depth guard already used by the sibling `findDueSoonWorklist`. Latent defect — not reachable through the app's own write path today, no confirmed live exploitation; discovered via QA fault-injection. Permanent regression test: `src/backend/tests/integration/vaccinationDueSoonTenantLeak.test.ts`. Open hotfix debt recorded in `.claude/roadmap/index.md`: Lane B audit of other repositories for the same unguarded-`include` pattern, and a Lane A `@db-agent` decision on schema-level tenant FK enforcement.

## Role-service tenant scope follow-up (2026-08-29, PR #69)

Docs/tests-only. Fixes to QA round-2 (R2-B1..B4) and round-3 (R3-B1..B5) review blockers on PR #66's tenant-scope fix — all comment/test-assertion/doc corrections, zero production-logic changes (`git diff 2601f28..HEAD` on `role.repository.ts` is empty modulo comments). Restored a falsifiable tenant-isolation guard test that a prior revision had silently made non-falsifiable (0 rows either way regardless of whether the tenant filter existed); corrected an FK-inventory comment that named only 1 of the 2 FKs referencing a role (`UserRole.role` and `users_roleId_fkey`); corrected data-dependent unscoped-count claims in test comments; repointed dangling doc-section citations. Filed to Backlog: `R3-F1` (HIGH — `users_roleId_fkey` is `ON DELETE SET NULL` in the migration chain but `RESTRICT` in the live dev/test DB, with `users.roleId` `NOT NULL` — a `prisma migrate deploy` env could 500 instead of 409 on role deletion; needs `@db-agent`). Real QA sign-off: `docs/superpowers/plans/2026-08-27-role-service-tenant-scope-qa-signoff.md` §10.

## Backend eslint setup (2026-08-27, PR #67)

Tooling-only. `src/backend/package.json` declared `"lint": "eslint . --ext .ts"` since inception with no eslint dependency, no config, no binary — a dead command. Adds eslint@8.57.1 + `@typescript-eslint`, `src/backend/.eslintrc.cjs` (legacy config, matching the frontend's existing style rather than a v9 flat-config migration). Fixed 21 mechanical `no-extra-semi` violations across 5 test files, one documented inline `eslint-disable` for `declare global { namespace Express }`, one style-only line in `tenant-settings.service.ts`. `npm run lint`: 0 errors, 1 warning. Ponytail APPROVE (7/7), QA APPROVED — `docs/superpowers/plans/2026-08-27-backend-eslint-setup-qa-signoff.md`.

## Role-service tenant scope (2026-08-27, PR #66)

`countRoleUsage(roleId, tenantId)` and `listRoles` now filter by `tenantId` in `role.repository.ts`; `schema.prisma:225`'s stale pre-ADR-0019 comment corrected. Records: `docs/superpowers/plans/2026-08-27-role-service-tenant-scope*.md`.

## Authorization UI recovery + honest refresh (2026-08-26, PR #62, ADR-0026)

Frontend-only pass. `git diff main..HEAD -- src/backend` is empty; no module changed implementation status. This closes the three auth backlog items `AUTH-BL-1/2/3` raised by PR #54 and the QA carry-forwards `F-5` / `N-1`.

| Area | Change | Notes |
|------|--------|-------|
| Permission denial (403) | Absolute standalone `/403` route **deleted**; each of the three clinic trees (`/clinic-admin`, `/clinic`, `/settings`) now declares a nested `403` child route, so a denial renders in-shell with working nav and a reachable sign-out | Closes `AUTH-BL-3`, the originally reported defect: the old stub sat outside `RequireAuth` with no nav and no logout, and `LoginView` bounces authenticated users away from `/login`, so the only exit was closing the tab |
| `RequirePermission` tree derivation | Redirects to `` `/${pathname.split('/')[1]}/403` `` | Deliberately **not** a `startsWith` prefix map: `'/clinic-admin/users'.startsWith('/clinic')` is `true`, which would route every admin denial into `/clinic/403` and, via `ClinicLayout.tsx:31`'s admin redirect, into an unbounded loop. Segment derivation also cannot drift from `App.tsx` |
| `AdminLayout` nav | Gained a permission filter it **never had** — it previously rendered `NAV.map(...)` unfiltered, so every admin nav entry was shown regardless of held permissions | ADR-0026 decision 4: nav hiding is cosmetic and **never** enforcement. Every hidden route is still denied by its own guard — verified live against `/clinic-admin/audit` in the Protocol 5 smoke run |
| `ClinicLayout` nav | Dashboard's `perm: undefined` completed; entries the user cannot open are hidden | Same decision-4 constraint |
| `refreshPermissions()` contract | Total `{ ok: boolean }` over every exit (no token, network throw, 401, non-ok, malformed body, success). `permissions` / `permissionsLoaded` mutate only on success | INV-PERM-1: "could not tell" is never written as "authoritatively none". Closes `AUTH-BL-2` |
| 401 handling | `clearAuth()` + hard redirect to `/login?reason=session-expired`; the dead `plane === 'platform'` branch was **removed** rather than "fixed" — the platform plane has its own store and its own 401 handler | Closes `AUTH-BL-1`. A guard for an unreachable state gives false confidence |
| `RoleList` self-role edit | A refresh that returns non-ok **or rejects** now shows a persistent warning toast with a reload control instead of a success toast (or, on rejection, no toast at all) | The unguarded `await` previously let a rejection abort `onSuccess` before any toast — the same silent-failure class this branch exists to remove |
| Test coverage of `App.tsx` | Was **zero**. QA's mutation battery stripped `RequirePermission` off `/clinic-admin/users` and `/settings/storage` and the whole suite stayed green | Closed by `App.routeManifest.test.ts` (source-level parity across all 27 guards, plus an F-9 classifier that also catches *adding* a new unguarded route) and `App.realRouting.test.tsx` (real `App`, bounded `LoopGuard` at 40 navigations) |

QA sign-off: **18/18 AC, 0 unproven**, after one BLOCKED round on proof. Frontend 410 passing / 60 files (was 351 / 55); backend unchanged at 1295 / 91 suites. Records: `docs/adr/0026-authorization-ui-is-recoverable-and-honest.md`, `docs/superpowers/plans/2026-08-21-auth-recovery-paths-{ba-signoff,grill,ponytail,qa-signoff,smoke}.md`.

## Test-suite repair (2026-08-21, PRs #57/#59/#56, ADR-0025)

| Area | Change | Notes |
|------|--------|-------|
| Backend test suite | 28 failures (ADR-0019 multi-role mock drift + PR #53 `touchLastLogin` mock gap) repaired: 7 tests deleted, 8 rewritten to single-role semantics, 12 fixture fixes | `main` now 1295 passing / 0 failing / 91 suites (incl. PR #58's named guard tests) |
| Invoice payment claim (`claimInvoicePaid`) | Real production defect found during repair: returned `409 INVOICE_ALREADY_PAID` for cross-tenant/wrong-branch/nonexistent invoices, not just in-scope ones | Now ADR-0025: `409` only for an invoice in the caller's own tenant+branch scope, everything else `404`; isolation itself was never at risk |
| Integration test fixtures | 32 hardcoded IDs across 26 `src/backend/tests/integration/` files given a `Date.now()` suffix | Prevents an interrupted run from stranding rows and cascading failures into the next run |
| Jest config | `.claude/worktrees/` excluded via `testPathIgnorePatterns` | A stray git worktree was making every suite run twice (187 suites/2598 tests vs the real 91/1289) |
| Invoice payment route authorization | `bill-20/21/22`: RBAC deny tests added for `PUT /api/invoices/:id/payment`, which was already covered by the `roleRouteMatrix` enumeration sweep but had no test named for it before this | Mutation-verified |
| Frontend test mocks | 8 files spreading `importOriginal()` into their `@tanstack/react-query` mock (Dashboard, Pets, Appointments, Branches, ClinicSettings, PetDetail, + 2 more) | These were failing at collection, contributing 0 tests each; recovers 21 real tests, frontend now 351 passing / 55 files |

Known gap at the time, untouched by this repair: backend `npm run lint` could not run — eslint was not installed at all (no eslint dependency declared, no binary, no config file of any kind; the frontend by contrast has eslint ^8.57.1 + .eslintrc.cjs and works). **Resolved 2026-08-27, PR #67** — see above. Deleted-coverage rationale for the 7 removed backend tests: `docs/superpowers/plans/2026-08-20-backend-tests-post-adr-0019-deleted-coverage.md`.

## Login identity resolution (2026-08-20, ADR-0024)

| Area | Change | Notes |
|------|--------|-------|
| Clinic login (branch select → session) | `/auth/me` folded into the branch-selection mutation; session (`sessionStorage` + store) written only after BOTH branch selection and identity resolution succeed | Fixes the full-round-trip login-form re-render ("kicked out") flash on tablet after picking a branch |
| Clinic login | Removed the duplicated `/auth/me` call that previously fired once per login | — |
| Clinic login | On identity-resolution failure, nothing is persisted to `sessionStorage`; branch picker stays mounted with a distinct error instead of a half-built session | Prevents corrupt/partial sessions surviving a failed login |
| Auth store contract | `permissionsLoaded` is now a required field on the `setAuth` payload | Makes the class of regression this branch fixed (`useSwitchBranch` omitting it) a compile-time error, not a runtime one |

Known gaps deferred at the time and **since closed by PR #62 / ADR-0026** (see the 2026-08-26 section at the top of this file): `AUTH-BL-1` (401 on `refreshPermissions()` should hard-redirect), `AUTH-BL-2` (non-ok/non-401 leaves `permissionsLoaded` stuck `false`), `AUTH-BL-3` (`/403` is a dead end for a legitimately zero-permission session).

## Security remediation coverage (2026-08-06)

| Area | Findings closed | Notes |
|------|------------------|-------|
| Cross-tenant isolation | CR-01, HI-01, R2-HI-02, R2-HI-03 | FK guards inside write transactions, branch-scoped JWT precedence over query params, tenant-scoped raw SQL joins |
| Auth / tokens | HI-03, HI-04, HI-06 | Pending branch-selection tokens rejected as API tokens, atomic refresh-token rotation, exactly-one-role-per-user invariant (ADR-0019) |
| Concurrency / atomicity | R3-HI-01–05 | Advisory-lock serialized appointment conflict checks, atomic discharge+invoice, atomic bag-claim + donor eligibility, atomic quota checks, lot/expiry tracking symmetry |
| Availability | HI-07, R3-HI-06, R3-HI-07 | Fail-closed on missing `CRON_SECRET`, iterative depth/node-bounded audit sanitize (was unbounded recursion → process crash), per-identity rate limit on multer upload routes |
| Data integrity | HI-02, HI-05, HI-08, HI-09, R2-HI-04, R3-HI-04 | Scoped `updateMany` over bare-id updates, RBAC matrix self-contradiction reconciled, atomic payment+loyalty transaction, query-cache clear on logout/401/branch-switch, feature-flagged reminder dispatch, platform-customers quota-lock gap closed |
| Row-level security | R2-HI-01 | **Deferred by design decision**, not deployed — full RLS under the current single-pool/single-role Prisma setup would deny every query rather than scope it. Canonical RLS spec preserved as an undeployed target; see `ebc07dd` for the deferral rationale. |
| Output encoding | CR-02 | Receipt HTML escaped, popup `opener` severed |

Full finding-by-finding detail lives in `CodexCodeReview.md` (local-only) and the individual commit messages on `fix/codex-review-critical-high` (22+ commits, `6f66c31`..`a4745ef`).

See `.claude/roadmap/phase-history.md` for the phase-level changelog this entry corresponds to.
