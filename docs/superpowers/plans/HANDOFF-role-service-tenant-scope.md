# HANDOFF — role-service-tenant-scope

**Current step:** Step 5 (`@ponytail-agent`) — DONE, APPROVE (run #2).
**Status:** Cleared to proceed to Step 6 (`/execute-plan`). No human decision pending right now.

## Artifacts produced so far

- Step 1 brainstorm (human-approved): [2026-08-27-role-service-tenant-scope.md](2026-08-27-role-service-tenant-scope.md)
- Step 2 PM tasks, v2 reworked + grill delta (RST-1..RST-7): [2026-08-27-role-service-tenant-scope-pm-tasks.md](2026-08-27-role-service-tenant-scope-pm-tasks.md)
- Step 3 BA sign-off (APPROVED WITH CONDITIONS C-1..C-8, all folded): [2026-08-27-role-service-tenant-scope-ba-signoff.md](2026-08-27-role-service-tenant-scope-ba-signoff.md)
- Step 3.5 grill record (all findings resolved): [2026-08-27-role-service-tenant-scope-grill.md](2026-08-27-role-service-tenant-scope-grill.md)
- Step 4 write-plan (9 atomic tasks, Task 1-9, dependency-ordered checkboxes; Tasks 1/2/3/5/8 now marked done): [2026-08-27-role-service-tenant-scope-plan.md](2026-08-27-role-service-tenant-scope-plan.md)
- Step 5 Ponytail gate run #1: REJECT (criterion 2, duplicate work — plan stale vs already-applied working tree). Run #2 (same session): **APPROVE**, all 7 criteria pass.

## Progress note (this run, 2026-08-27)

Tasks 1, 2, 3, 5, 8 (RST-1, RST-2, RST-4, RST-5, RST-6) were found already applied in the
uncommitted working tree at the start of this run (from an earlier same-day iteration). Committed
as `f60dbe5` on `fix/role-service-tenant-scope` ("fix(role): tenant-scope countRoleUsage/listRoles,
catch FK on deleteRole"). Plan doc updated to mark those tasks done with verification pointers to
the commit. Ponytail gate then re-run and APPROVED.

**Still outstanding (per plan, Task 4/6/7/9):**
- Task 4: new file `src/backend/tests/unit/role.repository.test.ts` (T1-T4, cross-tenant exclusion + listRoles scoping tests) — does not exist yet.
- Task 6: re-run `roleManagement.test.ts` + `roleEditor-t5f01.test.ts`, confirm unmodified pass.
- Task 7: repo-wide `npx tsc --noEmit` + schema comment-diff check. **Note:** stale worktree copies at `src/backend/.claude/worktrees/exciting-volhard-2256e8/...` may produce false-positive tsc errors — Ponytail flagged this, ignore that path.
- Task 8's T5/T6 (409-on-drift, happy-path regression) still need to be written/run — service-level tests, not yet created.
- Task 9: fix stale comment in `roleEditor-t5f01.test.ts:142`.

## Human decisions made so far (for reference, do not re-litigate)

1. Include RST-5 (listRoles cross-tenant `_count` fix) in this branch.
2. Add the FK-violation catch in `deleteRole` (RST-6), not the accept-500 alternative.
3. RST-6's catch should be a plain `err.code === 'P2003'` check — matches codebase convention, no `meta.field_name` narrowing (confirmed safe: only one Restrict FK on ClinicRole today).
4. RST-5's visible-number change is a silent bug fix — no release note/customer communication.
5. Fix the stale test comment at `roleEditor-t5f01.test.ts:142` — added as RST-7.

## Exact next action

Run **Step 6 `/execute-plan`** against `docs/superpowers/plans/2026-08-27-role-service-tenant-scope-plan.md`.
Tasks 1/2/3/5/8 are already done (committed `f60dbe5`) — executor should start at **Task 4**, then
6 → 7 → 9 (skip 1/2/3/5/8, they're `- [x]` in the plan). @db-agent review still required per BA
condition C-7 even though the code already exists — review the committed diff `f60dbe5` for
tenant-isolation query safety before Step 7.

Then:
- Step 6 `/execute-plan` (continued) — remaining order: Task 4 → 6 → 7 → 9 (see plan §5, §9).
  `@db-agent` review is mandatory (BA condition C-7: review Task 1/2/4/5 for tenant-isolation query
  safety, confirm the `onDelete: Restrict` interaction Task 8 handles).
- Step 7 `/code-review` + `@qa-agent` sign-off.
- Step 8 `/anemal-finish-branch` — PR body must cite ADR-0025 D-1 (C-8), state the drift
  characterization (DB-insertable, app-unreachable), and note R2-ME-01's `listRoles` half is closed
  by Task 5 (RST-5) while its sibling (`findRoleById`, BA backlog B-1) remains open/tracked
  separately. Must re-verify main's backend suite is green before merge (was 1295/1295, 91 suites, as
  of 2026-08-20 — re-check at Step 8, several commits have landed since).

## Backlog raised (not this branch — file separately per BA sign-off if not already tracked)

- B-1: `findRoleById` cross-tenant existence oracle (403 instead of ADR-0014's 404-not-403 pattern).
- B-2: `CodexCodeReview.md` findings have no route into `.claude/roadmap/` — triage sweep needed.
- B-3: `error-handler.middleware.ts` has no generic `PrismaClientKnownRequestError` mapping.
- B-4: No DB-level constraint ties `UserRole.tenantId` to its role's owning tenant.
