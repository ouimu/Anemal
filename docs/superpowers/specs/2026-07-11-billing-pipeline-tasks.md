# Item 3 — Billing Pipeline: Tasks + Acceptance Criteria

Date: 2026-07-11 · Step 2 (@pm-agent) + Step 3 (@ba-agent sign-off appended below)
Input: `docs/superpowers/specs/2026-07-11-billing-pipeline-brainstorm.md`
Status: BA-validated (see "BA Step-3 Sign-off" at end). Next: Step 3.5 `/grill-with-docs`.

## Scope summary (Ponytail pre-check)

| Metric | Count | Limit |
|---|---|---|
| New endpoints | **0** (2 existing endpoints gain optional params/fields) | ≤3 |
| Migrations | 1 (one FK on `daily_inpatient_care.performedBy`) | — |
| Subsystems | 3 (billing PDF, billing UI, inpatient UI) | ≤3 |
| Core files touched | ~10 (see tasks) | ≤10 |
| New deps | 0 (font is an asset, not a dep) | ≤5 |

Out of scope (backlog, do NOT touch): `transaction.controller.ts` / `/api/clinic/transactions` dead-code cleanup; server-side resolution of `Hospitalization.doctorInCharge` (already resolved client-side via doctors map, see BA note B-4); per-glyph font-fallback engineering.

---

## 3a — Thai/Latin PDF glyph fix (font replacement)

**Objective:** Invoice/prescription PDFs render every character — Thai, Latin labels, digits — instead of `.notdef` boxes. Root cause (verified): `src/backend/assets/fonts/NotoSansThai-Regular.ttf` is a 37 KB Thai-only subset with no Latin letters or digits.

### T-3a.1 Replace subset font with full-coverage Thai+Latin font
- **Files:** `src/backend/assets/fonts/NotoSansThai-Regular.ttf` (replace file content, keep filename/path → zero code change in `pdf.service.ts`), plus a `FONT-LICENSE.txt` (OFL) alongside it.
- **Font:** official Google Fonts **Noto Sans Thai** Regular (OFL-1.1) — its GF release includes Thai + Basic Latin + digits. Sarabun (OFL) is the approved fallback choice if coverage check fails.
- **Interface change:** none. `FONT_PATH` (`pdf.service.ts:8`) and `registerFont('NotoThai', ...)` unchanged.
- **Test proves done:** new backend test `src/backend/__tests__/pdf-font-coverage.test.ts` loads the TTF with `fontkit` (already a transitive dep of pdfkit — do not add a new dependency; import from the installed module) and asserts `hasGlyphForCodePoint` is true for: `A`, `z`, `0`, `9`, `฿` (U+0E3F), `ก` (U+0E01), `์` (U+0E4C), space, `.` and `/`. Guards against ever re-shipping a subset.

### T-3a.2 PDF generation smoke test with mixed content
- **Files:** extend existing PDF/invoice test file (or the new test above).
- **Test proves done:** `generateInvoicePdf` for a seeded invoice whose item description contains Thai + Latin + digits (e.g. `ค่าตรวจ Exam 250`) resolves to a non-empty PDF buffer starting with `%PDF` and does not throw. (Pixel-level glyph assertion is out of scope; T-3a.1 covers glyph presence.) **[Grill F1]** Also smoke-test `generatePrescriptionPdf` (same font, same risk) with Thai+Latin+digit content — same three assertions.

**AC-3a:** Given a paid invoice with Thai and English line descriptions, when staff downloads the PDF via `GET /api/invoices/:id/pdf`, then no character renders as a box — verified by the font-coverage test (automated) plus one manual QA download in Step 7.

---

## 3b — Payment History row click → receipt modal

**Objective:** Cashier/admin can reopen a receipt view (itemized lines, totals, Print/PDF) for any historical payment, not only immediately after a sale.

Verified AS-IS: `GET /api/invoices/:id` exists (`invoice.routes.ts:16`) and returns `items` + `pet.owner` (`invoice.repository.ts:117-129` `findInvoiceById`), guarded by `requirePlane('clinic')` + `requirePermission('billing.view')`. No new endpoint needed. Gap: payment-history rows carry `invoice: { invoiceNo }` only — **no invoice id** (`invoice.repository.ts:209`, `ClinicBilling.tsx:420`).

### T-3b.1 Backend: expose `invoice.id` in payment-history rows
- **Files:** `src/backend/models/invoice.repository.ts` (change `invoice: { select: { invoiceNo: true } }` → `{ select: { id: true, invoiceNo: true } }` in `findPaymentHistory`).
- **Test proves done:** extend existing payment-history integration test: response row has `invoice.id` (number) and `invoice.invoiceNo`.

### T-3b.2 Frontend: extract receipt markup into shared `ReceiptModal`
- **Files:** `src/frontend/src/views/clinic/ClinicBilling.tsx` only (extract the receipt body of `SuccessModal` at lines 574-635 into a `ReceiptModal` component in the same file; `SuccessModal` becomes a thin wrapper adding the success header/`earnedMsg`). No new file.
- **Interface:** `ReceiptModal({ invoice, petLabel, method, onClose })` — same-file component, reuses existing `downloadPdf`/`print` handlers and `GET /api/invoices/:id/pdf`.
- **Test proves done:** existing `SuccessModal`-path frontend tests still pass unchanged (regression guard for the refactor).

### T-3b.3 Frontend: row click opens receipt modal
- **Files:** `ClinicBilling.tsx` — `PaymentHistoryTab` (lines 428-534): add `onClick`/`cursor-pointer`/keyboard-accessible handler on `<tr>`, `useQuery` fetching `/api/invoices/${row.invoice.id}` on selection, render `ReceiptModal` with fetched invoice; `method` from the payment row (`row.method`), amount shown is the invoice totals from the fetched detail. Loading + error (invoice deleted/not found → toast/dismiss) states required. Add i18n keys (Thai/English) for any new labels.
- **Test proves done:** new frontend test in `src/frontend/src/__tests__/` — clicking a payment-history row calls `GET /api/invoices/:id` with the row's invoice id and renders the modal with itemized lines and total; 404 path shows error state, no crash.

**AC-3b:** Given the Payment History tab with ≥1 row, when the user clicks (or keyboard-activates) a row, then a receipt modal opens showing invoice number, line items with qty/price, subtotal/discount/tax/total, payment method, and working Print + Download-PDF buttons; closing returns to the intact list (filters/page preserved). **[Grill F2]** The modal opened from a history row shows only receipt content — no success banner, no "earned"/celebratory messaging (that framing is `SuccessModal`-only, post-sale). Test proves done: `ReceiptModal` rendered from a history-row click does not render the success-banner text/testid used by `SuccessModal`.

---

## 3c — Payment History filters: Method + Received-by

**Objective:** Admin/cashier can narrow payment history by payment method and by receiving staff member. No schema change (verified: `PaymentHistory.method`, `.receivedById` exist, schema.prisma:1005-1025; `receivedBy` is already a `User` relation).

### T-3c.1 Backend: optional `method` + `receivedById` filter params
- **Files:** `src/backend/models/invoice.repository.ts` (`PaymentHistoryParams` + `paymentHistoryWhere`: add optional `method?: string`, `receivedById?: number` predicates — pattern-match the existing optional predicates), `src/backend/services/invoice.service.ts` (pass-through), `src/backend/controllers/invoice.controller.ts` (`listPaymentHistory`: parse `req.query.method` string, `req.query.receivedById` number; ignore invalid values rather than 500).
- **Interface:** `GET /api/invoices/payment-history?method=cash&receivedById=12` (both optional, combinable with existing startDate/endDate/branchId/page). No new endpoint.
- **Tenant scoping:** `paymentHistoryWhere` already anchors `{ tenantId }` and branch rules (repository lines 189-201); new predicates are ANDed inside it — MUST NOT bypass or restructure the tenant/branch clauses.
- **Test proves done:** integration tests: (1) `method=cash` returns only cash rows; (2) `receivedById=X` returns only X's rows; (3) combined filters AND together; (4) tenant-isolation: user of tenant A filtering by tenant B's user id gets 0 rows, never cross-tenant data; (5) branch-scoped staff user still sees only own branch regardless of filters.

### T-3c.2 Backend: received-by picker options in the same response
- **Files:** `invoice.repository.ts` — extend `findPaymentHistory` to also return distinct receiver options `{ id, name }[]` for the current tenant/branch scope (Prisma `groupBy` on `receivedById` over the same `where` **minus** the `receivedById`/`method` predicates, joined to names via the existing relation; single extra query in the existing `Promise.all`). `invoice.service.ts` includes it in the result as `receivedByOptions`.
- **Rationale (BA):** avoids a new endpoint and avoids reusing `GET /api/users` (guarded by `staff.view`, which billing staff may not hold) or `/api/appointments/doctors` (doctors only, wrong population). Options come out under the already-required `billing.view` permission.
- **Test proves done:** integration test: response contains `receivedByOptions` listing exactly the distinct receivers within the caller's tenant+branch scope; a receiver from another tenant never appears.

### T-3c.3 Frontend: two filter controls
- **Files:** `ClinicBilling.tsx` — `PaymentHistoryTab`: add Method `<select>` (static options from existing `METHOD_LABELS`, line 426, plus "All") and Received-by `<select>` (options from `receivedByOptions`); wire into the query params + `queryKey`; include in the existing Clear button; reset `page` to 1 on change; 44px min-height touch targets; i18n keys for labels (Thai/English).
- **Test proves done:** frontend test: selecting a method adds `method` to the request params; selecting a receiver adds `receivedById`; Clear resets both.

**AC-3c:** Given payment history spanning multiple methods and receivers, when the user picks Method=Cash and Received-by=<staff>, then the table shows only matching rows (server-filtered, pagination correct), the pickers show only same-tenant/branch staff, and Clear restores the unfiltered list. **[Grill F3]** Receiver options reflect the currently active date/branch scope — narrowing the date range may shrink the Received-by list (a receiver with no payments in range drops out). This is intended faceted-filter behavior, not a bug; QA should not flag it.

---

## 3d — Care-log staff-name resolution (Option i — minimal)

**Objective:** `CareHistoryModal` shows the actual staff member's name for each care entry instead of `By: Staff #12`. Scope decision: Option (i) — server-side name resolution via a Prisma relation. NOT a new admission-detail view (Option ii) — see BA sign-off Q4.

Verified AS-IS: `DailyInpatientCare.performedBy` is a bare `Int?` with no `User` relation (schema.prisma:642); modal renders `Staff #${log.performedBy}` (`ClinicInpatient.tsx:456`); a deliberate regression test pins this (`ClinicInpatient.test.tsx:255-263`, Item-1 grill finding 1: client-side resolution via the doctors map would mis-resolve non-doctor staff). Server-side resolution removes that root concern. `Hospitalization.doctorInCharge` is already name-resolved client-side from the doctors picker map (`ClinicInpatient.tsx:89-91,514`) — no change needed there (correction to brainstorm Option (i) wording; see B-4).

### T-3d.1 Schema: `performedBy` → `User` relation + migration
- **Files:** `src/backend/prisma/schema.prisma` (on `DailyInpatientCare`: `performedByUser User? @relation("CarePerformedBy", fields: [performedBy], references: [id], onDelete: SetNull)` + back-relation on `User`), new migration under `src/backend/prisma/migrations/`.
- **Migration MUST:** first `UPDATE daily_inpatient_care SET "performedBy" = NULL WHERE "performedBy" NOT IN (SELECT id FROM users)` (orphan cleanup — column had no FK, dangling ids possible), then add the FK with `ON DELETE SET NULL` (care logs must survive staff deletion). Column stays camelCase-quoted per project raw-SQL rule.
- **@db-agent review required** (CLAUDE.md: all DB changes).
- **Test proves done:** migration applies cleanly on the seeded dev DB; Prisma validate passes; existing hospitalization tests still green.

### T-3d.2 Backend: include performer name in detail response
- **Files:** `src/backend/models/hospitalization.repository.ts` (`findById`, line 26-29: careLogs include → `include: { performedByUser: { select: { id: true, name: true } } }`).
- **Tenant scoping:** outer query already `tenantId`-scoped; the relation join resolves the name only for rows already inside the tenant's hospitalization. The FK itself is not tenant-checked — acceptable because write-path (`addCare`) sets `performedBy` from the authenticated same-tenant JWT `userId` only; test below guards it.
- **Test proves done:** integration test: `GET /api/hospitalizations/:id` care log entries carry `performedByUser: { id, name }` (null when `performedBy` is null); tenant-isolation test: tenant A's request never resolves a name for a hospitalization of tenant B (404, existing behavior).

### T-3d.3 Frontend: render name, update pinned regression test
- **Files:** `src/frontend/src/views/clinic/ClinicInpatient.tsx` (CareLog type gains `performedByUser?: { id: number; name: string } | null`; line 456 renders `performedByUser?.name ?? (performedBy != null ? \`Staff #${performedBy}\` : '—')` — id fallback keeps old data/degraded responses readable), `src/frontend/src/__tests__/ClinicInpatient.test.tsx` (**replace** the "never a resolved staff name" regression test at lines 255-263 with its inverse: server-provided name IS displayed; keep the guard that the doctors-map is never used for performedBy).
- **Test proves done:** updated frontend tests: (1) entry with `performedByUser.name = 'Nok'` renders `By: Nok`; (2) entry with name null but id 12 renders `By: Staff #12`; (3) null both → `—`.

**AC-3d:** Given a care log entry recorded by any staff role (not only doctors), when a user opens Care History from the cage card, then the entry shows the staff member's real name resolved server-side; deleted-staff entries degrade to `Staff #id` or `—`, never a wrong name; the Item-1 grill concern (mis-resolution via doctors map) stays impossible by construction.

---

## Cross-cutting requirements (all tasks)

- Permissions: no new permission codes. 3a/3b/3c ride existing `billing.view`; 3d rides existing hospitalization-view guard. Deny-by-default preserved; no route changes.
- Multi-tenancy: every touched query keeps its `tenantId` anchor (audited per-task above). @qa-agent runs isolation tests per `.claude/roadmap/qa-protocols.md`.
- i18n: all new UI strings get Thai + English keys (Phase 9 convention, no library).
- Design system: 44px touch targets, tokens only, Material Symbols — per `anemal-design-system`.
- No new npm dependencies. No new files except: 1 migration, 1 font license text, 1 backend test, ≤2 frontend tests.

---

## BA Step-3 Sign-off

Reviewer: @ba-agent · Date: 2026-07-11 · Method: every brainstorm claim re-verified against live source (routes, controllers, repositories, schema, frontend views/tests) — citations inline above.

### Open questions from brainstorm — resolved

| # | Question | Decision |
|---|---|---|
| Q1 (3a) | Font-replacement-only acceptable? Which font? | **Yes.** Verified root cause: shipped TTF is 37 KB, consistent with a Thai-only subset; template mixes Latin labels + digits. Replace with official Noto Sans Thai Regular (OFL-1.1, redistributable, includes Basic Latin + digits); Sarabun (OFL) as fallback if the T-3a.1 coverage test fails. Per-glyph fallback engineering rejected — pdfkit has no auto-fallback and the template is single-font; replacement is the standard-config answer. |
| Q2 (3b) | Does an invoice-detail-with-line-items endpoint exist? | **Yes — verified myself.** `GET /api/invoices/:id` (`invoice.routes.ts:16` → `findInvoiceById`, `invoice.repository.ts:117-129`) returns `items` + `pet.owner`, tenant+branch scoped, guarded `billing.view`. No new endpoint. One real gap the brainstorm missed: payment-history rows omit `invoice.id` (only `invoiceNo`) — fixed by T-3b.1. |
| Q3 (3c) | Received-by filter = branch-scoped staff picker reusing existing staff-list source? | **Picker yes, reuse no — corrected.** Neither existing source fits: `GET /api/users` requires `staff.view` (cashiers may lack it → broken picker), `GET /api/appointments/doctors` returns doctors only (wrong population — payments are received by any staff). Decision: derive options from `PaymentHistory` itself (`receivedByOptions` in the existing response, T-3c.2) — correct population by definition, rides `billing.view`, zero new endpoints, tenant/branch scoped by the same where-clause. Not free text. |
| Q4 (3d) | Scope (i) relation + name resolution vs (ii) new admission-detail view? | **Option (i).** The task's business objective ("see who did what for the admitted animal") is already met structurally by PR #17's History button + CareHistoryModal; the only real gap is name resolution. Option (ii) would add a new view + endpoint for zero additional user-visible information — fails Ponytail criteria 1 and 4 with no hard blocker forcing it. Correction to (i) as brainstormed: `doctorInCharge` needs **no** relation — it is already name-resolved client-side from the doctors picker map (`ClinicInpatient.tsx:89-91,514`), and that map is the correct population for that field. Only `performedBy` (any-staff) gets the relation. This halves the migration. Backlog note: server-side `doctorInCharge` resolution only if the doctors-map approach ever breaks (e.g. deactivated doctors dropping off the picker list). |

### Verdict per sub-AC

| Sub-AC | Verdict | Notes |
|---|---|---|
| 3a | **Approved as-is** | Brainstorm root-cause analysis confirmed; scope = asset swap + coverage test. |
| 3b | **Corrected** | Endpoint exists (Q2 confirmed) but `invoice.id` missing from history rows — T-3b.1 added. Modal = extract-and-reuse of SuccessModal markup, same file, no new component file. |
| 3c | **Corrected** | Staff-picker source changed from "reuse existing staff-list endpoint" (none fits permission/population-wise) to `receivedByOptions` in the existing payment-history response (T-3c.2). No schema change confirmed. |
| 3d | **Corrected (narrowed)** | Option (i) chosen; further narrowed to `performedBy` relation only — `doctorInCharge` excluded (already resolved client-side). Migration must clean orphans + use `ON DELETE SET NULL`. Pinned frontend regression test (ClinicInpatient.test.tsx:255) must be inverted, not deleted. |

### Multi-tenancy audit

| Task | Query touched | tenant_id status |
|---|---|---|
| T-3b.1 | `findPaymentHistory` select widened | Where-clause untouched; `{ tenantId }` anchor intact (repo:190). Safe. |
| T-3c.1 | `paymentHistoryWhere` gains 2 ANDed predicates | Predicates added INSIDE the tenant/branch-anchored where; test (4)/(5) guard cross-tenant `receivedById` probing (returns 0 rows — no existence oracle since response is just an empty list). Confirmed correct. |
| T-3c.2 | New distinct-receivers query | MUST reuse the same tenant/branch where builder — stated as a task requirement + isolation test. Flagged for @db-agent + @qa-agent attention. |
| T-3d.1/2 | New FK + relation include | Outer `findFirst` already `{ id, tenantId }`-scoped (hospitalization.repository.ts:26-29); relation join cannot widen the row set. FK is cross-tenant-agnostic by nature — write path sets `performedBy` from JWT `userId` only, integration test required. Flagged for @db-agent review (mandatory for the migration anyway). |
| 3a | none | No DB access change. |

### Risks & dependencies

- R1 (3a): replacement font file must be committed as a binary asset; verify pdfkit embeds it under the existing subset-embedding path without size blowup (Noto Sans Thai GF Regular ≈ 100-150 KB — acceptable).
- R2 (3d): migration on production-like data with orphaned `performedBy` — orphan-null step is mandatory, @db-agent gate.
- R3 (3c): `groupBy`+name join is 1 extra query per page load — negligible at clinic scale (NFR: no measurable impact).
- D1: 3b depends on T-3b.1 landing before T-3b.3.
- D2: 3d requires @db-agent migration review before @dev-agent implementation.

**Sign-off: GRANTED-WITH-CORRECTIONS.** All four sub-ACs are ready for Step 3.5 `/grill-with-docs`; corrections are applied in the task list above, not deferred.
