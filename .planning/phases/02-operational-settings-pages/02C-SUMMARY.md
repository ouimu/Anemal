---
phase: 2
plan: 02C
subsystem: frontend-settings
tags: [payment, promptpay, qr-upload, gbprimepay, settings-ui]
dependency_graph:
  requires: [02A-PLAN.md]
  provides: [PaymentPage, payment-barrel-export]
  affects: [src/frontend/src/views/settings/]
tech_stack:
  added: []
  patterns: [FileReader-drag-drop, useMutation-PUT, form-validation, sticky-save-bar]
key_files:
  created:
    - src/frontend/src/views/settings/PaymentPage.tsx
  modified:
    - src/frontend/src/views/settings/index.ts
decisions:
  - "GB PrimePay fields are disabled + readOnly stubs with Phase 4 badge; backend Zod validates if submitted via DevTools"
  - "QR preview uses w-40 h-40 square (160x160) with object-contain for correct QR display"
  - "500KB guard applied in both handleQrChange and handleQrDrop per T-02C-03 mitigation"
metrics:
  duration: "~10 minutes"
  completed: "2026-06-11"
  tasks_completed: 2
  files_created: 1
  files_modified: 1
---

# Phase 2 Plan 02C: Payment Settings Page Summary

**One-liner:** Payment settings page with PromptPay ID input, QR drag-and-drop upload with preview, and disabled GB PrimePay placeholder section wired to PUT /api/v1/settings/clinic/payment.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Create PaymentPage.tsx | 32cd13b | src/frontend/src/views/settings/PaymentPage.tsx |
| 2 | Add PaymentPage barrel export | c4e68cb | src/frontend/src/views/settings/index.ts |

## What Was Built

### PaymentPage.tsx
- Three-section layout within `max-w-2xl` container (UX-03)
- **PromptPay section:** text input with client-side validation — 10 digits (phone) or 13 digits (tax ID); inline error display (PAYMENT-01)
- **PromptPay QR Image section:** drag-and-drop zone using FileReader pattern copied from ClinicProfilePage; 500KB size guard in both `handleQrChange` and `handleQrDrop`; square 160x160 preview renders below the drop zone when `form.paymentQrUrl` is set (PAYMENT-02)
- **GB PrimePay section:** `opacity-60`, both inputs `disabled` + `readOnly`, "Phase 4 — Not yet active" badge visible (PAYMENT-03)
- Save handler calls `useUpdatePayment().mutateAsync(...)` with success banner (2500ms auto-dismiss) and error banner
- Sticky save bar with last-updated timestamp and "by you" attribution matching ClinicProfilePage pattern

### index.ts
- `export { default as PaymentPage }` added as fourth export; existing exports unchanged

## Deviations from Plan

None — plan executed exactly as written.

## Threat Model Coverage

| Threat ID | Mitigation Applied |
|-----------|--------------------|
| T-02C-03 | 500KB guard present in both `handleQrChange` and `handleQrDrop` |
| T-02C-01 | GB PrimePay inputs are `disabled` + `readOnly`; backend Zod/encryption is the authoritative gate |
| T-02C-02 | QR images ≤ 500KB; no PHI/PII involved — accepted |

## Known Stubs

None. All three sections are wired to real data or intentionally disabled (GB PrimePay is a Phase 4 placeholder by design).

## Self-Check: PASSED

- [x] `src/frontend/src/views/settings/PaymentPage.tsx` exists
- [x] `src/frontend/src/views/settings/index.ts` contains `export { default as PaymentPage }`
- [x] Commits 32cd13b and c4e68cb exist in git log
- [x] `npx tsc --noEmit` exits 0 (verified after both tasks)
- [x] No raw hex colors, no emoji in JSX, no `any` types
- [x] All interactive elements have `min-h-[44px]`
