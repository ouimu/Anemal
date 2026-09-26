# ADR-0029 — Date display follows the app language, not the browser

**Status:** Accepted
**Date:** 2026-09-24
**Related:** ADR-0030 (stored values stay English) · ADR-0031 (Platform plane is English-only) ·
BA rule **R-2** and findings F-7 / F-10 in
`docs/superpowers/plans/2026-09-23-i18n-completion-ba-signoff.md` (§1, §2 answer 4.2, §4) ·
BA backlog §7.4 items 1 and 5
**Origin:** `/grill-with-docs` Step 3.5 gate, rows **G-1** and **G-2** —
`docs/superpowers/plans/2026-09-24-i18n-completion-grill.md`

## Context

Dates on the clinic screens are formatted three different ways today, and none of them follows the
language the user chose in Anemal:

- Grooming and Inpatient hardcode `'en-GB'`, so they stay English in Thai mode.
- EMR and Pets call `toLocaleDateString()` with **no locale**, so the output follows the *browser*.
  On an en-US browser that is month-first (`3/4/2026` = 4 March), on most other devices day-first
  (`3/4/2026` = 3 April). One clinic running mixed devices shows the same appointment or
  vaccination date two ways.
- `ClinicDashboard` hardcodes `'en-US'` (`ClinicDashboard.tsx:17` for baht, `:38` for the date),
  so its date renders in English, month-first, in Thai mode (BA finding F-7).

Thai mode adds a second ambiguity: Thai convention is the Buddhist Era (พ.ศ. 2569), but the native
date pickers on the same screens show the Gregorian year (ค.ศ. 2026) and cannot easily be changed.
A screen that shows both eras side by side invites a 543-year misreading of clinical dates — a
next-vaccination due date is exactly the kind of value that gets misread.

## Decision

**Dates are displayed from the app language (`uiStore.language`), never from the browser locale.**

1. **One shared language → locale mapping.** No per-screen locale literals, and no
   `toLocale*String()` call without an explicit locale.
2. **Thai mode (`th`): Thai month and weekday names with the Gregorian year (ค.ศ.), never the
   Buddhist Era.** 24-hour times. Examples: `จ. 21 ก.ย.`, `21 ก.ย. 2026`, `21 ก.ย. 2026 14:30`.
   (G-1: the human chose Gregorian.)
3. **All languages are day-first, on every device.** English (`en`) maps to `en-GB` with the
   existing option sets (`21/09/2026`). (G-2: the human chose day-first everywhere.)
4. **Numerals stay Arabic (0–9)** in both languages; `฿` and time-slot labels (`08:00`) are
   unchanged.
5. **Display only.** Stored dates, API payloads and query parameters do not change.

The rule is binding for every date the i18n-completion branch touches (Grooming, Inpatient, EMR,
Pets) and for all new or changed date display after it.

## Consequences

**Positive**
- One screen, one era, one field order. A date reads the same on every device in the clinic.
- Switching the language toggle changes every in-scope date in one place.

**Negative / risks**
- **Visible change for en-US browser users.** EMR and Pets move from month-first to day-first.
  Data is unchanged; 4 March 2026, shown today as `3/4/2026`, becomes `04/03/2026`. Accepted (G-2).
- **Trap for implementers: `th-TH` defaults to the Buddhist calendar.** `Intl` / `toLocaleDateString`
  with a bare `'th-TH'` renders พ.ศ. The mapping must request the Gregorian calendar explicitly
  (for example `th-TH-u-ca-gregory`, or `calendar: 'gregory'`). A test asserting the year `2026`
  in Thai mode is the falsifiable check; one asserting only Thai month names would pass on the
  wrong era.
- **Known violator left in place.** `ClinicDashboard` (`en-US` date and currency) violates this ADR
  and stays out of this branch's scope — BA backlog §7.4 item 1. Any other `toLocale*` call without
  an explicit locale found in a later sweep is also a violation of this ADR, not a style nit.

**Revisiting**
- A per-clinic Buddhist-Era display preference is backlogged (BA §7.4 item 5), not rejected. If it
  is ever built, it must still never mix eras on one screen, which means it has to cover the date
  pickers too.
