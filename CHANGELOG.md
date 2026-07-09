# CHANGELOG

> **FROZEN (2026-07-09):** this file stopped being maintained after 2026-06-05 (Phase 3).
> It is kept as a historical record only. For change history since then, use
> `HistoryLog.md`, `docs/adr/`, and `git log`.

All changes to this project are recorded here in reverse-chronological order.
Format: `[YYYY-MM-DD] Agent — Description`

---

## [2026-06-05] — Phase 3: Commercial (Inventory, Billing/POS, Reports, Subscription)

### NEW FILES
| File | Agent | Description |
|------|-------|-------------|
| `src/backend/{models,services,controllers,routes}/product.*` | @dev-agent | Inventory API: `/api/products` CRUD + `stock-in` + `alerts` + `:id/movements` |
| `src/backend/{models,services,controllers,routes}/invoice.*` | @dev-agent | Billing API: `/api/invoices` create (auto-pull from visit + retail stock deduction), `INV-YYYY-MM-NNNN`, payment |
| `src/backend/{models,services,controllers,routes}/report.*` | @dev-agent | Reports API: revenue (daily/monthly), top-services, inventory-usage, snapshot |
| `src/backend/{models,services,controllers,routes}/subscription.*` | @dev-agent | `/api/subscription/status` + plan limits |
| `prisma/migrations/20260605142920_phase3_commercial/` | @db-agent | StockMovement + Invoice columns + petId optional + refunded status |
| `src/frontend/src/hooks/{useInventory,useInvoices,useReports,useSubscription}.ts` | @dev-agent | React Query hooks |
| `.claude/specs/screen-specs/06-inventory.md`, `07-billing-pos.md` | @uiux-agent | Screen specs |
| `src/backend/__tests__/{inventory,invoice,reports,subscription}.test.ts` | @qa-agent | 27 tests (isolation + edge cases) |

### MODIFIED FILES
| File | Agent | Change |
|------|-------|--------|
| `prisma/schema.prisma` | @db-agent | `StockMovement` model; `Invoice` numbering/totals/discount/tax fields; `petId?`; `PaymentStatus += refunded` |
| `src/backend/models/prescription.repository.ts` | @dev-agent | Logs `StockMovement` on dispense/restock; raw SQL → camelCase columns |
| `src/backend/models/appointment.repository.ts` | @dev-agent | Double-booking raw SQL → camelCase columns (was non-functional) |
| `src/backend/services/user.service.ts` + `utils/errors.ts` | @dev-agent | 402 plan user-limit enforcement |
| `src/backend/prisma/seed.ts` | @db-agent | 6 sample products |
| `src/frontend/src/views/clinic/ClinicInventory.tsx`, `ClinicBilling.tsx` | @dev-agent + @uiux-agent | Stubs → full inventory + POS UIs |
| `src/frontend/src/views/clinic/ClinicDashboard.tsx` | @dev-agent | recharts revenue chart + inventory alerts + revenue KPIs |
| `src/frontend/src/views/admin/SubscriptionTab.tsx` | @dev-agent | Plan usage vs limit |
| `src/frontend/{package.json,vite.config.ts,tsconfig.json}` | @dev-agent | recharts; `/api` proxy; `skipLibCheck` |
| `.claude/roadmap/phase3-tasks.md`, `design-alignment-plan.md`, `.claude/agents/uiux-agent.md`, `docs/*.html` | @pm-agent | Phase 3 status |

### SCOPE
Lightweight integrations (browser-print receipt, placeholder PromptPay QR, manual confirm); flat tenant-scoped inventory. **Deferred to Phase 4:** branch inventory/transfers, PDF + email receipts, real PromptPay/Omise/Stripe gateway, camera barcode, subscription billing tables.

### VERIFICATION
131 backend tests pass; FE+BE `tsc` clean; `vite build` clean; migration applied.

---

## [2026-06-03] — DESIGN.md MCP Integration + Project Dashboard

### NEW FILES

| File | Agent | Description |
|------|-------|-------------|
| `DESIGN.md` | @uiux-agent | Anemal design system: brand colors, typography scale, spacing, component tokens, layout rules, MCP usage guide |
| `docs/dashboard.html` | @dev-agent | Interactive project dashboard — phase progress, feature matrix, agent contributions, MCP status, next steps checklist |

### MODIFIED FILES

| File | Agent | Change |
|------|-------|--------|
| `.mcp.json` | @dev-agent | Added `design` server (`npx @_davideast/stitch-mcp`) for DESIGN.md extraction and component validation |
| `docs/index.html` | @dev-agent | Added DESIGN.md MCP section + dashboard link in sidebar; updated MCP per-agent table |
| `CHANGELOG.md` | @pm-agent | This entry |

### DESIGN.md MCP WORKFLOW
```
Stitch (screen layouts) ──┐
                           ├── @uiux-agent uses design MCP ──→ DESIGN.md (tokens)
GOOGLE_API_KEY ────────────┘                                        │
                                                                     ▼
                                                        @dev-agent reads DESIGN.md
                                                        when generating components
                                                                     │
                                                                     ▼
                                                        @uiux-agent validates output
                                                        against DESIGN.md rules
```

---

## [2026-06-03] — Full App Restructure: Admin/Clinic Sections, Login Redesign, Mockups & Docs

### NEW FILES

#### Backend
| File | Agent | Description |
|------|-------|-------------|
| `src/backend/src/services/usageService.ts` | @db-agent | Clinic usage stats: pets, owners, users, appointments, invoices per tenant |

#### Frontend — Layouts
| File | Agent | Description |
|------|-------|-------------|
| `src/frontend/src/layouts/AdminLayout.tsx` | @uiux-agent + @dev-agent | Dark slate sidebar for admin section; redirects non-admins to /clinic/dashboard |
| `src/frontend/src/layouts/ClinicLayout.tsx` | @uiux-agent + @dev-agent | Collapsible brand-700 sidebar for clinic section; redirects admins to /admin/dashboard |

#### Frontend — Admin Pages
| File | Agent | Description |
|------|-------|-------------|
| `src/frontend/src/views/admin/AdminDashboard.tsx` | @dev-agent | 6 KPI cards + quick actions + plan card |
| `src/frontend/src/views/admin/AdminUsers.tsx` | @uiux-agent + @dev-agent | Full user list with filters, role badges, add/edit modal with role picker, activate/deactivate |
| `src/frontend/src/views/admin/AdminUsage.tsx` | @dev-agent | KPI row, plan quota bars (red >90%), clinic summary table |
| `src/frontend/src/views/admin/AdminProfile.tsx` | @dev-agent | Re-export of ClinicProfileTab |
| `src/frontend/src/views/admin/AdminSettings.tsx` | @dev-agent | Re-export of ClinicSettingsTab |
| `src/frontend/src/views/admin/AdminSubscription.tsx` | @dev-agent | Re-export of SubscriptionTab |
| `src/frontend/src/hooks/useAdmin.ts` | @dev-agent | useAdminSettings (React Query) + useUpdateSettings mutation |

#### Frontend — Clinic Pages
| File | Agent | Description |
|------|-------|-------------|
| `src/frontend/src/views/clinic/ClinicDashboard.tsx` | @uiux-agent + @dev-agent | Greeting, 4 KPIs, quick action tiles, today's schedule placeholder |
| `src/frontend/src/views/clinic/ClinicAppointments.tsx` | @dev-agent | Phase 2 stub — 🚧 placeholder |
| `src/frontend/src/views/clinic/ClinicPets.tsx` | @dev-agent | Phase 2 stub |
| `src/frontend/src/views/clinic/ClinicEMR.tsx` | @dev-agent | Phase 2 stub |
| `src/frontend/src/views/clinic/ClinicInventory.tsx` | @dev-agent | Phase 3 stub |
| `src/frontend/src/views/clinic/ClinicBilling.tsx` | @dev-agent | Phase 3 stub |

#### Documentation
| File | Agent | Description |
|------|-------|-------------|
| `.claude/specs/functional-reqs.md` | @pm-agent | Full rewrite: all 13 pages with ASCII mockups, behaviour tables, file references |
| `.claude/roadmap/phase1-tasks.md` | @pm-agent | Rewritten: 8 tasks across 4 modules (DB, Admin Backend, Clinic Frontend, Login) |
| `.claude/roadmap/phase1-implementation-plan.md` | @pm-agent | Full rewrite: 4-week schedule, file map, Definition of Done (10 criteria), risks |
| `.claude/roadmap/phase1-claude-code-guide.md` | @pm-agent | Full rewrite: 9 steps, one prompt per task, updated routes and files |

### MODIFIED FILES

| File | Agent | Change |
|------|-------|--------|
| `src/backend/src/routes/adminRoutes.ts` | @dev-agent | Added GET /admin/usage route |
| `src/backend/src/app.ts` | @dev-agent | Registered /admin route |
| `src/frontend/src/App.tsx` | @dev-agent | Full rewrite: /admin/* + /clinic/* routing, lazy loading, role-based redirects |
| `src/frontend/src/hooks/useAuth.ts` | @dev-agent | Role-based redirect on login: admin→/admin/dashboard, others→/clinic/dashboard |
| `src/frontend/src/views/LoginView.tsx` | @uiux-agent + @dev-agent | Full redesign: gradient bg, white card, subdomain auto-detect, show/hide password, role hint |
| `docs/index.html` | @dev-agent | Added 5 new UI page sections (Login, Admin Dashboard, Users, Usage, Clinic Dashboard); updated Phase 1 plan; added UI Pages nav group |
| `CHANGELOG.md` | @pm-agent | This entry |

### ARCHITECTURE CHANGE: Dual Section Routing

```
Before:  / → AppShell → all users same layout
After:   /admin/* → AdminLayout (role=admin only)
         /clinic/* → ClinicLayout (role=doctor|staff only)
         Login redirects by role automatically
```

---

## [2026-06-03] — Admin Page, MCP Config & Documentation Updates

### NEW FILES

#### Backend
| File | Agent | Description |
|------|-------|-------------|
| `src/backend/src/services/tenantSettingsService.ts` | @db-agent + @dev-agent | getSettings (upsert), updateSettings, updateClinicName |
| `src/backend/src/controllers/tenantSettingsController.ts` | @dev-agent | Zod-validated GET/PUT handlers for admin settings |
| `src/backend/src/routes/adminRoutes.ts` | @dev-agent | `GET/PUT /admin/settings` — authMiddleware + rbacMiddleware(['admin']) |

#### Frontend — Admin Views
| File | Agent | Description |
|------|-------|-------------|
| `src/frontend/src/hooks/useAdmin.ts` | @dev-agent | useAdminSettings (React Query) + useUpdateSettings (mutation) |
| `src/frontend/src/views/admin/AdminView.tsx` | @dev-agent | 4-tab container, redirects non-admins to /dashboard |
| `src/frontend/src/views/admin/ClinicProfileTab.tsx` | @uiux-agent + @dev-agent | Logo upload, clinic name/phone/email/website/taxId/address |
| `src/frontend/src/views/admin/UserManagementTab.tsx` | @uiux-agent + @dev-agent | Active/inactive user lists, add/edit modal, role badges |
| `src/frontend/src/views/admin/ClinicSettingsTab.tsx` | @uiux-agent + @dev-agent | Slot duration, work hours, SMS/LINE reminder toggles |
| `src/frontend/src/views/admin/SubscriptionTab.tsx` | @dev-agent | Plan cards (Starter/Professional/Enterprise), tenant info, multi-tenant callout |

#### Config & Docs
| File | Agent | Description |
|------|-------|-------------|
| `.claude/settings.json` | @dev-agent | Claude Code project config: allowedTools, bash commands, contextPaths |
| `.mcp.json` | @dev-agent | MCP server config: filesystem, postgres, github, stitch (Google) |
| `docs/index.html` | @dev-agent | HTML doc portal — 18 pages, sidebar nav, live search, dark mode |
| `HOW-TO-RUN.md` | @dev-agent | Windows local run guide with troubleshooting table |
| `CHANGELOG.md` | @pm-agent | This file — full history of all changes |

### MODIFIED FILES

| File | Agent | Change |
|------|-------|--------|
| `src/backend/prisma/schema.prisma` | @db-agent | Added `TenantSettings` model (1-to-1 with Tenant); added `settings` relation on Tenant |
| `src/backend/src/app.ts` | @dev-agent | Registered `/admin` route via `adminRoutes` |
| `src/frontend/src/App.tsx` | @dev-agent | Added `/admin` route with lazy-loaded `AdminView` |
| `src/frontend/src/components/Sidebar.tsx` | @uiux-agent + @dev-agent | Added ⚙️ Admin nav item (admin-only, hidden from doctor/staff) |
| `.env` | @dev-agent | Added `GOOGLE_API_KEY` placeholder for Stitch MCP |
| `.env.example` | @dev-agent | Synced with `GOOGLE_API_KEY` and `GITHUB_TOKEN` |
| `docs/index.html` | @dev-agent | Added Admin Page section, MCP Servers section, updated home card grid |

### SECURITY NOTE
A Google API key was accidentally pasted into chat. Key should be considered compromised — revoke at console.cloud.google.com and regenerate before use.

---

## [2026-06-01] — Phase 1 Foundation Setup (Full Session)

---

### FIXES & VALIDATION

#### `src/backend/jest.config.js`
- **@qa-agent** — Removed invalid `setupFilesAfterFramework` key (not a Jest option)
- **@qa-agent** — Added `setupFiles: ['dotenv/config']` so environment variables load before every test run
- **@qa-agent** — Added `moduleFileExtensions` for clean ts-jest resolution

#### `src/backend/tsconfig.json`
- **@dev-agent** — Added `tests/**/*` to `include` so ts-jest can compile test files
- **@dev-agent** — Removed `tests` from `exclude` list (was blocking test compilation)

#### `src/backend/src/config/env.ts`
- **@db-agent** — Fixed `dotenv.config()` to resolve `.env` from project root via absolute path (`path.resolve(__dirname, '../../../../.env')`)
- Previously relied on CWD which broke when running from `src/backend/`

#### `src/backend/prisma/seed.ts`
- **@db-agent** — Added `dotenv` import with explicit path resolve to project root `.env`
- Seed script now loads `DATABASE_URL` reliably regardless of working directory

#### `src/backend/config/env.ts` (legacy stub)
- **@dev-agent** — Converted from dead stub to re-export: `export { config } from '../src/config/env'`

#### `src/backend/config/db.ts` (legacy stub)
- **@dev-agent** — Converted to re-export: `export { default } from '../src/config/db'`

#### `src/backend/config/jwt.ts` (legacy stub)
- **@dev-agent** — Converted to re-export: `export { signToken, verifyToken } from '../src/config/jwt'`

#### `src/backend/middlewares/authMiddleware.ts` (legacy stub)
- **@dev-agent** — Converted to re-export: `export { authMiddleware } from '../src/middlewares/authMiddleware'`

#### `src/backend/middlewares/rbacMiddleware.ts` (legacy stub)
- **@dev-agent** — Converted to re-export: `export { rbacMiddleware } from '../src/middlewares/rbacMiddleware'`

---

### NEW FILES CREATED

#### Project Root
| File | Agent | Description |
|------|-------|-------------|
| `CLAUDE.md` | @pm-agent | Project architecture, agent roles, tech stack, multi-tenancy rules, dev commands |
| `README.md` | @pm-agent | Quick-start guide with setup commands |
| `.env.example` | @dev-agent | Environment variable template |
| `.env` | @dev-agent | Local dev environment (not committed) |
| `.gitignore` | @dev-agent | Ignores node_modules, .env, dist, build |
| `HOW-TO-RUN.md` | @dev-agent | Step-by-step Windows local run guide with troubleshooting table |

#### `.claude/agents/`
| File | Agent | Description |
|------|-------|-------------|
| `pm-agent.md` | @pm-agent | PM role definition — scope control, task breakdown, acceptance criteria format |
| `uiux-agent.md` | @uiux-agent | UI/UX role — touch-first specs, Tailwind suggestions, screen ownership |
| `db-agent.md` | @db-agent | DB role — schema ownership, multi-tenancy iron rule, migration process |
| `dev-agent.md` | @dev-agent | Dev role — layered architecture rules, TypeScript strict mode, no `any` types |
| `qa-agent.md` | @qa-agent | QA role — test categories, data isolation checks, output format |

#### `.claude/specs/`
| File | Agent | Description |
|------|-------|-------------|
| `functional-reqs.md` | @pm-agent | All 5 modules (Auth, Pet/Owner, Appointments, EMR, Inventory, Billing) with acceptance criteria |
| `database-schema.sql` | @db-agent | Full PostgreSQL DDL for all 10 tables with indexes and multi-tenancy enforcement |

#### `.claude/roadmap/`
| File | Agent | Description |
|------|-------|-------------|
| `phase1-tasks.md` | @pm-agent | 6 tasks: schema, JWT login, middlewares, user API, shell layout, login page |
| `phase2-tasks.md` | @pm-agent | 10 tasks: Pet/Owner CRUD, Quick Search, Appointments, EMR, Anatomy Canvas |
| `phase3-tasks.md` | @pm-agent | 9 tasks: Inventory, Barcode Scan, Billing/POS, QR Payment, PDF receipts, Dashboard |
| `qa-protocols.md` | @qa-agent | 7-section QA checklist: isolation, RBAC, input validation, concurrency, tablet UI, performance, security |
| `phase1-implementation-plan.md` | @pm-agent | Week-by-week schedule, agent ownership table, dependency graph, Definition of Done |
| `phase1-claude-code-guide.md` | @pm-agent | Step-by-step Claude Code prompts for each Phase 1 task (Steps 0–8) |

#### `src/backend/` — Backend Implementation (Node.js + Express + Prisma + TypeScript)
| File | Agent | Description |
|------|-------|-------------|
| `package.json` | @dev-agent | All deps: express, prisma, bcrypt, jsonwebtoken, zod, jest, supertest, ts-jest |
| `tsconfig.json` | @dev-agent | TypeScript strict mode, commonjs, includes src/ prisma/ tests/ |
| `jest.config.js` | @dev-agent + @qa-agent | ts-jest config, dotenv setup, test file pattern |
| `prisma/schema.prisma` | @db-agent | Full Prisma schema — 10 models, all with tenantId, enums, indexes |
| `prisma/seed.ts` | @db-agent | Seeds dev-clinic + test-clinic tenants, 3 roles each (6 users total) |
| `src/types/index.ts` | @dev-agent | JwtPayload, LoginRequest/Response, CreateUserRequest, UserResponse, ApiResponse |
| `src/config/env.ts` | @dev-agent | dotenv loader, required() helper, fails fast on missing vars |
| `src/config/db.ts` | @db-agent | Prisma singleton client with query logging in dev mode |
| `src/config/jwt.ts` | @dev-agent | `signToken()` and `verifyToken()` helpers |
| `src/middlewares/authMiddleware.ts` | @dev-agent + @db-agent | JWT verify → attach `{ userId, tenantId, role }` to `req.context` |
| `src/middlewares/rbacMiddleware.ts` | @dev-agent + @db-agent | Role gate factory → returns 403 for disallowed roles |
| `src/services/authService.ts` | @dev-agent | Login: tenant lookup by subdomain → user lookup → bcrypt compare → JWT sign |
| `src/services/userService.ts` | @dev-agent + @db-agent | User CRUD — all queries pass tenantId; soft-delete via isActive flag |
| `src/controllers/authController.ts` | @dev-agent | Thin handler — Zod validation → authService → response |
| `src/controllers/userController.ts` | @dev-agent | Thin handler — Zod validation → userService → response |
| `src/routes/authRoutes.ts` | @dev-agent | `POST /auth/login` — public, no auth middleware |
| `src/routes/userRoutes.ts` | @dev-agent | `GET/POST/PUT/DELETE /users` — authMiddleware + rbacMiddleware(['admin']) |
| `src/app.ts` | @dev-agent | Express app: helmet, cors, json, routes, 404 handler |
| `src/server.ts` | @dev-agent | Starts HTTP server on configured PORT |

#### `src/backend/tests/` — Test Suite
| File | Agent | Description |
|------|-------|-------------|
| `tests/unit/authService.test.ts` | @qa-agent | 5 unit tests: valid login, wrong password, inactive user, inactive tenant, unknown tenant |
| `tests/unit/middlewares.test.ts` | @qa-agent | 8 unit tests: missing token, invalid token, valid token, full RBAC matrix (admin/doctor/staff) |
| `tests/integration/auth.test.ts` | @qa-agent | 6 integration tests: login success, JWT payload structure, cross-tenant token IDs, 401/400 cases |
| `tests/integration/tenantIsolation.test.ts` | @qa-agent | **Critical** 6 isolation tests: cross-tenant read blocked, no-token 401, staff 403, Tenant B cannot write to Tenant A |

#### `src/frontend/` — Frontend (React 18 + Vite + Tailwind + React Query + Zustand)
| File | Agent | Description |
|------|-------|-------------|
| `package.json` | @dev-agent | React, react-router-dom, @tanstack/react-query, zustand, axios, Vite, Tailwind |
| `vite.config.ts` | @dev-agent | Vite dev server on 5173, proxies `/auth` and `/users` to backend 4000 |
| `tsconfig.json` | @dev-agent | React JSX, strict mode, bundler module resolution |
| `tailwind.config.js` | @uiux-agent | brand color scale, `minHeight/minWidth: tap` (44px) utility |
| `postcss.config.js` | @dev-agent | Tailwind + autoprefixer |
| `index.html` | @dev-agent | Vite HTML entry point |
| `src/index.css` | @uiux-agent | Tailwind directives + `.tap-target` utility class (min 44×44px) |
| `src/main.tsx` | @dev-agent | React root with QueryClientProvider + BrowserRouter |
| `src/App.tsx` | @dev-agent | Route tree: /login (public), / (ProtectedRoute → AppShell), lazy dashboard |
| `src/store/authStore.ts` | @dev-agent | Zustand: JWT in memory (not localStorage), setAuth, clearAuth, isAuthenticated |
| `src/store/uiStore.ts` | @uiux-agent | Zustand persisted: sidebarOpen, handMode (left/right), toggles |
| `src/utils/api.ts` | @dev-agent | Axios instance: injects Bearer token, auto-redirects to /login on 401 |
| `src/hooks/useAuth.ts` | @dev-agent | `useLogin()` mutation + `useLogout()` helper |
| `src/components/Sidebar.tsx` | @uiux-agent + @dev-agent | Collapsible sidebar, left/right-hand mode, 44px nav items, icon-only when collapsed |
| `src/components/TopNav.tsx` | @uiux-agent + @dev-agent | Clinic name, user info, hand-mode toggle, logout button |
| `src/components/ProtectedRoute.tsx` | @dev-agent | Redirects unauthenticated users to /login |
| `src/views/AppShell.tsx` | @uiux-agent + @dev-agent | Flex layout with sidebar + TopNav + Outlet; hand-mode aware ordering |
| `src/views/LoginView.tsx` | @uiux-agent + @dev-agent | Login form: 44px inputs, inline error display, no alert(), tablet-optimised |
| `src/views/DashboardView.tsx` | @dev-agent | Stub dashboard with 4 KPI card placeholders (Phase 2 will populate) |

---

## Summary Statistics

| Category | Count |
|----------|-------|
| New files created | 47 |
| Files fixed/patched | 9 |
| Agent roles active | 5 (pm, db, dev, uiux, qa) |
| Test cases written | 19 (8 unit + 11 integration) |
| DB tables defined | 10 |
| API endpoints implemented | 6 (POST /auth/login, GET/POST/PUT/DELETE /users, GET /health) |
| Phases documented | 3 (Phase 1–3 with 25 tasks total) |
