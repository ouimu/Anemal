---
phase: 1
plan: 01B
subsystem: frontend-settings
tags: [settings, clinic-profile, react-query, form-validation, tanstack-v5]
dependency_graph:
  requires: [01A — SettingsLayout + /settings route]
  provides: [useClinicSettings hook, useUpdateClinicProfile hook, ClinicProfilePage, settings barrel]
  affects: [App.tsx (lazy import now resolves), /settings/clinic-profile route]
tech_stack:
  added: []
  patterns: [TanStack Query v5 useQuery + useMutation, useEffect form init from query data, client-side validation before mutateAsync]
key_files:
  created:
    - src/frontend/src/hooks/useClinicSettings.ts
    - src/frontend/src/views/settings/ClinicProfilePage.tsx
    - src/frontend/src/views/settings/index.ts
  modified: []
decisions:
  - "Logo field rendered as read-only text in this plan; upload (Plan 01C) will replace it"
  - "LAYOUT-03 partial: footer shows 'by you' when updatedBy === userId; name resolution for other editors deferred to Phase 2 (API returns userId only)"
  - "No onError callback in useMutation (removed in TanStack Query v5); errors surfaced via update.error in component"
metrics:
  duration_minutes: 12
  completed_date: "2026-06-11T04:30:00Z"
  tasks_completed: 2
  files_changed: 3
---

# Phase 1 Plan 01B: useClinicSettings Hook + ClinicProfilePage Summary

**One-liner:** TanStack Query v5 hook pair (useClinicSettings + useUpdateClinicProfile) wired to GET/PUT /api/v1/settings/clinic, plus a fully validated ClinicProfilePage form with sticky save bar and last-updated footer.

## What Was Built

- `useClinicSettings.ts` — exports `ClinicSettingsData` interface, `ClinicProfileInput` interface, `useClinicSettings()` (queryKey `['settings', 'clinic']`), and `useUpdateClinicProfile()` (invalidates on success). TanStack Query v5 patterns throughout: no `onError` callback, no `isLoading` on mutations.
- `ClinicProfilePage.tsx` — full-page settings form with 6 editable fields (name, phone, email, address, taxId, website) + read-only logoUrl stub. Initializes from `data.tenant.name` + root fields via `useEffect`. Client-side validation fires before `mutateAsync` (empty name, invalid URL). `isPending` disables Save button. 2500ms success banner. Sticky footer with Thai-locale last-updated date and "by you" when `updatedBy === userId`.
- `settings/index.ts` — barrel re-export: `export { default as ClinicProfilePage }`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create useClinicSettings hook | 138f527 | src/frontend/src/hooks/useClinicSettings.ts (new) |
| 2 | Create ClinicProfilePage.tsx + index.ts | 9357bfc | src/frontend/src/views/settings/ClinicProfilePage.tsx (new), src/frontend/src/views/settings/index.ts (new) |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

- `logoUrl` field in `ClinicProfilePage` is read-only text ("Logo upload available in next update"). Plan 01C will replace this with a file input + data-URL preview + 500KB client-side guard (T-01B-01 mitigation).

## Threat Flags

None — no new network endpoints introduced. All data access goes through existing `/api/v1/settings/clinic` routes protected by `adminOnly` RBAC middleware. `ClinicProfileInput` interface limits PUT body to exactly 7 allowed fields (T-01B-02 mitigated by TypeScript strict typing).

## Self-Check: PASSED

- `src/frontend/src/hooks/useClinicSettings.ts` exists: FOUND
- `src/frontend/src/views/settings/ClinicProfilePage.tsx` exists: FOUND
- `src/frontend/src/views/settings/index.ts` exists: FOUND
- Commit 138f527 exists: FOUND
- Commit 9357bfc exists: FOUND
- `npx tsc --noEmit` output: empty (0 errors)
