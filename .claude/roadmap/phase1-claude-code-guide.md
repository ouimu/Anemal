# Phase 1 — Claude Code Implementation Guide (Updated)
**How to implement Phase 1 step-by-step using Claude Code CLI.**

Open terminal in project folder:
```powershell
cd D:\Development\AnimalClinic
claude
```

---

## Step 0 — Stack Decision

```
@pm-agent Decide: Node.js/Express/Prisma OR Python/FastAPI/SQLAlchemy.
Recommend based on React frontend + PostgreSQL. Then initialise the project.
```

---

## Step 1 — Task 1.1: Schema, Settings & Seed

```
@db-agent @dev-agent
Implement Task 1.1 from .claude/roadmap/phase1-tasks.md

1. Create Prisma schema for tenants, users, tenant_settings matching database-schema.sql
2. Run migration
3. Seed: dev-clinic + test-clinic, admin/doctor/staff each (6 users total)

@qa-agent Run QA protocol section 1 (isolation) and section 3 (input validation)
```

---

## Step 2 — Task 1.2 + 1.3: JWT Login & Middlewares

```
@dev-agent
Implement Tasks 1.2 and 1.3 from phase1-tasks.md

Task 1.2 — POST /auth/login:
- Resolve tenant from subdomain
- bcrypt.compare password
- Sign JWT with { userId, tenantId, role }
- Return token + user info

Task 1.3 — Middlewares:
- authMiddleware: verify JWT → attach req.context.{userId, tenantId, role}
- rbacMiddleware(roles[]): return 403 if role not in list

@db-agent Review middleware: confirm tenantId is correctly extracted
@qa-agent Run RBAC matrix: no-token=401, expired=401, wrong-role=403
```

---

## Step 3 — Task 1.4: Admin Settings + Usage API

```
@dev-agent @db-agent
Implement Task 1.4 from phase1-tasks.md

Build GET /admin/settings — upsert tenant_settings on first call
Build PUT /admin/settings — update profile fields + clinic name atomically
Build GET /admin/usage — count pets, owners, users, appointments, invoices

All routes: authMiddleware + rbacMiddleware(['admin'])
CRITICAL: all DB queries filter by req.context.tenantId

@qa-agent Verify: doctor/staff token on /admin/* → 403
```

---

## Step 4 — Task 1.5: User Management API

```
@dev-agent
Implement Task 1.5 from phase1-tasks.md

GET    /users         — list users for current tenant
POST   /users         — create user (name, email, password, role)
PUT    /users/:id     — update name, role, isActive
DELETE /users/:id     — soft-delete (isActive=false)

All admin-only. All queries MUST include tenantId filter.

@db-agent Review userService.ts — confirm every query has WHERE tenant_id = tenantId
@qa-agent Run cross-tenant tests: Tenant B cannot read/write Tenant A users
```

---

## Step 5 — Task 1.6: Admin Frontend (6 Pages)

```
@uiux-agent
Deliver specs for:
1. AdminLayout — dark slate sidebar (w-56), logo from tenant settings, role badge
2. AdminDashboard — 2×3 KPI grid + quick actions + plan card
3. AdminUsers — filter bar, user list with role badges, add/edit modal with role picker
4. AdminUsage — KPI row + quota progress bars (red >90%) + clinic summary table
Include Tailwind class suggestions.
```

Then:
```
@dev-agent
Implement Task 1.6 from phase1-tasks.md using @uiux-agent spec

Files to create:
- src/layouts/AdminLayout.tsx (redirects non-admin → /clinic/dashboard)
- src/views/admin/AdminDashboard.tsx
- src/views/admin/AdminUsers.tsx (add/edit modal, role picker, activate/deactivate)
- src/views/admin/AdminUsage.tsx (quota bars, summary table)
- src/views/admin/ClinicProfileTab.tsx (logo upload, all fields)
- src/views/admin/ClinicSettingsTab.tsx (slot, hours, toggles)
- src/views/admin/SubscriptionTab.tsx (plan cards, multi-tenant callout)
- src/hooks/useAdmin.ts (useAdminSettings, useUpdateSettings)

Guard: AdminLayout redirects role !== 'admin' to /clinic/dashboard

@uiux-agent Review: all tap targets ≥ 44px, correct at 768px
@qa-agent Verify: admin pages inaccessible to doctor/staff
```

---

## Step 6 — Task 1.7: Clinic Frontend

```
@uiux-agent
Deliver spec for:
1. ClinicLayout — brand-700 collapsible sidebar, hand-mode toggle, user info footer
2. ClinicDashboard — greeting, 4 KPI cards, quick action tiles (colour-coded), schedule placeholder
```

Then:
```
@dev-agent
Implement Task 1.7 from phase1-tasks.md

Files to create:
- src/layouts/ClinicLayout.tsx (redirects admin → /admin/dashboard)
- src/views/clinic/ClinicDashboard.tsx (KPIs + quick actions + placeholder)
- src/views/clinic/ClinicAppointments.tsx (🚧 stub)
- src/views/clinic/ClinicPets.tsx (🚧 stub)
- src/views/clinic/ClinicEMR.tsx (🚧 stub)
- src/views/clinic/ClinicInventory.tsx (🚧 stub)
- src/views/clinic/ClinicBilling.tsx (🚧 stub)

Sidebar items: Dashboard, Appointments, Pets & Owners, EMR, Inventory, Billing
NO admin items visible in clinic sidebar

@uiux-agent Verify sidebar at 768px; confirm no horizontal scroll
```

---

## Step 7 — Task 1.8: Login Page Redesign

```
@dev-agent
Implement Task 1.8 from phase1-tasks.md

Redesign src/views/LoginView.tsx:
- Gradient background (brand-700 to brand-900)
- White card with Anemal logo above
- Clinic ID field: auto-detect subdomain from window.location.hostname
- Password show/hide toggle
- Role-based redirect on success: admin → /admin/dashboard, doctor/staff → /clinic/dashboard
- Inline error display (no alert())
- Already authenticated → immediate redirect

Update src/hooks/useAuth.ts:
  onSuccess: navigate(role === 'admin' ? '/admin/dashboard' : '/clinic/dashboard')

@uiux-agent Verify design at 768px; 44px tap targets; no keyboard-required flows
@qa-agent Test role redirects with all 3 roles
```

---

## Step 8 — Update App.tsx Routing

```
@dev-agent
Update src/App.tsx with restructured routing:

/login               → LoginView (public)
/admin/*             → ProtectedRoute → AdminLayout
  /admin/dashboard   → AdminDashboard
  /admin/users       → AdminUsers
  /admin/profile     → AdminProfile
  /admin/usage       → AdminUsage
  /admin/settings    → AdminSettings
  /admin/subscription→ AdminSubscription
/clinic/*            → ProtectedRoute → ClinicLayout
  /clinic/dashboard  → ClinicDashboard
  /clinic/appointments → ClinicAppointments
  /clinic/pets       → ClinicPets
  /clinic/emr        → ClinicEMR
  /clinic/inventory  → ClinicInventory
  /clinic/billing    → ClinicBilling
/ and * → redirect to /login
```

---

## Step 9 — Phase 1 QA & Sign-off

```
@qa-agent
Run complete QA protocol from .claude/roadmap/qa-protocols.md

Focus areas:
1. Cross-tenant isolation — Tenant B cannot access Tenant A data
2. Role routing — admin always goes to /admin/*, doctor/staff to /clinic/*
3. Route guards — /admin/* rejects doctor/staff; /clinic/* redirects admin
4. User management — add/edit/deactivate + role change works correctly
5. Tablet UI — all pages at 768px, 44px tap targets

Report PASS ✅ / FAIL ❌ per item with fix owner.

@pm-agent After QA report, check Definition of Done in phase1-implementation-plan.md.
If all pass → approve Phase 1, tag v0.1.0.
```

---

## Useful Claude Code Tips

| Action | Command |
|--------|---------|
| Reload agent context | `/init` |
| Clear between tasks | `/clear` |
| Invoke DB agent | `@db-agent <your message>` |
| Invoke QA agent | `@qa-agent <your message>` |
| Check MCP connections | `claude mcp list` |
