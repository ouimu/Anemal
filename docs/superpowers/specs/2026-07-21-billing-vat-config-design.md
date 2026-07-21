# Billing VAT Configuration — Design Spec

**Date:** 2026-07-21
**Status:** Approved (brainstorm)
**Author:** pm-agent/ba-agent (via Claude Code session)

## Problem

Billing currently hardcodes 7% VAT, exclusive-style (added on top of price), both backend
(`invoiceItemSchema.taxRate` default 7, client-suppliable) and frontend
(`ClinicBilling.tsx: TAX_RATE = 7`). Some clinics have no VAT registration; others price
VAT-inclusive. There is no clinic-level configuration.

## Decisions (brainstorm sign-off)

1. **VAT mode**, 3 states, clinic-level (`TenantSettings`, matches "Clinic Setting" scope):
   - `none` — no VAT. No VAT line/label anywhere. `total = subtotal - discount`.
   - `exclusive` — prices entered/shown do **not** include VAT. VAT is added on top.
     `taxAmount = taxable * rate / 100`; `total = taxable + taxAmount`.
   - `inclusive` — prices entered/shown **already include** VAT. VAT is extracted for display only,
     total is unchanged. `taxAmount = taxable - taxable / (1 + rate/100)`; `total = taxable`.
   - (`taxable = subtotal - discount` in all cases.)

2. **VAT rate**: editable number per clinic (not fixed 7%), default **7** on first setup /
   migration. Only relevant when mode is `exclusive` or `inclusive` (ignored/hidden when `none`).

3. **Price field labeling** (billing invoice line-item price input, and any price display that
   is VAT-sensitive): append `(Inc. VAT)` when mode is `inclusive`, `(Ex. VAT)` when mode is
   `exclusive`, no suffix when mode is `none`.

4. **Permission**: guarded by existing `settings.manage` permission (same as other Clinic
   Settings fields) — no new permission code. Location: Clinic Admin → Clinic Setting.

5. **Cashier override removed**: `POST /api/invoices` currently accepts a client-supplied
   `taxRate` (defaults 7, 0–100 range). This is **removed**. VAT mode + rate are always read
   server-side from the tenant's `TenantSettings`, never from the request body. Prevents
   invoice-time tampering and keeps all invoices for a tenant consistent.

6. **Historical invoices unaffected**: `Invoice` rows already store `taxRate`/`taxAmount` at
   creation time — no backfill/recalculation. Only new invoices use the new resolution.

## Data model change

`TenantSettings` (prisma/schema.prisma) — add two columns:

```prisma
vatMode String  @default("exclusive") @db.VarChar(20) // 'none' | 'exclusive' | 'inclusive'
vatRate Decimal @default(7) @db.Decimal(5, 2)
```

Migration backfills existing tenants to `vatMode='exclusive', vatRate=7` — preserves current
hardcoded behavior exactly, zero behavior change for existing clinics until they opt in.

Validation: `vatRate` must be `>= 0` and `<= 100`. When `vatMode = 'none'`, `vatRate` is stored
but ignored in calculation (UI hides the rate input).

## Backend changes

- `settings.controller.ts` / `settings.routes.ts`: extend the existing clinic settings
  GET/PUT payload with `vatMode`, `vatRate` (Zod: `z.enum(['none','exclusive','inclusive'])`,
  `z.number().min(0).max(100)`). Guarded by `settings.manage` (existing pattern — no route change
  needed beyond payload fields).
- `invoice.service.ts`:
  - `createInvoiceSchema`: remove `taxRate` field entirely (breaking change to the request
    contract — acceptable since no external API consumers).
  - `createInvoice(tenantId, branchId, data, createdBy)`: fetch tenant's `vatMode`/`vatRate` via
    a new lightweight lookup (reuse `TenantSettings` — likely a new `invoiceRepo` or
    `settings.repository` accessor), then compute `taxAmount`/`totalAmount` per the 3-mode
    formula above instead of the current single exclusive formula.
- `invoice.repository.ts`: no schema change to `Invoice`/`InvoiceItem` (still stores resolved
  `taxRate`, `taxAmount`, `totalAmount` per invoice — just the source of `taxRate` changes from
  request body to clinic settings).

## Frontend changes

- Clinic Setting screen (wherever other `TenantSettings` fields are edited, e.g. an admin
  settings view — locate via `settings.manage`-guarded UI): add a "VAT" section — mode selector
  (segmented/radio: No VAT / VAT Exclusive / VAT Inclusive) + rate number input (visible only
  when mode ≠ none, default 7).
- `ClinicBilling.tsx`:
  - Remove hardcoded `const TAX_RATE = 7`.
  - Fetch clinic's `vatMode`/`vatRate` (new query, e.g. `GET /api/settings` already used
    elsewhere, or a lighter `/api/settings/vat` if the full settings payload is heavy/permission-
    gated beyond what a cashier role should read — **implementer to check**: cashier role needs
    read access to vatMode/vatRate to compute the on-screen total, but should NOT need
    `settings.manage` to view it. If existing `GET /api/settings` is gated by `settings.manage`,
    add a narrower public-to-clinic-roles read, e.g. include vatMode/vatRate in the `/auth/me` or
    a `/api/settings/billing-config` endpoint gated by a lower/no permission (read-only, no
    secrets exposed) rather than reusing the admin-only settings GET.
  - Replace the exclusive-only `tax`/`total` calc with the 3-mode formula, matching backend.
  - Price input label switches per mode (`(Inc. VAT)` / `(Ex. VAT)` / none).
  - VAT line in the cart summary: hidden when `none`; labeled "VAT (Exclusive)" or "VAT
    (Inclusive, already in price)" — exact copy TBD in plan/implementation, not a design blocker.
- PDF receipt (`pdf.service.ts`): apply same VAT line display rule (hide when `none`).

## Open implementation detail (not a design blocker, flag to db-agent/dev-agent)

The read-access boundary for cashier-role VAT visibility (billing.create permission) vs.
edit-access (settings.manage permission) needs a concrete existing-endpoint decision — resolve
during `/grill-with-docs` or plan-writing, not re-litigated here.

## Out of scope

- Multi-branch VAT variance (VAT is tenant-wide per decision above, not per-branch).
- Retroactive recalculation of existing invoices.
- VAT reporting/export features.
