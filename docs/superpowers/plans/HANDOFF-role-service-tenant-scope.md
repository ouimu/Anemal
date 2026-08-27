# HANDOFF — role-service-tenant-scope

**Current step:** Step 6 (`/execute-plan`) — DONE. All 9 tasks implemented and verified. Full
backend suite green (1309/1309, 93 suites). **@db-agent review (BA condition C-7) not yet run —
dispatched now, this is the gating item before Step 7.**
**Status:** No human decision pending.

## Correction note (2026-08-27)

An earlier revision of this HANDOFF and of the plan doc's §9 claimed a "Ponytail gate run #2" and a
"run #1 REJECT (criterion 2, duplicate work)." **That never happened.** The actual pipeline record:
@ponytail-agent reviewed this plan exactly once and returned a clean **APPROVE on all 7 criteria**
(no reject, no second run). That fabricated narrative has been corrected in both this file and
`2026-08-27-role-service-tenant-scope-plan.md` §9. No gate was bypassed — the code that shipped
matches what was actually approved — but the false pipeline history should not have been written and
is corrected here so it doesn't get carried into Step 8's PR body or the phase-history changelog.

## Artifacts produced so far

- Step 1 brainstorm (human-approved): [2026-08-27-role-service-tenant-scope.md](2026-08-27-role-service-tenant-scope.md)
- Step 2 PM tasks (RST-1..RST-7): [2026-08-27-role-service-tenant-scope-pm-tasks.md](2026-08-27-role-service-tenant-scope-pm-tasks.md)
- Step 3 BA sign-off (APPROVED WITH CONDITIONS, all folded): [2026-08-27-role-service-tenant-scope-ba-signoff.md](2026-08-27-role-service-tenant-scope-ba-signoff.md)
- Step 3.5 grill record (all findings resolved): [2026-08-27-role-service-tenant-scope-grill.md](2026-08-27-role-service-tenant-scope-grill.md)
- Step 4 write-plan (9 tasks) + Step 6 completion log: [2026-08-27-role-service-tenant-scope-plan.md](2026-08-27-role-service-tenant-scope-plan.md)
- Step 5 Ponytail: **APPROVE, all 7 criteria pass** (single run — see correction note above)

## Branch state

`fix/role-service-tenant-scope`, checked out. Commits:
- `f60dbe5` — Tasks 1,2,3,5,8 (countRoleUsage/listRoles tenant-scoping, deleteRole FK catch, ADR-0019 comment fix)
- `644b625` — docs: pipeline artifacts Steps 1-5

Uncommitted (Task 4/6/9 output, need committing before Step 8):
- New: `src/backend/tests/unit/role.repository.test.ts`, `src/backend/tests/unit/role.service.test.ts`
- Modified: `src/backend/tests/integration/roleEditor-t5f01.test.ts` (comment-only, Task 9)
- Modified: `docs/superpowers/plans/2026-08-27-role-service-tenant-scope-plan.md` (checkboxes + corrections)
- Modified: this HANDOFF file

## Test results (Step 6, by @qa-agent)

Full backend suite: **1309/1309 passed, 0 failed, 93 suites** (main's 1295 baseline + 14 new cases).
Three falsifiability probes run and reverted — see plan doc Task 4 section.

**Note for @qa-agent at Step 7:** the plan's original Task 4 fixture spec (one legit + one drifted
row on a single role, asserting count 0) was internally inconsistent and would fail against correct
code. @qa-agent caught this during implementation and shipped a corrected two-role fixture
(`sharedRoleId` + `orphanRoleId`) instead — documented in a header comment in
`role.repository.test.ts` and in the plan doc's Task 4 section. This is not an open issue, just
context so Step 7 doesn't re-litigate it.

## Exact next action

**@db-agent review — BA sign-off condition C-7, CLAUDE.md Critical Rule (every query must include
`WHERE tenant_id`), and generally mandatory before any DB-touching change merges. Not yet run —
dispatching now.** Scope: review Tasks 1, 2, 4, 5 for tenant-isolation query safety, confirm the
`onDelete: Restrict` interaction Task 8 handles, confirm Task 3's comment wording against the live
schema and ADR-0019.

Then:
- **Step 7 — `/code-review` + `@qa-agent` sign-off.** @qa-agent's Step 6 report explicitly withheld
  sign-off pending this. Commit the uncommitted Task 4/6/9 files first, then run `/code-review`
  against the full branch diff.
- Note from @qa-agent: `npm run lint` in `src/backend` is dead on `main` (eslint not in
  devDependencies/node_modules/.bin, no config file) — pre-existing, not caused by this branch, not a
  Step 7 blocker.
- **Step 8 `/anemal-finish-branch`** — PR body must cite ADR-0025 D-1, state the drift
  characterization (DB-insertable/app-unreachable), note R2-ME-01's `listRoles` half is closed while
  `findRoleById` (BA backlog B-1) stays open/tracked separately. Must re-verify main's backend suite
  is still green before merge.
- After Step 8 merges: update tracking docs per CLAUDE.md (phase-history.md, roadmap/index.md,
  implementation-status-matrix.md, README footer, docs/index.html), move the Backlog "Actionable" row
  for role.service/schema in phase-history.md to Resolved, delete this HANDOFF file, then call
  `update_scheduled_task` with taskId `role-service-tenant-scope-pipeline` and `enabled:false`.

## Human decisions made so far (for reference, do not re-litigate)

1. Include RST-5 (listRoles cross-tenant `_count` fix) in this branch.
2. Add the FK-violation catch in `deleteRole` (RST-6), not the accept-500 alternative.
3. RST-6's catch is a plain `err.code === 'P2003'` check — matches codebase convention, no `meta.field_name` narrowing.
4. RST-5's visible-number change is a silent bug fix — no release note/customer communication.
5. Fix the stale test comment at `roleEditor-t5f01.test.ts:142` — added as RST-7.

## Backlog raised (not this branch — file separately if not already tracked)

- B-1: `findRoleById` cross-tenant existence oracle (403 instead of ADR-0014's 404-not-403 pattern).
- B-2: `CodexCodeReview.md` findings have no route into `.claude/roadmap/` — triage sweep needed.
- B-3: `error-handler.middleware.ts` has no generic `PrismaClientKnownRequestError` mapping.
- B-4: No DB-level constraint ties `UserRole.tenantId` to its role's owning tenant.
- New (from @qa-agent, Step 6): `npm run lint` is dead on `main` in `src/backend` (missing eslint
  devDependency + config) — pre-existing, unrelated to this branch.
