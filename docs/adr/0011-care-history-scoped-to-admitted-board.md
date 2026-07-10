# ADR-0011: Care History view scoped to the active-admissions board only

Date: 2026-07-11
Status: Accepted (autonomous scheduled run, no human present — flagged for human review)

## Context

Item 1 (Inpatient Log Care/Vitals) Task LCV-1 calls for a read-only "Care
History" action on `CageCard`, listing `DailyInpatientCare` rows for a
hospitalization. The original AC (Step 2 tasks doc) said the button should
"appear on every CageCard regardless of admission status (admitted or
discharged) — history should remain visible after discharge."

Grilling (Step 3.5) found this AC unreachable as written: `ClinicInpatient.tsx`
fetches `GET /api/hospitalizations/active` only. Discharged hospitalizations
are never returned to this view, so no discharged `CageCard` ever renders —
there is nothing to attach a "discharged" history button to on this screen.

## Decision

Ship LCV-1 scoped to admitted hospitalizations only, on the existing
Inpatient Board. The "regardless of admission status" clause is dropped from
the AC.

Discharged-admission care history is a real need but belongs to Item 2 (Pet
Profile Medical tab), which already deals with pulling historical clinical
records for a pet — that is where past hospitalizations/care logs should
surface, sourced from EMR/medical history rather than the live board.

## Alternatives considered

1. **Add a "show discharged" filter/toggle to the board** and fetch
   `GET /api/hospitalizations` (all, not just active) — rejected: expands
   scope beyond the literal ask, requires new query params / possibly a new
   endpoint, and duplicates what Item 2's Medical-tab work needs to solve
   anyway (history belongs on the pet's record, not a live operational
   board that's meant to show current bed occupancy).
2. **Ship as designed anyway** (button on all cards) — rejected: the button
   would simply never appear for discharged admissions since those cards
   never render; this doesn't satisfy the AC, it just fails silently.

## Consequences

- LCV-1's AC is corrected to: history view available only while a
  hospitalization is admitted (i.e., appears on the board same as today).
- Backlog item added: discharged-admission care history access, to be
  designed as part of Item 2 (Pet Profile Medical tab / EMR sync), not a
  new item.
- No backend change needed either way (`GET /:id` already returns full
  `careLogs` regardless of hospitalization status; only the board's list
  query filters to active).
