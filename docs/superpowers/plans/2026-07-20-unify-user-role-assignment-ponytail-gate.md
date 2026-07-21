# Ponytail Gate — 2026-07-20 Unify User Role Assignment

**Plan reviewed:** `docs/superpowers/plans/2026-07-20-unify-user-role-assignment.md` (23 tasks, commit `5b4ce5c`)
**Gate:** CLAUDE.md Step 5 — mandatory checkpoint between `/write-plan` and `/execute-plan`
**Reviewer:** @ponytail-agent (Opus) — isolated context, plan + spec only
**Verdict:** ❌ **REJECT** — Criterion 4 (scope size) trips. 6 of 7 pass.

---

## Per-criterion verdict

| # | Criterion | Result | One-line why |
|---|-----------|--------|--------------|
| 1 | Over-engineering? | ✅ NO | Collapse script's classify/execute/audit split is proportionate to a real live-data migration with an ambiguous-case manual-resolution requirement; the D-8 legacy-string JWT mapper is the *less*-work option, deliberately chosen to keep 9 auth-consumer files byte-identical. Nothing gold-plated. |
| 2 | Duplicate work? | ✅ NO | The change *removes* duplication (two conflicting role UIs → one). The no-escalation subset check ported into `user.service.ts` (Task 10) mirrors `role.service.ts`'s existing logic by explicit anti-drift decision (URA-4.1), not accidental copy. |
| 3 | Existing solution? | ✅ NO | Domain-specific — dropping a bespoke `LegacyRole` column and unifying an in-house RBAC picker. No library covers it. |
| 4 | Scope too large? | ❌ **YES** | **~30 files touched across 4 subsystems** (DB migration, backend user/role/auth services, frontend, docs) — 3× the ≤10-file limit and over the ≤3-subsystem limit. The tasks doc's own scope-summary self-flags this ("Net file count likely still trips ≤15… recommend /write-plan splitting into 2 PRs… treat this as the default expectation"). |
| 5 | Too many deps? | ✅ NO | 0 new dependencies. |
| 6 | Too many files? | ✅ NO | Only **4 new files** (`collapse-multi-role.ts` + test, `migration.sql` + `down.sql`). The auth mapper is a new function, not a file. Well under ≤15. |
| 7 | Too many APIs? | ✅ NO | **0 endpoints added, 2–3 removed.** No new hooks/mutations — reuses `useClinicRolesQuery`, deletes the multi-role hooks. |

---

## Rejection detail

```
@pm-agent — Ponytail gate

Criterion 4: Scope too large ❌
Finding: One plan file executes ~30 file changes across 4 subsystems
  (DB migration, backend user/role/auth services, frontend Edit-User/Role-Editor/
  Admin-Branches, and docs). >10 files and >3 subsystems both trip. The scope is
  *legitimate* (irreducible blast radius of dropping a column 13+ files depend on,
  not scope creep) — but it must not ship or execute as one unit. The tasks doc
  already recommended this split and pre-structured the plan into 4 phases for it.

Suggested fix: Split into two plans / two PRs along the existing phase seams:
  • Plan A (migration + backend): Phase 0 Tasks 1-4, Phase 1 Tasks 5-13,
    AND Phase 3 docs Tasks 21-22.
    → Docs MUST travel with Plan A, not Plan B: CORR-1.2 (BA sign-off) binds
      URA-5 doc supersession to ship "in the same change set as URA-1's D-7
      collapse." Do not defer Tasks 21-22 to the frontend PR.
  • Plan B (frontend): Phase 2 Tasks 14-20.

  ⚠ One coupling gotcha the split must respect — Task 8 ↔ Task 20:
    Task 8 (Plan A) changes GET /users' `UserResponse.role` from a string to an
    object `{id,name,key,isSystem}` and adds `isPrimaryAdmin`. The current frontend
    (UserManagementTab.tsx) still reads `role` as a string until Task 20 (Plan B).
    Splitting naively at the Phase 1/2 seam leaves the Users screen broken between
    the two merges (the JWT `role` claim stays byte-identical via D-8, so auth/
    routing is safe — only the list-response consumer breaks).
    Resolve one of:
      (a) keep `safe()` backward-compatible in Plan A and move the response-shape
          change into Plan B with its consumer, or
      (b) land Plan A + Plan B in close succession and document that main's Users
          screen is transiently broken between merges (weaker — violates the
          "main stays green/deployable after merge" convention), or
      (c) re-cut the seam so the response-shape change and its sole consumer are
          in the same PR.
    Prefer (a) — smallest broken window, cleanest per-PR review.

Resubmit when: the plan is re-issued as two plan files (A backend+migration+docs,
  B frontend) with the Task 8↔20 response-shape coupling resolved (option (a)
  preferred). Re-run this gate on each of the two split plans.
```

---

## Notes for the record

- This is a **scope-packaging** rejection, not a design rejection. The 7-point gate governs plan size/shape, and its rule is mechanical: any one YES = REJECT. Nothing here disputes D-1..D-8, the grill findings, or the BA sign-off — the *content* is sound and the file count is the honest cost of the column drop.
- Criteria 5, 6, 7 pass comfortably; the plan is disciplined on dependencies, net-new files, and API surface (it is net-negative on endpoints).
- The 4-phase structure already mirrors the split, so actioning this fix is bookkeeping, not redesign.
- Escalate to @pm-agent per SKILL.md if the split is disputed with rationale (e.g. an argument that the two PRs cannot be independently green).
