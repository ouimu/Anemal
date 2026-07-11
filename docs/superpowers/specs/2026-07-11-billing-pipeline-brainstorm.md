# Brainstorm — Item 3: Billing Pipeline (4 sub-ACs)

Date: 2026-07-11. Agents: @pm-agent + @ba-agent (Step 1 of CLAUDE.md 8-step pipeline). Scheduled autonomous run (`anemal-bugfix-pipeline-resume`).

## AS-IS research (verified against live source, see Explore agent findings this run)

### 3a. PDF Thai font renders as tofu/boxes

- Lib: `pdfkit` (`src/backend/services/pdf.service.ts`). Font embedded: `NotoSansThai-Regular.ttf` (`src/backend/assets/fonts/`), registered as `'NotoThai'`, used for the **entire** invoice/prescription document (`doc.font('NotoThai')`, never switched).
- **Root cause (corrects the task's framing):** the embedded TTF is a Thai-only *subset* — 140 glyphs, zero Latin letters, zero digits (verified via fontTools glyph/cmap inspection). Every English label ("Tax Invoice", "BILL TO", "QTY"...) and every digit (prices, dates, quantities) in the PDF has no glyph in this font → renders as `.notdef` box. Thai text itself would actually render fine if present.
- So "Thai font cannot render" is backwards: the font can only render Thai, and is missing everything else the template needs.
- Fix shape: get a full-coverage Thai+Latin+digit font (e.g. full Noto Sans Thai, Sarabun, or IBM Plex Sans Thai — need one with a complete Basic Latin block) and either (a) replace the subset font file, or (b) font-fallback per glyph (pdfkit doesn't do automatic fallback — would need manual font-switching per run of text, more complex). Recommend (a): swap in a full-glyph-coverage font file. Simpler, same registration code.

### 3b. Payment History row click → receipt-style modal

- Current: `PaymentHistoryTab` rows (`ClinicBilling.tsx:428-534`) are inert `<tr>`, no click handler, no per-row detail.
- A receipt-quality view already exists as `SuccessModal` (`ClinicBilling.tsx:574-635`) — shown only right after a NEW sale — with itemized lines, subtotal/discount/tax/total, Print + PDF-download buttons. Payment History rows only show flat fields (date, invoice#, amount, method, receivedBy, note) — no line items.
- Design lean: reuse the SuccessModal's receipt layout/markup for a row-click modal, fetching full invoice detail (line items) by `row.invoice.id` via existing invoice-detail endpoint (needs confirming an endpoint exists — @ba-agent to verify `GET /api/invoices/:id` returns line items) rather than building a second bespoke receipt renderer.

### 3c. Payment History filters — add Received-by + Method

- Data already has both fields (`PaymentHistory.method`, `.receivedById`) — filter is UI + query-param + repository `where`-clause work only, **no schema change**.
- Existing pattern to follow: `paymentHistoryWhere()` in `invoice.repository.ts` already tenant/branch/date scoped — extend with optional `method` and `receivedById` predicates, mirroring existing style.
- "Received by" filter needs a staff/user picker — check whether branch-scoped staff list endpoint already exists (used elsewhere, e.g. doctor list on Inpatient board) to reuse rather than build new.
- Note: an unused parallel endpoint `transaction.controller.ts` / `/api/clinic/transactions` touches the same `PaymentHistory` model with an even more limited filter (`period=today|month`) and is NOT what the UI calls. Out of scope — do not touch, avoid confusion, note as dead code candidate for backlog (not this item).

### 3d. Inpatient card click → admission detail (staff/EMP, Log Care)

- Card itself has no click handler; access is button-driven (Log Care / Discharge / History / Edit / Delete).
- `CareHistoryModal` (added PR #17) already lists care log entries but shows raw `By: Staff #{performedBy}` — **no name resolution**, because `DailyInpatientCare.performedBy` and `Hospitalization.doctorInCharge` are both plain `Int?` columns with **no Prisma relation to `User`**.
- Task's literal ask ("clicking card shows EMP/Log Care detail") is largely already satisfied by the History button + CareHistoryModal from PR #17 — the real gap is **staff-name resolution** (performedBy/doctorInCharge showing IDs, not names), which was explicitly deferred to backlog in Item 1's grill (Finding: "performedBy name resolution" — see `.claude/roadmap/ACTIVE/remaining-tasks.md`).
- Design question for @ba-agent: is this sub-AC (d) actually "add a relation + resolve names in existing CareHistoryModal", or does the task want a *new* combined admission-detail view (assigned doctor + care history + admission metadata in one place, reachable from a card click rather than a separate history-icon button)? AS-IS gap is narrower than the task description implies — needs BA scoping decision, not assumption.

## Open questions for @ba-agent sign-off (Step 3)

1. 3a: confirm font-replacement-only fix (no fallback-font engineering) is acceptable scope, and which font file to source (must be redistributable/licensed — Noto Sans Thai full family is OFL-licensed, safe).
2. 3b: confirm `GET /api/invoices/:id` (or equivalent) returns line items needed for the receipt modal; if not, scope includes that endpoint.
3. 3c: confirm "Received by" filter = a `User`/staff picker scoped to branch staff (reuse existing staff-list source), not free text.
4. 3d: scope decision — (i) minimal: add `User` relations to `performedBy`/`doctorInCharge`, resolve names in existing CareHistoryModal; vs (ii) larger: new card-click admission-detail view. Recommend (i) per YAGNI/Ponytail — existing History button already satisfies "click to see detail," only the name-resolution gap is real.

## Scope guardrail (Ponytail pre-check)

All 4 sub-ACs are additive to existing screens/endpoints, no new subsystems. Likely: 1 migration (add `User` FKs for 3d), ~2-3 new/modified endpoints (invoice-detail-for-receipt if missing, payment-history filter params, staff-list reuse), UI edits to `ClinicBilling.tsx` (receipt modal + filters) and `ClinicInpatient.tsx`/`CareHistoryModal` (name resolution). Estimate: within Ponytail's 7-criteria limits (<10 files core changes, <3 subsystems: billing PDF, billing UI, inpatient UI) — but final check happens at Step 5 gate after write-plan is concrete.
