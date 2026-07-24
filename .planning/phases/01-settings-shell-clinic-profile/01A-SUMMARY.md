---
phase: 1
plan: 01A
subsystem: frontend-layout
tags: [settings, layout, routing, role-filtering, sidebar]
dependency_graph:
  requires: []
  provides: [SettingsLayout, /settings route tree]
  affects: [App.tsx, all /settings/* child plans]
tech_stack:
  added: []
  patterns: [role-filtered nav array, useEffect auto-collapse, lazy route registration]
key_files:
  created:
    - src/frontend/src/layouts/SettingsLayout.tsx
  modified:
    - src/frontend/src/App.tsx
decisions:
  - "SettingsLayout has no hard role redirect — filtering is done on the ALL_NAV array via roles.includes(role ?? '')"
  - "Sidebar auto-collapse uses window.innerWidth < 768 on mount (no resize observer) to satisfy LAYOUT-04"
  - "ClinicProfilePage lazy import registered now; missing file is acceptable until Plan 01B creates it"
metrics:
  duration_minutes: 10
  completed_date: "2026-06-11T04:25:45Z"
  tasks_completed: 2
  files_changed: 2
---

# Phase 1 Plan 01A: Settings Shell Layout Summary

**One-liner:** Role-filtered SettingsLayout sidebar with /settings route tree — admin sees 6 items, doctor/staff sees 1, superadmin sees 1.

## What Was Built

- `SettingsLayout.tsx` — new standalone layout for `/settings/*` that mirrors `ClinicLayout.tsx` structure (same aside/TopNav/main/footer/navClass) with a role-filtered ALL_NAV array (7 entries) and a mount-time auto-collapse useEffect for 768px viewports.
- `App.tsx` — added eager `SettingsLayout` import, lazy `ClinicProfilePage` import (Settings pages group), and `/settings` route block with `ProtectedRoute`, index redirect to `/settings/clinic-profile`, and child `clinic-profile` route.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create SettingsLayout.tsx | f7ba646 | src/frontend/src/layouts/SettingsLayout.tsx (new) |
| 2 | Register /settings route in App.tsx | 3a472f9 | src/frontend/src/App.tsx |

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `npx tsc --noEmit` exits 0 (filtering out expected missing ClinicProfilePage until Plan 01B)
- No raw hex colors, no emoji, no `any` types in SettingsLayout.tsx
- ALL_NAV contains exactly 7 items with `roles` field on each
- `useEffect` auto-collapse present: `if (window.innerWidth < 768 && sidebarOpen) toggleSidebar()`
- `/settings` route registered with ProtectedRoute + SettingsLayout
- Index redirect to `/settings/clinic-profile` present

## Known Stubs

- `ClinicProfilePage` lazy import in App.tsx points to a not-yet-created file (`views/settings/ClinicProfilePage`). Navigation to `/settings/clinic-profile` will fail until Plan 01B creates this component. This is intentional and tracked.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes introduced. Role filtering is frontend UX only; backend RBAC enforces authorization on all `/api/v1/settings/*` endpoints.

## Self-Check: PASSED

- `src/frontend/src/layouts/SettingsLayout.tsx` exists: FOUND
- `src/frontend/src/App.tsx` contains `path="/settings"`: FOUND
- Commit f7ba646 exists: FOUND
- Commit 3a472f9 exists: FOUND
