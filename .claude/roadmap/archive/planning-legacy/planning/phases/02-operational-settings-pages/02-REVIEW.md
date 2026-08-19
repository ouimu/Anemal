---
phase: 02-operational-settings-pages
reviewed: 2026-06-11T07:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - src/frontend/src/App.tsx
  - src/frontend/src/hooks/useClinicSettings.ts
  - src/frontend/src/hooks/useNotificationsSettings.ts
  - src/frontend/src/hooks/useOperatingHoursSettings.ts
  - src/frontend/src/hooks/usePaymentSettings.ts
  - src/frontend/src/views/settings/NotificationsPage.tsx
  - src/frontend/src/views/settings/OperatingHoursPage.tsx
  - src/frontend/src/views/settings/PaymentPage.tsx
  - src/frontend/src/views/settings/index.ts
findings:
  critical: 3
  warning: 5
  info: 3
  total: 11
status: fixed
---

# Phase 2: Code Review Report

**Reviewed:** 2026-06-11T07:00:00Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Reviewed 9 source files covering the operational settings pages (OperatingHours, Notifications, Payment) and their supporting hooks. React Query cache key discipline is consistent across all hooks. The design token usage and minimum tap-target sizes are correctly applied throughout.

Three critical issues were found: masked secret values are submitted without client-side guard in NotificationsPage, a MIME type check is absent from the file-input `onChange` path in PaymentPage (creating an asymmetry with the `onDrop` path that does check MIME), and the `gbprimepaySecret` mask value bypasses the `|| undefined` strip guard. Five warnings cover missing time-input labels, a non-keyboard-accessible drop zone, absent close-before-open validation, unsafe error casting in catch blocks, and stale QR error state after a valid re-upload.

---

## Critical Issues

### CR-01: Masked secret values sent to backend without client-side guard — NotificationsPage

**File:** `src/frontend/src/views/settings/NotificationsPage.tsx:73`

**Issue:** `handleSave` submits the entire `form` object to `useUpdateNotifications` without filtering masked values. When the API returns `lineOaToken` or `smsApiKey` as `••••xxxx`, `useEffect` at line 47–54 populates the form with those masked strings. If the user saves without touching those fields, the masked values are transmitted to the backend. The project spec states the backend ignores values starting with `••••` (echo protection lives server-side), but the client is expected to strip them to avoid any ambiguity and to prevent accidental overwrite if the backend guard is ever relaxed or bypassed.

**Fix:**
```ts
async function handleSave(e: React.FormEvent) {
  e.preventDefault()
  const MASK_PREFIX = '••••'  // ••••
  const payload: NotificationsInput = {
    lineRemindersEnabled: form.lineRemindersEnabled,
    smsProvider:          form.smsProvider,
    smsSenderName:        form.smsSenderName,
    smsRemindersEnabled:  form.smsRemindersEnabled,
  }
  if (!form.lineOaToken.startsWith(MASK_PREFIX))  payload.lineOaToken = form.lineOaToken
  if (!form.smsApiKey.startsWith(MASK_PREFIX))    payload.smsApiKey   = form.smsApiKey
  try {
    await update.mutateAsync(payload)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  } catch {
    // error displayed via update.error
  }
}
```

---

### CR-02: `gbprimepaySecret` mask value bypasses `|| undefined` guard — PaymentPage

**File:** `src/frontend/src/views/settings/PaymentPage.tsx:74-79`

**Issue:** `handleSave` strips empty strings via `field || undefined`, but a masked value like `••••xxxx` is a non-empty truthy string and is therefore sent as-is to the backend. `gbprimepaySecret` (and `gbprimepayPublic`) are loaded from the API response into the form at line 32. Although the GB PrimePay section is currently `disabled`/`readOnly` and marked "Phase 4 — Not yet active", the fields are still included in the `mutateAsync` payload. When Phase 4 activates these fields, the mask-bypass bug will silently overwrite stored secrets.

**Fix:**
```ts
const MASK_PREFIX = '••••'
function stripMask(v: string): string | undefined {
  if (!v || v.startsWith(MASK_PREFIX)) return undefined
  return v
}

await update.mutateAsync({
  promptpayId:      form.promptpayId      || undefined,
  paymentQrUrl:     form.paymentQrUrl     || undefined,
  gbprimepayPublic: stripMask(form.gbprimepayPublic),
  gbprimepaySecret: stripMask(form.gbprimepaySecret),
})
```

---

### CR-03: MIME type not checked in `handleQrChange` — PaymentPage

**File:** `src/frontend/src/views/settings/PaymentPage.tsx:36-46`

**Issue:** `handleQrDrop` (line 52) correctly rejects non-image files with `!file.type.startsWith('image/')`, but `handleQrChange` (line 36) only checks file size and has no MIME type guard. A user (or a script targeting the input directly) can select a non-image file via the file picker. The `accept="image/*"` attribute on the `<input>` (line 160) is a UI hint only and is trivially bypassed. The file's bytes will be base64-encoded and stored in `paymentQrUrl`, potentially sending binary garbage or a crafted payload to the backend.

**Fix:**
```ts
function handleQrChange(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0]
  if (!file) return
  if (!file.type.startsWith('image/')) {
    setErrors(p => ({ ...p, paymentQrUrl: 'Only image files are accepted' }))
    return
  }
  if (file.size > 500_000) {
    setErrors(p => ({ ...p, paymentQrUrl: 'QR image must be under 500KB' }))
    return
  }
  setErrors(p => ({ ...p, paymentQrUrl: '' }))
  const reader = new FileReader()
  reader.onload = ev => {
    if (ev.target?.result) {
      setForm(p => ({ ...p, paymentQrUrl: ev.target!.result as string }))
    }
  }
  reader.readAsDataURL(file)
}
```

---

## Warnings

### WR-01: Time inputs have no accessible label — OperatingHoursPage

**File:** `src/frontend/src/views/settings/OperatingHoursPage.tsx:127-138`

**Issue:** The open-time and close-time `<input type="time">` elements rendered per day row have no `aria-label`, `aria-labelledby`, or associated `<label>`. Screen readers announce them as unlabelled controls. The day name is displayed as a `<span>` nearby but is not programmatically linked.

**Fix:** Add `aria-label` to each time input:
```tsx
<input
  type="time"
  value={hours[k].open}
  onChange={e => setHours(p => ({ ...p, [k]: { ...p[k], open: e.target.value } }))}
  aria-label={`${DAY_LABELS[k]} opening time`}
  className="..."
/>
<input
  type="time"
  value={hours[k].close}
  onChange={e => setHours(p => ({ ...p, [k]: { ...p[k], close: e.target.value } }))}
  aria-label={`${DAY_LABELS[k]} closing time`}
  className="..."
/>
```

---

### WR-02: QR drop zone is not keyboard-accessible — PaymentPage

**File:** `src/frontend/src/views/settings/PaymentPage.tsx:148-159`

**Issue:** The drop zone is a `<div>` with `onClick` and drag event handlers but no `role`, `tabIndex`, or `onKeyDown`. Keyboard-only users cannot reach or activate it. This violates WCAG 2.1 SC 2.1.1 and the project's tablet touch-first accessibility rules.

**Fix:**
```tsx
<div
  role="button"
  tabIndex={0}
  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') qrRef.current?.click() }}
  onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
  onDragLeave={() => setIsDragging(false)}
  onDrop={handleQrDrop}
  onClick={() => qrRef.current?.click()}
  aria-label="Upload PromptPay QR image"
  className="..."
>
```

---

### WR-03: No validation that closing time is after opening time — OperatingHoursPage

**File:** `src/frontend/src/views/settings/OperatingHoursPage.tsx:55-70`

**Issue:** `handleSave` builds the `operatingHours` payload from the raw `hours` state without checking that `close > open` for each enabled day. A user can save `open: 18:00, close: 09:00`. The API will accept this, and downstream scheduling logic may silently malfunction (no appointments can be booked, or the window wraps midnight incorrectly).

**Fix:** Add validation before calling `mutateAsync`:
```ts
for (const k of DAY_KEYS) {
  if (hours[k].enabled && hours[k].close <= hours[k].open) {
    // surface an error state — e.g. setError(`${DAY_LABELS[k]}: closing time must be after opening time`)
    return
  }
}
```

---

### WR-04: Unsafe cast of unknown catch value in handleTest — NotificationsPage

**File:** `src/frontend/src/views/settings/NotificationsPage.tsx:64`

**Issue:** `catch (e)` types `e` as `unknown` in strict TypeScript. The cast `(e as Error).message` is unsafe — if the thrown value is a string, a network error object, or an Axios error with a nested `response`, `.message` may be undefined or misleading. The same pattern appears in the error banners that cast `update.error as Error` at lines 114 and `OperatingHoursPage.tsx:99`, `PaymentPage.tsx:114`, though TanStack Query types `error` as `Error | null` in v5 so those casts are lower risk.

**Fix:**
```ts
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e)
  setTestResult({ channel, status: 'error', message: msg })
}
```

---

### WR-05: QR upload error not cleared on successful re-upload — PaymentPage

**File:** `src/frontend/src/views/settings/PaymentPage.tsx:36-46`

**Issue:** When a user uploads an oversized file, `errors.paymentQrUrl` is set. If they then upload a valid file, `handleQrChange` does not call `setErrors` to clear the previous error. The error message persists on screen until the next `validate()` call (i.e., on form submit). The `validate()` function at line 63 resets the whole error object but does not check `paymentQrUrl`, so the QR error is cleared on any submit attempt regardless of the QR state — this is an accidental fix that hides the symptom without correctly tracking QR validity.

**Fix:** Call `setErrors(p => ({ ...p, paymentQrUrl: '' }))` at the start of a successful `handleQrChange` path (shown in the CR-03 fix above).

---

## Info

### IN-01: Identical `queryFn` duplicated across four hooks

**Files:**
- `src/frontend/src/hooks/useClinicSettings.ts:50`
- `src/frontend/src/hooks/useNotificationsSettings.ts:27`
- `src/frontend/src/hooks/useOperatingHoursSettings.ts:12`
- `src/frontend/src/hooks/usePaymentSettings.ts:15`

**Issue:** All four hooks define an identical `queryFn: () => api.get('/api/v1/settings/clinic').then(r => r.data.data)`. React Query deduplicates requests by key so there is no runtime harm, but the duplication means a future API path change requires updates in four places.

**Fix:** Extract a shared constant in `useClinicSettings.ts` and import it:
```ts
// useClinicSettings.ts
export const clinicSettingsQueryFn = () =>
  api.get('/api/v1/settings/clinic').then(r => r.data.data as ClinicSettingsData)

// other hooks
import { clinicSettingsQueryFn } from './useClinicSettings'
queryFn: clinicSettingsQueryFn,
```

---

### IN-02: No `ErrorBoundary` around lazy-loaded routes — App.tsx

**File:** `src/frontend/src/App.tsx:46`

**Issue:** All routes are wrapped in `<Suspense>` for loading states, but there is no React `ErrorBoundary`. If a lazy-loaded chunk fails to fetch (network failure, CDN error, deploy with cache-busted filenames), React throws an unhandled error that crashes the entire application with a blank screen. An `ErrorBoundary` with a fallback UI would contain the failure to the affected route.

**Fix:** Wrap `<Suspense>` with an `ErrorBoundary` (e.g. `react-error-boundary` package or a custom class component):
```tsx
import { ErrorBoundary } from 'react-error-boundary'

<ErrorBoundary fallback={<div className="p-xl text-error">Failed to load page. Please refresh.</div>}>
  <Suspense fallback={<Loader/>}>
    <Routes>...</Routes>
  </Suspense>
</ErrorBoundary>
```

---

### IN-03: `useTestNotifications` result cast without runtime validation

**File:** `src/frontend/src/hooks/useNotificationsSettings.ts:43`

**Issue:** `r.data.data as NotificationsTestResult` is a bare TypeScript cast — the runtime shape is never validated. If the API returns an unexpected shape (e.g. missing `message` field), `testResult.message` in `NotificationsPage.tsx` line 128 renders `undefined` silently.

**Fix:** Either use a Zod schema parse or add a minimal runtime guard:
```ts
const raw = r.data.data
if (!raw || typeof raw.status !== 'string' || typeof raw.message !== 'string') {
  throw new Error('Unexpected response from notifications test endpoint')
}
return raw as NotificationsTestResult
```

---

_Reviewed: 2026-06-11T07:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
