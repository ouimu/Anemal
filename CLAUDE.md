# CLAUDE.md — Anemal Project Orchestration

**Anemal**: Multi-tenant vet clinic SaaS. Tablet (touch-first) + Web.

---

## Agent Router

| Task | Agent | Model | Superpowers Skills | Sequence |
|------|-------|-------|--------------------|----------|
| Requirements, authorization design, gap analysis | `@ba-agent` | opus | `/brainstorm` | Step 3 |
| Scope, task breakdown, coordination, docs owner | `@pm-agent` | sonnet | `/brainstorm`, `/write-plan`, `/grill-with-docs`, `/execute-plan`, `/anemal-finish-branch` | Step 1, 2, 4, 8 |
| Screen/component design | `@uiux-agent` | sonnet | `/brainstorm` | Step 6∥ |
| Schema, migration, query safety, tenant isolation | `@db-agent` | sonnet | `/migrate` | Step 6∥ |
| Backend/frontend implementation | `@dev-agent` | sonnet | `/tdd`, `/debug`, `/optimize` | Step 6∥ |
| Stress-test design before plan (MANDATORY) | (human-driven) | opus | `/grill-with-docs` (invokes `grilling` + `domain-modeling` skills) | Step 3.5 gate |
| Simplicity gate | `@ponytail-agent` | opus | — (project gate, not Superpowers) | Step 5 gate |
| Tests, edge cases, isolation/RBAC verification | `@qa-agent` | opus | `/tdd`, `/code-review`, `/audit` | Step 7 |

**Rules:** Delegate first (except trivial one-liners). Each delegation must include: agent name, task, specs/skills cited, output path. Context > 70% → Auto-Compact.

---

## Standard Pipeline

```
STEP 1 — /superpowers:brainstorm          [@pm-agent + @ba-agent]
          Clarify scope, confirm requirements, design sign-off.
          ⛔ NO code, NO plan until human approves brainstorm output.
          ↓
STEP 2 — @pm-agent (tasks + AC)
          Translate brainstorm output into acceptance criteria & task list.
          ↓
STEP 3 — @ba-agent (validate + design)
          Validate requirements, authorization design, gap analysis.
          ⛔ NO write-plan until BA sign-off.
          ↓
STEP 3.5 — /grill-with-docs   [human-driven + @ba-agent, MANDATORY]
          Stress-test the validated design. Interview until
          assumptions, edge cases, failure modes exposed & resolved.
          ⛔ MANDATORY — CANNOT be skipped. /write-plan is BLOCKED
             until grilling runs AND all findings are resolved.
             No grill = pipeline violation, restart from Step 3.5.
          ↓
STEP 4 — /superpowers:write-plan          [@pm-agent owns]
          Break into 2–5 min tasks with exact file paths, interfaces, tests.
          Save to: docs/superpowers/plans/YYYY-MM-DD-<feature>.md
          ⛔ Must run AFTER @ba-agent sign-off AND /grill-with-docs. NEVER before brainstorm.
          ↓
STEP 5 — @ponytail-agent (ANY flag → REJECT, all clear → APPROVE)
          Reviews write-plan output against 7 criteria before any execution.
          ⛔ /execute-plan is BLOCKED until Ponytail approves.
          ↓
STEP 6 — /superpowers:execute-plan        [@dev-agent ∥ @db-agent ∥ @uiux-agent]
          Subagents implement task-by-task with /tdd or /migrate per agent.
          Two-stage review after each task (spec compliance → code quality).
          ⛔ NO skipping tasks. NO merging steps. Checkboxes must be tracked.
          ↓
STEP 7 — /code-review 					[@qa-agent (Code Review + sign-off)]   [/audit if RBAC-related]
          ↓
STEP 8 — /anemal-finish-branch           [@pm-agent ships the branch]
		  Preflight gh auth → run tests → create PR → verify main stays green
		  after merge → triggers /anemal-HTML-updater as its last act (update
		  all markdown files, clearing finished/unused, update HTML document).
		  ⛔ Must run everytime after STEP 7. Never call /anemal-HTML-updater
		  directly — it is invoked by /anemal-finish-branch, not a standalone step.
		  
```

Each agent: performs only assigned scope → produces report → returns to coordinator → terminates.

> **Hard rules — no exceptions:**
> - `/grill-with-docs` is MANDATORY after `@ba-agent` sign-off (Step 3) and CANNOT be skipped under any circumstance
> - `/write-plan` requires `/brainstorm` output + `/grill-with-docs` + `@ba-agent` sign-off + run with all findings resolved
> - `/execute-plan` requires `@ponytail-agent` APPROVE as gate
> - `/code-review` requires `@qa-agent` APPROVE and Sign-off
> - Skipping any step is a pipeline violation — restart from the violated step
> - `/anemal-finish-branch` requires `@pm-agent` APPROVE updating all documents (it invokes `/anemal-HTML-updater` internally as its last step — do not call `/anemal-HTML-updater` directly)
> - Do not finish the workflow, if STEP 8 are not finished.
 
---

## Tech Stack

**Backend:** Node.js + Express + PostgreSQL 15+ + Prisma + JWT (`{ userId, tenantId, branchId, plane, permSetVersion, roleIds[] }`, 8h TTL)  
**Frontend:** React 18 + Tailwind + Zustand + React Query + Vite  
**Multi-tenancy:** Shared DB/schema, `tenant_id` on every table, enforced in middleware + repository layer

**Shell dialect (Windows dev machine):** the Bash tool runs Git Bash (POSIX sh) — forward slashes, `$VAR`, `&&`; the PowerShell tool runs Windows PowerShell 5.1 — backslash or forward-slash paths, `$env:VAR`, no `&&`/`||`. Never mix dialects in one command (no `head`/`&&`/heredocs in PowerShell; no PowerShell cmdlets like `Get-Content` in Bash). This was the single largest tool-error class in the project's session history — pick the right tool for the syntax you're writing, don't guess.

---

## Ponytail Gate — 7 Criteria

ANY yes = REJECT. All no = APPROVE. See `.claude/agents/ponytail-agent/SKILL.md` for templates.

> **Superpowers override:** Ponytail Gate has HIGHEST authority. Any plan approved by Superpowers `/execute-plan` must still pass all 7 criteria before implementation proceeds. Superpowers plan approval does NOT equal Ponytail approval.

> **Scope note:** The global `ponytail` persona ("build less, question every step, skip what YAGNI allows") governs *implementation and code-size decisions only* — it never authorizes skipping a pipeline gate (brainstorm, grill-with-docs, ba-agent sign-off, ponytail-agent review, QA sign-off, finish-branch). If ponytail's lazy-first instinct and a pipeline gate conflict, the gate wins; `@ponytail-agent` (the 7-point plan reviewer above) and the `ponytail` persona are different things and both stay mandatory.

1. Over-engineering? (simpler solution exists)
2. Duplicate work? (reimplements existing code)
3. Existing solution? (lib/framework covers it)
4. Scope too large? (>3 subsystems / >10 files / >500 LOC)
5. Too many dependencies? (>5 new transitive deps)
6. Too many files? (>15 new files)
7. Too many APIs? (>3 new endpoints/hooks/mutations)

---

## Critical Rules

**Multi-tenancy (ABSOLUTE):** Every query must include `WHERE tenant_id = :tenantId`. JWT middleware extracts `tenant_id` → explicit param on every repo function. `@db-agent` reviews all DB changes.

**Two planes:**
- Clinic (`/clinic/*`, `/clinic-admin/*`, `/settings/*`): `{ userId, tenantId, branchId, plane:'clinic', permSetVersion, role }`; effective `roleIds[]`/`permissions[]` come from `/auth/me` via `user_roles`
- Platform (`/platform/*`): `{ platformUserId, plane:'platform', role }` — no `tenant_id`, never touches PII
- Every protected route: `requirePlane(...)` → clinic `requirePermission('module.action')` or platform `requirePlatformPermission('platform.*')`. Deny-by-default.

See `anemal-rbac-matrix` skill and `.claude/specs/RBAC_Platform_Restructure_Spec.md`.

---

## Project Structure

```
design_prototype/        # Compassionate Care UI (read-only)
.claude/
  agents/<name>.md + <name>/SKILL.md   # ba, pm, uiux, db, dev, ponytail, qa
  skills/anemal-{coding-rules,design-system,screen-specs,functional-reqs,
                 db-context,rbac-matrix,platform-console,ba-toolkit}/
  specs/RBAC_Platform_Restructure_Spec.md, database-schema.sql
  roadmap/ACTIVE/remaining-tasks.md, qa-protocols.md, archive/  # completed phase task lists live in archive/
src/
  backend/{config,controllers,middlewares,models,services,routes}/
  frontend/src/{components,views,hooks,utils,store}/
```

**Skill priority (highest → lowest):**
1. `.claude/agents/<name>/SKILL.md` — project-specific agent skills
2. `.claude/skills/anemal-*/` — project domain skills
3. `~/.claude/plugins/cache/Superpowers/skills/` — Superpowers methodology skills
4. Default Claude behavior

---

## Phases

| Phase | Focus | Status |
|-------|-------|--------|
| 1–7 | Foundation → UI redesign | ✅ 226 tests |
| 8 | RBAC + Platform Console | ✅ ~394 backend tests |
| 9 | i18n Thai/English (16 screens, no library) | ✅ 95 frontend tests |
| D-1–D-5 | Username login, company types, payment history, owner-first browse | ✅ 447 backend tests |
| Codex Audit | Batches 1–5: stop-ship fixes, decision docs, QA automation, doc repair, re-audit fixes (PRs #8–#13) | ✅ 835 backend + 143 frontend tests |
| Pet/EMR Batch A | Pet edit, weight↔EMR sync, vitals free-text input (PR #14) | ✅ 850 backend + 168 frontend tests |
| Pet/EMR Item 3 | Inpatient create/edit/delete + board field-mismatch fix (PR #15) | ✅ 864 backend + 181 frontend tests |
| Remember-me redesign | Login remember-me redefined as per-subdomain username recall, not session persistence (PR #16, ADR-0010) | ✅ 864 backend + 207 frontend tests |
| Care History view | Read-only inpatient Care History on CageCard, admitted-only scope (PR #17, ADR-0011); folds in Log Care vitals field-name fix | ✅ 864 backend + 213 frontend tests |
| Pet Profile Medical tab | Medical tab redesigned as permission-aware read-only EMR rollup, Option C hybrid (PR #18, ADR-0012) | ✅ 867 backend + 218 frontend tests |
| Billing pipeline fixes | Thai PDF font, Payment History receipt modal + Method/Received-by filters, Care History performer-name resolution via new `DailyInpatientCare.performedBy → User` FK (PR #19, ADR-0013) | ✅ 888 backend + 225 frontend tests |
| Hospitalization branch isolation | Closed BOLA gap (OWASP API1:2023) on single-record hospitalization ops — `branchId` now derived from authenticated context and threaded through get/edit/remove/logCare/discharge; `/active` no longer trusts query-string branch override (PR #20, ADR-0014) | ✅ 912 backend tests |
| Log Care vitals modal | Added heartRateBpm/respRateRpm/feedingStatus/medicationGiven input fields to the Log Care wizard; extracted shared `VitalStepper` component from ClinicEMR for reuse (PR #21) | ✅ 912 backend + 233 frontend tests |
| RETEST-2026-07-13 fixes | Independent re-test of PRs #19–#21 found 3 P1 defects (unscoped `performedByUser` tenant leak risk, missing FK index on `performedBy`, undefined `text-label-lg` Tailwind token) + 4 regression-test gaps, all closed (PR #22) | ✅ 915 backend + 235 frontend tests |
| Clinic Admins tab | New tenants had no clinic login — `createCustomer()` now auto-creates the tenant's first `clinic_admin` (`admin`/"Administrator", email/phone NULL) atomically in-transaction, plus a "Clinic Admins" tab (list/create/deactivate/reset-password) on Customer Detail — a bounded, audited platform→clinic-plane exception (PR #23, ADR-0015) | ✅ 953 backend + 256 frontend tests |
| Main Branch + password change | Platform-provisioned tenants got zero `Branch` rows (blocked all staff/doctor login) — `createCustomer()` now auto-creates a "Main Branch" in the same atomic transaction (PROV-1), plus an idempotent backfill script (PROV-2) for pre-existing tenants. Added clinic-plane self-service password change (`POST /auth/change-password`, PWD-1) and admin-assisted reset (`PATCH /users/:id/password`, PWD-2), both revoking all refresh tokens on success (PWD-3/PWD-0) — retrofitted onto the existing platform-plane reset too (PR #26, ADR-0015 2026-07-15 amendment) | ✅ 979 backend tests (no frontend UI this batch) |
| Clinic password UI + first-admin lockout guard | Frontend for PR #26's endpoints — admin reset-password field in the Edit User modal (self-edit routed to Preferences, D-2) and a self-service Change Password card on Preferences. New backend guard `assertNotPrimaryAdminDeactivation` in `user.service.ts` blocks deactivation AND role-demotion-away-from-admin on the tenant's primary admin (legacy lowest-id `role='admin'`) on both `DELETE /users/:id` and `PUT /users/:id`; restore path now re-checks seat quota. Discoverable row-level Deactivate/Restore on User Management with confirm dialog + locked icon on the primary-admin row. Platform-plane CO-4 deliberately exempted from the guard (documented recovery path, ADR-0016 D-7) (PR #27, ADR-0016) | ✅ 993 backend + 283 frontend tests |
| Settings IA restructure | Admin "Settings" renamed to "Appointment"; idle-timeout Security policy moved to Users & Roles; My Preferences split into standalone `/preferences` page; Clinic Settings surfaced on admin sidebar; Clinic Profile + Branches de-duplicated out of admin sidebar; TopNav titles rekeyed to `/clinic-admin/*`; remember-me collapsed to single most-recent-username prefill (ADR-0017 supersedes ADR-0010's chooser-modal UI) (PR #31) | ✅ 993 backend + 283 frontend tests |
| Usage Stats quota fix | Added 4th quota field `maxPets` mirroring `maxOwners` across schema, all 3 independent quota resolvers (platform-plane, customer-detail override, clinic-plane subscription), and enforcement (`assertCanAddPet` on pet creation). Fixed the actual reported bug — `AdminUsage.tsx` rendered a hardcoded fake `PLAN_LIMITS` constant instead of the tenant's real effective quota. Added Max Pets to Platform Console (Plan editor + table, per-tenant quota override, Customer Detail Usage tab 4th QuotaBar — QA-caught gap, fixed same-day) (PR #33, ADR-0018) | ✅ 1021 backend + 291 frontend tests |
| Unify user role assignment — Plan A (backend) | Retired the shipped-but-superseded multi-role-per-user capability and the legacy `User.role` enum column; `roleId` (RBAC Role table) is now the sole source of truth for a user's role, closing the two-conflicting-UI drift the Edit User modal had accumulated. Closed a privilege-escalation / cross-tenant BOLA gap: role-assignment returns 404 (not 403) on a foreign-tenant `roleId` (existence-leak precedent, ADR-0014), plus an added `users.roleId` index. Migration classifies and collapses existing multi-role users with an audit log + manual-resolution report for ambiguous cases. Backend + migration + docs only, zero frontend blast radius — Plan B (frontend unification of the two role-assignment UIs) is planned but not yet started (PR #37, ADR-0019) | ✅ 1015 backend tests (net decrease from 1021 — retired-endpoint test files removed) / 291 frontend tests (unchanged) |
| 10 | Payment gateway + SaaS billing | ⏸ needs credentials |
| 11 | LINE/SMS dispatch | ⏸ needs credentials |

See `.claude/roadmap/archive/bugfix-pipeline-2026-07-tracker.md` for the completed 2026-07 bugfix pipeline (all 3 items shipped — Items 1–2 via PRs #17/#18, Item 3 via PR #19), `.claude/roadmap/ACTIVE/pet-emr-inpatient-fixes.md` for Pet/EMR sub-tasks (all 4 items shipped), `.claude/roadmap/ACTIVE/remaining-tasks.md` for other sub-tasks, `docs/adr/0014-hospitalization-branch-isolation.md` for the branch-isolation BOLA fix (PR #20), `docs/adr/0015-platform-provisions-clinic-admin-identity.md` for the Clinic Admins tab / first-admin provisioning design (PR #23) plus its 2026-07-15 amendment extending the same bounded exception to the `branches` write (PROV-1, PR #26), `docs/adr/0016-primary-admin-lockout-protection-scope.md` for the lockout-guard scope decisions (D-1..D-9, PR #27), `docs/adr/0018-maxpets-quota-dual-resolver-and-enforcement.md` for the maxPets quota-field design (PR #33), `docs/superpowers/plans/archive/2026-07-19-usage-stats-quota-fix.md` for its 16-task implementation plan (archived, all complete), and `docs/adr/0019-single-role-per-user-retires-multi-role.md` for the single-role model design (PR #37, Plan A) — Plan B (frontend) plan lives at `docs/superpowers/plans/2026-07-20-unify-user-role-assignment-plan-b-frontend.md`, not yet executed.

---

## Tracking & Documentation

- `@pm-agent` documents LAST on every task: phase status, test count, HTML in docs/(index.html, functional_spec_detailed.html), CLAUDE.md
- `.claude/specs/implementation-status-matrix.md` is the canonical module-level implementation-status source; `@pm-agent` updates it LAST on every task, alongside the phase status/test count/HTML docs it already updates last.
- `@ba-agent` provides content for `docs/functional_spec_detailed.html`, update all specification documents in .claude/specs/ ; `@pm-agent` commits
- Run QA protocol at end of every task: `.claude/roadmap/qa-protocols.md`
- Interrupted work: save resume state to file, show prompt to continue, delete when complete

---

## Superpowers Integration

Superpowers is installed as a Claude Code plugin and provides methodology skills (brainstorming, TDD, debug, migrate, audit, optimize). It works **alongside** this project's Agent Router — it does NOT replace it.

**Mandatory skill sequence — enforced, no skipping:**

```
/brainstorm → @pm-agent → @ba-agent sign-off → /grill-with-docs, MANDATORY → /write-plan → [Ponytail Gate] → /execute-plan → /code-review → @qa-agent sign-off → /anemal-finish-branch (→ /anemal-HTML-updater)
```

**Coexistence rules:**

1. **Brainstorming hook:** When Superpowers auto-triggers `/brainstorm` at session start, treat the output as pre-input to `@pm-agent`. It does NOT replace the Standard Pipeline — it feeds Step 1.
1a. **Grilling gate (MANDATORY):** `/grill-with-docs` (which invokes the `grilling` skill) runs at Step 3.5, after `@ba-agent` sign-off, and is non-skippable. `/write-plan` is BLOCKED until grilling has run and every grill finding is resolved. Skipping it = pipeline violation; restart from Step 3.5. This skill stress-tests the design — no exception, even for "small" features.
2. **write-plan sequence:** `/write-plan` must run AFTER `@ba-agent` sign-off (Step 3) AND after `/grill-with-docs` (Step 3.5). Running it before brainstorm, before BA validates, or before grilling is a pipeline violation.
3. **execute-plan gate:** `/execute-plan` is BLOCKED until `@ponytail-agent` APPROVE (Step 5). Superpowers plan approval ≠ Ponytail approval. Both are required.
4. **No step skipping:** Running `/execute-plan` directly without `/write-plan` output as input is not allowed. Restart from `/write-plan` if plan is missing.
5. **Skill precedence:** Project skills (`.claude/agents/*/SKILL.md`, `.claude/skills/anemal-*/`) always win over Superpowers skills when they cover the same topic.
6. **TDD scope:** Superpowers `/tdd` applies to `@dev-agent` implementation tasks inside `/execute-plan` only. 
7. **Code review gate:** `/code-review` runs right after `/superpowers:executing-plans` (Step 6→7 handoff), owned by `@qa-agent`. Open findings block QA sign-off. `@qa-agent` retains ownership of RBAC, isolation, and edge-case verification per `.claude/roadmap/qa-protocols.md`.
8. **No routing override:** Superpowers subagent routing suggestions are advisory only. Final agent delegation follows the Agent Router table above.
