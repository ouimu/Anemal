# UI-SPEC: Phase 3 — Integrations + System Settings

**Phase:** 03-integrations-system-admin-qa  
**Created:** 2026-06-11  
**Status:** Approved — ready for execution

---

## Scope

Two new settings pages delivered inside `SettingsLayout` (no layout changes needed — nav entries already registered):

| Page | Route | Role | File |
|------|-------|------|------|
| IntegrationsPage | `/settings/integrations` | `admin` | `views/settings/IntegrationsPage.tsx` |
| SystemSettingsPage | `/settings/system` | `superadmin` (guarded inline) | `views/settings/SystemSettingsPage.tsx` |

Plus two hooks and one backend test extension.

---

## Design Tokens in Use

All classes use Compassionate Care System tokens from `tailwind.config.js`. No raw hex.

| Token | Usage |
|-------|-------|
| `bg-surface` | Card backgrounds |
| `bg-surface-container-low` | Hover states, encryption banner, accordion open state |
| `border-outline-variant` | Card borders, input borders |
| `text-on-surface` | Primary text |
| `text-on-surface-variant` | Labels, secondary text, icons |
| `text-secondary` | Success states |
| `text-error`, `bg-error/10`, `border-error/30` | Error states |
| `bg-primary`, `text-surface` | Primary action buttons |
| `bg-background` | Sticky save bar backdrop |

---

## Shared Patterns (inherited from Phase 2)

These patterns MUST be replicated exactly — do not reinvent:

### Secret field masking
```tsx
// Load: value comes masked from API (e.g., "••••xxxx")
// Toggle: showField boolean, type={show ? 'text' : 'password'}
// Save guard: if (!field.startsWith('••••')) include in payload
const MASK_PREFIX = '••••'
```

### Test button + inline result
```tsx
const [testLoading, setTestLoading] = useState<'lab' | 'smtp' | null>(null)
const [testResult, setTestResult]   = useState<ResultType | null>(null)

async function handleTest(target: 'lab' | 'smtp') {
  setTestLoading(target); setTestResult(null)
  try {
    const res = await testMutation.mutateAsync()
    setTestResult(res)
  } catch (e) {
    setTestResult({ success: false, detail: e instanceof Error ? e.message : String(e) })
  } finally { setTestLoading(null) }
}
```

### TanStack Query v5 mutation pattern
- `useMutation` with no `onError` (errors surface via `mutation.error`)
- `onSuccess: () => qc.invalidateQueries({ queryKey: [...] })`

### Toast (saved banner)
```tsx
const [saved, setSaved] = useState(false)
// After successful save:
setSaved(true); setTimeout(() => setSaved(false), 2500)
```

### Sticky save bar
```tsx
<div className="sticky bottom-0 bg-background pt-sm pb-md flex items-center justify-between border-t border-outline-variant">
  <p className="text-label-md text-on-surface-variant">
    {lastUpdated ? `Last updated: ${lastUpdated}${byYou ? ' · by you' : ''}` : 'Never saved'}
  </p>
  <button type="submit" disabled={mutation.isPending}
    className="min-h-[44px] min-w-[44px] px-xl bg-primary text-surface rounded-xl text-body-md font-medium hover:opacity-90 disabled:opacity-50">
    {mutation.isPending ? 'Saving…' : 'Save Changes'}
  </button>
</div>
```

---

## 1. IntegrationsPage

**File:** `src/frontend/src/views/settings/IntegrationsPage.tsx`

### Component skeleton
```tsx
export default function IntegrationsPage() {
  const { data, isLoading } = useIntegrationsSettings()
  const update = useUpdateIntegrations()
  const testIntegrations = useTestIntegrations()
  const userId = useAuthStore(s => s.userId)

  const [form, setForm] = useState<IntegrationsForm>({ labApiUrl: '', labApiKey: '' })
  const [saved, setSaved] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [testLoading, setTestLoading] = useState<'lab' | null>(null)
  const [testResult, setTestResult] = useState<{ success: boolean; detail?: string } | null>(null)

  useEffect(() => {
    if (!data) return
    setForm({ labApiUrl: data.labApiUrl ?? '', labApiKey: data.labApiKey ?? '' })
  }, [data])

  // ... handleTestLab, handleSave

  if (isLoading) return <LoadingSpinner />

  return (
    <form onSubmit={handleSave} className="max-w-2xl mx-auto p-xl flex flex-col gap-lg">
      {/* h1, banners, Lab API card, placeholder cards, sticky save bar */}
    </form>
  )
}
```

### Banners (in order, below h1)

**Encryption banner** (always visible):
```tsx
<div className="px-md py-sm bg-surface-container-low border border-outline-variant rounded-xl text-body-md text-on-surface flex items-center gap-sm">
  <MaterialIcon name="lock" size={18} />
  API keys are encrypted before storage
</div>
```

**Saved banner** (conditional):
```tsx
{saved && (
  <div className="px-md py-sm bg-surface-container-low border border-outline-variant rounded-xl text-body-md text-secondary flex items-center gap-sm">
    <MaterialIcon name="check_circle" size={18} />
    Changes saved successfully
  </div>
)}
```

**Error banner** (conditional):
```tsx
{update.error && (
  <div className="px-md py-sm bg-error/10 border border-error/30 rounded-xl text-body-md text-error">
    Failed to save: {(update.error as Error).message}
  </div>
)}
```

**Test result banner** (conditional):
```tsx
{testResult && (
  <div className={`px-md py-sm rounded-xl text-body-md flex items-center gap-sm border
    ${testResult.success
      ? 'bg-surface-container-low border-outline-variant text-secondary'
      : 'bg-error/10 border-error/30 text-error'}`}>
    <MaterialIcon name={testResult.success ? 'check_circle' : 'error'} size={18} />
    Test connection: {testResult.detail ?? (testResult.success ? 'Connected successfully' : 'Connection failed')}
  </div>
)}
```

### Lab API card

```tsx
<div className="bg-surface rounded-2xl border border-outline-variant p-lg flex flex-col gap-md">
  <h2 className="text-title-md font-medium text-on-surface">Lab API</h2>

  {/* Lab API Base URL */}
  <div className="flex flex-col gap-xs">
    <label className="text-label-md text-on-surface-variant">Lab API Base URL</label>
    <input
      type="url"
      value={form.labApiUrl}
      onChange={e => setForm(p => ({ ...p, labApiUrl: e.target.value }))}
      placeholder="https://lab.example.com/api"
      className="min-h-[44px] px-md border border-outline-variant rounded-xl text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary w-full"
    />
  </div>

  {/* Lab API Key — masked */}
  <div className="flex flex-col gap-xs">
    <label className="text-label-md text-on-surface-variant">Lab API Key</label>
    <div className="relative">
      <input
        type={showApiKey ? 'text' : 'password'}
        value={form.labApiKey}
        onChange={e => setForm(p => ({ ...p, labApiKey: e.target.value }))}
        placeholder="Paste your Lab API key"
        className="min-h-[44px] px-md pr-14 border border-outline-variant rounded-xl text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary w-full"
      />
      <button
        type="button"
        onClick={() => setShowApiKey(v => !v)}
        className="absolute right-0 top-0 h-full min-w-[44px] flex items-center justify-center text-on-surface-variant hover:text-on-surface"
        aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
      >
        <MaterialIcon name={showApiKey ? 'visibility_off' : 'visibility'} size={20} />
      </button>
    </div>
  </div>

  {/* Test Connection button */}
  <button
    type="button"
    onClick={handleTestLab}
    disabled={testLoading === 'lab'}
    className="min-h-[44px] min-w-[44px] px-lg border border-outline-variant rounded-xl text-body-md text-on-surface hover:bg-surface-container-low disabled:opacity-50 transition-colors self-start"
  >
    {testLoading === 'lab' ? 'Testing…' : 'Test Connection'}
  </button>
</div>
```

### Placeholder cards (2, non-interactive)

```tsx
{/* X-ray / DICOM Viewer */}
<div className="bg-surface rounded-2xl border border-outline-variant p-lg flex items-center gap-md opacity-60">
  <MaterialIcon name="radiology" size={28} className="text-on-surface-variant flex-shrink-0" />
  <div>
    <p className="text-body-md font-medium text-on-surface">X-ray / DICOM Viewer</p>
    <p className="text-label-md text-on-surface-variant">Coming soon — Phase 4</p>
  </div>
</div>

{/* Accounting Software */}
<div className="bg-surface rounded-2xl border border-outline-variant p-lg flex items-center gap-md opacity-60">
  <MaterialIcon name="receipt_long" size={28} className="text-on-surface-variant flex-shrink-0" />
  <div>
    <p className="text-body-md font-medium text-on-surface">Accounting Software</p>
    <p className="text-label-md text-on-surface-variant">Coming soon — Phase 4</p>
  </div>
</div>
```

### Save logic
```tsx
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

---

## 2. SystemSettingsPage

**File:** `src/frontend/src/views/settings/SystemSettingsPage.tsx`

### Access guard

Check role at the top of the render — inline card, no redirect:
```tsx
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

### Accordion state (all collapsed by default)
```tsx
const [open, setOpen] = useState({ platform: false, smtp: false, flags: false })
function toggle(k: keyof typeof open) { setOpen(p => ({ ...p, [k]: !p[k] })) }
```

### Accordion section wrapper (reusable pattern)

```tsx
{/* Outer container */}
<div className="bg-surface rounded-2xl border border-outline-variant overflow-hidden">
  {/* Header — clickable, full width */}
  <button
    type="button"
    onClick={() => toggle('platform')}
    className="w-full flex items-center justify-between px-lg min-h-[44px] hover:bg-surface-container-low transition-colors"
  >
    <div className="flex items-center gap-md">
      <MaterialIcon name="tune" size={22} className="text-on-surface-variant" />
      <span className="text-title-md font-medium text-on-surface">Platform Settings</span>
    </div>
    <MaterialIcon
      name={open.platform ? 'expand_less' : 'expand_more'}
      size={22}
      className="text-on-surface-variant"
    />
  </button>

  {/* Body — conditionally shown */}
  {open.platform && (
    <div className="px-lg pb-lg pt-md flex flex-col gap-md border-t border-outline-variant">
      {/* Fields + per-section Save */}
    </div>
  )}
</div>
```

### Section A — Platform Settings

**Icon:** `tune` | **State:** `{ appName, baseUrl, maintenanceMode, trialDays }`

Fields inside the accordion body:
```tsx
{/* App Name */}
<div className="flex flex-col gap-xs">
  <label className="text-label-md text-on-surface-variant">App Name</label>
  <input type="text" value={platform.appName}
    onChange={e => setPlatform(p => ({ ...p, appName: e.target.value }))}
    className="min-h-[44px] px-md border border-outline-variant rounded-xl text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary w-full" />
</div>

{/* Base URL */}
<div className="flex flex-col gap-xs">
  <label className="text-label-md text-on-surface-variant">Base URL</label>
  <input type="url" value={platform.baseUrl}
    onChange={e => setPlatform(p => ({ ...p, baseUrl: e.target.value }))}
    className="min-h-[44px] px-md border border-outline-variant rounded-xl text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary w-full" />
</div>

{/* Maintenance Mode — toggle */}
<div className="flex items-center justify-between">
  <span className="text-body-md text-on-surface">Maintenance Mode</span>
  <button
    type="button"
    onClick={() => setPlatform(p => ({ ...p, maintenanceMode: !p.maintenanceMode }))}
    className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl transition-colors
      ${platform.maintenanceMode
        ? 'bg-primary text-surface'
        : 'bg-surface-container-low text-on-surface-variant border border-outline-variant'}`}
    aria-label="Toggle maintenance mode"
    aria-pressed={platform.maintenanceMode}
  >
    <MaterialIcon name={platform.maintenanceMode ? 'toggle_on' : 'toggle_off'} size={24} />
  </button>
</div>

{/* Trial Days */}
<div className="flex flex-col gap-xs">
  <label className="text-label-md text-on-surface-variant">Trial Days</label>
  <input type="number" min="0" value={platform.trialDays}
    onChange={e => setPlatform(p => ({ ...p, trialDays: e.target.value }))}
    className="min-h-[44px] px-md border border-outline-variant rounded-xl text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary w-full" />
</div>

{/* Section Save */}
<button type="button" onClick={handleSavePlatform} disabled={updateSetting.isPending}
  className="min-h-[44px] min-w-[44px] px-xl bg-primary text-surface rounded-xl text-body-md font-medium hover:opacity-90 disabled:opacity-50 self-end">
  {updateSetting.isPending ? 'Saving…' : 'Save'}
</button>
```

### Section B — Email / SMTP

**Icon:** `mail` | **State:** `{ smtpHost, smtpPort, smtpUser, smtpPassword }`

Fields inside the accordion body:
```tsx
{/* SMTP Host */}
<div className="flex flex-col gap-xs">
  <label className="text-label-md text-on-surface-variant">SMTP Host</label>
  <input type="text" value={smtp.smtpHost}
    onChange={e => setSmtp(p => ({ ...p, smtpHost: e.target.value }))}
    placeholder="smtp.example.com"
    className="min-h-[44px] px-md border border-outline-variant rounded-xl ..." />
</div>

{/* SMTP Port */}
<div className="flex flex-col gap-xs">
  <label className="text-label-md text-on-surface-variant">SMTP Port</label>
  <input type="number" value={smtp.smtpPort}
    onChange={e => setSmtp(p => ({ ...p, smtpPort: e.target.value }))}
    className="min-h-[44px] px-md border border-outline-variant rounded-xl ..." />
</div>

{/* SMTP User */}
<div className="flex flex-col gap-xs">
  <label className="text-label-md text-on-surface-variant">SMTP User</label>
  <input type="text" value={smtp.smtpUser}
    onChange={e => setSmtp(p => ({ ...p, smtpUser: e.target.value }))}
    className="min-h-[44px] px-md border border-outline-variant rounded-xl ..." />
</div>

{/* SMTP Password — masked */}
<div className="flex flex-col gap-xs">
  <label className="text-label-md text-on-surface-variant">SMTP Password</label>
  <div className="relative">
    <input type={showSmtpPass ? 'text' : 'password'} value={smtp.smtpPassword}
      onChange={e => setSmtp(p => ({ ...p, smtpPassword: e.target.value }))}
      placeholder="SMTP password"
      className="min-h-[44px] px-md pr-14 border border-outline-variant rounded-xl ... w-full" />
    <button type="button" onClick={() => setShowSmtpPass(v => !v)}
      className="absolute right-0 top-0 h-full min-w-[44px] flex items-center justify-center text-on-surface-variant hover:text-on-surface"
      aria-label={showSmtpPass ? 'Hide password' : 'Show password'}>
      <MaterialIcon name={showSmtpPass ? 'visibility_off' : 'visibility'} size={20} />
    </button>
  </div>
</div>

{/* Test SMTP button */}
<button type="button" onClick={handleTestSmtp} disabled={testLoading === 'smtp'}
  className="min-h-[44px] min-w-[44px] px-lg border border-outline-variant rounded-xl text-body-md hover:bg-surface-container-low disabled:opacity-50 self-start">
  {testLoading === 'smtp' ? 'Testing…' : 'Test SMTP Connection'}
</button>

{/* Test SMTP inline result — shown directly below the button */}
{smtpTestResult && (
  <div className={`px-md py-sm rounded-xl text-body-md flex items-center gap-sm border
    ${smtpTestResult.success
      ? 'bg-surface-container-low border-outline-variant text-secondary'
      : 'bg-error/10 border-error/30 text-error'}`}>
    <MaterialIcon name={smtpTestResult.success ? 'check_circle' : 'error'} size={18} />
    {smtpTestResult.message ?? (smtpTestResult.success ? 'SMTP connection successful' : 'SMTP connection failed')}
  </div>
)}

{/* Section Save */}
<button type="button" onClick={handleSaveSmtp} disabled={updateSetting.isPending}
  className="min-h-[44px] min-w-[44px] px-xl bg-primary text-surface rounded-xl text-body-md font-medium hover:opacity-90 disabled:opacity-50 self-end">
  {updateSetting.isPending ? 'Saving…' : 'Save'}
</button>
```

### Section C — Feature Flags

**Icon:** `flag` | **No Save button** (non-interactive placeholder)

```tsx
{open.flags && (
  <div className="px-lg pb-lg pt-md border-t border-outline-variant">
    <div className="bg-surface-container-low rounded-xl border border-outline-variant p-lg flex items-center gap-md opacity-60">
      <MaterialIcon name="flag" size={28} className="text-on-surface-variant flex-shrink-0" />
      <div>
        <p className="text-body-md font-medium text-on-surface">Feature Flag Management</p>
        <p className="text-label-md text-on-surface-variant">Coming soon — Phase 4</p>
      </div>
    </div>
  </div>
)}
```

### Data loading from `useSystemSettings`
```tsx
useEffect(() => {
  if (!data) return
  const get = (k: string) => data.find(r => r.key === k)?.value ?? ''
  setPlatform({
    appName:         get('app_name'),
    baseUrl:         get('base_url'),
    maintenanceMode: get('maintenance_mode') === 'true',
    trialDays:       get('trial_days'),
  })
  setSmtp({
    smtpHost:     get('smtp_host'),
    smtpPort:     get('smtp_port') || '587',
    smtpUser:     get('smtp_user'),
    smtpPassword: get('smtp_password'),
  })
}, [data])
```

### Per-section save logic (Platform example — SMTP identical)
```tsx
async function handleSavePlatform() {
  const MASK_PREFIX = '••••'
  const fields: Array<[string, string]> = [
    ['app_name',          platform.appName],
    ['base_url',          platform.baseUrl],
    ['maintenance_mode',  String(platform.maintenanceMode)],
    ['trial_days',        platform.trialDays],
  ]
  // Fire PUT per field sequentially; skip masked secrets unchanged
  for (const [key, value] of fields) {
    if (value.startsWith(MASK_PREFIX)) continue
    await updateSetting.mutateAsync({ key, value })
  }
  setPlatformSaved(true); setTimeout(() => setPlatformSaved(false), 2500)
}
```

---

## 3. Hooks

### `src/frontend/src/hooks/useIntegrationsSettings.ts`

```ts
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
    queryFn:  () => api.get('/api/v1/settings/clinic').then(r => r.data.data),
  })
}

export function useUpdateIntegrations() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: IntegrationsInput) =>
      api.put('/api/v1/settings/clinic/integrations', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'clinic'] }),
  })
}

export function useTestIntegrations() {
  return useMutation({
    mutationFn: () =>
      api.post('/api/v1/settings/clinic/integrations/test').then(r => r.data.data as IntegrationsTestResult),
  })
}
```

### `src/frontend/src/hooks/useSystemSettings.ts`

```ts
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
    queryFn:  () => api.get('/api/v1/settings/admin/system-settings').then(r => r.data.data),
  })
}

export function useUpdateSystemSetting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      api.put(`/api/v1/settings/admin/system-settings/${key}`, { value }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'system'] }),
  })
}

export function useTestSmtp() {
  return useMutation({
    mutationFn: () =>
      api.post('/api/v1/settings/admin/system-settings/smtp/test').then(r => r.data.data as SmtpTestResult),
  })
}
```

---

## 4. App.tsx Changes

Add to lazy imports block:
```tsx
const IntegrationsPage   = lazy(() => import('./views/settings/IntegrationsPage'))
const SystemSettingsPage = lazy(() => import('./views/settings/SystemSettingsPage'))
```

Add to `/settings` route block:
```tsx
<Route path="integrations" element={<IntegrationsPage/>}/>
<Route path="system"       element={<SystemSettingsPage/>}/>
```

---

## 5. settings/index.ts Changes

Append two exports:
```ts
export { default as IntegrationsPage }   from './IntegrationsPage'
export { default as SystemSettingsPage } from './SystemSettingsPage'
```

---

## 6. TC-S010 Backend Test

**File:** `src/backend/tests/integration/settings-api.test.ts` — extend (do not create new file)

```ts
describe('TC-S010: integration test-connection timeout', () => {
  it('returns { success: false } within 10 s when target URL never responds', async () => {
    jest.useFakeTimers()
    const neverResolve = jest.fn(() => new Promise(() => {})) // hung fetch
    global.fetch = neverResolve as unknown as typeof fetch

    const responsePromise = request(app)
      .post('/api/v1/settings/clinic/integrations/test')
      .set('Authorization', `Bearer ${adminToken}`)

    await jest.advanceTimersByTimeAsync(10_001)
    const response = await responsePromise

    expect(response.status).toBe(200)
    expect(response.body.data.success).toBe(false)
    expect(response.body.data.detail).toMatch(/timed out/i)

    jest.useRealTimers()
  })
})
```

---

## Accessibility Checklist

- [ ] All interactive elements ≥ `min-h-[44px] min-w-[44px]`
- [ ] Secret toggle buttons have `aria-label` (Show/Hide)
- [ ] Maintenance Mode toggle has `aria-pressed`
- [ ] Accordion headers are `<button type="button">` (not `<div>`)
- [ ] Test result banners use icon + text (not colour alone)
- [ ] Responsive at 768px (sidebar collapses via existing `SettingsLayout` LAYOUT-04)

---

## Files Summary

| Action | File |
|--------|------|
| **Create** | `src/frontend/src/views/settings/IntegrationsPage.tsx` |
| **Create** | `src/frontend/src/views/settings/SystemSettingsPage.tsx` |
| **Create** | `src/frontend/src/hooks/useIntegrationsSettings.ts` |
| **Create** | `src/frontend/src/hooks/useSystemSettings.ts` |
| **Modify** | `src/frontend/src/App.tsx` — 2 lazy imports + 2 routes |
| **Modify** | `src/frontend/src/views/settings/index.ts` — 2 exports |
| **Extend** | `src/backend/tests/integration/settings-api.test.ts` — TC-S010 |
| **No change** | `src/frontend/src/layouts/SettingsLayout.tsx` — nav already registered |

---

## Verification Steps

1. `cd src/frontend && npm run dev` — navigate to `/settings/integrations` as admin:
   - Lab API form visible with URL + masked key fields
   - Test Connection button shows "Testing…" spinner, then displays result banner
   - Save persists, sticky bar shows updated timestamp

2. Navigate to `/settings/system` as superadmin:
   - Three accordion sections collapsed by default
   - Expand Platform → edit App Name → Save → success toast
   - Expand SMTP → Test SMTP → inline result below button

3. Navigate to `/settings/system` as admin:
   - "Access Denied" card visible — no redirect

4. `cd src/backend && npm test -- --testPathPattern=settings-api`:
   - TC-S010 passes
   - Full suite still green (no regressions)
