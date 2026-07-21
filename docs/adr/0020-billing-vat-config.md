# ADR-0020: Clinic-Configurable VAT (None / Exclusive / Inclusive)

**Date:** 2026-07-21
**Status:** Accepted
**Context:** PR (pending) — Billing VAT Configuration

## Context

Billing hardcoded 7% VAT, exclusive-style, in two places (`invoice.service.ts`
`createInvoiceSchema.taxRate` default 7, client-suppliable; `ClinicBilling.tsx`
`TAX_RATE = 7` constant). Clinics without VAT registration, or that price VAT-inclusive,
had no way to configure this. See design spec:
`docs/superpowers/specs/2026-07-21-billing-vat-config-design.md` (brainstorm + BA sign-off).

## Decision

1. **Three VAT modes**, tenant-scoped (`TenantSettings.vatMode`: `none` | `exclusive` |
   `inclusive`), each with its own total formula (see design spec §Decisions.1). Rate is
   `TenantSettings.vatRate` (Decimal 5,2, default 7, admin-editable, 0–100).
2. **Server is the sole source of truth for VAT.** The per-invoice client-suppliable `taxRate`
   field is removed from `createInvoiceSchema` entirely. `createInvoice()` resolves
   `vatMode`/`vatRate` from the tenant's `TenantSettings` server-side. This closes a
   tampering vector (a cashier could previously send an arbitrary `taxRate` 0–100 per invoice)
   and guarantees invoice-to-invoice consistency for a tenant.
3. **Permission reuse, not a new code.** Edit guarded by existing `clinic.profile.edit`
   (admin-only); read (for the billing screen to compute totals) via existing
   `clinic.profile.view` (held by all three system roles, including cashier/`clinic_staff`).
   No new permission code, no new endpoint — `vatMode`/`vatRate` ride along on the existing
   `GET`/`PUT /api/settings/clinic` payload. (BA-corrected: the design's first draft named a
   nonexistent `settings.manage` code — see spec §BA Findings F1.)
4. **Tenant-wide, not branch-level.** Matches "Clinic Setting" scope and `TenantSettings`'
   existing tenant-only shape; no per-branch VAT override.
5. **No retroactive recalculation.** `Invoice` rows already persist resolved `taxRate` /
   `taxAmount` at creation time; only new invoices use the new 3-mode resolution.

## Grilling findings (Step 3.5, resolved via codebase exploration — no design change needed)

- **F5:** `hospitalization.service.ts:99` (discharge → invoice creation) hardcodes
  `taxRate: 7` in its `createInvoice()` call — this call site breaks under the new `.strict()`
  schema (unknown key) once `taxRate` is removed. **Resolution:** drop the field at this call
  site as an execute-plan task; it inherits the tenant's resolved VAT automatically.
- **F6:** `pdf.service.ts:136` prints `VAT ${taxRate}%` unconditionally. **Resolution:** gate
  the row on `taxAmount > 0` / stored mode-aware label so `none`-mode invoices don't show a
  VAT line on the printed receipt (mirrors the on-screen cart rule).
- **F7:** Frontend response types (`useInvoices.ts` `Invoice.taxRate`, receipt render at
  `ClinicBilling.tsx:660/689`) keep reading `invoice.taxRate` from the server response (that's
  fine — the server still returns a resolved rate per invoice for receipts); only the
  *request*-side `taxRate` field (`ClinicBilling.tsx:132`, `CreateInvoiceInput.taxRate` in
  `useInvoices.ts`) is removed.
- **F8:** Existing tests reference request-side `taxRate` as input (`invoice.test.ts`,
  `phase4.test.ts`, `pdf.test.ts`, `ClinicBilling.test.tsx`) — fixtures/assertions need updating
  as part of implementation, not a design concern.
- **Inclusive-mode discount interaction verified correct:** `taxable = subtotal − discount`
  applies uniformly before VAT extraction in all 3 modes — for `inclusive`, this means a
  discount is subtracted from the VAT-inclusive price first, then VAT is backed out of the
  reduced amount (`taxable − taxable/(1+rate/100)`), which is the standard Thai VAT-inclusive
  discount treatment. No formula change needed.
- **Rounding:** existing `round2()` pattern (round each derived amount to 2dp) is reused
  unchanged for the new formulas — no new rounding policy needed.

No open findings block `/write-plan`.

## Consequences

- Breaking change to `POST /api/invoices` request contract (`taxRate` removed) — acceptable,
  no external API consumers (internal SPA only).
- `hospitalization.service.ts` discharge-invoice call site must be updated in lockstep.
- i18n: new VAT mode labels + price-field VAT suffix (`(Inc. VAT)` / `(Ex. VAT)`) need Thai
  translation keys per existing i18n pattern (Phase 9).
