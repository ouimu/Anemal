# Anemal — Implementation Status Matrix

**Updated:** 2026-08-20
**Status:** All modules shipped through Phase 9 + storage (ADR-0023) + Codex security remediation remain implemented and unchanged. This update reflects the login identity-resolution atomicity fix (PR #54, ADR-0024) — a hardening fix to the existing clinic login module (branch selection + `/auth/me`), not a new module. No module moved status this pass.

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
