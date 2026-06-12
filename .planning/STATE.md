---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: unknown
last_updated: "2026-06-12T00:00:00.000Z"
---

# Project State — Session C Complete · Session D Next

## Current Status

**Active milestone:** Session D — Barcode Scanning (ZXing) + EMR drug-search wiring  
**Initialized:** 2026-06-10  
**Last Activity:** 2026-06-12  
**Last Session:** Session C — PromptPay QR (COMPLETE)

## Phase Progress

| Phase | Status | Notes |
|-------|--------|-------|
| 1 — Settings Shell + Clinic Profile | ✅ Complete | 01A ✅ 01B ✅ 01C ✅ |
| 2 — Operational Settings Pages | ✅ Complete | 02A ✅ 02B ✅ 02C ✅ |
| 3 — Integrations, System Admin + QA | ✅ Complete | Phase 1.5 fully done 2026-06-11 |
| Session C — PromptPay QR | ✅ Complete | 220 tests (219 passing); GET /api/invoices/:id/promptpay-qr live |
| Session D — Barcode Scanning | 🟡 Next | @zxing/browser, BarcodeScanner.tsx, EMR drug-search |

## Decisions Log

| Date | Decision | Why |
|------|----------|-----|
| 2026-06-10 | Initialize GSD planning for 1.5 frontend | Backend (1.5-A/B) complete; need structured plan for UI phases |
| 2026-06-11 | /settings as standalone top-level route (not /clinic or /admin) | Both layouts hard-redirect wrong roles; role filtering in NAV array |
| 2026-06-11 | LAYOUT-03 "by [name]" deferred to Phase 2 | API returns userId only; name resolution requires backend change |
| 2026-06-11 | Sidebar auto-collapse on mount when window.innerWidth < 768 | Satisfies LAYOUT-04 without requiring a resize observer |
| 2026-06-11 | SettingsLayout has no hard redirect; role filter on ALL_NAV array only | All roles can access /settings; backend RBAC is the authoritative gate |
| 2026-06-11 | Logo field read-only in 01B; upload deferred to 01C | T-01B-01 mitigation: 500KB guard + data-URL preview belongs in logo upload plan |
| 2026-06-11 | No onError in useMutation — TanStack Query v5 removed it | Errors surfaced via update.error in component; catch block silences unhandled rejection |
| 2026-06-11 | Drop zone uses flex-1 min-h-[44px] not fixed w-20 h-20 | Allows drop zone to expand to available width while still meeting UX-02 44px touch target |

## Blockers

None.

## Session C — Key Decisions

| Date | Decision | Why |
|------|----------|-----|
| 2026-06-12 | GET not POST for /promptpay-qr | QR is idempotent; amount server-authoritative — prevents client amount manipulation |
| 2026-06-12 | Two-step UI flow (create invoice → show QR → confirm) | Prevents orphaned QR requests; matches real-world cashier UX |
| 2026-06-12 | 422 on missing promptpayId (not 404) | Clear distinction: invoice exists but clinic not configured for PromptPay |
| 2026-06-12 | AppError constructor fix applied (Rule 1) | statusCode was not propagating correctly → all errors were returning 500 |
| 2026-06-12 | Loyalty points carry-through fix (Rule 1) | Points state was resetting between QR display and payment confirm steps |

## Next Action

Session C complete (2026-06-12). Execute Session D — Barcode Scanning (ZXing) + EMR drug-search wiring. No credentials required.

```
/gsd:execute-phase session-d
```

---
*State initialized: 2026-06-10*
