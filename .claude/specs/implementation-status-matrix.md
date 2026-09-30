# Anemal — Implementation Status Matrix

**Updated:** 2026-10-01
**Status:** **PR #97 (2026-09-26, Lane A feature, full pipeline) completed Thai i18n for Grooming, Inpatient, EMR and Pets, a cross-cutting UI/localization change that did not move any module's feature-completeness status** — every module below remains implemented exactly as recorded; this PR adds display-language support and two shared helpers (`i18n/dateFormat.ts`, `i18n/speciesLabel.ts`) to screens that were already fully implemented, and fixes 3 layout defects surfaced by the localization pass itself (`7ea819b`, `aacb4b3`, `304b6ac`). `git diff` over `src/backend` is empty. See `.claude/roadmap/phase-history.md` "PR #97" entry for full detail. **PRs #88-94 (2026-09-18 to 2026-09-23) moved no module's implementation status.** PR #93 (Lane B bug fix) restored `stockQuantity`/`minStockLevel` API field names in `product.repository.ts` — Inventory was already fully implemented; a prior migration had silently renamed the response fields, rendering "NaN" client-side, now corrected at the API-shaping boundary only. PR #92 (Lane B bug fix) gated Billing's "Confirm Payment" button on `pendingInvoiceId` to close a double-POST that orphaned a PromptPay invoice and double-deducted stock — Billing was already fully implemented. PR #91 is test-only (`SC-05b` regression, storage-config module unchanged). PR #90 and #89 are docs-only (skill/spec corrections, no runtime code touched). PR #88 restructured `docs/index.html` only. PR #94 retuned agent model/effort config only. Full detail: `phase-history.md` "Current status / next action". **PR #75 (2026-09-17, Lane B bug fix) hardened `AdminLayout`/`ClinicLayout` authorization, did not move any module's implementation status** — both layouts were already implemented; the fix replaces their legacy `role`-string entry gate with a permission-based one so `RequirePermission` guards (already correct per-screen) are no longer pre-empted (see module section below). `git diff` over `src/backend` is empty. **PR #83 (2026-09-16, Lane D refactor) shipped code-quality backlog Phases 1-5+8, a structural/internal-quality change that did not move any module's feature-completeness status** — controller-to-repository layering across 4 controllers (oauth-google, oauth-onedrive, role, settings), OAuth-callback-guard + stock-deduction deduplication, a god-file split in the platform-customers service, explicit tenant guards added to a vaccination-worklist raw-SQL join, and 2 frontend auth calls (`fetchMe`, `refreshPermissions`) moved off raw `fetch()` onto the shared axios client. Every module below remains implemented exactly as recorded. See `phase-history.md` "PR #83" entry for full detail. **PR #80 (2026-09-16, Lane A feature, full pipeline) consolidated 15 modal call sites onto one shared `Dialog` component, a structural/consistency change that did not move any module's feature-completeness status** — every module below remains implemented exactly as recorded; this is a cross-cutting UI-contract fix (one `DismissalPolicy`-driven component replacing per-site hand-rolled modals), not new module functionality. `git diff` over `src/backend` is empty. See module section below for detail. **PR #77 (2026-09-15, Lane A feature, full pipeline) hardened tenant isolation across 20 model files, did not move any module's feature-completeness status** — every module below remains implemented exactly as recorded; this change is a structural cross-cutting fix (the relation-traversal invariant + a standing conformance test), not new module functionality. `git diff` over `src/frontend` is empty. See module section below for detail. **PR #73 (2026-09-10, Lane C hotfix) hardened the Vaccinations module's tenant isolation, did not move its implementation status** — `findDueSoon` was already implemented; the fix closes a cross-tenant PII leak in its Prisma `include` (see module section below). `git diff` over `src/frontend` is empty. **PR #71 (2026-09-09) moved no module's status** — it is orchestration and documentation only (`git diff main...` over `src/`, empty; backend unchanged at 1310 / 93 suites). It restructures the agent team (`@arch-agent` at Step 3.4, `@scribe-agent` owning Step 8, four parallel Step 6 workers, a 9-criteria Ponytail gate, Lanes B/C/D) and repairs the documentation estate. Recorded here because the tracking rules require all five documents to be refreshed together; the module table below is unchanged by design, not by omission. All modules shipped through Phase 9 + storage (ADR-0023) + Codex security remediation + login identity resolution (ADR-0024) remain implemented and unchanged. PR #69 (2026-08-29) is docs/tests-only — no module status moved; non-comment production diff vs `main` is empty. It closes the PR #66 QA follow-up: round-2/round-3 blockers were all comment/test-assertion/doc defects (a previously-replaced tenant-isolation guard test had gone non-falsifiable; restored). It also records the incident where PR #66 originally merged on a fabricated QA approval from a duplicate scheduled-task instance — forward-fixed rather than reverted, since the tenant-scoping production logic was correct throughout. PR #67 (2026-08-27) is a backend tooling-only change — installs eslint (was declared but never installed), no module status moved. PR #66 (2026-08-27) tenant-scopes `countRoleUsage`/`listRoles` in `role.repository.ts`/`role.service.ts`, a defence-in-depth fix (callers already enforced tenant checks upstream). The pass before that (PR #62, ADR-0026) is frontend-only authorization-UI work and moved no module's status. The 2026-08-21 pass before it was test-suite repair only (PRs #57, #59, #56), with one real production fix (ADR-0025).

## Responsive shell + EMR portrait (2026-10-01, PR #106, Lane A feature, ADR-0033)

Frontend-only; `git diff main...HEAD -- src/backend` is empty and no module's feature status moved. Cross-cutting layout change: the four layouts (Clinic, Admin, Settings, Platform) now share `components/ResponsiveSidebar.tsx`, `hooks/useShellSidebar.ts` and `hooks/useViewportMode.ts` (expanded >=1280px, rail 1024-1279px, drawer <1024px; drawer is a modal dialog). EMR (`ClinicEMR.tsx`) is tabbed at 768 portrait.

| Area | Status | Notes |
|------|--------|-------|
| Shell sidebar (4 layouts) | Implemented | Nav filters, role gates and idle logout stay in each layout; width `w-56`/`w-14` (spec drift `RESP-BL-3`). |
| EMR at 768 portrait | Implemented, partly verified | B-5 passed in browser; touch, soft keyboard unverified (`RESP-OPEN-3`). |
| Pets / Appointments at 768 | Not changed | Fixed panels remain (`RESP-BL-1`/`RESP-BL-2`). |
| Real-device checks | Open | B-4, B-6, B-8, B-12 not verified (`RESP-OPEN-1..4`). |

## AdminLayout/ClinicLayout — RBAC-based entry gate (2026-09-17, PR #75, Lane B bug fix)

Frontend-only pass. `git diff main..HEAD -- src/backend` is empty; no module changed implementation status. `AdminLayout.tsx:36` and `ClinicLayout.tsx:31` gated entry to their entire route tree on the legacy `role: string` field (`role !== 'admin'` / `role === 'admin'`), executing *before* the per-screen `RequirePermission` guards ever ran. This blocked roles the RBAC matrix explicitly grants a screen from reaching it: doctor/clinic_staff → `bloodbank.view` under `/clinic-admin/blood-bank`; clinic_admin → appointments/inventory/grooming under `/clinic/*`. Not a security hole — the server already enforced these permissions correctly. Identified by `@ba-agent` during Step 3 of the modal-consolidation feature and ruled out of that branch's scope (finding F-3).

| Area | Change | Notes |
|------|--------|-------|
| `AdminLayout` entry gate | `role !== 'admin'` replaced with: redirect to `/clinic/dashboard` only when the role holds zero admin-tree permissions **and** holds at least one clinic-tree permission; otherwise render | A role with zero permissions in both trees now renders and is denied in-shell by `RequirePermission`, instead of being redirected sight-unseen |
| `ClinicLayout` entry gate | `role === 'admin'` replaced with the symmetric check against `/clinic-admin/dashboard` | Same fallback: zero permissions in both trees renders rather than redirects |
| Redirect-loop avoidance | Neither layout redirects when the role holds zero permissions in **both** trees | The naive "always redirect to whichever tree the role doesn't natively belong to" rule would bounce a zero-permission role between the two layouts forever |
| `src/frontend/src/layouts/navAccess.ts` (new) | `ADMIN_NAV_PERMS`/`CLINIC_NAV_PERMS` — the permission codes each layout's own NAV array already gates on, exported so neither layout imports the other's NAV (would be circular) | Single source for "does this role belong in this tree at all" |
| `App.realRouting.test.tsx` | 3 pre-existing tests that encoded the old cross-tree bounce for a zero-permission-in-both-trees role updated to assert the corrected in-shell-denial terminal state | Recorded justification in the PR body; no coverage removed |

TDD gate: a failing test reproducing the bug was written first (red) before any production code changed, per the Lane B mechanic (`.claude/skills/anemal-dev-lanes/references/bugfix.md`); the fix then turned it green. Frontend +6 tests (`AdminLayout.test.tsx`/`ClinicLayout.test.tsx`); backend untouched. Full backend suite re-verified green on `main` before opening the PR and after merge.

## Modal consolidation — shared `Dialog` component across 15 call sites (2026-09-16, PR #80, Lane A)

15 previously hand-rolled modal sites (5 platform-plane on `PlatformModal`, 10 clinic-plane) now share
one component, `src/frontend/src/components/Dialog.tsx` — a plane-neutral rename of
`components/platform/PlatformModal.tsx`. A single 2-branch `DismissalPolicy` prop (`'dismissible'` /
`'blocking'`) derives dialog role (`dialog`/`alertdialog`), Escape/backdrop/close-button behavior, and
unmount-on-close (not CSS-hide, so a consumer's `useEffect` cleanup — `MediaStream`, timers — fires
reliably) instead of each site making its own judgement call. `IdleLogoutModal` migrates onto the
standard under `dismissal='blocking'` (Escape also becomes a no-op, matching APG's `alertdialog`
carve-out) rather than remaining a bespoke exception.

**2 real defects fixed during QA (Step 7):** dismissing the idle-logout warning also unmounted whatever
dialog was open underneath it — each `Dialog` had its own independent Escape listener, a data-loss path
over possibly-unsaved clinical data; fixed with a module-level open-dialog stack so only the topmost
dialog reacts to Escape. A drag-select that started inside the panel and released on the backdrop was
misread as a backdrop click, closing dismissible dialogs unintentionally on tablet; fixed with
press-start tracking and one-shot suppression.

**Known doc defect, filed as backlog `ADR-DUP-1`, not fixed in this pass:** this feature's ADR shipped
as `docs/adr/0027-shared-modal-dismissal-policy-and-plane-neutrality.md`, but ADR-0027 was already taken
by PR #77's `0027-tenant-scoped-relation-traversal-carries-its-own-predicate.md` (merged first). Two
Accepted ADRs currently share the number 0027 — see `.claude/roadmap/phase-history.md` Backlog for the
fix (renumber to 0029, sweep ~15 references, several in production source).

Records: BA sign-off `docs/superpowers/plans/2026-09-11-modal-consolidation-ba-signoff.md`; arch brief
`docs/superpowers/plans/2026-09-11-modal-consolidation-arch-brief.md`; plan + work-partition manifest
`docs/superpowers/plans/2026-09-11-modal-consolidation.md`; QA sign-off
`docs/superpowers/plans/2026-09-11-modal-consolidation-qa-signoff.md`; smoke walkthrough
`docs/superpowers/plans/2026-09-16-modal-consolidation-smoke-walkthrough.md`.

Frontend **581 passing / 0 failing / 71 files** (up from 410/60 — 171 tests / 11 files added). Backend
untouched.

## Cross-tenant relation isolation — structural fix across 20 model files (2026-09-15, PR #77, Lane A)

No FK in the schema references `tenant_id`, so any relation traversal that doesn't carry its own tenant
predicate at the point of traversal can leak, or on the write path corrupt, cross-tenant data — the
same root cause behind PR #73's hotfix, now closed structurally rather than one query at a time.
Establishes and enforces **one rule, three dialects**: Prisma to-one via the root `where`, Prisma
to-many via the nested `where`, raw SQL via the `ON` clause. All 20 affected model files (forward +
reverse relations — 57 `include:` + 19 raw-SQL `JOIN`s across 7 files beyond BA's original forward-only
audit) now carry the guard, checked by a new standing conformance test
(`src/backend/tests/unit/tenantRelationConformance.test.ts`) that fails the suite on any future
unguarded site — PR #73's post-filter pattern is deleted, not extended.

**4 confirmed live leaks fixed** (not hypothetical, found during this pipeline): `invoice.repository.ts`
`findMedicalRecord`'s unguarded `prescriptions.drug` (financial-integrity — a corrupt `drugId` could
write another tenant's `unitPrice` into an invoice line item); `medical-record.repository.ts`
`findById`'s unguarded `attachments.uploadedByUser` (staff-identity leak, nullable FK, OR-fallback
guard); `medical-record.repository.ts`'s `prescriptions.drug` nested inside an already-guarded to-many
(PII leak the conformance analyzer's checkpoint doesn't walk into — found by QA's behavioral tests, not
the analyzer; documented as a standing test and a backlog item, not silently dropped); and 2 files
(`platform-customers.repository.ts`, `loyalty.repository.ts`) with real findings no original task scope
covered, caught at mid-pipeline checkpoints and fixed same-wave.

**New operator tool:** `scripts/tenant-integrity-scan.ts` (`npm run db:integrity-scan`) reports existing
cross-tenant rows for human, per-row remediation — not automatic reassignment/deletion (ADR-0028).
db-agent's own run: 0 corrupt rows across 39 relations.

Resolves PR #73's open hotfix debt (`.claude/roadmap/index.md`) — see that file and
`.claude/roadmap/phase-history.md`'s "PR #77" entry for the full pipeline record, backlog carry-forward
(7 items), and the corrected 109-suites/1454-tests figure. Records: BA sign-off + grill —
`docs/superpowers/plans/2026-09-10-cross-tenant-relation-isolation-ba-signoff.md`; architecture —
`docs/superpowers/plans/2026-09-11-cross-tenant-relation-isolation-arch.md`; ADRs —
`docs/adr/0027-tenant-scoped-relation-traversal-carries-its-own-predicate.md`,
`docs/adr/0028-composite-tenant-foreign-keys-deferred.md`.

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
