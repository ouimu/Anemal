# CLAUDE.md — Anemal Project Orchestration

**Anemal**: Multi-tenant vet clinic SaaS. Tablet (touch-first) + Web. 6-agent collaboration model.

---

## Agent Router — Who Does What

| Task | Agent | Model |
|------|-------|-------|
| Requirements, authorization design, gap analysis | `@ba-agent` | opus |
| Scope, task breakdown, docs owner (`docs/`, CLAUDE.md, HistoryLog) | `@pm-agent` | sonnet |
| Screen/component design, Figma specs | `@uiux-agent` | sonnet |
| Schema, migration, query safety, tenant isolation | `@db-agent` | sonnet |
| Backend/frontend implementation | `@dev-agent` | sonnet |
| Tests, edge cases, isolation/RBAC verification | `@qa-agent` | opus |

**RULE:** Delegate first (except trivial one-liners). Agents run in isolated context. Each delegation must: (a) name task, (b) cite specs/skills, (c) say where to write output.

---

## Standard Pipeline

```
@pm-agent (tasks + AC)
  → @ba-agent (validate + design)
     → @db-agent (schema) ∥ @uiux-agent (screens)
        → @dev-agent (code)
           → @qa-agent (test + sign-off)
```

**Enforcement:** @db-agent reviews all DB changes; @qa-agent approves before "done"; @pm-agent updates docs/HistoryLog at end of each task.

---

## Tech Stack

**Backend:** Node.js + Express + PostgreSQL 15+ + Prisma + JWT (`{ userId, tenantId, branchId, plane, permSetVersion, roleIds[] }`, 8h TTL)  
**Frontend:** React 18 + Tailwind + Zustand + React Query + Vite  
**Multi-tenancy:** Shared DB/schema, `tenant_id` on every table, enforced in middleware + repository layer

---

## Critical Rules

### Multi-Tenancy (ABSOLUTE)
Every `SELECT`, `INSERT`, `UPDATE`, `DELETE` must include `WHERE tenant_id = <current_tenant_id>`. Enforced via: (1) JWT middleware extracts `tenant_id` → request context, (2) all repo/service functions receive `tenantId` as explicit param, (3) `@db-agent` reviews all DB changes.

### Authorization — Two Planes (Phase 8, T-5E implemented — guards + route reorg done)
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
  agents/<name>/SKILL.md           # ba, pm, uiux, db, dev, qa
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
| **8** | **RBAC + Platform Console + restructure** — 5-A/B/C + T-5D-02/03/04/05 + **T-5E done** (authStore, guards, route reorg, /403) | **▶️ In Progress (344 tests)** |
| 9 | i18n rollout (Thai clinic screens) | 📋 Planned |
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

---

## Tracking & Documentation

- **@pm-agent documents owner:**  **Update docs/index.html LAST** (every task end): Phase status, test count, How to Run, Upcoming Work (✅/next pointer), Roadmap History, `CLAUDE.md`, `HistoryLog` after every task
- **@ba-agent provides content** for `docs/functional_spec_detailed.html` (functional reqs, API endpoints, architecture), `@pm-agent` commits
- **Run QA protocol** at end of each task: `.claude/roadmap/qa-protocols.md`
- **Interrupted work:** save resume state to file (delete after complete)
