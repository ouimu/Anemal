# Task Breakdown: i18n Completion (Option A) — STEP 2

**Date:** 2026-09-23
**Author:** @pm-agent
**Feeds from:** `2026-09-23-i18n-completion-brainstorm.md` (§1 gap inventory, §2 Option A, §3 draft AC, §4 open questions, §6 human decisions)
**Feeds into:** STEP 3 `@ba-agent` validation + sign-off

## 0. Skills loaded
`anemal-functional-reqs`, `anemal-ba-toolkit`, `.claude/standards/acceptance-criteria.md`, `anemal-screen-specs`, `.claude/agents/pm-agent/SKILL.md`.

## 0.1 Verification against current `main` (2026-09-23)

Re-counted directly (`grep -c '\bt('` + `wc -l`), not trusted from the brainstorm:

| Screen | Lines | t() calls | Existing test file(s) | Brainstorm claim | Match? |
|---|---|---|---|---|---|
| `ClinicGrooming.tsx` | 391 | 0 | `ClinicGrooming.test.tsx`, `ClinicGrooming.bookingModal.test.tsx` (no i18n assertions) | 0 | Match |
| `ClinicInpatient.tsx` | 806 | 0 | none | 0 | Match |
| `ClinicEMR.tsx` | 794 | 7 | none | 7 | Match |
| `ClinicPets.tsx` | 946 | 51 | none | 51 | Match |
| `ClinicDashboard.tsx` (reference) | 181 | 16 | — | 16 | Match |

**No count discrepancies found.** `i18n/index.ts` (717 lines) already carries partial `clinic.pets.*` (26 keys) and `clinic.emr.*` (7 keys) namespaces in both `en`/`th` blocks — confirmed by grep — but **no `clinic.grooming.*` or `clinic.inpatient.*` namespace exists at all**. Existing key-naming convention to follow: `clinic.<screen>.<camelCase field/action name>`, e.g. `clinic.pets.firstName`, `clinic.emr.saveRecord`.

Grooming already has 2 test files with zero i18n coverage inside them — new i18n regression assertions must be added there, not a fresh test file (avoid duplicate test files for the same component per `anemal-screen-specs`).

## 0.2 Scope reminder (binding, from brainstorm §6)
Must: ClinicGrooming, ClinicInpatient. Should: ClinicEMR, ClinicPets (finish only — do not touch already-covered lines). Nothing else. Platform plane and everything else in §2.4 backlog stays out — do not create tasks for it.

---

## 1. Task list

### I18N-1 — Add `clinic.grooming.*` namespace to `i18n/index.ts`
**Actor/role:** n/a (infrastructure task, no UI-facing actor) | **Device:** Both
**Priority:** Must
**Description:** Enumerate every hardcoded string literal in `ClinicGrooming.tsx` JSX (labels, buttons, headers, empty states, toasts/errors, modal titles, status badges, form field labels/placeholders). Add one `clinic.grooming.<key>` entry per unique string to both the `en` and `th` blocks of `i18n/index.ts`, following the existing `clinic.pets.*` naming convention (camelCase key = field/action name, not the English sentence). Do not touch `nav.grooming` / `page./clinic/grooming` (already translated) or any other namespace.
**Acceptance Criteria:**
- [ ] Every string identified in the sweep has a corresponding `clinic.grooming.*` key in both `en` and `th` blocks
- [ ] No duplicate keys; no reuse of a `clinic.pets.*`/`clinic.emr.*` key for a grooming-specific string
- [ ] `en` and `th` blocks have identical key sets for the new namespace (no orphan key in one language)
- [ ] Thai values are placeholders flagged `// TODO-BA-WORDING` pending `@ba-agent` sign-off (per human decision §6.3) — PM does not finalize Thai wording
**Permission(s):** none (static asset, no runtime authz)
**Dependencies:** none (first task, unblocks I18N-2)

### I18N-2 — Convert `ClinicGrooming.tsx` to use `t()`
**Actor/role:** Staff, Vet, Groomer (any clinic role that can reach `/clinic/grooming` — confirm exact role list against `anemal-rbac-matrix` at Step 3) | **Device:** Both (Tablet primary — grooming is a daily tablet workflow)
**Description:** Replace every hardcoded JSX string in `ClinicGrooming.tsx` with `t('clinic.grooming.<key>')` calls using the keys added in I18N-1. No logic change — string-only substitution.
**Acceptance Criteria:**
- [ ] `grep -c '\bt('` on `ClinicGrooming.tsx` rises from 0 to the full count of unique strings (no hardcoded English string remains in JSX, excluding code comments, non-visible ARIA-only strings the BA rules as exempt, and interpolated variables)
- [ ] Switching language toggle to Thai renders 100% Thai text on this screen
- [ ] Switching language toggle to English renders correct English (regression — nothing broken by the substitution)
- [ ] No raw i18n key (a dotted string matching `t()` key shape) is ever visible as rendered text, in either language
- [ ] No functional/behavioural change: existing `ClinicGrooming.test.tsx` and `ClinicGrooming.bookingModal.test.tsx` pass unmodified except for text-matcher updates required by the translation
- [ ] Negative/authorization case: a role without `clinic.grooming` view permission still gets denied access (404 per multi-tenancy/RBAC rule) regardless of language — confirms i18n change introduced no authz regression
**Permission(s):** unchanged — whatever route guard already protects `/clinic/grooming` (confirm exact permission code with `anemal-rbac-matrix` at Step 3; this task must not alter it)
**Dependencies:** I18N-1

### I18N-3 — Grooming: Tablet layout check with Thai string length
**Actor/role:** Staff, Vet, Groomer | **Device:** Tablet (768×1024 portrait, 1024×768 landscape)
**Description:** After I18N-2, verify no Thai string (typically 20-40% longer than English for UI labels) causes truncation, wrap-induced overflow, or touch-target shrinkage below 44×44px on `ClinicGrooming.tsx` at both tablet breakpoints, per `anemal-design-system`/`anemal-screen-specs` conventions.
**Acceptance Criteria:**
- [ ] At 768px portrait, all Thai-rendered labels/buttons are fully visible, no unintended text clipping
- [ ] At 1024px landscape, same check passes
- [ ] All buttons/tap targets remain ≥44×44px after Thai text substitution
- [ ] No layout regression on Web viewport (desktop width) either
**Permission(s):** n/a (visual QA, no authz surface)
**Dependencies:** I18N-2

### I18N-4 — Grooming: i18n regression test
**Actor/role:** n/a (test task) | **Device:** Both
**Description:** Extend `ClinicGrooming.test.tsx` (do not create a new file) with an i18n-specific test block: render with Thai active and assert (a) presence of expected Thai strings, (b) absence of any string matching the raw-key pattern (e.g. regex `/^[a-z]+(\.[a-zA-Z0-9]+)+$/` rendered as visible text). Mirror with English active to catch regressions.
**Acceptance Criteria:**
- [ ] New test(s) fail on the current `main` (pre-I18N-2) and pass after I18N-2 lands — proves the test is meaningful, not vacuous
- [ ] Test asserts zero raw-key leakage in both languages
- [ ] Existing test suite (all files) stays green
**Permission(s):** n/a
**Dependencies:** I18N-2

---

### I18N-5 — Add `clinic.inpatient.*` namespace to `i18n/index.ts`
**Actor/role:** n/a | **Device:** Both
**Priority:** Must
**Description:** Same method as I18N-1, applied to `ClinicInpatient.tsx` (806 lines, largest untranslated file in the app — expect the largest key count of the four screens; budget review time accordingly, consider splitting the PR diff per brainstorm §2's Option-C fallback if unreviewable in one pass).
**Acceptance Criteria:**
- [ ] Every string identified in the sweep has a corresponding `clinic.inpatient.*` key in both `en` and `th`
- [ ] No duplicate keys; no cross-namespace key reuse
- [ ] `en`/`th` key sets identical
- [ ] Thai values placeholder-flagged `// TODO-BA-WORDING` pending `@ba-agent` sign-off
**Permission(s):** none
**Dependencies:** none (parallel-safe with I18N-1 — different key range in the same file, see manifest note in §2)

### I18N-6 — Convert `ClinicInpatient.tsx` to use `t()`
**Actor/role:** Staff, Vet (inpatient/ward roles — confirm exact role list at Step 3) | **Device:** Both (Tablet primary)
**Description:** Same method as I18N-2, applied to `ClinicInpatient.tsx`.
**Acceptance Criteria:** (mirrors I18N-2, screen substituted)
- [ ] Full t() coverage, 0 hardcoded strings remain in JSX
- [ ] Thai and English render correctly on toggle
- [ ] No raw key leakage in either language
- [ ] No functional change — behaviour-identical diff
- [ ] Negative/authorization case: role without inpatient view permission still denied (404), independent of language
- [ ] No existing test file for this screen today — this task does not create one (that's I18N-8); this task only must not break the build/typecheck
**Permission(s):** unchanged; confirm exact permission code at Step 3
**Dependencies:** I18N-5

### I18N-7 — Inpatient: Tablet layout check with Thai string length
**Actor/role:** Staff, Vet | **Device:** Tablet (768/1024) + Web
**Description:** Same method as I18N-3, applied to `ClinicInpatient.tsx`. Flag specifically: stay-duration displays and status badges (brainstorm §4.2 notes these as a possible locale-formatting gap — do not fix formatting here, only flag if Thai numerals/format differ; formatting itself is BA question 4.2, out of this task's scope).
**Acceptance Criteria:**
- [ ] 768px portrait and 1024px landscape both pass with no clipping/overflow
- [ ] All tap targets remain ≥44×44px
- [ ] Web viewport unaffected
- [ ] Any date/time or duration formatting oddity observed is logged as a note for `@ba-agent` (BA question 4.2), not silently fixed
**Permission(s):** n/a
**Dependencies:** I18N-6

### I18N-8 — Inpatient: new i18n regression test file
**Actor/role:** n/a | **Device:** Both
**Description:** No test file exists for `ClinicInpatient.tsx` today. Create `ClinicInpatient.test.tsx` under `src/frontend/src/views/clinic/__tests__/` scoped to i18n assertions only (Thai render + no raw-key leakage), per `anemal-screen-specs` test conventions. Do not attempt to backfill full functional test coverage for the screen — that is out of scope for an i18n-only branch; flag it to backlog if QA (Step 7) wants it.
**Acceptance Criteria:**
- [ ] New test file renders the component with Thai active, asserts expected Thai strings present
- [ ] Asserts zero raw-key-pattern strings visible in Thai and in English
- [ ] Test fails pre-I18N-6, passes post-I18N-6
- [ ] Full suite stays green
**Permission(s):** n/a
**Dependencies:** I18N-6

---

### I18N-9 — Finish `clinic.emr.*` namespace + convert remaining hardcoded lines in `ClinicEMR.tsx`
**Actor/role:** Vet, Staff (EMR-authoring roles — confirm at Step 3) | **Device:** Both
**Priority:** Should
**Description:** `ClinicEMR.tsx` already has 7 `t()` calls and a partial `clinic.emr.*` namespace (7 keys confirmed in `i18n/index.ts`). Identify the remaining ~10 hardcoded JSX lines (re-count exactly during implementation — brainstorm's "~10" is an estimate, not verified line-by-line), add the missing `clinic.emr.*` keys (en+th, placeholder Thai pending BA), and convert those lines to `t()`. Do not touch the 7 already-converted calls or renumber/rename existing keys.
**Acceptance Criteria:**
- [ ] Exact remaining-hardcoded-line count is confirmed (not assumed) before starting, and closed to 0 by task end
- [ ] New `clinic.emr.*` keys follow existing naming convention, no duplicates, en/th key sets identical
- [ ] Switching to Thai shows 100% Thai text on the full screen (not just the previously-covered 7 calls)
- [ ] No raw key leakage in either language
- [ ] No functional change to the 7 already-i18n'd calls or any business logic
- [ ] Negative/authorization case: role without EMR write/view permission still denied appropriately, unaffected by language
**Permission(s):** unchanged; confirm exact permission code(s) at Step 3 (EMR likely has separate view vs. write permissions — confirm both are unaffected)
**Dependencies:** none directly, but should NOT run in the same wave as edits to shared `i18n/index.ts` sections other tasks are also touching (see work-partition note, §2) — safe to parallelize since it only adds new EMR keys

### I18N-10 — EMR: Tablet layout check + regression test
**Actor/role:** Vet, Staff | **Device:** Tablet (768/1024) + Web
**Description:** Combines the layout check (per I18N-3 method) and regression test extension (per I18N-4 method, extending whatever existing EMR test file(s) exist — check for one before creating new) for `ClinicEMR.tsx` after I18N-9.
**Acceptance Criteria:**
- [ ] 768/1024 tablet + Web layout checks pass, tap targets ≥44×44px, no truncation
- [ ] i18n regression test (Thai render + no raw-key leakage) added/extended and passes
- [ ] Test fails pre-I18N-9 fix, passes after
- [ ] Full suite green
**Permission(s):** n/a
**Dependencies:** I18N-9

---

### I18N-11 — Finish `clinic.pets.*` namespace + convert remaining hardcoded lines in `ClinicPets.tsx`
**Actor/role:** Staff, Vet, Reception (pet/owner-record roles — confirm at Step 3) | **Device:** Both
**Priority:** Should
**Description:** `ClinicPets.tsx` already has 51 `t()` calls and 26 confirmed `clinic.pets.*` keys. Identify the remaining ~30 hardcoded JSX lines (re-count exactly, do not trust the estimate), add missing keys, convert. This is the largest partial file — budget for careful diffing to avoid disturbing the 51 existing calls.
**Acceptance Criteria:**
- [ ] Exact remaining-hardcoded-line count confirmed before starting, closed to 0 by task end
- [ ] New keys follow convention, no duplicates, en/th sets identical
- [ ] Full-screen Thai switch shows 100% Thai text
- [ ] No raw key leakage
- [ ] No functional change to any of the 51 existing calls or to add/edit/delete owner-pet logic
- [ ] Negative/authorization case: a role without pets view/edit permission still denied correctly regardless of language; specifically check the "Delete Owner" / deactivate flows still gate correctly (these are sensitive actions per brainstorm 4.4's RBAC concern)
**Permission(s):** unchanged; confirm exact permission code(s) at Step 3
**Dependencies:** none directly (see parallelization note §2)

### I18N-12 — Pets: Tablet layout check + regression test
**Actor/role:** Staff, Vet, Reception | **Device:** Tablet (768/1024) + Web
**Description:** Combines layout check and regression test extension for `ClinicPets.tsx` after I18N-11, same method as I18N-10.
**Acceptance Criteria:**
- [ ] 768/1024 tablet + Web layout checks pass, tap targets ≥44×44px, no truncation (Pets has forms with many labels — check field-label wrap behavior specifically)
- [ ] i18n regression test added/extended, passes
- [ ] Test fails pre-fix, passes post-fix
- [ ] Full suite green
**Permission(s):** n/a
**Dependencies:** I18N-11

---

### I18N-13 — Full four-screen cross-check (integration)
**Actor/role:** any clinic role reaching these 4 screens | **Device:** Both
**Priority:** Must (gates Step 7 handoff)
**Description:** After I18N-1 through I18N-12 land, run one pass toggling language on all four screens in sequence to catch cross-screen issues (e.g. shared component — modal, badge, table header — used by more than one of the four screens where a fix in one screen's task missed a shared-component string).
**Acceptance Criteria:**
- [ ] All four screens (Grooming, Inpatient, EMR, Pets) show 100% Thai on toggle, 100% correct English on toggle back
- [ ] Zero raw key leakage anywhere across the four screens
- [ ] Full frontend test suite green
- [ ] `i18n/index.ts` has no orphaned/duplicate keys introduced across the four namespaces (`clinic.grooming.*`, `clinic.inpatient.*`, `clinic.emr.*`, `clinic.pets.*`)
**Permission(s):** n/a (verification task)
**Dependencies:** I18N-1 through I18N-12 (all)

---

## 2. Work-partition note (informational only — NOT the manifest)

Per CLAUDE.md, the work-partition manifest with Wave/Owner assignment is a **Step 4** (`/superpowers:write-plan`) deliverable, produced after `@arch-agent` freezes any contract at Step 3.4. This PM task list does not assign waves or owners. Flagging now for Step 4's benefit:

- All 13 tasks are frontend-only, touching exactly 5 files: `i18n/index.ts` (shared, all 4 namespace-add tasks touch it) + the 4 view files + their test files.
- `i18n/index.ts` is a **shared-file contention point**: I18N-1, I18N-5, I18N-9, I18N-11 all append to it. They touch disjoint line ranges (different namespaces) so textual conflicts are unlikely but not impossible — Step 4 should decide whether these four run sequentially against that one file or in parallel with a rebase step, and whether arch is needed at all for a shared-file question this small (likely still "skipped (below threshold)" — no class/interface/service is involved, this is a data-file merge concern, not a structural one).
- Given the above is a plain data-object-literal file (not code with contracts), sequencing (not a frozen arch contract) is the safer default per CLAUDE.md's "no frozen contract → do not parallelise; sequence instead."

---

## 3. Priority / count summary

- **Must:** I18N-1, I18N-2, I18N-3, I18N-4 (Grooming, 4 tasks) + I18N-5, I18N-6, I18N-7, I18N-8 (Inpatient, 4 tasks) + I18N-13 (cross-check) = **9 Must tasks**
- **Should:** I18N-9, I18N-10 (EMR, 2 tasks) + I18N-11, I18N-12 (Pets, 2 tasks) = **4 Should tasks**
- **Total: 13 tasks**

No count discrepancies found against the brainstorm (see §0.1) — all t()-call counts verified exactly against current `main`.

## 4. Items handed to @ba-agent at Step 3 (PM does not answer these)

Carried forward verbatim from brainstorm §4, plus PM cross-references added above:
- **4.1** — Adopt stash key-naming convention (`admin.audit.*`/`admin.bloodBank.*` style) for `clinic.grooming.*`/`clinic.inpatient.*`, or fresh naming pass? (PM used the existing `clinic.pets.*`/`clinic.emr.*` convention as the working default in I18N-1/I18N-5 — BA to confirm or override before implementation.)
- **4.2** — Date/time/duration formatting in Grooming (appointment times) and Inpatient (stay durations): does `t()` interpolation cover it, or is `Intl.DateTimeFormat` needed? PM flagged this again at I18N-7 (Inpatient stay-duration display) — do not let implementation silently invent a formatting approach.
- **4.3** — AdminAudit backend-sourced strings translatability — N/A to Option A's 4 screens but recorded per brainstorm for Option B's future reference; not blocking this branch.
- **4.4** — RBAC confirmation: no permission-gated string reveals sensitive info differently per language. PM added explicit negative/authorization AC to I18N-2, I18N-6, I18N-9, I18N-11 to make this testable by QA; BA should confirm these AC are sufficient or add more.
- **4.5** — Clinic-role-specific Thai terminology (e.g. "inpatient," grooming service types) glossary entries — feeds the `TODO-BA-WORDING` placeholders left in I18N-1/I18N-5/I18N-9/I18N-11.
- **4.7** — Whether "no raw key leakage" should become a reusable QA-protocol convention for all future screens (beyond this branch) — PM implemented it as a per-task AC here (I18N-4, I18N-8, I18N-10, I18N-12, I18N-13) but the standardization decision is BA's/QA-protocol's, not PM's to make unilaterally.

Human-level open questions (§4, "For the human") were already resolved in brainstorm §6 and are not reopened here.

## 5. Next step
STEP 3 — `@ba-agent`: validate this task list, resolve BA questions 4.1–4.5 and 4.7 above, sign off on scope/AC, and own Thai wording quality (replacing the `TODO-BA-WORDING` placeholders this list assumes will exist in the implementation). Then STEP 3.4 — `@arch-agent` (or record "arch: skipped (below threshold)" per the informational note in §2).
