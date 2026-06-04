# Phase 1 — Full Implementation Plan (Updated)
**Duration:** 4 Weeks  
**Goal:** Multi-tenancy, auth, RBAC, Admin section (6 pages), Clinic section (dashboard + stubs), Login redesign.

---

## Agent Responsibilities

| Agent | Phase 1 Role |
|-------|-------------|
| `@pm-agent` | Validate each task's acceptance criteria; approve phase completion |
| `@db-agent` | Tasks 1.1, 1.4 — schema + settings; review all DB queries for tenant isolation |
| `@dev-agent` | All implementation: backend APIs, React layouts, page components |
| `@uiux-agent` | Deliver specs for AdminLayout, ClinicLayout, LoginView before dev starts |
| `@qa-agent` | Run QA protocol after each task; cross-tenant isolation tests; RBAC matrix |

---

## Week-by-Week Schedule

### Week 1 — Database & Auth API
| Day | Task | Owner | Validator |
|-----|------|-------|-----------|
| Mon | Stack decision + project init | @dev-agent | @pm-agent |
| Mon–Tue | **Task 1.1** — Prisma schema (tenants, users, tenant_settings), migration, seed 2 tenants | @db-agent + @dev-agent | @qa-agent |
| Wed–Thu | **Task 1.2** — POST /auth/login → JWT with tenantId+role | @dev-agent | @db-agent |
| Fri | **Task 1.3** — authMiddleware + rbacMiddleware; QA isolation tests | @dev-agent | @qa-agent |

### Week 2 — Admin Backend APIs
| Day | Task | Owner | Validator |
|-----|------|-------|-----------|
| Mon–Tue | **Task 1.4** — GET/PUT /admin/settings + GET /admin/usage | @dev-agent + @db-agent | @db-agent |
| Wed–Thu | **Task 1.5** — GET/POST/PUT/DELETE /users (role+activate/deactivate) | @dev-agent | @db-agent |
| Fri | QA Tasks 1.4+1.5 — isolation + RBAC matrix; sign-off | @qa-agent | @pm-agent |

### Week 3 — Frontend: Admin Section + Login
| Day | Task | Owner | Validator |
|-----|------|-------|-----------|
| Mon | @uiux-agent delivers: AdminLayout spec, Login page spec | @uiux-agent | @pm-agent |
| Mon–Wed | **Task 1.6** — AdminLayout + all 6 admin pages | @dev-agent | @uiux-agent |
| Thu–Fri | **Task 1.8** — LoginView redesign (gradient, subdomain auto, role redirect) | @dev-agent | @uiux-agent + @qa-agent |

### Week 4 — Frontend: Clinic Section + QA
| Day | Task | Owner | Validator |
|-----|------|-------|-----------|
| Mon | @uiux-agent delivers: ClinicLayout + Dashboard spec | @uiux-agent | @pm-agent |
| Mon–Wed | **Task 1.7** — ClinicLayout + ClinicDashboard + 5 stub pages | @dev-agent | @uiux-agent |
| Thu | Full integration: login → role redirect → correct section | @qa-agent | All |
| Fri | Phase 1 sign-off; tag v0.1.0 | @pm-agent | — |

---

## File Map — What Gets Built

### Backend
| File | Task |
|------|------|
| `prisma/schema.prisma` | 1.1 |
| `prisma/seed.ts` | 1.1 |
| `src/config/env.ts` | 1.1 |
| `src/config/db.ts` | 1.1 |
| `src/config/jwt.ts` | 1.2 |
| `src/middlewares/authMiddleware.ts` | 1.3 |
| `src/middlewares/rbacMiddleware.ts` | 1.3 |
| `src/services/authService.ts` | 1.2 |
| `src/controllers/authController.ts` | 1.2 |
| `src/routes/authRoutes.ts` | 1.2 |
| `src/services/tenantSettingsService.ts` | 1.4 |
| `src/controllers/tenantSettingsController.ts` | 1.4 |
| `src/services/usageService.ts` | 1.4 |
| `src/routes/adminRoutes.ts` | 1.4 + 1.5 |
| `src/services/userService.ts` | 1.5 |
| `src/controllers/userController.ts` | 1.5 |
| `src/routes/userRoutes.ts` | 1.5 |

### Frontend
| File | Task |
|------|------|
| `src/App.tsx` | 1.6 + 1.7 + 1.8 |
| `src/hooks/useAuth.ts` | 1.8 |
| `src/hooks/useAdmin.ts` | 1.6 |
| `src/store/authStore.ts` | 1.8 |
| `src/store/uiStore.ts` | 1.7 |
| `src/layouts/AdminLayout.tsx` | 1.6 |
| `src/layouts/ClinicLayout.tsx` | 1.7 |
| `src/views/LoginView.tsx` | 1.8 |
| `src/views/admin/AdminDashboard.tsx` | 1.6 |
| `src/views/admin/AdminUsers.tsx` | 1.6 |
| `src/views/admin/ClinicProfileTab.tsx` | 1.6 |
| `src/views/admin/AdminUsage.tsx` | 1.6 |
| `src/views/admin/ClinicSettingsTab.tsx` | 1.6 |
| `src/views/admin/SubscriptionTab.tsx` | 1.6 |
| `src/views/clinic/ClinicDashboard.tsx` | 1.7 |
| `src/views/clinic/ClinicAppointments.tsx` | 1.7 (stub) |
| `src/views/clinic/ClinicPets.tsx` | 1.7 (stub) |
| `src/views/clinic/ClinicEMR.tsx` | 1.7 (stub) |
| `src/views/clinic/ClinicInventory.tsx` | 1.7 (stub) |
| `src/views/clinic/ClinicBilling.tsx` | 1.7 (stub) |

---

## Definition of Done — Phase 1

- [ ] Login auto-detects subdomain from hostname
- [ ] admin login → `/admin/dashboard`, doctor/staff → `/clinic/dashboard`
- [ ] `/admin/*` returns 401/redirect for non-admin tokens
- [ ] `/clinic/*` redirects admins to `/admin/dashboard`
- [ ] All 6 admin pages render with real API data
- [ ] User management: add/edit/deactivate + role picker works
- [ ] Usage quota bars reflect real counts
- [ ] Clinic dashboard loads KPIs and quick actions
- [ ] Phase 2–3 stubs show 🚧 placeholder
- [ ] Cross-tenant isolation tests pass (Tenant B cannot see Tenant A data)
- [ ] RBAC matrix: 401/403 correct for all role+route combinations
- [ ] All tap targets ≥ 44px; sidebar collapses; hand-mode persists
- [ ] Git tag `v0.1.0` created

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Role redirect loop (admin ↔ clinic) | AdminLayout redirects → /clinic; ClinicLayout redirects → /admin. One-way, no loop. |
| tenantId missing from query | @db-agent reviews every service function before merge |
| Usage stats slow on large data | Pre-aggregate with Prisma `count` — no N+1 queries |
| Clinic ID auto-detect fails on localhost | Falls back to empty field; user types manually |
