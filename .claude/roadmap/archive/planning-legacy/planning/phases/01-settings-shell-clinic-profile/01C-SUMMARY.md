---
phase: 1
plan: 01C
subsystem: frontend/settings
tags: [logo-upload, drag-and-drop, FileReader, touch-targets, responsive]
dependency_graph:
  requires: [01A, 01B]
  provides: [ClinicProfilePage-logo-upload]
  affects: [src/frontend/src/views/settings/ClinicProfilePage.tsx]
tech_stack:
  added: []
  patterns: [FileReader.readAsDataURL, drag-and-drop, useRef hidden input]
key_files:
  modified:
    - src/frontend/src/views/settings/ClinicProfilePage.tsx
decisions:
  - "Drop zone uses flex-1 min-h-[44px] so it expands to fill width while meeting touch target requirement"
  - "isDragging state toggles border-primary + bg-surface-container-low visual feedback on drag-over"
  - "500KB guard fires before FileReader is invoked — avoids reading oversized data into memory"
metrics:
  duration: ~8 minutes
  completed: 2026-06-11
  tasks_completed: 1
  tasks_total: 2
  files_modified: 1
---

# Phase 1 Plan 01C: Logo Upload Zone Summary

## One-Liner

Drag-and-drop + click-to-upload logo zone with FileReader data-URL preview and 500KB inline guard added to ClinicProfilePage.

## What Was Built

**Task 1 (feat cb9e8e2):** Extended `ClinicProfilePage.tsx` with a full logo upload section:

- `useRef<HTMLInputElement>` (`fileRef`) wired to a hidden `<input type="file" accept="image/*">`
- `isDragging` state drives conditional Tailwind classes: `border-primary bg-surface-container-low` on drag-over vs `border-outline-variant hover:border-primary` at rest
- `handleLogoChange` — file input `onChange`: 500KB guard → FileReader.readAsDataURL → `setForm({ logoUrl })`
- `handleDrop` — drop event: image MIME check → 500KB guard → FileReader.readAsDataURL → `setForm({ logoUrl })`
- Drop zone div: `flex-1 min-h-[44px]` — satisfies UX-02 touch target rule
- Preview area: 80×80px rounded container renders `<img src={form.logoUrl}>` when set, `MaterialIcon add_photo_alternate` when empty
- `errors.logoUrl` renders inline `"Logo must be under 500KB"` text below the section
- Replaced read-only placeholder paragraph from Plan 01B with fully functional upload zone
- `npx tsc --noEmit` exits 0 — no type errors

## Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add logo upload zone to ClinicProfilePage | cb9e8e2 | src/frontend/src/views/settings/ClinicProfilePage.tsx |
| 2 | checkpoint:human-verify | — | Awaiting human verification |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — logo upload is fully wired. The `logoUrl` data-URL is included in the form payload sent to `PUT /api/v1/settings/clinic`. No placeholder text or empty fallback remains for the upload zone.

## Threat Surface Scan

No new threat surface beyond what was declared in the plan's `<threat_model>`:
- T-01C-01 mitigated: `file.size > 500_000` guard present in both `handleLogoChange` and `handleDrop`
- T-01C-02 accepted: `<img src=data-URL>` browser sandboxing applies
- T-01C-03 accepted: logoUrl is not a secret; stored plaintext as designed

## Self-Check: PASSED

- [x] `src/frontend/src/views/settings/ClinicProfilePage.tsx` exists and contains `onDragOver`, `handleLogoChange`, `handleDrop`, `fileRef`, `isDragging`
- [x] Commit cb9e8e2 exists
- [x] `npx tsc --noEmit` exits 0
- [x] No file deletions in commit
