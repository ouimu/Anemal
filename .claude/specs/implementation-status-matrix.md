# Anemal — Implementation Status Matrix

**Updated:** 2026-08-21
**Status:** All modules shipped through Phase 9 + storage (ADR-0023) + Codex security remediation + login identity resolution (ADR-0024) remain implemented and unchanged. This update reflects test-suite repair only (PRs #57, #59, #56) — backend suite restored from 28 failing to fully green, integration fixtures hardened, frontend mock collection failures fixed. No module moved status this pass; one real production fix landed as part of the repair (see below).

## Test-suite repair (2026-08-21, PRs #57/#59/#56, ADR-0025)

| Area | Change | Notes |
|------|--------|-------|
| Backend test suite | 28 failures (ADR-0019 multi-role mock drift + PR #53 `touchLastLogin` mock gap) repaired: 7 tests deleted, 8 rewritten to single-role semantics, 12 fixture fixes | `main` now 1292 passing / 0 failing / 91 suites |
| Invoice payment claim (`claimInvoicePaid`) | Real production defect found during repair: returned `409 INVOICE_ALREADY_PAID` for cross-tenant/wrong-branch/nonexistent invoices, not just in-scope ones | Now ADR-0025: `409` only for an invoice in the caller's own tenant+branch scope, everything else `404`; isolation itself was never at risk |
| Integration test fixtures | 32 hardcoded IDs across 26 `tests/integration/` files given a `Date.now()` suffix | Prevents an interrupted run from stranding rows and cascading failures into the next run |
| Jest config | `.claude/worktrees/` excluded via `testPathIgnorePatterns` | A stray git worktree was making every suite run twice (187 suites/2598 tests vs the real 91/1289) |
| Invoice payment route authorization | `bill-20/21/22`: RBAC deny tests added for `PUT /api/invoices/:id/payment`, which had no authorization test at all before this | Mutation-verified |
| Frontend test mocks | 8 files spreading `importOriginal()` into their `@tanstack/react-query` mock (Dashboard, Pets, Appointments, Branches, ClinicSettings, PetDetail, + 2 more) | These were failing at collection, contributing 0 tests each; recovers 21 real tests, frontend now 351 passing / 55 files |

Known gap, pre-existing and untouched by this repair: backend `npm run lint` cannot run (eslint 9 flat-config migration incomplete — declared script, no flat config present). Deleted-coverage rationale for the 7 removed backend tests: `docs/superpowers/plans/2026-08-20-backend-tests-post-adr-0019-deleted-coverage.md`.

## Login identity resolution (2026-08-20, ADR-0024)

| Area | Change | Notes |
|------|--------|-------|
| Clinic login (branch select → session) | `/auth/me` folded into the branch-selection mutation; session (`sessionStorage` + store) written only after BOTH branch selection and identity resolution succeed | Fixes the full-round-trip login-form re-render ("kicked out") flash on tablet after picking a branch |
| Clinic login | Removed the duplicated `/auth/me` call that previously fired once per login | — |
| Clinic login | On identity-resolution failure, nothing is persisted to `sessionStorage`; branch picker stays mounted with a distinct error instead of a half-built session | Prevents corrupt/partial sessions surviving a failed login |
| Auth store contract | `permissionsLoaded` is now a required field on the `setAuth` payload | Makes the class of regression this branch fixed (`useSwitchBranch` omitting it) a compile-time error, not a runtime one |

Known gaps deliberately deferred, not fixed on this branch (tracked in `.claude/roadmap/phase-history.md` Backlog): `AUTH-BL-1` (401 on `refreshPermissions()` should hard-redirect), `AUTH-BL-2` (non-ok/non-401 leaves `permissionsLoaded` stuck `false`), `AUTH-BL-3` (`/403` is a dead end for a legitimately zero-permission session).

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
