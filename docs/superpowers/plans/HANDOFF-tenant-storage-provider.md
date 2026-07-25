# Handoff — Tenant Storage Provider Feature (ADR-0023)

**Last updated:** 2026-07-25 (OneDrive Sub-PR B Tasks 8-9 written, UNVERIFIED — DB unreachable this run)
**Branch:** `feature/tenant-storage-provider` (pushed, up to date with origin, do not create a new branch)

---

## Sub-project status

1. **Custom network-share (SMB)** — ✅ SHIPPED. Sub-PR A = PR #46 (merged), Sub-PR B = PR #47 (merged), both on `main`.
2. **Google Drive OAuth** — ✅ SHIPPED. Sub-PR A (driver core) + Sub-PR B (OAuth endpoints + UI) = PR #48 (merged to `main`).
3. **Microsoft OneDrive** — 🔶 IN PROGRESS. Sub-PR A merged (PR #49). Sub-PR B Tasks 8-9 committed as WIP this run, **unverified** — see below. Tasks 10-12 not started.

## OneDrive sub-project — exact current state

- Design/BA-signoff/grill (2 rounds)/write-plan/Ponytail APPROVE: all final, unchanged — see `docs/superpowers/specs/2026-07-23-storage-onedrive-driver-design.md`, `docs/superpowers/specs/2026-07-24-storage-onedrive-driver-ba-signoff.md`, `docs/superpowers/specs/2026-07-24-storage-onedrive-driver-grill.md` + `-grill-round2.md`, `docs/superpowers/plans/2026-07-24-storage-onedrive-driver.md`, `docs/superpowers/plans/2026-07-24-storage-onedrive-driver-ponytail-gate.md`.
- **Sub-PR A (Tasks 1–7a) — SHIPPED.** PR #49 merged to `main`, resynced into this branch (commit `db5a767`).
- **Task 0 (OD-13 spike) — RESOLVED.** Approot-fallback confirmed as the working Graph call (commit `ea260c2`). `onedrive-client.ts`'s `ping()` already uses the fallback.
- **Task 7 part B (googleAccountIdHash populate/collision retrofit)** — still skipped, Google-side OD-13 half untested (no real Google Drive connection in dev DB). Not blocking.

### Sub-PR B progress this run (commit `5db14f1`, WIP, NOT tested)

Implemented Tasks 8 and 9 per the plan:
- `onedriveAuthorize` handler + `GET /clinic/storage-config/onedrive/authorize` route (Task 8).
- `handleOneDriveOAuthCallback` controller + `oauth-onedrive.routes.ts` + `GET /oauth/onedrive/callback` mounted in `app.ts` (Task 9), including the Microsoft-specific divergence from the Google callback (state IS present on `error=access_denied`/`consent_required` — round-2 grill finding 8) and M-7 cross-provider nonce hardening.
- Added `roleRouteMatrix.test.ts` allowlist entry for the new public callback route.
- Wrote two integration test files matching the plan's test list: `src/backend/tests/integration/storage-config-onedrive-authorize.test.ts` (OA-01..04) and `src/backend/tests/integration/oauth-onedrive-callback.test.ts` (OD-CB-01..14, covering happy path, M-10 forward-direction column nulling, M-7 cross-provider nonce rejection, the Microsoft state-on-error divergence, consent_required vs access_denied, inactive-user recheck, missing-config, exchange failure).

**Blocker hit: could not run any of this.** `npx jest` needs Postgres at `localhost:5432` (see `src/backend/.env`); there is no `docker-compose.yml` in the repo and no local Postgres service — the DB is normally provided by a running Docker Desktop container. In this scheduled-task run, Docker Desktop was NOT running: `com.docker.service` exists but `Start-Service` was denied (no permission in this session), and launching `Docker Desktop.exe` directly did not produce a running process or a reachable engine after waiting ~3 minutes. This is an environment/infrastructure gap, not a design question, so it is **not** a PENDING-DECISION — just a blocker for whoever/whatever runs the next session.

`npx tsc --noEmit` in `src/backend` IS clean (ran successfully, no errors) — the code compiles, but functional correctness of Tasks 8-9 is unverified.

## Exact next action

1. **First**, in an environment where Docker Desktop can actually run (or Postgres is otherwise reachable at `localhost:5432` per `src/backend/.env`'s `DATABASE_URL`): run `cd src/backend && npx jest storage-config-onedrive-authorize.test.ts oauth-onedrive-callback.test.ts`. Fix whatever fails — the implementation was written carefully pattern-copying the shipped Google OAuth flow (`oauth-google.controller.ts`, `storage-config-google-authorize.test.ts`, `oauth-google-callback.test.ts`) but has zero live verification.
2. Once Tasks 8-9 pass: amend or follow up with a clean commit (the current `5db14f1` is explicitly labeled `wip(storage):` — replace/supersede it with a normal `feat(storage):` commit once verified, per the plan's own Step 5 commit message: `feat(storage): add GET .../onedrive/authorize connect-initiate endpoint (ADR-0023 sub-project 3, M-1)` and a Task 9 equivalent — or just amend the WIP message once green, either is fine).
3. Continue with Task 10 (disconnect wiring + live status check + `duplicateAccountWarning`, `storage-config.service.ts` — **note**: this task's plan snippet also introduces `duplicateAccountWarning` gating for `google_drive` for the first time, since `getStorageConfigForDisplay` currently has NO such field at all yet, not even for Google — read Task 10's full spec in the plan before implementing, the signature change to `getStorageConfigForDisplay(tenantId, callerHasIntegrationsEdit)` has call-site updates in `settings.controller.ts` too), then Task 11 (frontend), then Task 12 (regression sweep + doc updates).
4. After Task 12: Ponytail gate already covers this split — go straight to QA sign-off (Step 7) then PR (Step 8, never auto-merge — a human merges).
5. Once OneDrive Sub-PR B ships and is merged: update CLAUDE.md's Phases table + `.claude/specs/implementation-status-matrix.md`, and this HANDOFF file can be deleted — all three sub-projects of ADR-0023 will be complete, and the scheduled task should be disabled per its own instructions.

## Note on unrelated uncommitted changes in the working tree

`git status` still shows pre-existing, unrelated uncommitted changes this run did NOT create and deliberately did NOT stage/commit: `CLAUDE.md`, `docs/index.html` (both modified), plus untracked `.claude/roadmap/archive/planning-legacy/` and `.claude/roadmap/phase-history.md` (a `.planning/` reorg). Same as noted in the prior handoff — do not fold these into a future OneDrive commit. Whoever owns that reorg should commit or stash it explicitly. Always check `git status`/`git diff --cached` before `git add`/`git commit` on this branch.
