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
| Inventory & Transfers | Multi-branch stocks, stock cards, lot/expiry alerts, barcode scanning, branch transfers |
| Billing & Retail POS | Invoices, receipts, tax invoices, PromptPay QR, credit cards, retail item cashiering |
| Loyalty & Discounts | Membership tiers, points accumulation, and customizable discounting engines |
| Multi-Tenancy & Branches | Complete tenant data isolation via `tenant_id` and multi-branch support via `branch_id` |
| Security Operations | Login time-window restrictions, and complete admin activity audit logs |

---

## Folder Structure

```
AnimalClinic/
├── claude/                   # AI Agent context & project specs (rename to .claude/ in production)
│   ├── agents/               # System prompts for each Sub-Agent
│   ├── specs/                # Functional requirements & DB schema
│   │   ├── functional-reqs.md  # System functional requirements
│   │   └── database-schema.sql # PostgreSQL schema & RLS policies
│   ├── roadmap/              # Phase task lists & QA protocols
│   │   ├── phase1-tasks.md   # Foundation & Security
│   │   ├── phase2-tasks.md   # Core Operations
│   │   ├── phase3-tasks.md   # Commercial & Billing
│   │   ├── phase4-tasks.md   # Advanced Operations & Scaling
│   │   └── qa-protocols.md   # Quality assurance & verification protocols
│   └── HistoryLog.md         # Synchronization tracking history for agents
├── src/
│   ├── backend/              # Node.js / Express API
│   │   ├── config/           # DB, env, constants
│   │   ├── controllers/      # Business logic per module
│   │   ├── middlewares/      # Auth, tenant guard, RBAC, branch validation
│   │   ├── models/           # ORM / query builders
│   │   └── routes/           # API route definitions
│   └── frontend/             # React.js / Responsive Web App
│       └── src/
│           ├── components/   # Reusable UI (buttons, forms, cards)
│           ├── views/        # Page-level screens
│           ├── stores/       # State management (Zustand)
│           └── utils/        # Helpers, API client, formatters
├── README.md                 # Primary project overview
└── HistoryLog.md             # Synchronized root tracking history log
```

---

## Tech Stack (Recommended)

| Layer | Technology |
|---|---|
| Frontend | React.js 19 + TypeScript 5 + Tailwind CSS 4 |
| State Management | Zustand |
| Charts & UI Components | Recharts, Radix UI |
| Backend | Node.js + Express.js or NestJS |
| Database | PostgreSQL 15+ (Primary transactional) + Redis (Temporary queue state) |
| ORM | Prisma |
| Auth | JWT (with `tenant_id` and `branch_id` embedded) |
| File Storage | AWS S3 / Cloudflare R2 |
| DICOM Viewer | Cornerstone.js |
| Payments | Omise (Thailand) / Stripe |
| Notifications | LINE Messaging API + Twilio SMS |

---

## AI Sub-Agent Team

| Agent | Role | File |
|---|---|---|
| PM-Agent | Product scope, requirements, task breakdown | `claude/agents/pm-agent.md` |
| UIUX-Agent | UI design, Tablet UX, touch targets | `claude/agents/uiux-agent.md` |
| DB-Agent | Schema design, multi-tenancy, query safety | `claude/agents/db-agent.md` |
| Dev-Agent | Full-stack implementation, clean code | `claude/agents/dev-agent.md` |
| QA-Agent | Test cases, edge cases, security checks | `claude/agents/qa-agent.md` |

---

## How to Use Agents in Claude

Prefix your request with the agent name:

```
@pm-agent    — define scope, break down tasks
@uiux-agent  — design screens, components, UX flows
@db-agent    — write/review SQL, design schema
@dev-agent   — write/review code
@qa-agent    — generate test cases, security checks
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

| Phase | Focus | Duration |
|---|---|---|
| Phase 1 | Foundation & Security (Auth, Multi-tenancy, Multi-Branch, Base Layout) | Week 1–4 |
| Phase 2 | Core Operations (Pet, Appointment, EMR, Prescriptions) | Week 5–12 |
| Phase 3 | Commercial Operations (Inventory, Billing, POS, Subscription) | Week 13–16 |
| Phase 4 | Advanced Operations & Commercial Scaling (Inpatient, Grooming, Blood Bank, Loyalty, Security restrictions, Activity Logs) | Week 17-20 |

---

*Last updated: 2026-05-30*
