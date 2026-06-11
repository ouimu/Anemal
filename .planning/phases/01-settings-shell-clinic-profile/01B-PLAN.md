---
plan: 01B
phase: 1
wave: 2
depends_on:
  - 01A
files_modified:
  - src/frontend/src/hooks/useClinicSettings.ts
  - src/frontend/src/views/settings/ClinicProfilePage.tsx
  - src/frontend/src/views/settings/index.ts
autonomous: true
requirements:
  - CLINIC-01
  - CLINIC-03
  - LAYOUT-03
  - UX-01

must_haves:
  truths:
    - "Clinic admin loads /settings/clinic-profile and sees current clinic name, phone, address, taxId, website populated from GET /api/v1/settings/clinic"
    - "Clinic admin edits Clinic Name, saves, refreshes page — the new name is still present (persisted via PUT /api/v1/settings/clinic)"
    - "Submitting with empty Clinic Name shows inline error 'Clinic name is required' without calling the API"
    - "Submitting with an invalid website URL shows inline error 'Must be a valid URL (https://...)' without calling the API"
    - "Save button shows loading state while PUT is in flight (isPending from useMutation)"
    - "A success toast/banner appears for 2500ms after a successful save"
    - "Footer shows 'Last updated: [formatted date]' and appends 'by you' when updatedBy === currentUserId"
  artifacts:
    - path: "src/frontend/src/hooks/useClinicSettings.ts"
      provides: "useClinicSettings (useQuery) and useUpdateClinicProfile (useMutation) hooks"
      exports: ["useClinicSettings", "useUpdateClinicProfile", "ClinicSettingsData", "ClinicProfileInput"]
    - path: "src/frontend/src/views/settings/ClinicProfilePage.tsx"
      provides: "Clinic Profile form page connected to live API"
      exports: ["default ClinicProfilePage"]
    - path: "src/frontend/src/views/settings/index.ts"
      provides: "Barrel export for settings views"
      contains: "export"
  key_links:
    - from: "ClinicProfilePage"
      to: "useClinicSettings"
      via: "const { data, isLoading } = useClinicSettings()"
      pattern: "useClinicSettings"
    - from: "ClinicProfilePage"
      to: "useUpdateClinicProfile"
      via: "const update = useUpdateClinicProfile()"
      pattern: "useUpdateClinicProfile"
    - from: "useClinicSettings"
      to: "GET /api/v1/settings/clinic"
      via: "api.get('/api/v1/settings/clinic').then(r => r.data.data)"
      pattern: "api\\.get.*settings/clinic"
    - from: "useUpdateClinicProfile"
      to: "PUT /api/v1/settings/clinic"
      via: "api.put('/api/v1/settings/clinic', data).then(r => r.data)"
      pattern: "api\\.put.*settings/clinic"
---

<objective>
Create the `useClinicSettings` React Query hook and the `ClinicProfilePage` form
component, wired end-to-end to `GET /PUT /api/v1/settings/clinic`. This plan
delivers Success Criterion 2: clinic admin updates Clinic Name and Phone, saves,
refreshes — values persist.

Purpose: First working data slice of the settings system. Establishes the hook
pattern (TanStack Query v5) that Phases 2 and 3 will replicate for Hours,
Notifications, Payment, and Integrations.

Output:
- `src/frontend/src/hooks/useClinicSettings.ts` — React Query hook (new)
- `src/frontend/src/views/settings/ClinicProfilePage.tsx` — form page (new)
- `src/frontend/src/views/settings/index.ts` — barrel export (new)
</objective>

<execution_context>
@D:\Development\AnimalClinic\.planning\phases\01-settings-shell-clinic-profile\01-RESEARCH.md
</execution_context>

<context>
@D:\Development\AnimalClinic\.planning\ROADMAP.md
@D:\Development\AnimalClinic\.planning\REQUIREMENTS.md
@D:\Development\AnimalClinic\.planning\phases\01-settings-shell-clinic-profile\01A-SUMMARY.md

<interfaces>
<!-- From src/frontend/src/hooks/useAdmin.ts — TanStack Query v5 pattern to model from -->
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../utils/api'
// useQuery: { queryKey, queryFn }
// useMutation: { mutationFn, onSuccess }
// mutations use mutation.isPending (NOT isLoading — v5 breaking change)

<!-- API response shape — GET /api/v1/settings/clinic -->
interface ClinicSettingsData {
  id:          number
  tenantId:    number
  logoUrl:     string | null
  phone:       string | null
  email:       string | null
  website:     string | null
  address:     string | null
  taxId:       string | null
  updatedBy:   number | null   // user ID, not name
  updatedAt:   string          // ISO timestamp
  tenant:      { name: string; subdomain: string }
  // (other fields exist — see RESEARCH.md — but ClinicProfilePage only uses the above)
}

<!-- PUT /api/v1/settings/clinic accepted fields (Zod strict — no extra fields) -->
interface ClinicProfileInput {
  name?:    string   // clinic name — updates tenants.name table
  logoUrl?: string   // valid URL or empty string; send data-URL for MVP
  address?: string
  phone?:   string
  email?:   string
  taxId?:   string
  website?: string
}

<!-- From src/frontend/src/store/authStore.ts -->
useAuthStore(s => s.userId)  // number | null — compare to data.updatedBy for "by you"

<!-- From src/frontend/src/utils/api.ts (existing) -->
import api from '../utils/api'
// api.get(url) → AxiosPromise; api.put(url, data) → AxiosPromise
// JWT injected automatically via interceptor — do NOT pass tenantId manually
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create useClinicSettings hook</name>
  <files>src/frontend/src/hooks/useClinicSettings.ts</files>

  <read_first>
    - src/frontend/src/hooks/useAdmin.ts — read in full; copy the exact TanStack Query v5 patterns (useQuery + useMutation structure, queryKey array, onSuccess invalidation)
    - src/frontend/src/utils/api.ts — confirm the default export and axios instance methods
  </read_first>

  <behavior>
    - useClinicSettings(): returns TanStack Query useQuery result; queryKey is ['settings', 'clinic']; queryFn calls api.get('/api/v1/settings/clinic').then(r => r.data.data)
    - useUpdateClinicProfile(): returns useMutation; mutationFn calls api.put('/api/v1/settings/clinic', data).then(r => r.data); onSuccess calls queryClient.invalidateQueries({ queryKey: ['settings', 'clinic'] })
    - mutation.isPending (NOT isLoading) is the correct v5 field for in-flight state
    - ClinicSettingsData interface exported — matches GET response shape
    - ClinicProfileInput interface exported — matches PUT accepted fields
  </behavior>

  <action>
Create `src/frontend/src/hooks/useClinicSettings.ts` with:

1. Export interface `ClinicSettingsData` — all fields from the GET response that
   ClinicProfilePage needs (id, tenantId, logoUrl, phone, email, website, address,
   taxId, updatedBy, updatedAt, tenant). Include other top-level fields from the
   full API shape as optional fields so the type doesn't reject the actual response.

2. Export interface `ClinicProfileInput` — the 7 writable fields accepted by PUT:
   name?, logoUrl?, address?, phone?, email?, taxId?, website? — all optional strings.

3. Export function `useClinicSettings()`:
     import { useQuery } from '@tanstack/react-query'
     import api from '../utils/api'
     export function useClinicSettings() {
       return useQuery<ClinicSettingsData>({
         queryKey: ['settings', 'clinic'],
         queryFn: () => api.get('/api/v1/settings/clinic').then(r => r.data.data),
       })
     }

4. Export function `useUpdateClinicProfile()`:
     import { useMutation, useQueryClient } from '@tanstack/react-query'
     export function useUpdateClinicProfile() {
       const qc = useQueryClient()
       return useMutation({
         mutationFn: (data: ClinicProfileInput) =>
           api.put('/api/v1/settings/clinic', data).then(r => r.data),
         onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'clinic'] }),
       })
     }

Critical rules:
- No `any` types. ClinicSettingsData must cover all fields returned by the API;
  add extra fields as optional (`smsRemindersEnabled?: boolean`, etc.) to avoid
  type errors when the full response object is used.
- Do NOT import or use `useAdminSettings` or `useUpdateSettings` from useAdmin.ts.
- Do NOT pass tenantId as a parameter — JWT interceptor handles it.
- TanStack Query v5: `useMutation` `onError` callback is removed in v5; handle
  errors in the component via `mutation.error` or `.catch()` on `mutateAsync`.
  </action>

  <verify>
    <automated>cd D:\Development\AnimalClinic\src\frontend && npx tsc --noEmit 2>&1 | grep "useClinicSettings" | head -10</automated>
  </verify>

  <acceptance_criteria>
    - File exports: `ClinicSettingsData` (interface), `ClinicProfileInput` (interface), `useClinicSettings` (function), `useUpdateClinicProfile` (function)
    - `useClinicSettings` uses queryKey `['settings', 'clinic']` and calls `api.get('/api/v1/settings/clinic').then(r => r.data.data)`
    - `useUpdateClinicProfile` calls `api.put('/api/v1/settings/clinic', data)` and invalidates `['settings', 'clinic']` on success
    - No `any` types anywhere in the file
    - `npx tsc --noEmit` produces zero errors referencing this file
  </acceptance_criteria>

  <done>useClinicSettings.ts exports both hooks and both interfaces with correct TanStack Query v5 patterns; TypeScript clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Create ClinicProfilePage.tsx</name>
  <files>
    src/frontend/src/views/settings/ClinicProfilePage.tsx
    src/frontend/src/views/settings/index.ts
  </files>

  <read_first>
    - src/frontend/src/views/admin/ClinicProfileTab.tsx — read in full; extract UI patterns (form layout, input styling, save button, success banner); DO NOT copy hook imports (those point to old API)
    - src/frontend/src/hooks/useClinicSettings.ts — just created; confirm exports before importing
    - src/frontend/src/store/authStore.ts — confirm userId field name for "by you" footer logic
    - stitch_vet_clinic_design_system/admin_control_center_1024x768/code.html — reference for settings page visual layout (form cards, section headers)
  </read_first>

  <behavior>
    - On load: form fields pre-populated from useClinicSettings data (name from data.tenant.name, phone/address/taxId/website/email from root fields)
    - Empty name submit: setErrors({ name: 'Clinic name is required' }); mutateAsync NOT called
    - Invalid website submit: setErrors({ website: 'Must be a valid URL (https://...)' }); mutateAsync NOT called
    - Valid submit: mutateAsync called with form values; button shows isPending state; on success setSaved(true) for 2500ms
    - Footer shows: 'Last updated: [formatted date]'; if data.updatedBy === userId appends ' · by you'
  </behavior>

  <action>
Create `src/frontend/src/views/settings/ClinicProfilePage.tsx`.

State shape:
  interface FormState {
    name:    string
    phone:   string
    address: string
    taxId:   string
    website: string
    email:   string
    logoUrl: string
  }

On data load, initialize form (inside a useEffect watching `data`):
  useEffect(() => {
    if (!data) return
    setForm({
      name:    data.tenant.name ?? '',
      phone:   data.phone    ?? '',
      address: data.address  ?? '',
      taxId:   data.taxId    ?? '',
      website: data.website  ?? '',
      email:   data.email    ?? '',
      logoUrl: data.logoUrl  ?? '',
    })
  }, [data])

Validation function (run before every submit):
  function validate(): boolean {
    const e: Record<string, string> = {}
    if (!form.name.trim()) e.name = 'Clinic name is required'
    if (form.website && !/^https?:\/\/.+/.test(form.website))
      e.website = 'Must be a valid URL (https://...)'
    setErrors(e)
    return Object.keys(e).length === 0
  }

Submit handler:
  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    try {
      await update.mutateAsync(form)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch {
      // error displayed via update.error
    }
  }

"Last updated" footer logic:
  const lastUpdated = data?.updatedAt
    ? new Date(data.updatedAt).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
    : null
  const byYou = data?.updatedBy != null && data.updatedBy === userId

Page structure:
  <div className="p-xl max-w-2xl">
    <h1 className="text-headline-md font-headline font-bold text-on-surface mb-lg">
      Clinic Profile
    </h1>

    {/* Success banner */}
    {saved && (
      <div className="mb-md px-md py-sm bg-surface-container-low border border-outline-variant rounded-xl text-body-md text-secondary flex items-center gap-sm">
        <MaterialIcon name="check_circle" size={18} />
        Changes saved successfully
      </div>
    )}

    {/* Error banner for API errors */}
    {update.error && (
      <div className="mb-md px-md py-sm bg-error/10 border border-error/30 rounded-xl text-body-md text-error">
        Failed to save: {(update.error as Error).message}
      </div>
    )}

    <form onSubmit={handleSave} className="flex flex-col gap-lg">
      {/* Clinic Name */}
      {/* Phone */}
      {/* Email */}
      {/* Address (textarea) */}
      {/* Tax ID */}
      {/* Website URL */}
      {/* (Logo upload is deferred to Plan 01C) — show logoUrl as read-only text for now */}

      {/* Sticky save button row */}
      <div className="sticky bottom-0 bg-background pt-sm pb-md flex items-center justify-between border-t border-outline-variant">
        <p className="text-label-md text-on-surface-variant">
          {lastUpdated
            ? `Last updated: ${lastUpdated}${byYou ? ' · by you' : ''}`
            : 'Never saved'}
        </p>
        <button
          type="submit"
          disabled={update.isPending}
          className="min-h-[44px] min-w-[44px] px-xl bg-primary text-surface rounded-xl text-body-md font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {update.isPending ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </form>
  </div>

Input field pattern (replicate for each field):
  <div className="flex flex-col gap-xs">
    <label className="text-body-sm font-medium text-on-surface-variant" htmlFor="clinicName">
      Clinic Name <span className="text-error">*</span>
    </label>
    <input
      id="clinicName"
      type="text"
      value={form.name}
      onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
      className="min-h-[44px] px-md border border-outline-variant rounded-xl text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary"
    />
    {errors.name && <p className="text-label-md text-error">{errors.name}</p>}
  </div>

Loading state: if `isLoading` from `useClinicSettings()`, render a skeleton/spinner
div instead of the form:
  if (isLoading) return (
    <div className="p-xl flex items-center gap-sm text-on-surface-variant">
      <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"/>
      <span className="text-body-md">Loading clinic profile…</span>
    </div>
  )

Type rules:
- No `any`. Cast API error as `(update.error as Error).message`.
- All form field inputs must have `min-h-[44px]` (UX-02).
- No raw hex colors — tokens only.
- No emoji — MaterialIcon only.

Also create `src/frontend/src/views/settings/index.ts`:
  export { default as ClinicProfilePage } from './ClinicProfilePage'
  </action>

  <verify>
    <automated>cd D:\Development\AnimalClinic\src\frontend && npx tsc --noEmit 2>&1 | head -30</automated>
  </verify>

  <acceptance_criteria>
    - File `src/frontend/src/views/settings/ClinicProfilePage.tsx` exists and exports `default ClinicProfilePage`
    - `src/frontend/src/views/settings/index.ts` exists and exports `ClinicProfilePage`
    - `useClinicSettings()` is called (not `useAdminSettings`)
    - `useUpdateClinicProfile()` is called (not `useUpdateSettings`)
    - `api.get('/api/v1/settings/clinic')` is NOT called directly in the component — goes through the hook
    - `update.isPending` used (NOT `update.isLoading`)
    - `validate()` function returns false and sets error state when name is empty
    - `validate()` function returns false and sets error state when website is non-empty and doesn't match `^https?:\/\/.+`
    - Save button has `disabled={update.isPending}` attribute
    - Footer renders `Last updated:` text from `data.updatedAt`
    - All input elements have `min-h-[44px]` class
    - No `any` types
    - No raw hex colors
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>

  <done>ClinicProfilePage loads clinic data from GET /api/v1/settings/clinic, allows editing all 6 fields, validates before submit, persists via PUT, shows success toast and last-updated footer. TypeScript clean.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Browser form → PUT /api/v1/settings/clinic | User-submitted form data; validated client-side and server-side (Zod strict) |
| API response → form pre-population | GET response populates form; masked secrets pass through as-is |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01B-01 | Tampering | Logo data-URL size | mitigate | 500KB client-side guard in Plan 01C; for this plan, logoUrl is read-only text display |
| T-01B-02 | Tampering | Extra fields in PUT body (schema is .strict()) | mitigate | ClinicProfileInput interface contains exactly the 7 allowed fields; TypeScript prevents accidental extras |
| T-01B-03 | Information Disclosure | Clinic profile data visible to wrong role | accept | Backend `adminOnly` rbacMiddleware on GET/PUT routes returns 403; page renders error state from `update.error` |
| T-01B-04 | Tampering | Masked secret fields sent through PUT | accept | ClinicProfilePage has no secret fields (logoUrl is image URL, not encrypted secret); backend skips masked values anyway |
</threat_model>

<verification>
Manual verification after execution:

1. Start dev server: `cd src/frontend && npm run dev`
2. Log in as admin → navigate to `/settings/clinic-profile`
3. Confirm form loads with current clinic name populated (not blank)
4. Confirm phone, address, taxId, website, email fields all pre-populated
5. Clear the Clinic Name field → click Save Changes → see inline error "Clinic name is required" (no API call)
6. Enter "bad-url" in Website → click Save → see "Must be a valid URL (https://...)" inline error
7. Enter valid name + "https://anemal.clinic" in Website → click Save → button shows "Saving…" during PUT → "Changes saved successfully" appears for ~2.5s
8. Hard-refresh the page → clinic name change persists (GET returns updated value)
9. Footer shows "Last updated: [date]" — if you are the editor, appends "· by you"
10. Backend test: `curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/v1/settings/clinic` returns updated clinicName
</verification>

<success_criteria>
- `src/frontend/src/hooks/useClinicSettings.ts` exports `useClinicSettings`, `useUpdateClinicProfile`, `ClinicSettingsData`, `ClinicProfileInput`
- `src/frontend/src/views/settings/ClinicProfilePage.tsx` exports `default ClinicProfilePage`
- `src/frontend/src/views/settings/index.ts` barrel exports ClinicProfilePage
- `npx tsc --noEmit` exits 0 across all new files
- Manual: form pre-populates from GET; inline validation fires before submit; PUT persists; success toast shown
- CLINIC-01: all 6 fields (name, phone, address, taxId, website, email) present and writable
- CLINIC-03: inline validation for required name and URL format before submit
- LAYOUT-03: sticky save button + last updated footer rendered
- UX-01: logoUrl field not a secret field — no masking logic needed in this plan
</success_criteria>

<output>
Create `.planning/phases/01-settings-shell-clinic-profile/01B-SUMMARY.md` when done.
</output>
