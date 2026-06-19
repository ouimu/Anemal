---
plan: 02C
phase: 2
wave: 2
depends_on: ["02A-PLAN.md"]
files_modified:
  - src/frontend/src/views/settings/PaymentPage.tsx
  - src/frontend/src/views/settings/index.ts
autonomous: true
requirements:
  - PAYMENT-01
  - PAYMENT-02
  - PAYMENT-03
  - UX-02
  - UX-03

must_haves:
  truths:
    - "PaymentPage renders a PromptPay ID text input"
    - "PaymentPage renders a QR image drag-and-drop zone with file-size guard (500KB)"
    - "QR preview renders below the upload control when paymentQrUrl is set"
    - "GB PrimePay section is visible but disabled with a 'Phase 4 — Not yet active' label"
    - "Saving calls PUT /api/v1/settings/clinic/payment and shows success banner"
    - "All interactive elements have min-h-[44px]"
    - "Page renders without horizontal scroll at 768px (max-w-2xl)"
    - "npx tsc --noEmit exits 0"
  artifacts:
    - path: "src/frontend/src/views/settings/PaymentPage.tsx"
      provides: "Payment settings form with PromptPay, QR upload, and GB PrimePay placeholder"
      exports: ["default PaymentPage"]
  key_links:
    - from: "PaymentPage"
      to: "useUpdatePayment"
      via: "useMutation — PUT /api/v1/settings/clinic/payment"
      pattern: "useUpdatePayment"
---

<objective>
Build the Payment settings page with three sections:
1. **PromptPay** — ID text input (PAYMENT-01)
2. **QR image upload** — drag-and-drop zone with preview (PAYMENT-02)
3. **GB PrimePay** — Public Key + Secret Key fields, disabled/placeholder (PAYMENT-03)

The QR upload follows the same FileReader/drag-and-drop pattern as the logo upload in
ClinicProfilePage. GB PrimePay fields are read-only stubs with a visual "Phase 4" badge.

This plan delivers ROADMAP Phase 2 success criterion 3: admin enters PromptPay ID + uploads
QR image → preview renders → saving persists both values.
</objective>

<execution_context>
@D:\Development\AnimalClinic\.planning\phases\01-settings-shell-clinic-profile\01C-PLAN.md
@D:\Development\AnimalClinic\.planning\ROADMAP.md
@D:\Development\AnimalClinic\.planning\REQUIREMENTS.md
</execution_context>

<context>
@D:\Development\AnimalClinic\.planning\phases\01-settings-shell-clinic-profile\01-RESEARCH.md

<interfaces>
<!-- Exact drag-and-drop upload pattern from ClinicProfilePage.tsx (Task 1 of 01C-PLAN.md) -->
<!-- PaymentPage QR upload MUST replicate this pattern — read ClinicProfilePage before implementing -->

File upload state + handlers (copy and adapt for QR):
  const qrRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  function handleQrChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 500_000) {
      setErrors(p => ({ ...p, paymentQrUrl: 'QR image must be under 500KB' }))
      return
    }
    const reader = new FileReader()
    reader.onload = ev => setForm(p => ({ ...p, paymentQrUrl: ev.target?.result as string }))
    reader.readAsDataURL(file)
  }

  function handleQrDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    if (file.size > 500_000) {
      setErrors(p => ({ ...p, paymentQrUrl: 'QR image must be under 500KB' }))
      return
    }
    const reader = new FileReader()
    reader.onload = ev => setForm(p => ({ ...p, paymentQrUrl: ev.target?.result as string }))
    reader.readAsDataURL(file)
  }

Upload zone JSX (adapt label text for QR; preview uses square 160×160 aspect-ratio-square):
  <div className="flex flex-col gap-sm">
    {/* Preview (shown when paymentQrUrl is set) */}
    {form.paymentQrUrl && (
      <div className="w-40 h-40 rounded-xl border border-outline-variant overflow-hidden bg-surface-container-low flex items-center justify-center">
        <img src={form.paymentQrUrl} alt="PromptPay QR preview" className="w-full h-full object-contain" />
      </div>
    )}
    {/* Drop zone */}
    <div
      onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleQrDrop}
      onClick={() => qrRef.current?.click()}
      className={`flex-1 min-h-[44px] border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-colors px-md py-sm gap-xs
        ${isDragging ? 'border-primary bg-surface-container-low' : 'border-outline-variant hover:border-primary'}`}
    >
      <MaterialIcon name="qr_code" size={20} className="text-on-surface-variant" />
      <span className="text-body-sm text-on-surface-variant text-center">Drag &amp; drop or click to upload PromptPay QR</span>
      <span className="text-label-md text-on-surface-variant">PNG, JPG — max 500KB</span>
    </div>
    <input ref={qrRef} type="file" accept="image/*" className="hidden" onChange={handleQrChange} />
    {errors.paymentQrUrl && <p className="text-label-md text-error">{errors.paymentQrUrl}</p>}
  </div>

GB PrimePay placeholder section:
  <div className="bg-surface rounded-2xl border border-outline-variant p-lg flex flex-col gap-md opacity-60">
    <div className="flex items-center justify-between">
      <h2 className="text-title-md font-medium text-on-surface">GB PrimePay</h2>
      <span className="text-label-md px-sm py-xs bg-surface-container-low border border-outline-variant rounded-lg text-on-surface-variant">
        Phase 4 — Not yet active
      </span>
    </div>
    <div className="flex flex-col gap-xs">
      <label className="text-label-md text-on-surface-variant">Public Key</label>
      <input disabled value={form.gbprimepayPublic} readOnly
        className="min-h-[44px] px-md border border-outline-variant rounded-xl text-body-md text-on-surface-variant bg-surface-container-low cursor-not-allowed w-full" />
    </div>
    <div className="flex flex-col gap-xs">
      <label className="text-label-md text-on-surface-variant">Secret Key</label>
      <input disabled type="password" value={form.gbprimepaySecret} readOnly
        className="min-h-[44px] px-md border border-outline-variant rounded-xl text-body-md text-on-surface-variant bg-surface-container-low cursor-not-allowed w-full" />
    </div>
  </div>

Standard input className (copy verbatim from Phase 1):
  "min-h-[44px] px-md border border-outline-variant rounded-xl text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary w-full"
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create PaymentPage.tsx</name>
  <files>src/frontend/src/views/settings/PaymentPage.tsx</files>

  <read_first>
    - src/frontend/src/views/settings/ClinicProfilePage.tsx — read full file; copy loading/save/banner patterns and the full drag-and-drop upload pattern from the logo section
    - src/frontend/src/hooks/usePaymentSettings.ts — confirm hook names and PaymentInput interface
    - src/frontend/src/store/authStore.ts — confirm userId
    - src/frontend/src/components/MaterialIcon.tsx — confirm props
  </read_first>

  <action>
Create `src/frontend/src/views/settings/PaymentPage.tsx`.

**State:**
```typescript
interface PaymentForm {
  promptpayId:      string
  paymentQrUrl:     string
  gbprimepayPublic: string
  gbprimepaySecret: string
}
const [form, setForm] = useState<PaymentForm>({
  promptpayId: '', paymentQrUrl: '', gbprimepayPublic: '', gbprimepaySecret: '',
})
const [errors, setErrors] = useState<Record<string, string>>({})
const [saved, setSaved] = useState(false)
const [isDragging, setIsDragging] = useState(false)
const qrRef = useRef<HTMLInputElement>(null)
```

**Form sync from API** (useEffect on [data]):
```typescript
useEffect(() => {
  if (!data) return
  setForm({
    promptpayId:      data.promptpayId      ?? '',
    paymentQrUrl:     data.paymentQrUrl     ?? '',
    gbprimepayPublic: data.gbprimepayPublic ?? '',
    gbprimepaySecret: data.gbprimepaySecret ?? '',
  })
}, [data])
```

**Validation:**
```typescript
function validate(): boolean {
  const e: Record<string, string> = {}
  if (form.promptpayId && !/^(\d{10}|\d{13})$/.test(form.promptpayId))
    e.promptpayId = 'PromptPay ID must be 10 digits (phone) or 13 digits (tax ID)'
  setErrors(e)
  return Object.keys(e).length === 0
}
```

**Save handler:**
```typescript
async function handleSave(e: React.FormEvent) {
  e.preventDefault()
  if (!validate()) return
  try {
    await update.mutateAsync({
      promptpayId:      form.promptpayId      || undefined,
      paymentQrUrl:     form.paymentQrUrl     || undefined,
      gbprimepayPublic: form.gbprimepayPublic || undefined,
      gbprimepaySecret: form.gbprimepaySecret || undefined,
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  } catch { /* error shown via update.error */ }
}
```

**File handlers** — copy verbatim from the interface section above (`handleQrChange`, `handleQrDrop`).

**Page structure:**
```tsx
<form onSubmit={handleSave} className="max-w-2xl mx-auto p-xl flex flex-col gap-lg">
  <h1 className="text-headline-md font-headline text-on-surface">Payment</h1>
  {saved && /* success banner */}
  {update.error && /* error banner */}

  {/* PromptPay section */}
  <div className="bg-surface rounded-2xl border border-outline-variant p-lg flex flex-col gap-md">
    <h2 className="text-title-md font-medium text-on-surface">PromptPay</h2>
    <div className="flex flex-col gap-xs">
      <label className="text-label-md text-on-surface-variant">PromptPay ID</label>
      <input
        type="text"
        value={form.promptpayId}
        onChange={e => setForm(p => ({ ...p, promptpayId: e.target.value }))}
        placeholder="Phone number (10 digits) or Tax ID (13 digits)"
        className="min-h-[44px] px-md border border-outline-variant rounded-xl text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary w-full"
      />
      {errors.promptpayId && <p className="text-label-md text-error">{errors.promptpayId}</p>}
    </div>
  </div>

  {/* QR Image section */}
  <div className="bg-surface rounded-2xl border border-outline-variant p-lg flex flex-col gap-md">
    <h2 className="text-title-md font-medium text-on-surface">PromptPay QR Image</h2>
    {/* QR upload zone from interface section — see above */}
  </div>

  {/* GB PrimePay placeholder section — copy from interface section above */}

  {/* sticky save bar */}
</form>
```

**Required imports:**
```typescript
import React, { useState, useEffect, useRef } from 'react'
import MaterialIcon from '../../components/MaterialIcon'
import { useAuthStore } from '../../store/authStore'
import { usePaymentSettings, useUpdatePayment } from '../../hooks/usePaymentSettings'
```

Type rules: No `any`. No raw hex. No emoji in JSX. All inputs `min-h-[44px]`. GB PrimePay inputs `disabled` + `readOnly`.
Export `default function PaymentPage`.
  </action>

  <verify>
    <automated>cd D:\Development\AnimalClinic\src\frontend && npx tsc --noEmit 2>&1 | head -30</automated>
  </verify>

  <acceptance_criteria>
    - File exists; exports `default PaymentPage`
    - PromptPay ID input present with `min-h-[44px]` and validation error display (PAYMENT-01)
    - QR upload zone present: drag events wired, click-to-browse via `qrRef`, 500KB guard, FileReader preview (PAYMENT-02)
    - QR preview `<img>` renders below upload zone when `form.paymentQrUrl` is set (PAYMENT-02)
    - GB PrimePay section present with `disabled` inputs and "Phase 4 — Not yet active" badge (PAYMENT-03)
    - Save calls `update.mutateAsync(...)` and shows success banner
    - Sticky save bar with "Last updated" timestamp
    - `max-w-2xl` container for 768px compliance (UX-03)
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>

  <done>PaymentPage renders PromptPay ID input, QR drag-and-drop upload with preview, and GB PrimePay placeholder section; wired to PUT /api/v1/settings/clinic/payment.</done>
</task>

<task type="auto">
  <name>Task 2: Add PaymentPage barrel export to views/settings/index.ts</name>
  <files>src/frontend/src/views/settings/index.ts</files>

  <read_first>
    - src/frontend/src/views/settings/index.ts — read current state (may have been updated by 02B)
  </read_first>

  <action>
Ensure the following export is present in `src/frontend/src/views/settings/index.ts`:

```typescript
export { default as PaymentPage } from './PaymentPage'
```

If the file already contains this export (because 02B was run first), do not add a duplicate.
Do NOT remove any existing exports.
  </action>

  <verify>
    <automated>cd D:\Development\AnimalClinic\src\frontend && npx tsc --noEmit 2>&1 | head -10</automated>
  </verify>

  <acceptance_criteria>
    - `export { default as PaymentPage }` present exactly once
    - All other exports unchanged
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>

  <done>PaymentPage exported from settings barrel.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Browser → QR upload | File stays in browser memory as base64 DataURL; no server upload until save |
| GB PrimePay fields | Disabled inputs cannot be submitted by the user; actual keys are Phase 4 work |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02C-01 | Tampering | User bypasses disabled GB PrimePay inputs via DevTools | accept | Backend Zod `paymentSchema` validates and sanitizes; gbprimepaySecret is encrypted at service layer; no unauthorized access |
| T-02C-02 | Information Disclosure | Base64 QR image stored in form state (large memory) | accept | QR images are small static images (< 500KB); no PHI/PII involved; cleared on component unmount |
| T-02C-03 | Tampering | Oversized QR image bypasses 500KB guard | mitigate | `file.size > 500_000` guard in both `handleQrChange` and `handleQrDrop`; backend validates paymentQrUrl is a URL format |
</threat_model>

<verification>
Manual verification steps after execution:

1. Start frontend dev server: `cd src/frontend && npm run dev`
2. Log in as `admin` → navigate to `/settings/payment`
3. Confirm page renders: PromptPay section, QR Image section, GB PrimePay section
4. Enter "0812345678" in PromptPay ID → save → refresh → value persists
5. Enter "081" → save attempt → inline validation error appears (not submitted)
6. Drag a PNG image onto the QR drop zone → preview renders below the zone
7. Try dragging an image > 500KB → inline error "QR image must be under 500KB" appears
8. Confirm GB PrimePay fields are visually grayed out and not editable; "Phase 4 — Not yet active" badge visible
9. Save with PromptPay ID + QR → success banner → refresh → both values persisted
10. Page renders without horizontal scroll at 768px
</verification>

<success_criteria>
- `src/frontend/src/views/settings/PaymentPage.tsx` exists with all three sections
- `src/frontend/src/views/settings/index.ts` exports PaymentPage
- ROADMAP success criterion 3: PromptPay ID + QR persists after refresh; QR preview renders
- `npx tsc --noEmit` exits 0
- No raw hex colors, no emoji, no `any` types in PaymentPage.tsx
</success_criteria>

<output>
Create `.planning/phases/02-operational-settings-pages/02C-SUMMARY.md` when done.
</output>
