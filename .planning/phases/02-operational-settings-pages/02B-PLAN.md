---
plan: 02B
phase: 2
wave: 2
depends_on: ["02A-PLAN.md"]
files_modified:
  - src/frontend/src/views/settings/OperatingHoursPage.tsx
  - src/frontend/src/views/settings/NotificationsPage.tsx
  - src/frontend/src/views/settings/index.ts
autonomous: true
requirements:
  - HOURS-01
  - HOURS-02
  - HOURS-03
  - NOTIF-01
  - NOTIF-02
  - NOTIF-03
  - NOTIF-04
  - NOTIF-05
  - UX-01
  - UX-02
  - UX-03

must_haves:
  truths:
    - "OperatingHoursPage renders 7 day rows; each row has a toggle (min-h-[44px]) and day label"
    - "Toggling a day on shows two time inputs; toggling off shows Closed label and hides inputs"
    - "Saving operating hours calls PUT /api/v1/settings/clinic/hours with correct operatingHours map"
    - "Success banner appears after save; sticky save bar shows Last updated timestamp"
    - "NotificationsPage renders warning banner: 'API keys are encrypted before storage'"
    - "LINE OA token field shows masked value from API; eye icon toggles type=password/text"
    - "Saving unchanged masked value (starting with ••••) does NOT result in a different masked value on reload"
    - "SMS provider select renders thaibulksms/thsms/Disabled options"
    - "Test LINE and Test SMS buttons call POST /api/v1/settings/clinic/notifications/test"
    - "Test result displays inline (check_circle green or error red) without navigating away"
    - "All interactive elements on both pages have min-h-[44px]"
    - "Both pages render without horizontal scroll at 768px (max-w-2xl container)"
    - "npx tsc --noEmit exits 0 on all new files"
  artifacts:
    - path: "src/frontend/src/views/settings/OperatingHoursPage.tsx"
      provides: "Operating hours form with day toggles and time pickers"
      exports: ["default OperatingHoursPage"]
    - path: "src/frontend/src/views/settings/NotificationsPage.tsx"
      provides: "Notifications form with masked token fields, reveal toggle, test buttons"
      exports: ["default NotificationsPage"]
  key_links:
    - from: "OperatingHoursPage"
      to: "useUpdateOperatingHours"
      via: "useMutation — PUT /api/v1/settings/clinic/hours"
      pattern: "useUpdateOperatingHours"
    - from: "NotificationsPage"
      to: "useUpdateNotifications"
      via: "useMutation — PUT /api/v1/settings/clinic/notifications"
      pattern: "useUpdateNotifications"
    - from: "NotificationsPage"
      to: "useTestNotifications"
      via: "useMutation — POST /api/v1/settings/clinic/notifications/test"
      pattern: "useTestNotifications"
---

<objective>
Build two settings pages:
1. **OperatingHoursPage** — 7 day rows with toggle + time pickers wired to the hours API
2. **NotificationsPage** — LINE OA + SMS sections with masked secret fields, reveal toggle, test buttons, and encryption warning banner

Both pages follow ClinicProfilePage patterns exactly: useEffect form sync, validate-on-submit,
inline success/error banners, sticky save bar. This plan delivers ROADMAP success criteria 1
(hours persist after refresh) and 2 (LINE token masking + reveal + save-without-overwrite).
</objective>

<execution_context>
@D:\Development\AnimalClinic\.planning\phases\01-settings-shell-clinic-profile\01B-PLAN.md
@D:\Development\AnimalClinic\.planning\ROADMAP.md
@D:\Development\AnimalClinic\.planning\REQUIREMENTS.md
</execution_context>

<context>
@D:\Development\AnimalClinic\.planning\phases\01-settings-shell-clinic-profile\01-RESEARCH.md

<interfaces>
<!-- Exact patterns from src/frontend/src/views/settings/ClinicProfilePage.tsx -->
<!-- Both pages MUST replicate these patterns — read ClinicProfilePage before implementing -->

Loading state (copy verbatim):
  if (isLoading) return (
    <div className="p-xl flex items-center gap-sm text-on-surface-variant">
      <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      <span className="text-body-md">Loading…</span>
    </div>
  )

Sticky save bar (copy verbatim, adjust timestamp label):
  <div className="sticky bottom-0 bg-background pt-sm pb-md flex items-center justify-between border-t border-outline-variant">
    <p className="text-label-md text-on-surface-variant">
      {lastUpdated ? `Last updated: ${lastUpdated}${byYou ? ' · by you' : ''}` : 'Never saved'}
    </p>
    <button type="submit" disabled={update.isPending}
      className="min-h-[44px] min-w-[44px] px-xl bg-primary text-surface rounded-xl text-body-md font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
      {update.isPending ? 'Saving…' : 'Save Changes'}
    </button>
  </div>

Success banner (copy verbatim):
  {saved && (
    <div className="mb-md px-md py-sm bg-surface-container-low border border-outline-variant rounded-xl text-body-md text-secondary flex items-center gap-sm">
      <MaterialIcon name="check_circle" size={18} />
      Changes saved successfully
    </div>
  )}

Error banner (copy verbatim):
  {update.error && (
    <div className="mb-md px-md py-sm bg-error/10 border border-error/30 rounded-xl text-body-md text-error">
      Failed to save: {(update.error as Error).message}
    </div>
  )}

handleSave pattern (copy verbatim):
  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    try {
      await update.mutateAsync(payload)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch { /* error shown via update.error */ }
  }

Standard input className (copy verbatim):
  "min-h-[44px] px-md border border-outline-variant rounded-xl text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary w-full"

lastUpdated / byYou pattern (copy verbatim):
  const lastUpdated = data?.updatedAt
    ? new Date(data.updatedAt).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
    : null
  const byYou = data?.updatedBy != null && data.updatedBy === userId

From useAuthStore:
  const userId = useAuthStore(s => s.userId)  // number | null
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create OperatingHoursPage.tsx</name>
  <files>src/frontend/src/views/settings/OperatingHoursPage.tsx</files>

  <read_first>
    - src/frontend/src/views/settings/ClinicProfilePage.tsx — read full file; copy loading/save/banner patterns verbatim
    - src/frontend/src/hooks/useOperatingHoursSettings.ts — confirm exported types and hook names
    - src/frontend/src/store/authStore.ts — confirm userId field name
    - src/frontend/src/components/MaterialIcon.tsx — confirm props
  </read_first>

  <action>
Create `src/frontend/src/views/settings/OperatingHoursPage.tsx`.

**State:**
```typescript
type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
interface DayState { enabled: boolean; open: string; close: string }

const DAY_LABELS: Record<DayKey, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
  fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
}
const DAY_KEYS: DayKey[] = ['mon','tue','wed','thu','fri','sat','sun']
const DEFAULT_DAY: DayState = { enabled: false, open: '09:00', close: '18:00' }

const [hours, setHours] = useState<Record<DayKey, DayState>>(() =>
  Object.fromEntries(DAY_KEYS.map(k => [k, { ...DEFAULT_DAY }])) as Record<DayKey, DayState>
)
const [saved, setSaved] = useState(false)
```

**Form sync from API** (useEffect on [data]):
```typescript
useEffect(() => {
  if (!data?.operatingHours) return
  const oh = data.operatingHours
  setHours(prev => {
    const next = { ...prev }
    for (const k of DAY_KEYS) {
      const day = oh[k]
      next[k] = day
        ? { enabled: true, open: day.open, close: day.close }
        : { enabled: false, open: prev[k].open || '09:00', close: prev[k].close || '18:00' }
    }
    return next
  })
}, [data])
```

**Save handler:**
```typescript
async function handleSave(e: React.FormEvent) {
  e.preventDefault()
  const operatingHours = Object.fromEntries(
    DAY_KEYS.map(k => [k, hours[k].enabled ? { open: hours[k].open, close: hours[k].close } : null])
  ) as OperatingHoursMap
  try {
    await update.mutateAsync({ operatingHours })
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  } catch { /* error shown via update.error */ }
}
```

**Day row UI** (7 rows, map over DAY_KEYS):
```tsx
{DAY_KEYS.map(k => (
  <div key={k} className="flex items-center gap-md py-sm border-b border-outline-variant last:border-0">
    {/* Toggle button — acts as a checkbox */}
    <button
      type="button"
      onClick={() => setHours(p => ({ ...p, [k]: { ...p[k], enabled: !p[k].enabled } }))}
      className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl transition-colors
        ${hours[k].enabled ? 'bg-primary text-surface' : 'bg-surface-container-low text-on-surface-variant border border-outline-variant'}`}
      aria-label={`Toggle ${DAY_LABELS[k]}`}
      aria-pressed={hours[k].enabled}
    >
      <MaterialIcon name={hours[k].enabled ? 'toggle_on' : 'toggle_off'} size={24} />
    </button>

    {/* Day label */}
    <span className="w-28 text-body-md text-on-surface font-medium">{DAY_LABELS[k]}</span>

    {/* Time inputs (visible when enabled) */}
    {hours[k].enabled ? (
      <div className="flex items-center gap-sm flex-1">
        <input
          type="time"
          value={hours[k].open}
          onChange={e => setHours(p => ({ ...p, [k]: { ...p[k], open: e.target.value } }))}
          className="min-h-[44px] px-md border border-outline-variant rounded-xl text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary"
        />
        <span className="text-body-md text-on-surface-variant">to</span>
        <input
          type="time"
          value={hours[k].close}
          onChange={e => setHours(p => ({ ...p, [k]: { ...p[k], close: e.target.value } }))}
          className="min-h-[44px] px-md border border-outline-variant rounded-xl text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary"
        />
      </div>
    ) : (
      <span className="text-body-md text-on-surface-variant">Closed</span>
    )}
  </div>
))}
```

**Page wrapper:**
```tsx
<form onSubmit={handleSave} className="max-w-2xl mx-auto p-xl flex flex-col gap-lg">
  <h1 className="text-headline-md font-headline text-on-surface">Operating Hours</h1>
  {saved && /* success banner */}
  {update.error && /* error banner */}
  <div className="bg-surface rounded-2xl border border-outline-variant p-lg flex flex-col">
    {/* 7 day rows */}
  </div>
  {/* sticky save bar */}
</form>
```

**Required imports:**
```typescript
import React, { useState, useEffect } from 'react'
import MaterialIcon from '../../components/MaterialIcon'
import { useAuthStore } from '../../store/authStore'
import { useOperatingHours, useUpdateOperatingHours, type DayKey, type OperatingHoursMap } from '../../hooks/useOperatingHoursSettings'
```

Type rules: No `any`. No raw hex. No emoji. All toggle buttons and time inputs `min-h-[44px]`.
Export `default function OperatingHoursPage`.
  </action>

  <verify>
    <automated>cd D:\Development\AnimalClinic\src\frontend && npx tsc --noEmit 2>&1 | head -30</automated>
  </verify>

  <acceptance_criteria>
    - File exists; exports `default OperatingHoursPage`
    - 7 day rows rendered (DAY_KEYS.map)
    - Toggle button has `min-h-[44px] min-w-[44px]` and `aria-pressed`
    - Time inputs have `min-h-[44px]` and `type="time"`
    - Disabled days show "Closed" label, not time inputs
    - `handleSave` builds `operatingHours` map (null for disabled days) and calls `update.mutateAsync`
    - Sticky save bar present with "Last updated" footer
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>

  <done>OperatingHoursPage renders 7 day toggles + time pickers wired to PUT /api/v1/settings/clinic/hours; success and error banners follow Phase 1 pattern.</done>
</task>

<task type="auto">
  <name>Task 2: Create NotificationsPage.tsx</name>
  <files>src/frontend/src/views/settings/NotificationsPage.tsx</files>

  <read_first>
    - src/frontend/src/views/settings/ClinicProfilePage.tsx — read full file; copy loading/save/banner patterns verbatim
    - src/frontend/src/hooks/useNotificationsSettings.ts — confirm all exported hook names and interfaces
    - src/frontend/src/views/LoginView.tsx — check existing password visibility toggle pattern
    - src/frontend/src/store/authStore.ts — confirm userId
    - src/frontend/src/components/MaterialIcon.tsx — confirm props
  </read_first>

  <action>
Create `src/frontend/src/views/settings/NotificationsPage.tsx`.

**State:**
```typescript
interface NotificationsForm {
  lineOaToken:          string
  lineRemindersEnabled: boolean
  smsProvider:          'thaibulksms' | 'thsms' | ''
  smsApiKey:            string
  smsSenderName:        string
  smsRemindersEnabled:  boolean
}
const EMPTY_FORM: NotificationsForm = {
  lineOaToken: '', lineRemindersEnabled: false,
  smsProvider: '', smsApiKey: '', smsSenderName: '', smsRemindersEnabled: false,
}
const [form, setForm] = useState<NotificationsForm>(EMPTY_FORM)
const [saved, setSaved] = useState(false)
const [showLineToken, setShowLineToken] = useState(false)
const [showSmsApiKey, setShowSmsApiKey] = useState(false)
const [testResult, setTestResult] = useState<{ channel: 'line'|'sms'; status: string; message: string } | null>(null)
const [testLoading, setTestLoading] = useState<'line'|'sms'|null>(null)
```

**Form sync from API** (useEffect on [data]):
```typescript
useEffect(() => {
  if (!data) return
  setForm({
    lineOaToken:          data.lineOaToken          ?? '',
    lineRemindersEnabled: data.lineRemindersEnabled ?? false,
    smsProvider:          (data.smsProvider         ?? '') as 'thaibulksms'|'thsms'|'',
    smsApiKey:            data.smsApiKey            ?? '',
    smsSenderName:        data.smsSenderName         ?? '',
    smsRemindersEnabled:  data.smsRemindersEnabled  ?? false,
  })
}, [data])
```

**Test handler:**
```typescript
async function handleTest(channel: 'line' | 'sms') {
  setTestLoading(channel)
  setTestResult(null)
  try {
    const res = await testNotifications.mutateAsync({ channel })
    setTestResult({ channel, status: res.status, message: res.message })
  } catch (e) {
    setTestResult({ channel, status: 'error', message: (e as Error).message })
  } finally {
    setTestLoading(null)
  }
}
```

**Save handler** (same pattern as ClinicProfilePage; no extra validation needed):
```typescript
async function handleSave(e: React.FormEvent) {
  e.preventDefault()
  try {
    await update.mutateAsync(form)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  } catch { /* error shown via update.error */ }
}
```

**Masked field component pattern** (inline, not extracted):
```tsx
{/* LINE OA Token field */}
<div className="flex flex-col gap-xs">
  <label className="text-label-md text-on-surface-variant">LINE OA Channel Access Token</label>
  <div className="relative">
    <input
      type={showLineToken ? 'text' : 'password'}
      value={form.lineOaToken}
      onChange={e => setForm(p => ({ ...p, lineOaToken: e.target.value }))}
      placeholder="Paste your LINE OA token"
      className="min-h-[44px] px-md pr-14 border border-outline-variant rounded-xl text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary w-full"
    />
    <button
      type="button"
      onClick={() => setShowLineToken(v => !v)}
      className="absolute right-0 top-0 h-full min-w-[44px] flex items-center justify-center text-on-surface-variant hover:text-on-surface"
      aria-label={showLineToken ? 'Hide token' : 'Show token'}
    >
      <MaterialIcon name={showLineToken ? 'visibility_off' : 'visibility'} size={20} />
    </button>
  </div>
</div>
```

Apply the same pattern for `smsApiKey` / `showSmsApiKey`.

**Warning banner (NOTIF-05)** — place at the top of the form, above all sections:
```tsx
<div className="px-md py-sm bg-surface-container-low border border-outline-variant rounded-xl text-body-md text-on-surface flex items-center gap-sm">
  <MaterialIcon name="lock" size={18} />
  API keys are encrypted before storage
</div>
```

**Test result banner:**
```tsx
{testResult && (
  <div className={`px-md py-sm rounded-xl text-body-md flex items-center gap-sm border
    ${testResult.status === 'success'
      ? 'bg-surface-container-low border-outline-variant text-secondary'
      : 'bg-error/10 border-error/30 text-error'}`}>
    <MaterialIcon name={testResult.status === 'success' ? 'check_circle' : 'error'} size={18} />
    {testResult.channel === 'line' ? 'LINE' : 'SMS'}: {testResult.message}
  </div>
)}
```

**SMS Provider select:**
```tsx
<select
  value={form.smsProvider}
  onChange={e => setForm(p => ({ ...p, smsProvider: e.target.value as 'thaibulksms'|'thsms'|'' }))}
  className="min-h-[44px] px-md border border-outline-variant rounded-xl text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary w-full"
>
  <option value="">Disabled</option>
  <option value="thaibulksms">ThaiBulkSMS</option>
  <option value="thsms">THSMS</option>
</select>
```

**Test buttons** (place inside each section, after the fields):
```tsx
<button
  type="button"
  onClick={() => handleTest('line')}
  disabled={testLoading === 'line'}
  className="min-h-[44px] min-w-[44px] px-lg border border-outline-variant rounded-xl text-body-md text-on-surface hover:bg-surface-container-low disabled:opacity-50 transition-colors"
>
  {testLoading === 'line' ? 'Testing…' : 'Send Test Message'}
</button>
```

**Page wrapper:**
```tsx
<form onSubmit={handleSave} className="max-w-2xl mx-auto p-xl flex flex-col gap-lg">
  <h1 className="text-headline-md font-headline text-on-surface">Notifications</h1>
  {/* Warning banner */}
  {saved && /* success banner */}
  {update.error && /* error banner */}
  {testResult && /* test result banner */}
  {/* LINE OA section */}
  {/* SMS section */}
  {/* sticky save bar */}
</form>
```

Section headings use `<h2 className="text-title-md font-medium text-on-surface">`.

**Required imports:**
```typescript
import React, { useState, useEffect } from 'react'
import MaterialIcon from '../../components/MaterialIcon'
import { useAuthStore } from '../../store/authStore'
import {
  useNotificationsSettings, useUpdateNotifications, useTestNotifications,
} from '../../hooks/useNotificationsSettings'
```

Type rules: No `any`. No raw hex. No emoji in JSX. All inputs, toggles, test buttons `min-h-[44px]`.
Export `default function NotificationsPage`.
  </action>

  <verify>
    <automated>cd D:\Development\AnimalClinic\src\frontend && npx tsc --noEmit 2>&1 | head -30</automated>
  </verify>

  <acceptance_criteria>
    - File exists; exports `default NotificationsPage`
    - Warning banner "API keys are encrypted before storage" is present (NOTIF-05)
    - LINE OA token input: `type={showLineToken ? 'text' : 'password'}` (NOTIF-02)
    - Eye icon button toggles `showLineToken` (NOTIF-02)
    - SMS provider `<select>` has Disabled / ThaiBulkSMS / THSMS options (NOTIF-03)
    - SMS API key input has reveal toggle (NOTIF-03)
    - Test button calls `handleTest('line')` and `handleTest('sms')` (NOTIF-04)
    - Test result banner renders inline (no navigation)
    - Save calls `update.mutateAsync(form)`; success banner auto-dismisses (NOTIF-01)
    - All inputs and buttons have `min-h-[44px]` (UX-02)
    - `max-w-2xl` container present (UX-03)
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>

  <done>NotificationsPage renders LINE OA + SMS sections with masked fields, reveal toggle, test buttons, and encryption warning; wired to PUT notifications + POST test endpoints.</done>
</task>

<task type="auto">
  <name>Task 3: Add barrel exports to views/settings/index.ts</name>
  <files>src/frontend/src/views/settings/index.ts</files>

  <read_first>
    - src/frontend/src/views/settings/index.ts — read current exports before editing
  </read_first>

  <action>
Append two new export lines to the existing barrel file:

```typescript
export { default as OperatingHoursPage } from './OperatingHoursPage'
export { default as NotificationsPage  } from './NotificationsPage'
```

Do NOT remove the existing `ClinicProfilePage` export.
  </action>

  <verify>
    <automated>cd D:\Development\AnimalClinic\src\frontend && npx tsc --noEmit 2>&1 | head -10</automated>
  </verify>

  <acceptance_criteria>
    - `export { default as OperatingHoursPage }` present
    - `export { default as NotificationsPage }` present
    - Existing `ClinicProfilePage` export unchanged
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>

  <done>Barrel file updated with Phase 2 page exports.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Browser → NotificationsPage | User-entered tokens never logged; only sent to API over HTTPS |
| Masked token → Save | If `lineOaToken` or `smsApiKey` starts with '••••', backend ignores it — cannot accidentally overwrite with mask |
| Test endpoint | Stateless — does not persist; falls back to stored secrets if no token provided |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02B-01 | Information Disclosure | Revealed token in DOM | accept | `type="text"` reveals the MASKED value (••••xxxx) not the plaintext; backend never sends plaintext; risk is low |
| T-02B-02 | Tampering | User sets smsProvider to an invalid string | mitigate | Backend Zod `notificationsSchema` validates smsProvider is one of 'thaibulksms'|'thsms'|''; TypeScript type on client adds defense |
| T-02B-03 | DoS | Rapid test button clicks spam the test endpoint | accept | Backend auth middleware limits to authenticated users; rate limiting is a future hardening task |
| T-02B-04 | Information Disclosure | Time inputs reveal clinic operating hours | accept | Hours are not secret business data; RBAC at API layer limits to admin role |
</threat_model>

<verification>
Manual verification steps after execution:

1. Start frontend dev server: `cd src/frontend && npm run dev`
2. Log in as `admin` → navigate to `/settings/hours`
3. Confirm 7 day rows render; toggle Monday ON → open/close time inputs appear
4. Toggle Monday OFF → "Closed" label shown; time inputs hidden
5. Save → success banner appears; refresh → Monday state persists (API confirmed)
6. Navigate to `/settings/notifications`
7. Confirm warning banner "API keys are encrypted before storage" is visible
8. Enter a LINE OA token → eye button reveals/hides value
9. Load page with existing masked token → field shows `••••••••xxxx`; save without changing → revisit → still shows `••••••••xxxx` (not blanked)
10. Click "Send Test Message" for LINE → inline result appears (success or error detail)
11. Select SMS provider → ThaiBulkSMS/THSMS/Disabled options visible; enter API key; reveal toggle works
12. All inputs respond to touch at 768px without horizontal scroll
</verification>

<success_criteria>
- `src/frontend/src/views/settings/OperatingHoursPage.tsx` exists with day toggles + time pickers
- `src/frontend/src/views/settings/NotificationsPage.tsx` exists with masked fields + reveal + test buttons
- `src/frontend/src/views/settings/index.ts` exports both new pages
- ROADMAP success criterion 1: Monday toggle persists after refresh
- ROADMAP success criterion 2: LINE token masked on load; reveal works; save-without-change does not clear stored value
- `npx tsc --noEmit` exits 0 on all new files
- No raw hex colors, no emoji, no `any` types
</success_criteria>

<output>
Create `.planning/phases/02-operational-settings-pages/02B-SUMMARY.md` when done.
</output>
