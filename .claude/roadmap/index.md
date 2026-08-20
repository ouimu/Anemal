# Anemal — Roadmap Index

**Updated:** 2026-08-20
**Status:** Login identity-resolution atomicity fix shipped — removes the branch-select login flash by folding `/auth/me` into the branch-selection mutation and only establishing a session once both succeed (ADR-0024), merged to `main` via PR #54. Ponytail-agent APPROVE 7/7, QA-agent APPROVE unconditional after 3 rounds, 9/9 P5 browser smoke passed. Three backlog items raised and deliberately deferred (`AUTH-BL-1..3`, stale-permission/dead-end-403 edge cases) — see `.claude/roadmap/phase-history.md` Backlog section.
**Latest tests:** 330 frontend passing (was 309 pre-merge, +21 this branch). `tsc --noEmit` clean, `eslint` 0 errors. **Not fully green:** 28 backend test failures (incomplete Prisma mocks) and 8 frontend test files failing at collection (broken `@tanstack/react-query` mock, 0 tests collected from Dashboard/Pets/Appointments/Branches/ClinicSettings/PetDetail) are both pre-existing on `main` and unrelated to this branch — see phase-history.md for detail.
**Blocked:** Phase 10 (payment gateway + SaaS billing) and Phase 11 (LINE/SMS dispatch) both paused, pending external credentials.

See `.claude/roadmap/phase-history.md` for the full shipped-phase changelog and ADR index. See the Backlog section of `phase-history.md` for the current task backlog (the old `ACTIVE/remaining-tasks.md` was retired — do not recreate it). See `.claude/specs/implementation-status-matrix.md` for module-level implementation status.
