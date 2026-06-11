---
plan: 03A
phase: 3
wave: 1
depends_on: []
files_modified:
  - src/frontend/src/hooks/useIntegrationsSettings.ts
  - src/frontend/src/hooks/useSystemSettings.ts
  - src/frontend/src/hooks/useNotificationsSettings.ts
  - src/frontend/src/hooks/useOperatingHoursSettings.ts
  - src/frontend/src/hooks/usePaymentSettings.ts
  - src/frontend/src/hooks/useClinicSettings.ts
  - src/backend/tests/integration/settings-api.test.ts
autonomous: true
requirements:
  - INTEGR-01
  - INTEGR-02
  - SYSADM-01
  - QA-01

must_haves:
  truths:
    - "useIntegrationsSettings returns a useQuery over GET /api/settings/clinic"
    - "useUpdateIntegrations fires PUT /api/settings/clinic/integrations"
    - "useTestIntegrations fires POST /api/settings/clinic/integrations/test"
    - "useSystemSettings returns a useQuery over GET /admin/system-settings"
    - "useUpdateSystemSetting fires PUT /admin/system-settings/:key"
    - "useTestSmtp fires POST /admin/system-settings/smtp/test"
    - "TC-S010 passes: hung URL returns { success: false } within 10s with HTTP 200"
    - "All settings hooks use correct /api/settings (not /api/v1/settings) URL prefix"
    - "npx tsc --noEmit exits 0"
  artifacts:
    - path: "src/frontend/src/hooks/useIntegrationsSettings.ts"
      provides: "TanStack Query v5 hooks for integrations settings"
      exports: ["useIntegrationsSettings", "useUpdateIntegrations", "useTestIntegrations", "IntegrationsInput", "IntegrationsTestResult"]
    - path: "src/frontend/src/hooks/useSystemSettings.ts"
      provides: "TanStack Query v5 hooks for system settings (superadmin)"
      exports: ["useSystemSettings", "useUpdateSystemSetting", "useTestSmtp", "SystemSettingRow", "SmtpTestResult"]
  key_links:
    - from: "useIntegrationsSettings"
      to: "GET /api/settings/clinic"
      via: "useQuery — queryKey ['settings', 'clinic']"
      pattern: "useNotificationsSettings"
    - from: "useSystemSettings"
      to: "GET /admin/system-settings"
      via: "useQuery — queryKey ['settings', 'system']"
      pattern: "useNotificationsSettings"
---

<objective>
Create four new data hooks for Phase 3 and fix a URL bug in the existing Phase 2 settings hooks.

**URL bug:** All existing clinic settings hooks use `/api/v1/settings/clinic` but the backend mounts at `/api/settings` (no version prefix). The backend tests and app.ts both confirm `/api/settings` is correct. Fix all affected hooks as part of this wave so Phase 3 hooks are consistent and the existing pages work correctly when tested end-to-end.

**New hooks:**
1. `useIntegrationsSettings` — GET/PUT/POST for `/api/settings/clinic/integrations`
2. `useSystemSettings` — GET/PUT/POST for `/admin/system-settings` (superadmin)

**TC-S010:** Extend the existing `settings-api.test.ts` with a test that verifies the integrations test endpoint returns `{ success: false }` within 10 seconds when the target URL never responds (hung fetch using jest fake timers).
</objective>

<execution_context>
@D:\Development\AnimalClinic\.planning\phases\03-integrations-system-admin-qa\03-CONTEXT.md
@D:\Development\AnimalClinic\.planning\phases\03-integrations-system-admin-qa\UI-SPEC.md
@D:\Development\AnimalClinic\.planning\REQUIREMENTS.md
</execution_context>

<context>
<interfaces>
<!-- Exact hook pattern to replicate (from useNotificationsSettings.ts): -->

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../utils/api'
import type { ClinicSettingsData } from './useClinicSettings'

export interface NotificationsInput { ... }
export interface NotificationsTestResult { status: 'success'|'error'; message: string; timestamp: string }

export function useNotificationsSettings() {
  return useQuery<ClinicSettingsData>({
    queryKey: ['settings', 'clinic'],
    queryFn:  () => api.get('/api/settings/clinic').then(r => r.data.data),   // CORRECT path
  })
}
export function useUpdateNotifications() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: NotificationsInput) =>
      api.put('/api/settings/clinic/notifications', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'clinic'] }),
  })
}
export function useTestNotifications() {
  return useMutation({
    mutationFn: (data: NotificationsTestInput) =>
      api.post('/api/settings/clinic/notifications/test', data).then(r => r.data.data as NotificationsTestResult),
  })
}

<!-- ClinicSettingsData type from useClinicSettings.ts — both new hooks should import this where applicable -->

<!-- SystemSettingRow shape (from seeded migration): -->
{ category: 'platform'|'smtp', key: string, value: string, isSecret: boolean }

<!-- Seeded system settings keys (confirmed from migration SQL): -->
Platform: app_name, app_base_url, maintenance_mode, default_trial_days
SMTP:     smtp_host, smtp_port, smtp_user, smtp_password (isSecret=true)

<!-- TC-S010 pattern (jest fake timers + never-resolving fetch): -->
jest.useFakeTimers()
global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch
const responsePromise = request(server).post('/api/settings/clinic/integrations/test')
  .set('Authorization', `Bearer ${adminA}`)
await jest.advanceTimersByTimeAsync(10_001)
const response = await responsePromise
expect(response.status).toBe(200)
expect(response.body.data.success).toBe(false)
expect(response.body.data.detail).toMatch(/timed out/i)
jest.useRealTimers()
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create useIntegrationsSettings.ts</name>
  <files>src/frontend/src/hooks/useIntegrationsSettings.ts</files>

  <read_first>
    - src/frontend/src/hooks/useNotificationsSettings.ts — copy exact TanStack Query v5 pattern
    - src/frontend/src/hooks/useClinicSettings.ts — import ClinicSettingsData type
  </read_first>

  <action>
Create `src/frontend/src/hooks/useIntegrationsSettings.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../utils/api'
import type { ClinicSettingsData } from './useClinicSettings'

export interface IntegrationsInput {
  labApiUrl?: string
  labApiKey?:  string
}

export interface IntegrationsTestResult {
  success: boolean
  status?:  number
  detail?:  string
}

export function useIntegrationsSettings() {
  return useQuery<ClinicSettingsData>({
    queryKey: ['settings', 'clinic'],
    queryFn:  () => api.get('/api/settings/clinic').then(r => r.data.data),
  })
}

export function useUpdateIntegrations() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: IntegrationsInput) =>
      api.put('/api/settings/clinic/integrations', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'clinic'] }),
  })
}

export function useTestIntegrations() {
  return useMutation({
    mutationFn: () =>
      api.post('/api/settings/clinic/integrations/test').then(r => r.data.data as IntegrationsTestResult),
  })
}
```
  </action>

  <verify>
    <automated>cd D:\Development\AnimalClinic\src\frontend && npx tsc --noEmit 2>&1 | head -20</automated>
  </verify>

  <acceptance_criteria>
    - File exists with all three exports (useIntegrationsSettings, useUpdateIntegrations, useTestIntegrations)
    - Uses `/api/settings/clinic` (not `/api/v1/...`)
    - queryKey is `['settings', 'clinic']` (shares cache with other clinic hooks)
    - No `any` types
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>

  <done>useIntegrationsSettings.ts created with GET/PUT/POST hooks for integrations settings.</done>
</task>

<task type="auto">
  <name>Task 2: Create useSystemSettings.ts</name>
  <files>src/frontend/src/hooks/useSystemSettings.ts</files>

  <read_first>
    - src/frontend/src/hooks/useNotificationsSettings.ts — copy TanStack Query v5 pattern
  </read_first>

  <action>
Create `src/frontend/src/hooks/useSystemSettings.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../utils/api'

export interface SystemSettingRow {
  category: string
  key:      string
  value:    string
  isSecret: boolean
}

export interface SmtpTestResult {
  success:  boolean
  message?: string
}

export function useSystemSettings() {
  return useQuery<SystemSettingRow[]>({
    queryKey: ['settings', 'system'],
    queryFn:  () => api.get('/admin/system-settings').then(r => r.data.data),
  })
}

export function useUpdateSystemSetting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      api.put(`/admin/system-settings/${key}`, { value }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'system'] }),
  })
}

export function useTestSmtp() {
  return useMutation({
    mutationFn: () =>
      api.post('/admin/system-settings/smtp/test').then(r => r.data.data as SmtpTestResult),
  })
}
```
  </action>

  <verify>
    <automated>cd D:\Development\AnimalClinic\src\frontend && npx tsc --noEmit 2>&1 | head -20</automated>
  </verify>

  <acceptance_criteria>
    - File exists with all three exports (useSystemSettings, useUpdateSystemSetting, useTestSmtp)
    - Uses `/admin/system-settings` (matches app.ts mount)
    - Separate queryKey `['settings', 'system']` (isolated from clinic cache)
    - No `any` types
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>

  <done>useSystemSettings.ts created with GET/PUT/POST hooks for system settings.</done>
</task>

<task type="auto">
  <name>Task 3: Fix URL bug in existing Phase 2 settings hooks</name>
  <files>
    src/frontend/src/hooks/useNotificationsSettings.ts
    src/frontend/src/hooks/useOperatingHoursSettings.ts
    src/frontend/src/hooks/usePaymentSettings.ts
    src/frontend/src/hooks/useClinicSettings.ts
  </files>

  <read_first>
    - src/frontend/src/hooks/useNotificationsSettings.ts
    - src/frontend/src/hooks/useOperatingHoursSettings.ts
    - src/frontend/src/hooks/usePaymentSettings.ts
    - src/frontend/src/hooks/useClinicSettings.ts
  </read_first>

  <action>
The backend mounts clinic settings at `/api/settings` (confirmed in app.ts line 71). All existing hooks incorrectly use `/api/v1/settings`. Replace every occurrence of `/api/v1/settings` with `/api/settings` in the four files above.

Do NOT change anything else — only the URL prefix strings.

Expected replacements:
- `/api/v1/settings/clinic` → `/api/settings/clinic`
- `/api/v1/settings/clinic/notifications` → `/api/settings/clinic/notifications`
- `/api/v1/settings/clinic/notifications/test` → `/api/settings/clinic/notifications/test`
- `/api/v1/settings/clinic/hours` → `/api/settings/clinic/hours`
- `/api/v1/settings/clinic/payment` → `/api/settings/clinic/payment`
- etc. (any path starting with `/api/v1/settings`)
  </action>

  <verify>
    <automated>cd D:\Development\AnimalClinic\src\frontend && npx tsc --noEmit 2>&1 | head -20</automated>
  </verify>

  <acceptance_criteria>
    - No occurrence of `/api/v1/settings` in any hook file
    - All replaced with `/api/settings`
    - No other changes to file content
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>

  <done>URL bug fixed in all existing settings hooks — /api/v1/settings → /api/settings.</done>
</task>

<task type="auto">
  <name>Task 4: Add TC-S010 to settings-api.test.ts</name>
  <files>src/backend/tests/integration/settings-api.test.ts</files>

  <read_first>
    - src/backend/tests/integration/settings-api.test.ts — read full file to find correct insertion point (after TC-S009, before end of file)
    - src/backend/services/connection-test.service.ts — confirm TEST_TIMEOUT_MS value and fetch usage pattern
  </read_first>

  <action>
Append a new `describe` block to the end of `src/backend/tests/integration/settings-api.test.ts` (before the final closing but after all existing describe blocks).

The test simulates a hung HTTP target by replacing `global.fetch` with a never-resolving promise, then advances fake timers past `TEST_TIMEOUT_MS` (10,000ms), and asserts the endpoint returns a structured 200 response with `success: false`.

```typescript
describe('TC-S010 — integrations test-connection timeout', () => {
  it('returns { success: false } within 10 s when target URL never responds', async () => {
    jest.useFakeTimers()
    const originalFetch = global.fetch
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch

    const responsePromise = request(server)
      .post('/api/settings/clinic/integrations/test')
      .set('Authorization', `Bearer ${adminA}`)

    await jest.advanceTimersByTimeAsync(10_001)
    const response = await responsePromise

    expect(response.status).toBe(200)
    expect(response.body.data.success).toBe(false)
    expect(response.body.data.detail).toMatch(/timed out/i)

    global.fetch = originalFetch
    jest.useRealTimers()
  })
})
```

Insert this block at the end of the file (after all existing describe blocks, before any module.exports or end-of-file).
  </action>

  <verify>
    <automated>cd D:\Development\AnimalClinic\src\backend && npm test -- --testPathPattern=settings-api 2>&1 | tail -30</automated>
  </verify>

  <acceptance_criteria>
    - TC-S010 describe block appended to settings-api.test.ts
    - Test passes: HTTP 200, body.data.success === false, detail matches /timed out/i
    - No existing TC-S001–S009 tests broken
    - original fetch restored in cleanup (global.fetch = originalFetch)
  </acceptance_criteria>

  <done>TC-S010 added — integrations test endpoint returns structured timeout error within 10s.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Frontend → Backend | Clinic hooks require admin JWT; system-settings hooks require superadmin JWT |
| TC-S010 mock | `global.fetch` replaced in test scope and restored in cleanup to avoid test pollution |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03A-01 | Elevation of Privilege | useSystemSettings called by non-superadmin | accept | Backend `rbacMiddleware(['superadmin'])` returns 403; frontend SystemSettingsPage shows inline "Access Denied" card |
| T-03A-02 | Information Disclosure | SMTP password returned as masked value | accept | Service layer masks secret fields; `isSecret: true` flag on row; UI uses visibility toggle |
</threat_model>

<verification>
After execution:
1. `cd src/frontend && npx tsc --noEmit` exits 0 — no type errors in new or modified hooks
2. `cd src/backend && npm test -- --testPathPattern=settings-api` — TC-S010 passes; suite green
3. Grep for `/api/v1/settings` in `src/frontend/src/hooks/` returns no matches
</verification>

<success_criteria>
- useIntegrationsSettings.ts and useSystemSettings.ts created
- All Phase 2 hooks use `/api/settings` (no v1 prefix)
- TC-S010 passes in settings-api.test.ts
- `npx tsc --noEmit` exits 0
</success_criteria>

<output>
Create `.planning/phases/03-integrations-system-admin-qa/03A-SUMMARY.md` when done.
</output>
