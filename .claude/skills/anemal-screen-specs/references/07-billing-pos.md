# Screen Spec: Billing & POS
> Prototype: `design_prototype/billing_pos_1024x768/code.html`
> Component: `src/frontend/src/views/clinic/ClinicBilling.tsx`
> Hooks: `src/frontend/src/hooks/useInvoices.ts` (+ inline search / medical-record queries)
> API: `/api/invoices` (create, get, list, `/:id/payment`)
> Status: **Implemented** — browser-print receipt + PDF invoice download; PromptPay QR generation
> implemented but **credential-gated** (422 without a configured `promptpayId`); card gateway
> (Omise/Stripe) deferred to Phase 10.

---

## Layout (`flex flex-col lg:flex-row gap-lg`)

### Left — invoice builder (`flex-1`)

```
PATIENT & VISIT card (glass-card rounded-xl p-md):
  Pet search (GET /api/search?q=) → select pet (name · owner · phone)
  Visit <select> (GET /api/medical-records?petId=) — "Bill a visit" auto-adds dispensed medicines
  (optional — leave empty for a retail-only sale)

LINE ITEMS card (glass-card rounded-xl overflow-hidden):
  Header bar bg-primary text-primary-on: "Line items" + "Service" / "Product" add buttons
  Auto-pulled medicine rows (read-only, bg tint, medication icon) — priced from drug.unitPrice
  Editable rows: description + qty stepper + unit price + line total + remove (×)
    Retail rows carry productId → server deducts stock + logs 'out' movement
  Empty state: receipt_long icon + prompt

  TOTALS (bg-surface-container-low p-md):
    Subtotal · Discount ฿ (input) · Tax (7%) · Total due (text-headline-md font-code text-primary)
```

### Right — payment panel (`w-full lg:w-96`)

```
glass-card rounded-xl p-md:
  Method selector (grid-cols-3, min-h-[64px] each): Cash · PromptPay · Card
    active = border-primary bg-surface-container-low text-primary
  Cash      → tendered input + auto change (text-success / text-error if short)
  PromptPay → live QR panel (qr_code_2, "Scan to pay · ฿total"; 422 if `promptpayId` not configured)
  Card      → "insert/tap on terminal" note
  "Confirm Payment · ฿total" CTA: bg-secondary text-secondary-on min-h-[56px]
```

### Success modal
`check_circle` (secondary), "Payment Successful!", invoice no + total, **Print Receipt** (opens a
print window with a styled HTML receipt) + **Done** (resets the screen).

## Behaviour

| Step | Result |
|---|---|
| Pick a visit | Medicine lines previewed; server auto-pulls them on submit via `medicalRecordId` |
| Add service / product | Adds editable cart rows; products carry `productId` (retail → stock deduction) |
| Confirm payment | `POST /api/invoices` then `PUT /api/invoices/:id/payment` |
| invoice_no | Auto `INV-YYYY-MM-NNNN` (per-tenant, per-month) computed server-side |
| Totals | subtotal − discount + 7% VAT, computed authoritatively on the server |
| Print | Client opens a print window with the returned invoice; no PDF library (Phase 3 choice) |

## Deferred to Phase 10
Omise/Stripe card gateway + webhooks; email receipts (PDF receipt download itself is implemented —
see `GET /api/invoices/:id/pdf`, `services/pdf.service.ts`).

## Touch / tokens
All controls ≥ 44px (primary CTA 56px); rows ≥ 48px. No emoji, no raw hex — Compassionate Care tokens; Material Symbols Outlined throughout. Monetary values use `font-code` for numeric alignment.
