# Handoff — Tenant Storage Provider Feature (ADR-0023)

**Last updated:** 2026-07-28 (scheduled run — checked PR #50: still open, no reviews, checks green, nothing changed since last handoff. No action taken, still waiting on human merge.)
**Branch:** `feature/tenant-storage-provider` (pushed, up to date with origin, do not create a new branch)

---

## Sub-project status

1. **Custom network-share (SMB)** — ✅ SHIPPED. Sub-PR A = PR #46 (merged), Sub-PR B = PR #47 (merged), both on `main`.
2. **Google Drive OAuth** — ✅ SHIPPED. Sub-PR A (driver core) + Sub-PR B (OAuth endpoints + UI) = PR #48 (merged to `main`).
3. **Microsoft OneDrive** — 🔶 IN PROGRESS, awaiting human merge. Sub-PR A merged (PR #49). Sub-PR B (Tasks 8-12, all complete and tested) is open as **PR #50** — not merged, needs a human to review and merge.

## OneDrive sub-project — exact current state

- Design/BA-signoff/grill (2 rounds)/write-plan/Ponytail APPROVE: all final, unchanged — see `docs/superpowers/specs/2026-07-23-storage-onedrive-driver-design.md`, `docs/superpowers/specs/2026-07-24-storage-onedrive-driver-ba-signoff.md`, `docs/superpowers/specs/2026-07-24-storage-onedrive-driver-grill.md` + `-grill-round2.md`, `docs/superpowers/plans/2026-07-24-storage-onedrive-driver.md`, `docs/superpowers/plans/2026-07-24-storage-onedrive-driver-ponytail-gate.md`.
- **Sub-PR A (Tasks 1–7a) — SHIPPED.** PR #49 merged to `main`.
- **Sub-PR B (Tasks 8–12) — DONE, PR #50 OPEN, unmerged.**
  - Task 8 (`GET .../onedrive/authorize`) + Task 9 (`GET /oauth/onedrive/callback`) — implemented in a prior run (commit `5db14f1`, was WIP/unverified at the time), **verified green this run**: DB was reachable this run (Docker Desktop was up; started the previously-stopped `vetclinic-pg` container), ran both integration test files — 18/18 pass. Verification recorded in commit `46e8949` (did not amend the already-pushed `5db14f1` — no force-push).
  - Task 10 (disconnect nulling + live status check + gated `duplicateAccountWarning`) — implemented and tested this run, commit `19bd244`. `storage-config.service.ts` + `settings.controller.ts` (signature change: `getStorageConfigForDisplay(tenantId, callerHasIntegrationsEdit)`, both call sites updated to resolve permissions via `resolvePermissions`). 32/32 unit tests pass.
  - Task 11 (frontend: 4th radio, Connect/Disconnect, copy, duplicate-account banner) — implemented and tested this run, commit `92e9972`. `useStorageConfig.ts`, `StoragePage.tsx`, `StorageConnectingPage.tsx`, `StoragePage.test.tsx`. 26/26 (10 new) pass. Kept the unrecognized-OAuth-error fallback provider-aware (checks `onedrive_` prefix) to avoid breaking the pre-existing Google-specific fallback test.
  - Task 12 (regression sweep + design §9 checklist reconciliation) — done this run, commit `5698195`. Added the one missing checklist row: a provider A→B→A round-trip visibility test in `storage-driver.test.ts` (local → custom_path → local, confirms the file saved under local survives untouched). Full backend suite 1239-1243/1243, full frontend suite 330/330, `tsc --noEmit` clean on both workspaces.
  - **Known non-blocking noise:** every full-`npx jest` run this session (and prior sessions per git history) shows 2-5 suites failing that are unrelated to storage-config work — a different random set each run (seen: `platform-console-t5f02`, `platformConsole`, `password-management`, `appointmentDoctors`, `invoice`, `refreshToken`, `backfill-main-branch`). Every one passes cleanly in isolation. This is pre-existing parallel-worker DB-state flakiness in the test harness, not a regression from this work — do not chase it as part of this feature.
- **Task 7 part B (googleAccountIdHash populate/collision retrofit)** — still skipped, Google-side OD-13 half untested (no real Google Drive connection in dev DB). Not blocking, noted in a prior handoff, unchanged this run.
- Self-review pass (Step 7 equivalent, no live human QA agent in this run): confirmed route permission gates (`GET` → `clinic.profile.view`, `PUT`/`authorize` → `clinic.integrations.edit`), confirmed `/oauth` routes mount with no global auth middleware ahead of them in `app.ts` (same pattern as Google's — the round-2 grill's route-mounting bug class does NOT recur here), confirmed `roleRouteMatrix.test.ts`'s public-route allowlist entry still passes (277/277).

## Exact next action

**A human needs to review and merge PR #50: https://github.com/ouimu/Anemal/pull/50** — this automated run never merges PRs itself.

Once #50 is merged:
1. Update CLAUDE.md's Phases table with a OneDrive Sub-PR B ship entry (mirroring the Google Drive Sub-PR B entry's style) and `.claude/specs/implementation-status-matrix.md`.
2. All three sub-projects of ADR-0023 (SMB, Google Drive, OneDrive) will then be fully shipped.
3. Delete this HANDOFF file.
4. Call `update_scheduled_task` on `tenant-storage-provider-pipeline` with `enabled:false` to pause the scheduled task, per its own instructions — the feature is done.

If a future run starts before #50 is merged: do NOT reopen a second PR for the same branch, do NOT re-implement Tasks 8-12 (they're done and tested), just check `gh pr view 50` for review comments/requested changes and address those if any exist.

## Note on unrelated uncommitted changes in the working tree

`git status` still shows pre-existing, unrelated uncommitted changes this run did NOT create and deliberately did NOT stage/commit: `CLAUDE.md`, `docs/index.html` (both modified), plus untracked `.claude/roadmap/archive/planning-legacy/` and `.claude/roadmap/phase-history.md` (a `.planning/` reorg). Same as noted in prior handoffs — do not fold these into a future OneDrive commit. Whoever owns that reorg should commit or stash it explicitly. Always check `git status`/`git diff --cached` before `git add`/`git commit` on this branch.
