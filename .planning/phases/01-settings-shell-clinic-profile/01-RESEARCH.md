# Phase 1: Settings Shell + Clinic Profile — Research

**Researched:** 2026-06-11
**Domain:** React frontend — layout shell, React Query data fetching, settings page architecture
**Confidence:** HIGH — all findings verified directly from codebase source files

---

## Summary

The Settings Shell phase wires a new `/settings` route into the existing React app, establishes a dedicated `SettingsLayout` sidebar, and connects `ClinicProfilePage` to the live `GET /PUT /api/v1/settings/clinic` API. The backend (Phase 1.5-A/B) is complete and production-ready. The frontend patterns are already well-established in `ClinicLayout` and `AdminLayout` — the new layout is a direct derivation of these.

The key architectural finding: `AdminSettings.tsx` currently re-exports `ClinicSettingsTab` (operating hours/notification toggles — the OLD pre-1.5 format). `ClinicProfileTab.tsx` already has a functional clinic profile form using `useAdminSettings`/`useUpdateSettings` hooks that point to `/admin/settings` (old route). For Phase 1, the planner must create new hooks pointing to `/api/v1/settings/clinic` and new page components, NOT reuse or extend the old admin hooks/routes. The old admin route (`/admin/settings`) remains untouched.

**Primary recommendation:** Build `SettingsLayout` as a standalone layout (route prefix `/settings`), modeled exactly on `ClinicLayout`/`AdminLayout`, with a role-filtered nav array and `useUiStore` collapse support. Create `useClinicSettings` hook using TanStack Query v5 patterns matching existing `useAdminSettings`. Lift the `ClinicProfileTab` UI patterns into `ClinicProfilePage` but point it at the new API endpoint.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LAYOUT-01 | Settings sidebar nav filtered by role (admin=all; staff=My Preferences only; superadmin=System Settings only) | Role read from `useAuthStore(s => s.role)` — same pattern as layouts; nav array filtered by `role` at render time |
| LAYOUT-02 | Navigate between sections without full page reload | React Router `<NavLink>` + `<Outlet>` pattern — already used in ClinicLayout and AdminLayout |
| LAYOUT-03 | Each section shows sticky "Save Changes" button and "Last updated by [name] at [time]" footer | `updatedBy` (userId FK) and `updatedAt` are on `tenant_settings` — API returns them; need user name join or separate lookup |
| LAYOUT-04 | Settings sidebar collapses to icons-only at 768px | `useUiStore` `sidebarOpen`/`toggleSidebar` — exact pattern from ClinicLayout; same `w-56`/`w-14` toggle |
| CLINIC-01 | Admin updates Clinic Name, Address, Phone, Tax ID, Website URL | `PUT /api/v1/settings/clinic` accepts all these fields; schema verified in `clinicProfileSchema` |
| CLINIC-02 | Logo upload (drag & drop or camera) — stored as URL; S3 deferred | `FileReader` + `readAsDataURL` for local preview; send base64 string or empty string as `logoUrl`; S3 deferred means we store data-URL temporarily or show placeholder — pattern exists in `ClinicProfileTab` |
| CLINIC-03 | Inline validation errors before submit | HTML5 `required` + URL pattern validation + React state error object; no external validation library needed |
| UX-01 | Secret fields masked (`••••••••xxxx`) on load; saving masked value does NOT overwrite stored secret | Backend already handles this: `if (secret && newValue.startsWith('••••')) continue` — frontend just sends the masked value as-is |
| UX-02 | All interactive elements ≥ 44×44px | `min-h-[44px] min-w-[44px]` — Tailwind custom tokens `min-h-tap`, `min-w-tap` defined in `tailwind.config.js` |
| UX-03 | Renders correctly at 768px and 1024px | Sidebar collapse at 768px via `useUiStore`; responsive grid via Tailwind breakpoints |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Settings navigation shell | Frontend (React Router Layout) | — | Layout component with Outlet; no backend involvement |
| Role-based nav filtering | Frontend (component logic) | API (JWT role claim) | Role already in Zustand store from JWT; no API call needed |
| Clinic profile data load | Frontend (React Query) | Backend (GET /api/v1/settings/clinic) | Server state — React Query useQuery manages cache/loading |
| Clinic profile save | Frontend (React Query mutation) | Backend (PUT /api/v1/settings/clinic) | useMutation with cache invalidation on success |
| Logo preview (local) | Browser (FileReader API) | — | data-URL preview; S3 upload deferred |
| Inline form validation | Frontend (React state) | — | Client-side only per CLINIC-03 requirement |
| "Last updated by" footer | Frontend (display) | Backend (updatedBy + updatedAt fields) | API already returns `updatedBy` (userId) and `updatedAt`; need user name resolution |
| Sidebar collapse | Frontend (Zustand uiStore) | — | `sidebarOpen` + `toggleSidebar` already in uiStore |
| Toast success notification | Frontend (React state) | — | Inline `saved` state with timeout, matching existing pattern |

---

## Standard Stack

### Core (all verified in `src/frontend/package.json`)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | ^18.3.0 | UI framework | Project standard |
| React Router DOM | ^6.23.0 | Client routing, NavLink, Outlet | Already used in all layouts |
| TanStack React Query | ^5.32.0 | Server state (useQuery, useMutation) | Project standard for all API hooks |
| Zustand | ^4.5.2 | Local/UI state (sidebarOpen, role) | Project standard; authStore + uiStore |
| Axios | ^1.6.8 | HTTP client | Already wrapped in `src/utils/api.ts` |
| Tailwind CSS | ^3.4.3 | Styling with Compassionate Care tokens | Project design system |

[VERIFIED: local package.json]

### No New Packages Required

This phase installs zero new dependencies. All required libraries are already installed.

---

## Package Legitimacy Audit

No new packages are installed in this phase. Section not applicable.

---

## Architecture Patterns

### System Architecture Diagram

```
Browser (user navigates to /settings/*)
         |
         v
App.tsx — new Route path="/settings" wrapping SettingsLayout (ProtectedRoute)
         |
         v
SettingsLayout.tsx
  - Fixed left sidebar (w-56 / w-14 collapsed) — bg-surface shadow-sm
  - Role-filtered NAV array → NavLink items → Outlet
  - useUiStore (sidebarOpen, toggleSidebar)
  - useAuthStore (role, name) for nav filtering + user display
         |
    [Outlet renders child route]
         |
         v
ClinicProfilePage.tsx (/settings/clinic-profile)
  - useClinicSettings() hook → GET /api/v1/settings/clinic
  - Form state (useState)
  - handleSave → useUpdateClinicProfile() → PUT /api/v1/settings/clinic
  - Inline validation errors (useState errorMap)
  - Logo: FileReader preview + drag-over state
  - "Last updated" footer: data.updatedAt + data.updatedBy (userId)
         |
         v
useClinicSettings.ts (React Query hook)
  - useQuery key: ['settings', 'clinic']
  - queryFn: api.get('/api/v1/settings/clinic')
  - useMutation: api.put('/api/v1/settings/clinic')
  - onSuccess: invalidateQueries(['settings', 'clinic'])
         |
         v
Backend: GET/PUT /api/v1/settings/clinic (Phase 1.5-B — already complete)
```

### Recommended Project Structure

```
src/frontend/src/
  layouts/
    SettingsLayout.tsx        # new — modeled on ClinicLayout.tsx
  views/settings/
    index.ts                  # barrel export
    ClinicProfilePage.tsx     # new — replaces ClinicProfileTab pattern
  hooks/
    useClinicSettings.ts      # new — React Query hook for /api/v1/settings/clinic
```

Route registration in `App.tsx`: new `<Route path="/settings">` block alongside `/admin` and `/clinic`.

### Pattern 1: Layout Component (exact model from ClinicLayout)

```typescript
// Source: src/frontend/src/layouts/ClinicLayout.tsx (verified)
const sidebarW  = sidebarOpen ? 'w-56' : 'w-14'
const mainClass = sidebarOpen ? 'ml-56' : 'ml-14'

const navClass = (isActive: boolean) => {
  if (sidebarOpen) {
    return isActive
      ? 'flex items-center gap-md px-lg min-h-[44px] border-r-4 border-primary bg-surface-container-low text-primary font-bold'
      : 'flex items-center gap-md px-lg min-h-[44px] mx-sm rounded-lg text-on-surface-variant hover:bg-surface-container transition-colors'
  }
  return isActive
    ? 'flex items-center justify-center min-h-[44px] w-full border-r-4 border-primary bg-surface-container-low text-primary'
    : 'flex items-center justify-center min-h-[44px] mx-1 rounded-lg text-on-surface-variant hover:bg-surface-container transition-colors'
}
```

The `<aside>` uses: `fixed left-0 top-0 h-screen z-50 ${sidebarW} bg-surface shadow-sm flex flex-col transition-all duration-200 overflow-hidden`

The `<main>` uses: `${mainClass} pt-16 min-h-screen overflow-y-auto transition-all duration-200`

### Pattern 2: Role-Filtered NAV Array

```typescript
// Source: derived from ClinicLayout.tsx + AdminLayout.tsx pattern (verified)
const ALL_NAV = [
  { to: '/settings/clinic-profile',  icon: 'business',      label: 'Clinic Profile',   roles: ['admin'] },
  { to: '/settings/hours',           icon: 'schedule',       label: 'Operating Hours',  roles: ['admin'] },
  { to: '/settings/notifications',   icon: 'notifications',  label: 'Notifications',    roles: ['admin'] },
  { to: '/settings/payment',         icon: 'payments',       label: 'Payment',          roles: ['admin'] },
  { to: '/settings/integrations',    icon: 'integration_instructions', label: 'Integrations', roles: ['admin'] },
  { to: '/settings/preferences',     icon: 'person',         label: 'My Preferences',   roles: ['admin', 'doctor', 'staff'] },
  { to: '/settings/system',          icon: 'admin_panel_settings', label: 'System Settings', roles: ['superadmin'] },
]
// In component: const NAV = ALL_NAV.filter(item => item.roles.includes(role ?? ''))
```

### Pattern 3: React Query Hook (exact model from useAdmin.ts)

```typescript
// Source: src/frontend/src/hooks/useAdmin.ts (verified) — TanStack Query v5 pattern
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../utils/api'

export function useClinicSettings() {
  return useQuery<ClinicSettingsData>({
    queryKey: ['settings', 'clinic'],
    queryFn: () => api.get('/api/v1/settings/clinic').then(r => r.data.data),
  })
}

export function useUpdateClinicProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<ClinicSettingsInput>) =>
      api.put('/api/v1/settings/clinic', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'clinic'] }),
  })
}
```

Note: TanStack Query v5 uses `isPending` not `isLoading` for mutations. `useQuery` still uses `isLoading`.

### Pattern 4: Route Registration in App.tsx

```typescript
// Source: src/frontend/src/App.tsx (verified) — lazy import + ProtectedRoute pattern
const SettingsLayout     = lazy(() => import('./layouts/SettingsLayout'))  // NOT lazy — same as Admin/ClinicLayout (they are not lazy)
const ClinicProfilePage  = lazy(() => import('./views/settings/ClinicProfilePage'))

// In Routes:
<Route path="/settings" element={<ProtectedRoute><SettingsLayout/></ProtectedRoute>}>
  <Route index element={<Navigate to="/settings/clinic-profile" replace/>}/>
  <Route path="clinic-profile" element={<ClinicProfilePage/>}/>
</Route>
```

Note: In existing App.tsx, layouts (`AdminLayout`, `ClinicLayout`) are imported normally (not lazy). Only page-level components inside are lazy-loaded. Follow the same pattern for `SettingsLayout`.

### Pattern 5: Logo Upload Placeholder

```typescript
// Source: src/frontend/src/views/admin/ClinicProfileTab.tsx (verified)
// FileReader creates local data-URL preview; logoUrl sent to backend as data-URL string
// Backend stores it as-is (logoUrl field in tenant_settings)
// S3 upload is deferred — this approach works for MVP per CLINIC-02
function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = ev => setForm(p => ({ ...p, logoUrl: ev.target?.result as string }))
  reader.readAsDataURL(file)
}
```

Drag-and-drop addition: add `onDragOver`/`onDrop` handlers to the drop zone div. No library needed.

### Anti-Patterns to Avoid

- **Reusing `useAdminSettings`/`useUpdateSettings` from `useAdmin.ts`:** Those hooks call `/admin/settings` (old route). New settings pages MUST call `/api/v1/settings/clinic` via new `useClinicSettings` hook.
- **Making `SettingsLayout` lazy-imported:** Layouts are eagerly imported in App.tsx; only pages inside are lazy. Keep consistent.
- **Raw hex colors in component files:** Use only Tailwind token names (`text-primary`, `bg-surface`, etc). No `#000000` inline.
- **Emojis in navigation:** Use Material Symbols Outlined exclusively — `<MaterialIcon name="..." />` component.
- **Deriving tenantId inside hook:** The API call already injects JWT via the `api` interceptor (`useAuthStore.getState().token`). Do not pass tenantId as a parameter to hooks.
- **Saving masked secret value:** If the user hasn't changed a secret field, the frontend receives `••••••••ab12`. Sending this back as-is is correct — the backend ignores values starting with `••••`. Never clear masked fields before submit.

---

## Existing Code: What to Reuse vs. Replace

| File | Status | Action |
|------|--------|--------|
| `src/views/admin/AdminSettings.tsx` | Re-exports `ClinicSettingsTab` (operating hours/toggles) | LEAVE UNTOUCHED — `/admin/settings` route stays live |
| `src/views/admin/ClinicProfileTab.tsx` | Functional clinic profile form (old `/admin/settings` hook) | DO NOT REUSE directly — extract UI patterns into new `ClinicProfilePage` pointing to new API |
| `src/views/admin/ClinicSettingsTab.tsx` | Operating hours + notification toggles (old hook) | LEAVE UNTOUCHED |
| `src/hooks/useAdmin.ts` | `useAdminSettings` + `useUpdateSettings` (old `/admin/settings`) | DO NOT MODIFY — create new `useClinicSettings.ts` hook alongside it |
| `src/layouts/ClinicLayout.tsx` | Full sidebar layout pattern | REFERENCE ONLY — copy patterns into new `SettingsLayout` |
| `src/components/MaterialIcon.tsx` | Icon component | REUSE as-is |
| `src/components/TopNav.tsx` | Top nav bar | REUSE as-is |
| `src/store/uiStore.ts` | `sidebarOpen`, `toggleSidebar` | REUSE as-is |

---

## API Shape Reference

### GET /api/v1/settings/clinic — Response shape

```typescript
// Source: src/backend/services/tenant-settings.service.ts + repository (verified)
interface ClinicSettingsData {
  id:                   number
  tenantId:             number
  logoUrl:              string | null
  phone:                string | null
  email:                string | null
  website:              string | null
  address:              string | null
  taxId:                string | null
  defaultSlotMinutes:   number        // legacy field — ignore for settings UI
  workStartTime:        string        // legacy field — ignore for settings UI
  workEndTime:          string        // legacy field — ignore for settings UI
  smsRemindersEnabled:  boolean
  lineRemindersEnabled: boolean
  planTier:             string
  operatingHours:       Record<'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun', {open: string; close: string} | null> | null
  lineOaToken:          string | null  // masked: "••••••••xxxx" if set
  smsProvider:          string | null  // 'thaibulksms' | 'thsms' | null
  smsApiKey:            string | null  // masked
  smsSenderName:        string | null
  promptpayId:          string | null
  paymentQrUrl:         string | null
  gbprimepayPublic:     string | null
  gbprimepaySecret:     string | null  // masked
  labApiUrl:            string | null
  labApiKey:            string | null  // masked
  updatedBy:            number | null  // user ID of last editor
  updatedAt:            string         // ISO timestamp (Prisma returns as string)
  tenant: { name: string; subdomain: string }
}
```

Note: The `getOrCreateSettings` repository call includes `tenant: { select: { name: true, subdomain: true } }`. The service layer adds `updatedBy` to the write path. The Prisma model includes `updatedAt` auto-managed.

### PUT /api/v1/settings/clinic — Accepted fields (clinicProfileSchema)

```typescript
// Source: src/backend/controllers/settings.controller.ts (verified)
{
  name?:    string  // min 1, max 255 — updates tenants.name table, not tenant_settings
  logoUrl?: string  // valid URL or empty string
  address?: string  // max 1000 chars
  phone?:   string  // max 50 chars
  email?:   string  // valid email or empty string
  taxId?:   string  // max 50 chars
  website?: string  // max 255 chars
}
// Schema is .strict() — any extra field = 400 error
```

### "Last Updated By" Footer

The API returns `updatedBy` as a user ID (integer) and `updatedAt` as a timestamp. The settings response does NOT include the updater's name — only their ID. Options:

1. **Display user ID only** — not user-friendly
2. **Join user name in the API** — backend change required (out of scope for Phase 1)
3. **Show formatted date only** (`updatedAt`) with "by you" if `updatedBy === currentUserId` — simplest, no backend change
4. **Store updater name in a separate query** — possible with existing `/admin/users` endpoint but adds complexity

**Recommendation:** For Phase 1, show `"Last updated: [formatted date]"`. If `updatedBy === currentUserId` (from `useAuthStore(s => s.userId)`), append `"by you"`. This requires no backend change and satisfies LAYOUT-03 adequately. Full name display is a Phase 2 enhancement.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP requests | Custom fetch wrapper | `api` (Axios instance in `src/utils/api.ts`) | JWT injection + 401 redirect already wired |
| Server state management | useState + useEffect for API data | `useQuery` (TanStack Query) | Caching, deduplication, loading states handled |
| Sidebar collapse | Custom width animation | `useUiStore` (`sidebarOpen`, `toggleSidebar`) | Already implemented, consistent cross-layout |
| Toast/success feedback | Custom toast library | Inline `saved` state + timeout | Existing pattern in `ClinicProfileTab`/`ClinicSettingsTab` |
| Form validation | Zod/Yup client-side | HTML5 + React error state | Consistent with existing tab components; no validation library in frontend deps |
| Icon rendering | SVG or emoji | `<MaterialIcon name="..." />` | Existing component; design system requirement |

---

## Common Pitfalls

### Pitfall 1: Route placement — where does /settings belong?

**What goes wrong:** Placing `/settings` inside `/admin` (role-restricted to admin only) or `/clinic` (role-restricted to doctor/staff only) breaks multi-role access.

**Why it happens:** Existing layouts hard-redirect wrong roles: `ClinicLayout` redirects admins away; `AdminLayout` redirects non-admins away.

**How to avoid:** Create `/settings` as a standalone top-level route with its own `ProtectedRoute` (auth-only, no role check at route level). Role filtering happens inside `SettingsLayout` itself by filtering the NAV array.

**Warning signs:** If you see `<Navigate to="/clinic/dashboard">` or `<Navigate to="/admin/dashboard">` in SettingsLayout, role gating is happening at the wrong level.

### Pitfall 2: TanStack Query v5 API differences

**What goes wrong:** Using v4 patterns (`isLoading` on mutations, `onError` callback removed) causes TypeScript errors.

**Why it happens:** The project uses TanStack Query v5 (`^5.32.0`). v5 changed `isLoading` → `isPending` for mutations and removed `onError` from `useQuery` options.

**How to avoid:** Model exactly from `useAdmin.ts` which already uses v5 patterns: `mutate.isPending`, `onSuccess` on mutations, error handling via `.catch()` or React Query's error boundary.

**Warning signs:** TypeScript error on `mutation.isLoading` (use `isPending`).

### Pitfall 3: Sending masked secrets back and destroying stored values

**What goes wrong:** A form "clear and re-fill" approach that sends the masked value `••••••••ab12` through a transformation (trimming the bullets, encoding) before submission — the backend then stores the transformed garbage.

**Why it happens:** Defensive coding that tries to "clean" form values before submit.

**How to avoid:** Send the masked value exactly as received from the API. The backend service explicitly checks `if (secret && newValue.startsWith('••••')) continue` — it skips the field. The ClinicProfilePage for Phase 1 doesn't have secret fields, but the pattern matters for future phases.

### Pitfall 4: Logo data-URL size causing request failures

**What goes wrong:** A high-resolution photo uploaded as logo produces a 2-5MB base64 data-URL, which exceeds Express's default body limit (100kb) and returns 413 Payload Too Large.

**Why it happens:** `FileReader.readAsDataURL()` returns raw base64 — no size limit applied client-side.

**How to avoid:** Add client-side file size validation (e.g., `if (file.size > 500_000) { setError('Logo must be under 500KB'); return }`) before calling `readAsDataURL`. For MVP this is sufficient; S3 pre-signed URLs handle size properly in Session E.

### Pitfall 5: `name` field confusion between tenant and tenant_settings

**What goes wrong:** Sending `name` (clinic name) via a generic `PUT /api/v1/settings/clinic` handler that expects it only in `clinicProfileSchema` — but the backend routes it to `updateClinicProfile` not the generic `updateSection` handler.

**Why it happens:** The `PUT /api/v1/settings/clinic` endpoint is specifically `updateClinicProfile` which extracts `name` separately and calls `updateClinicName` on the `tenants` table. The other section endpoints (`updateSection`) do not accept `name`. This is correct behavior — just ensure the Clinic Profile PUT goes to `/api/v1/settings/clinic` (correct endpoint).

**Warning signs:** Sending `name` to `/api/v1/settings/clinic/hours` — that schema is strict and will 400.

---

## Code Examples

### SettingsLayout skeleton (derived from ClinicLayout — verified pattern)

```typescript
// Modeled on: src/frontend/src/layouts/ClinicLayout.tsx (verified)
import { NavLink, Outlet, Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useUiStore } from '../store/uiStore'
import MaterialIcon from '../components/MaterialIcon'
import TopNav from '../components/TopNav'

const ALL_NAV = [
  { to: '/settings/clinic-profile', icon: 'business',              label: 'Clinic Profile',   roles: ['admin'] },
  { to: '/settings/hours',          icon: 'schedule',              label: 'Operating Hours',  roles: ['admin'] },
  { to: '/settings/notifications',  icon: 'notifications',         label: 'Notifications',    roles: ['admin'] },
  { to: '/settings/payment',        icon: 'payments',              label: 'Payment',          roles: ['admin'] },
  { to: '/settings/integrations',   icon: 'hub',                   label: 'Integrations',     roles: ['admin'] },
  { to: '/settings/preferences',    icon: 'manage_accounts',       label: 'My Preferences',   roles: ['admin', 'doctor', 'staff'] },
  { to: '/settings/system',         icon: 'admin_panel_settings',  label: 'System Settings',  roles: ['superadmin'] },
]

export default function SettingsLayout() {
  const role   = useAuthStore(s => s.role)
  const name   = useAuthStore(s => s.name)
  const { sidebarOpen, toggleSidebar } = useUiStore()
  
  const NAV = ALL_NAV.filter(item => item.roles.includes(role ?? ''))
  
  // Guard: unauthenticated handled by ProtectedRoute; no role redirect here
  const sidebarW  = sidebarOpen ? 'w-56' : 'w-14'
  const mainClass = sidebarOpen ? 'ml-56' : 'ml-14'
  
  // navClass function — identical to ClinicLayout
  // ...
  
  return (
    <div className="min-h-screen bg-background">
      <aside className={`fixed left-0 top-0 h-screen z-50 ${sidebarW} bg-surface shadow-sm flex flex-col transition-all duration-200 overflow-hidden`}>
        {/* Header with "Settings" subtitle */}
        {/* Nav — role-filtered */}
        {/* Footer — user name + role */}
      </aside>
      <TopNav />
      <main className={`${mainClass} pt-16 min-h-screen overflow-y-auto transition-all duration-200`}>
        <Outlet />
      </main>
    </div>
  )
}
```

### useClinicSettings hook (TanStack Query v5 — derived from useAdmin.ts)

```typescript
// Modeled on: src/frontend/src/hooks/useAdmin.ts (verified)
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../utils/api'

export interface ClinicSettingsData {
  id: number
  tenantId: number
  logoUrl: string | null
  phone: string | null
  email: string | null
  website: string | null
  address: string | null
  taxId: string | null
  updatedBy: number | null
  updatedAt: string
  tenant: { name: string; subdomain: string }
  // ... other fields
}

export function useClinicSettings() {
  return useQuery<ClinicSettingsData>({
    queryKey: ['settings', 'clinic'],
    queryFn: () => api.get('/api/v1/settings/clinic').then(r => r.data.data),
  })
}

export function useUpdateClinicProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<ClinicProfileInput>) =>
      api.put('/api/v1/settings/clinic', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'clinic'] }),
  })
}
```

### Inline form validation pattern

```typescript
// No library — React state error map
const [errors, setErrors] = useState<Record<string, string>>({})

function validate(): boolean {
  const e: Record<string, string> = {}
  if (!form.name.trim()) e.name = 'Clinic name is required'
  if (form.website && !/^https?:\/\/.+/.test(form.website)) e.website = 'Must be a valid URL (https://...)'
  setErrors(e)
  return Object.keys(e).length === 0
}

async function handleSave(e: React.FormEvent) {
  e.preventDefault()
  if (!validate()) return
  await update.mutateAsync(form)
  setSaved(true); setTimeout(() => setSaved(false), 2500)
}

// In JSX:
{errors.name && <p className="text-label-md text-error mt-xs">{errors.name}</p>}
```

### Logo drag-and-drop zone

```typescript
// Drag-over + file input pattern — no library needed
const [isDragging, setIsDragging] = useState(false)

function handleDrop(e: React.DragEvent) {
  e.preventDefault()
  setIsDragging(false)
  const file = e.dataTransfer.files?.[0]
  if (file && file.type.startsWith('image/')) {
    if (file.size > 500_000) { setErrors(p => ({ ...p, logoUrl: 'Logo must be under 500KB' })); return }
    const reader = new FileReader()
    reader.onload = ev => setForm(p => ({ ...p, logoUrl: ev.target?.result as string }))
    reader.readAsDataURL(file)
  }
}

// Drop zone div:
<div
  onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
  onDragLeave={() => setIsDragging(false)}
  onDrop={handleDrop}
  onClick={() => fileRef.current?.click()}
  className={`w-20 h-20 border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-colors
    ${isDragging ? 'border-primary bg-surface-container-low' : 'border-outline-variant hover:border-primary'}`}
>
```

---

## Tailwind Token Quick Reference (verified from tailwind.config.js)

| Token class | Value | Use in |
|-------------|-------|--------|
| `bg-surface` | `#ffffff` | Sidebar background |
| `bg-background` | `#f7f9fb` | Page background |
| `bg-surface-container-low` | `#f2f4f6` | Active nav item background |
| `bg-surface-container` | `#eceef0` | Hover state |
| `text-primary` | `#000000` | Active nav text, headings |
| `text-on-surface-variant` | `#45464d` | Inactive nav text, labels |
| `border-primary` | `#000000` | Active nav border-r-4 |
| `border-outline-variant` | `#c6c6cd` | Card borders, dividers |
| `text-error` | `#EF4444` | Validation error messages |
| `text-secondary` | `#006c4a` | Success feedback |
| `min-h-[44px]` | 44px | All interactive elements (CLAUDE.md rule) |
| `min-w-[44px]` | 44px | All interactive elements |
| `font-headline` | Plus Jakarta Sans | Page titles, section headers |
| `font-sans` | DM Sans | Body text, labels |
| `text-headline-sm` | 20px/600 | Sidebar brand name |
| `text-body-md` | 16px/400 | Nav labels |
| `text-label-md` | 12px/500 | Sub-labels, user role text |
| `text-body-sm` | 14px/400 | Form labels, input text |

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Admin settings in `/admin/settings` (ClinicProfileTab) | New dedicated `/settings` route | Settings accessible by all roles; admin route stays for admin-specific features |
| `useAdminSettings` hitting `/admin/settings` | `useClinicSettings` hitting `/api/v1/settings/clinic` | Correct Phase 1.5 API endpoint; encrypted secrets handled properly |
| Tab-based settings inside admin panel | Dedicated settings shell with sidebar nav | Per LAYOUT-01-04 requirements; role-filtered sections |

**Note:** The old `/admin/settings` route (ClinicProfileTab + ClinicSettingsTab via AdminSettings.tsx) remains in place. Do not remove or modify it in Phase 1.

---

## Environment Availability

Step 2.6: SKIPPED — this phase is purely frontend code changes with no new external services, CLIs, or runtimes required. The backend API (`/api/v1/settings/clinic`) is already live (Phase 1.5-B complete). The dev DB is Docker `vetclinic-pg` (port 5432) — existing.

---

## Validation Architecture

nyquist_validation setting absent from `.planning/config.json` — treating as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (frontend) — inferred from Vite build toolchain |
| Config file | No vitest.config.ts detected — may need Wave 0 setup |
| Quick run command | `cd src/frontend && npm test` (if configured) |
| Full suite command | `cd src/frontend && npm test -- --run` |

Note: No test files found in `src/frontend/src/` in the current scan. Frontend testing infrastructure may not be set up. The project's 206 tests are all backend (Jest/Supertest). Frontend tests are not yet established.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Notes |
|--------|----------|-----------|-------|
| LAYOUT-01 | Nav items filtered by role | manual | Role-based rendering; no frontend test infra yet |
| LAYOUT-02 | SPA navigation without reload | manual | React Router behavior |
| LAYOUT-03 | Save button + Last updated footer | manual | UI element presence |
| LAYOUT-04 | Sidebar collapse at 768px | manual | Responsive breakpoint test |
| CLINIC-01 | Form fields save to API | manual + backend integration test (existing) | Backend coverage already exists |
| CLINIC-02 | Logo drag-and-drop preview | manual | FileReader API — browser only |
| CLINIC-03 | Inline validation errors | manual | Client-side state |
| UX-01 | Masked secrets not overwritten | manual | Backend logic already tested in Phase 1.5-B |
| UX-02 | 44px tap targets | manual / visual | CSS measurement |
| UX-03 | Responsive at 768/1024px | manual | Browser DevTools resize |

### Wave 0 Gaps

- No frontend test infrastructure detected — all validation in Phase 1 is manual.
- If automated frontend tests are required, Wave 0 must add: Vitest + React Testing Library config, `vitest.config.ts`, test scripts in `package.json`.
- Backend integration tests for `/api/v1/settings/clinic` already exist (Phase 1.5-B suite, 206 tests total).

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | JWT via `ProtectedRoute` + `authStore`; auth already implemented |
| V3 Session Management | yes | `sessionStorage`/`localStorage` JWT; clearAuth on 401; already implemented |
| V4 Access Control | yes | Role filtering in NAV array; admin-only API routes enforced by `rbacMiddleware` on backend |
| V5 Input Validation | yes | Zod on backend (strict schemas); HTML5 + React state on frontend |
| V6 Cryptography | no | Secret fields encrypted on backend (AES-256-GCM); frontend only sends/displays masked values |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Tenant data leakage via settings API | Information Disclosure | Backend `adminOnly = rbacMiddleware(['admin'])` on all `/api/v1/settings/clinic` routes |
| CSRF on settings PUT | Tampering | JWT in Authorization header (not cookie) — not CSRF-vulnerable |
| Logo data-URL XSS | Tampering | `img src=` renders data-URL as image, not script; safe for MVP |
| Oversized logo DoS | DoS | Client-side 500KB limit + Express body-parser limit |

---

## Open Questions (RESOLVED)

1. **"Last updated by [name]" — name resolution**
   - What we know: API returns `updatedBy` as user ID (integer), not name
   - What's unclear: How to resolve user ID to display name without a backend join or extra API call
   - RESOLVED: For Phase 1, show `"Last updated: [date]"` + `"by you"` when `updatedBy === currentUserId`. Defer full name display to Phase 2 (can add `updatedByName` to API response then). Plans document this deferral explicitly in must_haves.truths.

2. **ProtectedRoute — role restriction for SettingsLayout**
   - What we know: Current `ProtectedRoute` only checks `isAuthenticated()`, no role param
   - What's unclear: Should superadmin be allowed into all /settings routes or only /settings/system?
   - RESOLVED: Role filtering in NAV array is sufficient. If a superadmin navigates directly to `/settings/clinic-profile`, the backend `adminOnly` middleware will 403 them — graceful error state in the page handles this. No frontend route-level role guard needed for Phase 1.

3. **Sidebar collapse on mobile: automatic at 768px?**
   - What we know: `useUiStore` `sidebarOpen` is persistent toggle state; LAYOUT-04 says "collapses to icons-only on tablet portrait (768px)"
   - What's unclear: Should collapse happen automatically when viewport is ≤768px, or only on user toggle?
   - RESOLVED: Add `useEffect` to auto-collapse when `window.innerWidth < 768` on mount — same pattern that completes LAYOUT-04. The toggle still works manually at any size.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `updatedAt` is returned by the settings API (Prisma auto-manages this field) | API Shape | Footer won't show last-updated time; need to add to backend response |
| A2 | No frontend test infrastructure exists (Vitest not configured) | Validation Architecture | If tests exist in a location not scanned, Wave 0 gap list may be wrong |
| A3 | `superadmin` role is stored in JWT and available in `useAuthStore(s => s.role)` | LAYOUT-01 | Nav filter for superadmin won't work if role string differs from `'superadmin'` |

---

## Sources

### Primary (HIGH confidence — verified from codebase files)

- `src/frontend/src/layouts/ClinicLayout.tsx` — sidebar layout pattern, navClass function, sidebarOpen toggle
- `src/frontend/src/layouts/AdminLayout.tsx` — admin sidebar pattern, useAdminSettings hook usage
- `src/frontend/src/App.tsx` — route registration, lazy import pattern, ProtectedRoute usage
- `src/frontend/src/hooks/useAdmin.ts` — TanStack Query v5 hook pattern (useQuery + useMutation)
- `src/frontend/src/store/authStore.ts` — role/userId/name fields, isAuthenticated
- `src/frontend/src/views/admin/ClinicProfileTab.tsx` — form pattern, FileReader logo preview, save flow
- `src/frontend/src/views/admin/ClinicSettingsTab.tsx` — toggle component, save pattern
- `src/frontend/src/views/admin/AdminSettings.tsx` — confirms it re-exports ClinicSettingsTab only
- `src/backend/routes/settings.routes.ts` — confirmed API endpoints + rbacMiddleware config
- `src/backend/controllers/settings.controller.ts` — Zod schemas, confirmed field names
- `src/backend/services/tenant-settings.service.ts` — confirmed SECRET_FIELDS, masked value logic
- `src/backend/models/tenant-settings.repository.ts` — confirmed Prisma upsert + tenant join
- `src/backend/app.ts` — confirmed `/api/settings` mount point
- `src/frontend/package.json` — confirmed library versions
- `src/frontend/tailwind.config.js` — confirmed all token values
- `.planning/REQUIREMENTS.md` — phase requirements LAYOUT-01 through UX-03
- `stitch_vet_clinic_design_system/admin_control_center_1024x768/code.html` — design reference

### Secondary (MEDIUM confidence)

- None — all findings are from direct codebase inspection

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — versions confirmed from package.json
- Architecture patterns: HIGH — copied from verified existing layouts
- API shape: HIGH — verified from controller schemas + service layer
- Pitfalls: HIGH — derived from reading actual code logic
- "Last updated by" footer: MEDIUM — `updatedBy` field confirmed in schema; name resolution approach is a recommendation

**Research date:** 2026-06-11
**Valid until:** 2026-07-11 (stable codebase; no fast-moving dependencies)
