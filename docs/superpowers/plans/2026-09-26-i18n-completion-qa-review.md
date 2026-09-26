# STEP 7 — `/code-review` + QA sign-off: i18n-completion

**Reviewer:** `@qa-agent` · **Date:** 2026-09-26 · **Branch:** `feature/i18n-completion` @ `a2083a7`
**Diff reviewed:** `origin/main...HEAD` (31 commits, 26 files; `origin/main` already merged at `202fb41`)
**Architecture reference:** `arch: skipped (below threshold)`. Conformance is checked against the plan
(`2026-09-24-i18n-completion.md`), the BA sign-off incl. §9, and ADR-0029/0030/0031.

> **Final verdict after the re-check (see the "Re-check" section at the end): APPROVE.** M-1 and M-2 were
> closed by `b2afca3`. The initial verdict below is kept for the record.

## Initial verdict: **REQUEST CHANGES** (test-only; no production-code change requested)

Production code is correct by inspection on every check below. Sign-off is blocked by one binding
acceptance criterion: BA amendment **A-5** (R-1 payload assertion). The plan ticks it `[x]`, but it has
no test on two of the four screens (M-1, M-2). A ticked AC with no test blocks sign-off.
Both are small test additions for `@dev-agent`. Re-run the suite afterwards and return to `@qa-agent`
for a re-check (expected: same totals + 2 tests).

## Test totals (run by QA, from `src/frontend`)

| Check | Result |
|---|---|
| `npx tsc --noEmit -p .` | **clean** (exit 0) |
| `npx vitest run` (1st run, default workers) | **incomplete**: 69 files / 549 tests passed, but 11 files never started (`[vitest-pool]: Failed to start forks worker … Timeout waiting for worker to respond`). This is machine load (it ran right after `tsc`); no assertion failed. It does not count as a result |
| `npx vitest run --maxWorkers=4` (complete run) | **80 files passed (80) / 831 tests passed (831)**, 0 errors, exit 0. Matches the expected 80/831 |
| Backend | Not run. No backend diff (verified below), so there is nothing branch-specific to test. Known baseline: `beforeAll` hook timeouts under full-parallel load, and integration tests write to the dev DB. That is a Step 8 red-suite gate concern, not a regression from this branch |

## Findings (ranked)

### Medium — block sign-off (test coverage for a binding AC)

**M-1. A-5/R-1: the Grooming `serviceType` Thai-mode POST body is not asserted.**
- Plan `2026-09-24-i18n-completion.md:219-221` ticks *"submitting a booking in Thai mode POSTs the same
  English `serviceType` value as English mode (asserted on the mocked POST body)"*.
- `src/frontend/src/__tests__/ClinicGrooming.i18n.test.tsx` mocks `api.post` (line 40) but never asserts
  it. Its only R-1 test (line 143) checks visible text. The existing POST-payload test
  `views/clinic/__tests__/ClinicGrooming.bookingModal.test.tsx:66-80` runs in English mode only.
- The code is correct: `ClinicGrooming.tsx:193` `setServiceType(s)` stores the raw value, and the chip
  only displays `serviceLabel(t, s)`.
- **Fix (@dev-agent, test only):** in `ClinicGrooming.i18n.test.tsx` (Thai `uiStore` mock), open the
  modal, pick a pet, click the Thai chip for a non-default service (e.g. the label of `'Full Groom'`),
  click the Thai "book" button, and assert
  `post` was called with `('/api/grooming/bookings', expect.objectContaining({ serviceType: 'Full Groom' }))`.
  Name the test `R-1 (A-5): Thai-mode booking POSTs the English serviceType`.

**M-2. A-5/R-1: the EMR anatomy `template` payload in Thai mode is not asserted.**
- BA §6.1 A-5 names EMR anatomy `template` among the values *"asserted on the mocked POST body"*, and the
  plan ticks it at `2026-09-24-i18n-completion.md:446`.
- `src/frontend/src/__tests__/ClinicEMR.i18n.test.tsx:249` checks visible tab text only. No test inspects
  `anatomyAnnotation.template` in a save payload.
- The code is correct: the template is raw (`ClinicEMR.tsx:65,87,156`). It is hydrated from the record at
  `:522` and sent at `:550`, and the chip displays `anatomyTemplateLabel(t, tpl)`.
- **Fix (@dev-agent, test only):** jsdom has no real canvas, so don't draw. In `ClinicEMR.i18n.test.tsx`,
  load an existing record fixture with `anatomyAnnotation: { template: 'Feline - Lateral', imageData:
  'data:…' }`, save in Thai mode, and assert the PUT/POST mock body contains
  `anatomyAnnotation: expect.objectContaining({ template: 'Feline - Lateral' })`.
  Name it `R-1 (A-5): Thai-mode save keeps the English anatomy template`.

### Low — non-blocking, recommend backlog

**L-1. `genderLabel` is case-sensitive, but `speciesLabel` is case-insensitive.**
`ClinicPets.tsx:38-46` (`GENDER_LABEL_KEYS[gender]`) vs `i18n/speciesLabel.ts:31` (`species.toLowerCase()`).
Because the backend accepts any string (BA §9.6), a stored `Male`/`Female` would render raw in Thai.
X-1 means no crash. Fix alongside the §9.6 stored-vocabulary cleanup, or lower-case the lookup.

**L-2. The species chip colour ignores the `dog`/`cat` aliases.**
`ClinicPets.tsx:24-31`: `speciesColor` only has `canine`/`feline`. A stored `Dog` now shows the canine
*label* (from `speciesLabel`) but the neutral chip *colour*. This is display only, and it goes away with
the §9.6.2 data cleanup.

### Info — no action on this branch

- **I-1.** `aacb4b3` changes the Log Care vitals grid to `grid-cols-1` at every width, including English
  desktop, so the modal gets taller. It's deliberate and sound: 3 steppers could not fit the modal width
  at `sm:grid-cols-3`. English content is unchanged.
- **I-2. Five orphan keys pre-exist on `main`, and this branch adds none of them:**
  `clinic.pets.addPet`, `clinic.pets.deleteOwner`, `clinic.pets.address`, `clinic.pets.idCardNumber`,
  `clinic.pets.deleteBlockedActivePets`. The I18N-14 suite does not check for orphans. Backlog.
- **I-3.** I18N-14's "every literal `t('…')` key exists" check can't see keys held in maps
  (`STATUS_LABEL_KEYS`, `SERVICE_LABEL_KEYS`, `SOAP_TAB_LABEL_KEYS`, `ANATOMY_TEMPLATE_LABEL_KEYS`,
  `GENDER_LABEL_KEYS`, `SPECIES_LABEL_KEYS`). QA checked them with a script: **all keys referenced in
  the 4 screens and `speciesLabel.ts` exist in both en and th, and every key is defined exactly twice
  (no duplicates)**. Backlog: extend the static suite to quoted `'clinic.*'`/`'common.*'` literals.
- **I-4.** `ClinicEMR.tsx:564` stores the translated "Saved" text in state, so a language switch within
  the 2 s display window shows the old language. Negligible. C-1 itself is fixed correctly: colour is
  driven by `saveStatus` (`:723`), not by comparing text.
- **I-5.** No Gherkin `@AC-…` tags exist in this feature's docs (it predates the tag rule). Traceability
  below uses the BA amendment / plan AC IDs instead.

## Checks performed

### 1. Correctness: R-1 / ADR-0030 (stored values stay English)
| Surface | Stored/sent value | Display | Verdict |
|---|---|---|---|
| Grooming `serviceType` | `SERVICE_TYPES` raw → state → POST (`ClinicGrooming.tsx:90,193`) | `serviceLabel()` | ✅ code · ❌ Thai-mode test (M-1) |
| Grooming `status` | `STATUS_NEXT`/`STATUS_COLORS` keyed on raw value; PUT sends raw `nextStatus` | `statusLabel()` (also in the `title`) | ✅ |
| Inpatient `status`, `feedingStatus` | raw; `<option value={v}>` | `statusLabel()`/`feedingLabel()` | ✅ (Thai-mode POST tested, `ClinicInpatient.i18n.test.tsx:212,318`) |
| EMR SOAP tab keys | `SOAP_TABS` typed union; `soapTab === tab` compares keys | `soapTabLabel()` | ✅ |
| EMR anatomy `template` | raw | `anatomyTemplateLabel()` | ✅ code · ❌ Thai-mode test (M-2) |
| Pets `species`/`gender` | `<option value="canine">` etc. unchanged | `speciesLabel()`/`genderLabel()` | ✅ (Thai-mode POST tested, `ClinicPets.i18n.test.tsx:418`) |

- **C-1** (comparing translated strings): none. A grep for `=== t(` / `t(…) ===` across the 4 screens finds
  nothing. The EMR save colour now uses `saveStatus`.
- **C-2** (shadowed `t`): none. There is no `.map(t =>`, `(t,` or `let t` in the 4 screens. `t` appears
  only as `useT()` or as a typed helper parameter.
- **API surface unchanged:** the sorted `api.get/post/put/patch/delete(<url>` call sites in all 4 screens
  are byte-identical to `origin/main`.
- `window.confirm` messages use `{name}`/`{file}` token substitution (R-3). The tokens match en↔th
  (enforced by the I18N-14 suite).

### 2. Dates: ADR-0029
- There is no `toLocale*` or `Intl` call left in any of the 4 screens. Every date goes through
  `i18n/dateFormat.ts` (`formatDate`, `formatDateTime`, `formatShortDate`) with the store `language`.
- `th` uses `th-TH-u-ca-gregory`, so the year stays Gregorian (not BE) and matches the native date
  pickers. `en` uses `en-GB`, day-first. English output is byte-identical for Grooming and Inpatient. EMR
  and Pets change from browser-default to en-GB, which is deliberate (grill G-2); the PR body must say so.
- The Thai weekday abbreviations are hardcoded per glossary §5.2, and `dateFormat.test.ts` pins the
  outputs.
- Pre-existing, not a regression: a date-only `birthDate` string is parsed as UTC midnight, so it could
  show the previous day in time zones behind UTC. It is correct in `Asia/Bangkok`.

### 3. Layout fixes
- `7ea819b`: Inpatient card buttons get `whitespace-nowrap px-sm`. The parent row is `flex flex-wrap`
  (`ClinicInpatient.tsx:647`), so long labels wrap to a new row instead of overflowing. English is
  unaffected and the 44 px targets are kept. ✅
- `aacb4b3`: vitals grid changes to 1 column (I-1). ✅
- `304b6ac`: SOAP tab bar gets `flex-wrap`, and each tab gets `whitespace-nowrap flex-shrink-0`. Tabs stay
  whole and move to a second row only when needed. English (4 short labels) stays on one row at
  1024/1280. `min-h-[44px]` is kept. ✅

### 4. Deliberate test changes: coverage not weakened
- `2cebfe8` `PetOverview.test.tsx`: the old assertions (`'canine'`, `'male'`, browser-locale date) locked
  in the I18N-11 defect. The new ones assert the correct labels (`Canine`/`Male`) and the ADR-0029
  formatter. Same number of assertions, same rows, and a stronger oracle. The expected date comes from
  `formatDate(…, 'en')`, the function under test, but `dateFormat.test.ts` pins its literal output, so the
  chain is still anchored. **Human-approved A-9 exception; the PR body must say so.** ✅
- `52fa3a6`: three Thai literal re-pins that exactly match the BA §9.3 value edits (`statusAdmitted`, the
  S-2 discharge confirm, `selectOwnerHint`). Test intent is unchanged. ✅
- `ClinicPets.i18n.test.tsx`: the mocks were restructured, but all 3 original tests and their assertions
  are kept verbatim (lines 182-201). No other pre-existing test file changed (A-9). ✅

### 5. i18n integrity
- The I18N-14 suite (`src/__tests__/i18n.coverage.test.ts`) runs and passes in the complete run. It covers
  en→th and th→en parity, every literal `t('…')` key existing in en, and matching `{token}` sets per key
  (R-3).
- Duplicate keys: none. `tsc` would reject a duplicate property (TS1117), and the QA script counted
  exactly 2 definitions per key. Orphans: 5, all pre-existing (I-2). Map-held keys: verified by script
  (I-3).

### 6. Isolation / RBAC: unchanged (expected pass, confirmed)
- **No backend diff.** `git diff --name-only origin/main...HEAD` touches only `src/frontend/**`, `docs/**`
  and `CONTEXT.md`.
- **No permission or guard change (AZ-1).** The sorted `hasPermission('…')`, `<Can perm="…">` and
  `perm="…"` tokens per screen are identical to `origin/main`:
  EMR has 3× `emr.attach`. Pets has `crm.delete`×2, `crm.edit`×2, `emr.view`, `inpatient.manage`,
  `vaccination.create`, and `hasPermission` on `crm.delete` and `emr.view`×2. Grooming and Inpatient
  have none in-file (they are route-guarded). Only the *text* inside the existing `emr.view` ternaries
  was translated.
- There are no new routes, queries or repository calls, so tenant isolation (cross-tenant → 404) and the
  RBAC matrix are unaffected. Platform plane: ADR-0031 keeps it English-only, and no `/platform` file is
  touched. No STOP-and-escalate condition applies.

## Acceptance-criteria traceability (BA amendments / plan ACs)

| AC | Test evidence | Status |
|---|---|---|
| A-1 no `TODO-BA-WORDING` | grep = 0 | ✅ |
| A-2 en byte-identical | existing English suites pass unmodified (except the A-9 exception) | ✅ |
| A-3 R-3..R-6 key rules | `i18n.coverage.test.ts` token parity; script check | ✅ |
| A-4/A-10 Latin residue + no raw key | `(b)/(c)` tests in the 4 `*.i18n.test.tsx` files | ✅ |
| **A-5 R-1 payload in Thai mode** | Inpatient ✅ (`:212`, `:318`) · Pets ✅ (`:418`) · **Grooming ❌ (M-1)** · **EMR template ❌ (M-2)** | **❌ blocks** |
| A-6 R-2 dates | `dateFormat.test.ts`; EMR `(a)` date test; PetOverview | ✅ |
| A-7 C-1/C-2 | `ClinicEMR.i18n.test.tsx:268-287`; grep clean | ✅ |
| A-8 AZ-1 | guard-token diff identical (above) | ✅ |
| A-9 existing tests unmodified | only `2cebfe8` (approved exception) + `52fa3a6` (BA-mandated) | ✅ |
| A-10(d) Thai `window.confirm` | Inpatient S-2, EMR S-4, Pets S-5 spy tests | ✅ |
| A-12 viewports | browser QA per HANDOFF; screenshots pending (human) | ✅ (manual) |
| A-13 AdmitModal from Pets | W7 manual cross-check | ✅ (manual) |
| A-16 mid-modal switch | W7 manual (5 modals) | ✅ (manual) |
| I18N-14 static suite | passes | ✅ |
| I18N-15 date helper | `dateFormat.test.ts` | ✅ |
| I18N-16 T1/T2/T3 | `52fa3a6`, `16c4eb5`, `3d5eb65` + `speciesLabel.test.ts` | ✅ |

## Hand-back

- **To the orchestrator → `@dev-agent`:** M-1 and M-2 (tests only, two files:
  `src/frontend/src/__tests__/ClinicGrooming.i18n.test.tsx`, `src/frontend/src/__tests__/ClinicEMR.i18n.test.tsx`).
  Then return to `@qa-agent` for a re-check. Expect APPROVE once both pass in a complete run.
- **To `@pm-agent` backlog:** L-1, L-2, I-2, I-3 (plus the HANDOFF backlog items already listed).
- **To `@scribe-agent` (Step 8):** the PR body must note the A-9 exception (`2cebfe8`) and the deliberate
  EMR/Pets English date-format change (grill G-2).

Initial verdict (superseded by the re-check below): ❌ REQUEST CHANGES, test-only: M-1, M-2

## Re-check: 2026-09-26 (`@dev-agent` fix `b2afca3`)

**Scope:** `git diff 3616189..HEAD --stat` shows one commit (`b2afca3`) touching exactly
`src/frontend/src/__tests__/ClinicGrooming.i18n.test.tsx` (+19/−1) and
`src/frontend/src/__tests__/ClinicEMR.i18n.test.tsx` (+21). **No production file changed** since the
initial review.

| Finding | New test | Assessment | Status |
|---|---|---|---|
| M-1 | `ClinicGrooming.i18n.test.tsx` › `R-1 (A-5): Thai-mode booking POSTs the English serviceType` | Thai `uiStore` mock. Opens the modal via the Thai "จองคิวใหม่" and picks pet มะลิ. Clicks the **non-default** Thai chip "อาบน้ำตัดขนครบชุด", so a test that only saw the default value could not pass. Submits via "ยืนยันการจอง" and asserts `postMock` was called with `('/api/grooming/bookings', objectContaining({ serviceType: 'Full Groom' }))`. `post` is now routed through a named `postMock`; `get`/`put` are unchanged | ✅ closed |
| M-2 | `ClinicEMR.i18n.test.tsx` › `R-1 (A-5): Thai-mode save keeps the English anatomy template` | Hydrates record 7 with `anatomyAnnotation.template = 'Feline - Lateral'` (not the default template), saves via the Thai "บันทึกข้อมูล", waits for "บันทึกแล้ว", and asserts the PUT body `anatomyAnnotation` contains `template: 'Feline - Lateral'`. `recordsStore` and `putMock` are reset in `beforeEach` (`:102-108`), so there's no cross-test leak | ✅ closed |

**Independent mutation check (by QA, reverted, nothing committed):** I changed Grooming to
`setServiceType(serviceLabel(t, s))` and EMR to send `anatomyTemplateLabel(t, template)` in the save
payload. Result: **both new tests failed and the other 23 in the two files passed.** After
`git checkout` of both view files, `git status -- src/` was clean. The tests really detect the R-1
regression they were written for.

**Re-run (from `src/frontend`, clean tree):**
- `npx tsc --noEmit -p .`: **clean** (exit 0)
- `npx vitest run --maxWorkers=4`: **80 files passed (80) / 833 tests passed (833)**, 0 errors,
  exit 0 (= 831 + the 2 new tests)

**A-5 traceability, updated:** Grooming ✅ (M-1 test) · Inpatient ✅ · EMR template ✅ (M-2 test) · Pets ✅.
All AC rows in the traceability table are now ✅. L-1, L-2 and I-1..I-5 are unchanged; they don't block
and go to the backlog as listed. Isolation/RBAC: still no backend diff and no guard change.

## Final verdict: **APPROVE**

QA-Agent Approval: ✅
