# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

**Anemal** — a multi-tenant clinic management application for veterinary practices, targeting Tablet (touch-first) and Web (counter/reception) use cases. Sold as a subscription SaaS product.

---

## Agent System

This project uses a 5-agent collaboration model. Always identify which agent role is relevant before starting work. Tag requests with `@agent-name` when delegating sub-tasks.

| Agent | File | Responsibility |
|-------|------|----------------|
| `@pm-agent` | `.claude/agents/pm-agent.md` | Scope control, requirement validation, task breakdown |
| `@uiux-agent` | `.claude/agents/uiux-agent.md` | Touch-first UI design, tablet layout, component specs |
| `@db-agent` | `.claude/agents/db-agent.md` | Schema design, multi-tenancy enforcement, query safety |
| `@dev-agent` | `.claude/agents/dev-agent.md` | Full-stack implementation, clean/modular code |
| `@qa-agent` | `.claude/agents/qa-agent.md` | Test cases, edge cases, data isolation verification |

---

## Tech Stack

### Backend
- **Runtime:** Node.js (Express) or Python (FastAPI) — TBD per Phase 1 decision
- **Database:** PostgreSQL
- **Auth:** JWT — `tenant_id` must be embedded in every token
- **ORM:** Prisma (Node) or SQLAlchemy (Python)

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

See `.claude/specs/database-schema.sql` for the full schema.

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
  agents/          # Agent system prompts (pm, uiux, db, dev, qa)
  specs/
    design-system-tokens.md        # Developer token cheat-sheet (to be created)
    screen-specs/                  # Per-screen component specs (to be created)
    database-schema.sql
    functional-reqs.md
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
| **Auth / RBAC** | JWT login; roles: `admin`, `doctor`, `staff`; all routes protected by tenant middleware |
| **Pet & Owner** | Core patient records; supports photo upload, microchip ID, quick search |
| **Appointments** | Calendar per doctor/room; LINE/SMS reminder integration |
| **EMR** | SOAP notes, treatment timeline, lab/X-ray attachments, stylus anatomy canvas |
| **Inventory** | Drug stock with auto-deduct on prescription, expiry alerts, barcode scan |
| **Billing / POS** | Invoice & tax receipt generation, QR payment (PromptPay), credit card |

---

## Development Phases

| Phase | Focus | Ref |
|-------|-------|-----|
| 1 | Foundation — multi-tenancy, auth, RBAC, base layout + **UI shell (Login, Dashboard, Sidebar redesign)** | `.claude/roadmap/phase1-tasks.md` |
| 2 | Core clinic ops — Pet/Owner, Appointments, EMR | `.claude/roadmap/phase2-tasks.md` |
| 3 | Commercial — Inventory, POS/Billing | `.claude/roadmap/phase3-tasks.md` |
| 4 | Advanced — Hospitalization, Grooming, Blood Bank, Loyalty | `.claude/roadmap/phase4-tasks.md` |

QA protocol (run at end of every task): `.claude/roadmap/qa-protocols.md`

**UI implementation order** (from `design-alignment-plan.md`):
- Phase 1 UI: Login → Base Layout (Sidebar + TopNav) → Dashboard → Admin reskin
- Phase 2 UI: Appointments → Pet & Owner → EMR
- Phase 3 UI: Inventory → Billing/POS

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


## Developer Coding Rules

All implementation work must comply with `.claude/specs/CODING_RULES.md`, which defines:
- Directory structure & naming conventions
- Layered architecture pattern (Route → Controller → Service → Repository)
- TypeScript strict-mode rules
- Security (JWT, multi-tenant isolation, injection prevention, secrets)
- Input validation (Zod schemas, shared `src/shared/schemas/`)
- Error handling (typed `AppError`, structured logging, HTTP status codes)
- Database rules (tenant scoping, migrations, indexes)
- Testing requirements (unit, integration, security isolation)
- Frontend component rules (Tailwind tokens, touch targets, React Query)
- Design patterns (Repository, Strategy, Observer, Optimistic Lock, Idempotency Key)
- **GitHub workflow** (branch naming, Conventional Commits, PR rules, code review checklist)
- **CI/CD & environment** (env var management, secrets rotation, deploy checklist)

---

## Tracking
- Update the task everytime the work is completed, if the work are interupted and cannot complete, please save to the file that claude can be read to resume, and after finish the task, this file should be cleared.
- Tracking all changes in HistoryLog.
- Every development, plan , test , rule, design. All of changes should be update back to the related markdown files only what is needed to add (try keep it short and effective), all HTML pages that present status, and also CLAUDE.md itself, don't forget the historylog and sessionlog to track.
- Providing the guide the step that should be do next in the HTML file to give instruction to user to continue the development work.
