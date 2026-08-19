---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: unknown
last_updated: "2026-06-12T00:00:00.000Z"
---

# Project State — Phases 1–6 Complete · Phase 7 (UI redesign) Next

> Backlog re-sequenced 2026-06-13 (full clean resequence → linear Phase 1–11). Redesign track (7+8) prioritized; i18n Rollout = Phase 9 (credential-free); Payment Gateway + LINE/SMS postponed to Phase 10–11. Map + QA validation: `../PHASE-RESEQUENCE.md`.

## Current Status

**Active milestone:** Phase 7 — UI Redesign completion & sign-off (then Phase 8 — RBAC/Platform)  
**Initialized:** 2026-06-10  
**Last Activity:** 2026-06-13  
**Last completed:** Phase 6 (enhancements A–E) — S3 Photo Upload · 226 tests

## Phase Progress *(new numbering · old label in notes)*

| Phase | Status | Notes |
|-------|--------|-------|
| 5 — Settings & Configuration | ✅ Complete | was 1.5; GSD Phases 1–3 (Shell/Profile, Operational, Integrations+SysAdmin+QA); fully done 2026-06-11 |
| 6 — Production-readiness enhancements | ✅ Complete | was Sessions A–E (screen specs, PDF, PromptPay QR, barcode, S3); 226 tests |
| **7 — UI Redesign completion & sign-off** | ▶️ Priority | verify Appointments/Pets/EMR vs Compassionate Care specs (presentational only) |
| **8 — RBAC, Platform Console & Restructure** | ▶️ Priority | was Phase 5; SPEC-RBAC-PLATFORM-01; sub-tasks 5-A…5-G |
| 9 — i18n Rollout | 📋 Planned | full clinic-screen Thai (EN/TH); extends i18n foundation (module, app-shell, Noto Sans Thai, cross-device sync) to all clinic screens; credential-free; depends on Phase 8 RBAC permission catalogue + tenant_settings.default_locale |
| 10 — Payment Gateway & Subscription Billing | ⏸ Postponed | was Session F; needs Omise + SMTP |
| 11 — LINE/SMS Real Dispatch | ⏸ Postponed | was Session G; needs LINE + Twilio |

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

## Session E — Key Decisions

| Date | Decision | Why |
|------|----------|-----|
| 2026-06-12 | Lazy S3 client (no singleton) | Avoids startup crash when AWS env vars are blank |
| 2026-06-12 | Skeleton implementation with jest mocks | AWS credentials not available; tests pass without real S3 |
| 2026-06-12 | Key prefix `tenants/{tenantId}/pets/` | Multi-tenant isolation enforced at storage layer |
| 2026-06-12 | 503 STORAGE_NOT_CONFIGURED on missing vars | Clear operator error vs. runtime error distinction |
| 2026-06-12 | `URL.createObjectURL` for preview (not FileReader) | Simpler, synchronous, no memory leak concern with revoke |

## Next Action

Phases 1–6 complete. **Priority: Phase 7 — UI Redesign sign-off** (verify Appointments/Pets/EMR; presentational only — no routing/IA changes), then **Phase 8 — RBAC/Platform** (start sub-task 5-A; write T-5B-00 regression guard first). **Next (credential-free): Phase 9 — i18n Rollout** (full clinic-screen Thai; extends existing i18n foundation). Phase 10 (Payment Gateway) and Phase 11 (LINE/SMS) postponed until credentials available.

```
/gsd:execute-phase 05-rbac-platform-restructure   # Phase 8 (sub-tasks keep 5-x IDs)
```

---
*State initialized: 2026-06-10*

---

## Phase 8 queued — RBAC + Platform Console (was "Phase 5"; designed 2026-06-13 by @ba-agent)

RBAC + Platform Console + structure restructure designed and documented (no code yet, per scope
decision D3). Artefacts: spec `SPEC-RBAC-PLATFORM-01`, tasks `phase5-rbac-platform-tasks.md`,
skills `anemal-rbac-matrix` / `anemal-platform-console` / `anemal-ba-toolkit`, agent `@ba-agent`,
GSD phase `05-rbac-platform-restructure`. Ready for Claude Code to implement.

| Decision | Choice |
|---|---|
| SuperAdmin placement | Separate Platform Console (`/platform/*`) |
| RBAC granularity | Configurable roles per clinic (system roles seeded + clone/customize) |
| This round scope | Plan + docs + BA agent + skills only |
