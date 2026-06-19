# Phase 05 — Plan (sub-phase waves)

**Authoritative task list:** `.claude/roadmap/phase5-rbac-platform-tasks.md`
**Spec:** `.claude/specs/RBAC_Platform_Restructure_Spec.md` · **Mode:** mvp-incremental

## Wave order (dependencies)
```
5-A (RBAC foundation)
  └─> 5-B (enforce on clinic APIs)        [5-B-00 regression guard FIRST]
5-A, 5-B ──> 5-C (platform plane split)
        5-C ──> 5-D (platform domain APIs + quotas)
5-A..5-D ──> 5-E (frontend restructure + guards)
        5-E ──> 5-F (role editor + platform console UI)
all ──────> 5-G (QA hardening + cleanup + docs LAST)
```

## Sub-phases
| # | Title | Layer | Lead agents | Exit criteria |
|---|---|---|---|---|
| 5-A | RBAC foundation | DB+BE | @db, @dev | permission middleware live; users migrated to role_id |
| 5-B | Enforce on clinic APIs | BE+QA | @dev, @qa | matrix enforced; regression guard green; no lockout |
| 5-C | Platform plane split | DB+BE | @db, @dev | platform auth + plane isolation (cross-plane 403) |
| 5-D | Platform domain APIs | BE | @db, @dev | plans/quotas + quota enforcement (409) |
| 5-E | Frontend restructure | FE | @uiux, @dev | three shells + permission guards; clinic Dashboard clinic-only, system settings platform-only |
| 5-F | Role + Platform UI | FE | @uiux, @dev | clinic role editor + platform console screens |
| 5-G | QA + cleanup + docs | QA | @qa | matrix/plane suites green; structure clean; docs updated |

## Success criteria (phase) — see SPEC section 12 (8 acceptance criteria)
- doctor cannot bill; staff cannot edit EMR; admin owns clinic config — enforced API + UI.
- cross-plane access blocked both ways; quota over-limit -> 409; custom role cannot escalate.
- all prior isolation tests pass; no access regression; structure consolidated.

## How to start (for Claude Code)
1. Load skills: `anemal-rbac-matrix`, `anemal-platform-console`, `anemal-db-context`, `anemal-coding-rules`.
2. @db-agent: implement T-5A-01/02 from the task file (migrations + seed).
3. @qa-agent: write T-5B-00 regression guard before any enforcement.
4. Proceed wave by wave; run QA protocol at end of each task; keep tests green.
