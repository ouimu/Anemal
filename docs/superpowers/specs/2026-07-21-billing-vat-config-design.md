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

4. **Permission (BA-corrected 2026-07-21)**: edit is guarded by the existing
   **`clinic.profile.edit`** permission — the same code that already guards `taxId` and the rest
   of the clinic profile, and held only by `clinic_admin` (E / – / –), matching "Location: Clinic
   Admin → Clinic Setting." No new permission code. *(The brainstorm answer named
   `settings.manage`; that code does not exist in the RBAC matrix. `clinic.settings.manage` exists
   but is seeded-reserved and granted to no role — using it would lock out even clinic_admin.
   See BA Findings F1.)*
   Read is gated by **`clinic.profile.view`** (see BA Findings F2 / Open-question resolution).

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
  `z.number().min(0).max(100)`). The **write** path (`PUT /api/settings/clinic`) is already
  guarded by `clinic.profile.edit`; add the two fields to that existing endpoint's Zod schema and
  update handler — no new route, no new permission. The **read** path (`GET /api/settings/clinic`)
  is already guarded by `clinic.profile.view` (held by all three system roles); include `vatMode`/
  `vatRate` in its response payload so billing screens can read them (BA Findings F2).
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
  - Fetch clinic's `vatMode`/`vatRate` from the existing **`GET /api/settings/clinic`** endpoint,
    which is gated by `clinic.profile.view` — a permission all three system roles (including
    `clinic_staff`/cashier) already hold. No new endpoint and no new permission are required; the
    open question below is resolved (BA Findings F2). The billing screen simply reads the two new
    fields off the clinic-settings payload it can already retrieve.
  - Replace the exclusive-only `tax`/`total` calc with the 3-mode formula, matching backend.
  - Price input label switches per mode (`(Inc. VAT)` / `(Ex. VAT)` / none).
  - VAT line in the cart summary: hidden when `none`; labeled "VAT (Exclusive)" or "VAT
    (Inclusive, already in price)" — exact copy TBD in plan/implementation, not a design blocker.
- PDF receipt (`pdf.service.ts`): apply same VAT line display rule (hide when `none`).

## Open implementation detail — RESOLVED (BA, 2026-07-21)

The read-access boundary for cashier-role VAT visibility is resolved: **read via
`clinic.profile.view`, edit via `clinic.profile.edit`**, both on the existing
`GET`/`PUT /api/settings/clinic` endpoints. `clinic_staff` (the cashier / `billing.create` role)
already holds `clinic.profile.view` (V for all three system roles in the default matrix), so it
can read `vatMode`/`vatRate` to compute the on-screen total without any new endpoint or permission,
and without ever holding an edit-level code. Deny-by-default is preserved; the server remains the
source of truth for the resolved rate (Decision 5). No custom endpoint (`/api/settings/vat`,
`/api/settings/billing-config`) is warranted — standard config over custom development.

## BA Findings

**F1 — `settings.manage` does not exist (permission-model correctness). [Corrected in place.]**
Decision 4 named `settings.manage` as the edit guard "same as other Clinic Settings fields." No
such code exists in `anemal-rbac-matrix`. Clinic settings are guarded by granular codes
(`clinic.profile.edit`, `clinic.hours.edit`, `clinic.payment.edit`, `clinic.integrations.edit`),
verified against `src/backend/routes/settings.routes.ts`. A separate `clinic.settings.manage`
code is seeded but **reserved/unenforced and granted to no role** (permission-matrix §"Reserved
permission") — guarding VAT edit with it would deny *everyone*, including `clinic_admin`. Resolved
to **`clinic.profile.edit`** (admin-only; already co-located with `taxId`, which is tax-related).

**F2 — Read-access open question resolved to `clinic.profile.view` (no new endpoint).**
`GET /api/settings/clinic` is gated by `clinic.profile.view`, which `clinic_staff` (cashier) holds
by default. The spec's premise ("if existing GET is gated by `settings.manage`… add a narrower
read") was based on the non-existent code from F1; the real GET is already role-appropriate. No
`/auth/me` change, no new `/api/settings/billing-config` endpoint.

**F3 — Missing-`TenantSettings`-row fallback (grill-catch; add to plan). [Not a blocker.]**
`Tenant.settings` is an **optional** relation (`TenantSettings?`), so a tenant may have no settings
row. `createInvoice()`'s new `vatMode`/`vatRate` lookup must resolve a safe default
(`exclusive`/`7`) when the row is absent, otherwise invoice creation throws for such tenants. Same
default the migration backfills — keeps behavior identical to today's hardcoded 7% exclusive. The
lookup must be tenant-scoped (`WHERE tenantId = :tenantId`), consistent with multi-tenancy rules.

**F4 — Server-side clamp mirrors the request-body removal (defense-in-depth). [Minor.]**
With the cashier `taxRate` override removed (Decision 5), the only write path for `vatRate` is the
`clinic.profile.edit`-guarded settings PUT with `z.number().min(0).max(100)`. Confirm the invoice
resolver treats a stored out-of-range/NaN `vatRate` defensively (shouldn't occur given the PUT
validation, but the resolver is the security boundary, not the UI).

## Out of scope

- Multi-branch VAT variance (VAT is tenant-wide per decision above, not per-branch).
- Retroactive recalculation of existing invoices.
- VAT reporting/export features.

## BA Sign-off

**Date:** 2026-07-21
**Reviewer:** @ba-agent
**Verdict:** CHANGES-REQUESTED → **APPROVE (conditional)** — corrections applied in place; F1/F2
resolved directly, F3/F4 must be carried into `/write-plan`. Because a committed decision named a
non-existent permission (F1), this is flagged CHANGES-REQUESTED for the record, but the fix is
unambiguous and already inline, so the design is cleared to proceed to `/grill-with-docs` (Step 3.5)
without another BA round-trip.

**Checked:**
- Permission model vs `anemal-rbac-matrix` + `references/permission-matrix.md` and live
  `settings.routes.ts`: edit guard corrected `settings.manage` → `clinic.profile.edit`; reserved
  `clinic.settings.manage` explicitly ruled out (lockout risk). **[F1]**
- Cashier read boundary: resolved to existing `clinic.profile.view` (held by all three system
  roles); no new endpoint/permission — config over custom. **[F2, open question closed]**
- Multi-tenancy vs `schema.prisma`: `TenantSettings` is tenant-scoped (`tenantId @unique`, one row,
  no `branchId`) — confirms VAT-is-tenant-wide is correct, not branch-level.
- Server-as-boundary / deny-by-default: request-body `taxRate` removal (Decision 5) upheld; server
  resolves rate; UI guard is hide/disable only.
- Data model + migration: `vatMode`/`vatRate` defaults (`exclusive`/`7`) preserve current behavior;
  optional-settings-row fallback flagged. **[F3]**
- NFR/edge: missing settings row (F3) and defensive rate handling (F4) surfaced for the plan.

**Requirement-readiness:** objective ✔, roles/permissions ✔ (post-correction), exceptions ✔ (F3),
NFR impact ✔, acceptance criteria — to be authored in `/write-plan`, risks/dependencies ✔.
Handoff: @pm-agent for task breakdown after Step 3.5 grilling.
