# Billing Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Item 3 of the 2026-07 bugfix pipeline: (3a) fix Thai/Latin PDF glyph rendering by replacing a subset font, (3b) let staff reopen a receipt from any Payment History row, (3c) add Method + Received-by filters to Payment History, (3d) resolve inpatient care-log `performedBy` to a real staff name server-side.

**Architecture:** No new endpoints, no new permission codes, one migration. 3a is a binary-asset swap (zero code change) plus a `fontkit`-based regression guard. 3b extracts the existing post-sale `SuccessModal`'s receipt markup into two shared pieces (`ReceiptBody` content + `ReceiptActions` buttons) reused by a new bare `ReceiptModal` (history path, no success framing) and by `SuccessModal` itself (post-sale path, keeps its banner) — this satisfies grill finding F2 by construction rather than by a runtime flag. 3c adds two optional ANDed predicates inside the already tenant/branch-scoped `paymentHistoryWhere` builder, plus a same-shape sibling query (scope minus the two new predicates) for the receiver picker's options. 3d adds a nullable `User` relation to `DailyInpatientCare.performedBy` (`ON DELETE SET NULL`, orphan-cleaned first) and threads the resolved name through repository → frontend, replacing a pinned "never resolve" regression test with its inverse.

**Tech Stack:** Node.js + Express + Prisma (backend), React 18 + TanStack Query + Tailwind (frontend), Jest + supertest (backend tests), Vitest + Testing Library (frontend tests), `fontkit` (already a transitive dep of `pdfkit` — do not add it to `package.json`).

## Global Constraints

- **No new npm dependencies.** `fontkit` is resolved from `node_modules/fontkit` (transitive via `pdfkit`); do not add it to `package.json`.
- **No new endpoints, no new permission codes.** 3a/3b/3c ride existing `billing.view`/`billing.create`/`billing.payment`; 3d rides the existing hospitalization-view guard.
- **Multi-tenancy:** every touched query keeps its `tenantId` anchor. T-3c.1/T-3c.2 predicates go **inside** `paymentHistoryWhere`, never replace it.
- **i18n:** every new UI string gets an English key in `src/frontend/src/i18n/index.ts`'s `en` block and a Thai counterpart in the `th` block (Phase 9 convention, no library).
- **Design system:** 44px min-height touch targets, design tokens only, Material Symbols only — per `anemal-design-system`.
- **File budget (do not exceed):** 1 new migration, 1 new font license file, 1 new backend test file (`pdf-font-coverage.test.ts`), ≤2 new frontend test files. Every other change is an edit to an existing file. This plan uses exactly 1 new frontend test file (`ClinicBilling.test.tsx`), leaving headroom unused.
- **T-3d.1 requires `@db-agent` review before merge** (CLAUDE.md: all DB-touching changes) — flagged explicitly at that task below. Do not skip.
- **Commit after each task**, not after each file edit — matches this plan's task granularity (each task is one red→green→commit unit).

---

## Task 1 — T-3a.1: Replace the Thai-only subset font, add license + coverage test

**Root cause (verified):** `src/backend/assets/fonts/NotoSansThai-Regular.ttf` is a 37 KB Thai-only subset with zero Latin letters, digits, or the `฿` symbol. The invoice/prescription templates (`pdf.service.ts`) mix Thai with Latin labels (`"BILL TO"`, `"DESCRIPTION"`) and digits everywhere — those render as `.notdef` boxes today. Thai itself renders fine.

Files:
- Modify (binary replace): `src/backend/assets/fonts/NotoSansThai-Regular.ttf`
- Create: `src/backend/assets/fonts/FONT-LICENSE.txt`
- Create: `src/backend/__tests__/pdf-font-coverage.test.ts`

**Step 1 — write the failing test first.**

```ts
// src/backend/__tests__/pdf-font-coverage.test.ts
// Guards against ever re-shipping a Thai-only subset font (T-3a.1, ADR-0013 D1).
// Loads the shipped TTF directly with fontkit (already a transitive dep of
// pdfkit — resolved from node_modules, never add it to package.json) and
// asserts glyph coverage for every character class the invoice/prescription
// PDF templates render: Latin letters, digits, the Baht sign, Thai script,
// and the punctuation used in the templates (pdf.service.ts).
import path from 'path'

// No @types/fontkit is installed; type the two calls we use rather than
// pulling in `any` everywhere.
const fontkit = require('fontkit') as {
  openSync: (filePath: string) => { hasGlyphForCodePoint: (codePoint: number) => boolean }
}

const FONT_PATH = path.join(__dirname, '../assets/fonts/NotoSansThai-Regular.ttf')

describe('NotoSansThai-Regular.ttf — full Thai+Latin coverage (ADR-0013 D1)', () => {
  const font = fontkit.openSync(FONT_PATH)

  const required: Array<[string, string]> = [
    ['Latin A', 'A'],
    ['Latin z', 'z'],
    ['Digit 0', '0'],
    ['Digit 9', '9'],
    ['Baht sign', '฿'],
    ['Thai KO KAI (ก)', 'ก'],
    ['Thai THANTHAKHAT (์)', '์'],
    ['Space', ' '],
    ['Period', '.'],
    ['Slash', '/'],
  ]

  it.each(required)('has a glyph for %s', (_label, ch) => {
    const codePoint = ch.codePointAt(0)!
    expect(font.hasGlyphForCodePoint(codePoint)).toBe(true)
  })
})
```

Run: `npm test -- pdf-font-coverage` (backend workspace)
Expected: **FAIL** — the current shipped TTF is a Thai-only subset, so `A`, `z`, `0`, `9`, `฿`, `.`, `/` all resolve `hasGlyphForCodePoint` to `false`.

**Step 2 — replace the font asset (minimal implementation).**

Download the official OFL-1.1 Google Fonts static Regular instance and overwrite the file in place (same filename/path → zero code change in `pdf.service.ts`; `FONT_PATH` at `pdf.service.ts:8` and `registerFont('NotoThai', FONT_PATH)` at `pdf.service.ts:58,171` are untouched):

```bash
curl -fL -o src/backend/assets/fonts/NotoSansThai-Regular.ttf \
  https://raw.githubusercontent.com/google/fonts/main/ofl/notosansthai/static/NotoSansThai-Regular.ttf
```

If that path 404s (Google Fonts occasionally reorganizes `ofl/<family>/static/` layouts) or the coverage test in Step 3 still fails, use the BA-approved fallback — Sarabun Regular, also OFL-1.1, also ships Thai + Basic Latin + digits — writing to the **same target filename**:

```bash
curl -fL -o src/backend/assets/fonts/NotoSansThai-Regular.ttf \
  https://raw.githubusercontent.com/google/fonts/main/ofl/sarabun/Sarabun-Regular.ttf
```

Sanity-check the download before running the test suite:

```bash
node -e "const fk=require('./src/backend/node_modules/fontkit'); const f=fk.openSync('src/backend/assets/fonts/NotoSansThai-Regular.ttf'); console.log('size ok:', require('fs').statSync('src/backend/assets/fonts/NotoSansThai-Regular.ttf').size, 'bytes'); console.log('has A:', f.hasGlyphForCodePoint(65)); console.log('has ก:', f.hasGlyphForCodePoint(0x0E01))"
```

Expect a file size in the 100–200 KB range (R1 in BA sign-off: subset was 37 KB; a full-coverage static instance is materially larger) and both glyph checks `true`.

Create the license file (condensed notice + link to the canonical OFL-1.1 text — the full legal text is long and the canonical URL is authoritative, so we point to it rather than vendor a copy that can drift):

```
src/backend/assets/fonts/FONT-LICENSE.txt
```
```text
NotoSansThai-Regular.ttf

Font: Noto Sans Thai (or Sarabun, if used as the documented fallback — see
docs/superpowers/plans/2026-07-11-billing-pipeline.md Task 1)
Publisher: Google Fonts
License: SIL Open Font License, Version 1.1 (OFL-1.1)
Full license text: https://openfontlicense.org

The OFL-1.1 permits embedding, redistribution, and modification (including
subsetting) as part of a larger software work, provided the font itself is
not sold separately from the software. No attribution is required in the
rendered output. This file records provenance for audit purposes only.
```

**Step 3 — verify the test passes.**

Run: `npm test -- pdf-font-coverage` (backend workspace)
Expected: 10/10 PASS.

**Step 4 — commit.**

`feat(pdf): replace Thai-only subset font with full Thai+Latin coverage (T-3a.1, ADR-0013 D1)`

- [ ] Task 1 complete

---

## Task 2 — T-3a.2: PDF generation smoke test with mixed Thai+Latin+digit content (both templates)

**Grill finding F1 (resolved in tasks.md):** `generatePrescriptionPdf` (`pdf.service.ts:166-237`) shares the same `'NotoThai'` font registration as the invoice path but had no smoke test. Both paths get covered here.

Files:
- Modify: `src/backend/tests/integration/pdf.test.ts` (append after the existing `PDF — Prescription endpoint` describe block, line 163)

**Step 1 — write the failing/new tests.**

Append to `src/backend/tests/integration/pdf.test.ts`:

```ts
describe('PDF — Thai+Latin+digit glyph smoke test (T-3a.2, ADR-0013 D1/F1)', () => {
  it('✅ invoice PDF renders a Thai+Latin+digit line description without throwing', async () => {
    const uniq = `${Date.now()}`
    const ownerRes = await request(server).post('/api/owners').set('Authorization', `Bearer ${adminA}`)
      .send({ firstName: 'Glyph', lastName: `Test${uniq}`, phone: `09${uniq.slice(-8)}` })
    const petRes = await request(server).post('/api/pets').set('Authorization', `Bearer ${adminA}`)
      .send({ ownerId: ownerRes.body.data.id, name: 'ตัวทดสอบ', species: 'cat', microchipId: `GLYPH${uniq}` })

    const branchRes = await request(server).get('/api/branches').set('Authorization', `Bearer ${adminA}`)
    const branchId: number = branchRes.body.data[0].id
    const switchRes = await request(server)
      .post('/auth/switch-branch')
      .set('Authorization', `Bearer ${adminA}`)
      .send({ branchId })
    const scopedAdminA: string = switchRes.body.data.token

    const invRes = await request(server)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${scopedAdminA}`)
      .send({
        petId: petRes.body.data.id,
        items: [{ description: 'ค่าตรวจ Exam 250', itemType: 'service', qty: 1, unitPrice: 250 }],
        taxRate: 7,
      })
    expect(invRes.status).toBe(201)

    const res = await request(server)
      .get(`/api/invoices/${invRes.body.data.id}/pdf`)
      .set('Authorization', `Bearer ${adminA}`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => callback(null, Buffer.concat(chunks)))
      })
    expect(res.status).toBe(200)
    const buf = res.body as Buffer
    expect(buf.length).toBeGreaterThan(0)
    expect(buf.slice(0, 4).toString()).toBe('%PDF')
  })

  it('✅ prescription PDF renders Thai+Latin+digit dosage instructions without throwing [Grill F1]', async () => {
    if (!prescriptionId) {
      console.warn('Skipping — no drug seeded in dev-clinic')
      return
    }
    // Patch the prescription seeded in the top-level beforeAll to mix Thai +
    // Latin + digits in the dosage instruction — proves the shared font path
    // (generatePrescriptionPdf, pdf.service.ts:166-237) also renders correctly.
    await prisma.prescription.update({
      where: { id: prescriptionId },
      data: { dosageInstruction: '1 tab twice daily กินหลังอาหาร 250mg' },
    })

    const res = await request(server)
      .get(`/api/prescriptions/${prescriptionId}/pdf`)
      .set('Authorization', `Bearer ${adminA}`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => callback(null, Buffer.concat(chunks)))
      })
    expect(res.status).toBe(200)
    const buf = res.body as Buffer
    expect(buf.length).toBeGreaterThan(0)
    expect(buf.slice(0, 4).toString()).toBe('%PDF')
  })
})
```

Run: `npm test -- pdf.test` (backend workspace)
Expected before Task 1's font swap would have been a risk of throw/garbled output; **after** Task 1 lands, this should already pass. If run standalone before Task 1, expect PASS on status/magic-bytes (pdfkit doesn't throw on missing glyphs — it silently renders `.notdef`), which is exactly why Task 1's glyph-coverage test (not this smoke test) is the real regression guard. This smoke test's job is narrower: prove neither template throws or returns empty output on mixed-script input.

**Step 2 — verify.**

Run: `npm test -- pdf.test` (backend workspace)
Expected: 7/7 PASS (5 existing + 2 new).

**Step 3 — commit.**

`test(pdf): smoke-test Thai+Latin+digit content on invoice and prescription PDFs (T-3a.2, grill F1)`

- [ ] Task 2 complete

---

## Task 3 — T-3b.1: Expose `invoice.id` in payment-history rows

**Gap (BA-verified):** `GET /api/invoices/:id` already returns full line items (`invoice.repository.ts:117-129`), but payment-history rows only carry `invoice: { invoiceNo }` — no id to fetch the detail with.

Files:
- Modify: `src/backend/models/invoice.repository.ts:209`
- Test: `src/backend/__tests__/invoice.test.ts` (new `describe` block appended after line 148)

**Step 1 — write the failing test.**

Append to `src/backend/__tests__/invoice.test.ts` (after the `bill-3.2` describe block closes at line 148):

```ts
describe('bill-3.3 — Payment History: invoice.id, filters, receiver options (T-3b.1, T-3c.1, T-3c.2)', () => {
  let tidPH: number
  let tidOther: number
  let branchAId: number
  let adminUserId: number
  let staffUserId: number
  let staffBUserId: number
  let otherAdminUserId: number
  let tokenAdminPH: string
  let tokenStaffPH: string
  let invoicePaidByAdmin: number

  async function payInvoiceAs(token: string, method: string): Promise<number> {
    const invRes = await request(server).post('/api/invoices').set(auth(token))
      .send({ items: [{ description: 'Line', itemType: 'service', qty: 1, unitPrice: 100 }] }).expect(201)
    await request(server).put(`/api/invoices/${invRes.body.data.id}/payment`).set(auth(token))
      .send({ paymentMethod: method }).expect(200)
    return invRes.body.data.id
  }

  beforeAll(async () => {
    const ts = Date.now()
    const hash = await bcrypt.hash('TestPass1!', 10)

    const tenant = await prisma.tenant.create({ data: { name: 'PayHist Tenant', subdomain: `payhist-${ts}` } })
    tidPH = tenant.id
    const branchA = await prisma.branch.create({ data: { tenantId: tidPH, name: 'Main' } })
    const branchB = await prisma.branch.create({ data: { tenantId: tidPH, name: 'Branch B' } })
    branchAId = branchA.id

    const admin  = await prisma.user.create({ data: { tenantId: tidPH, branchId: branchA.id, name: 'PH Admin',  username: `ph_admin_${ts % 100000}`,  email: `ph-admin-${ts}@t.local`,  passwordHash: hash, role: 'admin' } })
    const staff  = await prisma.user.create({ data: { tenantId: tidPH, branchId: branchA.id, name: 'PH Staff',  username: `ph_staff_${ts % 100000}`,  email: `ph-staff-${ts}@t.local`,  passwordHash: hash, role: 'staff' } })
    const staffB = await prisma.user.create({ data: { tenantId: tidPH, branchId: branchB.id, name: 'PH Staff B', username: `ph_staffb_${ts % 100000}`, email: `ph-staffb-${ts}@t.local`, passwordHash: hash, role: 'staff' } })
    adminUserId = admin.id
    staffUserId = staff.id
    staffBUserId = staffB.id

    await seedUserRoles(prisma, [
      { userId: admin.id,  tenantId: tidPH, roleKey: 'clinic_admin' },
      { userId: staff.id,  tenantId: tidPH, roleKey: 'clinic_staff' },
      { userId: staffB.id, tenantId: tidPH, roleKey: 'clinic_staff' },
    ])

    tokenAdminPH = signToken({ userId: admin.id, tenantId: tidPH, branchId: branchA.id, plane: 'clinic', permSetVersion: 1, role: 'admin' })
    tokenStaffPH = signToken({ userId: staff.id, tenantId: tidPH, branchId: branchA.id, plane: 'clinic', permSetVersion: 1, role: 'staff' })
    const tokenStaffB = signToken({ userId: staffB.id, tenantId: tidPH, branchId: branchB.id, plane: 'clinic', permSetVersion: 1, role: 'staff' })

    // Cross-tenant probe — a second tenant's admin, used to prove receivedById
    // filtering and receivedByOptions never leak another tenant's user (T-3c.1
    // test 4, T-3c.2 test).
    const otherTenant = await prisma.tenant.create({ data: { name: 'PayHist Other', subdomain: `payhist-other-${ts}` } })
    tidOther = otherTenant.id
    const otherAdmin = await prisma.user.create({ data: { tenantId: tidOther, name: 'Other Admin', username: `ph_other_${ts % 100000}`, email: `ph-other-${ts}@t.local`, passwordHash: hash, role: 'admin' } })
    otherAdminUserId = otherAdmin.id
    await seedUserRoles(prisma, [{ userId: otherAdmin.id, tenantId: tidOther, roleKey: 'clinic_admin' }])

    invoicePaidByAdmin = await payInvoiceAs(tokenAdminPH, 'cash')
    await payInvoiceAs(tokenStaffPH, 'qr_promptpay')
    await payInvoiceAs(tokenStaffB, 'transfer')
  })

  afterAll(async () => {
    await prisma.paymentHistory.deleteMany({ where: { tenantId: { in: [tidPH, tidOther] } } })
    await prisma.invoiceItem.deleteMany({ where: { tenantId: { in: [tidPH, tidOther] } } })
    await prisma.invoice.deleteMany({ where: { tenantId: { in: [tidPH, tidOther] } } })
    await cleanupUserRoles(prisma, [tidPH, tidOther])
    await prisma.user.deleteMany({ where: { tenantId: { in: [tidPH, tidOther] } } })
    await prisma.branch.deleteMany({ where: { tenantId: tidPH } })
    await prisma.tenant.deleteMany({ where: { id: { in: [tidPH, tidOther] } } })
  })

  test('bill-10: payment-history rows carry invoice.id and invoice.invoiceNo (T-3b.1)', async () => {
    const res = await request(server).get('/api/invoices/payment-history').set(auth(tokenAdminPH)).expect(200)
    const row = res.body.data.rows.find((r: { invoice: { id: number } }) => r.invoice.id === invoicePaidByAdmin)
    expect(row).toBeTruthy()
    expect(typeof row.invoice.id).toBe('number')
    expect(typeof row.invoice.invoiceNo).toBe('string')
  })
})
```

Run: `npm test -- __tests__/invoice.test` (backend workspace)
Expected: **FAIL** on `bill-10` — `invoice.repository.ts:209` currently selects only `{ invoiceNo: true }`, so `row.invoice.id` is `undefined`.

**Step 2 — minimal implementation.**

`src/backend/models/invoice.repository.ts` — change the `findPaymentHistory` select (line 209):

```ts
export function findPaymentHistory(tenantId: number, userBranchId: number | null | undefined, params: PaymentHistoryParams) {
  const where = paymentHistoryWhere(tenantId, userBranchId, params)
  return Promise.all([
    prisma.paymentHistory.findMany({
      where: where as never,
      include: {
        invoice:    { select: { id: true, invoiceNo: true } },
        receivedBy: { select: { id: true, name: true } },
        branch:     { select: { id: true, name: true } },
      },
      orderBy: { paidAt: 'desc' },
      skip: params.skip,
      take: params.take,
    }),
    prisma.paymentHistory.count({ where: where as never }),
  ])
}
```

(Only the `invoice: { select: { ... } }` line changes — add `id: true` before `invoiceNo: true`.)

**Step 3 — verify.**

Run: `npm test -- __tests__/invoice.test` (backend workspace)
Expected: `bill-10` PASS (10 tests total across the file: bill-01..09 + bill-10).

**Step 4 — commit.**

`feat(billing): expose invoice.id in payment-history rows (T-3b.1)`

- [ ] Task 3 complete

---

## Task 4 — T-3b.2: Extract `ReceiptModal`/`SuccessModal` shared receipt content

**Design (per D2 in ADR-0013, grill F2):** the history path must show receipt content only — no "Payment Successful!" banner, no `earnedMsg`. Rather than a runtime flag on one component (which risks the banner leaking via a forgotten prop), split into three pieces: `ReceiptBody` (itemized lines + totals — no chrome), `ReceiptActions` (Print/PDF/Done buttons), and two thin callers — `ReceiptModal` (bare, used by history) and `SuccessModal` (adds its own banner + `earnedMsg`, used by the post-sale flow). Neither caller can accidentally render the other's chrome because the banner JSX only exists inside `SuccessModal`.

Files:
- Modify: `src/frontend/src/views/clinic/ClinicBilling.tsx` (replace lines 574-635, the current `SuccessModal`)

**Step 1 — replace `SuccessModal` (lines 574-635) with the extracted pieces.**

Replace the entire block from `function SuccessModal({ invoice, pet, method, earnedMsg, onClose }: ...) {` through its closing `}` (lines 574-635) with:

```tsx
async function downloadInvoicePdf(invoice: Invoice) {
  const res = await api.get(`/api/invoices/${invoice.id}/pdf`, { responseType: 'blob' })
  const url = URL.createObjectURL(new Blob([res.data as BlobPart], { type: 'application/pdf' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${invoice.invoiceNo}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

function printReceipt(invoice: Invoice, petLabel: string | undefined, method: string) {
  const items = (invoice.items ?? [])
    .map((i) => `<tr><td>${i.description}</td><td style="text-align:center">${Number(i.quantity)}</td><td style="text-align:right">${baht(Number(i.unitPrice))}</td><td style="text-align:right">${baht(Number(i.totalPrice))}</td></tr>`)
    .join('')
  const html = `<!doctype html><html><head><title>${invoice.invoiceNo}</title>
    <style>body{font-family:system-ui,sans-serif;padding:24px;color:#191c1e}h1{font-size:18px;margin:0}
    .muted{color:#45464d;font-size:12px}table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}
    th,td{padding:6px 4px;border-bottom:1px solid #e2e8f0}th{text-align:left;text-transform:uppercase;font-size:11px;color:#45464d}
    .tot{display:flex;justify-content:space-between;font-size:13px;margin-top:6px}.grand{font-weight:700;font-size:16px;border-top:2px solid #191c1e;padding-top:6px;margin-top:8px}</style></head>
    <body><h1>Anemal</h1><p class="muted">Tax invoice / receipt</p>
    <p class="muted">Invoice: <b>${invoice.invoiceNo}</b> · ${new Date(invoice.issuedAt).toLocaleString()}</p>
    ${petLabel ? `<p class="muted">Patient: ${petLabel}</p>` : ''}
    <table><thead><tr><th>Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Unit</th><th style="text-align:right">Total</th></tr></thead><tbody>${items}</tbody></table>
    <div style="margin-top:16px"><div class="tot"><span>Subtotal</span><span>${baht(Number(invoice.subtotal))}</span></div>
    <div class="tot"><span>Discount</span><span>-${baht(Number(invoice.discount))}</span></div>
    <div class="tot"><span>Tax (${Number(invoice.taxRate)}%)</span><span>${baht(Number(invoice.taxAmount))}</span></div>
    <div class="tot grand"><span>Total</span><span>${baht(Number(invoice.totalAmount))}</span></div>
    <p class="muted" style="margin-top:8px">Paid by ${method.replace('_', ' ')} · Thank you!</p></div>
    <script>window.onload=function(){window.print()}</script></body></html>`
  const w = window.open('', '_blank', 'width=420,height=640')
  if (w) { w.document.write(html); w.document.close() }
}

// Itemized lines + subtotal/discount/tax/total. No chrome (no overlay, no
// header, no buttons) — reused by both ReceiptModal (history path, bare) and
// SuccessModal (post-sale path, adds its own banner above this).
function ReceiptBody({ invoice, method }: { invoice: Invoice; method: string }) {
  return (
    <div className="text-left mb-md">
      <div className="max-h-48 overflow-y-auto divide-y divide-outline-variant border border-outline-variant rounded-lg mb-md">
        {(invoice.items ?? []).length === 0 && (
          <p className="px-sm py-sm text-body-sm text-on-surface-variant">No line items.</p>
        )}
        {(invoice.items ?? []).map((i) => (
          <div key={i.id} className="flex items-center justify-between gap-sm px-sm py-xs text-body-sm">
            <span className="flex-1 text-on-surface">{i.description}</span>
            <span className="text-on-surface-variant font-code w-16 text-right">× {Number(i.quantity)}</span>
            <span className="text-on-surface font-code w-20 text-right">{baht(Number(i.totalPrice))}</span>
          </div>
        ))}
      </div>
      <div className="space-y-xs">
        <Row label="Subtotal" value={baht(Number(invoice.subtotal))} />
        {Number(invoice.discount) > 0 && <Row label="Discount" value={`-${baht(Number(invoice.discount))}`} />}
        <Row label={`Tax (${Number(invoice.taxRate)}%)`} value={baht(Number(invoice.taxAmount))} />
        <div className="flex items-center justify-between border-t border-outline-variant pt-xs mt-xs">
          <span className="text-body-md font-semibold text-on-surface">Total</span>
          <span className="text-body-md font-bold text-primary font-code">{baht(Number(invoice.totalAmount))}</span>
        </div>
        <p className="text-label-md text-on-surface-variant">Paid by {method.replace('_', ' ')}</p>
      </div>
    </div>
  )
}

function ReceiptActions({ invoice, petLabel, method, onClose }: { invoice: Invoice; petLabel?: string; method: string; onClose: () => void }) {
  const t = useT()
  return (
    <div className="flex gap-sm">
      <button onClick={() => printReceipt(invoice, petLabel, method)} className="flex-1 min-h-[44px] rounded-lg border border-outline-variant text-on-surface-variant font-medium hover:bg-surface-container-low transition-colors flex items-center justify-center gap-xs text-body-sm">
        <MaterialIcon name="print" size={16} /> {t('clinic.billing.print')}
      </button>
      <button onClick={() => downloadInvoicePdf(invoice)} className="flex-1 min-h-[44px] rounded-lg border border-secondary text-secondary font-medium hover:bg-surface-container-low transition-colors flex items-center justify-center gap-xs text-body-sm">
        <MaterialIcon name="download" size={16} /> PDF
      </button>
      <button onClick={onClose} className="flex-1 min-h-[44px] rounded-lg bg-primary text-primary-on font-semibold hover:bg-primary/90 transition-colors text-body-sm">{t('common.done')}</button>
    </div>
  )
}

// Bare receipt view — invoice number, itemized lines, totals, method,
// Print/PDF/Done. No success banner, no "earned" messaging: used when a
// Payment History row is clicked (T-3b.3), never after a live sale (grill F2).
export function ReceiptModal({ invoice, petLabel, method, onClose }: { invoice: Invoice; petLabel?: string; method: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-md" onClick={onClose}>
      <div className="bg-surface rounded-xl shadow-lvl3 w-full max-w-sm p-xl" data-testid="receipt-modal" onClick={(e) => e.stopPropagation()}>
        <div className="text-center mb-md">
          <p className="text-body-sm text-on-surface-variant">{invoice.invoiceNo}</p>
          {petLabel && <p className="text-body-sm text-on-surface font-medium mt-xs">{petLabel}</p>}
        </div>
        <ReceiptBody invoice={invoice} method={method} />
        <ReceiptActions invoice={invoice} petLabel={petLabel} method={method} onClose={onClose} />
      </div>
    </div>
  )
}

// Post-sale confirmation — adds the success banner + optional loyalty-earned
// message above the same ReceiptBody/ReceiptActions ReceiptModal uses.
export function SuccessModal({ invoice, pet, method, earnedMsg, onClose }: { invoice: Invoice; pet: { petName: string; ownerName: string } | null; method: string; earnedMsg?: string; onClose: () => void }) {
  const petLabel = pet ? `${pet.petName} · Owner: ${pet.ownerName}` : undefined
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-md">
      <div className="bg-surface rounded-xl shadow-lvl3 w-full max-w-sm p-xl" data-testid="success-modal">
        <div className="text-center mb-md">
          <div className="w-16 h-16 rounded-full bg-secondary-container flex items-center justify-center mx-auto mb-md">
            <MaterialIcon name="check_circle" fill={1} size={40} className="text-secondary" />
          </div>
          <h3 className="text-headline-md font-headline font-bold text-on-surface mb-xs">Payment Successful!</h3>
          <p className="text-body-sm text-on-surface-variant">{invoice.invoiceNo}</p>
          {earnedMsg && (
            <p className="inline-flex items-center gap-xs text-body-sm text-secondary font-medium mt-xs">
              <MaterialIcon name="loyalty" size={16} /> {earnedMsg}
            </p>
          )}
        </div>
        <ReceiptBody invoice={invoice} method={method} />
        <ReceiptActions invoice={invoice} petLabel={petLabel} method={method} onClose={onClose} />
      </div>
    </div>
  )
}
```

Note: `SuccessModal` and `ReceiptModal` are now exported (`export function`) so Task 6's test file can unit-test them directly — mirrors the existing `export function AdmitModal` pattern in `ClinicInpatient.tsx:28` (imported in its test as `import ClinicInpatient, { AdmitModal } from '../views/clinic/ClinicInpatient'`).

**Step 2 — typecheck + visual smoke.**

Run: `npm run build` (frontend workspace) or `npx tsc --noEmit` — confirms no type errors (in particular that `Invoice.items[].id` exists on `InvoiceItem`, already true per `useInvoices.ts:4-11`).

There is no existing frontend test that renders `SuccessModal` today (verified: no test file references `ClinicBilling` or `SuccessModal`), so there is no regression suite to run yet — Task 6 adds the first one, which doubles as this task's regression guard.

**Step 3 — commit.**

`refactor(billing): extract ReceiptBody/ReceiptActions shared by SuccessModal and new ReceiptModal (T-3b.2, ADR-0013 D2)`

- [ ] Task 4 complete

---

## Task 5 — T-3b.3: Payment History row click opens `ReceiptModal`

Files:
- Modify: `src/frontend/src/views/clinic/ClinicBilling.tsx` — `PaymentHistoryTab` (lines 418-534: interfaces + component)
- Modify: `src/frontend/src/i18n/index.ts` (new keys)

**Step 1 — data shapes: widen `PayHistoryRow`/`PayHistoryResult` (lines 418-424).**

```tsx
interface PayHistoryRow {
  id: number; paidAt: string; amount: string; method: string; note: string | null
  invoice: { id: number; invoiceNo: string }
  receivedBy: { id: number; name: string }
  branch: { id: number; name: string }
}
interface PayHistoryResult {
  rows: PayHistoryRow[]; total: number; page: number; limit: number
  receivedByOptions: Array<{ id: number; name: string }>
}
```

**Step 2 — add selection state + detail query inside `PaymentHistoryTab` (after the existing `const [page, setPage] = useState(1)` at line 435).**

```tsx
  const [selectedRow, setSelectedRow] = useState<PayHistoryRow | null>(null)

  const { data: selectedInvoice, isLoading: invoiceLoading, isError: invoiceError } = useQuery<Invoice>({
    queryKey: ['invoice', selectedRow?.invoice.id],
    enabled: selectedRow != null,
    queryFn: () => api.get(`/api/invoices/${selectedRow!.invoice.id}`).then((r) => r.data.data),
  })
```

(`Invoice` is already imported at the top of the file via `import { useCreateInvoice, useRecordPayment, type Invoice } from '../../hooks/useInvoices'`.)

**Step 3 — make rows clickable/keyboard-accessible (replace the row-rendering block at lines 502-512).**

```tsx
              {rows.map((row) => (
                <tr
                  key={row.id}
                  tabIndex={0}
                  role="button"
                  aria-label={`Open receipt ${row.invoice.invoiceNo}`}
                  onClick={() => setSelectedRow(row)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedRow(row) } }}
                  className="cursor-pointer hover:bg-surface-container-low/50 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <td className="px-md py-sm text-on-surface font-code">{new Date(row.paidAt).toLocaleDateString()}</td>
                  <td className="px-md py-sm text-on-surface font-medium">{row.invoice.invoiceNo}</td>
                  <td className="px-md py-sm text-on-surface text-right font-code">{baht(Number(row.amount))}</td>
                  <td className="px-md py-sm text-on-surface-variant">{METHOD_LABELS[row.method] ?? row.method}</td>
                  <td className="px-md py-sm text-on-surface-variant">{row.receivedBy.name}</td>
                  {isAdmin && <td className="px-md py-sm text-on-surface-variant">{row.branch.name}</td>}
                  <td className="px-md py-sm text-on-surface-variant">{row.note ?? '—'}</td>
                </tr>
              ))}
```

**Step 4 — render the modal / loading / error states at the end of `PaymentHistoryTab`'s returned JSX (immediately before its closing `</div>`, after the pagination block that ends around line 530).**

```tsx
      {selectedRow && invoiceLoading && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <MaterialIcon name="progress_activity" size={32} className="text-on-surface-variant animate-spin" />
        </div>
      )}
      {selectedRow && invoiceError && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-md" onClick={() => setSelectedRow(null)}>
          <div className="bg-surface rounded-xl shadow-lvl3 p-lg text-center" onClick={(e) => e.stopPropagation()}>
            <p className="text-body-md text-error mb-md">{t('clinic.billing.receiptLoadError')}</p>
            <button onClick={() => setSelectedRow(null)} className="min-h-[44px] px-lg rounded-lg bg-primary text-primary-on font-semibold">{t('common.done')}</button>
          </div>
        </div>
      )}
      {selectedRow && !invoiceLoading && !invoiceError && selectedInvoice && (
        <ReceiptModal
          invoice={selectedInvoice}
          petLabel={selectedInvoice.pet ? `${selectedInvoice.pet.name}${selectedInvoice.pet.owner ? ' · Owner: ' + selectedInvoice.pet.owner.firstName + ' ' + selectedInvoice.pet.owner.lastName : ''}` : undefined}
          method={selectedRow.method}
          onClose={() => setSelectedRow(null)}
        />
      )}
```

**Step 5 — export `PaymentHistoryTab` for direct testing.**

Change `function PaymentHistoryTab() {` (line 428) to `export function PaymentHistoryTab() {`.

**Step 6 — i18n key.**

In `src/frontend/src/i18n/index.ts`, add to the `en` block right after `'clinic.billing.filterBranch': 'Filter by branch',` (line 274):

```ts
  'clinic.billing.receiptLoadError': 'Could not load this receipt.',
```

And to the `th` block right after `'clinic.billing.filterBranch': 'กรองตามสาขา',` (line 588):

```ts
  'clinic.billing.receiptLoadError': 'ไม่สามารถโหลดใบเสร็จนี้ได้',
```

**Step 7 — verify (with Task 6's test, written next).** This task and Task 8 (T-3c.3) both edit `PaymentHistoryTab`; Task 6 writes the test file exercising both, so run it after Task 8 lands. For now, typecheck only:

Run: `npx tsc --noEmit` (frontend workspace) — expect no errors.

**Step 8 — commit.**

`feat(billing): clicking a Payment History row opens a read-only receipt modal (T-3b.3, AC-3b)`

- [ ] Task 5 complete

---

## Task 6 — Frontend regression + T-3b.3 test coverage: `ClinicBilling.test.tsx`

Files:
- Create: `src/frontend/src/__tests__/ClinicBilling.test.tsx`

**Step 1 — write the test file (covers Task 4's refactor regression guard + Task 5's row-click behavior + grill F2; the Method/Received-by assertions are added in Task 8 once those controls exist).**

```tsx
// src/frontend/src/__tests__/ClinicBilling.test.tsx
// Item 3 — Billing Pipeline. Covers: SuccessModal still renders its banner +
// itemized receipt after the ReceiptBody/ReceiptActions extraction (T-3b.2
// regression guard — no prior test existed for SuccessModal), a bare
// ReceiptModal never renders success-only chrome (T-3b.2, grill F2), and
// Payment History row click → GET /api/invoices/:id → ReceiptModal (T-3b.3).
// Method/Received-by filter assertions are appended in Task 8 (T-3c.3).
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'

const getMock = vi.fn()
vi.mock('../utils/api', () => ({
  default: { get: (...args: unknown[]) => getMock(...(args as [string, unknown])) },
}))

import { SuccessModal, ReceiptModal, PaymentHistoryTab } from '../views/clinic/ClinicBilling'
import type { Invoice } from '../hooks/useInvoices'

function withClient(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

const invoice: Invoice = {
  id: 900, invoiceNo: 'INV-2026-07-0009', petId: 1, medicalRecordId: null,
  issuedAt: '2026-07-11T09:00:00.000Z', subtotal: '500.00', discount: '0.00',
  discountReason: null, taxRate: '7', taxAmount: '35.00', totalAmount: '535.00',
  paymentStatus: 'paid', paymentMethod: 'cash', paidAt: '2026-07-11T09:05:00.000Z',
  notes: null,
  items: [{ id: 1, description: 'Consultation', itemType: 'service', quantity: '1', unitPrice: '500.00', totalPrice: '500.00' }],
  pet: { id: 1, name: 'Rex', owner: { firstName: 'Jane', lastName: 'Doe', phone: '0800000000' } },
}

describe('SuccessModal — regression guard after ReceiptBody/ReceiptActions extraction (T-3b.2)', () => {
  it('still shows the success banner, invoice items, and totals', () => {
    withClient(
      <SuccessModal invoice={invoice} pet={{ petName: 'Rex', ownerName: 'Jane Doe' }} method="cash" earnedMsg="+5 loyalty points earned" onClose={vi.fn()} />
    )
    expect(screen.getByTestId('success-modal')).toBeInTheDocument()
    expect(screen.getByText('Payment Successful!')).toBeInTheDocument()
    expect(screen.getByText('+5 loyalty points earned')).toBeInTheDocument()
    expect(screen.getByText('Consultation')).toBeInTheDocument()
    expect(screen.getByText('฿535.00')).toBeInTheDocument()
  })
})

describe('ReceiptModal — history-row receipt view (T-3b.2, grill F2)', () => {
  it('shows receipt content only — no success banner or success-modal testid', () => {
    withClient(<ReceiptModal invoice={invoice} petLabel="Rex · Owner: Jane Doe" method="cash" onClose={vi.fn()} />)
    expect(screen.getByTestId('receipt-modal')).toBeInTheDocument()
    expect(screen.queryByTestId('success-modal')).not.toBeInTheDocument()
    expect(screen.queryByText('Payment Successful!')).not.toBeInTheDocument()
    expect(screen.getByText('Consultation')).toBeInTheDocument()
    expect(screen.getByText('฿535.00')).toBeInTheDocument()
  })
})

describe('PaymentHistoryTab — row click opens ReceiptModal (T-3b.3)', () => {
  const row = {
    id: 1, paidAt: '2026-07-11T09:05:00.000Z', amount: '535.00', method: 'cash', note: null,
    invoice: { id: 900, invoiceNo: 'INV-2026-07-0009' },
    receivedBy: { id: 5, name: 'Nok' },
    branch: { id: 1, name: 'Main' },
  }

  function stubGet(receivedByOptions: Array<{ id: number; name: string }> = []) {
    getMock.mockImplementation((url: string) => {
      if (url === '/api/invoices/payment-history') {
        return Promise.resolve({ data: { data: { rows: [row], total: 1, page: 1, limit: 20, receivedByOptions } } })
      }
      if (url === `/api/invoices/${invoice.id}`) return Promise.resolve({ data: { data: invoice } })
      return Promise.resolve({ data: { data: null } })
    })
  }

  it('clicking a row fetches GET /api/invoices/:id and renders the receipt modal', async () => {
    stubGet([{ id: 5, name: 'Nok' }])
    withClient(<PaymentHistoryTab />)
    const cell = await screen.findByText('INV-2026-07-0009')
    await userEvent.click(cell.closest('tr')!)
    await waitFor(() => expect(getMock).toHaveBeenCalledWith(`/api/invoices/${invoice.id}`))
    expect(await screen.findByTestId('receipt-modal')).toBeInTheDocument()
    expect(screen.getByText('Consultation')).toBeInTheDocument()
    expect(screen.queryByTestId('success-modal')).not.toBeInTheDocument()
  })

  it('404 on the fetched invoice shows an error state, no crash', async () => {
    getMock.mockImplementation((url: string) => {
      if (url === '/api/invoices/payment-history') return Promise.resolve({ data: { data: { rows: [row], total: 1, page: 1, limit: 20, receivedByOptions: [] } } })
      if (url === `/api/invoices/${invoice.id}`) return Promise.reject({ response: { status: 404 } })
      return Promise.resolve({ data: { data: null } })
    })
    withClient(<PaymentHistoryTab />)
    const cell = await screen.findByText('INV-2026-07-0009')
    await userEvent.click(cell.closest('tr')!)
    expect(await screen.findByText('Could not load this receipt.')).toBeInTheDocument()
    expect(screen.queryByTestId('receipt-modal')).not.toBeInTheDocument()
  })
})
```

Run: `npm test -- ClinicBilling` (frontend workspace)
Expected: **FAIL** — `ReceiptModal`/`SuccessModal`/`PaymentHistoryTab` are not yet exported/behaving this way until Tasks 4-5 land (if run in isolation before those tasks). Once Tasks 4-5 are applied, re-run.

**Step 2 — verify (after Tasks 4-5 are in place).**

Run: `npm test -- ClinicBilling` (frontend workspace)
Expected: 4/4 PASS.

**Step 3 — commit.**

`test(billing): ReceiptModal/SuccessModal regression + row-click coverage (T-3b.2, T-3b.3, grill F2)`

- [ ] Task 6 complete

---

## Task 7 — T-3c.1: Backend `method` + `receivedById` filter params

Files:
- Modify: `src/backend/models/invoice.repository.ts` (`PaymentHistoryParams` interface + `paymentHistoryWhere`)
- Modify: `src/backend/services/invoice.service.ts` (`listPaymentHistory` pass-through)
- Modify: `src/backend/controllers/invoice.controller.ts` (`listPaymentHistory` query parsing)
- Test: `src/backend/__tests__/invoice.test.ts` (extend the `bill-3.3` describe block from Task 3)

**Step 1 — extend the failing tests inside the `bill-3.3` describe block (added in Task 3), right after `bill-10`.**

```ts
  test('bill-11: method=cash returns only cash rows (T-3c.1)', async () => {
    const res = await request(server).get('/api/invoices/payment-history').query({ method: 'cash' }).set(auth(tokenAdminPH)).expect(200)
    expect(res.body.data.rows.length).toBeGreaterThan(0)
    for (const r of res.body.data.rows) expect(r.method).toBe('cash')
  })

  test('bill-12: receivedById=<staff> returns only that staff\'s rows (T-3c.1)', async () => {
    const res = await request(server).get('/api/invoices/payment-history').query({ receivedById: staffUserId }).set(auth(tokenAdminPH)).expect(200)
    expect(res.body.data.rows.length).toBeGreaterThan(0)
    for (const r of res.body.data.rows) expect(r.receivedBy.id).toBe(staffUserId)
  })

  test('bill-13: method + receivedById AND together (T-3c.1)', async () => {
    const match = await request(server).get('/api/invoices/payment-history')
      .query({ method: 'cash', receivedById: adminUserId }).set(auth(tokenAdminPH)).expect(200)
    expect(match.body.data.rows.some((r: { invoice: { id: number } }) => r.invoice.id === invoicePaidByAdmin)).toBe(true)

    const mismatch = await request(server).get('/api/invoices/payment-history')
      .query({ method: 'cash', receivedById: staffUserId }).set(auth(tokenAdminPH)).expect(200)
    expect(mismatch.body.data.rows.length).toBe(0) // staff paid via qr_promptpay, not cash
  })

  test('bill-14: cross-tenant receivedById probe returns 0 rows, never leaks data (T-3c.1 test 4)', async () => {
    const res = await request(server).get('/api/invoices/payment-history').query({ receivedById: otherAdminUserId }).set(auth(tokenAdminPH)).expect(200)
    expect(res.body.data.rows.length).toBe(0)
  })

  test('bill-15: branch-scoped user filtering by another branch\'s receivedById gets 0 rows (T-3c.1 test 5)', async () => {
    const res = await request(server).get('/api/invoices/payment-history').query({ receivedById: staffBUserId }).set(auth(tokenAdminPH)).expect(200)
    expect(res.body.data.rows.length).toBe(0) // tokenAdminPH is scoped to branchA; staffB is branchB
  })
```

Run: `npm test -- __tests__/invoice.test` (backend workspace)
Expected: **FAIL** on `bill-11`/`bill-12`/`bill-13` — `method`/`receivedById` query params are silently ignored today (`paymentHistoryWhere` has no such predicates), so every query returns the same unfiltered set. `bill-14`/`bill-15` will incidentally pass already (they assert 0 rows, and since the params are ignored today the branch/tenant scoping alone already returns non-matching results for those particular ids) — that's fine; they're the safety net that must keep passing after the real filters land.

**Step 2 — minimal implementation.**

`src/backend/models/invoice.repository.ts` — widen the params interface and predicate builder:

```ts
interface PaymentHistoryParams {
  startDate?: string; endDate?: string; filterBranchId?: number
  method?: string; receivedById?: number
  skip: number; take: number
}

function paymentHistoryWhere(tenantId: number, userBranchId: number | null | undefined, p: PaymentHistoryParams) {
  const where: Record<string, unknown> = { tenantId }
  // Staff/Doctor see own branch only; Admin may optionally filter by branchId query param
  if (userBranchId != null)        where['branchId'] = userBranchId
  else if (p.filterBranchId != null) where['branchId'] = p.filterBranchId
  if (p.startDate || p.endDate) {
    const paidAt: Record<string, Date> = {}
    if (p.startDate) paidAt['gte'] = new Date(p.startDate)
    if (p.endDate)   paidAt['lte'] = new Date(p.endDate)
    where['paidAt'] = paidAt
  }
  if (p.method)               where['method'] = p.method
  if (p.receivedById != null) where['receivedById'] = p.receivedById
  return where
}
```

(`findPaymentHistory` itself is untouched in this step — it already spreads `params` into `paymentHistoryWhere`, so passing `method`/`receivedById` through `PaymentHistoryParams` is enough.)

`src/backend/services/invoice.service.ts` — widen `listPaymentHistory`:

```ts
export async function listPaymentHistory(
  tenantId: number, userBranchId: number | null | undefined,
  page = 1, limit = 20, startDate?: string, endDate?: string, filterBranchId?: number,
  method?: string, receivedById?: number,
) {
  const skip = (page - 1) * limit
  const [rows, total] = await invoiceRepo.findPaymentHistory(tenantId, userBranchId, { startDate, endDate, filterBranchId, method, receivedById, skip, take: limit })
  return { rows, total, page, limit }
}
```

`src/backend/controllers/invoice.controller.ts` — parse the two new query params, ignoring invalid values instead of 500ing:

```ts
export async function listPaymentHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page           = req.query.page      ? Number(req.query.page)     : 1
    const limit          = req.query.limit     ? Number(req.query.limit)    : 20
    const startDate       = typeof req.query.startDate === 'string' ? req.query.startDate : undefined
    const endDate         = typeof req.query.endDate   === 'string' ? req.query.endDate   : undefined
    const filterBranchId  = req.query.branchId  ? Number(req.query.branchId) : undefined
    const method          = typeof req.query.method === 'string' && req.query.method.trim() ? req.query.method : undefined
    const receivedByIdRaw = req.query.receivedById ? Number(req.query.receivedById) : undefined
    const receivedById    = receivedByIdRaw != null && Number.isFinite(receivedByIdRaw) ? receivedByIdRaw : undefined
    const data = await invoiceService.listPaymentHistory(req.context!.tenantId, req.context?.branchId, page, limit, startDate, endDate, filterBranchId, method, receivedById)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}
```

**Step 3 — verify.**

Run: `npm test -- __tests__/invoice.test` (backend workspace)
Expected: `bill-11` through `bill-15` PASS (15 tests total in the file).

**Step 4 — commit.**

`feat(billing): add method + receivedById filters to payment-history (T-3c.1)`

- [ ] Task 7 complete

---

## Task 8 — T-3c.2 + T-3c.3: `receivedByOptions` in the response + two frontend filter controls

**Design (D3 in ADR-0013):** neither `GET /api/users` (needs `staff.view`, which cashiers may lack) nor `GET /api/appointments/doctors` (doctors-only, wrong population) fits. Options are derived from `PaymentHistory` itself, scoped by the same tenant/branch/date where-clause **minus** the `method`/`receivedById` predicates — so narrowing those two never hides a valid receiver, but narrowing the date/branch scope may shrink the list (intended faceted-filter behavior — grill finding F3, documented not fixed).

Files:
- Modify: `src/backend/models/invoice.repository.ts` (`findPaymentHistory`)
- Modify: `src/backend/services/invoice.service.ts` (`listPaymentHistory` return shape)
- Test: `src/backend/__tests__/invoice.test.ts` (extend `bill-3.3`, after `bill-15`)
- Modify: `src/frontend/src/views/clinic/ClinicBilling.tsx` (`PaymentHistoryTab` — two `<select>`s)
- Modify: `src/frontend/src/i18n/index.ts` (new keys)
- Test: `src/frontend/src/__tests__/ClinicBilling.test.tsx` (extend, added in Task 6)

**Step 1 — write the failing backend test.**

Append to the `bill-3.3` describe block, after `bill-15`:

```ts
  test('bill-16: receivedByOptions lists exactly the distinct receivers in caller scope, never cross-tenant/cross-branch (T-3c.2)', async () => {
    const res = await request(server).get('/api/invoices/payment-history').set(auth(tokenAdminPH)).expect(200)
    const ids = (res.body.data.receivedByOptions as Array<{ id: number; name: string }>).map((o) => o.id)
    expect(ids).toContain(adminUserId)
    expect(ids).toContain(staffUserId)
    expect(ids).not.toContain(staffBUserId)     // different branch — tokenAdminPH is branch-scoped to branchA
    expect(ids).not.toContain(otherAdminUserId) // different tenant
  })
```

Run: `npm test -- __tests__/invoice.test` (backend workspace)
Expected: **FAIL** — the response has no `receivedByOptions` key today, so `.map` on `undefined` throws.

**Step 2 — minimal implementation.**

`src/backend/models/invoice.repository.ts` — extend `findPaymentHistory` with a third, sibling query in the existing `Promise.all` (facet scope = same where-builder minus `method`/`receivedById`):

```ts
export function findPaymentHistory(tenantId: number, userBranchId: number | null | undefined, params: PaymentHistoryParams) {
  const where = paymentHistoryWhere(tenantId, userBranchId, params)
  // Receiver picker options use the same tenant/branch/date scope but WITHOUT
  // the method/receivedById predicates, so narrowing those two never hides a
  // valid receiver from the picker (T-3c.2). Narrowing the date/branch scope
  // MAY shrink the list — that's intended faceted-filter behavior, not a bug
  // (ADR-0013 D3, grill finding F3).
  const { method: _method, receivedById: _receivedById, ...facetParams } = params
  const optionsWhere = paymentHistoryWhere(tenantId, userBranchId, facetParams as PaymentHistoryParams)

  return Promise.all([
    prisma.paymentHistory.findMany({
      where: where as never,
      include: {
        invoice:    { select: { id: true, invoiceNo: true } },
        receivedBy: { select: { id: true, name: true } },
        branch:     { select: { id: true, name: true } },
      },
      orderBy: { paidAt: 'desc' },
      skip: params.skip,
      take: params.take,
    }),
    prisma.paymentHistory.count({ where: where as never }),
    prisma.paymentHistory.findMany({
      where: optionsWhere as never,
      distinct: ['receivedById'],
      select: { receivedBy: { select: { id: true, name: true } } },
    }),
  ])
}
```

`src/backend/services/invoice.service.ts` — surface `receivedByOptions`:

```ts
export async function listPaymentHistory(
  tenantId: number, userBranchId: number | null | undefined,
  page = 1, limit = 20, startDate?: string, endDate?: string, filterBranchId?: number,
  method?: string, receivedById?: number,
) {
  const skip = (page - 1) * limit
  const [rows, total, receiverRows] = await invoiceRepo.findPaymentHistory(tenantId, userBranchId, { startDate, endDate, filterBranchId, method, receivedById, skip, take: limit })
  return { rows, total, page, limit, receivedByOptions: receiverRows.map((r) => r.receivedBy) }
}
```

**Step 3 — verify backend.**

Run: `npm test -- __tests__/invoice.test` (backend workspace)
Expected: `bill-16` PASS (16 tests total in the file).

**Step 4 — frontend: two filter controls in `PaymentHistoryTab`.**

Add state (with the other `useState` calls, near line 435, alongside `selectedRow` from Task 5):

```tsx
  const [method, setMethod] = useState('')
  const [receivedById, setReceivedById] = useState('')
```

Widen the query (replace the `useQuery<PayHistoryResult>` block, lines 437-448):

```tsx
  const { data, isLoading } = useQuery<PayHistoryResult>({
    queryKey: ['billing', 'payment-history', startDate, endDate, filterBranchId, method, receivedById, page],
    queryFn: () =>
      api.get('/api/invoices/payment-history', {
        params: {
          ...(startDate ? { startDate } : {}),
          ...(endDate ? { endDate } : {}),
          ...(filterBranchId ? { branchId: filterBranchId } : {}),
          ...(method ? { method } : {}),
          ...(receivedById ? { receivedById } : {}),
          page,
        },
      }).then((r) => r.data.data),
  })
```

Add the two selects to the filter bar (after the existing branch-filter block, before the Clear button — around line 472):

```tsx
        <div className="flex flex-col gap-xs">
          <label htmlFor="ph-method" className="text-label-md text-on-surface-variant uppercase tracking-wider">{t('clinic.billing.method')}</label>
          <select id="ph-method" value={method} onChange={(e) => { setMethod(e.target.value); setPage(1) }} className={`${dateCls} w-36`}>
            <option value="">{t('clinic.billing.allMethods')}</option>
            {Object.entries(METHOD_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-xs">
          <label htmlFor="ph-received-by" className="text-label-md text-on-surface-variant uppercase tracking-wider">{t('clinic.billing.receivedBy')}</label>
          <select id="ph-received-by" value={receivedById} onChange={(e) => { setReceivedById(e.target.value); setPage(1) }} className={`${dateCls} w-36`}>
            <option value="">{t('clinic.billing.allReceivers')}</option>
            {(data?.receivedByOptions ?? []).map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>
```

Update the Clear button's condition and handler (line 473-478) to also cover the two new filters:

```tsx
        {(startDate || endDate || filterBranchId || method || receivedById) && (
          <button onClick={() => { setStartDate(''); setEndDate(''); setFilterBranchId(''); setMethod(''); setReceivedById(''); setPage(1) }}
                  className="min-h-[44px] px-md rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container-low text-body-sm flex items-center gap-xs">
            <MaterialIcon name="close" size={16} /> Clear
          </button>
        )}
```

**Step 5 — i18n keys.**

`en` block, after `'clinic.billing.receiptLoadError': 'Could not load this receipt.',` (added in Task 5):

```ts
  'clinic.billing.allMethods': 'All methods',
  'clinic.billing.allReceivers': 'All staff',
```

`th` block, after `'clinic.billing.receiptLoadError': 'ไม่สามารถโหลดใบเสร็จนี้ได้',`:

```ts
  'clinic.billing.allMethods': 'ทุกวิธี',
  'clinic.billing.allReceivers': 'พนักงานทั้งหมด',
```

**Step 6 — extend `ClinicBilling.test.tsx` (from Task 6) with filter assertions.**

Append inside the `PaymentHistoryTab` describe block, after the `404` test:

```tsx
  it('Method and Received-by filters add query params; Clear resets both (T-3c.3)', async () => {
    stubGet([{ id: 5, name: 'Nok' }])
    withClient(<PaymentHistoryTab />)
    await screen.findByText('INV-2026-07-0009')

    await userEvent.selectOptions(screen.getByLabelText('Method'), 'cash')
    await waitFor(() => expect(getMock).toHaveBeenCalledWith('/api/invoices/payment-history', expect.objectContaining({ params: expect.objectContaining({ method: 'cash' }) })))

    await userEvent.selectOptions(screen.getByLabelText('Received By'), '5')
    await waitFor(() => expect(getMock).toHaveBeenCalledWith('/api/invoices/payment-history', expect.objectContaining({ params: expect.objectContaining({ receivedById: '5' }) })))

    await userEvent.click(screen.getByText('Clear'))
    await waitFor(() => {
      const lastCall = getMock.mock.calls.filter((c) => c[0] === '/api/invoices/payment-history').pop()
      expect(lastCall![1].params.method).toBeUndefined()
      expect(lastCall![1].params.receivedById).toBeUndefined()
    })
  })
```

**Step 7 — verify.**

Run: `npm test -- __tests__/invoice.test` (backend workspace) → 16/16 PASS.
Run: `npm test -- ClinicBilling` (frontend workspace) → 5/5 PASS.

**Step 8 — commit.**

`feat(billing): receivedByOptions + Method/Received-by filter UI (T-3c.2, T-3c.3, ADR-0013 D3)`

- [ ] Task 8 complete

---

## Task 9 — T-3d.1: `performedBy` → `User` relation migration

> **⚠️ @db-agent review required before this task is considered mergeable — CLAUDE.md mandates review of every DB-touching change.** Flag the migration file below (orphan-cleanup ordering, `ON DELETE SET NULL` choice, FK naming) to `@db-agent` per the Agent Router before proceeding to Task 10. Do not implement Tasks 10-11 until that review returns clean.

**Design (D4 in ADR-0013):** only `DailyInpatientCare.performedBy` gets a relation (any staff member can log care). `Hospitalization.doctorInCharge` is explicitly excluded — already correctly resolved client-side via the doctors-picker map. The column had no FK previously, so dangling ids are possible; cleanup MUST run before the constraint is added, and `ON DELETE SET NULL` (not `RESTRICT`/`CASCADE`) so care logs survive staff deletion — verified safe because the write path (`hospitalization.controller.ts:35` → `svc.logCare(tenantId, ..., req.context!.userId)`) always sets `performedBy` from the authenticated same-tenant JWT `userId`, never client-supplied, so the FK's lack of an independent tenant check cannot be exploited cross-tenant.

Files:
- Modify: `src/backend/prisma/schema.prisma` (`DailyInpatientCare` model, line 630-649; `User` model, line 156-176)
- Create: `src/backend/prisma/migrations/20260711140000_add_care_performed_by_fk/migration.sql`

**Step 1 — edit the schema.**

`src/backend/prisma/schema.prisma` — add the relation field to `DailyInpatientCare` (after `performedBy Int?` at line 642):

```prisma
model DailyInpatientCare {
  id                Int      @id @default(autoincrement())
  tenantId          Int
  hospitalizationId Int
  recordedAt        DateTime @default(now())
  timeSlot          String   @db.VarChar(20) // 08:00|12:00|16:00|20:00
  temperatureC      Decimal? @db.Decimal(4, 1)
  heartRateBpm      Int?
  respRateRpm       Int?
  feedingStatus     String?  @db.VarChar(255)
  medicationGiven   String?
  notes             String?
  performedBy       Int?

  tenant           Tenant           @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  hospitalization  Hospitalization  @relation(fields: [hospitalizationId], references: [id], onDelete: Cascade)
  // ADR-0013 D4: any staff member (not only doctors) may log care. ON DELETE
  // SET NULL — the care log entry must survive staff deletion, only the
  // performer name degrades (repository resolves null → "—" client-side).
  performedByUser  User?            @relation("CarePerformedBy", fields: [performedBy], references: [id], onDelete: SetNull)

  @@index([tenantId, hospitalizationId, recordedAt])
  @@map("daily_inpatient_care")
}
```

Add the back-relation to `User` (after `paymentHistoryReceived PaymentHistory[] @relation("ReceivedPayments")` at line 168):

```prisma
  paymentHistoryReceived PaymentHistory[]  @relation("ReceivedPayments")
  // ADR-0013 D4: care logs this user recorded (DailyInpatientCare.performedBy)
  careLogsPerformed      DailyInpatientCare[] @relation("CarePerformedBy")
  userBranches           UserBranch[]
```

**Step 2 — write the migration by hand (orphan cleanup, then FK).**

Create `src/backend/prisma/migrations/20260711140000_add_care_performed_by_fk/migration.sql`:

```sql
-- ADR-0013 D4: DailyInpatientCare.performedBy had no FK previously — dangling
-- ids are possible (manual data edits, prior cleanup scripts). This MUST run
-- before the ADD CONSTRAINT below, else it fails on the first orphaned row.
UPDATE "daily_inpatient_care"
SET "performedBy" = NULL
WHERE "performedBy" IS NOT NULL
  AND "performedBy" NOT IN (SELECT "id" FROM "users");

-- AddForeignKey
-- ON DELETE SET NULL: care logs must survive staff deletion — the log entry
-- stays, only the resolved name degrades to "Staff #<id>" then eventually "—"
-- once this FK itself nulls performedBy on user delete.
ALTER TABLE "daily_inpatient_care"
  ADD CONSTRAINT "daily_inpatient_care_performedBy_fkey"
  FOREIGN KEY ("performedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

**Step 3 — apply + verify.**

```bash
cd src/backend
npx prisma validate
npx prisma migrate dev --skip-generate
npx prisma generate
npm test -- hospitalization-crud
```

Expected: `prisma validate` passes; migration applies with no error (proves either there were zero orphans, or the cleanup step nulled them cleanly); the existing `hospitalization-crud.test.ts` suite (13 tests) stays green — it never asserts on `performedBy`, so the new relation is inert until Task 10 wires it into a query.

**Step 4 — commit.**

`feat(db): add DailyInpatientCare.performedBy → User FK, ON DELETE SET NULL (T-3d.1, ADR-0013 D4)`

- [ ] Task 9 complete — **@db-agent review gate passed** (record reviewer + date here before Task 10)

---

## Task 10 — T-3d.2: Include `performedByUser` in hospitalization detail response

Files:
- Modify: `src/backend/models/hospitalization.repository.ts` (`findById`, lines 25-30)
- Test: `src/backend/tests/integration/hospitalization-crud.test.ts` (new `describe` block appended after line 152)

**Step 1 — write the failing test.**

Append to `src/backend/tests/integration/hospitalization-crud.test.ts`:

```ts
describe('Item 3d — care performer name resolution (T-3d.2, ADR-0013 D4)', () => {
  let hospId: number
  let adminAUserId: number
  let adminAName: string

  beforeAll(async () => {
    const me = await request(server).get('/auth/me').set('Authorization', `Bearer ${adminA}`)
    adminAUserId = me.body.data.userId
    adminAName = me.body.data.name

    const admit = await request(server).post('/api/hospitalizations').set('Authorization', `Bearer ${adminA}`)
      .send({ petId, reason: 'Performer name check', cageNo: 'E-1', dailyRate: 0 })
    hospId = admit.body.data.id
    await request(server).post(`/api/hospitalizations/${hospId}/care`).set('Authorization', `Bearer ${adminA}`)
      .send({ timeSlot: '08:00', temperatureC: 38.0 })
  })

  it('✅ care log entry carries performedByUser { id, name } resolved from the authenticated caller', async () => {
    const res = await request(server).get(`/api/hospitalizations/${hospId}`).set('Authorization', `Bearer ${adminA}`)
    expect(res.status).toBe(200)
    const log = res.body.data.careLogs[0]
    expect(log.performedBy).toBe(adminAUserId)
    expect(log.performedByUser).toEqual({ id: adminAUserId, name: adminAName })
  })

  it('❌ Tenant B never resolves a name for Tenant A\'s hospitalization → 404 (tenant isolation)', async () => {
    const res = await request(server).get(`/api/hospitalizations/${hospId}`).set('Authorization', `Bearer ${adminB}`)
    expect(res.status).toBe(404)
  })
})
```

Run: `npm test -- hospitalization-crud` (backend workspace)
Expected: **FAIL** — `findById` doesn't include `performedByUser` yet, so `log.performedByUser` is `undefined`.

**Step 2 — minimal implementation.**

`src/backend/models/hospitalization.repository.ts` — widen the `careLogs` include in `findById` (lines 25-30):

```ts
export function findById(tenantId: number, id: number) {
  return prisma.hospitalization.findFirst({
    where: { id, tenantId },
    include: {
      pet: petSelect,
      careLogs: {
        orderBy: { recordedAt: 'desc' },
        include: { performedByUser: { select: { id: true, name: true } } },
      },
    },
  })
}
```

**Step 3 — verify.**

Run: `npm test -- hospitalization-crud` (backend workspace)
Expected: 15/15 PASS (13 existing + 2 new).

**Step 4 — commit.**

`feat(inpatient): resolve care-log performer name via performedByUser relation (T-3d.2)`

- [ ] Task 10 complete

---

## Task 11 — T-3d.3: Frontend renders the resolved name; invert the pinned regression test

**Grill finding 1 (Item-1, referenced by this task's guard):** `performedBy` must render a name resolved from `performedByUser` when the server provides it — never fall back to resolving it from the doctors-picker map (which is keyed by `doctorInCharge`, a different population; mis-resolving a non-doctor staff member as a doctor was the original bug this pinned test guarded against). The guard stays valid; only its expected outcome inverts now that the server does the resolution correctly.

Files:
- Modify: `src/frontend/src/views/clinic/ClinicInpatient.tsx` (`CareLog` interface, lines 35-50; render, lines 455-457)
- Modify: `src/frontend/src/__tests__/ClinicInpatient.test.tsx` (replace the test at lines 255-265)

**Step 1 — write the failing tests (replace the pinned regression test).**

In `src/frontend/src/__tests__/ClinicInpatient.test.tsx`, replace the single test at lines 255-265:

```tsx
  it('performedBy renders as Staff #<id>, never a resolved staff name (regression, grill finding 1)', async () => {
    stubGetWithDetail([activeAdmission], { ...activeAdmission, careLogs: [{ ...careLog, performedBy: 7 }] })
    renderBoard()
    await screen.findByText('Rex')
    await userEvent.click(screen.getByLabelText('View care history'))

    expect(await screen.findByText((_, el) => el?.textContent === 'By: Staff #7')).toBeInTheDocument()
    // "Dr. Somchai" (doctorInCharge=7) must appear only in the card's doctor row,
    // never as a resolved name for performedBy inside the history modal.
    expect(screen.getAllByText('Dr. Somchai')).toHaveLength(1)
  })
```

with three tests covering the inverted behavior:

```tsx
  it('performedByUser.name renders when the server resolves it (T-3d.3, ADR-0013 D4)', async () => {
    stubGetWithDetail([activeAdmission], { ...activeAdmission, careLogs: [{ ...careLog, performedBy: 7, performedByUser: { id: 7, name: 'Nok' } }] })
    renderBoard()
    await screen.findByText('Rex')
    await userEvent.click(screen.getByLabelText('View care history'))

    expect(await screen.findByText((_, el) => el?.textContent === 'By: Nok')).toBeInTheDocument()
    // Server-resolved name must come from performedByUser, never the
    // doctors-picker map keyed by doctorInCharge — "Dr. Somchai"
    // (doctorInCharge=7) must still appear only once, in the card's doctor
    // row (grill finding 1 guard preserved, outcome inverted).
    expect(screen.getAllByText('Dr. Somchai')).toHaveLength(1)
  })

  it('falls back to Staff #<id> when performedByUser is null but performedBy id exists', async () => {
    stubGetWithDetail([activeAdmission], { ...activeAdmission, careLogs: [{ ...careLog, performedBy: 12, performedByUser: null }] })
    renderBoard()
    await screen.findByText('Rex')
    await userEvent.click(screen.getByLabelText('View care history'))
    expect(await screen.findByText((_, el) => el?.textContent === 'By: Staff #12')).toBeInTheDocument()
  })

  it('renders — when both performedByUser and performedBy are null', async () => {
    stubGetWithDetail([activeAdmission], { ...activeAdmission, careLogs: [careLogNulls] })
    renderBoard()
    await screen.findByText('Rex')
    await userEvent.click(screen.getByLabelText('View care history'))
    expect(await screen.findByText((_, el) => el?.textContent === 'By: —')).toBeInTheDocument()
  })
```

Run: `npm test -- ClinicInpatient` (frontend workspace)
Expected: **FAIL** on the first new test — `performedByUser` isn't in the `CareLog` interface or the render logic yet, so `By: Nok` never appears (falls through to `By: Staff #7`, which the new test doesn't expect).

**Step 2 — minimal implementation.**

`src/frontend/src/views/clinic/ClinicInpatient.tsx` — widen the `CareLog` interface and its comment (lines 35-50):

```tsx
// One row of `DailyInpatientCare` as returned nested under `careLogs` by
// `GET /api/hospitalizations/:id`, already sorted newest-first server-side.
// `performedBy` is a `User.id` (any staff role, not necessarily a Doctor).
// `performedByUser` is the server-resolved name (ADR-0013 D4) — render it
// when present; fall back to "Staff #<id>" then "—". Never resolve a name
// client-side from the doctors-picker map (that map is keyed by
// doctorInCharge, a different population — see grill finding 1).
interface CareLog {
  id: number
  recordedAt: string
  timeSlot: string
  temperatureC: number | null
  heartRateBpm: number | null
  respRateRpm: number | null
  feedingStatus: string | null
  medicationGiven: string | null
  notes: string | null
  performedBy: number | null
  performedByUser?: { id: number; name: string } | null
}
```

Update the render (lines 455-457):

```tsx
                  <p className="text-label-sm text-on-surface-variant">
                    By: {log.performedByUser?.name ?? (log.performedBy != null ? `Staff #${log.performedBy}` : '—')}
                  </p>
```

**Step 3 — verify.**

Run: `npm test -- ClinicInpatient` (frontend workspace)
Expected: all `ClinicInpatient — Care History modal (LCV-1)` tests PASS, including the 3 new ones; the two pre-existing tests that use `careLog`/`careLogIntTemp` (no `performedByUser` field, falling back to `Staff #12`/no assertion) are unaffected.

**Step 4 — commit.**

`feat(inpatient): render server-resolved care-performer name, invert pinned regression test (T-3d.3, AC-3d)`

- [ ] Task 11 complete

---

## Out of scope (do not implement in this branch)

- `transaction.controller.ts` / `/api/clinic/transactions` dead-code cleanup — unused parallel endpoint over the same `PaymentHistory` model with a weaker filter; backlog candidate (ADR-0013 Consequences).
- Server-side resolution of `Hospitalization.doctorInCharge` — already correctly resolved client-side via the doctors-picker map; only worth revisiting if that approach breaks (e.g., a deactivated doctor dropping off the picker list).
- Per-glyph font-fallback engineering — pdfkit has no automatic fallback and the template is single-font by design; font replacement (Task 1) is the minimal correct fix (ADR-0013 D1).
- Pixel-level glyph rendering assertions in PDF tests — Task 2's smoke tests assert non-empty buffer + `%PDF` magic bytes + no throw; Task 1's `fontkit` coverage test is the actual glyph-presence guard.

## File list (exact)

- `src/backend/assets/fonts/NotoSansThai-Regular.ttf` (binary replace)
- `src/backend/assets/fonts/FONT-LICENSE.txt` (new)
- `src/backend/__tests__/pdf-font-coverage.test.ts` (new)
- `src/backend/tests/integration/pdf.test.ts` (edit)
- `src/backend/models/invoice.repository.ts` (edit)
- `src/backend/services/invoice.service.ts` (edit)
- `src/backend/controllers/invoice.controller.ts` (edit)
- `src/backend/__tests__/invoice.test.ts` (edit)
- `src/backend/prisma/schema.prisma` (edit)
- `src/backend/prisma/migrations/20260711140000_add_care_performed_by_fk/migration.sql` (new)
- `src/backend/models/hospitalization.repository.ts` (edit)
- `src/backend/tests/integration/hospitalization-crud.test.ts` (edit)
- `src/frontend/src/views/clinic/ClinicBilling.tsx` (edit)
- `src/frontend/src/__tests__/ClinicBilling.test.tsx` (new)
- `src/frontend/src/views/clinic/ClinicInpatient.tsx` (edit)
- `src/frontend/src/__tests__/ClinicInpatient.test.tsx` (edit)
- `src/frontend/src/i18n/index.ts` (edit)

17 files (13 edit, 4 new), 11 tasks, 0 new dependencies, 0 new API endpoints, 0 new permission codes, 1 migration — sized for the Ponytail gate (Step 5). File-budget check: 1 migration ✅, 1 font license ✅, 1 new backend test ✅, 1 new frontend test (≤2 allowed) ✅.
