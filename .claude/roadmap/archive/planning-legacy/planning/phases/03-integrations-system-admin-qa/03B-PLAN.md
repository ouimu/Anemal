---
plan: 03B
phase: 3
wave: 2
depends_on: ["03A-PLAN.md"]
files_modified:
  - src/frontend/src/views/settings/IntegrationsPage.tsx
  - src/frontend/src/views/settings/SystemSettingsPage.tsx
  - src/frontend/src/views/settings/index.ts
  - src/frontend/src/App.tsx
autonomous: true
requirements:
  - INTEGR-01
  - INTEGR-02
  - INTEGR-03
  - SYSADM-01
  - SYSADM-02
  - SYSADM-03
  - SYSADM-04
  - UX-01
  - UX-02
  - UX-03

must_haves:
  truths:
    - "IntegrationsPage renders Lab API URL + masked key inputs"
    - "IntegrationsPage Test Connection button shows testLoading spinner and inline result"
    - "IntegrationsPage shows 2 non-interactive placeholder cards (radiology, receipt_long icons)"
    - "SystemSettingsPage renders inline Access Denied card for non-superadmin"
    - "SystemSettingsPage renders 3 accordion sections collapsed by default"
    - "SystemSettingsPage Platform section has App Name, Base URL, Maintenance Mode toggle, Trial Days"
    - "SystemSettingsPage SMTP section has Host, Port, User, Password (masked + eye toggle), Test SMTP button"
    - "SystemSettingsPage Feature Flags section has non-interactive Coming Soon card"
    - "All interactive elements have min-h-[44px]"
    - "/settings/integrations and /settings/system routes exist in App.tsx"
    - "npx tsc --noEmit exits 0"
  artifacts:
    - path: "src/frontend/src/views/settings/IntegrationsPage.tsx"
      provides: "Lab API config form with test connection and placeholder cards"
      exports: ["default IntegrationsPage"]
    - path: "src/frontend/src/views/settings/SystemSettingsPage.tsx"
      provides: "Superadmin accordion settings with Platform/SMTP/Feature Flags sections"
      exports: ["default SystemSettingsPage"]
  key_links:
    - from: "IntegrationsPage"
      to: "useUpdateIntegrations"
      via: "useMutation — PUT /api/settings/clinic/integrations"
      pattern: "useUpdateIntegrations"
    - from: "IntegrationsPage"
      to: "useTestIntegrations"
      via: "useMutation — POST /api/settings/clinic/integrations/test"
      pattern: "useTestIntegrations"
    - from: "SystemSettingsPage"
      to: "useUpdateSystemSetting"
      via: "useMutation — PUT /admin/system-settings/:key (per field)"
      pattern: "useUpdateSystemSetting"
    - from: "SystemSettingsPage"
      to: "useTestSmtp"
      via: "useMutation — POST /admin/system-settings/smtp/test"
      pattern: "useTestSmtp"
---

<objective>
Build two new settings pages and wire them into the app router.

**IntegrationsPage** — clinic admin configures Lab API Base URL + Key (masked), tests the connection,
and sees placeholder cards for X-ray/DICOM and Accounting integrations (non-interactive, Phase 4).

**SystemSettingsPage** — superadmin manages Platform / Email+SMTP / Feature Flags via accordion.
Non-superadmin users see an inline "Access Denied" card. Each section has its own Save button that
fires `PUT /admin/system-settings/:key` per dirty field. SMTP section includes a Test SMTP button with
inline result. Feature Flags shows a Coming Soon placeholder.

Both pages follow the NotificationsPage pattern exactly for secret fields, test buttons, banners,
and the sticky save bar.
</objective>

<execution_context>
@D:\Development\AnimalClinic\.planning\phases\03-integrations-system-admin-qa\03-CONTEXT.md
@D:\Development\AnimalClinic\.planning\phases\03-integrations-system-admin-qa\UI-SPEC.md
@D:\Development\AnimalClinic\.planning\REQUIREMENTS.md
</execution_context>

<context>
@D:\Development\AnimalClinic\.planning\phases\02-operational-settings-pages\02B-PLAN.md

<interfaces>
<!-- Design tokens — Tailwind classes only, no raw hex -->
Primary action button:  "min-h-[44px] min-w-[44px] px-xl bg-primary text-surface rounded-xl text-body-md font-medium hover:opacity-90 disabled:opacity-50"
Secondary button:       "min-h-[44px] min-w-[44px] px-lg border border-outline-variant rounded-xl text-body-md text-on-surface hover:bg-surface-container-low disabled:opacity-50 transition-colors self-start"
Card container:         "bg-surface rounded-2xl border border-outline-variant p-lg flex flex-col gap-md"
Input (standard):       "min-h-[44px] px-md border border-outline-variant rounded-xl text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary w-full"
Input (with eye btn):   "min-h-[44px] px-md pr-14 border border-outline-variant rounded-xl text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary w-full"
Eye button (absolute):  "absolute right-0 top-0 h-full min-w-[44px] flex items-center justify-center text-on-surface-variant hover:text-on-surface"
Toggle (active):        "min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl transition-colors bg-primary text-surface"
Toggle (inactive):      "min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl transition-colors bg-surface-container-low text-on-surface-variant border border-outline-variant"
Success banner:         "px-md py-sm bg-surface-container-low border border-outline-variant rounded-xl text-body-md text-secondary flex items-center gap-sm"
Error banner:           "px-md py-sm bg-error/10 border border-error/30 rounded-xl text-body-md text-error"
Sticky save bar:        "sticky bottom-0 bg-background pt-sm pb-md flex items-center justify-between border-t border-outline-variant"

<!-- Secret masking pattern (from NotificationsPage) -->
const MASK_PREFIX = '••••'
// On save: if (!field.startsWith(MASK_PREFIX)) include field in payload
// Do NOT send unchanged masked values to the backend

<!-- Test loading pattern (from NotificationsPage) -->
const [testLoading, setTestLoading] = useState<'lab' | null>(null)  // or 'smtp'
const [testResult, setTestResult]   = useState<{ ... } | null>(null)
async function handleTest() {
  setTestLoading('lab'); setTestResult(null)
  try {
    const res = await testMutation.mutateAsync()
    setTestResult(res)
  } catch (e) {
    setTestResult({ success: false, detail: e instanceof Error ? e.message : String(e) })
  } finally { setTestLoading(null) }
}

<!-- Seeded system settings keys (read_first seed.ts / migration to confirm) -->
Platform: app_name, app_base_url, maintenance_mode, default_trial_days
SMTP:     smtp_host, smtp_port, smtp_user, smtp_password

<!-- Loading spinner (from existing pages) -->
<div className="p-xl flex items-center gap-sm text-on-surface-variant">
  <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  <span className="text-body-md">Loading…</span>
</div>
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create IntegrationsPage.tsx</name>
  <files>src/frontend/src/views/settings/IntegrationsPage.tsx</files>

  <read_first>
    - src/frontend/src/views/settings/NotificationsPage.tsx — copy full structure: loading state, banners, secret field pattern, test button pattern, sticky save bar
    - src/frontend/src/hooks/useIntegrationsSettings.ts — confirm exported names (created in 03A)
    - src/frontend/src/store/authStore.ts — confirm userId selector
    - src/frontend/src/components/MaterialIcon.tsx — confirm props interface
  </read_first>

  <action>
Create `src/frontend/src/views/settings/IntegrationsPage.tsx`.

**Imports:**
```typescript
import React, { useState, useEffect } from 'react'
import MaterialIcon from '../../components/MaterialIcon'
import { useAuthStore } from '../../store/authStore'
import {
  useIntegrationsSettings,
  useUpdateIntegrations,
  useTestIntegrations,
  type IntegrationsInput,
} from '../../hooks/useIntegrationsSettings'
```

**State:**
```typescript
interface IntegrationsForm { labApiUrl: string; labApiKey: string }
const [form, setForm]         = useState<IntegrationsForm>({ labApiUrl: '', labApiKey: '' })
const [saved, setSaved]       = useState(false)
const [showApiKey, setShowApiKey] = useState(false)
const [testLoading, setTestLoading] = useState<'lab' | null>(null)
const [testResult, setTestResult]   = useState<{ success: boolean; detail?: string } | null>(null)
```

**Data sync (useEffect on [data]):**
```typescript
useEffect(() => {
  if (!data) return
  setForm({ labApiUrl: data.labApiUrl ?? '', labApiKey: data.labApiKey ?? '' })
}, [data])
```

**handleTestLab:**
```typescript
async function handleTestLab() {
  setTestLoading('lab'); setTestResult(null)
  try {
    const res = await testIntegrations.mutateAsync()
    setTestResult({ success: res.success, detail: res.detail })
  } catch (e) {
    setTestResult({ success: false, detail: e instanceof Error ? e.message : String(e) })
  } finally { setTestLoading(null) }
}
```

**handleSave:**
```typescript
async function handleSave(e: React.FormEvent) {
  e.preventDefault()
  const MASK_PREFIX = '••••'
  const payload: IntegrationsInput = { labApiUrl: form.labApiUrl }
  if (!form.labApiKey.startsWith(MASK_PREFIX)) payload.labApiKey = form.labApiKey
  try {
    await update.mutateAsync(payload)
    setSaved(true); setTimeout(() => setSaved(false), 2500)
  } catch { /* error displayed via update.error */ }
}
```

**Loading state:** Render loading spinner (see interface section) when `isLoading`.

**Page structure — wrap in `<form onSubmit={handleSave} className="max-w-2xl mx-auto p-xl flex flex-col gap-lg">`:**

1. `<h1 className="text-headline-md font-headline text-on-surface">Integrations</h1>`

2. Encryption banner (always visible — copy from NotificationsPage):
   `<MaterialIcon name="lock" size={18} />` + "API keys are encrypted before storage"

3. Saved banner (conditional on `saved`): check_circle icon + "Changes saved successfully"

4. Error banner (conditional on `update.error`)

5. Test result banner (conditional on `testResult`):
   - success: text-secondary + check_circle icon
   - failure: bg-error/10 text-error + error icon
   - Text: `Test connection: ${testResult.detail ?? (testResult.success ? 'Connected successfully' : 'Connection failed')}`

6. Lab API card (`bg-surface rounded-2xl border border-outline-variant p-lg flex flex-col gap-md`):
   - `<h2>Lab API</h2>` (text-title-md font-medium)
   - Lab API Base URL: type="url", placeholder="https://lab.example.com/api"
   - Lab API Key: masked input with absolute eye toggle + aria-label="Show/Hide API key"
   - Test Connection button: onClick={handleTestLab}, disabled={testLoading==='lab'}
     Text: `testLoading === 'lab' ? 'Testing…' : 'Test Connection'`

7. Two placeholder cards (non-interactive, `opacity-60`):
   ```tsx
   <div className="bg-surface rounded-2xl border border-outline-variant p-lg flex items-center gap-md opacity-60">
     <MaterialIcon name="radiology" size={28} className="text-on-surface-variant flex-shrink-0" />
     <div>
       <p className="text-body-md font-medium text-on-surface">X-ray / DICOM Viewer</p>
       <p className="text-label-md text-on-surface-variant">Coming soon — Phase 4</p>
     </div>
   </div>
   <div className="bg-surface rounded-2xl border border-outline-variant p-lg flex items-center gap-md opacity-60">
     <MaterialIcon name="receipt_long" size={28} className="text-on-surface-variant flex-shrink-0" />
     <div>
       <p className="text-body-md font-medium text-on-surface">Accounting Software</p>
       <p className="text-label-md text-on-surface-variant">Coming soon — Phase 4</p>
     </div>
   </div>
   ```

8. Sticky save bar (identical to NotificationsPage — lastUpdated timestamp, Save Changes button).

**Last updated / byYou logic:**
```typescript
const lastUpdated = data?.updatedAt
  ? new Date(data.updatedAt).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
  : null
const byYou = data?.updatedBy != null && data.updatedBy === userId
```

Rules: No `any`. No raw hex. No emoji in JSX. All inputs `min-h-[44px]`. Export `default function IntegrationsPage`.
  </action>

  <verify>
    <automated>cd D:\Development\AnimalClinic\src\frontend && npx tsc --noEmit 2>&1 | head -30</automated>
  </verify>

  <acceptance_criteria>
    - File exists; exports default IntegrationsPage
    - Lab API URL input (type=url) with min-h-[44px] present
    - Lab API Key masked input with visibility toggle present (aria-label set)
    - Test Connection button: disabled when testLoading==='lab', shows 'Testing…' (INTEGR-02)
    - Test result banner appears after test (success=text-secondary, failure=bg-error/10)
    - Encryption banner present
    - 2 placeholder cards with radiology + receipt_long icons, opacity-60 (INTEGR-03)
    - Sticky save bar with last updated timestamp
    - max-w-2xl for 768px compliance (UX-03)
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>

  <done>IntegrationsPage renders Lab API form with test connection and placeholder cards.</done>
</task>

<task type="auto">
  <name>Task 2: Create SystemSettingsPage.tsx</name>
  <files>src/frontend/src/views/settings/SystemSettingsPage.tsx</files>

  <read_first>
    - src/frontend/src/views/settings/NotificationsPage.tsx — secret field, toggle, test button, banner patterns
    - src/frontend/src/hooks/useSystemSettings.ts — confirm exported names (created in 03A)
    - src/frontend/src/store/authStore.ts — confirm role selector
    - src/frontend/src/components/MaterialIcon.tsx — confirm props
  </read_first>

  <action>
Create `src/frontend/src/views/settings/SystemSettingsPage.tsx`.

**Imports:**
```typescript
import React, { useState, useEffect } from 'react'
import MaterialIcon from '../../components/MaterialIcon'
import { useAuthStore } from '../../store/authStore'
import {
  useSystemSettings,
  useUpdateSystemSetting,
  useTestSmtp,
} from '../../hooks/useSystemSettings'
```

**Access guard (check role BEFORE hooks — return early if not superadmin):**
```typescript
const role = useAuthStore(s => s.role)

if (role !== 'superadmin') return (
  <div className="max-w-2xl mx-auto p-xl">
    <div className="bg-surface rounded-2xl border border-outline-variant p-xl flex flex-col items-center gap-md text-center">
      <MaterialIcon name="lock" size={40} className="text-on-surface-variant" />
      <h1 className="text-headline-sm font-headline text-on-surface">Access Denied</h1>
      <p className="text-body-md text-on-surface-variant">
        System Settings are only available to superadmin users.
      </p>
    </div>
  </div>
)
```

IMPORTANT: All hooks (useSystemSettings, useUpdateSystemSetting, useTestSmtp) must be called BEFORE the early return to satisfy React's Rules of Hooks. The role check early return renders a non-interactive card but the hooks are still called at the top.

**State:**
```typescript
interface PlatformForm { appName: string; baseUrl: string; maintenanceMode: boolean; trialDays: string }
interface SmtpForm     { smtpHost: string; smtpPort: string; smtpUser: string; smtpPassword: string }

const [open, setOpen]           = useState({ platform: false, smtp: false, flags: false })
const [platform, setPlatform]   = useState<PlatformForm>({ appName: '', baseUrl: '', maintenanceMode: false, trialDays: '' })
const [smtp, setSmtp]           = useState<SmtpForm>({ smtpHost: '', smtpPort: '587', smtpUser: '', smtpPassword: '' })
const [platformSaved, setPlatformSaved] = useState(false)
const [smtpSaved, setSmtpSaved]         = useState(false)
const [showSmtpPass, setShowSmtpPass]   = useState(false)
const [testLoading, setTestLoading]     = useState<'smtp' | null>(null)
const [smtpTestResult, setSmtpTestResult] = useState<{ success: boolean; message?: string } | null>(null)

function toggle(k: keyof typeof open) { setOpen(p => ({ ...p, [k]: !p[k] })) }
```

**Data loading (useEffect on [data]):**
```typescript
useEffect(() => {
  if (!data) return
  const get = (k: string) => data.find(r => r.key === k)?.value ?? ''
  setPlatform({
    appName:         get('app_name'),
    baseUrl:         get('app_base_url'),
    maintenanceMode: get('maintenance_mode') === 'true',
    trialDays:       get('default_trial_days'),
  })
  setSmtp({
    smtpHost:     get('smtp_host'),
    smtpPort:     get('smtp_port') || '587',
    smtpUser:     get('smtp_user'),
    smtpPassword: get('smtp_password'),
  })
}, [data])
```

**handleSavePlatform (per-field PUT, iterate dirty fields):**
```typescript
async function handleSavePlatform() {
  const MASK_PREFIX = '••••'
  const fields: Array<[string, string]> = [
    ['app_name',          platform.appName],
    ['app_base_url',      platform.baseUrl],
    ['maintenance_mode',  String(platform.maintenanceMode)],
    ['default_trial_days', platform.trialDays],
  ]
  try {
    for (const [key, value] of fields) {
      if (value.startsWith(MASK_PREFIX)) continue
      await updateSetting.mutateAsync({ key, value })
    }
    setPlatformSaved(true); setTimeout(() => setPlatformSaved(false), 2500)
  } catch { /* error displayed via updateSetting.error */ }
}
```

**handleSaveSmtp (same pattern, skip masked password):**
```typescript
async function handleSaveSmtp() {
  const MASK_PREFIX = '••••'
  const fields: Array<[string, string]> = [
    ['smtp_host',     smtp.smtpHost],
    ['smtp_port',     smtp.smtpPort],
    ['smtp_user',     smtp.smtpUser],
    ['smtp_password', smtp.smtpPassword],
  ]
  try {
    for (const [key, value] of fields) {
      if (value.startsWith(MASK_PREFIX)) continue
      await updateSetting.mutateAsync({ key, value })
    }
    setSmtpSaved(true); setTimeout(() => setSmtpSaved(false), 2500)
  } catch { /* error displayed via updateSetting.error */ }
}
```

**handleTestSmtp:**
```typescript
async function handleTestSmtp() {
  setTestLoading('smtp'); setSmtpTestResult(null)
  try {
    const res = await testSmtp.mutateAsync()
    setSmtpTestResult({ success: res.success, message: res.message })
  } catch (e) {
    setSmtpTestResult({ success: false, message: e instanceof Error ? e.message : String(e) })
  } finally { setTestLoading(null) }
}
```

**Page structure — `<div className="max-w-2xl mx-auto p-xl flex flex-col gap-lg">`:**

1. `<h1 className="text-headline-md font-headline text-on-surface">System Settings</h1>`

2. Loading spinner when `isLoading`

3. **Accordion A — Platform Settings** (icon: `tune`):
   Wrapper: `<div className="bg-surface rounded-2xl border border-outline-variant overflow-hidden">`
   Header button: full width, `min-h-[44px]`, flex justify-between, hover:bg-surface-container-low
   - Left: tune icon + "Platform Settings" (text-title-md font-medium)
   - Right: expand_less/expand_more based on `open.platform`
   Body (when `open.platform`): `px-lg pb-lg pt-md flex flex-col gap-md border-t border-outline-variant`
   - App Name text input
   - Base URL url input
   - Maintenance Mode toggle (bg-primary when true, aria-pressed)
   - Trial Days number input (min=0)
   - Saved banner (conditional on `platformSaved`)
   - Error banner (conditional on `updateSetting.error`)
   - Save button (type=button, onClick=handleSavePlatform, self-end)

4. **Accordion B — Email / SMTP** (icon: `mail`):
   Same wrapper structure.
   Body fields:
   - SMTP Host text input
   - SMTP Port number input
   - SMTP User text input
   - SMTP Password masked input with eye toggle (aria-label="Show/Hide password")
   - Test SMTP button (type=button, onClick=handleTestSmtp, disabled when testLoading==='smtp')
   - smtpTestResult inline banner (directly below test button):
     success: bg-surface-container-low border-outline-variant text-secondary
     failure: bg-error/10 border-error/30 text-error
   - Saved banner (conditional on `smtpSaved`)
   - Error banner
   - Save button (type=button, onClick=handleSaveSmtp, self-end)

5. **Accordion C — Feature Flags** (icon: `flag`):
   Same wrapper structure. Body is non-interactive:
   ```tsx
   <div className="bg-surface-container-low rounded-xl border border-outline-variant p-lg flex items-center gap-md opacity-60">
     <MaterialIcon name="flag" size={28} className="text-on-surface-variant flex-shrink-0" />
     <div>
       <p className="text-body-md font-medium text-on-surface">Feature Flag Management</p>
       <p className="text-label-md text-on-surface-variant">Coming soon — Phase 4</p>
     </div>
   </div>
   ```
   No Save button for this section.

Rules: No `any`. No raw hex. No emoji. All inputs + buttons `min-h-[44px]`. Hooks called before early return. Export `default function SystemSettingsPage`.
  </action>

  <verify>
    <automated>cd D:\Development\AnimalClinic\src\frontend && npx tsc --noEmit 2>&1 | head -30</automated>
  </verify>

  <acceptance_criteria>
    - File exists; exports default SystemSettingsPage
    - Non-superadmin role renders "Access Denied" card (not a redirect) (SYSADM-01 inline guard)
    - 3 accordion sections with buttons, collapsed by default (SYSADM-01)
    - Platform section: App Name, Base URL, Maintenance toggle (aria-pressed), Trial Days, Save button (SYSADM-02)
    - SMTP section: Host, Port, User, Password (masked + eye toggle), Test SMTP, inline result, Save button (SYSADM-03)
    - Feature Flags section: Coming Soon card, no Save button (SYSADM-04)
    - All hooks called before early return (Rules of Hooks)
    - All interactive elements min-h-[44px]
    - max-w-2xl for 768px (UX-03)
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>

  <done>SystemSettingsPage renders accordion settings with inline access guard, Platform/SMTP/Feature Flags sections.</done>
</task>

<task type="auto">
  <name>Task 3: Add routes and barrel exports</name>
  <files>
    src/frontend/src/App.tsx
    src/frontend/src/views/settings/index.ts
  </files>

  <read_first>
    - src/frontend/src/App.tsx — read current state to find exact insertion point for lazy imports and routes
    - src/frontend/src/views/settings/index.ts — read current exports to append without duplication
  </read_first>

  <action>
**App.tsx — add lazy imports and routes:**

Add two lazy import declarations in the `// ── Settings pages ───` block:
```tsx
const IntegrationsPage   = lazy(() => import('./views/settings/IntegrationsPage'))
const SystemSettingsPage = lazy(() => import('./views/settings/SystemSettingsPage'))
```

Add two routes inside the `<Route path="/settings" ...>` block, after the existing payment route:
```tsx
<Route path="integrations" element={<IntegrationsPage/>}/>
<Route path="system"       element={<SystemSettingsPage/>}/>
```

**settings/index.ts — append exports:**

Append (do not duplicate if already present):
```typescript
export { default as IntegrationsPage }   from './IntegrationsPage'
export { default as SystemSettingsPage } from './SystemSettingsPage'
```
  </action>

  <verify>
    <automated>cd D:\Development\AnimalClinic\src\frontend && npx tsc --noEmit 2>&1 | head -20</automated>
  </verify>

  <acceptance_criteria>
    - IntegrationsPage and SystemSettingsPage lazy imports present in App.tsx
    - /settings/integrations and /settings/system routes present in App.tsx settings block
    - Both pages exported from settings/index.ts exactly once
    - No existing routes or exports removed
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>

  <done>Routes and barrel exports wired — /settings/integrations and /settings/system accessible.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Browser → /api/settings/clinic/integrations | Admin JWT required; staff/doctor receive 403 from rbacMiddleware |
| Browser → /admin/system-settings | Superadmin JWT required; all other roles receive 403 |
| SystemSettingsPage access guard | Inline card only — backend is authoritative; frontend guard is UX only |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03B-01 | Elevation of Privilege | Non-superadmin navigates to /settings/system | mitigate | Inline "Access Denied" card shown; backend rejects all requests with 403 |
| T-03B-02 | Information Disclosure | SMTP password visible in DOM | mitigate | input type=password by default; value masked from API; visibility toggle is user-initiated |
| T-03B-03 | Tampering | Masked SMTP password sent to backend unchanged | mitigate | MASK_PREFIX guard in handleSaveSmtp skips fields starting with '••••' |
| T-03B-04 | Information Disclosure | Lab API key visible in DOM | mitigate | Same visibility toggle + MASK_PREFIX guard as SMTP password |
</threat_model>

<verification>
Manual verification steps after execution:

1. `cd src/frontend && npm run dev`
2. Log in as `admin` → navigate to `/settings/integrations`
   - Lab API URL + masked key fields visible
   - Test Connection → shows "Testing…" spinner → result banner appears
   - Save → sticky bar shows updated timestamp

3. Navigate to `/settings/system` as `admin`:
   - "Access Denied" card renders; no redirect

4. Log in as `superadmin` → navigate to `/settings/system`:
   - 3 accordion sections visible, all collapsed
   - Click Platform → expands; edit App Name; click Save → success banner
   - Click SMTP → expands; click Test SMTP → spinner → inline result below button
   - Click Feature Flags → expands; Coming Soon card visible; no Save button

5. `cd src/frontend && npx tsc --noEmit` exits 0
</verification>

<success_criteria>
- IntegrationsPage and SystemSettingsPage created and type-check clean
- App.tsx has routes for /settings/integrations and /settings/system
- settings/index.ts exports both pages
- SettingsLayout nav (already has entries) shows both items to appropriate roles
- `npx tsc --noEmit` exits 0
- No raw hex, no emoji, no `any` types in new files
</success_criteria>

<output>
Create `.planning/phases/03-integrations-system-admin-qa/03B-SUMMARY.md` when done.
</output>
