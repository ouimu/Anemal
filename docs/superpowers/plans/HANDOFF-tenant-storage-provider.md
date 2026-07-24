# Handoff — Tenant Storage Provider Feature (ADR-0023)

**Last updated:** 2026-07-24 (scheduled-task run, OD-13 spike-result sync)
**Branch:** `feature/tenant-storage-provider` (pushed, up to date with origin, do not create a new branch)

---

## Sub-project status

1. **Custom network-share (SMB)** — ✅ SHIPPED. Sub-PR A = PR #46 (merged), Sub-PR B = PR #47 (merged), both on `main`.
2. **Google Drive OAuth** — ✅ SHIPPED. Sub-PR A (driver core) + Sub-PR B (OAuth endpoints + UI) = PR #48 (merged to `main`).
3. **Microsoft OneDrive** — 🔶 IN PROGRESS. Sub-PR A open as PR, Sub-PR B blocked. See below.

## OneDrive sub-project — exact current state

- Design/BA-signoff/grill (2 rounds)/write-plan: all final, unchanged since last handoff — see `docs/superpowers/specs/2026-07-23-storage-onedrive-driver-design.md`, `docs/superpowers/specs/2026-07-24-storage-onedrive-driver-ba-signoff.md`, `docs/superpowers/specs/2026-07-24-storage-onedrive-driver-grill.md` + `-grill-round2.md`, `docs/superpowers/plans/2026-07-24-storage-onedrive-driver.md`.
- **Ponytail Step-5 gate: APPROVE**, conditioned on the plan's own proposed 2-PR split (criterion 4 only clears via the split — same ruling as Google Drive). Verdict: `docs/superpowers/plans/2026-07-24-storage-onedrive-driver-ponytail-gate.md`.
- **Sub-PR A (Tasks 1–7a) IMPLEMENTED, TESTED, QA-APPROVED, PR OPEN — NOT MERGED.**
  - PR: **https://github.com/ouimu/AnimalClinic/pull/49** — "feat(storage): OneDrive driver core + shipped-code hardening — Sub-PR A/2"
  - 7 commits on the branch (`eb0d11d` → `5b56e23`): migration (4 `oneDrive*` cols + `googleAccountIdHash` retrofit), `account-id-hash.ts`, `onedrive-client.ts` + fake, `onedrive-driver.ts`, `getStorageDriver` onedrive branch + race-safe token write-back, `consumeNonce(rawNonce, provider)` cross-provider-replay hardening (retrofits shipped Google flow), Google-callback M-10 reverse-direction column nulling (retrofits shipped Google flow).
  - Tests: 1210/1210 backend passing (up from 1178 baseline), `tsc --noEmit` clean — verified independently by `@qa-agent` (APPROVE, given in this run's transcript; not yet written to a standalone sign-off doc — re-run `@qa-agent` if a fresh written sign-off doc is wanted before merge).
  - **A human must merge PR #49** — this run never merges its own PRs.
- **Task 0 — OD-13 live-token verification spike — RESOLVED 2026-07-24 (Microsoft side), by a human with real Entra credentials** (commit `ea260c2`, updates `docs/superpowers/specs/2026-07-23-storage-onedrive-driver-design.md`). Real test: `GET /me/drive` → **403 accessDenied** (primary variant does NOT work under `Files.ReadWrite.AppFolder` for a personal MS account); `GET /me/drive/special/approot` → **200 OK**, `parentReference.driveId` present. **Conclusion: build the fallback (approot) variant everywhere — status ping (I-16/M-9) and `oneDriveAccountIdHash` both derive from `parentReference.driveId`, not `owner.user.id`.** `onedrive-client.ts`'s `ping()` (written pre-spike in Sub-PR A) currently implements the primary variant with the fallback pre-written as an inline comment — **must be swapped to the fallback branch when Task 10/11 (status ping) is implemented in Sub-PR B.**
  - Google-side half of OD-13 (`about.get?fields=user` under the shipped `drive.file` scope) — **still untested**, no tenant has a real Google Drive connection in the dev DB to source a live token from. Does not block Sub-PR B generally — only blocks **Task 7 part B** (`googleAccountIdHash` populate/collision-check retrofit to the shipped Google callback), which stays skipped until someone connects a real Google account via the shipped Storage-settings flow and tests `about.get` with its token.
  - **Task 7, part B** — still gated on the Google-side result above. Skipped cleanly (not stubbed).

## Exact next action

1. **A human still needs to merge PR #49** (https://github.com/ouimu/AnimalClinic/pull/49) — unchanged blocker, still OPEN as of this run (`gh pr list` re-checked). This run never merges its own PRs. The pipeline gates (Ponytail Step 5, QA Step 7) are already done — only the human merge decision is outstanding.
2. **Why Sub-PR B can't start yet even though OD-13 (MS side) is now resolved:** PR #49's head branch *is* `feature/tenant-storage-provider` itself — any new commits pushed to this branch before PR #49 merges would inflate PR #49's diff and break the Ponytail-mandated 2-PR split. Sub-PR B commits must wait until PR #49 merges to `main` and the branch is re-synced (step 3), even though the design/plan work needed to start coding it is otherwise unblocked.
3. **After PR #49 merges:** `git checkout main && git pull`, re-run the backend suite to confirm main stays green (per `anemal-finish-branch`'s Step 4), then merge `main` back into `feature/tenant-storage-provider` (same pattern as after PR #48 — see commit `5d6c439`) — then Sub-PR B (Tasks 8–12) can begin, using the confirmed approot-fallback variant for the status-ping/hash code (see Task 0 result above).
4. Sub-PR B: implement via the same TDD/plan-execution flow used for Sub-PR A, then Ponytail-gate-already-covered → QA sign-off → PR (never auto-merge). Task 7B stays skipped (Google-side OD-13 still open) unless a human separately tests and confirms the Google `about.get` call first.
5. Once OneDrive Sub-PR B ships and is merged: update CLAUDE.md's Phases table + `.claude/specs/implementation-status-matrix.md`, and this HANDOFF file can be deleted — all three sub-projects of ADR-0023 will be complete, and the scheduled task should be disabled per its own instructions.

## Note on unrelated uncommitted changes in the working tree

At the start and end of this run, `git status` showed a set of **pre-existing, unrelated uncommitted changes** (a `.planning/` → `.claude/roadmap/archive/planning-legacy/` reorg, edits to `CLAUDE.md`/`README.md`/`CHANGELOG.md`/`.claude/agents/*.md`, etc.) that this run did **not** create. A first attempt to commit just this handoff file accidentally swept in all of that pre-staged unrelated work in the same commit (they were already staged in the index, not just present in the working tree) — that commit was reverted immediately (`git revert`) once caught, restoring the original unstaged state, and this handoff update was redone by itself. They do not affect PR #49 (which is commit-based, not working-tree-based). Whoever owns that reorg should commit or stash it explicitly — do not silently fold it into a future OneDrive commit; check `git status`/`git diff --cached` before any `git add`/`git commit` on this branch going forward, since the same file set may still be sitting pre-staged.
