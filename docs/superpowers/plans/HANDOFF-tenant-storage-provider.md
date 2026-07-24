# Handoff — Tenant Storage Provider Feature (ADR-0023)

**Last updated:** 2026-07-24 (scheduled-task run)
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
- **Deliberately NOT done (blocking, needs a human with real credentials — this is a technical/access blocker, not a business decision, so no PENDING-DECISION file was written for it):**
  - **Task 0 — OD-13 live-token verification spike.** Needs a real Microsoft Entra dev app registration (`ONEDRIVE_OAUTH_CLIENT_ID`/`SECRET` are not set in `src/backend/.env` — only `GOOGLE_OAUTH_CLIENT_ID`/`SECRET` exist there) plus one manual browser OAuth consent to capture a live test token. Confirms whether `GET /me/drive` (primary) or `GET /me/drive/special/approot` (fallback) is the correct account-ID/status-ping call, and whether Google's live `drive.file` scope actually authorizes `about.get?fields=user` (M-11). See the write-plan's Task 0 for the exact spike script and decision table.
  - **Task 7, part B** — `googleAccountIdHash` populate/collision-check in `oauth-google.controller.ts` — gated on Task 0's Google-side result. Skipped cleanly (not stubbed).
  - **All of Sub-PR B** (Tasks 8–12: `/authorize` + `/oauth/onedrive/callback` endpoints, live status ping using Task 0's confirmed variant, frontend 4th radio/Connect-Disconnect/interstitial) — cannot start until Task 0 is resolved, since Sub-PR B's status-ping code depends on which Graph call variant Task 0 confirms.

## Exact next action

1. **A human needs to merge PR #49** (https://github.com/ouimu/AnimalClinic/pull/49) once they've reviewed it. This run already ran the full pipeline gate (Ponytail Step 5) and QA sign-off (Step 7) — no further agent review is required before merge, only a human decision to merge.
2. **After merge:** `git checkout main && git pull`, re-run the backend suite to confirm main stays green (per `anemal-finish-branch`'s Step 4), then merge `main` back into `feature/tenant-storage-provider` (same pattern as after PR #48 — see commit `5d6c439`) before starting Sub-PR B work.
3. **Before Sub-PR B can start at all:** a human with access to a Microsoft Entra/Azure AD tenant needs to (a) register a dev app with `Files.ReadWrite.AppFolder` delegated scope, (b) set `ONEDRIVE_OAUTH_CLIENT_ID`/`ONEDRIVE_OAUTH_CLIENT_SECRET` in `src/backend/.env`, and (c) either run the Task 0 spike script themselves (`docs/superpowers/plans/2026-07-24-storage-onedrive-driver.md`, Task 0) or delegate it back to an agent session that has those two env vars set and can complete one manual OAuth consent in a browser. Until that happens, this scheduled task cannot make further progress on OneDrive and should keep reporting this exact blocker each run rather than guessing an answer or skipping the spike.
4. Once Task 0's outcome is recorded in the design doc, Sub-PR B (Tasks 8–12) can be implemented via the same TDD/plan-execution flow this run used for Sub-PR A, then its own Ponytail-gate-already-covered → QA sign-off → PR (never auto-merge).
5. Once OneDrive Sub-PR B ships and is merged: update CLAUDE.md's Phases table + `.claude/specs/implementation-status-matrix.md`, and this HANDOFF file can be deleted — all three sub-projects of ADR-0023 will be complete, and the scheduled task should be disabled per its own instructions.

## Note on unrelated uncommitted changes in the working tree

At the start and end of this run, `git status` showed a set of **pre-existing, unrelated uncommitted changes** (a `.planning/` → `.claude/roadmap/archive/planning-legacy/` reorg, edits to `CLAUDE.md`/`README.md`/`CHANGELOG.md`/`.claude/agents/*.md`, etc.) that this run did **not** create. A first attempt to commit just this handoff file accidentally swept in all of that pre-staged unrelated work in the same commit (they were already staged in the index, not just present in the working tree) — that commit was reverted immediately (`git revert`) once caught, restoring the original unstaged state, and this handoff update was redone by itself. They do not affect PR #49 (which is commit-based, not working-tree-based). Whoever owns that reorg should commit or stash it explicitly — do not silently fold it into a future OneDrive commit; check `git status`/`git diff --cached` before any `git add`/`git commit` on this branch going forward, since the same file set may still be sitting pre-staged.
