# i18n Completion — Implementation Plan + Work-Partition Manifest (Step 4)

**Feature:** i18n-completion · **Lane:** A · **Step:** 4 (`/superpowers:write-plan`)
**Author:** @pm-agent · **Date:** 2026-09-24

**Upstream (all closed):**
- Step 1 `/superpowers:brainstorm` — human sign-off 2026-09-23 (Option A · Platform English-only · @ba-agent alone signs off Thai)
- Step 2 `docs/superpowers/plans/2026-09-23-i18n-completion-pm-tasks.md` (@pm-agent, this agent's own prior output — superseded in every place §0 below lists)
- Step 3 `docs/superpowers/plans/2026-09-23-i18n-completion-ba-signoff.md` (@ba-agent, **BA SIGN-OFF with binding amendments A-1..A-17**, glossary §5, rules §4, new tasks I18N-14..16)
- Step 3.4 — **arch: skipped (below threshold)** (orchestrator, 2026-09-24, concurring with BA §8.1: no table, no service, no integration, no state machine, no transaction, no cross-cutting authz/audit/quota/tenancy concern)
- Step 3.4b — n/a (no arch doc, nothing to pre-check)
- Step 3.5 `/grill-with-docs` — PASSED 2026-09-24, `docs/superpowers/plans/2026-09-24-i18n-completion-grill.md`, 8 findings / 0 unresolved. `docs/adr/0029-*.md`, `0030-*.md`, `0031-*.md` recorded.

**Downstream:** Step 4b (@scribe-agent reference pre-check) → Step 5 (@ponytail-agent gate, this plan only — no arch doc exists) → Step 6 (`/superpowers:execute-plan`, **sequential**) → Step 7 (@qa-agent) → Step 8 (@scribe-agent).

**arch: skipped (below threshold).** No class/interface/service contract is frozen anywhere in this feature. Per CLAUDE.md, **no frozen contract → Step 6 does not parallelise; it sequences.** Every task below runs in one strict order against a single worker lane (Dev A), because the only real contention is a single shared data file (`i18n/index.ts`) plus four view files that share zero code today. There is no DBA wave (no DB, no migration) and no UIUX A wave (BA's §5 glossary and A-12 viewport rules are the design spec; no new screen/component is being designed, so `@uiux-agent` has no deliverable this branch).

---

## 0. What changed since Step 2 (applied throughout, not re-derived)

Per the BA sign-off (§1, §6) and the grill log's "Binding changes to STEP 4 plan":

1. **Task count 13 → 16.** New: **I18N-14** (static i18n integrity tests), **I18N-15** (shared date-formatting helper), **I18N-16** (BA Thai wording review, gate before Step 7). I18N-13 keeps its role as the manual integration cross-check (A-11).
2. **EMR and Pets promoted Must** (grill G-8). All four screens ship together in one release — **no partial ship, no whole-screen cut** once started. (A-17's "cut only as whole screens" fallback is now moot per G-8, but the mechanic stays documented in case a Should-tier surprise forces it before this plan's Step 5 gate.)
3. **No backend/server change, anywhere, this branch** (grill G-4). Server error text (`response.data.error`) stays English in Thai mode — exemption E-1. Do not add a backend error-code contract in this branch.
4. **No TODO placeholders.** Thai values are authored straight from the BA §5 glossary (A-1) — the Step 2 plan's `// TODO-BA-WORDING` mechanic is dead.
5. **Actors corrected** (A-15, F-5): Grooming is `clinic_admin`/`clinic_staff` only — **`doctor` is denied**. Inpatient/EMR/Pets are all three system roles for view, with role-specific write splits per BA §3.1.
6. **AC rewritten app-wide**: "denied (404)" → 403/forbidden-view (A-8); "`grep -c t(` rises" → Latin-residue test (A-4/A-10); "unmodified except text-matcher updates" → **unmodified, full stop** (A-9); every namespace task gets explicit token-parity / plural / no-dynamic-key / reuse-before-add ACs (A-3).
7. **Test file locations corrected** (F-1, F-2, F-3): Inpatient and EMR and Pets **already have test files** (2/5/5 respectively) — I18N-8/10/12 extend them, they do not create first-ever coverage. The project convention is a sibling `src/__tests__/<Screen>.i18n.test.tsx`, not a block inside the existing screen test file.
8. **Should-task sizing corrected 3×** (F-6, A-17): EMR ~35 remaining literals (not ~10), Pets ~50 (not ~30).
9. **Shared `AdmitModal` cross-check added** (F-8, A-13): `AdmitModal` lives in `ClinicInpatient.tsx` but is also rendered from `ClinicPets.tsx:687`. I18N-12 and I18N-13 must exercise it from the Pets entry point too.
10. **R-1 value/label split is binding**: stored/POSTed values (`serviceType`, `feedingStatus`, `template`, tab keys) never change; only the rendered label does. Enforced by payload-assertion ACs on I18N-2/6/9/11.
11. **R-2 dates now follow the app language**, via one new shared helper (I18N-15), not the browser locale. English output for Grooming/Inpatient is byte-identical to today; EMR/Pets English output visibly changes from browser-default to `en-GB` (deliberate, per grill G-2).
12. **Dev-only traps flagged** (C-1, C-2, A-7): `ClinicEMR`'s success/error styling keys off `saveMsg === 'Saved'` (breaks once translated) and its `.map(t => …)` callbacks shadow the `t()` translator — both must be fixed as part of I18N-9, not worked around.
13. **Pre-merge EN↔TH review page is an orchestrator deliverable**, not a dev task (grill G-5) — listed in §6 below, non-blocking for merge.
14. **BA decides the Thai word for "discharge"** at I18N-16, with the จำหน่าย/"sell" ambiguity in mind (grill item 4) — §5.3 of the BA doc already commits to จำหน่าย with a rationale note; I18N-16 is where BA either confirms or overrides it in the actual diff.

---

## 1. Scope

**In scope — presentation-only, frontend-only, 4 screens + 1 shared data file + 1 new shared helper:**

| File | Role |
|---|---|
| `src/frontend/src/i18n/index.ts` | Add `clinic.grooming.*` (new), `clinic.inpatient.*` (new), finish `clinic.emr.*` (partial → complete), finish `clinic.pets.*` (partial → complete). Extend static coverage test. |
| `src/frontend/src/i18n/dateFormat.ts` **(new)** | One shared language→locale mapping (R-2). No screen may call `toLocale*` with a hardcoded or absent locale after this lands. |
| `src/frontend/src/views/clinic/ClinicGrooming.tsx` | Convert to `t()`; fix date formatting. |
| `src/frontend/src/views/clinic/ClinicInpatient.tsx` | Convert to `t()`; fix date formatting. Also feeds `AdmitModal`, consumed by Pets. |
| `src/frontend/src/views/clinic/ClinicEMR.tsx` | Finish the remaining ~35 literals; fix C-1/C-2; fix date formatting. |
| `src/frontend/src/views/clinic/ClinicPets.tsx` | Finish the remaining ~50 literals; fix date formatting; verify embedded `AdmitModal`. |

**Out of scope (backlog — recorded here for @scribe-agent to file at Step 8, per grill log + BA §7.4):**

| Item | Priority | Source |
|---|---|---|
| Invoice / tax-invoice language, receipt redesign | HIGH | grill G-7 |
| Thai error messages app-wide (two-tier: user-fixable plain Thai / system generic Thai + ref code) — needs `@arch-agent` (cross-cutting error-code contract) | Feature | grill G-4 |
| `ClinicDashboard.tsx` hardcoded `en-US` date/currency (`:17`, `:38`) — not "Done", not a valid formatting reference | — | BA F-7, §7.4.1 |
| `Dialog.tsx:179` shared `aria-label="Close dialog"`, plus a general sweep of shared components for hardcoded strings | — | BA E-3, §7.4.3 |
| Existing `th` inconsistencies outside the 4 screens (`clinic.dashboard.groomingToday`, `clinic.dashboard.inpatientsNow` wording) | — | BA §7.4.4 |
| Optional Buddhist-Era (พ.ศ.) display preference per clinic | — | BA §7.4.5 |
| Stored enum values becoming codes instead of English strings (reports/exports) | — | grill G-3, if ever revisited |
| `ADR-DUP-1` — a future numbering collision note: the next new ADR must be **0032**, not 0029 | — | grill log |
| `Dialog.tsx` aria-label as a prop, not `useT` inside `Dialog` (ADR-0027 forbids it) | — | grill log, future E-3 |

**No route, permission code, guard, API, or DB change anywhere in this feature (BA §3, confirmed twice).**

---

## 2. Traceability — BA amendments & grill items → tasks

| Source item | Disposition | Task(s) |
|---|---|---|
| A-1 (no TODO-BA-WORDING) | Applied | I18N-1, 5, 9, 11 |
| A-2 (en byte-identical) | Applied | I18N-1, 5, 9, 11 |
| A-3 (R-3..R-6 key ACs) | Applied | I18N-1, 5, 9, 11 |
| A-4 (Latin-residue replaces grep-count AC) | Applied | I18N-2, 6, 9, 11 |
| A-5 (R-1 payload assertion) | Applied | I18N-2, 6, 9, 11 |
| A-6 (R-2 date AC) | Applied | I18N-2, 6, 9, 11 |
| A-7 (C-1/C-2 fixes) | Applied | I18N-9 |
| A-8 (403/forbidden, not 404) | Applied | I18N-2, 6, 9, 11 |
| A-9 (existing tests unmodified, full stop) | Applied | I18N-2, 6, 9, 11 |
| A-10 (test file location + Latin-residue method) | Applied | I18N-4, 8, 10, 12 |
| A-11 (split static checks out of manual cross-check) | Applied | I18N-14 (new), I18N-13 (kept, narrowed) |
| A-12 (viewports 768×1024 / 1024×768 / 1280, screenshot evidence) | Applied | I18N-3, 7, 10, 12 |
| A-13 (AdmitModal-from-Pets cross-check) | Applied | I18N-12, 13 |
| A-14 (remove "log, don't fix" on date formatting) | Applied | I18N-7 |
| A-15 (actor corrections) | Applied | I18N-2, 6, 9, 11 |
| A-16 (language-switch mid-modal re-render) | Applied | I18N-13 |
| A-17 (re-estimate EMR/Pets, whole-screen-cut fallback) | Applied | I18N-9, 11 (sizing); moot per G-8 unless a Should-tier surprise recurs |
| I18N-14 (static integrity tests) | New task, added | I18N-14 |
| I18N-15 (shared date helper) | New task, added | I18N-15 |
| I18N-16 (BA Thai wording review) | New task, added | I18N-16 |
| G-1 (Gregorian year in Thai mode) | Applied via R-2 | I18N-15 |
| G-2 (en-GB day-first everywhere) | Applied via R-2 | I18N-15, 2, 6, 9, 11 |
| G-3 (stored values stay English) | Applied via R-1 | I18N-2, 6, 9, 11 |
| G-4 (server errors stay English; no backend change) | Applied — scope boundary | §1 out-of-scope table; enforced by I18N-2/6/9/11 not touching backend |
| G-5 (BA sole reviewer + pre-merge EN↔TH page) | Applied | I18N-16 (BA review); §6 below (orchestrator's review-page deliverable) |
| G-6 (Platform plane English-only, ADR) | Recorded, no task needed | ADR-0031 (already written) |
| G-7 (invoice/tax-invoice language) | Deferred to backlog | §1 out-of-scope table |
| G-8 (EMR+Pets promoted Must, all-4 ship together) | Applied | §0.2, §1, priority table §7 |
| F-1..F-10 (evidence corrections) | Applied throughout | see individual amendment rows above |
| BA §7.4 backlog items 1-5 | Recorded | §1 out-of-scope table |

**Coverage: 17/17 BA amendments and new tasks (A-1..A-17) + 3/3 new BA tasks (I18N-14..16) + 8/8 grill items (G-1..G-8) mapped — nothing dropped.** No amendment could not be satisfied.

---

## 3. Tasks

```
Task ID: I18N-14
Actor/role: n/a (test infrastructure) | Device: n/a
Priority: Must · Owner: Dev A · Depends: none — runs FIRST, red before any namespace lands
Description: Extend the existing src/frontend/src/__tests__/i18n.coverage.test.ts (do not create a
  parallel file) with the four checks BA §6.2/I18N-14 specifies. Write this test before touching
  i18n/index.ts for any of the 4 screens (TDD: it is red today only for the two-way-parity and
  th-differs-from-en checks on namespaces that don't exist yet; the literal-key-exists check is
  already green app-wide per BA §2 Q4.7 and must stay green throughout).
Acceptance Criteria:
  - [x] Two-way key parity: every `th` key exists in `en` (today only en→th is checked; add the
        reverse direction)
  - [x] Every literal `t('…')` key found in `src/**/*.{ts,tsx}` (excluding `*.test.*` and
        `i18n/index.ts` itself) exists in `en` — confirm this stays green (it is true on `main` today)
  - [x] Every key's `en` and `th` values contain the same `{token}` set (R-3)
  - [x] For keys under `clinic.grooming.*`, `clinic.inpatient.*`, and any key ADDED to
        `clinic.emr.*` / `clinic.pets.*` in this branch: `th !== en`, unless the key is on an explicit
        allow-list (One/Other plural pairs are compared against each other, not against `en` — R-4)
  - [x] The 4 in-scope view files contain no template-literal `t(\`…\`)` call anywhere (R-5)
  - [x] tsc --noEmit clean; `npm run test` (vitest run) green for this file in isolation
Permission(s): n/a
Verification: `cd src/frontend && npm run test -- i18n.coverage.test.ts`
```

```
Task ID: I18N-15
Actor/role: n/a (shared utility) | Device: Both
Priority: Must (Grooming/Inpatient) — the helper itself is Must because I18N-2/6 depend on it;
  its EMR/Pets call sites are Should-tier per the screens they land in
Owner: Dev A · Depends: none; BLOCKS the date-format ACs of I18N-2, 6, 9, 11
Description: Create src/frontend/src/i18n/dateFormat.ts — one shared language→locale mapping per
  R-2, colocated with i18n/index.ts (mirrors the existing utils/errorMessage.ts pattern: a small,
  pure, colocated helper, not a new folder). Export formatters the 4 screens import instead of
  calling `toLocaleDateString`/`toLocaleString` directly with a hardcoded or absent locale:
  - `formatDate(iso, lang)` → date only
  - `formatDateTime(iso, lang)` → date + time
  - `formatShortDate(iso, lang)` → weekday + day + month (Grooming's nav strip use case)
  Mapping: `en` → `en-GB` (day-first, matches existing Grooming/Inpatient literal `'en-GB'` calls —
  output must be byte-identical to today for those two screens). `th` → Thai month/weekday
  abbreviations, Gregorian year (ค.ศ., grill G-1), 24-hour time. Do not implement Buddhist Era (backlog
  §1). Do not touch ClinicDashboard.tsx (BA F-7 — it is not a valid reference and is out of scope).
Acceptance Criteria:
  - [x] One shared mapping; no `toLocale*` call anywhere in the 4 view files passes a hardcoded
        locale string or omits the locale argument after this task's screens land (checked
        incrementally as each screen converts, closed by I18N-13)
  - [x] English: given a fixed reference date, Grooming's `formatShortDate` output and Inpatient's
        `formatDate`/`formatDateTime` output are byte-identical to today's `'en-GB'` literal calls —
        unit-tested with a fixed date, not a live clock
  - [x] Thai: the same fixed date renders with a Thai month abbreviation and the Gregorian year
        (e.g. `21 ก.ย. 2026`), not Buddhist Era
  - [x] The rendered string does not depend on `navigator.language` / browser locale — test runs the
        assertion under two different `navigator.language` stub values and gets the same result both
        times
  - [x] New file: src/frontend/src/i18n/dateFormat.test.ts
  - [x] tsc --noEmit clean
Permission(s): n/a
Verification: `cd src/frontend && npm run test -- dateFormat.test.ts`
```

```
Task ID: I18N-1
Actor/role: n/a (infrastructure) | Device: Both
Priority: Must · Owner: Dev A · Depends: I18N-14 (test written first)
Description: Enumerate every hardcoded string literal in ClinicGrooming.tsx JSX (labels, buttons,
  headers, empty states, toasts/errors, modal titles, status badges, form field labels/placeholders,
  aria-labels, confirm() messages — R-7 surface list). Add one `clinic.grooming.<key>` entry per
  unique string to both `en` and `th` blocks of i18n/index.ts, using the `clinic.<screen>.<camelCase>`
  convention. Author every `th` value directly from BA §5.2 (Grooming rows #21-38), §5.3 (Grooming
  status + service enum maps), and §5.4 safety sentences where applicable — no drafting, no
  placeholder. Reuse `common.*` keys per R-6 where the English string is already covered
  (`save`, `cancel`, `close`, `delete`, `edit`, `loading`, `saving`) rather than adding a duplicate.
Acceptance Criteria:
  - [x] Every string identified in the sweep has a corresponding `clinic.grooming.*` key in both `en`
        and `th` blocks, OR is satisfied by an existing `common.*` key (R-6) — no unnecessary
        duplication
  - [x] `en` values are byte-identical to the literals they replace (A-2)
  - [x] Thai values are authored from BA §5 glossary; `grep -r TODO-BA-WORDING src/` returns 0 (A-1)
  - [x] Keys satisfy R-3 (token parity between en/th), R-4 (One/Other plural pairs where English
        inflects — glossary #24), R-5 (no dynamic/template-literal keys), R-6 (common.* reused, no
        screen-local copy of a `common.*` string)
  - [x] No duplicate keys; no reuse of a `clinic.pets.*`/`clinic.emr.*` key for a grooming-specific
        string
  - [x] `en` and `th` blocks have identical key sets for the new namespace (I18N-14's two-way-parity
        check passes for this namespace)
Permission(s): none (static asset, no runtime authz)
Verification: `cd src/frontend && npm run test -- i18n.coverage.test.ts` (parity + token checks green
  for the new namespace)
```

```
Task ID: I18N-2
Actor/role: clinic_admin, clinic_staff (doctor is DENIED — A-15/F-5, route guard `grooming.view`)
Device: Both (Tablet primary — grooming is a daily tablet workflow)
Priority: Must · Owner: Dev A · Depends: I18N-1, I18N-15
Description: Replace every hardcoded JSX string in ClinicGrooming.tsx with `t('clinic.grooming.<key>')`
  (or the reused `common.*` key) from I18N-1. Replace the literal `toLocaleDateString('en-GB', …)`
  call at `:54` with I18N-15's `formatShortDate(date, lang)`. Fix status/service enum rendering to go
  through BA §5.3's value→label maps (R-1) — the POSTed/stored value (`serviceType` etc.) does not
  change. No other logic change.
Acceptance Criteria:
  - [x] Latin-residue test (A-4/A-10 method): with Thai active and Thai fixture data, no visible text,
        `placeholder`, `title`, or `aria-label` on this screen matches `/[A-Za-z]{2,}/` after excluding
        BA §7 E-3/E-4 exempt strings and E-2 free-text/name content
      — no raw i18n key (pattern `/\bclinic\.[a-z]+\.[A-Za-z]+/`) ever renders as visible text
  - [x] Switching to English renders output byte-identical to today (A-2), including the date format
        (I18N-15 guarantees this)
  - [x] R-1: submitting a booking in Thai mode POSTs the same English `serviceType` value as English
        mode (asserted on the mocked POST body); an unknown/legacy stored value (e.g. `'bath'`) renders
        raw, no crash, no key string (X-1)
  - [x] R-2: every date/time on the screen renders per the active language (I18N-15); English output
        for this screen is unchanged from today
  - [x] AZ-1: the diff adds, removes, or alters no `perm=`/`hasPermission(` token; existing guard/`<Can>`
        tests pass unmodified. A role lacking `grooming.view` still gets the forbidden view / 403 —
        not 404 (A-8)
  - [x] All existing tests for this screen (`ClinicGrooming.test.tsx`,
        `ClinicGrooming.bookingModal.test.tsx`) pass **unmodified** (A-9); any exception needs a
        written reason in the PR
Permission(s): unchanged — `grooming.view` (screen), `grooming.manage` (write). This task does not
  alter either code.
Verification: `cd src/frontend && npm run test -- ClinicGrooming` && `npx tsc --noEmit`
```

```
Task ID: I18N-3
Actor/role: clinic_admin, clinic_staff | Device: Tablet (768×1024 portrait, 1024×768 landscape) + 1280
  desktop (A-12)
Priority: Must · Owner: Dev A · Depends: I18N-2
Description: Verify no Thai string (20-40% longer than English) causes truncation, wrap-induced
  overflow, or touch-target shrinkage on ClinicGrooming.tsx at the 3 required viewports. Specific
  watch item per A-12: the 5 service chips and the date label's `min-w-[160px]` constraint.
Acceptance Criteria:
  - [ ] At 768×1024 portrait, 1024×768 landscape, and 1280 desktop, all Thai-rendered labels/buttons
        are fully visible, no unintended clipping, no horizontal page scroll
  - [x] All buttons/tap targets remain ≥44×44px after Thai text substitution
        (orchestrator 2026-09-24: 32/32 controls on list + BookingModal ≥44, none overflow)
  - [ ] One screenshot per surface per viewport in Thai, attached to the PR (main list + BookingModal)
        (browser-pane pass done 2026-09-24; PR screenshot files must be captured by the human —
        the pane cannot save images to disk)
        **Open:** dev DB has 0 grooming bookings, so BookingCard (the `nowrap` status/service row risk)
        was not seen rendered. List empty state + BookingModal pass at all 3 viewports; TopNav title
        wraps to 2 lines at 768 only (TopNav is outside this task's file scope; backlog candidate).
  - [ ] English viewport behaviour unaffected
Permission(s): n/a (visual QA, no authz surface)
Verification: manual screenshot pass (no dev server automation exists for this repo's frontend yet;
  attach screenshots to PR per A-12)

**Dev A code-level pass (2026-09-24) — screenshots still pending an orchestrator browser check:**
Service chips sit in a `flex flex-wrap` container inside the `max-w-md` dialog, each button sized by
content with `min-h-[44px]` and no fixed width, so a longer Thai label wraps the chip row onto more
lines rather than clipping. The date-nav label carries `min-w-[160px]` as a *minimum*, not a cap, so a
wider Thai string ("จ. 21 ก.ย.", 10 chars) — in fact shorter than the English "Mon 21 Sept" (11 chars)
in this case — has no truncation risk. One risk worth a human look on tablet: `BookingCard`'s status
pill + service-type row (`<div className="flex items-center gap-xs mb-xs">`) is a nowrap flex row with
no `truncate`/`flex-shrink-0`; the longest Thai pair (`กำลังดำเนินการ` + `แปรงฟันทำความสะอาด`, ~34
chars) is meaningfully longer than any English pair ever was, so at 768px portrait with a narrow card
this row could wrap or overflow before the outer timeline's `overflow-hidden` clips it — this is a
pre-existing layout pattern (not introduced by I18N-2) that Thai text length newly stresses. Flagging
for the orchestrator's live-device pass rather than changing layout unprompted.
```

```
Task ID: I18N-4
Actor/role: n/a (test task) | Device: Both
Priority: Must · Owner: Dev A · Depends: I18N-2
Description: Create src/frontend/src/__tests__/ClinicGrooming.i18n.test.tsx (F-3/A-10 — sibling file
  convention, NOT inside the existing views/clinic/__tests__/ClinicGrooming.test.tsx). Use the
  existing uiStore mock pattern (see ClinicPets.i18n.test.tsx for the house pattern). Cover every
  surface: main queue view + BookingModal.
Acceptance Criteria:
  - [x] (a) Key Thai strings present when rendered with Thai active
  - [x] (b) Latin-residue: collect visible text + placeholder + title + aria-label + <option> text,
        drop E-3/E-4 exempt strings, assert no `/[A-Za-z]{2,}/` remains (A-10 method)
  - [x] (c) No `/\bclinic\.[a-z]+\.[A-Za-z]+/` pattern rendered as visible text (raw-key leakage)
  - [x] (d) `window.confirm` (if used on this screen) receives the Thai message via spy — N/A:
        ClinicGrooming has no `window.confirm` call
  - [x] Test fails against pre-I18N-2 `main`, passes after I18N-2 lands (proves it's meaningful) —
        verified by stashing the I18N-2 diff and re-running: all 5 tests fail, then pass again restored
  - [x] Full frontend suite stays green
Permission(s): n/a
Verification: `cd src/frontend && npm run test -- ClinicGrooming.i18n.test.tsx`
```

```
Task ID: I18N-5
Actor/role: n/a (infrastructure) | Device: Both
Priority: Must · Owner: Dev A · Depends: I18N-14 (I18N-1 not required — different namespace, but this
  plan sequences it after I18N-1..4 anyway to keep i18n/index.ts diffs reviewable one screen at a time)
Description: Same method as I18N-1, applied to ClinicInpatient.tsx (806 lines, largest untranslated
  file). Author every `th` value from BA §5.2 Inpatient rows #39-76, §5.3 Inpatient status + feeding
  enum maps, §5.4 safety sentences S-2, S-3, S-7 through S-12. Pay particular attention to glossary
  note on #55 (Discharge = จำหน่ายผู้ป่วย, formal hospital term, deliberately chosen despite the
  จำหน่าย/"sell" ambiguity — I18N-16 is where BA re-confirms this in the actual diff) and #66 (Care
  Notes must NOT reuse the #56 Log Care key — they collide in English but differ in Thai).
Acceptance Criteria:
  - [x] Every string identified has a corresponding `clinic.inpatient.*` key in both `en`/`th`, or is
        satisfied by an existing `common.*` key
  - [x] `en` values byte-identical to today's literals (A-2)
  - [x] Thai values authored from §5 glossary; 0 TODO markers (A-1)
  - [x] R-3/R-4/R-5/R-6 satisfied (token parity, plurals, no dynamic keys, common.* reuse)
  - [x] No duplicate keys; #56 (Log Care) and #66 (Care Notes) are distinct keys with distinct Thai
        values, not collapsed into one
  - [x] `en`/`th` key sets identical for the new namespace
Permission(s): none
Verification: `cd src/frontend && npm run test -- i18n.coverage.test.ts`
```

```
Task ID: I18N-6
Actor/role: clinic_admin, doctor, clinic_staff (all three — A-15, §3.1: Inpatient view+manage held by
  all three system roles) | Device: Both (Tablet primary)
Priority: Must · Owner: Dev A · Depends: I18N-5, I18N-15
Description: Same method as I18N-2, applied to ClinicInpatient.tsx. Replace the literal
  `toLocaleDateString('en-GB', …)` (`:102`) and `toLocaleString('en-GB', …)` (`:106`) calls with
  I18N-15's `formatDate`/`formatDateTime`. Apply R-1 to `feedingStatus` (§5.3 feeding map) and the
  status badge map. Cage number and admission-reason strings use R-3 tokens (`{no}`, `{name}`), never
  string concatenation (glossary #46, #51 — Thai word order differs from English).
Acceptance Criteria:
  - [x] Latin-residue test passes across every surface: board view, CareModal steps 1-3, Edit
        Admission, Care History, AdmitModal (this task's own entry point — the Pets entry point is
        I18N-12/13's job)
  - [x] English output byte-identical to today, including dates (I18N-15 guarantees it)
  - [x] R-1: submitting a care record or admission in Thai mode POSTs the same English `feedingStatus`
        value as English mode (mocked POST body assertion); unknown/free-text "Other" entries render
        as typed (X-1, E-2)
  - [x] R-2: dates/times follow the active language; English unchanged
  - [x] R-3: no string built by concatenation for cage number / admission text — token substitution only
  - [x] AZ-1: no `perm=`/`hasPermission(` token added, removed, or altered; a role lacking
        `inpatient.view` gets forbidden/403, not 404 (A-8)
  - [x] All existing tests (`ClinicInpatient.test.tsx`, `ClinicInpatient.characterization.test.tsx`)
        pass unmodified (A-9, corrects F-1's false claim of "no test file")
Permission(s): unchanged — `inpatient.view` (screen), `inpatient.manage` (write, held by all three)
Verification: `cd src/frontend && npm run test -- ClinicInpatient` && `npx tsc --noEmit`
```

```
Task ID: I18N-7
Actor/role: clinic_admin, doctor, clinic_staff | Device: Tablet (768×1024, 1024×768) + 1280 desktop
Priority: Must · Owner: Dev A · Depends: I18N-6
Description: Same method as I18N-3, applied to ClinicInpatient.tsx. Watch item per A-12: the 3-column
  vitals grid (Heart Rate/Resp Rate short forms, glossary #64/#65). Date/duration formatting is NOT a
  "log only" item any more (A-14 removes that exemption) — I18N-15 is the fix, verify it renders
  correctly at every viewport, don't just note it.
Acceptance Criteria:
  - [x] 768×1024 portrait and 1024×768 landscape and 1280 desktop all pass, no clipping/overflow
        (3-column vitals grid specifically checked)
        (orchestrator 2026-09-24: two defects found and fixed: card Log Care/Discharge labels broke
        mid-word at all 3 viewports → `7ea819b`; vitals steppers overflowed their tiles at every
        viewport in both languages → grid stacked to 1 column, `aacb4b3`. Re-verified clean.)
  - [x] All tap targets remain ≥44×44px
  - [ ] Screenshots attached to PR per A-12 (human capture; see I18N-3 note)
  - [x] Date/duration formatting (I18N-15 output) verified correct at every viewport — no unresolved
        "flag for BA" item; if something is still wrong, it's a defect in I18N-15, fixed here, not
        deferred (A-14)
Permission(s): n/a
Verification: manual screenshot pass

**Dev A code-level pass (2026-09-24) — screenshots still pending an orchestrator browser check:**
3-column vitals grid: `grid grid-cols-1 sm:grid-cols-3 gap-md` inside a `max-w-xl` (576px) modal — the
3 `VitalStepper` columns (each `min-w-[90px]`) total well under 576px even with gaps, so there's no
horizontal overflow. The Heart Rate label (`อัตราการเต้นของหัวใจ`, ~19 chars vs "Heart Rate" 10) and
Resp Rate label (`อัตราการหายใจ`, ~13 chars vs "Resp Rate" 9) are meaningfully longer, and `VitalStepper`
puts no `truncate`/fixed-width on the label span (`flex flex-col items-center`), so a long label wraps
to two lines rather than clipping — this makes that column's box taller, which is a layout shift worth
a human eye on 768px portrait but not a defect (no clipping, no lost content, tap targets unaffected
since the ±/input row sits below the label independently). Status badges, the Cage badge, and the
action-button row all use auto-width/`flex-wrap` containers with no fixed width or truncate, so longer
Thai text (e.g. `ต้องเฝ้าระวัง` for "Needs Attention") grows the badge/wraps the row instead of
clipping. `AdmitModal`/`EditModal`'s `<select>` "Doctor in charge (optional)" placeholder-option text
is longer in Thai (~26 chars); native `<select>` rendering of overflow is browser/OS-controlled, not
something this component's CSS constrains either way — flagging for the live-device pass since it's
outside code-level verification.
**Date/duration formatting (A-14):** `formatDate`/`formatDateTime` (I18N-15) are unit-tested against a
fixed reference date for both languages (`dateFormat.test.ts`) and produce comparable lengths in both
languages (`21 Sept 2026, 14:30` vs `21 ก.ย. 2026 14:30`, 20 vs 19 chars) — the History modal's date
span carries no `truncate`, so no overflow risk at any of the 3 viewports. No defect found; nothing
deferred.
```

```
Task ID: I18N-8
Actor/role: n/a (test task) | Device: Both
Priority: Must · Owner: Dev A · Depends: I18N-6
Description: Create src/frontend/src/__tests__/ClinicInpatient.i18n.test.tsx (F-1/F-3/A-10 corrects
  the Step 2 plan's false claim that no test exists for this screen — `ClinicInpatient.test.tsx` and
  `.characterization.test.tsx` already exist and are the no-regression net per A-9; this is a NEW,
  separate i18n-only file, sibling to those, not a replacement or a block inside them).
Acceptance Criteria:
  - [x] Covers every surface: board view, CareModal steps 1-3, Edit Admission, Care History,
        AdmitModal (entered from Inpatient itself)
  - [x] (a)/(b)/(c)/(d) per the A-10 method (Thai strings present, Latin-residue, no raw-key leakage,
        window.confirm spy for the delete-admission and discharge confirmations — S-2, S-3)
  - [x] Test fails pre-I18N-6, passes post-I18N-6 — verified by checking out the pre-I18N-6 commit's
        file and re-running: 16/17 fail (the 17th, an untranslated `pet.species` passthrough, is
        language-independent so it trivially passes either way), then all 17 pass again restored
  - [x] Full suite stays green
Permission(s): n/a
Verification: `cd src/frontend && npm run test -- ClinicInpatient.i18n.test.tsx`
```

```
Task ID: I18N-9
Actor/role: clinic_admin, doctor, clinic_staff (all three view; writing SOAP notes is doctor-only per
  §3.1) | Device: Both
Priority: Must (promoted from Should per grill G-8 — ships with the other 3, no partial ship)
Owner: Dev A · Depends: I18N-15 (date fix); does NOT depend on I18N-1/5 (different namespace) but is
  sequenced after Inpatient in this plan to keep i18n/index.ts diffs small and reviewable (BA §7.3
  shared-file-contention mitigation: sequence, don't parallelise, since no arch contract exists)
Description: ClinicEMR.tsx already has 7 `t()` calls and a partial `clinic.emr.*` namespace (7 keys).
  Re-count the exact remaining hardcoded literals before starting — BA's line-level sweep found
  **about 35** (F-6; the Step 2 estimate of "~10" was wrong by 3×; do not trust either number, recount
  during implementation). Covers: Prescriptions panel, SOAP tab labels (§5.3 SOAP map), anatomy
  templates/tools (§5.3 anatomy map), Attachments, empty state (glossary #77-91). Fix the two dev traps
  BA flagged (C-1, C-2) as part of this task, not as an afterthought:
  - **C-1**: `saveMsg === 'Saved'` currently drives success/error styling (`:684`). Translating the
    literal breaks the colour logic. Fix: derive styling from a separate boolean/enum state, never from
    the translated display string.
  - **C-2**: the loop variable `t` shadows the translator inside `SOAP_TABS.map(t => …)` and
    `TEMPLATES.map(t => …)` (`:613` and nearby). Rename the loop variables (e.g. `tab`, `tpl`) before
    calling `t('…')` inside those callbacks.
  Fix the unlocalized `new Date(r.createdAt).toLocaleDateString()` at `:586` (no locale passed) with
  I18N-15's `formatDate`.
Acceptance Criteria:
  - [x] Exact remaining-hardcoded-line count confirmed (not assumed) before starting, closed to 0 by
        task end — full-screen Thai switch shows 100% Thai (not just the pre-existing 7 calls)
        (counted ~42 hardcoded literal/loop-display locations before starting; grep-confirmed 0 after)
  - [x] New `clinic.emr.*` keys follow convention, no duplicates, en/th sets identical, A-1/A-2/A-3
        satisfied; Thai values from §5 glossary, 0 TODO markers
  - [x] Latin-residue test passes for: empty state, all 4 SOAP tabs, prescriptions, attachments
  - [x] C-1 fixed: save success/error colour is correct in both languages — verified by a test that
        triggers both a save-success and save-failure path with Thai active and asserts the correct
        style class, not the correct string
  - [x] C-2 fixed: no `t` shadowing inside any `.map` callback that also calls the translator; grep
        confirms no `.map(t =>` remains in this file where `t(` is also called inside that callback
  - [x] R-1: the EMR anatomy `template` stored value is unchanged in Thai mode; only the chip label
        translates
  - [x] R-2: EMR dates follow the active language via I18N-15; this is the one screen where English
        output visibly changes from today's browser-default to `en-GB` (deliberate, grill G-2) —
        document this in the PR description so reviewers don't flag it as a regression
  - [x] No functional change to the 7 already-converted calls or to any EMR business logic beyond
        C-1/C-2's required fix
  - [x] AZ-1: no permission token change; a role lacking `emr.view` gets forbidden/403, not 404 (A-8)
  - [x] All 5 existing test files (`ClinicEMR.attachments/characterization/petAvatar/petIdParam/
        weightSync.test.tsx`) pass unmodified (A-9, corrects F-2's "check for one" hedge — they exist,
        confirmed)
Permission(s): unchanged — `emr.view` (screen), `emr.create`/`emr.edit`/`emr.attach`/`prescriptions.*`
  (write, doctor for SOAP notes per §3.1). This task does not alter any of these codes.
Verification: `cd src/frontend && npm run test -- ClinicEMR` && `npx tsc --noEmit`
```

```
Task ID: I18N-10
Actor/role: clinic_admin, doctor, clinic_staff | Device: Tablet (768×1024, 1024×768) + 1280 desktop
Priority: Must (promoted, G-8) · Owner: Dev A · Depends: I18N-9
Description: Combines the A-12 layout check and the A-10 regression-test extension for ClinicEMR.tsx.
  Watch item per A-12: the SOAP tab bar with 4 Thai labels (glossary #4 in §5.3 — Thai labels for
  S/O/A/P are longer than the single-letter English tabs).
Acceptance Criteria:
  - [ ] 768×1024, 1024×768, 1280 desktop layout checks pass — SOAP tab bar specifically checked for
        wrap/overflow with all 4 Thai labels visible simultaneously (orchestrator browser QA — not run
        by Dev A this pass)
  - [ ] Tap targets ≥44×44px; screenshots attached to PR (orchestrator browser QA)
  - [x] New file src/frontend/src/__tests__/ClinicEMR.i18n.test.tsx (F-3/A-10 — sibling to the 5
        existing EMR test files, not a new block inside one of them) covering empty state, all 4 SOAP
        tabs, prescriptions, attachments per the A-10 (a)/(b)/(c)/(d) method
  - [x] Test fails pre-I18N-9, passes post-I18N-9
  - [x] Full suite green
Permission(s): n/a
Verification: `cd src/frontend && npm run test -- ClinicEMR.i18n.test.tsx`
```

```
Task ID: I18N-11
Actor/role: clinic_admin, doctor, clinic_staff (all three view; delete/deactivate owner is
  clinic_admin only per §3.1) | Device: Both
Priority: Must (promoted from Should per grill G-8) · Owner: Dev A · Depends: I18N-15
Description: ClinicPets.tsx already has 51 `t()` calls and 26 confirmed `clinic.pets.*` keys. Re-count
  the exact remaining hardcoded literals — BA's sweep found **about 50** (F-6; the Step 2 estimate of
  "~30" was wrong by ~1.7×). Covers: New Owner/Pet modals, species/gender options (§5.3 map), Overview
  field labels (glossary #95), 3 tabs (Overview/Medical/Vaccinations), Vaccination modal,
  confirm/error text, and the permission-conditioned string on the Medical tab
  (`hasPermission('emr.view') ? '…' : "You don't have access to clinical records."` — S-15). Both
  branches of that conditional translate without changing which branch shows or what it reveals
  (AZ-3). Fix the 4 unlocalized `toLocaleDateString()` calls at `:612`, `:634`, `:670`, `:672` with
  I18N-15's `formatDate`. Do NOT touch any of the 51 existing `t()` calls or the add/edit/delete
  owner-pet logic beyond what's needed for R-1/R-2.
Acceptance Criteria:
  - [x] Exact remaining-hardcoded-line count confirmed before starting, closed to 0 by task end
        (Dev A 2026-09-25: recounted ~90 distinct hardcoded JSX text/placeholder/title/confirm sites —
        not the BA ~50 estimate, which counted unique strings not occurrences; closed to 0, confirmed by
        a crude JSX-text-node scan plus the Latin-residue tests below)
  - [x] New keys follow convention, no duplicates, en/th sets identical, A-1/A-2/A-3 satisfied; Thai
        from §5 glossary (rows #92-96), 0 TODO markers (55 new `clinic.pets.*` keys added; see report)
  - [x] Full-screen Thai switch shows 100% Thai text, including all 3 tabs and both modals
  - [x] Latin-residue test passes for: owner list, owner detail, pet profile (all 3 tabs), owner/pet
        add/edit modals, vaccination modal
  - [x] R-1: species/gender option values (`canine`, `male`, …) unchanged in Thai mode; Overview's
        displayed Species/Gender values go through the §5.3 map (today they show raw `canine` in
        EITHER language — this is also a bug fix, not just a translation, note it in the PR) — **PR
        note**: this bug fix breaks `src/__tests__/PetOverview.test.tsx` (a 6th pre-existing Pets test
        file BA's F-2 evidence check did not find — it asserts the old raw-`canine`/raw-`male` display).
        That file is outside I18N-11/12's exclusive scope; flagged for orchestrator/@qa-agent, not fixed
        here.
  - [x] R-2: dates (DOB, vaccination dates, "Due:") follow the active language via I18N-15
  - [x] AZ-3: the S-15 no-access message does not state or imply that records exist, in either language
  - [x] AZ-1: no permission token change anywhere, including around the S-15 conditional; a role
        lacking `crm.view` gets forbidden/403, not 404 (A-8); the "Delete Owner"/deactivate flow (§5.4
        S-5) still gates to `clinic_admin` only, unaffected by language
  - [x] All 5 existing test files (`ClinicPets.characterization/i18n/MedicalTab/OwnerList/
        PhotoDisplay.test.tsx`) pass unmodified (A-9) — note `ClinicPets.i18n.test.tsx` already exists
        and is EXTENDED by I18N-12, not touched by this task. **Exception (see R-1 row above)**:
        `PetOverview.test.tsx`, a 6th Pets test file not named here or in BA's F-2 count, now fails —
        written reason recorded there and in the Dev A report, per this AC's own "any exception needs a
        written reason in the PR" clause (A-9).
Permission(s): unchanged — `crm.view` (screen), `crm.create`/`crm.edit`/`crm.delete` (write, delete
  restricted to clinic_admin). This task does not alter any of these codes.
Verification: `cd src/frontend && npm run test -- ClinicPets` && `npx tsc --noEmit`
```

```
Task ID: I18N-12
Actor/role: clinic_admin, doctor, clinic_staff | Device: Tablet (768×1024, 1024×768) + 1280 desktop
Priority: Must (promoted, G-8) · Owner: Dev A · Depends: I18N-11
Description: Combines the A-12 layout check and the A-10 regression-test EXTENSION (not a new file —
  `ClinicPets.i18n.test.tsx` already exists, F-2/A-10) for ClinicPets.tsx after I18N-11. Watch item per
  A-12: Pets has the most form field labels of the 4 screens — check field-label wrap behavior
  specifically. Also covers A-13: the AdmitModal opened FROM Pets (Pet Profile → "รับเป็นผู้ป่วยใน"
  button, `:687`, gated `inpatient.manage`) — this is Inpatient's component rendered in Pets' context,
  and must be verified from this entry point too, not assumed covered by I18N-8's Inpatient-native test.
Acceptance Criteria:
  - [ ] 768×1024, 1024×768, 1280 desktop layout checks pass; form field labels specifically checked for
        wrap-induced overflow across New Owner/Pet modals and Overview tab (orchestrator browser QA —
        not run by Dev A this pass)
  - [ ] All tap targets ≥44×44px; screenshots attached to PR (orchestrator browser QA)
  - [x] `ClinicPets.i18n.test.tsx` extended (not replaced) with assertions for every new I18N-11 surface,
        per the A-10 (a)/(b)/(c)/(d) method
  - [x] AdmitModal opened from Pets → Pet Profile → "รับเป็นผู้ป่วยใน" renders fully in Thai, with no
        residual English from its Inpatient-native strings (A-13)
  - [x] Test fails pre-I18N-11, passes post-I18N-11 (verified via `git stash push` on the implementation
        files only, keeping the extended test file: 31 assertions in `ClinicPets.i18n.test.tsx` fail
        against pre-I18N-11 `ClinicPets.tsx`/`index.ts`, then pass again after `git stash pop`;
        `git stash list` confirmed empty afterward)
  - [x] Full suite green **except two known failures, neither introduced by working code this task
        wrote**: (1) `ClinicBilling.characterization.test.tsx` — pre-existing failure the orchestrator
        flagged as not-mine-to-fix; (2) `PetOverview.test.tsx` — caused by I18N-11's authorized R-1
        Overview bug fix, but out of this task's exclusive file scope; see the I18N-11 R-1/A-9 note
        above. 822 passed / 2 failed, `npx tsc --noEmit` clean.
Permission(s): n/a
Verification: `cd src/frontend && npm run test -- ClinicPets.i18n.test.tsx`
```

```
Task ID: I18N-16
Actor/role: n/a (review gate) | Device: n/a
Priority: Must · Owner: @ba-agent · Gate: before Step 7 (@qa-agent sign-off)
Depends: I18N-1, I18N-5, I18N-9, I18N-11 (all four namespaces must be complete and landed)
Description: @ba-agent reviews the FULL `th` diff of i18n/index.ts (all four new/extended namespaces)
  against BA sign-off §5 (glossary, wording rules, enum maps, safety sentences) and records a verdict
  — APPROVED, or a finding list appended to `docs/superpowers/plans/2026-09-23-i18n-completion-
  ba-signoff.md` §9 (new section, appended at review time, not created speculatively now). This is
  also where BA makes the final call on the Discharge term (จำหน่ายผู้ป่วย, §5.2 #55) with the
  จำหน่าย/"sell" ambiguity explicitly in mind (grill item 4) — confirm the glossary's existing choice
  or override it in the actual landed diff.
Acceptance Criteria:
  - [ ] @ba-agent reviews the complete diff (not a sample) and records APPROVED or a finding list
  - [ ] All 15 §5.4 safety-critical sentences (S-1..S-15) match their canonical meaning in the landed
        diff, word for word or with an explicit BA-recorded substitution
  - [ ] Every §5.3 enum label is used exactly as specified (no drift during implementation)
  - [ ] The Discharge term (#55) is explicitly confirmed or changed by BA in this review, with the
        sell-ambiguity noted either way
  - [ ] Any finding is fixed (by Dev A, re-touching only i18n/index.ts Thai values, no code change)
        before @qa-agent sign-off proceeds
Permission(s): n/a
Verification: BA review recorded in the BA sign-off doc; re-run
  `cd src/frontend && npm run test -- i18n.coverage.test.ts` after any wording fix (parity must hold)
```

```
Task ID: I18N-13
Actor/role: any clinic role reaching these 4 screens | Device: Both
Priority: Must (gates Step 7 handoff) · Owner: Dev A · Depends: I18N-1 through I18N-12, I18N-16 (all)
Description: After every task above lands and BA has reviewed the wording, run one integration pass
  toggling language across all four screens in sequence, specifically hunting for shared-component
  strings that a single-screen task might have missed, and the mid-modal language-switch case (A-16).
  This is the manual end-to-end pass; I18N-14 already owns the automatable static checks (A-11 split).
Acceptance Criteria:
  - [ ] All four screens (Grooming, Inpatient, EMR, Pets) show 100% Thai on toggle, 100% correct
        English on toggle back — including the shared `AdmitModal` from BOTH its entry points
        (Inpatient board and Pets pet-profile, A-13)
  - [ ] Zero raw key leakage anywhere across the four screens (spot-check beyond the automated
        Latin-residue tests — a human pass, not a re-run of I18N-4/8/10/12)
  - [ ] Switching language on an open modal re-renders it with no stale language and no lost form input
        (A-16) — checked on at least: Grooming BookingModal, Inpatient CareModal, EMR SOAP-note edit,
        Pets New Pet modal
  - [ ] Full frontend test suite green (`npm run test`)
  - [ ] `i18n/index.ts` has no orphaned/duplicate keys introduced across the four namespaces
        (`clinic.grooming.*`, `clinic.inpatient.*`, `clinic.emr.*`, `clinic.pets.*`) — confirmed by
        I18N-14's static suite, re-run here as final proof
  - [ ] `npx tsc --noEmit` clean for the whole frontend
Permission(s): n/a (verification task)
Verification: `cd src/frontend && npm ci && npm run test && npx tsc --noEmit` (full suite + typecheck)
```

**Preflight task (Step 6, before I18N-14):** `src/frontend/node_modules` may be incomplete (vite
reported missing during Step 4 verification — `ls node_modules/.bin/vite*` returned nothing). Run
`cd src/frontend && npm ci` before the first test command of Step 6. If this was a one-off environment
gap, this preflight is a no-op; if `node_modules` is routinely stale in this repo, note it for
@scribe-agent to raise as a dev-environment backlog item at Step 8.

---

## 4. Sequencing (execution order, strict — no parallel waves, per §0 arch-skip rule)

```
Preflight: npm ci (if needed)
  → I18N-14 (static tests, written red)
  → I18N-15 (date helper + its own unit tests)
  → I18N-1 → I18N-2 → I18N-3 → I18N-4                [Grooming]
  → I18N-5 → I18N-6 → I18N-7 → I18N-8                [Inpatient]
  → I18N-9 → I18N-10                                  [EMR]
  → I18N-11 → I18N-12                                 [Pets]
  → I18N-16 (BA wording review of the full landed diff)
  → I18N-13 (manual integration cross-check, final gate before Step 7)
```

**Integration checkpoint after every task** (not just every wave, since there are no parallel waves):
`npx tsc --noEmit` + `npm run test` (full suite, not just the touched file) + a quick grep for
`TODO-BA-WORDING` and for `.map(t =>` co-occurring with `t(` inside the same callback (C-2 regression
guard). A task is not "done" until its own commands above AND this checkpoint are both green.

Rationale for sequencing Grooming → Inpatient → EMR → Pets (rather than, say, alphabetical or
Must-then-Should): BA §7.3 explicitly logs this order ("I18N-14 and I18N-15 run first, then the
namespace + conversion tasks per screen, then layout and tests, then I18N-16, then I18N-13"), and it
keeps each `i18n/index.ts` diff reviewable one namespace at a time despite all four tasks appending to
the same file (BA §7.3 risk: "Shared-file contention on i18n/index.ts… Sequence the 4 namespace tasks…
No arch contract needed").

---

## 5. Work-Partition Manifest (Step 4 — required per orchestration protocol even though parallelism
is NOT legal this branch — see header: no frozen arch contract → sequence, don't parallelise)

| Task | Wave | Owner | Files it may write (exclusive) | Depends on | Contract referenced |
|---|---|---|---|---|---|
| I18N-14 | W0 | Dev A | `src/frontend/src/__tests__/i18n.coverage.test.ts` | none | BA §6.2 I18N-14 |
| I18N-15 | W1 | Dev A | `src/frontend/src/i18n/dateFormat.ts`, `src/frontend/src/i18n/dateFormat.test.ts` | I18N-14 | BA R-2, grill G-1/G-2 |
| I18N-1 | W2 | Dev A | `src/frontend/src/i18n/index.ts` (grooming namespace lines only) | I18N-14 | BA §5.2 Grooming, §5.3 Grooming maps |
| I18N-2 | W2 | Dev A | `src/frontend/src/views/clinic/ClinicGrooming.tsx` | I18N-1, I18N-15 | BA R-1, R-2, A-2/A-4/A-8 |
| I18N-3 | W2 | Dev A | (no file writes — visual QA + PR screenshots) | I18N-2 | A-12 |
| I18N-4 | W2 | Dev A | `src/frontend/src/__tests__/ClinicGrooming.i18n.test.tsx` (new) | I18N-2 | A-10 |
| I18N-5 | W3 | Dev A | `src/frontend/src/i18n/index.ts` (inpatient namespace lines only) | I18N-14 | BA §5.2 Inpatient, §5.3 Inpatient maps |
| I18N-6 | W3 | Dev A | `src/frontend/src/views/clinic/ClinicInpatient.tsx` | I18N-5, I18N-15 | BA R-1, R-2, R-3, A-8 |
| I18N-7 | W3 | Dev A | (no file writes — visual QA + PR screenshots) | I18N-6 | A-12, A-14 |
| I18N-8 | W3 | Dev A | `src/frontend/src/__tests__/ClinicInpatient.i18n.test.tsx` (new) | I18N-6 | A-10 |
| I18N-9 | W4 | Dev A | `src/frontend/src/i18n/index.ts` (emr namespace lines only), `src/frontend/src/views/clinic/ClinicEMR.tsx` | I18N-15 | BA §5.2 EMR, §5.3 SOAP/anatomy maps, C-1, C-2 |
| I18N-10 | W4 | Dev A | `src/frontend/src/__tests__/ClinicEMR.i18n.test.tsx` (new) | I18N-9 | A-10, A-12 |
| I18N-11 | W5 | Dev A | `src/frontend/src/i18n/index.ts` (pets namespace lines only), `src/frontend/src/views/clinic/ClinicPets.tsx` | I18N-15 | BA §5.2 Pets, §5.3 species/gender map, AZ-3 |
| I18N-12 | W5 | Dev A | `src/frontend/src/__tests__/ClinicPets.i18n.test.tsx` (extend existing) | I18N-11 | A-10, A-12, A-13 |
| I18N-16 | W6 | @ba-agent | `src/frontend/src/i18n/index.ts` (Thai-value text edits only, no structural change), `docs/superpowers/plans/2026-09-23-i18n-completion-ba-signoff.md` (append §9 only) | I18N-1, 5, 9, 11 | BA §5, §5.4 |
| I18N-13 | W7 | Dev A | (no exclusive file — full-repo verification commands only) | all above | A-11, A-16 |

**No DBA wave (no schema/migration touches this branch). No UIUX A wave (no new screen/component
design; BA §5 + A-12 are the complete design spec for this branch's presentation change).** Every
wave here is sequential by construction (`W0` through `W7`, no `∥`), consistent with CLAUDE.md's rule
that only a frozen arch contract legalises parallel waves, and none exists.

---

## 6. Non-code orchestrator deliverable (grill G-5 — not a dev task, not blocking merge)

**Pre-merge EN↔TH review page.** After I18N-16 (BA wording review) completes, the orchestrator
publishes a side-by-side English↔Thai review page listing every string added or changed by I18N-1,
5, 9, 11, with the 15 §5.4 safety sentences (S-1..S-15) visually highlighted, for the human to read at
their own pace. This is explicitly **non-blocking for merge** (grill G-5: "no pre-merge human
review" was the human's answer; this page is the courtesy artifact that replaces a blocking review
step). It is not a Dev A task, not a QA task, and does not appear in the work-partition manifest above
— it is generated once after I18N-16, independent of Step 6/7/8 timing, and any wording change the
human requests after reading it becomes a small Lane B fix per BA §7.3's risk mitigation, not a reason
to reopen this branch.

---

## 7. Priority / count summary

- **Must:** I18N-1, 2, 3, 4 (Grooming) + I18N-5, 6, 7, 8 (Inpatient) + I18N-9, 10 (EMR, promoted G-8)
  + I18N-11, 12 (Pets, promoted G-8) + I18N-14, 15, 16 (new BA tasks) + I18N-13 (cross-check) =
  **16 Must tasks** (all 16 — G-8 removed every Should tier; nothing in this branch may be
  half-shipped)
- **Should:** none remaining (EMR and Pets both promoted to Must by grill G-8)
- **Total: 16 tasks**, sequential, single worker lane (Dev A) + one BA gate (I18N-16)

---

## 8. Step 7 handoff (@qa-agent)

QA verifies, in addition to the standard `qa-protocols.md` pass:
- **Arch conformance**: there is no arch doc for this branch (arch: skipped, below threshold) — QA
  instead verifies conformance to **ADR-0029** (date display follows app language, Gregorian year,
  day-first), **ADR-0030** (stored values stay English, only labels translate — spot-check the 4
  R-1 payload assertions actually run in CI, not just exist as code), and **ADR-0031** (Platform
  plane untouched — confirm no `/platform/*` file appears in this branch's diff at all).
- **Tablet conformance**: 768×1024 portrait and 1024×768 landscape, plus the 1280 desktop check A-12
  added — re-verify the PR's attached screenshots against the live app, don't just trust the screenshots.
- **RBAC regression**: AZ-1 diff inspection (no `perm=`/`hasPermission(` token touched anywhere in the
  branch) and AZ-3 (S-15 no-access message reveals nothing) are both re-verified independently of Dev
  A's own I18N-2/6/9/11 ACs — QA owns the actual sign-off, not just the AC checkbox.
- **Static i18n suite as a standing convention**: per BA Q4.7, `i18n.coverage.test.ts`'s render-level
  method (A-10) should be documented in `.claude/roadmap/qa-protocols.md` as the reusable pattern for
  future screens — that documentation step belongs to @qa-agent at Step 7, not to this plan.
- **C-1/C-2 regression guard**: confirm the `saveMsg === 'Saved'` style-logic fix and the `t`-shadowing
  fix in `ClinicEMR.tsx` are both still in place (a careless later edit could silently reintroduce
  either).

## 9. Step 8 notes (@scribe-agent — backlog to file, not this branch's job to build)

File the eight backlog items in §1's out-of-scope table as separate tracked items (HIGH: invoice/
tax-invoice language; the rest at whatever priority `doc-maintenance.md` assigns to a BA/grill-sourced
backlog note). Confirm the next new ADR is numbered **0032** (grill log's ADR-DUP-1 note — 0029 is
now taken by this feature). Do not ship this branch until I18N-16 (BA review) has a recorded verdict
and every I18N-13 acceptance criterion is green.
