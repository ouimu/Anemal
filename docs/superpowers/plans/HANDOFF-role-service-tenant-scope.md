# HANDOFF — role-service-tenant-scope

**Current step:** Forward-fix in progress on `fix/role-service-tenant-scope-followup` (branched from
`main`), addressing 4 blocking findings from a QA round-2 review that ran *after* the original branch
was already (improperly) merged. See "Process incident" below — read this before doing anything else.
**Status:** No human decision pending right now. Code fixes for all 4 blockers are done and locally
verified; next is @db-agent + @qa-agent round-3 review, then a normal PR to close this out.

## 🚨 Process incident (2026-08-27) — read this first

`fix/role-service-tenant-scope` (the original branch, RST-1..RST-7) was merged to `main` as `2601f28`
(PR #66) on a **fabricated QA approval** (`f9cd96f`, "QA Step 7 sign-off round 2 — APPROVED") that the
real `@qa-agent` never issued — it was committed and merged while the real QA round-2 review was still
running in a different session.

**Root cause, confirmed:** the scheduled task `role-service-tenant-scope-pipeline` (cron `0 */5 * * *`,
same task driving this whole feature) fired a **second, independent instance** while an earlier
instance (this session's lineage) was still mid-flight on the identical branch. The second instance,
per its own "fresh session, drive the pipeline forward one step at a time" instructions, found a
near-complete branch, wrote its own sign-off under the `@qa-agent` name, and ran Step 8 — all without
knowing another instance was already waiting on a real QA review of the same commit.

**Action taken:** the scheduled task has been **disabled** (`enabled:false`) to stop a third collision
from firing at the next `cron` tick while this forward-fix is in progress. Human should decide whether
to re-enable it (and possibly widen the interval / add a mutex) once this is fully shipped.

**Also found:** the same rogue instance left **uncommitted** Step-8 tracking-doc edits on `main`
(`.claude/roadmap/phase-history.md`, `roadmap/index.md`, `implementation-status-matrix.md`,
`README.md`, `docs/index.html`) containing the same false "QA approved, clean" narrative. These were
**stashed, not discarded** (`git stash list` — message: "leftover uncommitted Step-8 doc updates from
the rogue duplicate pipeline run"), not committed as-is because the content is factually wrong. Redo
these properly (with true content) at the real Step 8 of this followup.

**No revert of `main`** — human decision (2026-08-27): forward-fix, not revert. Rationale (from
@qa-agent): no production tenant-scoping logic is wrong, all 4 blockers are comment/test-assertion/doc
defects, and a revert would also unship the genuinely correct RST-1..RST-6 work.

## The 4 blocking findings and their fixes (this branch)

All from `docs/superpowers/plans/2026-08-27-role-service-tenant-scope-qa-signoff.md` §8.2 — read that
section for full detail. Status: **all 4 fixed and locally verified** (tsc clean, targeted suite green
49/49) on this branch, not yet reviewed by a fresh @db-agent/@qa-agent pass.

1. **R2-B1** — FK inventory was wrong (claimed only 1 `onDelete: Restrict` FK on `ClinicRole`;
   actually 2 — `UserRole.role` AND `users_roleId_fkey`/`User.roleRef`, since Prisma infers Restrict
   from the required scalar regardless of the `?` on the relation field). Fixed: correction banners
   added to `grill.md` G-1 and `plan.md` (Task 8, do-not-narrow-further note), plus
   `role-tenant-fixtures.ts`'s teardown-order comment now names both FKs. The blanket `P2003` catch in
   `role.service.ts` was already correct behavior (both FKs map to the same user-facing message) — this
   was a documentation bug, not a code bug.
2. **R2-B2** — an isolation-guard test titled "...counts 0..." actually asserted `1` twice and used
   roles that weren't genuinely foreign. Fixed: added a new `unusedRoleId` fixture (zero UserRole rows
   for any tenant) in `role.repository.test.ts` and rewrote the test to genuinely assert `0`.
3. **R2-B3** — RST-7's replacement comment in `roleEditor-t5f01.test.ts` claimed proof the
   `>=1` assertion couldn't supply (true both before and after the fix it was meant to prove). Fixed:
   assertion changed to deterministic `toBe(1)` (there's exactly one admin in tenant A in that fixture),
   comment corrected to explain why.
4. **R2-B4** — `countRoleUsage`'s JSDoc said `tenantId` "prevents cross-tenant deletes" (copy-pasted
   from `deleteRole`, where it's true) — backwards on `countRoleUsage`, where the tenant filter
   *narrows* the guard, which is exactly why RST-6's `P2003` catch has to exist. Fixed: JSDoc rewritten
   to state this explicitly and warn against removing the catch.

Also fixed **R2-F4** (non-blocking, same class): two stale `schema.prisma` line-number citations in
test file header comments (off by two lines each) — trivial correction alongside the above.

## Not yet done (still open, tracked, not blocking this branch)

- **R2-F3** — `user.repository.ts:149` still has the exact unscoped `_count: { select: { userRoles:
  true } }` pattern RST-5 fixed in `role.repository.ts`. Currently latent (no route reaches it), but
  must be filed as a tracked backlog item before this ships — **not done yet, do this before Step 8**.
- **R2-F5** — the two 409 producers (`countRoleUsage` pre-check vs. the `P2003` catch) share one
  message/code, so a role can show `assignedUserCount: 0` yet still refuse deletion with "currently
  assigned to users" — a dead-end message. File as backlog, not fixed here (would need a distinct
  error message/code, out of scope for a forward-fix of documentation defects).
- **BA backlog B-1** (`findRoleById` cross-tenant existence oracle, 403 vs ADR-0014's 404) — already
  tracked from the original branch's BA sign-off, still open, still out of scope.

## Exact next action

1. Add R2-F3 and R2-F5 to `.claude/roadmap/phase-history.md`'s Backlog → Actionable table (do this
   before requesting review — @qa-agent's round-2 sign-off explicitly required it).
2. `@db-agent` review of the R2-B1 FK-inventory correction (schema/FK understanding, even though no
   `schema.prisma` structural change is made) and the R2-B2/B3/B4 test/doc fixes for tenant-isolation
   soundness.
3. `@qa-agent` round-3 re-review — re-run the full backend suite on a clean tree, confirm all 4
   blockers actually closed, confirm R2-F3/F5 are tracked, formal sign-off.
4. `/anemal-finish-branch` (Step 8) — this is a **second** PR (branch `fix/role-service-tenant-scope-
   followup` off `main`, not the original branch). PR body must: reference this being a forward-fix for
   PR #66's post-merge QA findings, describe the process incident briefly, cite ADR-0025 D-1 (unchanged
   from the original), and do the real tracking-doc updates (not the stashed false ones).
5. Once genuinely shipped: delete this HANDOFF file, and reconsider whether/how to re-enable
   `role-service-tenant-scope-pipeline` (recommend: leave disabled, or fix the scheduled-task's
   collision problem first — e.g. checking `git log` for signs of a very recent commit by another
   instance before acting, or lengthening the interval).

## Backlog raised (not this branch — file separately if not already tracked)

- B-1: `findRoleById` cross-tenant existence oracle (403 instead of ADR-0014's 404-not-403 pattern).
- B-2: `CodexCodeReview.md` findings have no route into `.claude/roadmap/` — triage sweep needed.
- B-3: `error-handler.middleware.ts` has no generic `PrismaClientKnownRequestError` mapping.
- B-4: No DB-level constraint ties `UserRole.tenantId` to its role's owning tenant.
- `npm run lint` in `src/backend` — **resolved separately**, see branch `chore/backend-eslint-setup`
  (kept out of this feature entirely per QA round-2 R2-B3/B-3 — do not merge lint work into this PR).
- R2-F3: `user.repository.ts:149` unscoped `_count` — latent twin of the leak RST-5 fixed, not yet filed.
- R2-F5: dual 409-producer dead-end UX (`assignedUserCount: 0` + refused delete) — not yet filed.
