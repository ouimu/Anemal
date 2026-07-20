# Roadmap — Phase 1.5 Settings Frontend

**3 phases** | **22 requirements mapped** | All v1 requirements covered ✓

| # | Phase | Goal | Requirements | Success Criteria |
|---|-------|------|--------------|------------------|
| 1 | Settings Shell + Clinic Profile | Navigable settings hub with clinic profile working end-to-end | LAYOUT-01–04, CLINIC-01–03, UX-01–03 | 3 |
| 2 | Operational Settings Pages | Hours, Notifications, and Payment pages fully wired to API | HOURS-01–03, NOTIF-01–05, PAYMENT-01–03 | 3 |
| 3 | Integrations, System Admin + QA | Integrations page, superadmin system settings UI, and final test coverage | INTEGR-01–03, SYSADM-01–04, QA-01 | 3 |

---

### Phase 1: Settings Shell + Clinic Profile

**Goal:** Build the settings navigation shell and wire the Clinic Profile page to the live API. Establish the layout pattern all subsequent pages will follow.
**Mode:** mvp
**Plans:** 3 plans

**Requirements:** LAYOUT-01, LAYOUT-02, LAYOUT-03, LAYOUT-04, CLINIC-01, CLINIC-02, CLINIC-03, UX-01, UX-02, UX-03

**Success Criteria:**
1. Clinic admin navigates to `/settings` and sees the sidebar with role-filtered nav sections — no blank page, no console errors
2. Clinic admin updates Clinic Name and Phone, saves, refreshes — values persist (confirmed via `GET /api/v1/settings/clinic`)
3. All interactive elements on the Clinic Profile page have ≥44px touch targets and the page renders at 768px without horizontal scroll

Plans:
- [x] 01A-PLAN.md — Settings shell: SettingsLayout + /settings route registration (Wave 1) ✅
- [x] 01B-PLAN.md — Clinic Profile form: useClinicSettings hook + ClinicProfilePage wired to GET/PUT API (Wave 2) ✅
- [x] 01C-PLAN.md — Logo upload + touch target audit + 768px responsive polish (Wave 2, parallel with 01B) ✅

**Files:**
- `src/frontend/src/layouts/SettingsLayout.tsx` (new)
- `src/frontend/src/views/settings/ClinicProfilePage.tsx` (new)
- `src/frontend/src/views/settings/index.ts` (barrel)
- `src/frontend/src/hooks/useClinicSettings.ts` (React Query hook)
- Route registration in `src/frontend/src/App.tsx`

---

### Phase 2: Operational Settings Pages

**Goal:** Build the three pages that unblock integrations — Operating Hours, Notifications, and Payment. Notifications and Payment are critical blockers for Sessions G and C.
**Mode:** mvp

**Requirements:** HOURS-01, HOURS-02, HOURS-03, NOTIF-01, NOTIF-02, NOTIF-03, NOTIF-04, NOTIF-05, PAYMENT-01, PAYMENT-02, PAYMENT-03

**Success Criteria:**
1. Clinic admin toggles Monday off, saves Operating Hours, refreshes — Monday toggle is still off (persisted to API)
2. Clinic admin enters a LINE OA token, saves, revisits the page — token displays as `••••••••xxxx`; clicking 👁 reveals it; saving without changing it does NOT clear the stored value
3. Clinic admin enters PromptPay ID and uploads a static QR image — QR preview renders below the upload area; saving persists both values

Plans:
- [x] 02A-PLAN.md — Hooks (useOperatingHoursSettings, useNotificationsSettings, usePaymentSettings) + App.tsx routes (Wave 1) ✅
- [x] 02B-PLAN.md — OperatingHoursPage + NotificationsPage (Wave 2) ✅
- [x] 02C-PLAN.md — PaymentPage (Wave 2, parallel with 02B) ✅

**Files:**
- `src/frontend/src/hooks/useOperatingHoursSettings.ts` (new)
- `src/frontend/src/hooks/useNotificationsSettings.ts` (new)
- `src/frontend/src/hooks/usePaymentSettings.ts` (new)
- `src/frontend/src/views/settings/OperatingHoursPage.tsx` (new)
- `src/frontend/src/views/settings/NotificationsPage.tsx` (new)
- `src/frontend/src/views/settings/PaymentPage.tsx` (new)
- `src/frontend/src/App.tsx` (updated — 3 lazy imports + 3 routes)

---

### Phase 3: Integrations, System Admin + QA

**Goal:** Complete the integrations page, build the superadmin system settings UI, and close the remaining test gap (TC-S010 timeout test).
**Mode:** mvp

**Requirements:** INTEGR-01, INTEGR-02, INTEGR-03, SYSADM-01, SYSADM-02, SYSADM-03, SYSADM-04, QA-01

**Success Criteria:**
1. Clinic admin enters Lab API URL and clicks Test Connection — ✅ or ❌ result appears inline within 10 seconds; a URL that never responds shows an error (not a hang)
2. Superadmin navigates to System Settings, edits SMTP Host, saves, refreshes — value persists; clicking Test SMTP returns success/error detail
3. TC-S010 integration test passes: test connection with a timeout URL returns a structured error response within 10 s (not a 5xx)

**Files:**
- `src/frontend/src/views/settings/IntegrationsPage.tsx` (new)
- `src/frontend/src/views/admin/SystemSettingsPage.tsx` (new)
- `src/backend/tests/integration/settings-connection-test.test.ts` (TC-S010)

---

## Dependency Notes

- Phase 2 (Notifications + Payment pages) unblocks Session C (PromptPay QR) and Session G (LINE/SMS)
- Phase 3 (Integrations) unblocks Lab integration work
- Phase 3 (System Settings) unblocks superadmin platform management via UI
- All phases depend on the existing API from Phase 1.5-A/B — no backend changes expected

---

## Phase 5 — RBAC, Platform Console & Restructure (designed 2026-06-13)

New milestone beyond the 1.5 settings work. Two-plane authorization, configurable roles, plan
quotas, and IA cleanup. Spec: `.claude/specs/RBAC_Platform_Restructure_Spec.md`. Tasks:
`.claude/roadmap/phase5-rbac-platform-tasks.md`. GSD phase folder:
`.planning/phases/05-rbac-platform-restructure/`.

| Sub-phase | Title | Layer |
|---|---|---|
| 5-A | RBAC foundation | DB + backend |
| 5-B | Enforce permissions on clinic APIs | backend + QA |
| 5-C | Platform plane split | DB + backend |
| 5-D | Platform Console domain APIs + quotas | backend |
| 5-E | Frontend restructure + guards | frontend |
| 5-F | Role editor + Platform Console UI | frontend | ✅ Complete 2026-06-17 |
| 5-G | QA hardening + cleanup + docs | QA | (T-5G deferred — matrix QA pending) |

**Phase 8 status as of 2026-06-17:** T-5F COMPLETE. All frontend deliverables shipped:
- T-5F-01: Clinic Role Editor (`/clinic-admin/roles`) — `RoleEditorView`, `RoleList`, `RolePermissionEditor`, `CloneRoleModal`, `useRoles` hook. Guarded by `roles.view`.
- T-5F-02: Platform Console (`/platform/*`) — `CustomerListView`, `CustomerDetailView` (4 tabs), `PlatformPlansView`, `PlatformSettingsView`, `PlatformAuditView`, `PlatformLoginView`, `PlatformLayout`, `platformAuthStore`, `platformApi`.
- T-5F-03: Multi-Role Assignment — `RolePicker` in `UserManagementTab`, `Can.tsx` gate, `useUserRoles` hook.
- Test commits: `roleEditor-t5f01.test.ts`, `platform-console-t5f02.test.ts`, `user-roles-t5f03.test.ts`, `RoleEditorView.test.tsx` (28), `PlatformConsole.test.tsx`, `RolePicker.test.tsx`. ~394 total tests.

**Phase 8 is COMPLETE. Next: Phase 9 — i18n Rollout.**

---

## Deferred Add-ons

Items intentionally postponed — not blocking any current phase, revisit when the
triggering condition below is met.

### ADD-01 — Durable audit writes (both planes)

**Trigger:** an audit-completeness or compliance requirement appears (enterprise
customer, security review, regulated tenant). Not needed at dev/pilot scale.

**Problem:** `auditMiddleware` writes audit rows from a `res.on('finish')` handler
without awaiting them (`src/backend/middlewares/audit.middleware.ts`). Applies to
both branches — `PlatformAuditLog` (platform plane) and `AuditLog` (clinic plane).
Consequences:
- Process crash / restart / deploy between response and insert → the audit row is
  silently lost; the action itself already succeeded and returned 200.
- A failed insert is only `logger.error`'d — no retry, no alert, no surfacing to the caller.
- Net effect: the action happened, but no evidence it did.

**Options:**
1. `await` the audit write before sending the response — simplest, costs one extra
   round-trip of latency per mutating request.
2. Transactional outbox / durable queue with retry — no added latency, survives
   crashes, but adds a moving part to operate.

**Note:** the current behavior is deliberate (see the middleware's header comment),
not an oversight. `TC-S011` in `settings-api.test.ts` polls for the row because of
this — if this item ships, that poll can go back to a single read.

**Discovered:** 2026-07-20, while root-causing the TC-S011 flake (PR #35).
