# Ponytail Gate — OneDrive Storage Driver (ADR-0023 sub-project 3)

**Plan reviewed:** `docs/superpowers/plans/2026-07-24-storage-onedrive-driver.md`
**Reviewer:** @ponytail-agent (independent simplicity gate, CLAUDE.md Step 5)
**Date:** 2026-07-24
**Branch:** `feature/tenant-storage-provider`

**Grounding read:** design spec, BA sign-off, grill round 1 + round 2, precedent Google Drive plan (`2026-07-23-storage-google-drive-driver.md`, incl. its recorded 2026-07-23 split-only ruling), ADR-0023.

---

## Verdict per criterion

| # | Criterion | Result | Why |
|---|-----------|--------|-----|
| 1 | Over-engineering? | ✅ NO | Reuses the shipped `StorageDriver` interface, `getStorageDriver` switch, OAuth `state`/nonce infra, HKDF pattern, encryption helper, settings routes. Actually *simpler* than the GDrive precedent — no folder-ID cache columns, no list-then-update dance (path-based `PUT` is inherently overwrite-in-place). Every mechanism traces to a resolved grill/BA finding. Task 0 is a verification spike, not speculative code; the primary/fallback ping is a documented conditional, not both built. |
| 2 | Duplicate work? | ✅ NO | Nothing reimplemented. `account-id-hash.ts` *consolidates* what would otherwise be duplicated across the Google retrofit and OneDrive; `consumeNonce` provider-hardening is applied once to the shared table. Client seam mirrors `google-drive-client.ts`. |
| 3 | Existing solution covers it? | ✅ NO | The candidate libraries (MSAL / Microsoft Graph SDK) were explicitly evaluated and rejected (M-6): MSAL's serialized-token-cache model is incompatible with the per-tenant encrypted-columns-in-Postgres pattern, and would add a heavy dep for ~8 `fetch` calls. Choosing plain `fetch` is the *lazier*, correct call — adding the SDK would be the over-engineered path. |
| 4 | Scope too large? | ⚠️ ONLY WITH THE 2-PR SPLIT | **As a single PR this FAILS:** 4 subsystems (DB/migration, backend crypto+driver core, backend API surface incl. 2 already-shipped-file retrofits, frontend) > 3 — the exact count that triggered sub-project 2's split. **Split into the two sequenced sub-PRs the plan proposes, each sub-PR is ≤3 subsystems and passes.** No cut was found; this is split-only, identical in kind to the GDrive ruling. See ruling below. |
| 5 | Too many deps? | ✅ NO | **0 new dependencies** (M-6). Best possible — better than GDrive's +1 (`googleapis`). Alternative (MSAL) evaluated. |
| 6 | Too many files? | ✅ NO | 8 new files (< 15). Roughly half the GDrive footprint (15 new) because there is no new dependency-wrapping and no folder-ID plumbing. |
| 7 | Too many APIs? | ✅ NO | 2 new endpoints (`.../onedrive/authorize`, `/oauth/onedrive/callback`) + 1 new frontend hook (`useOneDriveAuthorize`) = 3, at/under the >3 threshold. Same endpoint shape as the approved GDrive sub-project. |

---

## The split is load-bearing on criterion 4 — explicit ruling

Criterion 4 is the **only** criterion that depends on the PR structure, and the 2-PR split is what makes it pass — **exactly the same reasoning applied to sub-project 2 (Google Drive)**, whose single-PR plan was rejected on criterion 4 (4 subsystems) and shipped as two sequenced PRs on this same branch.

Confirmed / **required** split (as the plan proposes, right after Task 0):

- **Sub-PR A — Tasks 0–7:** spike + migration + `account-id-hash.ts` + `OneDriveClient`/`FakeOneDriveClient` + `OneDriveDriver` + `getStorageDriver` branch + `consumeNonce` hardening + Google-callback retrofit. **Zero new HTTP surface** — the `onedrive` branch is structurally unreachable until Sub-PR B, same "zero new attack surface" posture as GDrive Sub-PR A.
- **Sub-PR B — Tasks 8–12:** the 2 OAuth endpoints, live status ping, and frontend. Starts only after Sub-PR A merges to this branch's base.

Each sub-PR runs its own Step 6→8. **If the work is collapsed back into one PR, this reverts to a REJECT on criterion 4** — the split is not optional.

---

## Final call

```
@pm-agent — Ponytail gate ✅ APPROVE — all 7 pass, CONDITIONED ON the 2-PR split
the plan already proposes (Sub-PR A = Tasks 0–7, Sub-PR B = Tasks 8–12,
sequenced, same branch).

Criterion 4 is the only split-dependent one: 4 subsystems in a single PR would
REJECT (same as sub-project 2). Split as proposed, each sub-PR is ≤3 subsystems
and clears. No over-engineering, no duplication, 0 new deps, 8 new files, 2
endpoints — all inside limits. Proceed to /execute-plan for Sub-PR A first.
```
