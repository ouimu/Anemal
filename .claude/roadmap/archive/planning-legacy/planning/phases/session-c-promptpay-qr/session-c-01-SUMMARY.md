---
phase: session-c
plan: "01"
subsystem: billing-pos
tags: [promptpay, qr, billing, payment]
dependency_graph:
  requires: [phase-1.5-d-payment-page, phase-1.5-b-settings-api]
  provides: [promptpay-qr-endpoint, two-step-qr-payment-flow]
  affects: [ClinicBilling.tsx, invoice.controller.ts, invoice.routes.ts]
tech_stack:
  added: [promptpay-qr, qrcode]
  patterns: [server-authoritative-amount, two-step-payment-flow, tenant-scoped-qr]
key_files:
  created:
    - src/backend/src/controllers/invoice.controller.ts (getPromptPayQr handler)
    - src/backend/tests/integration/promptpay-qr.test.ts
  modified:
    - src/backend/src/routes/invoice.routes.ts (GET /:id/promptpay-qr route)
    - src/frontend/src/views/clinic/ClinicBilling.tsx (two-step QR payment flow)
decisions:
  - "GET not POST for QR endpoint — QR generation is idempotent and amount is server-authoritative"
  - "Two-step UI flow: invoice create first, then QR display — avoids orphaned QR requests"
  - "AppError class fix applied — was missing proper constructor chain for HTTP error propagation"
  - "Loyalty points carry-through fix — points were not persisting across the payment confirmation step"
metrics:
  duration: "~2h"
  completed: "2026-06-12"
  tests_total: 220
  tests_passing: 219
  tests_failing: 1
---

# Session C Plan 01: PromptPay QR Summary

PromptPay QR endpoint implemented using `promptpay-qr` + `qrcode` packages; `GET /api/invoices/:id/promptpay-qr` returns server-side base64 PNG with amount sourced from `invoice.totalAmount`; `ClinicBilling.tsx` updated with real two-step QR payment flow.

## What Was Built

### Backend
- **`GET /api/invoices/:id/promptpay-qr`** — new endpoint in `invoice.routes.ts` + `invoice.controller.ts`
  - Reads `promptpayId` from `tenant_settings` (encrypted field, decrypted server-side)
  - Reads `totalAmount` from `invoices` table — amount is always server-authoritative
  - Returns `{ success: true, dataUrl: "data:image/png;base64,..." }`
  - 404 if invoice not found or belongs to different tenant
  - 422 if `promptpayId` not configured for the clinic
- Installed `promptpay-qr` (EMVCo PromptPay payload generator) and `qrcode` (PNG renderer)

### Frontend
- **`ClinicBilling.tsx`** updated with two-step QR payment flow:
  1. Staff selects PromptPay payment method → clicks "Generate QR"
  2. Invoice created server-side (or existing invoice used)
  3. `GET /api/invoices/:id/promptpay-qr` fetched — QR image displayed full-screen
  4. Staff confirms payment → invoice status updated to `paid`
- Loyalty points carry-through preserved across both steps

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| `GET` not `POST` for QR endpoint | QR generation is idempotent; amount is read from DB not body |
| Two-step flow (create then QR) | Prevents orphaned QR requests against non-existent invoices |
| Server-authoritative amount | Client cannot manipulate QR amount — prevents underpayment exploits |
| 422 on missing `promptpayId` | Distinct from 404 — tells client to configure payment settings, not that invoice is missing |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] AppError class missing proper HTTP error propagation**
- **Found during:** Task 1 (endpoint implementation)
- **Issue:** `AppError` constructor was not correctly setting `statusCode` on the error object, causing 500 responses instead of 404/422
- **Fix:** Corrected constructor chain so `statusCode` and `isOperational` are properly set
- **Files modified:** `src/backend/src/utils/AppError.ts`

**2. [Rule 1 - Bug] Loyalty points not carrying through payment confirmation step**
- **Found during:** Task 3 (ClinicBilling.tsx update)
- **Issue:** The two-step flow was resetting loyalty point state between QR display and payment confirm
- **Fix:** Preserved loyalty points state ref across both steps in the payment modal
- **Files modified:** `src/frontend/src/views/clinic/ClinicBilling.tsx`

## Test Results

| Suite | Tests | Status |
|-------|-------|--------|
| QR-01–QR-08 (unit) | 8 | Passing |
| Integration (promptpay-qr.test.ts) | 6 | Passing |
| **Total new** | **14** | **Passing** |
| TC-S010 (session timeout) | 1 | Failing (pre-existing) |
| **Grand total** | **220** | **219 passing** |

Note: TC-S010 failure is pre-existing from Phase 1.5-C — not introduced by Session C.

## Files Changed

| File | Change |
|------|--------|
| `src/backend/src/routes/invoice.routes.ts` | Added `GET /:id/promptpay-qr` route |
| `src/backend/src/controllers/invoice.controller.ts` | Added `getPromptPayQr` controller |
| `src/backend/src/utils/AppError.ts` | Fixed constructor chain (Rule 1 bug fix) |
| `src/backend/tests/integration/promptpay-qr.test.ts` | New test suite (14 tests) |
| `src/frontend/src/views/clinic/ClinicBilling.tsx` | Two-step QR payment flow + loyalty carry-through fix |
| `src/backend/package.json` | Added `promptpay-qr` + `qrcode` dependencies |
| `docs/index.html` | Session C complete, test count 220, next = Session D |
| `docs/functional_spec_detailed.html` | Added GET /api/invoices/:id/promptpay-qr endpoint doc |

## Self-Check: PASSED

- SUMMARY.md created at `.planning/phases/session-c-promptpay-qr/session-c-01-SUMMARY.md`
- `docs/index.html` updated: Session C marked done, test count 220, Session D next
- `docs/functional_spec_detailed.html` updated: new endpoint documented in FR-07
- STATE.md updated
