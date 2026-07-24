---
plan: 02A
phase: 2
wave: 1
depends_on: ["01C-PLAN.md"]
files_modified:
  - src/frontend/src/hooks/useClinicSettings.ts
  - src/frontend/src/hooks/useOperatingHoursSettings.ts
  - src/frontend/src/hooks/useNotificationsSettings.ts
  - src/frontend/src/hooks/usePaymentSettings.ts
  - src/frontend/src/App.tsx
autonomous: true
requirements:
  - HOURS-03
  - NOTIF-01
  - NOTIF-03
  - PAYMENT-01

must_haves:
  truths:
    - "npx tsc --noEmit exits 0 (ignoring missing page view files)"
    - "ClinicSettingsData interface includes operatingHours, lineOaToken, smsProvider, smsApiKey, smsSenderName, promptpayId, paymentQrUrl, gbprimepayPublic, gbprimepaySecret"
    - "useOperatingHours() and useUpdateOperatingHours() are exported from useOperatingHoursSettings.ts"
    - "useNotificationsSettings(), useUpdateNotifications(), useTestNotifications() are exported from useNotificationsSettings.ts"
    - "usePaymentSettings() and useUpdatePayment() are exported from usePaymentSettings.ts"
    - "App.tsx lazy imports OperatingHoursPage, NotificationsPage, PaymentPage in the Settings pages group"
    - "App.tsx /settings block contains path=hours, path=notifications, path=payment routes"
  artifacts:
    - path: "src/frontend/src/hooks/useOperatingHoursSettings.ts"
      provides: "Operating hours query + mutation hooks"
      exports: ["useOperatingHours", "useUpdateOperatingHours", "OperatingHoursMap", "DayHours"]
    - path: "src/frontend/src/hooks/useNotificationsSettings.ts"
      provides: "Notifications query + mutation + test hooks"
      exports: ["useNotificationsSettings", "useUpdateNotifications", "useTestNotifications", "NotificationsInput"]
    - path: "src/frontend/src/hooks/usePaymentSettings.ts"
      provides: "Payment query + mutation hooks"
      exports: ["usePaymentSettings", "useUpdatePayment", "PaymentInput"]
  key_links:
    - from: "App.tsx"
      to: "OperatingHoursPage"
      via: "lazy import + Route path=hours"
      pattern: "path=\"hours\""
    - from: "App.tsx"
      to: "NotificationsPage"
      via: "lazy import + Route path=notifications"
      pattern: "path=\"notifications\""
    - from: "App.tsx"
      to: "PaymentPage"
      via: "lazy import + Route path=payment"
      pattern: "path=\"payment\""
---

<objective>
Establish the data layer for Phase 2: expand the shared `ClinicSettingsData` interface
to cover all operational settings fields, create three focused hook files (one per page),
and register the three new routes in `App.tsx`. This plan has no visible UI — it
unblocks Plans 02B and 02C which import these hooks and render the pages.

All hooks share `queryKey: ['settings', 'clinic']` — the same key as Phase 1's
`useClinicSettings`, so any mutation's `invalidateQueries` refreshes the entire
settings cache across all pages.
</objective>

<execution_context>
@D:\Development\AnimalClinic\.planning\ROADMAP.md
@D:\Development\AnimalClinic\.planning\REQUIREMENTS.md
</execution_context>

<context>
@D:\Development\AnimalClinic\.planning\phases\01-settings-shell-clinic-profile\01-RESEARCH.md

<interfaces>
<!-- Current ClinicSettingsData from src/frontend/src/hooks/useClinicSettings.ts -->
<!-- Must be EXTENDED (not replaced) with the fields below -->

New fields to add to ClinicSettingsData (all optional — backend returns null when unset):
  // Operating hours
  operatingHours?: Record<'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun', { open: string; close: string } | null>
  // Notifications
  lineOaToken?:    string | null   // masked: "••••••••xxxx"
  smsProvider?:    'thaibulksms' | 'thsms' | '' | null
  smsApiKey?:      string | null   // masked: "••••••••xxxx"
  smsSenderName?:  string | null
  // Payment
  promptpayId?:       string | null
  paymentQrUrl?:      string | null
  gbprimepayPublic?:  string | null
  gbprimepaySecret?:  string | null  // masked: "••••••••xxxx"

Backend endpoints for new mutations:
  PUT  /api/v1/settings/clinic/hours          — body: { operatingHours: OperatingHoursMap }
  PUT  /api/v1/settings/clinic/notifications  — body: NotificationsInput (see below)
  POST /api/v1/settings/clinic/notifications/test — body: { channel: 'line'|'sms' }
  PUT  /api/v1/settings/clinic/payment        — body: PaymentInput (see below)

All PUTs return the full updated settings object (same shape as GET).
Secret fields (lineOaToken, smsApiKey, gbprimepaySecret): if value starts with '••••',
backend service ignores it (client echo protection) — never re-encrypts the mask.

App.tsx current /settings block (lines 75-79):
  <Route path="/settings" element={<ProtectedRoute><SettingsLayout/></ProtectedRoute>}>
    <Route index element={<Navigate to="/settings/clinic-profile" replace/>}/>
    <Route path="clinic-profile" element={<ClinicProfilePage/>}/>
  </Route>

App.tsx current Settings pages lazy group (line 32-33):
  // ── Settings pages ───────────────────────────────────────────────────────────
  const ClinicProfilePage = lazy(() => import('./views/settings/ClinicProfilePage'))
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Expand ClinicSettingsData interface in useClinicSettings.ts</name>
  <files>src/frontend/src/hooks/useClinicSettings.ts</files>

  <read_first>
    - src/frontend/src/hooks/useClinicSettings.ts — read current interface before editing
  </read_first>

  <action>
Add the following fields to the existing `ClinicSettingsData` interface (keep all existing
fields, append after `planTier?`):

  // Phase 2 fields — operating hours
  operatingHours?: Record<'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun', { open: string; close: string } | null>
  // Phase 2 fields — notifications (secret fields arrive masked from API)
  lineOaToken?:    string | null
  smsProvider?:    'thaibulksms' | 'thsms' | '' | null
  smsApiKey?:      string | null
  smsSenderName?:  string | null
  // Phase 2 fields — payment (gbprimepaySecret arrives masked from API)
  promptpayId?:       string | null
  paymentQrUrl?:      string | null
  gbprimepayPublic?:  string | null
  gbprimepaySecret?:  string | null

Do NOT change any existing fields, imports, functions, or exports in the file.
  </action>

  <verify>
    <automated>cd D:\Development\AnimalClinic\src\frontend && npx tsc --noEmit 2>&1 | head -20</automated>
  </verify>

  <acceptance_criteria>
    - All new fields appear in ClinicSettingsData (all optional)
    - Existing fields and hooks are unchanged
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>

  <done>ClinicSettingsData interface includes all Phase 2 settings fields; TypeScript compiles clean.</done>
</task>

<task type="auto">
  <name>Task 2: Create useOperatingHoursSettings.ts</name>
  <files>src/frontend/src/hooks/useOperatingHoursSettings.ts</files>

  <read_first>
    - src/frontend/src/hooks/useClinicSettings.ts — copy import pattern verbatim (useQuery, useMutation, useQueryClient, api)
  </read_first>

  <action>
Create `src/frontend/src/hooks/useOperatingHoursSettings.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../utils/api'
import type { ClinicSettingsData } from './useClinicSettings'

export type DayHours = { open: string; close: string }
export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
export type OperatingHoursMap = Record<DayKey, DayHours | null>

export function useOperatingHours() {
  return useQuery<ClinicSettingsData>({
    queryKey: ['settings', 'clinic'],
    queryFn: () => api.get('/api/v1/settings/clinic').then(r => r.data.data),
  })
}

export function useUpdateOperatingHours() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { operatingHours: OperatingHoursMap }) =>
      api.put('/api/v1/settings/clinic/hours', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'clinic'] }),
  })
}
```

No other functions needed for this hook file.
  </action>

  <verify>
    <automated>cd D:\Development\AnimalClinic\src\frontend && npx tsc --noEmit 2>&1 | head -20</automated>
  </verify>

  <acceptance_criteria>
    - File exists at the correct path
    - Exports: `DayHours`, `DayKey`, `OperatingHoursMap`, `useOperatingHours`, `useUpdateOperatingHours`
    - `queryKey` is `['settings', 'clinic']` (matches Phase 1)
    - `mutationFn` calls `PUT /api/v1/settings/clinic/hours`
    - `onSuccess` invalidates `['settings', 'clinic']`
    - No `any` types
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>

  <done>useOperatingHoursSettings.ts created; query + mutation hooks exported and typed correctly.</done>
</task>

<task type="auto">
  <name>Task 3: Create useNotificationsSettings.ts</name>
  <files>src/frontend/src/hooks/useNotificationsSettings.ts</files>

  <read_first>
    - src/frontend/src/hooks/useClinicSettings.ts — copy import pattern verbatim
  </read_first>

  <action>
Create `src/frontend/src/hooks/useNotificationsSettings.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../utils/api'
import type { ClinicSettingsData } from './useClinicSettings'

export interface NotificationsInput {
  lineOaToken?:          string
  lineRemindersEnabled?: boolean
  smsProvider?:          'thaibulksms' | 'thsms' | ''
  smsApiKey?:            string
  smsSenderName?:        string
  smsRemindersEnabled?:  boolean
}

export interface NotificationsTestInput {
  channel: 'line' | 'sms'
}

export interface NotificationsTestResult {
  status:    'success' | 'error'
  message:   string
  timestamp: string
}

export function useNotificationsSettings() {
  return useQuery<ClinicSettingsData>({
    queryKey: ['settings', 'clinic'],
    queryFn: () => api.get('/api/v1/settings/clinic').then(r => r.data.data),
  })
}

export function useUpdateNotifications() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: NotificationsInput) =>
      api.put('/api/v1/settings/clinic/notifications', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'clinic'] }),
  })
}

export function useTestNotifications() {
  return useMutation({
    mutationFn: (data: NotificationsTestInput) =>
      api.post('/api/v1/settings/clinic/notifications/test', data).then(r => r.data.data as NotificationsTestResult),
  })
}
```

Note: `useTestNotifications` does NOT invalidate the query — it is stateless (does not persist anything).
  </action>

  <verify>
    <automated>cd D:\Development\AnimalClinic\src\frontend && npx tsc --noEmit 2>&1 | head -20</automated>
  </verify>

  <acceptance_criteria>
    - Exports: `NotificationsInput`, `NotificationsTestInput`, `NotificationsTestResult`, `useNotificationsSettings`, `useUpdateNotifications`, `useTestNotifications`
    - `useTestNotifications` mutation POSTs to `/api/v1/settings/clinic/notifications/test`
    - `useTestNotifications` has NO `onSuccess` invalidation (stateless test endpoint)
    - No `any` types
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>

  <done>useNotificationsSettings.ts created; all three hooks exported with correct types.</done>
</task>

<task type="auto">
  <name>Task 4: Create usePaymentSettings.ts</name>
  <files>src/frontend/src/hooks/usePaymentSettings.ts</files>

  <read_first>
    - src/frontend/src/hooks/useClinicSettings.ts — copy import pattern verbatim
  </read_first>

  <action>
Create `src/frontend/src/hooks/usePaymentSettings.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../utils/api'
import type { ClinicSettingsData } from './useClinicSettings'

export interface PaymentInput {
  promptpayId?:      string
  paymentQrUrl?:     string
  gbprimepayPublic?: string
  gbprimepaySecret?: string
}

export function usePaymentSettings() {
  return useQuery<ClinicSettingsData>({
    queryKey: ['settings', 'clinic'],
    queryFn: () => api.get('/api/v1/settings/clinic').then(r => r.data.data),
  })
}

export function useUpdatePayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: PaymentInput) =>
      api.put('/api/v1/settings/clinic/payment', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'clinic'] }),
  })
}
```
  </action>

  <verify>
    <automated>cd D:\Development\AnimalClinic\src\frontend && npx tsc --noEmit 2>&1 | head -20</automated>
  </verify>

  <acceptance_criteria>
    - Exports: `PaymentInput`, `usePaymentSettings`, `useUpdatePayment`
    - `mutationFn` calls `PUT /api/v1/settings/clinic/payment`
    - `onSuccess` invalidates `['settings', 'clinic']`
    - No `any` types
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>

  <done>usePaymentSettings.ts created; query + mutation hooks exported correctly.</done>
</task>

<task type="auto">
  <name>Task 5: Register Phase 2 routes in App.tsx</name>
  <files>src/frontend/src/App.tsx</files>

  <read_first>
    - src/frontend/src/App.tsx — read full file before editing; understand exact lazy group and /settings Route block
  </read_first>

  <action>
Edit `src/frontend/src/App.tsx` to add Phase 2 pages.

**Step 1** — Extend the Settings pages lazy group (currently line 32-33) by appending three
new lazy imports immediately after `const ClinicProfilePage`:

```typescript
const OperatingHoursPage = lazy(() => import('./views/settings/OperatingHoursPage'))
const NotificationsPage  = lazy(() => import('./views/settings/NotificationsPage'))
const PaymentPage        = lazy(() => import('./views/settings/PaymentPage'))
```

**Step 2** — Add three child routes inside the existing `/settings` Route block
(after `<Route path="clinic-profile" element={<ClinicProfilePage/>}/>` and before the
closing `</Route>`):

```tsx
<Route path="hours"         element={<OperatingHoursPage/>}/>
<Route path="notifications" element={<NotificationsPage/>}/>
<Route path="payment"       element={<PaymentPage/>}/>
```

Do NOT modify any existing routes, imports, or other code. The missing page files will
cause TypeScript to emit warnings until Plans 02B/02C create them — this is expected.
  </action>

  <verify>
    <automated>cd D:\Development\AnimalClinic\src\frontend && npx tsc --noEmit 2>&1 | grep -v "views/settings/OperatingHoursPage\|views/settings/NotificationsPage\|views/settings/PaymentPage" | head -20</automated>
  </verify>

  <acceptance_criteria>
    - Three new lazy imports appear in the `// ── Settings pages ───` group
    - Three new `<Route>` elements exist inside the `/settings` block
    - All existing `/admin`, `/clinic`, and `/settings/clinic-profile` routes are unchanged
    - `npx tsc --noEmit` produces zero new errors (errors about missing page files are expected)
  </acceptance_criteria>

  <done>App.tsx registers all Phase 2 settings routes; navigating to /settings/hours, /settings/notifications, /settings/payment will render correct pages once 02B/02C create them.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Browser → Hook layer | Query data loaded from JWT-authenticated API; tenantId from JWT on server |
| Masked fields → Save | Client echo protection in backend service ignores values starting with '••••' |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02A-01 | Information Disclosure | ClinicSettingsData interface | accept | Interface is a TypeScript type only; no runtime exposure; backend masks all secrets before returning |
| T-02A-02 | Tampering | Client sends raw masked string as new value | mitigate | Backend `tenant-settings.service.ts` ignores values starting with '••••' — client echo protection present |
</threat_model>

<verification>
Manual verification after execution:

1. Run `cd src/frontend && npx tsc --noEmit` — should exit 0 (allow errors only for missing OperatingHoursPage, NotificationsPage, PaymentPage)
2. Confirm `src/frontend/src/hooks/useOperatingHoursSettings.ts` exists and exports `useOperatingHours`, `useUpdateOperatingHours`
3. Confirm `src/frontend/src/hooks/useNotificationsSettings.ts` exists and exports all three hooks
4. Confirm `src/frontend/src/hooks/usePaymentSettings.ts` exists and exports `usePaymentSettings`, `useUpdatePayment`
5. Confirm App.tsx contains `path="hours"`, `path="notifications"`, `path="payment"` routes
</verification>

<success_criteria>
- Three new hook files created with correct exports and types
- ClinicSettingsData extended with all Phase 2 fields (no breaking changes)
- App.tsx route tree includes all three Phase 2 settings routes
- `npx tsc --noEmit` exits 0 (ignoring missing page view files)
</success_criteria>

<output>
Create `.planning/phases/02-operational-settings-pages/02A-SUMMARY.md` when done.
</output>
