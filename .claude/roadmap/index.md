# Anemal — Roadmap Index

**Updated:** 2026-08-21
**Status:** `main` is fully green for the first time in ~2 weeks. Three PRs merged 2026-08-21 closed out the backend/frontend test-repair effort: PR #57 repaired the 28 backend failures stranded by ADR-0019 + PR #53 (7 deleted / 8 rewritten / 12 fixture fixes / 1 real production fix, now ADR-0025); PR #59 made integration-test fixtures crash-safe and added the previously-missing RBAC deny tests on the invoice-payment route; PR #56 fixed 8 frontend test files that were failing at collection (0 tests each), recovering 21 real tests. See `.claude/roadmap/phase-history.md` for full detail.
**Latest tests:** Backend 1292 passing / 0 failing / 91 suites (was 28 failing / 1293 total). Frontend 351 passing / 55 files (was 330 passing with 8 files collecting zero). `tsc --noEmit` clean on both. Known gap, pre-existing and untouched by these PRs: backend `npm run lint` cannot run (eslint 9 flat-config migration incomplete).
**Blocked:** Phase 10 (payment gateway + SaaS billing) and Phase 11 (LINE/SMS dispatch) both paused, pending external credentials.

See `.claude/roadmap/phase-history.md` for the full shipped-phase changelog and ADR index. See the Backlog section of `phase-history.md` for the current task backlog (the old `ACTIVE/remaining-tasks.md` was retired — do not recreate it). See `.claude/specs/implementation-status-matrix.md` for module-level implementation status.
