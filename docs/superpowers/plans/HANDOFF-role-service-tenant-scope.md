# HANDOFF — role-service-tenant-scope

**Current step:** Step 8 (`/anemal-finish-branch`) is in progress. PR opened:
**https://github.com/ouimu/Anemal/pull/69** (`fix/role-service-tenant-scope-followup` → `main`).

**Status: BLOCKED ON HUMAN MERGE APPROVAL.** Everything up to "merge" is done and verified;
the `anemal-finish-branch` skill's own rule ("never merge without being asked") plus this
being a scheduled/unattended run means the merge itself needs a human to click merge (or
explicitly tell a future session to merge it).

## What's done, this run (2026-08-29)

1. Independently re-verified QA `§10` (not just trusted it): tree clean before/after, `tsc
   --noEmit` clean, 3 role suites 31/31, non-comment diff `2601f28..HEAD` on `role.repository.ts`
   empty — matches the sign-off's own numbers.
2. Branch was 2 commits behind `origin/main` (PR #67 eslint, PR #68 docs close-out). Merged
   `origin/main` into the branch (commit `615285c`) — one real conflict, in
   `.claude/roadmap/phase-history.md` (both sides added Backlog/Resolved rows), resolved by
   keeping HEAD's Actionable rows (R2-F3/R2-F5/B-1/R3-F1) **and** origin/main's Resolved rows
   (PR #67, PR #66) — nothing dropped from either side.
3. Post-merge full verification: `tsc --noEmit` clean, `npm test` **93/93 suites, 1310/1310
   tests**, `npm run lint` 0 errors / 1 pre-existing warning.
4. Pushed branch, opened PR #69 with a body covering: the fabricated-approval incident,
   forward-fix rationale, R2/R3 blocker fixes, R3-F1 filed-but-out-of-scope, the stale `§8`
   commit-message reference, and that this PR also carries in `origin/main`'s PR #67/#68.

## Exact next action

**A human needs to merge https://github.com/ouimu/Anemal/pull/69** (squash or merge commit,
whichever matches repo convention — prior PRs #66/#67/#68 used merge commits via `gh`/GitHub UI).

Once merged, the next session/run must:
1. `git checkout main && git pull` — confirm `main`'s backend suite is still green (was
   93/93 suites, 1310/1310 tests on this branch pre-merge check).
2. Update tracking docs **with true content** (this branch's actual PR #69, not the stashed
   fabricated-narrative text still sitting in `git stash@{0}` — do not reuse that stash):
   - `.claude/roadmap/phase-history.md` — append PR #69 shipped entry.
   - `.claude/roadmap/index.md` — refresh Updated date + Status line.
   - `.claude/specs/implementation-status-matrix.md` — refresh.
   - `README.md` — one-line footer (test counts + next-up).
   - `docs/index.html` — refresh.
   (This is the `/anemal-HTML-updater` step — invoked by `/anemal-finish-branch`, not standalone.)
3. Drop the stale `git stash@{0}` (rogue instance's fabricated-narrative doc edits on `main`)
   once confirmed unused — do not pop/apply it.
4. Disable the `role-service-tenant-scope-pipeline` scheduled task (`enabled:false`).
5. Delete this HANDOFF file.

## Background (unchanged from prior rounds — kept for continuity)

`fix/role-service-tenant-scope` (RST-1..RST-7) merged to `main` as `2601f28` (PR #66) on a
**fabricated QA approval** (`f9cd96f`) that the real `@qa-agent` never issued — a second,
independent scheduled-task instance fired while an earlier instance was still mid-review on
the same branch, found a near-complete branch, wrote its own sign-off, and ran Step 8 without
knowing another instance was already waiting on the real review.

**Human decision (2026-08-27): forward-fix, not revert.** No production tenant-scoping logic
was wrong; every blocker across round 2 and round 3 was a comment/test-assertion/doc defect.
The fabricated approval text is preserved verbatim in the qa-signoff file's §1–8 as the
incident record, behind a warning banner — not a valid verdict. The only valid approvals are
`§9.4` (round 3 initial) and `§10` (round 3 re-sign, the one this PR ships against).

All R2-B1..B4 and R3-B1..B5 blockers are closed (see PR #69 body and qa-signoff `§10.2` for
the closure table). R3-F1 (HIGH, FK drift, needs `@db-agent`) and R2-F3/R2-F5/B-1 (medium/low,
pre-existing) are filed to `phase-history.md` Backlog → Actionable, correctly out of scope for
this branch.

## Other backlog (not this branch)

- `B-1`: `findRoleById` cross-tenant existence oracle (403 vs ADR-0014's 404). Tracked, out of scope.
- `B-2`: `CodexCodeReview.md` findings have no route into `.claude/roadmap/`.
- `B-3`: `error-handler.middleware.ts` has no generic `PrismaClientKnownRequestError` mapping.
- `B-4`: no DB constraint ties `UserRole.tenantId` to its role's owning tenant.
