# Anemal — Roadmap Index

**Updated:** 2026-09-09
**Status:** `main` green. **PR #71 merged 2026-09-09** (`d92ca6e`) restructures the agent team and repairs the documentation estate — orchestration/docs only, `src/` untouched, backend unchanged at 1310 / 93 suites. Adds `@arch-agent` (Step 3.4) and `@scribe-agent` (owns Step 8), splits Step 6 into four parallel workers under a work-partition manifest, extends the Ponytail gate to 9 criteria across three modes, and adds Lanes B/C/D (`/anemal-fix-bug`, `/anemal-hotfix`, `/anemal-refactor`) so a bug no longer walks the eight-step feature pipeline. Repaired a missing spec cited on 9 live lines, a schema duplicated with drift, a prototype directory 13 files pointed at that never existed, and 42 MB of unignored worktrees; 0 broken references remain across 351 markdown files. See `phase-history.md` "PR #71". PR #69 merged 2026-08-29 (`5bab064`) closes out the PR #66 tenant-scope follow-up — a forward-fix for round-2/round-3 QA blockers (all comment/test-assertion/doc defects, zero production-logic changes) plus the record of the incident that let PR #66 merge on a fabricated QA approval. See `phase-history.md` "PR #69" entry for full detail; `docs/superpowers/plans/2026-08-27-role-service-tenant-scope-qa-signoff.md` §10 has the real sign-off. PR #67 merged 2026-08-27 (`2367c64`) installs eslint for the backend — `npm run lint` now runs clean (0 errors, 1 warning). PR #66 merged 2026-08-27 (`2601f28`) tenant-scopes `countRoleUsage`/`listRoles` in `role.repository.ts` and fixes the stale pre-ADR-0019 schema comment. PR #62 merged 2026-08-26 (`d85eee0`, **ADR-0026**) closes the three auth backlog items left by PR #54. See `.claude/roadmap/phase-history.md` for full detail. **Backlog now:** `R3-F1` (HIGH, FK `ON DELETE` drift, needs `@db-agent`), `R2-F3`, `R2-F5`, `B-1`, plus the pre-existing per-worker DB isolation (`TEST-BL-2`) and payment-probe audit logging. None are open defects reachable in production today.
**Latest tests:** Backend 1310 passing / 0 failing / 93 suites (up 1 from PR #69's restored falsifiable tenant-isolation guard test). Frontend 410 passing / 60 files. `tsc --noEmit` clean on both; backend eslint 0 errors / 1 warning; frontend eslint 0 errors (2 pre-existing warnings). Known gap, pre-existing and not a ship blocker: bare parallel `npx jest` is unsupported by design — the integration suites share one test database with no per-worker isolation, so the canonical `npm test` (`--runInBand`) is the supported command (`TEST-BL-1`; PR #64 fixed the serial-safe traps but parallel safety needs per-worker DB isolation, tracked as `TEST-BL-2`).
**Blocked:** Phase 10 (payment gateway + SaaS billing) and Phase 11 (LINE/SMS dispatch) both paused, pending external credentials.

See `.claude/roadmap/phase-history.md` for the full shipped-phase changelog and ADR index. See the Backlog section of `phase-history.md` for the current task backlog (the old ACTIVE/remaining-tasks.md was retired — do not recreate it). See `.claude/specs/implementation-status-matrix.md` for module-level implementation status.

---

## Open hotfix debt

Every Lane C merge adds a row here, and `@scribe-agent` blocks the merge if it is missing. A row is
removed only when its follow-up ships. Debt older than one phase is raised to the human by `@pm-agent`.

| Date | Branch | Symptom | Exemptions used | Follow-up |
|------|--------|---------|-----------------|-----------|
| 2026-09-10 | hotfix/vaccination-due-soon-cross-tenant-pii-leak | `findDueSoon` leaked cross-tenant pet/owner PII (name, phone) via an unguarded Prisma `include` when a vaccination row's `petId` FK pointed at a pet in another tenant — a data-integrity state the schema does not prevent (`vaccinations.pet_id` has no composite FK on `tenant_id`) | Skipped brainstorm · BA · `/grill-with-docs` · arch · ponytail | Lane B: audit remaining repositories for the same unguarded-`include` pattern (nested Prisma `include` that follows a FK without re-checking `tenantId`) · Lane A (`@db-agent`): decide whether to add compound tenant-scoped FKs / triggers across pet↔owner↔vaccination chains instead of per-repository app-level guards |

---

## Pipeline metrics — the P4 retro ledger

One row per shipped branch, written by `@scribe-agent` at Step 8. The retro cannot be run on
recollection, so the data is recorded as it happens rather than reconstructed later.

| Date | Branch | Lane | Arch tier | Arch changed the plan? | Ponytail verdict | Criterion | Waves | Cycle |
|------|--------|------|-----------|------------------------|------------------|-----------|-------|-------|
| 2026-09-09 | `chore/doc-estate-repair` (PR #71) | — | n/a — predates the pipeline it installs | n/a | n/a | — | 1 | same day |

**Column meanings.** *Arch tier*: `brief` · `full` · `skipped (below threshold)` · `n/a` (lane B/C/D).
*Arch changed the plan?*: `yes — <what the plan would have done otherwise>` or `no`. This is the single
most important column and the honest answer is often "no" — record it anyway. *Ponytail verdict*:
`PASS` · `FLAG` · `BLOCK` (mode `arch-precheck`) or `APPROVE` · `REJECT` (mode `gate`). *Criterion*: the
number that fired, or `—`. *Waves*: how many of W0/W1/W2 actually ran in parallel; `1` means the work
was sequenced. *Cycle*: first commit to merge.

**The retro runs when the ledger holds 3 Lane A features and 3 Lane B bugs.** Its decisions are fixed
in advance so the result is not argued after the fact:

| Signal in the ledger | Decision |
|----------------------|----------|
| "Arch changed the plan" is `no` in ≥ 2 of 3 features | fold `@arch-agent` back into `@ba-agent` — 2 files deleted, no code affected |
| ≥ 60% of Ponytail rejections cite **#8 or #9** | architecture review is a different job from size review — split it out of `@ponytail-agent` |
| ≥ 60% cite **#1–#7** | keep the modes in one agent; the current shape is right |
| ≥ 1 of 3 bugs escalated from Lane B to Lane A | the escalation rule is working; leave it |
| 0 bugs escalated **and** any bug touched schema or a contract | Lane B is being used as a bypass — tighten the gate |
| Waves = `1` in ≥ 2 of 3 features | contracts are not being frozen usefully; parallelism is theatre — drop it or fix Step 3.4 |
| Hotfix debt older than one phase | the follow-up gate is not being honoured — escalate to the human |
