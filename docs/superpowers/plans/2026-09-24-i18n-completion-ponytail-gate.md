# Ponytail gate: i18n-completion (Step 5, mode `gate`)

**Reviewer:** @ponytail-agent · **Date:** 2026-09-24 · **Branch:** `feature/i18n-completion`
**Input:** plan `docs/superpowers/plans/2026-09-24-i18n-completion.md`. There is no arch doc (`arch: skipped (below threshold)`), so drift was checked against ADR-0029, ADR-0030 and ADR-0031, the BA sign-off (A-1..A-17, I18N-14..16) and the grill log (G-1..G-8).
**Code checked:** `src/frontend/src/i18n/index.ts` (717 lines), `ClinicGrooming.tsx` (391), `ClinicInpatient.tsx` (806), `ClinicEMR.tsx` (794), `ClinicPets.tsx` (946), `__tests__/i18n.coverage.test.ts` (31), `__tests__/ClinicPets.i18n.test.tsx` (35).

---

## Verdict: ✅ APPROVE

```
@pm-agent — Ponytail gate ✅ APPROVE — all 9 pass, no arch/plan drift. Proceed to execute-plan.
```

## 9-point check

| # | Criterion | Verdict | Why |
|---|---|---|---|
| 1 | Over-engineering? | **NO** | The change is literals → `t()`, plus one pure date helper of about 20 LOC. No new layer, no store, no provider, no interpolation API; the plan keeps the house `t(key).replace('{n}', …)` pattern. The process weight (16 tasks, BA review, review page) comes from BA/grill mandates, not from the code. |
| 2 | Duplicate work? | **NO** | It extends `i18n.coverage.test.ts` and `ClinicPets.i18n.test.tsx` instead of adding parallel files. R-6 requires reusing `common.*` keys. `dateFormat.ts` replaces three existing screen-local helpers (Grooming `formatDateLabel` `:52`, Inpatient `formatDate`/`formatDateTime` `:101-108`) and five no-locale calls (EMR `:586`, Pets `:612/634/670/672`). That removes duplication. It does not add any. See advisory A-2 for the one risk. |
| 3 | Existing solution? | **NO** | Formatting uses the `Intl`/`toLocale*` built-ins. No i18n library, because `i18n/index.ts:1-6` records a deliberate "no library" decision, and the plan does not reimplement anything a library would give for free here. |
| 4 | Scope too large? | **NO** (justified below) | 1 subsystem (clinic-plane frontend presentation). 6 production files, 6 test files. No production file is newly pushed past its current size class. See §1. |
| 5 | Too many deps? | **NO** | Zero new dependencies. |
| 6 | Too many files? | **NO** | 5 new files (`dateFormat.ts`, `dateFormat.test.ts`, and 3 `*.i18n.test.tsx`). The threshold is >15. |
| 7 | Too many APIs? | **NO** | 0 endpoints, 0 hooks, 0 mutations. `dateFormat.ts` exports plain functions and does not read `uiStore`. |
| 8 | Abstraction w/o 2nd impl? | **NO** | No interface, port or base class anywhere. The value→label maps are plain constants in each view. |
| 9 | Pattern w/o named problem? | **NO** | The only two recurring mechanisms each have a named problem with alternative and trade-off. The shared locale mapping is covered by ADR-0029, whose problem is three inconsistent date behaviours plus a Buddhist-Era mix on one screen. The value/label split is covered by ADR-0030, whose problem is one stored value splitting into two names. |

**Drift check (plan ↔ ADRs/BA/grill): none.**
- **ADR-0029:** the plan has one mapping, day-first order, the Gregorian year asserted as `2026` in Thai (the falsifiable check the ADR demands), and a `navigator.language` independence test. It declares the EMR/Pets English change instead of hiding it (I18N-9 AC).
- **ADR-0030:** POST-body assertions are on I18N-2/6/9/11. Unknown values render raw (X-1). C-1 styling moves off the translated string.
- **ADR-0031:** no platform file is touched, and QA confirms that in the diff (§8). `formatDate(iso, lang)` takes `lang` as a parameter and does not read `uiStore`, so it is plane-neutral, which is in the spirit of rule 3.
- **Grill G-8** (all 4 ship together) is honoured in §7. G-4 (no backend) is honoured in §1. G-5 (review page, non-blocking) is honoured in §6.

**Arch-skip: sound.** Nothing in the plan needed @arch-agent:
- no class or interface contract;
- no cross-cutting authz, audit, quota or tenancy concern;
- no transaction or state machine;
- the C-1 fix is local component state;
- the only shared artefact is a pure function colocated in `i18n/`.

The plan also draws the right conclusion from the skip: Step 6 runs sequentially, one lane, W0 to W7 with no `∥`.

---

## §1. Criterion 4, stated plainly

| Class | Files | Count |
|---|---|---|
| Production | `i18n/index.ts`, `i18n/dateFormat.ts` (new), `ClinicGrooming.tsx`, `ClinicInpatient.tsx`, `ClinicEMR.tsx`, `ClinicPets.tsx` | 6 |
| Test | `i18n.coverage.test.ts` (extend), `dateFormat.test.ts` (new), `ClinicGrooming/Inpatient/EMR.i18n.test.tsx` (new), `ClinicPets.i18n.test.tsx` (extend) | 6 |

**12 files touched > 10, so the literal line trips on the total.** The same reading was applied in `2026-08-20-backend-tests-post-adr-0019-ponytail.md` §3. Criterion 4 catches a change that reaches further into the system than its goal needs. This one does not:
- **The production footprint (6) is the minimum for the goal.** The goal is four screens, the one dictionary they share, and one date helper. The human fixed "all 4 screens, no cut" at G-8.
- **Every test file is mandated by a binding amendment.** A-10 sets one sibling i18n test per screen. I18N-14 extends the coverage test. I18N-15 adds the helper's unit test. None is discretionary.

**>500 LOC/file.** The four views are already 391–946 lines. The plan swaps literals for keys, so their net LOC stays about flat. `i18n/index.ts` will grow from 717 to roughly 1,150–1,300 lines (around 200–250 keys × 2 languages). That growth is flat key→value data with zero logic, and splitting it now would add files and scope to a presentation branch. It does not fire #4. See advisory A-5.

---

## Advisories: non-blocking, no resubmit needed

These do not change the verdict. Dev A may apply A-1 to A-4 in passing. A-5 and A-6 are backlog notes for @scribe-agent at Step 8.

- **A-1 (I18N-15, plan line 146-149): export only what has 2+ callers.**
  - `formatDate` has callers on 3 screens, so it belongs in the shared module.
  - `formatShortDate` (Grooming only) and `formatDateTime` (Inpatient only) are single-caller.
  - Smaller shape: `dateFormat.ts` exports the language→locale mapping (for example `localeFor(lang)`, which is where the `th-TH-u-ca-gregory` trap lives) plus `formatDate`. Grooming's `formatDateLabel` and Inpatient's `formatDateTime` stay local and call `toLocale*(localeFor(lang), <existing options>)`. That keeps byte-identity trivially true, and it is the literal BA I18N-15 wording ("one shared language→locale mapping").
  - Either shape passes. Do not add a fourth formatter.
- **A-2 (I18N-4/8/10/12): write the Latin-residue collector once.** No such helper exists today; `src/test/` holds only `setup.ts`. The A-10 method (visible text + placeholder + title + aria-label + `<option>`, minus E-2/E-3/E-4 exemptions, `/[A-Za-z]{2,}/`) will be needed in 4 test files.
  - Write it inline in I18N-4.
  - Extract it to one shared test helper when I18N-8 becomes its second caller, not before.
  - Four inline copies would be the one real duplication risk in this branch.
- **A-3 (stale text vs G-8): dead wording contradicts G-8.**
  - The §0.2 "mechanic stays documented in case a Should-tier surprise forces it" is dead.
  - So is the A-17 traceability row "unless a Should-tier surprise recurs" (plan line 92).
  - I18N-15's "its EMR/Pets call sites are Should-tier" (plan line 140-141) also contradicts G-8 ("nothing is cut", all Must, §7).
  - The Step 5 window the hatch referred to is now, so the hatch is closed. Treat these lines as void; nobody should act on them.
- **A-4 (I18N-13 AC, plan line 540-542): the AC cites a check that does not exist.** It says I18N-14 confirms "no orphaned/duplicate keys".
  - I18N-14 has no orphan (unused-key) check.
  - Duplicate keys in an object literal are already a `tsc` error (TS1117), so they are covered.
  - **Do not add a sixth static check to close the gap.** That would be scope creep beyond BA's I18N-14 list. Read the AC as "no duplicate keys (tsc) + manual orphan spot-check".
  - Test-coverage wording belongs to @qa-agent at Step 7.
- **A-5 (backlog): `i18n/index.ts` single-file size.** After this branch it will be about 1,200+ lines. A per-namespace split would be a Lane D refactor, which needs a reverse-mode check where largest-file LOC goes down. It is not work for this branch.
- **A-6 (backlog, ADR-0029): other violators that §1 does not list.** Only `ClinicDashboard` is backlogged, but ADR-0029 says any other `toLocale*` call without an explicit locale is a violation. The other violators today:
  - `ClinicVaccinationsDue.tsx:35`, `ClinicTransactions.tsx:21`, and the five `views/settings/*Page.tsx` pages hardcode `'th-TH'`, which renders Buddhist Era;
  - `ClinicAppointments.tsx:45,338-447` hardcodes `'en-US'`, which renders month-first;
  - `ClinicBilling.tsx:300,623,745` and `components/platform/ClinicAdminsTab.tsx:260` pass no locale.

  Platform files are English-only per ADR-0031, so only their day-first order matters. **Do not pull any of these into this branch.** File one "ADR-0029 date sweep" backlog item at Step 8.

---

```
LEDGER | mode=gate | verdict=APPROVE | criterion=— | frontend-only i18n, 6 prod files, zero abstractions
```
