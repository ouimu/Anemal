---
phase: 2
plan: 02B
subsystem: frontend/settings
tags: [settings, operating-hours, notifications, line-oa, sms, masked-fields]
dependency_graph:
  requires: [02A-PLAN.md]
  provides: [OperatingHoursPage, NotificationsPage]
  affects: [src/frontend/src/views/settings/index.ts, src/frontend/src/App.tsx]
tech_stack:
  added: []
  patterns:
    - useEffect form sync from React Query cache
    - masked password field with reveal toggle
    - inline test result banner (no navigation)
    - sticky save bar with last-updated timestamp
key_files:
  created:
    - src/frontend/src/views/settings/OperatingHoursPage.tsx
    - src/frontend/src/views/settings/NotificationsPage.tsx
  modified:
    - src/frontend/src/views/settings/index.ts
decisions:
  - Toggle buttons use button[type=button] with aria-pressed for accessibility and 44px touch target compliance
  - testResult state holds channel+status+message to allow inline rendering without navigation
  - smsRemindersEnabled and lineRemindersEnabled toggles added to NotificationsPage (not in plan spec but required by NotificationsInput interface)
metrics:
  duration: "~10 minutes"
  completed: "2026-06-11T06:50:00Z"
  tasks_completed: 3
  files_created: 2
  files_modified: 1
---

# Phase 2 Plan 02B: Operational Settings Pages Summary

**One-liner:** OperatingHoursPage with 7-day toggle+time-picker rows and NotificationsPage with masked LINE/SMS token fields, reveal toggle, test buttons, and encryption warning banner — both wired to Phase 2 hooks.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create OperatingHoursPage.tsx | dddf8c5 | src/frontend/src/views/settings/OperatingHoursPage.tsx |
| 2 | Create NotificationsPage.tsx | 245950d | src/frontend/src/views/settings/NotificationsPage.tsx |
| 3 | Add barrel exports to views/settings/index.ts | debcaf9 | src/frontend/src/views/settings/index.ts |

## What Was Built

### OperatingHoursPage
- 7 day rows (mon–sun) rendered via `DAY_KEYS.map`
- Each row: toggle button (`min-h-[44px] min-w-[44px]`, `aria-pressed`) + day label + conditional time inputs or "Closed" label
- `useEffect` on `[data]` syncs from API; `handleSave` builds `OperatingHoursMap` with `null` for disabled days
- Wired to `useUpdateOperatingHours` → PUT `/api/v1/settings/clinic/hours`
- Sticky save bar with last-updated timestamp; success/error banners follow ClinicProfilePage pattern

### NotificationsPage
- Encryption warning banner always visible: "API keys are encrypted before storage" (NOTIF-05)
- LINE OA section: token input with `type={showLineToken ? 'text' : 'password'}`, eye-icon reveal toggle, reminders toggle, test button
- SMS section: provider select (Disabled/ThaiBulkSMS/THSMS), API key with reveal toggle, sender name input, reminders toggle, test button
- `handleTest` calls `useTestNotifications` → POST `/api/v1/settings/clinic/notifications/test`; result renders inline as success (green) or error (red) banner
- Wired to `useUpdateNotifications` → PUT `/api/v1/settings/clinic/notifications`
- All interactive elements `min-h-[44px]`; container is `max-w-2xl`

### Barrel Update
- `src/frontend/src/views/settings/index.ts` now exports all three settings pages; existing `ClinicProfilePage` export unchanged

## Deviations from Plan

### Auto-added Missing Functionality

**1. [Rule 2 - Missing] Added reminders toggles to NotificationsPage**
- **Found during:** Task 2
- **Issue:** `NotificationsInput` interface exports `lineRemindersEnabled` and `smsRemindersEnabled` but the plan spec only called them out implicitly. The `handleSave` call passes `form` directly to `update.mutateAsync(form)` — omitting these fields would silently send `false` every save even if user had them enabled.
- **Fix:** Added toggle buttons for both reminders fields inside LINE OA and SMS sections respectively.
- **Files modified:** NotificationsPage.tsx
- **Commit:** 245950d

### Pre-existing Issue (Out of Scope)

**TypeScript error: `Cannot find module './views/settings/PaymentPage'`**
- **In:** `src/App.tsx` line 36 — lazy import wired by Plan 02A routing setup
- **Status:** Pre-existing; will be resolved when Plan 02C creates `PaymentPage.tsx`
- **Action:** No change — out of scope for this plan

## Known Stubs

None — both pages wire live data from the API via React Query hooks. No hardcoded empty values or placeholder text that block the plan's goal.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes introduced. All API calls go to existing endpoints established in Phase 1.5-B.

## Self-Check: PASSED

- [x] `src/frontend/src/views/settings/OperatingHoursPage.tsx` exists
- [x] `src/frontend/src/views/settings/NotificationsPage.tsx` exists
- [x] `src/frontend/src/views/settings/index.ts` updated with both exports
- [x] Commit dddf8c5 exists (OperatingHoursPage)
- [x] Commit 245950d exists (NotificationsPage)
- [x] Commit debcaf9 exists (barrel exports)
- [x] `npx tsc --noEmit` — only pre-existing PaymentPage error; no errors in new files
