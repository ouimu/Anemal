# ADR-0030 — Stored values stay English; only displayed labels are translated

**Status:** Accepted
**Date:** 2026-09-24
**Related:** ADR-0029 (date display follows the app language) · BA rules **R-1**, **R-5** and dev
constraint **C-1**, finding F-9, and the value → label maps in §5.3 of
`docs/superpowers/plans/2026-09-23-i18n-completion-ba-signoff.md`
**Origin:** `/grill-with-docs` Step 3.5 gate, row **G-3** —
`docs/superpowers/plans/2026-09-24-i18n-completion-grill.md`

## Context

Several strings on the clinic screens are not only text on the screen — they are also data. They are
sent in a POST body, persisted, or used as React state keys (BA finding F-9):

| Value | Where it lives |
|---|---|
| Grooming `serviceType` (`'Bath & Dry'`, `'Full Groom'`, …) | POST body → free-text `VARCHAR` column |
| Inpatient `feedingStatus` (`'Ate all'`, `'Refused'`, …) | POST body → persisted care record |
| EMR anatomy `template` (`'Canine - Lateral'`, …) | stored inside the annotation JSON |
| EMR SOAP tabs, Pets tabs | React state keys |
| Pets `species` / `gender` (`canine`, `male`, …) | persisted enum-like values |

A find-and-replace translation would write Thai into these fields. Every existing row is English, so
the same service would then exist under two names — counts, filters and search would split one value
in two, and nothing in the schema would stop it (`serviceType` accepts any string).

## Decision

**A value that is stored, sent, or used as state stays English and byte-identical. Only its
displayed label is translated.**

1. **POST bodies are byte-identical to today** in both languages. No data migration, no new column.
2. **Display goes through a value → label map** with literal translation keys (R-5, so the static
   key scan covers it). The binding maps are BA sign-off §5.3.
3. **A value with no label renders raw.** Unknown `serviceType` strings, free-text feeding "Other"
   entries and unknown status codes show exactly as stored, as they do today.
4. **Logic never branches on a translated string.** Success/failure, selection and tab state are
   decided from values or flags, never from display text (BA C-1: EMR's `saveMsg === 'Saved'`
   colour check is the known instance).

## Consequences

**Positive**
- One value has one name in the database, so counts, search and reports stay correct across
  languages and across the rows that already exist.
- The server and schema are untouched; this remains a presentation-only change.

**Negative / risks**
- **Raw data reads English.** Database exports, raw API responses and anything else that bypasses
  the frontend label maps show the English value.
- **Customer-facing documents do not show these fields today.** Verified 2026-09-24:
  `pdf.service.ts` renders none of them. Any future renderer that does — including the backlogged
  invoice / tax-invoice language feature (grill G-7) — must map value → label at render time and
  must not persist the label.
- **Persisted server-built text is a different problem and is not covered here.** The inpatient
  discharge invoice line (`hospitalization.service.ts:107`, `"Hospitalization (N days)"`) is English
  prose written into the invoice, not a value with a label. It belongs to the G-7 backlog feature.
