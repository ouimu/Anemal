# 🐾 Anemal SaaS — Vet Clinic Management Platform

> Multi-tenant SaaS application for veterinary clinics — optimized for Tablet & Web

---

## Project Overview

**Anemal SaaS** is a commercial Software-as-a-Service platform designed for veterinary clinics of all sizes.  
It runs seamlessly on **Web browsers** (front-desk / counter use) and **Tablets** (on-the-floor consultation use).

### Key Capabilities
| Module | Description |
|---|---|
| Pet & Owner Management | Full profiles, photo upload, microchip search, drug allergy & condition flags |
| Appointment Scheduler | Calendar per doctor/room, SMS/LINE notifications, conflict validation |
| EMR (Electronic Medical Record) | SOAP notes, historical timelines, stylus drawing on anatomy canvas |
| Inpatient Management | Daily hospitalization tracking with custom time-slot observations |
| Grooming Services | Groomer bookings, capacity limits, and dedicated service queue routing |
| Blood Bank Registry | Donor eligibility logs, bag collection, status tracking, and transfusions |
| Inventory & Transfers | Multi-branch stocks, stock cards, lot/expiry alerts, inventory camera barcode scanning, branch transfers |
| Billing & Retail POS | Invoices, receipts, tax invoices, PromptPay QR, credit cards, retail item cashiering |
| Loyalty & Discounts | Membership tiers, points accumulation, and customizable discounting engines |
| Multi-Tenancy & Branches | Complete tenant data isolation via `tenant_id` and multi-branch support via `branch_id` |
| Security Operations | Login time-window restrictions, and complete admin activity audit logs |

---

## Folder Structure

```
Anemal/
├── .claude/                  # AI Agent context & project specs
│   ├── agents/               # System prompts (<name>.md) + skill bodies (<name>/SKILL.md)
│   ├── skills/                # Project domain skills (anemal-coding-rules, anemal-design-system, etc.)
│   ├── specs/                 # Functional requirements, DB schema, implementation-status-matrix.md
│   │   ├── System_Specification.md # System specification (functional reqs live in the anemal-functional-reqs skill)
│   │   ├── database-schema.sql # PostgreSQL schema & RLS policies
│   │   └── implementation-status-matrix.md # Canonical module-level status source
│   └── roadmap/               # Phase task lists & QA protocols
│       └── qa-protocols.md    # Quality assurance & verification protocols
├── src/
│   ├── backend/               # Node.js / Express API
│   │   ├── config/            # DB, env, constants
│   │   ├── controllers/       # Business logic per module
│   │   ├── middlewares/       # Auth, tenant guard, RBAC, branch validation
│   │   ├── models/            # ORM / query builders (repositories)
│   │   ├── routes/            # API route definitions
│   │   └── services/          # Business logic layer
│   └── frontend/               # React.js / Responsive Web App
│       └── src/
│           ├── components/    # Reusable UI (buttons, forms, cards)
│           ├── views/         # Page-level screens
│           ├── store/         # State management (Zustand)
│           ├── guards/        # Route guards (RequirePlane, RequirePermission, RequireAuth)
│           ├── hooks/         # TanStack Query hooks
│           ├── i18n/          # Thai/English translations
│           ├── layouts/       # ClinicLayout, AdminLayout
│           └── utils/         # Helpers, API client, formatters
├── README.md                  # Primary project overview
└── HistoryLog.md              # Synchronized root tracking history log
```

---

## Tech Stack (Current)

| Layer | Technology |
|---|---|
| Frontend | React 18.3 + TypeScript + Tailwind CSS 3.4 |
| State Management | Zustand 4.5 |
| Build tool | Vite 5.2 |
| Backend | Node.js + Express 4.19 |
| Database | PostgreSQL 15+ + Prisma 5.13 |
| Auth | JWT (`tenant_id`/`branch_id` embedded) — username-based clinic login, email-based platform login |
| File Storage | AWS S3 (credential-gated — see `.claude/specs/implementation-status-matrix.md`) |

**Planned / Deferred** (see `.claude/specs/implementation-status-matrix.md` for exact status):
- Payment gateway — Omise (Thailand) / Stripe webhooks (Phase 10, needs credentials)
- Real LINE/SMS dispatch — LINE Messaging API + Twilio SMS (Phase 11, needs credentials)
- Redis (temporary queue state) — not yet integrated
- Cornerstone.js DICOM viewer — not yet integrated
- Recharts — integrated in Admin Dashboard and Clinic Transactions charts
- Radix UI — not yet integrated into the current component set

---

## AI Sub-Agent Team

| Agent | Role | Files |
|---|---|---|
| PM-Agent | Product scope, requirements, task breakdown | `.claude/agents/pm-agent.md` + `.claude/agents/pm-agent/SKILL.md` |
| BA-Agent | Requirements validation, authorization design, gap analysis | `.claude/agents/ba-agent.md` + `.claude/agents/ba-agent/SKILL.md` |
| UIUX-Agent | UI design, Tablet UX, touch targets | `.claude/agents/uiux-agent.md` + `.claude/agents/uiux-agent/SKILL.md` |
| DB-Agent | Schema design, multi-tenancy, query safety | `.claude/agents/db-agent.md` + `.claude/agents/db-agent/SKILL.md` |
| Dev-Agent | Full-stack implementation, clean code | `.claude/agents/dev-agent.md` + `.claude/agents/dev-agent/SKILL.md` |
| Ponytail-Agent | Simplicity gate — reviews plans before execution | `.claude/agents/ponytail-agent.md` + `.claude/agents/ponytail-agent/SKILL.md` |
| QA-Agent | Test cases, edge cases, security checks | `.claude/agents/qa-agent.md` + `.claude/agents/qa-agent/SKILL.md` |

---

## How to Use Agents in Claude

Prefix your request with the agent name:

```
@pm-agent      — define scope, break down tasks
@ba-agent      — validate requirements, authorization design, gap analysis
@uiux-agent    — design screens, components, UX flows
@db-agent      — write/review SQL, design schema
@dev-agent     — write/review code
@ponytail-agent — simplicity gate before execution
@qa-agent      — generate test cases, security checks
```

---

## Iron Rules (Non-Negotiable)

1. **Every DB query MUST include `WHERE tenant_id = :currentTenantId`** — no exceptions
2. **Every branch-scoped query MUST include `WHERE branch_id = :currentBranchId`** — where applicable
3. **All API endpoints MUST pass through `tenantGuard` middleware**
4. **Tablet touch targets MUST be minimum 44×44px**
5. **No direct DB access from Frontend** — always through API layer
6. **Passwords stored as bcrypt hash only** — never plaintext
7. **Every structural change must be recorded in the `HistoryLog.md`**

---

## Development Phases

Full phase changelog (test counts, PR/ADR mapping) and current status: [`.claude/roadmap/phase-history.md`](.claude/roadmap/phase-history.md). Kept out of this README so it doesn't drift — see that file for the authoritative record.

---

*Last updated: 2026-07-24 — 1178 backend + 315 frontend tests passing (through Google Drive storage driver, ADR-0023). Next: OneDrive sub-project (blocked on product decisions) and Phase 10/11 (credential-gated).*
