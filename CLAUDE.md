# CLAUDE.md — Anemal Project Orchestration

**Anemal**: Multi-tenant vet clinic SaaS. Tablet (touch-first) + Web.

---

## Agent Router

| Task | Agent | Model / Effort | Step |
|------|-------|----------------|------|
| Requirements, authorization design, gap analysis — **WHAT + WHO** | `@ba-agent` | opus / max | 3 |
| Architecture: logical model, class/interface contract, patterns, transactions, test strategy — **HOW** | `@arch-agent` | opus / max | 3.4 |
| Scope, task breakdown, AC, work-partition manifest | `@pm-agent` | sonnet / high | 1, 2, 4 |
| Screen/component design (**UIUX A**) | `@uiux-agent` | sonnet / low | 6 |
| Physical schema, migration, query safety, tenant isolation **(veto)** (**DBA**) | `@db-agent` | opus / high | 6 |
| Backend/frontend implementation (**Dev A** / **Dev B**) | `@dev-agent` | sonnet / high | 6 |
| Design stress-test (MANDATORY) — `/grill-with-docs` | human-driven + `@ba-agent` | opus | 3.5 |
| Simplicity gate — modes `arch-precheck` · `gate` · `reverse` | `@ponytail-agent` | opus / max | 3.4b, 5 |
| Tests, edge cases, isolation/RBAC, arch conformance | `@qa-agent` | opus / max | 7 |
| Git hygiene, PR compliance, reference integrity, docs, ship | `@scribe-agent` | sonnet / high | 4b, 8 |

**Orchestrator = this session**, not an agent. Every step: PRE (inputs exist?) → BRIEF (agent, task,
skills, output path, file scope) → POST (output + gate verdict) → LOG (write the HANDOFF file).
Full contract: `.claude/standards/orchestration-protocol.md`.

**Rules:** Delegate first (except trivial one-liners). Every delegation names: agent, task, skills
cited, output path — and in Step 6, its exclusive file scope. Context > 70% → Auto-Compact.

---

## Lane selector — pick before doing anything

| The request | Lane | Entry |
|-------------|------|-------|
| new or changed behaviour, a feature, a new screen | **A** | `/superpowers:brainstorm` — full pipeline below |
| something is broken and should not be | **B** | `/anemal-fix-bug` |
| prod down · data corrupting · security hole · `main` red | **C** | `/anemal-hotfix` — **human declares it, never an agent** |
| behaviour identical, structure improves | **D** | `/anemal-refactor` |
| "review the code", no change requested | none | `/code-review` |

Mechanics for B/C/D: skill `anemal-dev-lanes`. **Ambiguous → ask, do not guess.**
**Scope guard:** *all · entire · whole repo · ทั้งหมด* → produce a backlog first, then one item per branch.

---

## Standard Pipeline (Lane A)

```
STEP 1   /superpowers:brainstorm        @pm + @ba     ⛔ human approves before any plan or code
STEP 2   tasks + AC                     @pm
STEP 3   validate + authz design        @ba           ⛔ GATE: BA sign-off
STEP 3.4 architecture design            @arch         (skip if below threshold — then write
                                                       "arch: skipped (below threshold)" in the plan)
STEP 3.4b arch pre-check                @ponytail     mode arch-precheck — BLOCK returns to 3.4
STEP 3.5 /grill-with-docs               human + @ba   ⛔ GATE: MANDATORY, covers requirement + architecture
STEP 4   /superpowers:write-plan        @pm           plan + work-partition manifest →
                                                       docs/superpowers/plans/YYYY-MM-DD-<feature>.md
STEP 4b  reference pre-check            @scribe       a dangling path blocks Step 5
STEP 5   simplicity gate                @ponytail     ⛔ GATE: 9 criteria on {arch doc + plan}, no drift
STEP 6   /superpowers:execute-plan      W0 DBA → W1 Dev A ∥ UIUX A ∥ Dev B → W2 Dev B
                                                       🔗 integration checkpoint after every wave
STEP 7   /code-review + sign-off        @qa           ⛔ GATE: findings closed + arch conformance
STEP 8   /anemal-finish-branch          @scribe       ⛔ GATE: red-suite ship gate, then PR → merge →
                                                       main green → 5 tracking docs → HTML-updater
```

Each agent: assigned scope only → report → return to the orchestrator → terminate.

> **Hard rules — no exceptions:**
> - `/grill-with-docs` is MANDATORY after BA sign-off and cannot be skipped under any circumstance
> - `/write-plan` requires brainstorm output + BA sign-off + `/grill-with-docs` with all findings resolved
> - `/execute-plan` requires `@ponytail-agent` APPROVE — Superpowers plan approval never substitutes
> - `/code-review` requires `@qa-agent` APPROVE and sign-off
> - Step 8 is owned by `@scribe-agent`; never call `/anemal-HTML-updater` directly
> - Step 6 parallelism is legal **only** when `@arch-agent` froze the contract at 3.4; otherwise sequence
> - Skipping any step is a pipeline violation — restart from the violated step
> - The workflow is not finished until STEP 8 is finished

---

## Critical Rules

**Multi-tenancy (ABSOLUTE):** every query includes `WHERE tenant_id = :tenantId`. JWT middleware
extracts `tenant_id` → explicit param on every repository function. Cross-tenant access returns **404**,
never confirms existence. `@db-agent` reviews every DB change and its veto is not overrulable.

**Two planes:**
- Clinic (`/clinic/*`, `/clinic-admin/*`, `/settings/*`): `{ userId, tenantId, branchId, plane:'clinic', permSetVersion, role }`; effective `roleIds[]`/`permissions[]` come from `/auth/me` via `user_roles`
- Platform (`/platform/*`): `{ platformUserId, plane:'platform', role }` — no `tenant_id`, never touches PII
- Every protected route: `requirePlane(...)` → clinic `requirePermission('module.action')` or platform `requirePlatformPermission('platform.*')`. Deny-by-default.

Authority: `anemal-rbac-matrix` skill (canonical permission catalogue and route→permission map).
`.claude/specs/RBAC_Platform_Restructure_Spec.md` is **historical** Phase 5 rationale — not current.

**Structure rules** (layers, abstraction choice, pattern whitelist, error taxonomy, transaction
boundary, state modelling, and whether a value belongs in code or a table):
`.claude/standards/architecture-rules.md`.

---

## Tech Stack

Versions and choices: `.claude/standards/tech-stack.md` (backend, frontend, multi-tenancy, deployment).
Live DDL: `.claude/specs/database-schema.sql` — single canonical copy.

**Shell dialect (Windows dev machine):** the Bash tool runs Git Bash (POSIX sh) — forward slashes, `$VAR`, `&&`; the PowerShell tool runs Windows PowerShell 5.1 — backslash or forward-slash paths, `$env:VAR`, no `&&`/`||`. Never mix dialects in one command (no `head`/`&&`/heredocs in PowerShell; no PowerShell cmdlets like `Get-Content` in Bash). This was the single largest tool-error class in the project's session history — pick the right tool for the syntax you're writing, don't guess.

---

## Ponytail Gate

ANY criterion yes = REJECT. All no = APPROVE. The 9 criteria, the three modes, and the templates live
in `.claude/agents/ponytail-agent/SKILL.md` — canonical there, not duplicated here.

> **Highest authority:** a plan approved by Superpowers `/execute-plan` must still pass the gate.
> **Scope note:** the global `ponytail` persona ("build less, skip what YAGNI allows") governs
> implementation size only — it never authorizes skipping a pipeline gate. When the persona's
> lazy-first instinct conflicts with a gate, the gate wins. `@ponytail-agent` and the persona are
> different things; both stay mandatory.

---

## Project Structure

```
design_prototype/   # Compassionate Care UI (read-only)
.claude/agents/     # <name>.md (trigger) + <name>/SKILL.md (method) — 9 agents
.claude/skills/     # anemal-* domain skills   .claude/standards/  # rules & policies
.claude/specs/      # database-schema.sql · implementation-status-matrix.md · historical RBAC spec
.claude/roadmap/    # index.md · phase-history.md · qa-protocols.md · archive/
src/backend/{config,controllers,middlewares,models,services,routes}/
src/frontend/src/{components,views,hooks,utils,store}/
```

Which document is canonical for what, and who loads it: `.claude/standards/doc-map.md`.

**Searches must exclude** `.claude/worktrees/` and `*/archive/*` — both are stale copies and pollute
every Glob/Grep result. (`.gitignore` covers the first for git only, not for search.)

**Skill priority (highest → lowest):** `.claude/agents/<name>/SKILL.md` → `.claude/skills/anemal-*/`
→ Superpowers skills → default behaviour.

---

## Phases & Status

Phase changelog (test counts + PR mapping) and the ADR index: `.claude/roadmap/phase-history.md`.
**To get current status:** read the newest `docs/superpowers/plans/HANDOFF-*.md` first, then
`.claude/roadmap/index.md` and `.claude/specs/implementation-status-matrix.md`.

---

## Tracking & Documentation

`@scribe-agent` owns documentation and ships every branch; `@pm-agent` decides *what* shipped.
The five documents to refresh, who authors what, and the estate rules:
`.claude/standards/doc-maintenance.md`. Git tracking policy: `.claude/standards/doc-git-policy.md`.
Run the QA protocol at the end of every task: `.claude/roadmap/qa-protocols.md`.

- **Handoff on stop (mandatory, every stop):** whenever work on a multi-step feature pauses for ANY
  reason — end of session, waiting on a human decision, a gate not yet run, context about to compact —
  write/overwrite `docs/superpowers/plans/HANDOFF-<feature-slug>.md` first. Required: exact current
  step + status, the literal next command and agent to invoke, links to every doc produced so far, and
  a pointer to any `PENDING-DECISION-*.md` rather than duplicating it. Overwrite in place; delete once
  the feature ships.
- **Handoff on start (mandatory, every session and every scheduled run):** before touching a feature
  already in flight, read its HANDOFF file and resume from its stated next action. Do not re-derive
  status from git archaeology, and do not redo work it says is done.
- **Red-suite ship gate:** a red backend suite on `main` blocks the next merge — Step 8 refuses the PR,
  or halts before merge, independent of the branch's own test gate. **Exemption:** a branch whose own
  suite is green and which turns those failing tests green (or deletes them with a recorded
  deleted-coverage justification) may merge while `main` is red, and its PR body must say so.
  Mechanic: `anemal-finish-branch` SKILL.md §1.5.

---

## Superpowers Integration

Works **alongside** the Agent Router, never replacing it; its plan approval never substitutes for a
pipeline gate. `/brainstorm` feeds Step 1 · project skills outrank Superpowers skills on the same
topic · `/tdd` applies inside `/execute-plan` and at Lane B step 1 · `/code-review` runs at the 6→7
handoff owned by `@qa-agent` · Superpowers routing suggestions are advisory.
