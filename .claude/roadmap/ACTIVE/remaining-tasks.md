# Remaining Tasks — Credential-Gated Work & Backlog
> Created: 2026-06-09 · Rewritten: 2026-07-09 (doc cleanup after Codex audit closeout)
> Everything shippable without external credentials is DONE — Phases 1–9, D-1–D-5, and
> Codex Audit Batches 1–5 are complete (835 backend + 143 frontend tests green).
> Completed session/phase task lists were removed from this file; see
> `.claude/roadmap/archive/`, `HistoryLog.md`, and git history for the record.
> Canonical module status: `.claude/specs/implementation-status-matrix.md`.

---

## Phase 10 — Payment Gateway & Subscription Billing *(was Session F — blocked on Omise API keys + SMTP)*
**Goal:** Real card payment + PromptPay via gateway, plus SaaS subscription billing.

| Task | Effort | Notes |
|------|--------|-------|
| Choose gateway (Omise for Thai market recommended) | Decision | Omise supports PromptPay natively |
| `services/payment.service.ts` — charge card, charge PromptPay source | High | Omise Node SDK |
| Webhook endpoint `POST /webhooks/omise` — verify signature, mark invoice paid | High | |
| SaaS subscription billing tables + cron | High | Separate migration needed; builds on Phase 8 plans/quotas |
| Trial expiry email notifications + `Tenant.trialEndsAt` write flow | Medium | Requires SMTP config; deferred per ADR-0003 D2 |

**Prerequisite:** Omise API keys + SMTP credentials.

---

## Phase 11 — LINE/SMS Real Dispatch *(was Session G — blocked on LINE + Twilio credentials)*
**Goal:** Wire the existing reminder worker to real LINE Messaging API + Twilio.

| Task | Effort | Notes |
|------|--------|-------|
| `services/line.service.ts` — `pushMessage(userId, text)` via LINE Messaging API | Medium | `LINE_CHANNEL_ACCESS_TOKEN` env var |
| `services/sms.service.ts` — `sendSms(phone, text)` via Twilio | Medium | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` |
| Update `workers/reminder.worker.ts` to call services | Low | Replace "mark sent" no-op |
| Store LINE userId on owner record | Medium | Migration + UI to capture during owner create/edit |
| Tests: mock LINE/Twilio SDK | Low | |

**Prerequisite:** LINE channel token + Twilio credentials.

---

## Pre-Launch Checklist (no session/credential prerequisite)

| Task | Effort | Notes |
|------|--------|-------|
| Re-run Doctor-clone `sourceRoleId` lineage check before real production launch | Low | See `docs/superpowers/specs/2026-07-05-appointment-doctor-list-design.md` DB-2 ruling. `sourceRoleId` only started being recorded by `cloneRole` from that fix forward — 0 suspects found on dev DB 2026-07-06, but must re-check once real tenants exist so no clinic's customized "Doctor" role silently loses lineage. |

---

## Backlog — RBAC / UX / QA

| Task | Effort | Notes |
|------|--------|-------|
| **T-5B-02** (backlog, deferred): retire the 4 legacy `role === 'admin'` string-comparison nav sites once the custom/multi-role Role Editor ships — `ClinicLayout.tsx:31`, `AdminLayout.tsx:54`, `useAuth.ts:97`/`:112`, `LoginView.tsx:31`. Server-side authorization is already role-agnostic (deny-by-default, permission-code based); this is UX routing only. (ADR-0007 D6a) | Low | Server-side deny-by-default already proven (Batch 3: 148 routes × 3 roles, zero gaps). |
| Seed-exactness test: assert seeded dev credentials/branch assignments match the documented set exactly, so test suites that mutate seed data (cf. `seedCredentialSmoke` flake, fixed 4e78e0b) are caught immediately | Low | Idea from 2026-07-09 QA walkthrough; optional. |
| Dev-DB hygiene: QA walkthrough fixture rows (`QA*` / `qa_walk_*`) left on dev DB 2026-07-09 | Low | Harmless; wipe on next `db:seed`. |
| Expose `heartRateBpm`/`respRateRpm`/`feedingStatus`/`medicationGiven` as *input* fields on the Log Care modal (`ClinicInpatient.tsx` `CareModal`) — backend `careSchema` already accepts all four, only `temperatureC`+`notes` are wired in the UI today. Deferred out of the Log Care/Vitals history-view branch (2026-07-11) as a separate, larger multi-field vitals form redesign. | Medium | Should-priority; backend needs no changes when this ships. |
| Resolve `DailyInpatientCare.performedBy` to a real staff name in the Care History view — currently shown as `Staff #<id>` (grill finding, 2026-07-11) since it's a bare `User.id` FK-less field, not a Doctor.id, and no existing endpoint both covers all staff and is gated at `inpatient.view`. Needs either a schema relation + join, or a new name-lookup endpoint scoped to `inpatient.view`. | Medium | @db-agent + @ba-agent to scope; not required for MVP history view. |
| Branch-level isolation on single-record hospitalization reads: `hospRepo.findById` (`GET /api/hospitalizations/:id`) scopes by `tenantId` only, not `branchId` — a tenant-wide `inpatient.view` holder can fetch any branch's record by ID even if UI normally restricts them to one branch. Pre-existing (also affects `EditModal`/`AdmitModal`, not new to the Care History view). Grill finding, 2026-07-11. | Medium | Cross-cutting; scope separately from any single feature branch. |
| Discharged-admission care history is unreachable today: Inpatient Board only queries `GET /api/hospitalizations/active` (`status: 'admitted'`), so a discharged hospitalization's `CageCard` — and the new Care History button on it — never renders (ADR-0011, grill finding, 2026-07-11). Needs a home on the Pet Profile Medical tab (Item 2 of the 2026-07 bugfix pipeline), sourced from the pet's EMR/hospitalization history rather than the live board. | Medium | Design as part of Item 2, not a standalone task — Item 2 already needs to solve "how does Medical tab source historical clinical data." |

---

## Priority Order
1. **Phase 10** — Payment gateway + SaaS billing (needs Omise + SMTP)
2. **Phase 11** — LINE/SMS dispatch (needs LINE + Twilio)
3. Pre-launch checklist + backlog items opportunistically
