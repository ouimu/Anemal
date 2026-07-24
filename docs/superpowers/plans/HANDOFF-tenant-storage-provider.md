# Handoff — Tenant Storage Provider Feature (ADR-0023)

**Last updated:** 2026-07-24 (Sub-PR A merged as PR #49; starting Sub-PR B)
**Branch:** `feature/tenant-storage-provider` (pushed, up to date with origin, do not create a new branch)

---

## Sub-project status

1. **Custom network-share (SMB)** — ✅ SHIPPED. Sub-PR A = PR #46 (merged), Sub-PR B = PR #47 (merged), both on `main`.
2. **Google Drive OAuth** — ✅ SHIPPED. Sub-PR A (driver core) + Sub-PR B (OAuth endpoints + UI) = PR #48 (merged to `main`).
3. **Microsoft OneDrive** — 🔶 IN PROGRESS. Sub-PR A merged (PR #49). Sub-PR B (Tasks 8–12) starting now.

## OneDrive sub-project — exact current state

- Design/BA-signoff/grill (2 rounds)/write-plan: all final, unchanged since last handoff — see `docs/superpowers/specs/2026-07-23-storage-onedrive-driver-design.md`, `docs/superpowers/specs/2026-07-24-storage-onedrive-driver-ba-signoff.md`, `docs/superpowers/specs/2026-07-24-storage-onedrive-driver-grill.md` + `-grill-round2.md`, `docs/superpowers/plans/2026-07-24-storage-onedrive-driver.md`.
- **Ponytail Step-5 gate: APPROVE**, conditioned on the plan's own proposed 2-PR split (criterion 4 only clears via the split — same ruling as Google Drive). Verdict: `docs/superpowers/plans/2026-07-24-storage-onedrive-driver-ponytail-gate.md`.
- **Sub-PR A (Tasks 1–7a) — SHIPPED.** PR #49 squash-merged to `main` (human-directed merge, 2026-07-24), `main` re-pulled and re-verified green (1210/1210 backend), then merged back into `feature/tenant-storage-provider` (commit `db5a767`). Contents: migration (4 `oneDrive*` cols + `googleAccountIdHash` retrofit), `account-id-hash.ts`, `onedrive-client.ts` + fake, `onedrive-driver.ts`, `getStorageDriver` onedrive branch + race-safe token write-back, `consumeNonce(rawNonce, provider)` cross-provider-replay hardening, Google-callback M-10 reverse-direction column nulling.
- **Task 0 — OD-13 live-token verification spike — RESOLVED 2026-07-24 (Microsoft side), by a human with real Entra credentials** (commit `ea260c2`, updates `docs/superpowers/specs/2026-07-23-storage-onedrive-driver-design.md`). Real test: `GET /me/drive` → **403 accessDenied** (primary variant does NOT work under `Files.ReadWrite.AppFolder` for a personal MS account); `GET /me/drive/special/approot` → **200 OK**, `parentReference.driveId` present. **Conclusion: build the fallback (approot) variant everywhere — status ping (I-16/M-9) and `oneDriveAccountIdHash` both derive from `parentReference.driveId`, not `owner.user.id`.** `onedrive-client.ts`'s `ping()` (written pre-spike in Sub-PR A) currently implements the primary variant with the fallback pre-written as an inline comment — **must be swapped to the fallback branch when Task 10/11 (status ping) is implemented in Sub-PR B.**
  - Google-side half of OD-13 (`about.get?fields=user` under the shipped `drive.file` scope) — **still untested**, no tenant has a real Google Drive connection in the dev DB to source a live token from. Does not block Sub-PR B generally — only blocks **Task 7 part B** (`googleAccountIdHash` populate/collision-check retrofit to the shipped Google callback), which stays skipped until someone connects a real Google account via the shipped Storage-settings flow and tests `about.get` with its token.
  - **Task 7, part B** — still gated on the Google-side result above. Skipped cleanly (not stubbed).

## Exact next action

1. PR #49 merged, main resynced into feature branch (`db5a767`) — Sub-PR B is now unblocked.
2. Implement Sub-PR B (Tasks 8–12) per `docs/superpowers/plans/2026-07-24-storage-onedrive-driver.md`: `/authorize` + `/oauth/onedrive/callback` endpoints, live status ping using the confirmed approot-fallback Graph call (see Task 0 result above — swap `onedrive-client.ts`'s `ping()` off the primary variant), frontend 4th radio/Connect-Disconnect/interstitial. TDD flow same as Sub-PR A. Task 7B stays skipped (Google-side OD-13 still untested) unless a human separately confirms the Google `about.get` call first.
3. After implementation: Ponytail gate already covers this split (see verdict doc) — go straight to QA sign-off (Step 7) then PR (Step 8, never auto-merge — a human merges).
4. Once OneDrive Sub-PR B ships and is merged: update CLAUDE.md's Phases table + `.claude/specs/implementation-status-matrix.md`, and this HANDOFF file can be deleted — all three sub-projects of ADR-0023 will be complete, and the scheduled task should be disabled per its own instructions.

## Note on unrelated uncommitted changes in the working tree

At the start and end of this run, `git status` showed a set of **pre-existing, unrelated uncommitted changes** (a `.planning/` → `.claude/roadmap/archive/planning-legacy/` reorg, edits to `CLAUDE.md`/`README.md`/`CHANGELOG.md`/`.claude/agents/*.md`, etc.) that this run did **not** create. A first attempt to commit just this handoff file accidentally swept in all of that pre-staged unrelated work in the same commit (they were already staged in the index, not just present in the working tree) — that commit was reverted immediately (`git revert`) once caught, restoring the original unstaged state, and this handoff update was redone by itself. They do not affect PR #49 (which is commit-based, not working-tree-based). Whoever owns that reorg should commit or stash it explicitly — do not silently fold it into a future OneDrive commit; check `git status`/`git diff --cached` before any `git add`/`git commit` on this branch going forward, since the same file set may still be sitting pre-staged.
