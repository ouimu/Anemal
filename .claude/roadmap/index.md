# Anemal — Roadmap Index

**Updated:** 2026-09-16
**Status:** `main` green. **PR #80 merged 2026-09-16** (`230e644`, **Lane A feature, full 8-step pipeline**, Phase 6 modal consolidation) consolidates 15 hand-rolled modal call sites onto one shared `Dialog` component (renamed from `components/platform/PlatformModal.tsx`), driven by a single 2-branch `DismissalPolicy` contract (`'dismissible'`/`'blocking'`) instead of per-site judgement calls; fixed 2 real defects in QA (idle-logout dismissal unmounting the dialog underneath it — data loss risk — and a tablet drag-select-onto-backdrop misfire). Frontend-only, `git diff` over `src/backend` empty. Full detail: `phase-history.md` "PR #80" entry. **Doc defect found at this close-out, filed as backlog `ADR-DUP-1`, not yet fixed:** its ADR shipped as `docs/adr/0027-shared-modal-dismissal-policy-and-plane-neutrality.md`, but ADR-0027 was already taken by PR #77 (below) — two Accepted ADRs currently share number 0027; see `phase-history.md` Backlog. **PR #77 merged 2026-09-15** (`f870757`, branch `docs/cross-tenant-isolation-ba-signoff`, **Lane A feature, full 8-step pipeline**) closes the structural gap behind PR #73's hotfix — no FK in the schema references `tenant_id`, so any relation traversal without its own tenant predicate can leak or corrupt cross-tenant data. Establishes and enforces one rule in three dialects (Prisma to-one via the root `where`, Prisma to-many via the nested `where`, raw SQL via the `ON` clause) across all 20 affected model files, backed by a new conformance-test analyzer that fails the suite on any future unguarded site. Fixed 4 confirmed live leaks found during the pipeline, including a financial-integrity defect in `invoice.repository.ts`'s `findMedicalRecord`. Adds `scripts/tenant-integrity-scan.ts` (`npm run db:integrity-scan`) for human, per-row remediation of any existing cross-tenant rows. **This PR is the resolution of PR #73's "Open hotfix debt" row** (see that section below — row removed, closure recorded there) — the false "already guarded" code-comment claim that shipped with PR #73 is corrected, and a new Lane C process gate (`hotfix.md` §5a) closes the gap that let it ship. Full detail: `phase-history.md` "PR #77" entry. **PR #73 merged 2026-09-10** (`ee617b1`, branch `hotfix/vaccination-due-soon-cross-tenant-pii-leak`, **Lane C hotfix**) fixes a cross-tenant PII leak in `findDueSoon` (`vaccination.repository.ts`) — an unguarded Prisma `include` returned another tenant's pet name and owner name/phone whenever a vaccination row's `petId` FK pointed cross-tenant; `vaccinations.pet_id` carries no composite FK on `tenant_id`, so the schema does not prevent this data-integrity state. Latent — not reachable through the app's own write path today, no confirmed live exploitation, found via QA fault-injection. Permanent regression test added (`vaccinationDueSoonTenantLeak.test.ts`). Lane C exemptions (brainstorm/BA/grill/arch/ponytail) recorded; `main` was green before merge so no red-suite exemption applied. Open hotfix debt recorded below (Lane B repo-wide audit + Lane A `@db-agent` schema decision) — see "Open hotfix debt" section. **PR #71 merged 2026-09-09** (`d92ca6e`) restructures the agent team and repairs the documentation estate — orchestration/docs only, `src/` untouched, backend unchanged at 1310 / 93 suites. Adds `@arch-agent` (Step 3.4) and `@scribe-agent` (owns Step 8), splits Step 6 into four parallel workers under a work-partition manifest, extends the Ponytail gate to 9 criteria across three modes, and adds Lanes B/C/D (`/anemal-fix-bug`, `/anemal-hotfix`, `/anemal-refactor`) so a bug no longer walks the eight-step feature pipeline. Repaired a missing spec cited on 9 live lines, a schema duplicated with drift, a prototype directory 13 files pointed at that never existed, and 42 MB of unignored worktrees; 0 broken references remain across 351 markdown files. See `phase-history.md` "PR #71". PR #69 merged 2026-08-29 (`5bab064`) closes out the PR #66 tenant-scope follow-up — a forward-fix for round-2/round-3 QA blockers (all comment/test-assertion/doc defects, zero production-logic changes) plus the record of the incident that let PR #66 merge on a fabricated QA approval. See `phase-history.md` "PR #69" entry for full detail; `docs/superpowers/plans/2026-08-27-role-service-tenant-scope-qa-signoff.md` §10 has the real sign-off. PR #67 merged 2026-08-27 (`2367c64`) installs eslint for the backend — `npm run lint` now runs clean (0 errors, 1 warning). PR #66 merged 2026-08-27 (`2601f28`) tenant-scopes `countRoleUsage`/`listRoles` in `role.repository.ts` and fixes the stale pre-ADR-0019 schema comment. PR #62 merged 2026-08-26 (`d85eee0`, **ADR-0026**) closes the three auth backlog items left by PR #54. See `.claude/roadmap/phase-history.md` for full detail. **Backlog now:** `R3-F1` (HIGH, FK `ON DELETE` drift, needs `@db-agent`), `R2-F3`, `R2-F5`, `B-1`, plus the pre-existing per-worker DB isolation (`TEST-BL-2`) and payment-probe audit logging, **plus 6 new items from PR #77** (cross-tenant relation isolation) — see `phase-history.md` Backlog table for `E-6`, the analyzer to-many-nesting gap, `F2`, `F4`, XTI-12 perf, and XTI-13 registry-parity conversion. None are open defects reachable in production today.
**Latest tests:** Frontend **581 passing / 0 failing / 71 test files** (up 171 tests / 11 files — PR #80's `Dialog.test.tsx`, `modal-consistency.test.ts`, and consumer-site regression suites; the pre-existing 410/60 are unchanged). Backend unchanged at 1454 passing / 0 failing / 109 suites (PR #80 touches no backend file, not re-run for this close-out). `tsc --noEmit` clean on both; backend eslint 0 errors / 1 warning; frontend eslint 0 errors (2 pre-existing warnings). **New note (PR #77):** the full backend suite must run 4-way sharded (`--shard=N/4 --runInBand --forceExit`, `testPathIgnorePatterns` reduced to `['/node_modules/']` when run from inside a `.claude/worktrees/` checkout — the checked-in pattern excludes the worktree's own path) — an unsharded run exhausts Postgres `max_connections=100` around suite 47 regardless of code correctness (backlog `F4`). Known gap, pre-existing and not a ship blocker: bare parallel `npx jest` is unsupported by design — the integration suites share one test database with no per-worker isolation, so the canonical `npm test` (`--runInBand`) is the supported command (`TEST-BL-1`; PR #64 fixed the serial-safe traps but parallel safety needs per-worker DB isolation, tracked as `TEST-BL-2`).
**Blocked:** Phase 10 (payment gateway + SaaS billing) and Phase 11 (LINE/SMS dispatch) both paused, pending external credentials.

See `.claude/roadmap/phase-history.md` for the full shipped-phase changelog and ADR index. See the Backlog section of `phase-history.md` for the current task backlog (the old ACTIVE/remaining-tasks.md was retired — do not recreate it). See `.claude/specs/implementation-status-matrix.md` for module-level implementation status.

---

## Open hotfix debt

Every Lane C merge adds a row here, and `@scribe-agent` blocks the merge if it is missing. A row is
removed only when its follow-up ships. Debt older than one phase is raised to the human by `@pm-agent`.

Row removed 2026-09-15 — **follow-up shipped, PR #77.** Both Lane B/Lane A follow-up items are closed:
the repo-wide audit for the unguarded-`include` pattern was subsumed by PR #77's full 20-file forward
**and** reverse-relation sweep (wider than the original ask), and the schema-level question (compound
tenant FKs / triggers) was answered by `@arch-agent` and ruled on in ADR-0028 — **Option A (composite
tenant FKs) stays deferred**, Option C (the app-level guard, now enforced by a standing conformance
test) ships instead. Historical row, kept for the record:

| Date | Branch | Symptom | Exemptions used | Follow-up | Closed |
|------|--------|---------|-----------------|-----------|--------|
| 2026-09-10 | hotfix/vaccination-due-soon-cross-tenant-pii-leak | `findDueSoon` leaked cross-tenant pet/owner PII (name, phone) via an unguarded Prisma `include` when a vaccination row's `petId` FK pointed at a pet in another tenant — a data-integrity state the schema does not prevent (`vaccinations.pet_id` has no composite FK on `tenant_id`) | Skipped brainstorm · BA · `/grill-with-docs` · arch · ponytail | Lane B: audit remaining repositories for the same unguarded-`include` pattern (nested Prisma `include` that follows a FK without re-checking `tenantId`) · Lane A (`@db-agent`): decide whether to add compound tenant-scoped FKs / triggers across pet↔owner↔vaccination chains instead of per-repository app-level guards | **2026-09-15, PR #77** |

**Correction (2026-09-11, branch `docs/cross-tenant-isolation-ba-signoff`, tasks XTI-4/XTI-8):**
`findDueSoonWorklist` (`vaccination.repository.ts`) was in fact **unguarded** at PR #73 merge time.
The code comment at `vaccination.repository.ts:30` and the PR #73 commit message (`1add331`) both
claimed `findDueSoonWorklist` already had "explicit tenantId join guards" — that claim was false; no
such guard existed on that function at merge. This change corrects the comment (XTI-4) and adds the
actual tenant-scoped join guard to `findDueSoonWorklist` (XTI-8), so the statement becomes true rather
than being removed.

---

## Pipeline metrics — the P4 retro ledger

One row per shipped branch, written by `@scribe-agent` at Step 8. The retro cannot be run on
recollection, so the data is recorded as it happens rather than reconstructed later.

| Date | Branch | Lane | Arch tier | Arch changed the plan? | Ponytail verdict | Criterion | Waves | Cycle |
|------|--------|------|-----------|------------------------|------------------|-----------|-------|-------|
| 2026-09-09 | `chore/doc-estate-repair` (PR #71) | — | n/a — predates the pipeline it installs | n/a | n/a | — | 1 | same day |
| 2026-09-10 | `hotfix/vaccination-due-soon-cross-tenant-pii-leak` (PR #73) | C | n/a — Lane C skips arch | n/a | n/a — Lane C skips ponytail | — | 1 | same day |
| 2026-09-15 | `docs/cross-tenant-isolation-ba-signoff` (PR #77) | A | full — 2 rework rounds before freeze (rev 2 rejected the analyzer contract, rev 3 fixed a signature-ownership gap) | yes — rev 1's literal-`where`/`include`-only analyzer contract would have exempted the very T1 files (`pet.findPets`, `pet.findPetById`) holding the defect it exists to catch; rev 3 also added `client?` to `findPetById` instead of building a new `findPetForBooking` the plan's first draft called for | REJECT (arch-precheck, rev 1, criterion #1 over-engineering) -> REJECT (gate, rev 1 of the plan, arch/plan drift on §4.1 signatures) -> **APPROVE** (gate, 3rd round) | #1 (1st precheck) then drift (1st gate round) | 3 (W0 serial, W1 4-way parallel, W2 4-way parallel) | 2026-09-11 to 2026-09-15 (4 days — dominated by `@db-agent`'s 4-round XTI-14 review, 3 VETOs) |
| 2026-09-16 | Phase 6 modal consolidation (PR #80) | A | brief — arch-precheck flagged the initial dismissal-policy union as over-complex before the plan was written | yes — the arch brief's first-draft 3-branch `DismissalPolicy` union would otherwise have shipped as designed; the arch-precheck FLAG forced simplification to 2 branches before Step 3.5 grill, and the plan implements the 2-branch contract | FLAG (arch-precheck — criterion not individually numbered in the surviving docs; finding was "3-branch union is unnecessary complexity") -> **APPROVE** (gate, all 9 criteria, no arch/plan drift) | not recorded as a numbered criterion in the surviving arch-precheck doc | 5 (W0/W1 serial — rename + contract, single owner; W2 10-way parallel fan-out; W3 serial — consistency/census pass; W4 serial — deferred BarcodeScanner) | 2026-09-11 to 2026-09-16 (dominated by a local-environment DB-credential blocker on the Step 8 smoke walkthrough, not by review rounds) |

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
