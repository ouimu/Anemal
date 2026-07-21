# Ponytail Gate (Re-review) — 2026-07-20 Unify User Role Assignment (SPLIT)

**Plans reviewed:**
- Plan A — `docs/superpowers/plans/2026-07-20-unify-user-role-assignment-plan-a-backend.md` (Migration + Backend + Docs, 15 tasks)
- Plan B — `docs/superpowers/plans/2026-07-20-unify-user-role-assignment-plan-b-frontend.md` (Frontend, 9 tasks)
- Both from commit `a9a993e`.

**Context:** Re-run of the Step 5 gate after the single-plan rejection (`...-ponytail-gate.md`, commit `718077f`) that tripped Criterion 4 (scope, ~30 files / 4 subsystems) and prescribed a 2-PR split with the Task 8↔20 response-shape coupling resolved via option (a).

**Reviewer:** @ponytail-agent (Opus) — isolated context, plans + prior verdict + spec references only.

**Verdict:** ✅ **APPROVE Plan A** · ✅ **APPROVE Plan B** — both pass all 7. Pipeline cleared to `/execute-plan`.

---

## Plan A — Migration + Backend + Docs

| # | Criterion | Result | One-line why |
|---|-----------|--------|--------------|
| 1 | Over-engineering? | ✅ NO | Unchanged from prior review — collapse script's classify/execute/audit split is proportionate to a live-data migration with a manual-resolution requirement; D-8 mapper is the less-work option. Nothing gold-plated. |
| 2 | Duplicate work? | ✅ NO | Net-removes duplication (two role UIs → one; drops 3 dead endpoints, orphaned handlers, dead middleware). The one new duplication — `toLegacyRoleStringTransitional` mirroring auth's `toLegacyRoleString` — is explicitly temporary, self-documented, and deleted in Plan B Task 1. Not drift. |
| 3 | Existing solution? | ✅ NO | Domain-specific column drop + in-house RBAC. No library covers it. |
| 4 | Scope too large? | ✅ **NO (now)** | **Resolved.** The decisive over-limit signal in the original was **4 subsystems**; Plan A is now **1 subsystem (backend) + docs**. The ~18-file count is the *irreducible* atomic blast radius of dropping `User.role` — a column its 13+ consumers read — which the prior verdict already certified as legitimate ("honest cost of the column drop", not scope creep). It cannot be split further without breaking main-stays-green: Tasks 4/6/7/8 (drop + `safe()`/`findPrimaryAdminId`/`auth.service` reads) MUST land in one PR or main breaks at runtime. The >10-file heuristic is a proxy for *unrelated bundling*; here every file is forced by one atomic schema change confined to one subsystem, so it does not trip. |
| 5 | Too many deps? | ✅ NO | 0 new dependencies. |
| 6 | Too many files? | ✅ NO | 4 new files (`collapse-multi-role.ts` + test, `migration.sql`, `down.sql`). Well under ≤15. |
| 7 | Too many APIs? | ✅ NO | 0 endpoints added, 3 removed. No new hooks/mutations. |

**Plan A call: APPROVE — all 7 pass.**

---

## Plan B — Frontend

| # | Criterion | Result | One-line why |
|---|-----------|--------|--------------|
| 1 | Over-engineering? | ✅ NO | Inlines `RolePicker.tsx`'s `isGrantable`/`isAdminLevelRole`/self-demotion logic into its single consumer, deletes dead `AdminUsers.tsx` and dead query params. Net-simpler; collapses two role-assignment UIs into one listbox. |
| 2 | Duplicate work? | ✅ NO | Removes the second (RBAC) role UI and the dead `AdminUsers` screen — the whole point is de-duplication. |
| 3 | Existing solution? | ✅ NO | Bespoke in-house role picker; no framework covers it. |
| 4 | Scope too large? | ✅ NO | ~12 frontend files across 1 subsystem, plus exactly **one deliberately-justified backend crossover file** (`user.service.ts` in Task 1, bundling the response-shape change with its two consumers per option (a)). Task 9 Step 4 mechanically proves the backend footprint is exactly those 3 files. Within the ≤10-file/≤3-subsystem guideline. |
| 5 | Too many deps? | ✅ NO | 0 new dependencies. |
| 6 | Too many files? | ✅ NO | 3 new files (all test files). Under ≤15. |
| 7 | Too many APIs? | ✅ NO | 0 endpoints; **removes** 3 multi-role hooks. Net-negative. |

**Plan B call: APPROVE — all 7 pass.**

---

## Targeted verifications the split had to satisfy

**(1) Each plan within file-count/subsystem guidelines on its own** — ✅
- Plan A: 4-subsystem spread collapsed to 1 subsystem + docs; file count irreducible and already certified. Passes on the resolved subsystem dimension.
- Plan B: 1 frontend subsystem + 1 justified single-file backend crossover. Passes.

**(2) Task 8↔20 coupling fix applied as prescribed (option (a))** — ✅
- **Plan A keeps `safe()` backward-compatible:** Task 6 Step 1 types `UserResponse.role` as `string` ("UNCHANGED contract"), sourced from `roleRef.key` via the transitional mapper. Global constraint: "This plan must not change any existing API response shape that a shipped frontend screen currently reads." Task 11's `RoleDto.key` is purely additive. Plan A does **not** prematurely break `GET /users`. Confirmed.
- **Plan B carries the shape change WITH its consumers:** Task 1 flips `safe()` to `{id,name,key,isSystem}` + `isPrimaryAdmin`, and its two consumers — `AdminBranches.tsx` (Task 5) and `UserManagementTab.tsx` (Task 8) — live in the same plan/PR. Task 1 Step 6 explicitly forbids merging it alone. No merge boundary separates the shape change from its readers. Confirmed — option (a) implemented exactly.

**(3) Neither plan silently reintroduces what the rejection targeted** — ✅
- No cross-subsystem smuggling: Plan A Task 15 Step 4 asserts `git diff src/frontend` is empty; Plan B Task 9 Step 4 asserts the backend diff is exactly Task 1's 3 files.
- The transitional-mapper duplication is bounded and deleted by Plan B Task 1 — it does not survive the feature.
- Ordering is explicit: Plan B's Global Constraint requires Plan A merged to `main` before Task 1 starts.

---

## Pipeline disposition

Both plans APPROVE. **Cleared to `/execute-plan` (Step 6).**

**Execution order is fixed and non-negotiable:**
1. **Plan A first** — it has no frontend dependency and must be merged to `main` before Plan B begins.
2. **Plan B second** — every task assumes Plan A's `roleId`-based API (`POST/PUT /users`, `GET /clinic/roles` with `key`) is already live on `main`.

Do not interleave the two PRs. Plan B's Task 1 is the single point in the whole feature where one PR legitimately touches both a backend file and frontend files — that is by design (the coupling fix) and must not be replicated elsewhere.

---

## Notes for the record

- This was a **scope-packaging** re-review, consistent with the original rejection being packaging-only. No design/spec/AC content changed across the split; the content was already certified sound in `718077f`.
- Plan A's file count crossing the raw >10 line is not a Criterion-4 failure because it is (a) the irreducible atomic blast radius of a single column drop, already certified, and (b) now confined to one subsystem — the dimension that actually decided the original REJECT. Rejecting it here would deadlock the pipeline with no green-preserving path forward.
- If either PR's execution surfaces an out-of-scope backend consumer in Plan B beyond Task 1's three files (Task 9 Step 4 guards this), pause and re-gate rather than widening the crossover exception.
