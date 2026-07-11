# ADR-0013: Billing pipeline fixes — PDF font, receipt modal, payment filters, care-log staff names

Date: 2026-07-11
Status: Accepted (Step 3.5 grill complete, findings resolved)
Related: `docs/superpowers/specs/2026-07-11-billing-pipeline-brainstorm.md`, `-tasks.md`, `-grill.md`

## Context

Item 3 of the 2026-07 bugfix pipeline bundles 4 billing-adjacent sub-issues. Research (Explore agent) and BA validation corrected the original task framing on 3 of the 4 points before any code was written:

1. **PDF Thai font "cannot render Thai"** — actually inverted: the shipped `NotoSansThai-Regular.ttf` is a 140-glyph Thai-only subset with zero Latin letters/digits. Thai renders fine; every English label and every digit in the invoice/prescription template renders as `.notdef`.
2. **Payment History row click** — no handler exists today; a receipt-quality view (`SuccessModal`) already exists but is wired only to the post-sale success path, not to history rows.
3. **Payment History filters** — `method`/`receivedById` already exist on `PaymentHistory`; this is a filter-UI + query gap, not a schema gap.
4. **Inpatient card click for admission detail** — PR #17's `CareHistoryModal` + History button already satisfies "click to see care detail." The real, narrower gap is that `performedBy` renders as a raw ID (`Staff #12`) because it has no `User` relation.

## Decisions

- **D1 (3a):** Fix by font-file replacement (full-coverage OFL Noto Sans Thai / Sarabun fallback), not per-glyph font-fallback logic. pdfkit has no automatic fallback and the template is single-font by design; replacement is the minimal correct fix. A `fontkit`-based glyph-coverage test (`fontkit` already installed, confirmed via `require.resolve`) guards against ever re-shipping a subset. Both `generateInvoicePdf` and `generatePrescriptionPdf` share the font and both get smoke-tested (grill finding F1).
- **D2 (3b):** Extract `SuccessModal`'s receipt body into a `ReceiptModal` used both by the post-sale success path and by a new history-row click. The two entry points must not share success-only copy ("Payment successful!") — the history path shows receipt content only (grill finding F2).
- **D3 (3c):** No new endpoint for the Received-by picker. Neither `GET /api/users` (permission mismatch — cashiers may lack `staff.view`) nor `GET /api/appointments/doctors` (wrong population — payments aren't doctor-only) fits. Options are derived from `PaymentHistory` itself via a `groupBy` scoped by the same tenant/branch/date where-clause, returned as `receivedByOptions` inside the existing payment-history response. This means the picker is intentionally faceted by the active date range (grill finding F3, documented not fixed).
- **D4 (3d):** Add a `User` relation only to `DailyInpatientCare.performedBy` (any staff member can log care), with `ON DELETE SET NULL` and a mandatory orphan-cleanup step before the FK is added (the column had no FK previously; dangling ids are possible). `Hospitalization.doctorInCharge` is explicitly **excluded** — it's already correctly resolved client-side via the doctors-picker map, and doctors are the correct population for that field. Verified the write path (`hospitalization.controller.ts:35`) always passes `req.context!.userId` (authenticated, same-tenant JWT claim) into `performedBy` — the FK has no independent tenant check but cannot be spoofed cross-tenant because the value is never client-supplied.

## Consequences

- Zero new endpoints, zero new permission codes, one migration, ~10 files. Fits Ponytail's 7-criteria envelope (confirmed at brainstorm; final check still happens at Step 5 gate).
- `transaction.controller.ts` / `/api/clinic/transactions` (an unused parallel endpoint touching the same `PaymentHistory` model with a weaker filter) is explicitly out of scope — noted as a dead-code cleanup candidate for the backlog, not touched here.
- Server-side `doctorInCharge` resolution stays a backlog item, only worth doing if the client-side doctors-map approach ever breaks (e.g., a deactivated doctor dropping off the picker list used for lookup).

## Glossary additions

- **Payment History row** — a `PaymentHistory` record surfaced in the clinic Billing screen's history tab; distinct from the `Transaction` naming used by the unused `/api/clinic/transactions` endpoint (same underlying model, different/legacy code path — do not conflate).
- **Receipt modal** — the itemized, printable/downloadable view of a single invoice's payment (line items + totals + method), as opposed to the flat summary row shown in the Payment History table.
- **Care performer** — the staff member who logged a `DailyInpatientCare` entry (`performedBy`), resolvable to a name post-ADR-0013; distinct from **doctor in charge** (`Hospitalization.doctorInCharge`), the admitting/responsible doctor for the whole hospitalization stay, resolved client-side.
