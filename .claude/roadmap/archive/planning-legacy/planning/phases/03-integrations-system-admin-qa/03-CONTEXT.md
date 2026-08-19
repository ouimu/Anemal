# Phase 3: Integrations, System Admin + QA - Context

**Gathered:** 2026-06-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Build two new settings pages — `IntegrationsPage.tsx` (clinic admin: Lab API config + placeholder cards) and `SystemSettingsPage.tsx` (superadmin only: Platform / Email+SMTP / Feature Flags accordion) — and close the TC-S010 timeout test gap in `settings-api.test.ts`. No new backend endpoints needed: all routes and services were shipped in Phase 1.5-B.

</domain>

<decisions>
## Implementation Decisions

### SystemSettingsPage Layout
- **D-01:** Use accordion sections (not tabs or sub-routes) for Platform / Email+SMTP / Feature Flags. All three sections always visible, collapsed by default.
- **D-02:** Each accordion section has its own Save button — PUT `/admin/system-settings/:key` for each changed field, sequentially on save. One success toast when all done.
- **D-03:** Test SMTP button: spinner on button + disabled while awaiting result. Same pattern as NotificationsPage `testLoading` state.
- **D-04:** Maintenance Mode toggle saves without confirmation dialog — superadmin intent assumed.
- **D-05:** Feature Flags section shows a single "Coming Soon" card (icon + text: "Feature flag management — Phase 4"). Non-interactive.
- **D-06:** If a non-superadmin navigates directly to `/settings/system`, show an inline "Access Denied" message card inside the page (do not redirect).

### useSystemSettings Hook
- **D-07:** Fetch all system settings in a single `useQuery` for `GET /admin/system-settings`. Component maps the flat key-value rows into section-specific form state.
- **D-08:** SMTP password field follows the same mask/stripMask pattern as Phase 2 secret fields: masked on load (`••••••••xxxx`), 👁 reveal toggle, `stripMask` before PUT. Reuse the `stripMask` utility from `PaymentPage.tsx`.
- **D-09:** Save iterates dirty fields and fires `PUT /:key` per changed field. No new bulk endpoint.

### TC-S010 Test Strategy
- **D-10:** Add TC-S010 to the existing `settings-api.test.ts` alongside TC-S008/S009. Do not create a new file.
- **D-11:** Simulate a hung URL using a mock fetch that returns a promise that never resolves, combined with jest fake timers advanced by 10,001ms. Assert `AbortError` is caught and `{ success: false, detail: '...timed out...' }` is returned with HTTP 200.

### Claude's Discretion
- IntegrationsPage layout and field order (Lab API URL + Key, Test Connection, then placeholder cards below)
- Specific system settings keys to render per section (infer from seed data in `src/backend/prisma/seed.ts`)
- Placeholder card visual design for X-ray/DICOM and Accounting in IntegrationsPage (consistent with SYSADM Feature Flags card)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Requirements
- `.planning/REQUIREMENTS.md` §Integrations, §System Settings (Superadmin), §QA — INTEGR-01–03, SYSADM-01–04, QA-01

### Existing Phase 2 Patterns (reuse, don't reinvent)
- `src/frontend/src/views/settings/NotificationsPage.tsx` — test connection pattern (testLoading, testResult state, handleTest function)
- `src/frontend/src/views/settings/PaymentPage.tsx` — stripMask utility and masked secret field pattern
- `src/frontend/src/hooks/useNotificationsSettings.ts` — TanStack Query v5 hook pattern to replicate for useSystemSettings

### Backend (already live — no changes expected)
- `src/backend/routes/system-settings.routes.ts` — `GET /`, `GET /:key`, `PUT /:key`, `POST /smtp/test` (all superadmin)
- `src/backend/routes/settings.routes.ts` — `GET /clinic/integrations` via `GET /clinic`, `PUT /clinic/integrations`, `POST /clinic/integrations/test`
- `src/backend/services/connection-test.service.ts` — `testLab()` and `testSmtp()` implementations; `TEST_TIMEOUT_MS = 10_000`

### Test Patterns
- `src/backend/tests/integration/settings-api.test.ts` — TC-S008/S009 mock-fetch pattern (extend with TC-S010)
- `src/backend/jest.setup.js` — supertest + Node 24 ECONNRESET fix; do not remove

### Design System
- `stitch_vet_clinic_design_system/admin_control_center_1024x768/code.html` — reference for admin page styling
- `src/frontend/tailwind.config.js` — Compassionate Care System tokens (no raw hex)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `NotificationsPage.tsx` `handleTest(channel)` function → replicate as `handleTestLab()` in IntegrationsPage and `handleTestSmtp()` in SystemSettingsPage
- `PaymentPage.tsx` `stripMask()` utility → import and reuse for SMTP password field
- `useNotificationsSettings.ts` hook structure → template for `useIntegrationsSettings` and `useSystemSettings` hooks
- `MaterialIcon` component in `src/frontend/src/components/MaterialIcon.tsx`

### Established Patterns
- Secret fields: masked load, 👁 toggle with `showField` boolean state, `stripMask` before PUT
- Test buttons: `testLoading` state (`'lab' | null` or `'smtp' | null`), `testResult` state, inline result display
- TanStack Query v5: `useMutation` without `onError` (errors via `mutation.error`), `onSuccess` with `queryClient.invalidateQueries`
- Toast: `saved` boolean state → auto-dismiss after 3s

### Integration Points
- `src/frontend/src/views/settings/index.ts` — export new pages here
- `src/frontend/src/App.tsx` — add `/settings/integrations` and `/settings/system` lazy routes
- `src/frontend/src/views/settings/SettingsLayout.tsx` — nav item for Integrations (admin only) and System Settings (superadmin only) already filtered by role in `ALL_NAV` array

</code_context>

<specifics>
## Specific Ideas

- SystemSettingsPage accordion: collapsed by default, expand on click. No routing, no URL changes.
- SystemSettingsPage access guard: inline "Access Denied" card (not a redirect) — role checked via `useAuthStore`.
- TC-S010: must use `jest.useFakeTimers()` + `jest.advanceTimersByTimeAsync(10001)` pattern inside an async test; the mock fetch returns `new Promise(() => {})` (never resolves).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 3-integrations-system-admin-qa*
*Context gathered: 2026-06-11*
