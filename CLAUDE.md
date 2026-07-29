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

## Phases & Shipped-Work History

Phase changelog (test counts + PR mapping) and the full ADR/design-doc index live in `.claude/roadmap/phase-history.md`, not here — keep CLAUDE.md generic across sessions. **To get current project status:** read the newest `docs/superpowers/plans/HANDOFF-*.md` first, then `.claude/roadmap/ACTIVE/remaining-tasks.md` and `.claude/specs/implementation-status-matrix.md`. `@pm-agent` appends each shipped phase to `phase-history.md` (LAST, per Tracking rules below).

---

## Tracking & Documentation

- `@pm-agent` documents LAST on every shipped task — refresh ALL of the following, not a subset:
  1. Append the shipped phase (status + test count) to `.claude/roadmap/phase-history.md` (canonical changelog).
  2. Refresh `.claude/roadmap/index.md` header (Updated date + Status line — test counts, latest shipped phase, what's blocked).
  3. Refresh `.claude/roadmap/ACTIVE/remaining-tasks.md` header (Updated date + current test totals) — only if that task didn't already fully update it.
  4. Refresh README.md's one-line "Last updated" footer (test counts + next-up note) — do NOT re-add a phase table there, it's a pointer to `phase-history.md`.
  5. Update the HTML in docs/(index.html, functional_spec_detailed.html).
  `HistoryLog.md` and `CHANGELOG.md` are FROZEN (historical only) — never append to them. Touch CLAUDE.md itself only when an orchestration rule changes — not for per-phase status.
  **Git note:** items 1–3 above (and `docs/adr/`, `docs/superpowers/plans/`, `docs/superpowers/specs/`) are local-only per `.claude/standards/doc-git-policy.md` — refresh them on disk as instructed, but never `git add`/force-add them; `.gitignore` already excludes these paths.
- `.claude/specs/implementation-status-matrix.md` is the canonical module-level implementation-status source; `@pm-agent` updates it LAST on every task, alongside the phase status/test count/HTML docs it already updates last.
- `@ba-agent` provides content for `docs/functional_spec_detailed.html`, update all specification documents in .claude/specs/ ; `@pm-agent` commits
- Run QA protocol at end of every task: `.claude/roadmap/qa-protocols.md`
- **Handoff on stop (mandatory, every stop, no exceptions):** whenever work on a multi-step feature pauses for ANY reason — end of session, waiting on a human decision, a pipeline gate not yet run, context about to compact, or anything else — write/overwrite `docs/superpowers/plans/HANDOFF-<feature-slug>.md` before stopping. Required contents: exact current pipeline step + status, exact next action and exact next agent/skill to invoke (not "continue the feature" — the literal next command), links to every doc produced so far (design, BA sign-off, grill record(s), plan, PRs), and if blocked on a human decision, a pointer to the relevant `PENDING-DECISION-*.md` instead of duplicating it. Overwrite in place each stop (git log already has history); delete once the feature ships.
- **Handoff on start (mandatory, every new session and every scheduled-task run):** before doing anything else on a feature already in flight, check for `docs/superpowers/plans/HANDOFF-<feature-slug>.md`. If present, read it first and resume from its stated next action — do not re-derive status from git log/docs archaeology, and do not restart or duplicate work it says is already done. This applies equally to a human-started session and a routine/cron-triggered scheduled task waking up cold.
- Interrupted work: save resume state to the HANDOFF file above, show prompt to continue, delete when complete

---

## Superpowers Integration

Superpowers (brainstorming, TDD, debug, migrate, audit, optimize) works **alongside** the Agent Router — it does NOT replace it. The mandatory gate sequence is the Standard Pipeline above; those gates are non-skippable per the Hard rules — Superpowers plan approval never substitutes for a pipeline gate.

**Coexistence rules (beyond the pipeline gates):**

1. **Brainstorming feeds Step 1:** Superpowers `/brainstorm` output is pre-input to `@pm-agent`, not a replacement for the pipeline.
2. **Skill precedence:** Project skills (`.claude/agents/*/SKILL.md`, `.claude/skills/anemal-*/`) always win over Superpowers skills on the same topic.
3. **TDD scope:** `/tdd` applies to `@dev-agent` tasks inside `/execute-plan` only.
4. **Code review gate:** `/code-review` runs at the Step 6→7 handoff, owned by `@qa-agent`; open findings block QA sign-off. `@qa-agent` owns RBAC, isolation, and edge-case verification per `.claude/roadmap/qa-protocols.md`.
5. **No routing override:** Superpowers routing suggestions are advisory; final delegation follows the Agent Router table above.
