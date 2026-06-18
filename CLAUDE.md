# CLAUDE.md — Anemal Project Orchestration

**Anemal**: Multi-tenant vet clinic SaaS. Tablet (touch-first) + Web. 6-agent collaboration model.

---

## Agent Router — Who Does What

| Task | Agent | Model |
|------|-------|-------|
| Requirements, authorization design, gap analysis, writing plan | `@ba-agent` | opus |
| Scope controllers, task breakdown, Orchestration, Coordinator, docs owner ( All HTML pages in `docs/`, CLAUDE.md, HistoryLog) | `@pm-agent` | sonnet |
| Screen/component design, Figma specs | `@uiux-agent` | sonnet |
| Schema, migration, query safety, tenant isolation | `@db-agent` | sonnet |
| Backend/frontend implementation | `@dev-agent` | sonnet |
| Simplicity gate: over-engineering, scope, dependencies, duplication | `@ponytail-agent` | opus |
| Tests, edge cases, isolation/RBAC verification | `@qa-agent` | opus |

**RULE:** 
- Delegate first (except trivial one-liners). Agents run in isolated context. Each delegation must: (a) agents name, (b) name task, (c) cite specs/skills, (d) say where to write output.
- Each agent must:
	- Perform only its assigned scope.
	- Produce a final report.
	- Return the report to the coordinator.
	- Terminate after report submission.
  Coordinator must:
	- Wait for all reports.
	- Aggregate results.
	- Confirm all agents completed.
	- End the workflow.
- Context > 70%, Consider to Auto-Compact
---

## Standard Pipeline

```
@pm-agent (Coordinator + tasks + AC)
  → @ba-agent (validate + design)
     → @db-agent (schema) ∥ @uiux-agent (screens) ∥ @dev-agent (code)
        → @ponytail-agent (simplicity gate)
           ↓
        [Check 7 criteria]
           ├─ YES (any flag) → REJECT + return to agents with feedback
           └─ NO (all clear) → APPROVE → proceed
              → @qa-agent (test + sign-off)
				→ @pm-agent (Update Status, Document)
```

**Enforcement:** 
- @db-agent reviews all DB changes
- @ponytail-agent blocks over-engineering/scope creep/duplication BEFORE @qa-agent (early feedback loop)
- @qa-agent approves before "done"
- @pm-agent updates docs/HistoryLog at end of each task

---

## Tech Stack

**Backend:** Node.js + Express + PostgreSQL 15+ + Prisma + JWT (`{ userId, tenantId, branchId, plane, permSetVersion, roleIds[] }`, 8h TTL)  
**Frontend:** React 18 + Tailwind + Zustand + React Query + Vite  
**Multi-tenancy:** Shared DB/schema, `tenant_id` on every table, enforced in middleware + repository layer

---

## Ponytail Gate — Simplicity Enforcement

**Status:** ✅ LIVE (Enforced from June 23, 2026)  
**Scope:** ALL tasks (feature work, refactors, schema changes, docs) — no exemptions  
**When:** After @ba-agent, @db-agent, @uiux-agent, @dev-agent finalize, BEFORE @qa-agent  
**Owner:** @ponytail-agent (Opus, independent review)  
**Trigger:** Any deliverable claiming to be "done"

**The 7-Point Check:**

| # | Criterion | Rejection Signal |
|---|-----------|------------------|
| 1 | Over-engineering? | Complex solution where simple exists; premature abstractions; unnecessary patterns |
| 2 | Duplicate work? | Reimplements existing feature/utility/schema; violates DRY principle |
| 3 | Existing solution available? | 3rd-party lib/tool already solves this; rebuild vs. integrate cost analysis missing |
| 4 | Scope too large? | Affects >3 major subsystems; requires >10 files changed; >500 LOC in single PR |
| 5 | Too many dependencies? | New external libs without justification; circular imports; > 5 new transitive deps |
| 6 | Too many files? | >15 new files created; refactor scope sprawl (should be 1–2 cohesive commits) |
| 7 | Too many APIs? | >3 new endpoints/hooks/mutations in single task; scope creep signal |

**Decision Logic:**
- **Any YES:** REJECT. Return to originating agent with specific feedback. Agent iterates + resubmits.
- **All NO:** APPROVE. Proceed to @qa-agent review.

**Rejection Feedback Format:**
```
@[agent] — Ponytail gate flagged: [criterion #N] [brief reason]
Suggest: [specific simplification]
Resubmit when: [concrete step to fix]
```

**Examples:**
- ✗ 5 new API endpoints → ✓ 2 endpoints (split 3 others into Phase 9)
- ✗ 12 new files → ✓ 6 files (extract common utilities into existing `utils/`)
- ✗ 3 new npm packages → ✓ 1 package + use native solution for other 2

---

## Critical Rules

### Multi-Tenancy (ABSOLUTE)
Every `SELECT`, `INSERT`, `UPDATE`, `DELETE` must include `WHERE tenant_id = <current_tenant_id>`. Enforced via: (1) JWT middleware extracts `tenant_id` → request context, (2) all repo/service functions receive `tenantId` as explicit param, (3) `@db-agent` reviews all DB changes.

### Authorization — Two Planes (Phase 8 COMPLETE — T-5F: Role Editor + Platform Console UI + Multi-Role Assignment)
**Clinic plane** (`/clinic/*`): `{ userId, tenantId, branchId, roleId }` + system roles `clinic_admin`/`doctor`/`clinic_staff` + custom roles  
**Platform plane** (`/platform/*`): `{ platformUserId, plane:'platform', roleId }` (no tenant_id), operates SaaS, never touches PII  
**Enforcement:** `requirePlane('clinic'|'platform')` → `requirePermission('<module>.<action>')` on every route. Deny-by-default. Server is security boundary.

See `RBAC_Platform_Restructure_Spec.md` (spec), `anemal-rbac-matrix` (routes), `phase5-rbac-platform-tasks.md` (tasks).

---

## Project Structure

```
stitch_vet_clinic_design_system/   # Compassionate Care UI (read-only)
  DESIGN.md, login_page/, dashboard_overview_1024x768/, ...
.claude/
  agents/<name>/SKILL.md           # ba, pm, uiux, db, dev, ponytail, qa
  skills/
    anemal-{coding-rules, design-system, screen-specs, functional-reqs, db-context, rbac-matrix, platform-console, ba-toolkit}/
  specs/
    RBAC_Platform_Restructure_Spec.md, database-schema.sql
  roadmap/
    phase5-rbac-platform-tasks.md, qa-protocols.md
src/
  backend/
    {config, controllers, middlewares, models, services, routes}/
  frontend/
    index.html, tailwind.config.js
    src/{components, views, hooks, utils, store}/
```

---

## Phases (Linear 1–11)

| Phase | Focus | Status |
|-------|-------|--------|
| 1–7 | Foundation through UI redesign sign-off | ✅ (226 tests) |
| **8** | **RBAC + Platform Console + restructure** — 5-A/B/C + T-5D-02/03/04/05 + T-5E + **T-5F done** (Role Editor, Platform Console UI, Multi-Role Assignment) | **✅ Complete (~394 tests)** |
| **9** | **i18n rollout (Thai/English)** — 260+ EN/TH key pairs, 16 clinic screens translated, custom lightweight i18n (no library), language toggle via Zustand `uiStore.language`, Platform Console excluded | **✅ Complete (95 frontend tests)** |
| 10 | Payment gateway + SaaS billing | ⏸ (needs credentials) |
| 11 | LINE/SMS dispatch | ⏸ (needs credentials) |

See `.claude/roadmap/remaining-tasks.md` for sub-tasks.

---

## Design System — Compassionate Care

**Must use** `stitch_vet_clinic_design_system/compassionate_care_system/DESIGN.md` + `design-alignment-plan.md`

### Key Tokens
| Token | Value | Class |
|---|---|---|
| Primary | `#000000` | `text-primary` / `bg-primary` |
| Secondary | `#006c4a` | `text-secondary` / `bg-secondary` |
| Error | `#EF4444` | `text-error` |
| Success | `#22C55E` | `text-success` |
| Fonts | Plus Jakarta Sans (headline), DM Sans (body), Fira Code (code) | `font-headline`, `font-sans`, `font-code` |
| Icons | Material Symbols Outlined | No emoji in nav |

**Sidebar:** `bg-surface shadow-sm` white, active item has `border-r-4 border-primary`  
**Top nav:** Fixed `h-16`, `bg-surface`, content offset `pt-16 pl-56`

**Rule:** Before implementing any screen, copy exact Tailwind from the corresponding `code.html` prototype. Never modify `stitch_vet_clinic_design_system/`.

---

## Tablet Rules (@uiux-agent enforced)

- All interactive ≥ 44×44px (`min-h-[44px]`)
- Prefer dropdowns/toggles/pickers over text input
- Sidebar collapsible, left/right-hand mode support
- Test on 768px (portrait) + 1024px (landscape)
- **No raw hex in components** — use token names only
- **No emoji** — use Material Symbols Outlined

---

## Agent Skills — Load Before Work

| Skill | Agents |
|-------|--------|
| `anemal-coding-rules` | @dev-agent, @qa-agent |
| `anemal-design-system` | @uiux-agent, @dev-agent |
| `anemal-screen-specs` | @uiux-agent, @dev-agent |
| `anemal-functional-reqs` | @pm-agent, @ba-agent |
| `anemal-db-context` | @db-agent |
| `anemal-rbac-matrix` | @ba-agent, @dev-agent, @qa-agent, @db-agent |
| `anemal-platform-console` | @ba-agent, @pm-agent, @dev-agent, @db-agent |
| `anemal-ba-toolkit` | @ba-agent, @pm-agent |
| `anemal-ponytail-gate` | @ponytail-agent |

---

## Tracking & Documentation

- **@pm-agent documents owner:** **LAST** (every task end): Phase status, test count, How to Run, Upcoming Work (✅/next pointer), Roadmap History, `CLAUDE.md`, `HistoryLog` 
- **@ba-agent provides content** for `docs/functional_spec_detailed.html` (functional reqs, API endpoints, architecture), `@pm-agent` commits
- **Run QA protocol** at end of each task: `.claude/roadmap/qa-protocols.md`
- **Interrupted work:** save resume state to file (delete after complete)
