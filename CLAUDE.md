# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

**Anemal** — a multi-tenant clinic management application for veterinary practices, targeting Tablet (touch-first) and Web (counter/reception) use cases. Sold as a subscription SaaS product.

---

## Agent System

This project uses a 6-agent collaboration model. Always identify which agent role is relevant before starting work. Tag requests with `@agent-name` when delegating sub-tasks.

| Agent | Model | File | Responsibility |
|-------|-------|------|----------------|
| `@ba-agent` | `opus` | `.claude/agents/ba-agent/SKILL.md` | Requirement analysis, authorization/permission design, gap analysis, solution architecture (upstream of @pm-agent) |
| `@pm-agent` | `sonnet` | `.claude/agents/pm-agent/SKILL.md` | Scope control, requirement validation, task breakdown |
| `@uiux-agent` | `sonnet` | `.claude/agents/uiux-agent/SKILL.md` | Touch-first UI design, tablet layout, component specs |
| `@db-agent` | `sonnet` | `.claude/agents/db-agent/SKILL.md` | Schema design, multi-tenancy enforcement, query safety |
| `@dev-agent` | `sonnet` | `.claude/agents/dev-agent/SKILL.md` | Full-stack implementation, clean/modular code |
| `@qa-agent` | `opus` | `.claude/agents/qa-agent/SKILL.md` | Test cases, edge cases, data isolation verification |

> **Model rationale.** `opus` for the two reasoning gatekeepers (@ba-agent design correctness, @qa-agent adversarial verification); `sonnet` for the build/spec roles (@pm/@uiux/@db/@dev). Each agent's `.claude/agents/<name>.md` carries a `model:` frontmatter field; change it there to override. Use `model: inherit` to fall back to the orchestrator's model.

> **How the agents run.** Each agent is a real Claude Code **subagent** defined at
> `.claude/agents/<name>.md` (auto-discovered; runs in its own isolated context). The matching
> `.claude/agents/<name>/SKILL.md` is the agent's deep reference, which the subagent loads on start.
> The main Claude session is the **orchestrator** — it delegates to subagents; they do not all run
> automatically. See **Development Workflow & Agent Orchestration** below.

---

## Development Workflow & Agent Orchestration

**MANDATORY — Agent-first rule:** For every user prompt, the orchestrator (main session) MUST identify which agent(s) apply using the router table below and delegate to them BEFORE doing any work inline. Do not implement, design, review, or write tests directly — delegate. Only handle trivial one-liner answers (e.g., "what file is X in?") inline without delegation.

The main session orchestrates; it delegates discrete, well-scoped work to subagents. Subagents have
**isolated context** — they do NOT see the chat history. So every delegation must (a) name the task,
(b) point to the spec/task file + skills to load, and (c) say where to write output. Subagents
persist results to the repo (specs, code, tests) and report file paths back.

### Router — which agent for which task
| Trigger / task type | Agent |
|---|---|
| New/unclear requirement, authorization design, gap analysis, "is this the right design?" | `@ba-agent` |
| Scope check, break a requirement into tasks + acceptance criteria | `@pm-agent` |
| Any screen/component/layout design or design-system review | `@uiux-agent` |
| Schema, migration, query, index, tenant-isolation review | `@db-agent` |
| Implement backend/frontend code from a ready task | `@dev-agent` |
| Tests, edge cases, isolation/RBAC verification, QA sign-off | `@qa-agent` |

### Standard pipeline (per feature)
```
@ba-agent (validate + design)
   → @pm-agent (atomic tasks + acceptance criteria)
      → @db-agent (schema/migration)  ∥  @uiux-agent (screen spec)
         → @dev-agent (implement)
            → @qa-agent (test + isolation/RBAC + sign-off)  →  Definition of Done
```
Rules: @db-agent reviews every DB-touching change; @qa-agent must approve before "done"; @ba-agent is
upstream of @pm-agent for anything touching roles/permissions/architecture.

### Running Phase 8 — RBAC + Platform Console (formerly "Phase 5"; sub-task IDs keep the `5-x` prefix)
Spec `RBAC_Platform_Restructure_Spec.md` · tasks `phase5-rbac-platform-tasks.md`. Order:
**5-A** @db-agent+@dev-agent (RBAC schema + seed + permission middleware) → **5-B** @qa-agent writes
the regression guard FIRST, then @dev-agent enforces per route → **5-C/5-D** @db+@dev (platform plane,
plans, quotas) → **5-E/5-F** @uiux+@dev (shells, guards, role editor, console UI) → **5-G** @qa
(matrix + plane tests + cleanup + docs).

### Prompt templates (copy/paste in Claude Code)

Delegate to one subagent:
```
Use the db-agent subagent.
Task: Phase 5-A T-5A-01 — create permissions/roles/role_permissions tables + users.role_id.
Load: anemal-db-context, anemal-rbac-matrix, .claude/specs/RBAC_Platform_Restructure_Spec.md §9.
Deliver: Prisma migration (+down) and updated schema; report file paths + the isolation test.
```

Run a whole sub-phase (orchestrator picks agents):
```
Execute Phase 5-A from .claude/roadmap/phase5-rbac-platform-tasks.md.
Delegate by the router in CLAUDE.md: @db-agent + @dev-agent for the tasks, then @qa-agent to verify.
Keep all 226 existing tests green; run .claude/roadmap/qa-protocols.md at the end of each task.
```

Review/gate a change:
```
Use the qa-agent subagent to review the current diff for tenant_id isolation, RBAC permission
enforcement (per anemal-rbac-matrix route map), and edge cases. Report pass/fail vs acceptance criteria.
```

Tips: name the subagent explicitly ("Use the X subagent") for reliable invocation; keep each
delegation to one coherent task; have the subagent write to files (not just chat) so the orchestrator
and the next agent can pick up the output.

---

## Tech Stack

### Backend
- **Runtime:** Node.js + Express
- **Database:** PostgreSQL 15+
- **Auth:** JWT (`{ userId, tenantId, branchId, role }`) — token 8h TTL, in-memory only
- **ORM:** Prisma

### Frontend
- **Framework:** React.js (Web + Tablet responsive)
- **Styling:** Tailwind CSS — minimum tap target 44×44px for all interactive elements
- **State:** React Query for server state, Zustand for local state
- **Build tool:** Vite

### Infrastructure
- **Cloud:** AWS or Google Cloud (TBD)
- **Multi-tenancy model:** Shared database, shared schema — `tenant_id` column on every tenant-scoped table

---

## Critical Architecture Rule: Multi-Tenancy

**Every** `SELECT`, `INSERT`, `UPDATE`, `DELETE` against tenant-scoped tables MUST include `WHERE tenant_id = <current_tenant_id>`.  
This is enforced via:
1. A middleware that extracts `tenant_id` from the JWT and attaches it to the request context.
2. All repository/service functions receive `tenantId` as an explicit parameter — never derived inside the function.
3. `@db-agent` reviews any DB-touching PR for isolation compliance.

See `.claude/skills/anemal-db-context/references/database-schema.sql` for the full schema.

---

## Critical Architecture Rule: Authorization (Phase 8 — formerly Phase 5)

Two **planes**, never fused. Spec: `.claude/specs/RBAC_Platform_Restructure_Spec.md`.

- **Clinic plane** (`/clinic/*`, `/clinic-admin/*`): tenant users with `{ userId, tenantId, branchId, roleId }`. Roles = permission sets; system roles `clinic_admin`/`doctor`/`clinic_staff` are seeded; clinic admins clone them into configurable custom roles.
- **Platform plane** (`/platform/*`): `platform_users` (no `tenant_id`) with `{ platformUserId, plane:'platform', role }`. Operates the SaaS (customers, plans, quotas); never reads clinic clinical/PII data.
- **Enforcement (ABSOLUTE):** `requirePlane('clinic'|'platform')` → `requirePermission('<module>.<action>')` on every route. Deny-by-default. UI guards (`<Can>`, `RequirePermission`) are UX only — the server is the security boundary.
- Authoritative permission codes & route map: `anemal-rbac-matrix` skill. SuperAdmin/SaaS domain: `anemal-platform-console` skill.

> Status: 🔲 designed (SPEC-RBAC-PLATFORM-01), not yet implemented — see `.claude/roadmap/phase5-rbac-platform-tasks.md`.

---

## Project Structure

```
stitch_vet_clinic_design_system/   # ⚠️ READ-ONLY — Stitch HTML prototypes
  compassionate_care_system/
    DESIGN.md                      # Design tokens (colors, typography, spacing)
  login_page/code.html
  dashboard_overview_1024x768/code.html
  appointment_scheduling_1024x768/code.html
  pet_owner_management_1024x768/code.html
  emr_1024x768/code.html
  inventory_management_1024x768/code.html
  billing_pos_1024x768/code.html
  admin_control_center_1024x768/code.html

design-alignment-plan.md           # Full UI alignment plan (gap analysis + file list)

.claude/
  agents/          # Agent system prompts (ba, pm, uiux, db, dev, qa) — each <agent>/SKILL.md
  skills/          # Project-level skills (loaded by agents)
    anemal-coding-rules/     # @dev-agent + @qa-agent — full coding standards
    anemal-design-system/    # @uiux-agent + @dev-agent — tokens + sidebar spec
    anemal-screen-specs/     # @uiux-agent + @dev-agent — per-screen layout specs
    anemal-functional-reqs/  # @pm-agent + @ba-agent — FR matrix, NFRs, integrations
    anemal-db-context/       # @db-agent — schema, multi-tenancy rules, migration rules
    anemal-rbac-matrix/      # @ba/@dev/@qa/@db — roles, permissions, route→permission map
    anemal-platform-console/ # @ba/@pm/@dev/@db — SuperAdmin/SaaS domain (customers, plans, quotas)
    anemal-ba-toolkit/       # @ba-agent + @pm-agent — BA method & templates
  specs/
    System_Specification.md  # Stakeholder system spec (read-only reference)
    RBAC_Platform_Restructure_Spec.md  # SPEC-RBAC-PLATFORM-01 — Phase 5 authz + platform + IA
    database-schema.sql      # Full DDL (authoritative source — also in anemal-db-context)
  roadmap/         # Phase task lists & QA protocols

src/
  backend/
    config/        # Environment, DB connection, JWT config
    controllers/   # Route handlers (thin — delegate to services)
    middlewares/   # Auth (JWT verify + tenant extraction), RBAC
    models/        # DB models / repository layer
    services/      # Business logic
    routes/        # Express/FastAPI route definitions
  frontend/
    index.html     # Must include Google Fonts + Material Symbols Outlined links
    tailwind.config.js  # Compassionate Care System tokens — no brand-indigo
    src/
      components/  # Reusable UI: MaterialIcon, TopNav, Sidebar, ProtectedRoute
      views/       # Page-level components (LoginView, ClinicDashboard, etc.)
      hooks/       # Custom React hooks
      utils/       # Shared helpers
      store/       # Zustand stores (authStore, uiStore)
```

---

## Development Commands

> Commands will be finalised once the package manager and framework are confirmed in Phase 1. Placeholders below assume Node.js + npm.

```bash
# Install dependencies
npm install

# Run dev server (backend)
cd src/backend && npm run dev

# Run dev server (frontend)
cd src/frontend && npm run dev

# Run all tests
npm test

# Run a single test file
npm test -- path/to/test.spec.ts

# Lint
npm run lint

# Database migrations
npx prisma migrate dev --name <migration-name>

# Generate Prisma client
npx prisma generate
```

---

## Key Domain Modules

| Module | Description |
|--------|-------------|
| **Auth / RBAC** | JWT login; tenant middleware on all routes. Roles today: `admin`, `doctor`, `staff`, `superadmin`. **Phase 5 (designed):** two-plane model + configurable permission roles — see Authorization rule above |
| **Pet & Owner** | Core patient records; supports photo upload, microchip ID, quick search |
| **Appointments** | Calendar per doctor/room; LINE/SMS reminder integration |
| **EMR** | SOAP notes, treatment timeline, lab/X-ray attachments, stylus anatomy canvas |
| **Inventory** | Drug stock with auto-deduct on prescription, expiry alerts, barcode scan |
| **Billing / POS** | Invoice & tax receipt generation, QR payment (PromptPay), credit card |

---

## Development Phases

> **Re-sequenced 2026-06-13** (full clean resequence). Phases are now a single linear
> 1–11 execution order. **Redesign track (Phase 7 + Phase 8) is the active priority;**
> i18n rollout (credential-free) follows as Phase 9; credential-gated work (Payment Gateway, LINE/SMS) postponed to the end (Phase 10, Phase 11).
> Master worklist + QA validation: `PHASE-RESEQUENCE.md` (root). Sub-task IDs in `.claude/roadmap/remaining-tasks.md` remain authoritative.

| Phase | Focus | Status |
|-------|-------|--------|
| 1 | Foundation — multi-tenancy, auth, RBAC, base layout | ✅ Complete (74 tests) |
| 2 | Core clinic ops — Pet/Owner, Appointments, EMR | ✅ Complete (104 tests) |
| 3 | Commercial — Inventory, POS/Billing | ✅ Complete (131 tests) |
| 4 | Advanced — Hospitalization, Grooming, Blood Bank, Loyalty, Audit | ✅ Complete (155 tests) |
| 5 | Settings & Configuration — profile, hours, notifications, payment, integrations, encryption (was **1.5**) | ✅ Complete (226 tests · 1.5-A/B/C/D all done) |
| 6 | Production-readiness enhancements — screen specs, PDF receipts, PromptPay QR UI, barcode scan, S3 upload (was **Sessions A–E**) | ✅ Complete (226 tests) |
| **7** | **UI Redesign completion & sign-off — Compassionate Care closeout/verification of Appointments, Pets, EMR (design-alignment Phase 2)** | **▶️ PRIORITY — screens already token-aligned; scope = visual verification + sign-off only (no routing/IA changes — those belong to 8-E)** |
| **8** | **RBAC, Platform Console & Structure Restructure — two-plane authz, configurable roles, plan quotas, IA cleanup (was Phase 5)** | **▶️ PRIORITY — 📐 Designed (SPEC-RBAC-PLATFORM-01); sub-task IDs keep the `5-x`/`T-5x` prefix as stable IDs; tasks in `phase5-rbac-platform-tasks.md`** |
| 9 | i18n Rollout — full clinic-screen Thai (EN/TH); extends existing i18n foundation (shipped: module, app-shell, Noto Sans Thai, cross-device sync) to all clinic screens | 📋 Planned |
| 10 | Payment Gateway & Subscription Billing — Omise/Stripe, webhooks, SaaS billing + cron (was **Session F**) | ⏸ Postponed — needs Omise + SMTP credentials |
| 11 | LINE/SMS Real Dispatch — wire reminder worker to LINE + Twilio (was **Session G**) | ⏸ Postponed — needs LINE + Twilio credentials |

**Old → New phase map:** `1→1` · `2→2` · `3→3` · `4→4` · `1.5→5` · `Sessions A–E→6` · `(UI redesign closeout)→7` · `Phase 5 (RBAC/Platform)→8` · `Phase 11 (i18n)→9` · `Session F→10` · `Session G→11`. Stable identifiers unchanged: spec ID `SPEC-RBAC-PLATFORM-01`, file `phase5-rbac-platform-tasks.md`, and sub-task IDs `5-A…5-G` / `T-5x-nn`.

QA protocol (run at end of every task): `.claude/roadmap/qa-protocols.md`

**Active priority (redesign track):** **Phase 7 — UI redesign sign-off** then **Phase 8 — RBAC + Platform Console + restructure (📐 designed, ready to build)**. **Next (credential-free):** Phase 9 i18n Rollout. **Postponed (credential-gated):** Phase 10 Payment Gateway (Omise/Stripe + SaaS billing) · Phase 11 LINE/SMS dispatch. See `.claude/roadmap/remaining-tasks.md`.

---

## Design System — Compassionate Care System

All UI work **must** conform to the **Compassionate Care System** defined in:

- **Design tokens:** `stitch_vet_clinic_design_system/compassionate_care_system/DESIGN.md`
- **Screen prototypes (read-only):** `stitch_vet_clinic_design_system/<screen>/code.html` — 8 screens
- **Full alignment plan:** `design-alignment-plan.md`

### Design Token Quick Reference

| Token | Value | Tailwind class |
|---|---|---|
| Primary | `#000000` | `bg-primary` / `text-primary` |
| Secondary (Sage) | `#006c4a` | `bg-secondary` / `text-secondary` |
| Background | `#f7f9fb` | `bg-background` |
| Surface | `#ffffff` | `bg-surface` |
| Surface container low | `#f2f4f6` | `bg-surface-container-low` |
| On-surface | `#191c1e` | `text-on-surface` |
| On-surface-variant | `#45464d` | `text-on-surface-variant` |
| Outline | `#76777d` | `border-outline` |
| Outline-variant | `#c6c6cd` | `border-outline-variant` |
| Error | `#EF4444` | `text-error` / `bg-error` |
| Success | `#22C55E` | `text-success` |
| Headline font | Plus Jakarta Sans | `font-headline` |
| Body font | DM Sans | `font-sans` |
| Code font | Fira Code | `font-code` |
| Icon system | Material Symbols Outlined | `<span class="material-symbols-outlined">` |

### Sidebar Design Rules

- Background: `bg-surface shadow-sm` (white — not dark)
- Active nav item: `border-r-4 border-primary bg-surface-container-low text-primary font-bold`
- Inactive nav item: `text-on-surface-variant hover:bg-surface-container rounded-lg`
- All icons: Material Symbols Outlined — **no emoji**
- Nav items: `dashboard` · `pets` · `calendar_today` · `medical_services` · `inventory_2` · `payments` · `settings` (admin)

### Top Nav Bar Rules

- Fixed `h-16` bar above all content: `bg-surface border-b border-outline-variant`
- Content offset: `pt-16 pl-56` (or `pl-14` when sidebar collapsed)
- Center: search input with `search` icon prefix
- Right: `notifications` · `help_outline` · user avatar

### Screen Design References

| Screen | Prototype file | React component |
|---|---|---|
| Login | `stitch_vet_clinic_design_system/login_page/code.html` | `src/frontend/src/views/LoginView.tsx` |
| Dashboard | `stitch_vet_clinic_design_system/dashboard_overview_1024x768/code.html` | `views/clinic/ClinicDashboard.tsx` |
| Appointments | `stitch_vet_clinic_design_system/appointment_scheduling_1024x768/code.html` | `views/clinic/ClinicAppointments.tsx` |
| Pet & Owner | `stitch_vet_clinic_design_system/pet_owner_management_1024x768/code.html` | `views/clinic/ClinicPets.tsx` |
| EMR | `stitch_vet_clinic_design_system/emr_1024x768/code.html` | `views/clinic/ClinicEMR.tsx` |
| Inventory | `stitch_vet_clinic_design_system/inventory_management_1024x768/code.html` | `views/clinic/ClinicInventory.tsx` |
| Billing/POS | `stitch_vet_clinic_design_system/billing_pos_1024x768/code.html` | `views/clinic/ClinicBilling.tsx` |
| Admin | `stitch_vet_clinic_design_system/admin_control_center_1024x768/code.html` | `views/admin/AdminView.tsx` |

> **Rule:** Before implementing any screen, open the corresponding `code.html` and copy its exact Tailwind classes. Never modify files inside `stitch_vet_clinic_design_system/`.

---

## Tablet UI Rules (enforced by @uiux-agent)

- All interactive elements ≥ 44×44px (`min-h-[44px] min-w-[44px]`)
- Prefer dropdowns, toggles, and pickers over free-text keyboard input
- Sidebar must be collapsible; support left/right-hand mode (keep existing `uiStore` toggle)
- Test every screen on 768px-width (iPad portrait) and 1024px (landscape)
- **No raw hex colors in component files** — use only token names from `tailwind.config.js`
- **No emoji in navigation** — use Material Symbols Outlined exclusively


## Agent Skills

All agents must load the relevant project skill before starting work:

| Skill | Agent | When to use |
|---|---|---|
| `anemal-coding-rules` | @dev-agent, @qa-agent | Any implementation, PR review, CI/CD, or security task |
| `anemal-design-system` | @uiux-agent, @dev-agent | Any frontend/UI/component work |
| `anemal-screen-specs` | @uiux-agent, @dev-agent | Any screen implementation or review |
| `anemal-functional-reqs` | @pm-agent, @ba-agent | Scope validation, user stories, priority disputes |
| `anemal-db-context` | @db-agent | Schema design, migrations, query review, isolation checks |
| `anemal-rbac-matrix` | @ba-agent, @dev-agent, @qa-agent, @db-agent | Any authorization work — roles, permissions, route guards, view/edit decisions |
| `anemal-platform-console` | @ba-agent, @pm-agent, @dev-agent, @db-agent | Platform/SuperAdmin domain — customers, plans, quotas, provisioning |
| `anemal-ba-toolkit` | @ba-agent, @pm-agent | BA method & templates — specs, user stories, gap analysis, acceptance criteria |

Skills live in `.claude/skills/<skill-name>/`. Each has a `SKILL.md` (instructions) and a `references/` directory (full content).

---

## Tracking
- Update the task everytime the work is completed, if the work are interupted and cannot complete, please save to the file that claude can be read to resume, and after finish the task, this file should be cleared.
- Tracking all changes in HistoryLog.
- Every development, plan, test, rule, or design change must update: related markdown files (keep additions short and effective), CLAUDE.md itself, and the HistoryLog + session log.
- **REQUIRED — Update the following HTML pages as the LAST step of every plan/task completion** (not optional, not deferred):
  - **`docs/index.html`**
    - Phase status table and test counts — when a phase starts, completes, or test count changes
    - Build status and next-steps guide — when phase state changes
    - 🚀 How to Run Locally / Prerequisites / Quick Setup — when dependencies, env vars, or setup steps change
    - **🚀 Upcoming Work** — mark items ✅ done / update next pointer whenever ANY sub-session, phase, or task completes. This MUST be the last edit before committing.
    - 📜 Roadmap History — when a phase or session concludes (append entry)
  - **`docs/functional_spec_detailed.html`** — when functional requirements change, new API endpoints are added, or architecture decisions are made
- **In GSD plans:** every PLAN.md must include a final task: `Update docs/index.html Upcoming Work section to reflect new phase state`.
