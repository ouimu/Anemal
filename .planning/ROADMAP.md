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
- [ ] 01B-PLAN.md — Clinic Profile form: useClinicSettings hook + ClinicProfilePage wired to GET/PUT API (Wave 2)
- [ ] 01C-PLAN.md — Logo upload + touch target audit + 768px responsive polish (Wave 2, parallel with 01B)

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

**Files:**
- `src/frontend/src/views/settings/OperatingHoursPage.tsx` (new)
- `src/frontend/src/views/settings/NotificationsPage.tsx` (new)
- `src/frontend/src/views/settings/PaymentPage.tsx` (new)

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
