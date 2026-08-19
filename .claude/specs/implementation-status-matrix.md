# Anemal — Implementation Status Matrix

**Updated:** 2026-08-06
**Status:** All modules shipped through Phase 9 + storage (ADR-0023) remain implemented and unchanged. This update reflects the Codex security review remediation branch (`fix/codex-review-critical-high`, PR #53), which hardened existing modules rather than adding new ones — no module moved status this pass.

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
