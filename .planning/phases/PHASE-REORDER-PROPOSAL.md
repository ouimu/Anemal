# Phase Reorder Proposal — Move i18n (Phase 11) to Phase 9

**Author:** @pm-agent  
**Date:** 2026-06-14  
**Status:** PROPOSAL — awaiting approval; no files modified  
**Trigger:** User request to resequence Phase 11 (i18n Rollout) to immediately follow Phase 8 (RBAC + Platform Console), with existing Phases 9 and 10 shifting to 10 and 11.

---

## 1. Proposed New Phase Sequence

| Phase | Focus | Status | Notes |
|-------|-------|--------|-------|
| 1 | Foundation — multi-tenancy, auth, RBAC, base layout | ✅ Complete (74 tests) | unchanged |
| 2 | Core clinic ops — Pet/Owner, Appointments, EMR | ✅ Complete (104 tests) | unchanged |
| 3 | Commercial — Inventory, POS/Billing | ✅ Complete (131 tests) | unchanged |
| 4 | Advanced — Hospitalization, Grooming, Blood Bank, Loyalty, Audit | ✅ Complete (155 tests) | unchanged |
| 5 | Settings & Configuration — profile, hours, notifications, payment, integrations, encryption | ✅ Complete (226 tests) | unchanged |
| 6 | Production-readiness enhancements — screen specs, PDF receipts, PromptPay QR UI, barcode scan, S3 upload | ✅ Complete (226 tests) | unchanged |
| 7 | UI Redesign completion & sign-off — Appointments, Pets, EMR Compassionate Care closeout | ✅ Complete (226 tests) | unchanged |
| 8 | RBAC, Platform Console & Restructure — two-plane authz, configurable roles, plan quotas, IA cleanup | ▶️ PRIORITY — next to build | unchanged; sub-task IDs 5-A…5-G / T-5x-nn remain stable |
| **9** | **i18n Rollout — full clinic-screen Thai (EN/TH); extends existing i18n foundation to all clinic screens** | **📋 Planned** | **was Phase 11; moved up** |
| **10** | **Payment Gateway & Subscription Billing — Omise/Stripe, webhooks, SaaS billing + cron** | **⏸ Postponed (needs Omise + SMTP)** | **was Phase 9; shifted down** |
| **11** | **LINE/SMS Real Dispatch — wire reminder worker to LINE + Twilio** | **⏸ Postponed (needs LINE + Twilio)** | **was Phase 10; shifted down** |

---

## 2. Rationale — Why i18n Belongs After Phase 8

### 2a. Role-aware language preferences require RBAC infrastructure

Phase 8 delivers the two-plane permission model (FR-14), the `roles`/`permissions`/`role_permissions` tables (T-5A-01), and the `requirePermission` middleware on every route. i18n user-preference storage (`language` field on the user record or a new `user_preferences.locale` column) sits in the clinic plane and is scoped to a `tenant_id`. Without Phase 8's RBAC schema in place:

- The `user_preferences` table (already seeded in Phase 5-B) does not yet have a `role_id` foreign key, meaning an i18n preference route cannot be guarded with `requirePermission('settings.locale')` — that permission code does not exist until Phase 8 seeds the catalogue (T-5A-03).
- Personal Preferences API (`PUT /api/v1/users/me/preferences`) is already implemented (Phase 5-B) but is currently guarded only by JWT auth, not by a granular permission. Phase 8's T-5B enforcement sweep (sub-phase 5-B) will add `requirePermission` to every existing route, including preferences. If i18n builds on top of the preferences API before that sweep, an additional enforcement pass would be required, creating double-touch risk.

Verdict: building i18n after Phase 8 means the preferences API is already permission-guarded and the permission code catalogue is stable. i18n simply registers one new entry (`settings.locale`) in the catalogue rather than creating it from scratch.

### 2b. Per-tenant locale configuration requires the Platform Console

Phase 8 introduces `tenant_quotas` (T-5C/T-5D) and the Platform Console domain APIs. One natural per-tenant configuration is a default locale (`tenant_settings.default_locale`). If a clinic's Platform Console record carries `default_locale = "th"`, the i18n module can fall back to that value when a user has no personal preference set. Without Phase 8, the Platform Console table structure does not exist and i18n would need its own ad-hoc per-tenant locale field — a duplication that would need to be collapsed later.

Verdict: building i18n after Phase 8 lets i18n read `tenant_settings.default_locale` from the already-existing Platform Console row, rather than inventing a parallel mechanism.

### 2c. i18n has no dependency on Omise, LINE, or Twilio credentials

Phases 10 and 11 (old 9 and 10) are postponed solely because they require external credentials unavailable at this time. i18n is entirely credential-free (translation JSON files + `i18next` library). Moving i18n earlier lets the team deliver real user-visible value (Thai language support) without being blocked by third-party credentials. This fits the existing project principle: credential-free work is never postponed unnecessarily.

### 2d. UX continuity — language setting belongs near the UI redesign track

Phase 7 completed the Compassionate Care UI sign-off. Immediately following with i18n (Phase 9, after RBAC in Phase 8) keeps the frontend-quality track coherent: design tokens → screen specs → UI sign-off → language coverage, before context switches to integration-heavy credential-gated work.

---

## 3. Impact Analysis — Dependencies Between Old Phase 11 and Phases 9/10

### Does i18n depend on Phase 9 (Payment Gateway, now Phase 10)?

No direct dependency. Payment Gateway work (Omise/Stripe webhooks, SaaS subscription billing, trial-expiry emails) is entirely backend-focused and touches `invoices`, `payments`, and billing tables. i18n touches translation JSON files and the `user_preferences` / `tenant_settings` tables. There is no shared data model or API surface.

One indirect concern: if the Payment Gateway introduces new UI screens (billing history, subscription management), those screens would eventually need Thai translations. However, in the proposed order Phase 10 (Payment Gateway) comes AFTER Phase 9 (i18n), so any new screens introduced by Phase 10 would be translated in a patch or Phase 9 extension — not a blocker.

### Does i18n depend on Phase 10 (LINE/SMS Dispatch, now Phase 11)?

No direct dependency. LINE/SMS dispatch is a backend worker concern (`reminder.worker.ts`, `line.service.ts`, `sms.service.ts`). i18n covers UI strings (React components) and, eventually, notification message templates. Notification template localisation is an extension of both i18n (Phase 9) and LINE/SMS (Phase 11) and belongs in Phase 11 as a joint deliverable — it does not need to block either phase.

### Does old Phase 11's foundation work create any ordering risk?

The task description states that i18n foundation is already shipped: i18n module, app-shell strings, Noto Sans Thai font, theme+language cross-device sync. This means Phase 9 (new number) begins with infrastructure in place and scope limited to clinic-screen translation coverage. There is no risk that the foundation work creates a Phase 8 conflict — it was delivered independently of RBAC.

### Could the shift create test count regressions?

No. i18n tests are translation-coverage unit tests and i18next initialisation tests. They do not overlap with RBAC permission-matrix tests (Phase 8) or payment webhook tests (Phase 10 / old 9). The 226-test baseline passes through the reorder unchanged.

### Summary verdict

The reorder introduces no hard dependency conflicts. The only soft coupling is that Phase 10's new UI screens will eventually need translations, but since Phase 9 (i18n) establishes the translation infrastructure and conventions first, Phase 10 simply consumes it — which is the correct direction.

---

## 4. Files That Will Need Updating When Approved

The following files must be updated in a single atomic commit (no code change, documentation-only):

| File | Change required |
|------|----------------|
| `CLAUDE.md` | Development Phases table: renumber rows 9→10, 10→11, old-11→9; update "Old → New phase map" note; update "Active priority" paragraph if it references old phase numbers |
| `.planning/ROADMAP.md` | Currently covers Phase 1.5 / Phase 5 structure. If a Phases 7–11 section is added later, it should use the new numbers. No immediate change needed unless the roadmap is extended. |
| `.planning/STATE.md` | Phase Progress table: insert new row for Phase 9 (i18n), renumber old 9→10 and 10→11 rows; update "Next Action" paragraph |
| `docs/index.html` | Phase status table and Upcoming Work section: reflect new numbering and i18n as Phase 9 |
| `docs/functional_spec_detailed.html` | Phase sequence note, if present; i18n section should reference Phase 9 |
| `HistoryLog.md` | Append an entry: `2026-06-14 — Phase reorder: i18n moved from Phase 11 to Phase 9; Phases 9/10 shifted to 10/11` |

---

## 5. Stable ID Note — What Does Not Change

| Item | Status |
|------|--------|
| Phase 8 sub-task IDs `5-A…5-G` and `T-5x-nn` | Unchanged — stable identifiers; do not renumber |
| File `.claude/roadmap/phase5-rbac-platform-tasks.md` | Unchanged — keep filename; the `5-` prefix is a logical ID, not the phase number |
| Spec ID `SPEC-RBAC-PLATFORM-01` | Unchanged |
| GSD phase folder `.planning/phases/05-rbac-platform-restructure/` | Unchanged |
| `remaining-tasks.md` references to Session F / Session G | Unchanged — these map to new Phases 10/11 but the file uses Session labels, not phase numbers |

The new Phase 9 (i18n) will require its own task file. Proposed path:

```
.claude/roadmap/phase9-i18n-rollout-tasks.md
```

Task IDs should follow the pattern `i18n-<nn>` (e.g. `i18n-01`, `i18n-02`) to avoid collision with the `5-x` / `T-5x` namespace used by Phase 8.

---

## 6. Recommendation

Approve the reorder. The rationale is strong on all three counts:

1. RBAC permission catalogue must exist before i18n preference routes can be correctly guarded (ordering dependency).
2. Platform Console tenant record provides the natural home for `default_locale` (schema dependency).
3. i18n is credential-free and can ship immediately after Phase 8 without external blockers (delivery risk).

The shift does not break any existing dependency chain, does not alter any stable ID, and does not change test behaviour. The only work required to make the reorder official is the documentation-only file update list in Section 4 above.

**Proposed next step:** If this proposal is approved, update the files in Section 4, then create `.claude/roadmap/phase9-i18n-rollout-tasks.md` as the task breakdown for the new Phase 9. Delegate the task breakdown to @pm-agent once Phase 8 is underway and the exact scope of i18n clinic-screen coverage is confirmed.
