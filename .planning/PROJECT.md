# Anemal — Phase 1.5 Settings Module (Frontend Completion)

## What This Is

Complete the Settings & Configuration UI for the Anemal veterinary clinic SaaS. The backend (DB schema, API, encryption, tests) is fully done. This milestone builds all 7 remaining frontend pages and connects them to the live API, unblocking PromptPay QR, LINE/SMS dispatch, and the payment gateway integrations.

## Context

**Product:** Anemal — multi-tenant SaaS for veterinary clinics (Thailand). Subscription model. Tablet-first + web.

**Where we are:** Phases 1–4 complete (155 tests). Phase 1.5 backend done (206 tests, 1.5-A + 1.5-B). Need the frontend to match.

**Why this matters:** Without the settings UI:
- Clinics can't store their PromptPay ID → Session C (PromptPay QR) is blocked
- Clinics can't configure LINE OA / SMS tokens → Session G (notification dispatch) is blocked
- Super admin can't manage platform settings via UI → only via raw API calls

## Stack (Existing)

- **Frontend:** React 18 + TypeScript, Vite, Tailwind CSS, React Query, Zustand
- **Design system:** Compassionate Care System — `bg-primary` (#000), `bg-secondary` (#006c4a), Material Symbols Outlined icons
- **Backend:** Express + Prisma + PostgreSQL — settings API already live at `/api/v1/settings/*`
- **Auth:** JWT `{ userId, tenantId, branchId, role }` — roles: `admin`, `doctor`, `staff`, `superadmin`
- **Tests:** Jest + Supertest integration tests

## Core Value

Clinic admins can configure their clinic from a single settings hub without touching the database. Super admins can manage platform config from the admin panel.

## Users

| User | Goal | Settings they touch |
|------|------|---------------------|
| Clinic Admin | Configure clinic for daily ops | Profile, Hours, Notifications, Payment, Integrations |
| Superadmin | Manage platform settings | System settings (SMTP, platform, feature flags) |
| Doctor / Staff | Personalise their experience | My Preferences only |

## Requirements

### Validated

- ✓ `tenant_settings` table extended with all settings fields (migration `20260610081405`) — existing
- ✓ `system_settings` table + seed data — existing
- ✓ `settings_audit_log` table — existing
- ✓ AES-256-GCM encryption utility — existing
- ✓ Clinic Settings API (8 endpoints: GET/PUT profile, hours, notifications, payment, integrations + 2 test endpoints) — existing
- ✓ System Settings API (4 endpoints, superadmin only) — existing
- ✓ Personal Preferences API (GET/PUT language + calendar view) — existing
- ✓ TC-S001–S009 passing — existing

### Active

- [ ] Settings layout with left sidebar navigation and role-based section visibility
- [ ] Clinic Profile page (name, logo, address, phone, tax ID, website)
- [ ] Operating Hours page (per-day toggle + open/close time pickers, tablet-optimised)
- [ ] Notifications page (LINE OA token + SMS provider/key, masked reveal, test send)
- [ ] Payment page (PromptPay ID, static QR upload/preview, GB PrimePay placeholder)
- [ ] Integrations page (Lab API URL/key, test connection, placeholder cards)
- [ ] System Settings page for superadmin (Platform + SMTP tabs + test button)
- [ ] All pages responsive on 768px (iPad portrait) and 1024px (landscape)
- [ ] All secret fields masked in UI (••••••••xxxx), masked-echo guard on save
- [ ] TC-S010: test connection timeout URL → 10s enforced, error returned

### Out of Scope

- Real S3 logo upload (Session E) — needs AWS credentials
- Real LINE/SMS message dispatch (Session G) — needs API keys
- Real payment gateway (Session F) — needs Omise credentials
- Barcode scanning UI (Session D) — separate session
- SaaS subscription billing — future milestone

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| No new `clinic_settings` table | Extended existing `tenant_settings` (1:1 with tenant) — avoids join complexity | ✓ Implemented in 1.5-A |
| `superadmin` role is separate from clinic roles | Superadmin has NO access to clinic routes; clinic admin has NO access to system routes | ✓ Implemented in 1.5-B |
| Secret masked-echo guard | Client echoing `••••••••xxxx` back never overwrites stored secret | ✓ Implemented in API |
| Settings route prefix | `/api/v1/settings/clinic/*` for clinic, `/api/v1/admin/system-settings/*` for system | ✓ Confirmed |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-10 after initialization*
