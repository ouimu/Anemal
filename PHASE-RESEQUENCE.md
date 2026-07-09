# Phase Re-sequence & Worklist — Master Plan
> **HISTORICAL (2026-07-09):** the resequence described here was executed in full — Phases 1–9
> and the Codex audit remediation are complete; only credential-gated Phases 10–11 remain.
> This file stays as the authoritative old→new phase-number map and the rationale for the
> stable `phase5`/`5-x`/`T-5x` identifiers. Current status: CLAUDE.md → Phases table and
> `.claude/specs/implementation-status-matrix.md`. "Do next" sections below are stale.
>
> Produced 2026-06-13 by @ba-agent (validation) + @pm-agent (sequencing) + @qa-agent (conflict review).
> Supersedes the priority order in `.claude/roadmap/remaining-tasks.md` (that file is read-only this session; sub-task IDs there remain authoritative).
> **Change requested:** postpone Payment Gateway (Session F) and LINE/SMS (Session G); make the redesign track the priority; full clean resequence of phase numbers.

---

## 1. Re-sequenced Phase Map (full clean resequence)

Phases are now a single linear **1–10** execution order. The **redesign track (Phase 7 + Phase 8) is the active priority.** Credential-gated work is postponed to the end.

| New # | Phase | Was | Status | Notes |
|------|-------|-----|--------|-------|
| 1 | Foundation & Security | 1 | ✅ Complete (74) | — |
| 2 | Core Clinic Operations | 2 | ✅ Complete (104) | Pet/Owner, Appointments, EMR |
| 3 | Commercial — Inventory & Billing/POS | 3 | ✅ Complete (131) | — |
| 4 | Advanced Modules | 4 | ✅ Complete (155) | Hospitalization, Grooming, Blood Bank, Loyalty, Audit |
| 5 | Settings & Configuration | **1.5** (A–D) | ✅ Complete (226) | Was a fractional phase; promoted to whole number |
| 6 | Production-readiness enhancements | **Sessions A–E** | ✅ Complete (226) | Screen specs, PDF receipts, PromptPay QR UI, barcode scan, S3 upload |
| **7** | **UI Redesign completion & sign-off** | design-alignment Ph.2 | **▶️ PRIORITY** | Compassionate Care closeout/verification of Appointments/Pets/EMR |
| **8** | **RBAC, Platform Console & Restructure** | **Phase 5** | **▶️ PRIORITY (📐 designed)** | SPEC-RBAC-PLATFORM-01; two-plane authz, configurable roles, plan quotas, IA cleanup |
| 9 | Payment Gateway & Subscription Billing | **Session F** | ⏸ Postponed | Omise/Stripe + webhooks + SaaS billing + cron — needs Omise + SMTP |
| 10 | LINE/SMS Real Dispatch | **Session G** | ⏸ Postponed | Wire reminder worker to LINE + Twilio — needs LINE + Twilio |
| 11 | **i18n Rollout — full clinic-screen Thai (EN/TH)** | new (2026-06-13) | 📋 Planned | Foundation shipped (i18n framework, app-shell strings, Noto Sans Thai, theme+language cross-device sync); this phase extends EN/TH coverage to **all clinic screens** |

**Old → New:** `1→1` · `2→2` · `3→3` · `4→4` · `1.5→5` · `A–E→6` · `(UI redesign)→7` · `RBAC Phase 5→8` · `F→9` · `G→10`.

**Stable identifiers — deliberately NOT renamed** (renaming would break cross-references + git history): spec ID `SPEC-RBAC-PLATFORM-01`, file `phase5-rbac-platform-tasks.md`, sub-task IDs `5-A…5-G` / `T-5x-nn`. Only the top-level *phase number* changed (Phase 5 → Phase 8).

---

## 2. Active Priority Track (do next)

### Phase 7 — UI Redesign completion & sign-off  ·  @uiux-agent → @qa-agent
**Finding:** the three target screens (`ClinicAppointments.tsx`, `ClinicPets.tsx`, `ClinicEMR.tsx`) already use Compassionate Care tokens (zero `brand-*` refs) and the `MaterialIcon` wrapper, so this is **verification + sign-off**, not a rebuild.

| Task | Agent | AC |
|---|---|---|
| Verify P2-05/06/07 against `.claude/specs/screen-specs/03/04/05` and the Stitch prototypes | @uiux-agent | No `brand-*`/raw hex; Material Symbols only; renders at 768px + 1024px |
| Touch-target audit (≥44×44px) on the three screens | @qa-agent | All interactive elements pass |
| Stamp design-alignment-plan.md Phase 2 **COMPLETE** | @pm-agent | Section header marked done with date |

> **Constraint (QA):** Phase 7 is presentational only. **Do NOT** change routing, nav, or IA here — that belongs to Phase 8-E. This prevents rework when the route tree splits into three shells.

### Phase 8 — RBAC, Platform Console & Restructure  ·  see `phase5-rbac-platform-tasks.md`
Run order unchanged (sub-task IDs keep the `5-x` prefix):
`8-A` (5-A RBAC schema/seed/cache/middleware) → `8-B` (5-B: **T-5B-00 regression guard FIRST**, then enforce per route) → `8-C/8-D` (5-C/5-D platform plane + Console + plans/quotas) → `8-E/8-F` (5-E/5-F shells, guards, role editor, console UI) → `8-G` (5-G matrix/plane tests + cleanup + docs).

### Phase 11 — i18n Rollout (full clinic-screen Thai)  ·  @uiux-agent + @dev-agent → @qa-agent
**Status:** 📋 Planned (added 2026-06-13). **Foundation already shipped** with the profile-menu feature: dependency-free i18n module (`src/i18n`, `useT()`), EN/TH dictionaries for the app shell (TopNav, sidebar nav, profile popup, Preferences), Noto Sans Thai webfont, and `theme`+`language` cross-device sync via `/api/settings/personal`. This phase extends EN/TH coverage to **all clinic-facing screens**.

| Task | Agent | Acceptance criteria |
|---|---|---|
| Extract hardcoded EN strings from clinic views (Dashboard, Appointments, Pets, EMR, Inventory, Billing, Inpatient, Grooming) into `en` dict with dotted keys | @dev-agent | No user-visible literal strings left in those views; keys grouped by screen |
| Author Thai (`th`) translations for every new key | @uiux-agent (reviewer: Thai speaker) | Native-quality Thai; terms consistent with clinic domain glossary |
| Replace literals with `t('…')` in each view | @dev-agent | Switching language live re-renders all 8 clinic screens with no missing/▯ glyphs |
| Verify Thai rendering + layout (no overflow/truncation) at 768px & 1024px | @qa-agent | Renders correctly both widths in light **and** dark |
| Extend to admin + settings screens (stretch) | @dev-agent | Same AC, admin/settings views |

> **Sequencing note:** independent of Phase 8 (no routing/permission coupling). Can run **alongside the Phase 7 redesign track** (both are presentational), or be scheduled after Phase 8. Recommend pairing with Phase 7 so screens are verified once.

---

## 3. Postponed (credential-gated — do last)

| Phase | Was | Blocked on | Why postponed |
|---|---|---|---|
| 9 — Payment Gateway & Subscription Billing | Session F | Omise API keys + SMTP | Highest complexity; **should follow Phase 8** so SaaS billing builds on the plan/quota model |
| 10 — LINE/SMS Real Dispatch | Session G | LINE channel token + Twilio SID/Auth | Pure external-credential dependency; settings prerequisites already done in Phase 5 |

---

## 4. QA Validation — does the re-sequence cause conflicts or bugs?

**Verdict: No code, schema, or test conflicts.** This is a documentation-level resequence; it changes ordering and labels, not runtime behavior.

1. **No dependency inversion.** Phase 9 (Payment Gateway) carries *SaaS subscription billing*; Phase 8 introduces `plans` + `tenant_quotas` + Platform Console plan management. Placing Payment Gateway **after** Phase 8 is *correct* — billing should build on the plan/quota model. The reorder **fixes** a latent ordering issue (Session F previously could precede the platform plane). ✅
2. **Phase 10 (LINE/SMS)** depends only on Phase 5 Settings (Notifications page + tokens), already complete. No dependency on Phase 7/8 — safe last. ✅
3. **`superadmin` interim role** (added in Phase 5) is migrated to `platform_users` by Phase 8 **T-5C-03** — already planned, not a new conflict. ⚠️ Avoid new `superadmin`-coupled features before Phase 8.
4. **Test-count continuity (226) preserved.** Phase 8-B mandates **T-5B-00** (regression guard FIRST) locking endpoint access before enforcement. ✅
5. **Phase 7 ↔ Phase 8 nuance.** 8-E reorganizes the route tree into three shells. Constraint: keep Phase 7 presentational only; routing/IA changes belong to 8-E → no rework. ✅
6. **Reference-integrity (only real risk).** "Phase 5" labels exist across docs/skills/`.planning`. Mitigation: keep stable identifiers + carry the old→new map in CLAUDE.md, docs, and here. **No mass file renames this round.** Residual risk: LOW. ⚠️

**Also fixed during this change (pre-existing tracker drift):** CLAUDE.md + session-summary.md said Phase 1.5 was "🔴 in progress · next 1.5-D"; `docs/` + `.planning/` confirm it is **complete (226 tests)**. Corrected to ✅ as Phase 5.
