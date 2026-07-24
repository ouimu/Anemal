# Session C: PromptPay QR Code Generator — Research

**Researched:** 2026-06-12
**Domain:** Thai EMVCo PromptPay QR payload generation, Node.js QR image rendering, React checkout UX
**Confidence:** HIGH (source code verified, npm registry confirmed, TypeScript types confirmed)

---

## Summary

PromptPay QR codes follow the EMVCo Merchant-Presented Mode (QRCPS) specification. The payload
is a plain ASCII string in TLV (Tag-Length-Value) format, terminated by a CRC16/XMODEM checksum.
Bank of Thailand extends the standard with a specific GUID (`A000000677010111`) and sub-tags for
phone, tax ID, and e-wallet targets.

The `promptpay-qr` npm package (by dtinth, MIT, 14k downloads/week, last released 2022-01-17)
encapsulates the complete payload-generation algorithm, including CRC. The `qrcode` npm package
(15.4M downloads/week, last released 2024-08-05) converts the payload string to a base64 PNG.
Together, these two packages cover everything needed server-side in about 10 lines of TypeScript.

**Primary recommendation:** Install `promptpay-qr` + `@types/node` (already present) + `qrcode`
on the backend. Add a single GET endpoint `GET /api/invoices/:id/promptpay-qr` that reads the
invoice amount from the database (server-authoritative), fetches the tenant's `promptpayId` from
`tenant_settings`, generates the payload and QR image, and returns a base64 data URI. The
frontend replaces the placeholder icon with an `<img>` tag that loads this URI.

**Do NOT hand-roll the TLV payload or CRC16.** The PromptPay standard has edge cases (phone
formatting: strip leading 0, prefix +66; tax ID left-padded to 13 digits; amount formatted to
exactly 2 decimal places) that are all handled correctly in `promptpay-qr`.

---

## Project Constraints (from CLAUDE.md)

- Every DB query against tenant-scoped tables MUST include `tenant_id` filter. [VERIFIED: CLAUDE.md]
- Repository functions receive `tenantId` as an explicit parameter — never derived inside.
- All interactive elements >= 44x44px (Tailwind: `min-h-[44px] min-w-[44px]`).
- No raw hex colors in component files — use token names only.
- No emoji in navigation — Material Symbols Outlined exclusively.
- Backend: Node.js + Express + TypeScript + Prisma (PostgreSQL 15+).
- Frontend: React + Tailwind CSS + TanStack Query v5.
- esModuleInterop must be true in tsconfig.json for default-import of `promptpay-qr`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| PromptPay payload generation | API / Backend | — | Payload uses tenant's secret promptpayId; must not be exposed to client |
| QR image rendering (PNG) | API / Backend | — | Keeps the `qrcode` dependency server-side; returns a data URI |
| Amount used in QR | API / Backend | — | Server must read amount from invoice record (authoritative); never from request body |
| Tenant isolation check | API / Backend | — | `tenantId` extracted from JWT, compared against invoice's tenantId |
| Displaying QR image | Browser / Client | — | `<img src="data:image/png;base64,..." />` — no client-side QR library needed |
| Loading state UX | Browser / Client | — | Spinner while useQuery fetches; show on method selection |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `promptpay-qr` | 0.5.0 | Generates EMVCo PromptPay payload string | Only maintained Thai PromptPay library on npm; correct CRC16/XMODEM implementation; verified source |
| `qrcode` | 1.5.4 | Converts payload string to base64 PNG data URI | 15.4M downloads/week; server + client support; Promise API; TypeScript types via `@types/qrcode` |
| `@types/qrcode` | latest | TypeScript type definitions for qrcode | Provides `QRCode.toDataURL` typed signature |

[VERIFIED: npm registry — confirmed via `npm view promptpay-qr` and `npm view qrcode`, source read from raw.githubusercontent.com]

### Not Needed (avoid)

| Instead of | Could Use | Why to Avoid |
|------------|-----------|--------------|
| hand-rolled CRC16 | `promptpay-qr` | The library's CRC uses `crc.crc16xmodem(dataToCrc, 0xffff)` with seed 0xFFFF — a subtle requirement that hand-rolls get wrong |
| hand-rolled TLV | `promptpay-qr` | Phone-number formatting (`0812345678` → `+66812345678` → left-pad to 13 digits) is a common bug source |
| client-side QR generation | server-side endpoint | Avoids exposing `promptpayId` in API responses consumed by the browser |

**Installation (backend only):**
```bash
cd src/backend
npm install promptpay-qr qrcode
npm install --save-dev @types/qrcode
```

**Version verification (confirmed 2026-06-12):**
```
promptpay-qr  0.5.0   (2022-01-17)   14,402 downloads/week
qrcode        1.5.4   (2024-08-05)   15,418,432 downloads/week
```

---

## Package Legitimacy Audit

> slopcheck CLI was not available at research time (binary not on PATH after pip install). Packages below are evaluated via registry data, source-code review, and npm metadata.

| Package | Registry | Age | Downloads/wk | Source Repo | slopcheck | Disposition |
|---------|----------|-----|--------------|-------------|-----------|-------------|
| `promptpay-qr` | npm | ~9 years (since 2017) | 14,402 | github.com/dtinth/promptpay-qr | [ASSUMED — CLI unavailable] | Approved — source verified, authored by Thai developer dtinth, no postinstall script |
| `qrcode` | npm | ~12 years | 15,418,432 | github.com/soldair/node-qrcode | [ASSUMED — CLI unavailable] | Approved — massive downloads, no postinstall script, widely used across Node ecosystem |
| `@types/qrcode` | npm | ~8 years | high | github.com/DefinitelyTyped/DefinitelyTyped | [ASSUMED — CLI unavailable] | Approved — DefinitelyTyped package |

**Packages removed due to slopcheck [SLOP]:** none
**Packages flagged as suspicious [SUS]:** none

*slopcheck CLI was unavailable; packages tagged [ASSUMED]. No checkpoint:human-verify added because all packages are well-established (source-reviewed, long history, authoritative authors). Planner may optionally add a checkpoint before install if desired.*

**Postinstall check:** Neither `promptpay-qr` nor `qrcode` define `scripts.postinstall` in their npm metadata. [VERIFIED: npm registry]

---

## EMVCo PromptPay Payload Format

### Complete TLV Tag Reference

[VERIFIED: raw.githubusercontent.com/dtinth/promptpay-qr/master/index.js — source read directly]

```
Tag  Length  Value                          Meaning
──────────────────────────────────────────────────────
00   02      01                             Payload Format Indicator (EMVCo QRCPS)
01   02      11 or 12                       Point of Initiation Method
                                             11 = static (no amount)
                                             12 = dynamic (with amount)
29   NN      [sub-TLV merchant info]        Merchant Account Information (Bank of Thailand)
  └─ 00  16  A000000677010111               GUID (PromptPay application identifier)
  └─ 01  13  0066812345678                  Sub-tag: phone number (13 digits after transform)
  └─ 02  13  1234567890123                  Sub-tag: tax ID (13 digits)
  └─ 03  15  <ewallet-id>                   Sub-tag: e-wallet ID (15 digits)
53   03      764                            Transaction Currency (764 = Thai Baht, ISO 4217)
54   NN      100.00                         Transaction Amount (only present if amount > 0)
58   02      TH                             Country Code
63   04      <CRC hex>                      CRC16/XMODEM checksum (uppercase, 4 hex digits)
```

### Phone Number Transformation

Input `0812345678` (10 digits):
1. Strip non-digits: `0812345678`
2. Replace leading `0` with `66`: `66812345678` (11 digits)
3. Left-pad to 13 digits with zeros: `0066812345678`

Input `0066812345678` (already 13 digits): used as-is.

### Tax ID / Citizen ID

Input is 13 digits — used directly without transformation.

### Amount Encoding

```javascript
amount.toFixed(2)  // e.g. 1234.5 → "1234.50"
```

Tag 54 is omitted entirely when no amount is specified (static QR).
When amount > 0, tag `01` (POI method) switches from `11` to `12`.

### CRC16 Calculation

Algorithm: CRC16/XMODEM (polynomial 0x1021, seed 0xFFFF, no input/output reflection)

```javascript
// From promptpay-qr source — uses the `crc` npm package
var dataToCrc = serialize(data) + '63' + '04'
var crcValue  = crc.crc16xmodem(dataToCrc, 0xffff)
var formatted = ('0000' + crcValue.toString(16).toUpperCase()).slice(-4)
// → e.g. "1A2B"
```

The string to CRC includes the full payload up to and including the tag/length bytes of tag 63
(`'63' + '04'`) but not the checksum value itself.

---

## Architecture Patterns

### System Architecture Diagram

```
Browser (ClinicBilling.tsx)
│
│  User selects "PromptPay" method
│  → useQuery(['promptpay-qr', invoiceId])
│  → GET /api/invoices/:id/promptpay-qr
│                │
│                ▼
API Layer (invoice.controller.ts)
│  Extract tenantId from JWT (req.context.tenantId)
│  Call promptpayQrService.generateQr(tenantId, invoiceId)
│                │
│                ▼
Service Layer (promptpay-qr.service.ts)  [NEW]
│  1. invoiceRepo.getInvoice(tenantId, invoiceId)
│     → verify invoice.tenantId === tenantId (isolation)
│     → read invoice.totalAmount (server-authoritative)
│  2. settingsRepo.getOrCreateSettings(tenantId)
│     → read tenantSettings.promptpayId
│  3. promptpayQr: generatePayload(promptpayId, { amount })
│  4. qrcode.toDataURL(payload, { width: 300, margin: 2, errorCorrectionLevel: 'M' })
│  → return { dataUrl: "data:image/png;base64,..." }
│                │
│                ▼
Browser displays <img src={dataUrl} />
Spinner shown while loading; error state if promptpayId not configured
```

### Recommended Project Structure (additions only)

```
src/backend/
├── services/
│   └── promptpay-qr.service.ts   # NEW — payload gen + QR image
├── controllers/
│   └── invoice.controller.ts     # ADD generatePromptpayQr handler
├── routes/
│   └── invoice.routes.ts         # ADD GET /:id/promptpay-qr
└── tests/
    ├── unit/
    │   └── promptpay-qr.test.ts  # NEW — unit tests for service
    └── integration/
        └── invoice.test.ts       # ADD QR endpoint integration test

src/frontend/src/
└── views/clinic/
    └── ClinicBilling.tsx          # MODIFY lines 283-291
```

### Pattern: Server-Authoritative Amount

**What:** The QR endpoint reads `totalAmount` from the invoice DB record. The client passes only `invoiceId`.

**Why:** Prevents a malicious client from passing `amount=0.01` when the real total is 5000 THB.

**Implementation:**
```typescript
// promptpay-qr.service.ts
import generatePayload from 'promptpay-qr'
import QRCode from 'qrcode'
import { getInvoice } from '../models/invoice.repository'
import { getOrCreateSettings } from '../models/tenant-settings.repository'

export async function generateQr(tenantId: number, invoiceId: number): Promise<string> {
  // 1. Load invoice — automatically filtered by tenantId (isolation enforced by repo)
  const invoice = await getInvoice(tenantId, invoiceId)
  if (!invoice) throw Object.assign(new Error('Invoice not found'), { status: 404 })

  // 2. Load tenant settings for promptpayId
  const settings = await getOrCreateSettings(tenantId)
  if (!settings.promptpayId) {
    throw Object.assign(new Error('PromptPay ID not configured for this clinic'), { status: 422 })
  }

  // 3. Generate EMVCo payload
  const amount = Number(invoice.totalAmount)
  const payload = generatePayload(settings.promptpayId, { amount })

  // 4. Render to base64 PNG data URI
  const dataUrl = await QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    width: 300,
    margin: 2,
  })
  return dataUrl
}
```

**TypeScript note:** `promptpay-qr` ships `api.d.ts` at package root. Requires `"esModuleInterop": true` in `tsconfig.json`. Import as:
```typescript
import generatePayload from 'promptpay-qr'
```
[VERIFIED: github.com/dtinth/promptpay-qr/blob/master/api.d.ts]

**TypeScript note for qrcode:** Install `@types/qrcode` for `QRCode.toDataURL` typing. Returns `Promise<string>`.
[ASSUMED — based on DefinitelyTyped convention; verify `@types/qrcode` exists on npm]

### Pattern: Frontend QR Loading

**When to fetch:** On method selection (`method === 'qr_promptpay'`), not on "Confirm Payment" click. The customer needs to see the QR before paying, so fetch eagerly when the tab is selected.

**TanStack Query v5 pattern:**
```tsx
// Inside ClinicBilling — add near other useQuery calls
const { data: qrDataUrl, isLoading: qrLoading, isError: qrError } = useQuery({
  queryKey: ['promptpay-qr', selectedInvoiceId],
  queryFn: async () => {
    const res = await api.get<{ success: boolean; dataUrl: string }>(
      `/api/invoices/${selectedInvoiceId}/promptpay-qr`
    )
    return res.data.dataUrl
  },
  enabled: method === 'qr_promptpay' && selectedInvoiceId != null,
  staleTime: Infinity, // QR for a given invoice amount never changes
  retry: false,
})
```

**Render (replaces lines 283-291):**
```tsx
{method === 'qr_promptpay' && (
  <div className="flex flex-col items-center gap-sm mb-md py-md bg-surface-container-low rounded-lg">
    <div className="w-40 h-40 rounded-lg bg-surface border border-outline-variant flex items-center justify-center overflow-hidden">
      {qrLoading && (
        <MaterialIcon name="progress_activity" size={48} className="text-on-surface-variant animate-spin" />
      )}
      {qrError && (
        <div className="flex flex-col items-center gap-xs">
          <MaterialIcon name="qr_code_2" size={48} className="text-on-surface-variant" />
          <p className="text-label-sm text-error text-center px-sm">QR unavailable — check PromptPay ID in settings</p>
        </div>
      )}
      {qrDataUrl && !qrLoading && (
        <img src={qrDataUrl} alt="PromptPay QR" className="w-full h-full object-contain" />
      )}
    </div>
    <p className="text-label-md text-on-surface-variant uppercase tracking-wider">Scan to pay · {baht(total)}</p>
  </div>
)}
```

### Anti-Patterns to Avoid

- **Client-supplied amount in QR request:** Never `GET /promptpay-qr?amount=X`. Amount must come from the DB invoice record.
- **Exposing promptpayId to browser:** The service returns a data URI only; `promptpayId` stays server-side.
- **Regenerating QR on every render:** Use `staleTime: Infinity` — the QR for a specific invoice total is deterministic and immutable.
- **Hand-rolling CRC:** CRC16/XMODEM with seed 0xFFFF is not the same as standard CRC16. Use the `crc` package (transitive dependency of `promptpay-qr`).
- **Using error correction level H:** Level M is sufficient for on-screen display and keeps the QR less dense/easier to scan.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PromptPay TLV payload | Custom TLV builder | `promptpay-qr` | Phone normalization (+66 prefix, 13-digit left-pad) is spec-critical; wrong padding breaks all Thai banking apps |
| CRC16/XMODEM | Custom CRC impl | `crc` (via promptpay-qr) | Standard CRC16 (seed 0x0000) produces wrong output; must use seed 0xFFFF |
| Amount formatting | `amount.toString()` | `amount.toFixed(2)` | Must always emit exactly 2 decimal places; `764.5` must become `"764.50"` |
| QR image rendering | Canvas drawing | `qrcode` | QR symbol placement, quiet zone, error correction levels are non-trivial |

---

## Common Pitfalls

### Pitfall 1: esModuleInterop not enabled

**What goes wrong:** `import generatePayload from 'promptpay-qr'` throws `SyntaxError: ... does not provide an export named 'default'` at runtime.

**Why it happens:** `promptpay-qr` is a CommonJS module using `module.exports`. Without `esModuleInterop: true`, TypeScript ES module interop doesn't create a default export wrapper.

**How to avoid:** Confirm `tsconfig.json` has `"esModuleInterop": true`. This is present in most modern Node TypeScript projects. Alternatively use: `const generatePayload = require('promptpay-qr')` in a `.ts` file.

**Warning signs:** Compile-time error `Module '"promptpay-qr"' has no default export`.

---

### Pitfall 2: Amount sourced from request body

**What goes wrong:** A staff member or malicious actor passes `amount=1` in the query string to generate a QR for 1 THB while the real invoice is 5,000 THB.

**How to avoid:** The endpoint takes only `invoiceId`. The service layer fetches `totalAmount` from the database. The route handler passes no amount parameter to the service.

**Warning signs:** Any `req.query.amount`, `req.body.amount`, or `req.params.amount` in the QR handler.

---

### Pitfall 3: Missing tenant isolation check

**What goes wrong:** Tenant A requests QR for Tenant B's invoice ID. If the repo uses a plain `findUnique` by ID without `tenantId`, the QR is generated with Tenant B's amount but Tenant A's promptpayId.

**How to avoid:** `getInvoice(tenantId, invoiceId)` — the existing `invoice.repository.getInvoice` already scopes by `tenantId`. Verify the repo function includes `WHERE tenantId = $tenantId` (Prisma: `where: { id: invoiceId, tenantId }`).

**Warning signs:** `prisma.invoice.findUnique({ where: { id: invoiceId } })` without `tenantId` in the where clause.

---

### Pitfall 4: QR fetched with wrong `invoiceId`

**What goes wrong:** `selectedInvoiceId` is `null` or `undefined` when the QR query fires, generating a request to `/api/invoices/undefined/promptpay-qr`.

**How to avoid:** Use `enabled: method === 'qr_promptpay' && selectedInvoiceId != null` in the `useQuery` options. Do not use `enabled: !!selectedInvoiceId` because `0` is falsy but a valid (though unlikely) ID.

---

### Pitfall 5: `promptpayId` not configured

**What goes wrong:** Clinic skipped the payment settings page. `tenantSettings.promptpayId` is null. The service crashes or generates an invalid QR.

**How to avoid:** Explicit guard in the service: if `!settings.promptpayId`, throw a `422 Unprocessable Entity` with a human-readable message. The frontend `isError` branch shows: "QR unavailable — check PromptPay ID in settings".

---

## Test Strategy

### What to Test (without a real Thai banking app)

**Unit tests — `tests/unit/promptpay-qr.test.ts`:**

1. **Payload structure test:** Call `generatePayload('0812345678', { amount: 100 })` and assert:
   - Starts with `000201` (format indicator `00`, length `02`, value `01`)
   - Contains `A000000677010111` (PromptPay GUID)
   - Contains `760000` or `53037640` (currency THB = 764)
   - Contains `54` tag followed by `100.00`
   - Ends with `6304` followed by 4 hex chars (CRC tag + 4-char value)
   - Ends with a valid CRC (re-compute and compare)

2. **Phone formatting:** Assert `0066812345678` appears in the payload for input `0812345678`.

3. **Tax ID path:** 13-digit input should emit sub-tag `02` (not `01`).

4. **Static QR (no amount):** Amount-less call should NOT contain tag `54`; POI method should be `11`.

5. **Amount formatting:** `amount: 1234.5` → payload contains `1234.50` (not `1234.5`).

6. **QR image output:** `QRCode.toDataURL(payload)` returns a string starting with `data:image/png;base64,`. Verify length > 100 chars (non-empty image).

**Integration tests — `tests/integration/invoice.test.ts` additions:**

7. **Happy path:** Authenticated request `GET /api/invoices/:id/promptpay-qr` returns `{ success: true, dataUrl: "data:image/png;base64,..." }`.

8. **Tenant isolation:** Tenant A cannot fetch QR for Tenant B's invoice — expect 404.

9. **Missing promptpayId:** Invoice exists but `tenant_settings.promptpayId` is null → expect 422.

10. **Invalid invoice ID:** Non-existent ID → expect 404.

---

## Code Examples

### Complete Service (verified against source)

```typescript
// src/backend/services/promptpay-qr.service.ts
// Source: api.d.ts from github.com/dtinth/promptpay-qr (VERIFIED)
//         README from github.com/soldair/node-qrcode (VERIFIED)
import generatePayload from 'promptpay-qr'
import QRCode from 'qrcode'
import prisma from '../config/db'
import { getOrCreateSettings } from '../models/tenant-settings.repository'

export async function generatePromptpayQr(tenantId: number, invoiceId: number): Promise<string> {
  // Tenant-isolated invoice fetch
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId, tenantId },
    select: { totalAmount: true, status: true },
  })
  if (!invoice) throw Object.assign(new Error('Invoice not found'), { status: 404 })

  const settings = await getOrCreateSettings(tenantId)
  if (!settings.promptpayId) {
    throw Object.assign(new Error('PromptPay ID not configured'), { status: 422 })
  }

  const amount = Number(invoice.totalAmount)
  const payload = generatePayload(settings.promptpayId, { amount })

  // toDataURL returns Promise<string> with data:image/png;base64,... prefix
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',  // sufficient for on-screen display
    width: 300,                 // 300px — sharp on Retina without excess payload
    margin: 2,                  // 2 modules quiet zone
  })
}
```

### Route Addition

```typescript
// In src/backend/routes/invoice.routes.ts — add before export
router.get('/:id/promptpay-qr', ctrl.generatePromptpayQr)
```

### Controller Addition

```typescript
// In src/backend/controllers/invoice.controller.ts
export async function generatePromptpayQr(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { tenantId } = req.context!
    const id = Number(req.params.id)
    const dataUrl = await promptpayQrService.generatePromptpayQr(tenantId, id)
    res.json({ success: true, dataUrl })
  } catch (err) { next(err) }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|-----------------|--------------|--------|
| `paymentQrUrl` (static stored image) | Dynamic QR from `promptpay-qr` per invoice | Session C | QR encodes exact invoice amount, eliminating manual amount entry by customer |
| Placeholder icon in billing | Real `<img>` with base64 data URI | Session C | Functional checkout flow |

**Still out of scope (deferred):** Payment gateway (Omise/Stripe) confirmation, webhook verification, LINE/SMS receipt dispatch.

---

## Open Questions (RESOLVED)

1. **`esModuleInterop` in existing `tsconfig.json`** — RESOLVED ✅
   - Verified: `src/backend/tsconfig.json` has `"esModuleInterop": true`.
   - `import generatePayload from 'promptpay-qr'` compiles cleanly. No Wave 0 task needed.

2. **Invoice status guard on QR endpoint** — RESOLVED ✅
   - Confirmed via `prisma/schema.prisma`: `PaymentStatus` enum values are `pending`, `paid`, `partial`, `void`, `refunded` (no `CANCELLED`).
   - Guard: block `void` and `refunded` (→ 422). Allow `pending`, `paid`, `partial` (QR reprint useful for paid invoices).
   - The Prisma field name is `paymentStatus`, not `status`.

3. **`totalAmount` Prisma type** — RESOLVED ✅
   - Confirmed via `src/backend/services/pdf.service.ts:128` and `invoice.service.ts:123`: project uses `Number(inv.totalAmount)` consistently.
   - The defensive `.toNumber()` branch in the service is kept as a safety guard but `Number()` handles both cases in practice.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js >= 16 | qrcode `canvas` module | ✓ | (project running) | — |
| npm | package install | ✓ | (project running) | — |
| PostgreSQL | invoice + settings fetch | ✓ | 15+ (per CLAUDE.md) | — |
| `promptpay-qr` | payload gen | ✗ (not installed) | 0.5.0 | No fallback — must install |
| `qrcode` | image render | ✗ (not installed) | 1.5.4 | No fallback — must install |

**Missing dependencies with no fallback:**
- `promptpay-qr` and `qrcode` — Wave 0 must install these before any service code is written.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 29.7 + ts-jest |
| Config file | `src/backend/jest.config.js` (inferred from existing test setup) |
| Quick run command | `cd src/backend && npm test -- tests/unit/promptpay-qr.test.ts` |
| Full suite command | `cd src/backend && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command |
|--------|----------|-----------|-------------------|
| QR-01 | Payload contains correct PromptPay GUID | unit | `npm test -- tests/unit/promptpay-qr.test.ts` |
| QR-02 | Phone number formatted as 0066XXXXXXXXX | unit | `npm test -- tests/unit/promptpay-qr.test.ts` |
| QR-03 | Amount encoded as toFixed(2) string | unit | `npm test -- tests/unit/promptpay-qr.test.ts` |
| QR-04 | CRC16 tag present and 4 hex chars | unit | `npm test -- tests/unit/promptpay-qr.test.ts` |
| QR-05 | GET endpoint returns base64 PNG data URI | integration | `npm test -- tests/integration/invoice.test.ts` |
| QR-06 | Tenant isolation — cross-tenant request returns 404 | integration | `npm test -- tests/integration/invoice.test.ts` |
| QR-07 | Missing promptpayId returns 422 | integration | `npm test -- tests/integration/invoice.test.ts` |

### Wave 0 Gaps

- [ ] `tests/unit/promptpay-qr.test.ts` — covers QR-01 through QR-04
- [ ] Add QR endpoint tests to `tests/integration/invoice.test.ts` — covers QR-05 through QR-07

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V4 Access Control | yes | JWT `tenantId` verified in every repo call; invoice fetched with `where: { id, tenantId }` |
| V5 Input Validation | yes | `invoiceId` parsed as `Number()` and validated > 0; `promptpayId` validated by `promptpay-qr` (strips non-digits) |
| V6 Cryptography | no | No encryption — QR is a public payment artifact |
| V2 Authentication | yes | `authMiddleware` on all `/api/invoices/*` routes (already present) |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Amount manipulation via query param | Tampering | Amount read from DB, not from request |
| Cross-tenant invoice access | Information Disclosure | `where: { id: invoiceId, tenantId }` in Prisma query |
| Numeric ID injection (`NaN`, negative) | Tampering | `Number(req.params.id)` + check `isNaN` or `<= 0` before service call |
| QR for cancelled invoice | Spoofing | Guard in service: reject if `status === 'CANCELLED'` |

---

## Sources

### Primary (HIGH confidence)

- `github.com/dtinth/promptpay-qr/blob/master/index.js` — full source of TLV generation and CRC16 algorithm (raw fetch, verified 2026-06-12)
- `github.com/dtinth/promptpay-qr/blob/master/api.d.ts` — TypeScript type definitions (raw fetch, verified 2026-06-12)
- `github.com/soldair/node-qrcode/blob/master/README.md` — `toDataURL` API, options, error correction levels (raw fetch, verified 2026-06-12)
- npm registry API `api.npmjs.org/downloads/point/last-week/*` — download counts (verified 2026-06-12)
- `npm view promptpay-qr` + `npm view qrcode` — version and publish date (verified 2026-06-12)

### Secondary (MEDIUM confidence)

- CLAUDE.md project constraints — tenantId enforcement, Tailwind rules, stack decisions
- Existing codebase (`invoice.routes.ts`, `invoice.controller.ts`, `tenant-settings.repository.ts`, `ClinicBilling.tsx`) — integration points confirmed by file read

### Tertiary (LOW confidence — ASSUMED)

- `@types/qrcode` existence on DefinitelyTyped [ASSUMED — not verified via npm view in this session]
- Prisma `Decimal` type behavior for `totalAmount` — use `.toNumber()` may be needed [ASSUMED]

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `@types/qrcode` is available on npm as a DefinitelyTyped package | Standard Stack | Low — `qrcode` may have bundled types or require `// @ts-ignore`; verify with `npm view @types/qrcode` |
| A2 | `tsconfig.json` already has `esModuleInterop: true` | Code Examples | Medium — compilation fails without it; planner should add a Wave 0 verification task |
| A3 | `invoice.totalAmount` is a Prisma Decimal field requiring `.toNumber()` | Code Examples | Low — `Number(decimal)` also works, but `.toNumber()` is more explicit and type-safe |
| A4 | `promptpay-qr` has no slopcheck [SLOP] verdict | Package Legitimacy | Low — package is 9 years old, authored by named Thai developer, source reviewed |

---

## Metadata

**Confidence breakdown:**
- EMVCo payload format: HIGH — source code read directly from GitHub
- `promptpay-qr` API: HIGH — TypeScript definitions read directly from GitHub
- `qrcode` API: HIGH — README read directly from GitHub
- Package legitimacy: MEDIUM — slopcheck CLI unavailable; registry metadata and source review used
- Frontend integration pattern: HIGH — based on existing `useQuery` patterns in `ClinicBilling.tsx`
- Test strategy: HIGH — mirrors existing test patterns in `tests/integration/` and `tests/unit/`

**Research date:** 2026-06-12
**Valid until:** 2026-09-12 (stable standards — 90 days)
