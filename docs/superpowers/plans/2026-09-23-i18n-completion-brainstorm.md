# Brainstorm: i18n Completion — STEP 1

**Date:** 2026-09-23
**Author:** @pm-agent
**Lane:** A (new/changed user-visible behaviour — see rationale in §5)
**Status:** DRAFT — awaiting human approval before Step 2

---

## 0. Skills loaded

- `anemal-functional-reqs` (scope/priority reference — no dedicated i18n FR exists; treated as an NFR/UX-quality item, not a numbered FR)
- `anemal-screen-specs` (screen inventory / layout reference)
- `anemal-ba-toolkit` (structure for this doc)

---

## 1. Gap inventory (verified against current `main`, 2026-09-23)

Frontend i18n lives in `src/frontend/src/i18n/index.ts` — single file, 717 lines, Thai + English key/value maps, no per-namespace file split.

### 1.1 Confirmed from orchestrator background

| Screen | t() calls | Status |
|---|---|---|
| `views/admin/AdminAudit.tsx` | 0 | Fully hardcoded |
| `views/admin/AdminBranches.tsx` | 0 | Fully hardcoded |
| `views/clinic/ClinicGrooming.tsx` | 0 | Fully hardcoded |
| `views/clinic/ClinicInpatient.tsx` | 0 | Fully hardcoded |
| `views/clinic/ClinicEMR.tsx` | 7 | Partial (~10 hardcoded JSX lines) |
| `views/clinic/ClinicPets.tsx` | 51 | Partial (~30 hardcoded lines) |
| `views/clinic/ClinicDashboard.tsx` | 16 | Done |

Confirmed correct. No `grooming`/`inpatient` namespace exists in `i18n/index.ts` (verified by grep).

### 1.2 Full sweep — every view under `src/frontend/src/views/**` (excludes `*.test.tsx`, `__tests__/`)

t() call count per file, sorted ascending (0 = fully hardcoded):

**Zero t() calls (fully hardcoded) — 20 files:**

*Admin plane:*
- `admin/AdminAudit.tsx` (228 lines)
- `admin/AdminBloodBank.tsx` (363 lines)
- `admin/AdminBranches.tsx` (284 lines)
- `admin/AdminSettings.tsx` (1 line — thin re-export, negligible)
- `admin/AdminSubscription.tsx` (1 line — thin re-export, negligible)
- `admin/AdminUsage.tsx` (128 lines)
- `admin/ClinicSettingsTab.tsx` (92 lines)
- `admin/SubscriptionTab.tsx` (121 lines)

*Clinic plane:*
- `clinic/ClinicGrooming.tsx` (391 lines)
- `clinic/ClinicInpatient.tsx` (806 lines — largest untranslated file in the app)
- `clinic/ClinicRecordVaccination.tsx` (127 lines)
- `clinic/ClinicTransactions.tsx` (128 lines)
- `clinic/ClinicVaccinationsDue.tsx` (98 lines)

*Platform plane — ALL SIX platform views, 0 i18n import at all (not partial — the plane has never been touched):*
- `platform/CustomerDetailView.tsx` (439 lines)
- `platform/CustomerListView.tsx` (210 lines)
- `platform/PlatformAuditView.tsx` (186 lines)
- `platform/PlatformLoginView.tsx` (121 lines)
- `platform/PlatformPlansView.tsx` (328 lines)
- `platform/PlatformSettingsView.tsx` (244 lines)

*Settings (clinic plane, `/settings/*`):*
- `settings/IntegrationsPage.tsx` (197 lines)
- `settings/NotificationsPage.tsx` (258 lines)
- `settings/OperatingHoursPage.tsx` (183 lines)
- `settings/PaymentPage.tsx` (233 lines)
- `settings/StorageConnectingPage.tsx` (20 lines)
- `settings/StoragePage.tsx` (371 lines)

**Partial:**
- `clinic/RoleEditorView.tsx` — 2 t() calls
- `settings/ClinicProfilePage.tsx` — 6
- `clinic/ClinicEMR.tsx` — 7
- `admin/AdminDashboard.tsx` — 8
- `settings/PreferencesPage.tsx` — 12
- `clinic/ClinicAppointments.tsx` — 16
- `clinic/ClinicDashboard.tsx` — 16 (orchestrator called this "Done" — it has some coverage but is not saturated; treat as partial pending a line-level check, not blocking this scope decision)
- `views/LoginView.tsx` — 18
- `admin/UserManagementTab.tsx` — 19
- `clinic/ClinicInventory.tsx` — 23
- `clinic/ClinicBilling.tsx` — 38
- `clinic/ClinicPets.tsx` — 51

**Correction to background:** the true gap is far larger than the 4 screens named in the orchestrator brief. 20 view files (out of ~38 non-test views) have literally zero i18n coverage, including the entire Platform plane (6 files) and most of the Settings pages (6 files). The 4 named screens are real but are only the clinic-plane subset.

### 1.3 Archived WIP reference (`archive/stash-i18n-wip`, commit `fdc8213`, base `cdac267`)

`git diff cdac267 archive/stash-i18n-wip -- src/frontend/src/i18n/index.ts` = +601 lines, proposing key namespaces for `admin.audit.*`, `admin.bloodBank.*`, and (per background) `clinic.pets/emr/grooming/inpatient/dashboard`, `admin.branches.*`. Confirmed present: `admin.audit.*` (23 keys: colAction, colIP, colRecord, colTime, colUser, loadError, noRecords, page/next/previous, etc.) and `admin.bloodBank.*` (partial list confirmed: bagInventory, bloodType, colBag, colStatus, etc.).

**Usable as:** a starting vocabulary/naming-convention reference for key names and both-language strings. **Not usable as:** a patch — view-file hunks do not apply to main (heavy conflicts), and dashboard keys in the stash differ from main's current dashboard keys (do not merge/duplicate those). Also note: the stash predates the Platform plane entirely and has no `platform.*` keys — that gap has no reference material at all.

---

## 2. Scoping options

The full gap (20 zero-coverage files + 12 partial files, ~717 existing i18n lines potentially doubling) is too large for one branch per the CLAUDE.md scope guard ("all/entire/whole" → backlog first, one item per branch). Below are slicing strategies for THIS feature; everything not selected goes to §2.4 backlog.

### Option A — Clinic-plane completion only (the 4 zero-coverage clinic screens + 2 partials)
Scope: `ClinicGrooming`, `ClinicInpatient`, `ClinicEMR` (finish), `ClinicPets` (finish). Matches the orchestrator's original framing exactly.
- Must: ClinicGrooming, ClinicInpatient (zero coverage, clinic staff use daily)
- Should: ClinicEMR, ClinicPets (finish the partial ~10/~30 hardcoded lines)
- Could: n/a
- Pro: smallest, matches what was pre-verified, low risk, ships fast.
- Con: leaves Platform plane at 0% and Settings/Admin screens untouched — the "backlog" would immediately contain most of the app.

### Option B — Clinic-plane + Admin-plane completion (all clinic-plane zero/partial screens, defer Platform + Settings)
Scope: everything in Option A, plus `AdminAudit`, `AdminBranches`, `AdminBloodBank`, `AdminUsage`, `ClinicSettingsTab`, `SubscriptionTab`, `ClinicRecordVaccination`, `ClinicTransactions`, `ClinicVaccinationsDue`.
- Must: the 4 originally-scoped screens (Option A's Must)
- Should: AdminAudit, AdminBranches (reference material already exists in the WIP stash — lowest translation-authoring cost)
- Could: AdminBloodBank, AdminUsage, the two ClinicSettings/Subscription tabs, the three smaller clinic screens
- Pro: closes the whole clinic + admin console (tablet-facing, daily-use surface) in one push; reuses stash vocabulary for 2 of the 6 additions.
- Con: ~2x the size of Option A; still leaves Platform (6 files) and Settings (6 files) untranslated.

### Option C — Per-screen slicing (one screen or tight cluster per branch, ongoing series)
Scope: this branch = ONLY `ClinicGrooming.tsx` + `ClinicInpatient.tsx` (the two zero-coverage, highest-traffic clinic screens, ~1200 lines combined). Each subsequent screen/cluster ships as its own branch under a tracked backlog.
- Must: ClinicGrooming, ClinicInpatient
- Should: n/a (out of scope this branch)
- Could: n/a
- Pro: smallest possible unit, fastest review cycle, easiest for a human Thai-speaker to proofread one branch's worth of strings, cleanest git history for translation-only diffs.
- Con: many small branches/PRs before the app is fully translated; more scribe-agent overhead (Step 8 runs once per screen).

### Recommendation: **Option A**, with Option C's per-screen PR-splitting discipline applied inside it if the diff proves unreviewable in one pass.

Rationale: Option A matches the orchestrator's pre-verified gap exactly (no re-scoping the background), stays inside a single arch-skip-eligible, frontend-only branch, and the two Must screens (ClinicGrooming, ClinicInpatient) are the ones clinic staff touch every day with zero coverage today. Option B is reasonable but doubles review surface and pulls in the entire Admin plane, which deserves its own BA/PM look at whether admin-facing strings (audit log actions, especially ones sourced from the backend — see open question 4.6) are even the right thing to hardcode-translate. Platform plane (Option not offered above) is superadmin/internal tooling with zero existing i18n investment — recommend a **separate future feature**, not folded into "clinic i18n completion," pending the open question in §4.7 on whether Platform even needs Thai at all.

### 2.4 Backlog (explicitly out of scope for this branch, per CLAUDE.md scope guard)

- Platform plane: `CustomerDetailView`, `CustomerListView`, `PlatformAuditView`, `PlatformLoginView`, `PlatformPlansView`, `PlatformSettingsView` — 0% coverage, no i18n import at all, no stash reference material.
- Settings pages: `IntegrationsPage`, `NotificationsPage`, `OperatingHoursPage`, `PaymentPage`, `StorageConnectingPage`, `StoragePage` — 0% coverage.
- Admin plane (if Option A chosen): `AdminAudit`, `AdminBranches`, `AdminBloodBank`, `AdminUsage`, `ClinicSettingsTab`, `SubscriptionTab`.
- Remaining clinic screens (if Option A chosen): `ClinicRecordVaccination`, `ClinicTransactions`, `ClinicVaccinationsDue`.
- Partial-screen finishing for everything not selected: `RoleEditorView`, `AdminDashboard`, `PreferencesPage`, `ClinicAppointments`, `ClinicDashboard`, `LoginView`, `UserManagementTab`, `ClinicInventory`, `ClinicBilling` (only `ClinicEMR`/`ClinicPets` are in Option A's Should).
- i18n architecture cleanup: splitting the single 717-line `i18n/index.ts` into per-namespace files — not requested, not required for this scope, flag as a Could/future refactor (Lane D) if the file grows past ~1500 lines with this addition.

---

## 3. Goal and rough acceptance criteria

**User-level goal:** A clinic staff member (any role) who switches the app's language toggle to Thai sees every visible string on `ClinicGrooming`, `ClinicInpatient`, `ClinicEMR`, and `ClinicPets` rendered in Thai — no English fallback text, no raw `i18n` key strings (e.g. `clinic.grooming.title`) ever visible on screen, in either Tablet or Web viewport.

**Rough acceptance criteria (to be refined by @ba-agent at Step 3):**
- [ ] Switching language to Thai on ClinicGrooming shows 100% Thai text (no hardcoded English strings remain in JSX)
- [ ] Switching language to Thai on ClinicInpatient shows 100% Thai text
- [ ] Switching language to Thai on ClinicEMR shows 100% Thai text (the remaining ~10 hardcoded lines are closed)
- [ ] Switching language to Thai on ClinicPets shows 100% Thai text (the remaining ~30 hardcoded lines are closed)
- [ ] Switching language to English on all four screens shows correct English (no leftover Thai, no key strings)
- [ ] No raw i18n key (dotted string matching `t()` key pattern) is ever rendered as visible text on any of the four screens, in either language
- [ ] New `grooming.*` and `inpatient.*` namespaces added to `i18n/index.ts` with both Thai and English values for every key used
- [ ] Existing test suite stays green; a per-screen i18n regression test is added for each of the 4 screens (assert Thai render + assert no raw key leakage), per `anemal-screen-specs` conventions
- [ ] No functional/behavioural change to any of the four screens — this is a string-only change (Lane A because it's user-visible, but touches no API/DB/business logic)
- [ ] Tablet (768/1024px) and Web viewport both checked — Thai string length does not break layout/truncation on touch targets

---

## 4. Open questions

### For the human
1. Confirm scoping: approve **Option A** (4 screens: ClinicGrooming, ClinicInpatient, ClinicEMR, ClinicPets), or prefer Option B (adds Admin plane) or Option C (split into per-screen branches)?
2. Is Platform plane's total lack of i18n (0 of 6 files) intentional (superadmin/internal, English-only by design) or an oversight that should be backlogged with priority?
3. Who signs off on Thai wording quality/accuracy — is there a native-Thai reviewer in the loop before merge, or does @ba-agent's review suffice?

### For @ba-agent (Step 3)
4.1 Should the archived stash's key names/strings for `admin.audit.*` and `admin.bloodBank.*` be adopted verbatim as the naming convention for the new `clinic.grooming.*` / `clinic.inpatient.*` namespaces (consistency), or does BA want a fresh key-naming pass?
4.2 Date/time and number formatting inside these 4 screens (e.g. appointment times in ClinicGrooming, stay durations in ClinicInpatient) — does `t()` interpolation cover this today, or is a separate locale-aware formatter (e.g. `Intl.DateTimeFormat`) needed? Verify current pattern in `ClinicDashboard.tsx` (called "Done") before assuming it's solved.
4.3 Whether AdminAudit's action-description strings that originate from the backend (audit log entries built server-side) are translatable at all with a frontend-only i18n approach, or whether that requires a backend key-based message system — relevant if Option B is chosen, flagged now so it isn't rediscovered mid-implementation.
4.4 Confirm no RBAC/permission implications — this is presentation-only, but @ba-agent should confirm no permission-gated string reveals sensitive info differently per language.
4.5 Any clinic-role-specific terminology conventions (e.g. veterinary Thai terms for "inpatient," "grooming service types") that need a glossary entry, per `anemal-ba-toolkit`'s terminology-consistency practice.
4.6 (duplicate of human Q2, cross-flagging) Confirm Platform plane's i18n status is a deliberate backlog decision, not a gap BA considers must-fix now.
4.7 Should this feature's acceptance criteria include a "no raw key leakage" automated test pattern as a reusable i18n regression convention for all future screens, or is that a QA-protocol addition instead (`.claude/roadmap/qa-protocols.md`)?

---

## 5. Lane classification rationale

**Lane A** (new or changed behaviour visible to the user), per the CLAUDE.md lane selector: switching the language toggle currently produces incomplete/broken output (English leaking through, or literal key strings) on the 4 in-scope screens — closing that is user-visible behaviour change, not a like-for-like refactor (Lane D, which requires behaviour to stay identical) and not a "broken and shouldn't be" isolated bug (Lane B is possible to argue, but the scope — 4 screens, ~40+ new i18n keys, a full BA/UX pass on Thai wording — exceeds Lane B's single-bug-fix path per `anemal-dev-lanes`). Full pipeline applies.

**Architecture (Step 3.4) expectation:** likely `arch: skipped (below threshold)` — this is frontend-only, no new table, no new service, no cross-cutting authz/tenancy/quota concern, touches exactly one existing shared file (`i18n/index.ts`) plus 4 view files. Final call belongs to @arch-agent at Step 3.4, not pre-decided here.

---

## 6. Human decisions — STEP 1 approved 2026-09-23

1. **Scope: Option A approved** — ClinicGrooming, ClinicInpatient (Must); ClinicEMR, ClinicPets (Should). Everything else stays in §2.4 backlog.
2. **Platform plane is English-only by design** — not a gap, not backlogged. The 6 `/platform/*` views are operated by the SaaS owner's internal team. Record this as a decision at Step 3.5 (`/grill-with-docs` → ADR) so it stops appearing as an i18n gap. BA question 4.6 is answered by this.
3. **Thai wording sign-off: `@ba-agent` alone** — no native-Thai human reviewer in the loop before merge. BA owns terminology (4.5) and wording quality.

## 7. Next step

STEP 2 — `@pm-agent`: tasks + AC for Option A. Then STEP 3 — `@ba-agent`: validation + §4 BA questions 4.1–4.5, 4.7 (sign-off gate).
