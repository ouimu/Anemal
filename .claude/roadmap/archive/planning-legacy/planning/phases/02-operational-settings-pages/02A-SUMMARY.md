---
phase: 2
plan: 02A
subsystem: frontend-hooks
tags: [settings, react-query, typescript, hooks]
dependency_graph:
  requires: [01C-PLAN.md]
  provides: [useOperatingHoursSettings, useNotificationsSettings, usePaymentSettings, ClinicSettingsData-phase2-fields]
  affects: [App.tsx, 02B-PLAN.md, 02C-PLAN.md]
tech_stack:
  added: []
  patterns: [React Query shared cache key, lazy route registration]
key_files:
  created:
    - src/frontend/src/hooks/useOperatingHoursSettings.ts
    - src/frontend/src/hooks/useNotificationsSettings.ts
    - src/frontend/src/hooks/usePaymentSettings.ts
  modified:
    - src/frontend/src/hooks/useClinicSettings.ts
    - src/frontend/src/App.tsx
decisions:
  - All three new hook files share queryKey ['settings', 'clinic'] to enable cross-page cache invalidation from a single mutation
  - useTestNotifications has no onSuccess invalidation — test endpoint is stateless and does not mutate persisted settings
metrics:
  duration: ~5 minutes
  completed: 2026-06-11
  tasks_completed: 5
  tasks_total: 5
  files_created: 3
  files_modified: 2
---

# Phase 2 Plan 02A: Operational Settings Data Layer Summary

**One-liner:** Three typed React Query hook files for operating hours, notifications, and payment settings, sharing a unified `['settings', 'clinic']` cache key with Phase 1.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Expand ClinicSettingsData interface | b75e9f7 | useClinicSettings.ts |
| 2 | Create useOperatingHoursSettings.ts | 0669e99 | useOperatingHoursSettings.ts (new) |
| 3 | Create useNotificationsSettings.ts | 57d811e | useNotificationsSettings.ts (new) |
| 4 | Create usePaymentSettings.ts | ccf5912 | usePaymentSettings.ts (new) |
| 5 | Register Phase 2 routes in App.tsx | 57c9404 | App.tsx |

## What Was Built

### ClinicSettingsData Interface Extension (Task 1)

Added 9 optional fields to the existing interface in `useClinicSettings.ts`:
- `operatingHours` — Record of 7 day keys to `{ open, close } | null`
- `lineOaToken`, `smsProvider`, `smsApiKey`, `smsSenderName` — notification channel config (secrets arrive masked)
- `promptpayId`, `paymentQrUrl`, `gbprimepayPublic`, `gbprimepaySecret` — payment config (secret arrives masked)

### Hook Files Created (Tasks 2–4)

**useOperatingHoursSettings.ts** — exports:
- `DayHours`, `DayKey`, `OperatingHoursMap` types
- `useOperatingHours()` — query hook (GET /api/v1/settings/clinic)
- `useUpdateOperatingHours()` — mutation hook (PUT /api/v1/settings/clinic/hours)

**useNotificationsSettings.ts** — exports:
- `NotificationsInput`, `NotificationsTestInput`, `NotificationsTestResult` interfaces
- `useNotificationsSettings()` — query hook
- `useUpdateNotifications()` — mutation hook (PUT /api/v1/settings/clinic/notifications)
- `useTestNotifications()` — stateless test mutation (POST /api/v1/settings/clinic/notifications/test, no cache invalidation)

**usePaymentSettings.ts** — exports:
- `PaymentInput` interface
- `usePaymentSettings()` — query hook
- `useUpdatePayment()` — mutation hook (PUT /api/v1/settings/clinic/payment)

### App.tsx Routes (Task 5)

Three lazy imports and three child routes added to the `/settings` block:
- `/settings/hours` → `OperatingHoursPage`
- `/settings/notifications` → `NotificationsPage`
- `/settings/payment` → `PaymentPage`

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `npx tsc --noEmit` exits 0 (errors only for missing page view files OperatingHoursPage, NotificationsPage, PaymentPage — expected, created by 02B/02C)
- All hook exports match plan artifacts specification
- All mutation endpoints match backend routes
- No `any` types introduced
- Shared `['settings', 'clinic']` query key maintained across all hooks

## Known Stubs

None. This plan is data-layer only (no UI rendering). Plans 02B and 02C will create the page components that consume these hooks.

## Threat Flags

None. No new network endpoints introduced. Backend client echo protection for masked secret fields is handled server-side per existing `tenant-settings.service.ts` implementation (T-02A-02 already mitigated in Phase 1.5-B).

## Self-Check: PASSED

- src/frontend/src/hooks/useOperatingHoursSettings.ts — exists
- src/frontend/src/hooks/useNotificationsSettings.ts — exists
- src/frontend/src/hooks/usePaymentSettings.ts — exists
- b75e9f7 — confirmed in git log
- 0669e99 — confirmed in git log
- 57d811e — confirmed in git log
- ccf5912 — confirmed in git log
- 57c9404 — confirmed in git log
