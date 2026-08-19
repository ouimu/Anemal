---
phase: session-c
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/package.json
  - src/backend/package-lock.json
  - src/backend/services/promptpay-qr.service.ts
  - src/backend/controllers/invoice.controller.ts
  - src/backend/routes/invoice.routes.ts
  - src/frontend/src/views/clinic/ClinicBilling.tsx
  - src/backend/tests/unit/promptpay-qr.test.ts
  - src/backend/tests/integration/invoice.test.ts
  - docs/index.html
autonomous: false
requirements:
  - QR-01
  - QR-02
  - QR-03
  - QR-04
  - QR-05
  - QR-06
  - QR-07

must_haves:
  truths:
    - "Staff selects PromptPay method, invoice is created, and a scannable QR image appears"
    - "The QR encodes the invoice's server-authoritative totalAmount — not any client-supplied value"
    - "If promptpayId is not configured, the UI shows a clear human-readable error (not a broken image)"
    - "Cross-tenant request for another tenant's invoice returns 404"
    - "QR image is a valid base64 PNG data URI (starts with data:image/png;base64,)"
  artifacts:
    - path: "src/backend/services/promptpay-qr.service.ts"
      provides: "generatePromptpayQr(tenantId, invoiceId) → Promise<string> data URI"
      exports: ["generatePromptpayQr"]
    - path: "src/backend/controllers/invoice.controller.ts"
      provides: "generatePromptpayQr handler added"
      contains: "generatePromptpayQr"
    - path: "src/backend/routes/invoice.routes.ts"
      provides: "GET /:id/promptpay-qr route registered"
      contains: "promptpay-qr"
    - path: "src/frontend/src/views/clinic/ClinicBilling.tsx"
      provides: "Real QR image in payment panel, replacing static placeholder"
      contains: "qr-data"
    - path: "src/backend/tests/unit/promptpay-qr.test.ts"
      provides: "Unit tests QR-01 through QR-04"
    - path: "src/backend/tests/integration/invoice.test.ts"
      provides: "Integration tests QR-05 through QR-07"
  key_links:
    - from: "src/frontend/src/views/clinic/ClinicBilling.tsx"
      to: "GET /api/invoices/:id/promptpay-qr"
      via: "useQuery(['promptpay-qr', invoiceId]) via api.get()"
      pattern: "promptpay-qr"
    - from: "src/backend/controllers/invoice.controller.ts"
      to: "src/backend/services/promptpay-qr.service.ts"
      via: "generatePromptpayQr(tenantId, invoiceId)"
      pattern: "promptpayQrService\\.generatePromptpayQr"
    - from: "src/backend/services/promptpay-qr.service.ts"
      to: "prisma.invoice"
      via: "findUnique({ where: { id, tenantId } })"
      pattern: "prisma\\.invoice\\.findUnique"
---

<objective>
Implement end-to-end PromptPay QR code generation for the clinic billing POS screen.

Purpose: Replace the static placeholder in ClinicBilling.tsx with a real EMVCo-compliant QR image that Thai banking apps can scan. Amount is server-authoritative (read from the invoice DB record); the merchantId stays server-side and is never sent to the browser.

Output:
- `promptpay-qr` and `qrcode` npm packages installed in the backend
- New service `promptpay-qr.service.ts` — generates base64 PNG data URI from tenant settings + invoice amount
- New GET endpoint `GET /api/invoices/:id/promptpay-qr`
- Updated `ClinicBilling.tsx` — spinner while loading, real QR image on success, descriptive error on 422
- Unit tests (QR-01–QR-04) and integration tests (QR-05–QR-07) passing
</objective>

<execution_context>
@D:/Development/AnimalClinic/.planning/phases/session-c-promptpay-qr/RESEARCH.md
</execution_context>

<context>
@D:/Development/AnimalClinic/CLAUDE.md
@D:/Development/AnimalClinic/src/backend/routes/invoice.routes.ts
@D:/Development/AnimalClinic/src/backend/controllers/invoice.controller.ts
@D:/Development/AnimalClinic/src/backend/services/tenant-settings.service.ts
@D:/Development/AnimalClinic/src/frontend/src/views/clinic/ClinicBilling.tsx

<interfaces>
<!-- Key contracts the executor needs — no codebase exploration required. -->

From src/backend/controllers/invoice.controller.ts (pattern to follow):
```typescript
export async function getInvoice(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await invoiceService.getInvoice(req.context!.tenantId, Number(req.params.id))
    res.json({ success: true, data })
  } catch (err) { next(err) }
}
```

From src/backend/routes/invoice.routes.ts (existing routes — new route placement):
```typescript
router.get('/', ctrl.listInvoices)
router.post('/', validate(createInvoiceSchema), ctrl.createInvoice)
router.get('/:id/pdf', ctrl.downloadInvoicePdf)
router.get('/:id/promptpay-qr', ctrl.generatePromptpayQr)  // ← INSERT HERE, before /:id
router.get('/:id', ctrl.getInvoice)                         // ← MUST remain after all sub-resources
router.put('/:id/payment', validate(paymentSchema), ctrl.recordPayment)
```
RULE: All `/:id/<sub-resource>` routes (like `/pdf`, `/promptpay-qr`) MUST be declared before `/:id`.
If placed after, Express matches the string literal "promptpay-qr" as the `:id` parameter.

From src/backend/tsconfig.json:
- "esModuleInterop": true — already set. `import generatePayload from 'promptpay-qr'` compiles correctly.

From src/frontend/src/views/clinic/ClinicBilling.tsx (state and query patterns):
```typescript
// Existing state (line 30):
const [method, setMethod] = useState<'cash' | 'qr_promptpay' | 'credit_card'>('cash')
const [paid, setPaid] = useState<Invoice | null>(null)

// finalize() creates invoice then recordPayment — invoice.id available after createInvoice.mutateAsync
// The paid invoice is stored as `paid` (Invoice | null) after finalize completes.
// The QR must be fetchable BEFORE finalize() — when method is selected and an invoiceId is needed.
// Pattern: add a pendingInvoiceId state set after createInvoice.mutateAsync, before recordPayment.mutateAsync.
// OR: fetch QR immediately using a staging/draft invoice approach.
// Simplest approach per research: fetch QR after invoice creation but before payment confirmation.
// The finalize() flow: createInvoice → pendingInvoiceId → show QR → confirm → recordPayment.

// Existing useQuery pattern (line 42–46):
const { data: loyalty } = useQuery<Loyalty>({
  queryKey: ['loyalty', pet?.ownerId],
  enabled: !!pet?.ownerId,
  queryFn: () => api.get(`/api/loyalty/owners/${pet!.ownerId}`).then((r) => r.data.data),
})

// api import:
import api from '../../utils/api'
// api is an axios instance — res.data is the full response body { success, data } or { success, dataUrl }
```

From src/frontend/src/views/clinic/ClinicBilling.tsx lines 283–291 (placeholder to replace):
```tsx
{method === 'qr_promptpay' && (
  <div className="flex flex-col items-center gap-sm mb-md py-md bg-surface-container-low rounded-lg">
    <div className="w-40 h-40 rounded-lg bg-surface border border-outline-variant flex items-center justify-center">
      <MaterialIcon name="qr_code_2" size={120} className="text-primary" />
    </div>
    <p className="text-label-md text-on-surface-variant uppercase tracking-wider">Scan to pay · {baht(total)}</p>
    <p className="text-label-md text-on-surface-variant">PromptPay QR (gateway integration: Phase 4)</p>
  </div>
)}
```
</interfaces>
</context>

<tasks>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 1: Install npm packages and scaffold service</name>
  <what-built>
    Run in src/backend:
      npm install promptpay-qr qrcode
      npm install --save-dev @types/qrcode

    Then create src/backend/services/promptpay-qr.service.ts:

    ```
    import generatePayload from 'promptpay-qr'
    import QRCode from 'qrcode'
    import prisma from '../config/db'
    import { getOrCreateSettings } from '../models/tenant-settings.repository'

    export async function generatePromptpayQr(tenantId: number, invoiceId: number): Promise<string> {
      if (!invoiceId || invoiceId <= 0) {
        throw Object.assign(new Error('Invalid invoice ID'), { status: 400 })
      }

      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId, tenantId },
        select: { totalAmount: true, paymentStatus: true },
      })
      if (!invoice) throw Object.assign(new Error('Invoice not found'), { status: 404 })
      if (invoice.paymentStatus === 'void' || invoice.paymentStatus === 'refunded') {
        throw Object.assign(new Error('Cannot generate QR for a voided or refunded invoice'), { status: 422 })
      }

      const settings = await getOrCreateSettings(tenantId)
      if (!settings.promptpayId) {
        throw Object.assign(new Error('PromptPay ID not configured for this clinic'), { status: 422 })
      }

      const amount = typeof invoice.totalAmount === 'object' && 'toNumber' in (invoice.totalAmount as object)
        ? (invoice.totalAmount as { toNumber(): number }).toNumber()
        : Number(invoice.totalAmount)

      const payload = generatePayload(settings.promptpayId, { amount })

      return QRCode.toDataURL(payload, {
        errorCorrectionLevel: 'M',
        width: 300,
        margin: 2,
      })
    }
    ```

    NOTE — do NOT place fenced code blocks in this action section; the above is pseudocode prose.
    Implement these behaviors:
    - Guard: invoiceId <= 0 → 400
    - Guard: invoice not found (or wrong tenant) → 404
    - Guard: invoice.paymentStatus === 'void' or 'refunded' → 422
    - Guard: settings.promptpayId is null/empty → 422
    - Amount: use .toNumber() if Prisma Decimal, else Number()
    - Call generatePayload(promptpayId, { amount }) — no amount in request
    - Call QRCode.toDataURL(payload, { errorCorrectionLevel: 'M', width: 300, margin: 2 })
    - Return the data URI string (starts with data:image/png;base64,)

    Then register the route and controller handler:

    In src/backend/controllers/invoice.controller.ts, add after the existing imports:
      import * as promptpayQrService from '../services/promptpay-qr.service'

    Add the handler (same pattern as getInvoice):
      export async function generatePromptpayQr(req, res, next): void
        tenantId from req.context!.tenantId
        id = Number(req.params.id)
        dataUrl = await promptpayQrService.generatePromptpayQr(tenantId, id)
        res.json({ success: true, dataUrl })

    In src/backend/routes/invoice.routes.ts, add before export:
      router.get('/:id/promptpay-qr', ctrl.generatePromptpayQr)

    IMPORTANT: This route must be declared BEFORE router.get('/:id', ctrl.getInvoice) to avoid
    Express treating "promptpay-qr" as the :id param. The current route file has /:id at line 13.
    Insert the new route at line 12, before /:id.
  </what-built>
  <how-to-verify>
    1. cd src/backend && npm run build (TypeScript should compile without errors)
    2. Check that `node_modules/promptpay-qr` and `node_modules/qrcode` exist
    3. Confirm no TypeScript error on `import generatePayload from 'promptpay-qr'`
       (esModuleInterop is already true in tsconfig.json — this should compile cleanly)
  </how-to-verify>
  <resume-signal>Type "build ok" if compilation passes, or paste the TypeScript errors</resume-signal>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Write tests (unit + integration)</name>
  <files>
    src/backend/tests/unit/promptpay-qr.test.ts,
    src/backend/tests/integration/invoice.test.ts
  </files>
  <behavior>
    Unit tests (promptpay-qr.test.ts) — test the service function directly (mock prisma + settings repo):
    - QR-01: payload from generatePayload('0812345678', { amount: 100 }) contains 'A000000677010111' (PromptPay GUID)
    - QR-02: payload contains '0066812345678' (phone formatted to 13-digit padded form)
    - QR-03: payload contains '100.00' (amount formatted as toFixed(2))
    - QR-04: payload ends with '6304' followed by exactly 4 uppercase hex chars (CRC tag)
    - QR-04b: QRCode.toDataURL(payload) returns string starting with 'data:image/png;base64,' and length > 100
    - Error: generatePromptpayQr throws status:422 when promptpayId is null (mock settings with null promptpayId)
    - Error: generatePromptpayQr throws status:404 when prisma.invoice.findUnique returns null

    Integration tests (invoice.test.ts) — HTTP-level tests using supertest:
    - QR-05: POST (setup) creates tenant + invoice, then GET /api/invoices/:id/promptpay-qr with valid JWT
            returns 200 { success: true, dataUrl: 'data:image/png;base64,...' }
    - QR-06: Tenant isolation — Tenant B's JWT + Tenant A's invoice ID → 404
    - QR-07: Invoice exists but tenant_settings.promptpayId is null → 422
    - QR-08: Non-existent invoice ID → 404

    Follow the pattern from existing integration tests (src/backend/tests/integration/settings-api.test.ts)
    for supertest setup, JWT generation, and teardown.
  </behavior>
  <action>
    Create tests/unit/promptpay-qr.test.ts:
    - Import generatePayload from 'promptpay-qr' directly (not mocked — test real payload logic)
    - Import QRCode from 'qrcode' directly (test real image generation)
    - For service function tests: jest.mock('../../../config/db') and
      jest.mock('../../../models/tenant-settings.repository')
    - Use beforeEach to reset mocks

    Create tests/integration/invoice.test.ts:
    - Mirror the auth + setup pattern from settings-api.test.ts
    - Each test creates isolated tenant data and cleans up in afterEach
    - For QR-07: insert a tenant_settings row with promptpayId = null (or rely on default null)
    - For QR-06: create two tenants, generate JWT for tenant B, request invoice belonging to tenant A

    Run: cd src/backend && npm test -- tests/unit/promptpay-qr.test.ts
    Then: cd src/backend && npm test -- tests/integration/invoice.test.ts
  </action>
  <verify>
    <automated>cd D:/Development/AnimalClinic/src/backend && npm test -- tests/unit/promptpay-qr.test.ts --forceExit 2>&amp;1 | tail -20</automated>
  </verify>
  <done>
    All unit tests pass (QR-01 through QR-04, error cases).
    All integration tests pass (QR-05 through QR-08).
    Total backend test count after Task 2 is greater than the count before Task 2 begins
    (run `npm test -- --forceExit` before and after to compare).
  </done>
</task>

<task type="auto">
  <name>Task 3: Update ClinicBilling.tsx — real QR image</name>
  <files>src/frontend/src/views/clinic/ClinicBilling.tsx</files>
  <action>
    The finalize() function currently creates the invoice then immediately calls recordPayment.
    For PromptPay, the customer needs to scan the QR BEFORE payment is confirmed. Implement this
    two-step flow:

    1. Add state: const [pendingInvoiceId, setPendingInvoiceId] = useState&lt;number | null&gt;(null)

    2. Add the QR query near the other useQuery hooks (after loyalty, before or after records):
       queryKey: ['promptpay-qr', pendingInvoiceId]
       queryFn: api.get(`/api/invoices/${pendingInvoiceId}/promptpay-qr`).then(r => r.data.dataUrl)
       enabled: method === 'qr_promptpay' && pendingInvoiceId != null
         (use != null — not !!pendingInvoiceId — to guard against 0 being falsy)
       staleTime: Infinity  (QR for a given invoice amount is deterministic, never refetch)
       retry: false

    3. Modify finalize() for the qr_promptpay method:
       - When method === 'qr_promptpay':
           a. createInvoice.mutateAsync → get invoice
           b. setPendingInvoiceId(invoice.id)
           c. Return early — do NOT call recordPayment.mutateAsync yet
       - All other methods: keep existing flow unchanged

    4. Add a "Payment Received" button that only appears when:
       method === 'qr_promptpay' && pendingInvoiceId != null
       Button text: "Payment Received"
       Minimum tap target: min-h-[56px] w-full (match the existing Confirm button)
       Colors: bg-secondary text-secondary-on (same as existing confirm button)

       On click handler (mirror the loyalty earn/redeem logic from finalize(), lines 120–130):
         const settled = await recordPayment.mutateAsync({ id: pendingInvoiceId, paymentMethod: method })
         // Redeem loyalty points (best-effort — payment already succeeded)
         if (pet?.ownerId && redeemDiscount > 0) {
           try {
             await api.post('/api/loyalty/redeem', { ownerId: pet.ownerId, points: redeemDiscount, invoiceTotal: subtotal })
             qc.invalidateQueries({ queryKey: ['loyalty', pet.ownerId] })
           } catch { /* discount already applied; ignore redeem failure */ }
         }
         const earned = Math.floor(Number(settled.totalAmount) / 100)
         if (pet?.ownerId && earned > 0) setEarnedMsg(`+${earned} loyalty point${earned !== 1 ? 's' : ''} earned`)
         setPendingInvoiceId(null)
         setPaid(settled)

       CRITICAL: This loyalty block is required. Without it, PromptPay payments silently earn zero
       loyalty points, regressing behaviour vs cash/card payments.

    5. Replace lines 283–291 (the qr_promptpay placeholder block) with:
       - Outer container: same bg-surface-container-low rounded-lg flex-col items-center gap-sm mb-md py-md
       - Inner image box: w-40 h-40 (160px square) bg-surface border border-outline-variant rounded-lg
         flex items-center justify-center overflow-hidden
       - Loading state (qrLoading): MaterialIcon name="progress_activity" size={48}
         className="text-on-surface-variant animate-spin"
       - Error state (qrError): MaterialIcon name="qr_code_2" size={48} className="text-on-surface-variant"
         below it: p with text-label-sm text-error text-center px-sm
         text: "QR unavailable — check PromptPay ID in Settings"
       - Success state (qrDataUrl && !qrLoading):
         img src={qrDataUrl} alt="PromptPay QR" className="w-full h-full object-contain"
       - Idle state (no pendingInvoiceId yet): MaterialIcon name="qr_code_2" size={48}
         className="text-on-surface-variant opacity-40"
         below it: p text-label-sm text-on-surface-variant text-center px-sm
         text: "Click Confirm to generate QR"
       - Caption below the box: p text-label-md text-on-surface-variant uppercase tracking-wider
         "Scan to pay · {baht(total)}"

    6. Update reset() to also call setPendingInvoiceId(null)

    DESIGN RULES:
    - No raw hex colors — use only Tailwind token names from tailwind.config.js
    - animate-spin is a standard Tailwind utility (safe to use)
    - All interactive elements min-h-[44px] min-w-[44px]
    - No emoji anywhere — use Material Symbols Outlined only
  </action>
  <verify>
    <automated>cd D:/Development/AnimalClinic/src/frontend && npx tsc --noEmit 2>&amp;1 | head -30</automated>
  </verify>
  <done>
    TypeScript compiles without errors.
    The qr_promptpay block no longer contains "Phase 4" or "gateway integration" text.
    The component has a pendingInvoiceId state and a "Payment Received" confirm button.
    QR useQuery is enabled only when method is qr_promptpay and pendingInvoiceId is not null.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: End-to-end visual verification</name>
  <what-built>
    Tasks 1–3 have installed packages, wired the endpoint, and updated the billing UI.
    This checkpoint verifies the full flow visually in the browser.
  </what-built>
  <how-to-verify>
    Prerequisites: dev server running (cd src/backend && npm run dev; cd src/frontend && npm run dev)

    1. Log in as a clinic admin. Go to Settings → Payment. Confirm that a PromptPay ID (phone
       or tax ID) is saved in the promptpayId field. If not, enter one (e.g. 0812345678) and save.

    2. Navigate to Billing/POS. Select a pet and add at least one line item.

    3. In the payment method row, select "PromptPay (QR)".
       Expected: the QR panel shows idle state (faint QR icon + "Click Confirm to generate QR").

    4. Click "Confirm" (the main teal button). Expected:
       a. A spinner appears briefly in the QR panel.
       b. A real QR code image renders (black dots on white, ~160px square).
       c. "Scan to pay · ฿XXX.XX" appears below the QR.
       d. A "Payment Received" button appears.

    5. Open a Thai banking app (SCB, KBank, etc.) or use an EMVCo QR scanner. Scan the code.
       Expected: the app recognises it as a PromptPay QR and shows the clinic name + amount.
       (If no banking app is available, visually confirm the QR is dense and well-formed,
       not a blank white square.)

    6. Click "Payment Received". Expected: the receipt/success view renders (same as cash flow).

    7. Repeat with NO promptpayId configured in settings:
       - Remove promptpayId from Settings → Payment, save.
       - Create a new invoice, select PromptPay, click Confirm.
       Expected: error state renders in the QR box with the message
       "QR unavailable — check PromptPay ID in Settings" (no broken image).
  </how-to-verify>
  <resume-signal>
    Type "verified" if both the happy path (real QR) and the error path (missing promptpayId)
    work as described. Type "issues: [description]" to report problems.
  </resume-signal>
</task>

<task type="auto">
  <name>Task 5: Update docs/index.html and docs/functional_spec_detailed.html</name>
  <files>docs/index.html, docs/functional_spec_detailed.html</files>
  <action>
    In docs/index.html, find the Upcoming Work section and mark Session C complete:
    - Update Session C / PromptPay QR item from "pending" / "next" to "done" (checkmark)
    - Update the "next pointer" to whatever follows Session C in the roadmap
    - Update the phase status table if Session C has a row: set status to Complete
    - Update the backend test count to the new total after Session C tests pass
    - Append an entry to the Roadmap History section:
        Session C — PromptPay QR: installed promptpay-qr + qrcode, added GET /api/invoices/:id/promptpay-qr,
        updated ClinicBilling.tsx with real QR generation. Backend tests increased.

    In docs/functional_spec_detailed.html, document the new endpoint and integration:
    - Add GET /api/invoices/:id/promptpay-qr to the Billing/POS API endpoint table:
        Method: GET | Path: /api/invoices/:id/promptpay-qr | Auth: clinic admin |
        Response: { success, dataUrl: "data:image/png;base64,..." } |
        Errors: 404 (not found/wrong tenant), 422 (no promptpayId configured)
    - Note that amount is server-authoritative (read from invoice.totalAmount, not request body)
    - Note the two-step PromptPay UX: invoice creation → QR display → payment confirmation
  </action>
  <verify>
    <automated>cd D:/Development/AnimalClinic && grep -i "promptpay" docs/index.html | head -5</automated>
  </verify>
  <done>
    docs/index.html reflects Session C as complete with updated test count and roadmap history entry.
    docs/functional_spec_detailed.html documents the new GET /api/invoices/:id/promptpay-qr endpoint.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Browser → API (:id param) | Untrusted invoiceId from URL — must validate and scope to tenantId |
| JWT → tenantId | Extracted by authMiddleware; trusted after verification |
| DB invoice.totalAmount → QR amount | Server-authoritative; never read from request |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-SC-01 | Tampering | GET /:id/promptpay-qr — amount sourcing | mitigate | Amount read from prisma.invoice.totalAmount; no req.query/body.amount accepted |
| T-SC-02 | Information Disclosure | Cross-tenant invoice access | mitigate | prisma.invoice.findUnique({ where: { id: invoiceId, tenantId } }) — returns null if tenantId mismatch → 404 |
| T-SC-03 | Tampering | Numeric ID injection (NaN, negative, 0) | mitigate | Guard: if (!invoiceId \|\| invoiceId <= 0) throw 400 before any DB call |
| T-SC-04 | Spoofing | QR for voided/refunded invoice | mitigate | Guard: paymentStatus === 'void' or 'refunded' → 422 (enum values confirmed in schema.prisma) |
| T-SC-05 | Information Disclosure | promptpayId leakage to browser | accept | Service returns only the data URI; promptpayId is read in service layer and never serialised in response |
| T-SC-SC | Tampering | npm install promptpay-qr + qrcode | mitigate | RESEARCH.md Package Legitimacy Audit completed; both packages source-reviewed; no postinstall scripts; [ASSUMED] slopcheck — Task 1 checkpoint allows human review before proceeding |
</threat_model>

<verification>
Full session verification after all tasks complete:

1. cd src/backend && npm test — all tests pass, count higher than before Session C began
2. cd src/backend && npm run build — zero TypeScript errors
3. cd src/frontend && npx tsc --noEmit — zero TypeScript errors
4. grep -c "promptpay-qr" src/backend/routes/invoice.routes.ts — returns >= 1
5. grep -c "Phase 4" src/frontend/src/views/clinic/ClinicBilling.tsx — returns 0
   (the placeholder text is gone)
6. grep -c "pendingInvoiceId" src/frontend/src/views/clinic/ClinicBilling.tsx — returns >= 3
</verification>

<success_criteria>
1. GET /api/invoices/:id/promptpay-qr returns { success: true, dataUrl: "data:image/png;base64,..." }
   for a valid tenant-owned invoice with promptpayId configured (QR-05)
2. The same endpoint returns 404 when invoiceId belongs to a different tenant (QR-06)
3. The same endpoint returns 422 when promptpayId is not configured (QR-07)
4. ClinicBilling.tsx renders a real QR image after invoice creation — no static placeholder
5. Missing promptpayId → error message visible in the QR panel (not a broken img tag)
6. All backend tests pass (count higher than before Session C)
7. TypeScript compiles without errors in both src/backend and src/frontend
</success_criteria>

<output>
Create `.planning/phases/session-c-promptpay-qr/session-c-01-SUMMARY.md` when done.
</output>
