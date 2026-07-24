---
plan: 01A
phase: 1
wave: 1
depends_on: []
files_modified:
  - src/frontend/src/layouts/SettingsLayout.tsx
  - src/frontend/src/App.tsx
autonomous: true
requirements:
  - LAYOUT-01
  - LAYOUT-02
  - LAYOUT-04

must_haves:
  truths:
    - "Navigating to /settings redirects to /settings/clinic-profile with no blank page and no console errors"
    - "Admin role sees Clinic Profile, Operating Hours, Notifications, Payment, Integrations, My Preferences nav items"
    - "Doctor/staff role sees only My Preferences nav item"
    - "Superadmin role sees only System Settings nav item"
    - "Sidebar collapses to icon-only strip at 768px on mount via auto-collapse useEffect"
    - "Sidebar toggle button is accessible and re-expands on click"
  artifacts:
    - path: "src/frontend/src/layouts/SettingsLayout.tsx"
      provides: "Settings shell layout with role-filtered sidebar and Outlet"
      exports: ["default SettingsLayout"]
    - path: "src/frontend/src/App.tsx"
      provides: "Route tree with /settings path registered"
      contains: "path=\"/settings\""
  key_links:
    - from: "App.tsx"
      to: "SettingsLayout"
      via: "Route path=/settings element=<ProtectedRoute><SettingsLayout/></ProtectedRoute>"
      pattern: "path=\"/settings\""
    - from: "SettingsLayout"
      to: "useAuthStore"
      via: "role filter on ALL_NAV array"
      pattern: "ALL_NAV.filter.*roles.includes"
---

<objective>
Create the Settings navigation shell — a standalone layout at `/settings` with a
role-filtered sidebar and an `<Outlet>` for child pages. Register the route in
`App.tsx`. This plan delivers Success Criterion 1: clinic admin can navigate to
`/settings` and see the sidebar with correct nav items without a blank page or
console errors.

Purpose: Establishes the layout pattern all subsequent settings pages (Plans 01B,
01C, Phase 2, Phase 3) will slot into via the `<Outlet>`. Blocking dependency for
all downstream plans.

Output: `SettingsLayout.tsx` (new) + updated `App.tsx` route tree.
</objective>

<execution_context>
@D:\Development\AnimalClinic\.planning\phases\01-settings-shell-clinic-profile\01-RESEARCH.md
</execution_context>

<context>
@D:\Development\AnimalClinic\.planning\ROADMAP.md
@D:\Development\AnimalClinic\.planning\REQUIREMENTS.md

<interfaces>
<!-- Exact source from src/frontend/src/layouts/ClinicLayout.tsx — verified -->
<!-- SettingsLayout MUST replicate these patterns exactly. -->

Sidebar width toggle (copy verbatim):
  const sidebarW  = sidebarOpen ? 'w-56' : 'w-14'
  const mainClass = sidebarOpen ? 'ml-56' : 'ml-14'

navClass function (copy verbatim):
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

aside element class (copy verbatim):
  `fixed left-0 top-0 h-screen z-50 ${sidebarW} bg-surface shadow-sm flex flex-col transition-all duration-200 overflow-hidden`

main element class (copy verbatim):
  `${mainClass} pt-16 min-h-screen overflow-y-auto transition-all duration-200`

From src/frontend/src/store/authStore.ts:
  useAuthStore(s => s.role)    // string | null — values: 'admin' | 'doctor' | 'staff' | 'superadmin'
  useAuthStore(s => s.name)    // string | null
  useAuthStore(s => s.userId)  // number | null

From src/frontend/src/store/uiStore.ts:
  useUiStore()  // { sidebarOpen: boolean, toggleSidebar: () => void }

From src/frontend/src/App.tsx (existing route pattern):
  import SettingsLayout from './layouts/SettingsLayout'   // NOT lazy — same as AdminLayout/ClinicLayout
  const ClinicProfilePage = lazy(() => import('./views/settings/ClinicProfilePage'))

  <Route path="/settings" element={<ProtectedRoute><SettingsLayout/></ProtectedRoute>}>
    <Route index element={<Navigate to="/settings/clinic-profile" replace/>}/>
    <Route path="clinic-profile" element={<ClinicProfilePage/>}/>
  </Route>
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create SettingsLayout.tsx</name>
  <files>src/frontend/src/layouts/SettingsLayout.tsx</files>

  <read_first>
    - src/frontend/src/layouts/ClinicLayout.tsx — copy sidebar/nav/footer structure verbatim; adapt only the nav array and header label
    - src/frontend/src/store/authStore.ts — confirm field names: role, name, userId
    - src/frontend/src/store/uiStore.ts — confirm sidebarOpen, toggleSidebar
    - src/frontend/src/components/MaterialIcon.tsx — confirm import path and props
    - src/frontend/src/components/TopNav.tsx — confirm import path
  </read_first>

  <action>
Create `src/frontend/src/layouts/SettingsLayout.tsx`. Model it EXACTLY on
`ClinicLayout.tsx` — same aside/main/TopNav structure, same navClass function,
same sidebarW/mainClass toggle, same footer with user avatar and sign-out button.

Differences from ClinicLayout:
1. Header subtitle: "Settings" (not "Clinic Portal")
2. No role redirect (ClinicLayout has `if (role === 'admin') return <Navigate.../>`).
   SettingsLayout has NO hard redirect — role filtering is done on the NAV array only.
3. NAV array is role-filtered using ALL_NAV (see below).
4. Add `useEffect` (import from 'react') that auto-collapses sidebar when
   `window.innerWidth < 768` on mount:
     useEffect(() => {
       if (window.innerWidth < 768 && sidebarOpen) toggleSidebar()
     }, [])
   This satisfies LAYOUT-04.

Define ALL_NAV as a const outside the component (same level as ClinicLayout's NAV):
  const ALL_NAV = [
    { to: '/settings/clinic-profile', icon: 'business',             label: 'Clinic Profile',   roles: ['admin'] },
    { to: '/settings/hours',          icon: 'schedule',             label: 'Operating Hours',  roles: ['admin'] },
    { to: '/settings/notifications',  icon: 'notifications',        label: 'Notifications',    roles: ['admin'] },
    { to: '/settings/payment',        icon: 'payments',             label: 'Payment',          roles: ['admin'] },
    { to: '/settings/integrations',   icon: 'hub',                  label: 'Integrations',     roles: ['admin'] },
    { to: '/settings/preferences',    icon: 'manage_accounts',      label: 'My Preferences',   roles: ['admin', 'doctor', 'staff'] },
    { to: '/settings/system',         icon: 'admin_panel_settings', label: 'System Settings',  roles: ['superadmin'] },
  ]

Inside the component, derive the filtered list:
  const NAV = ALL_NAV.filter(item => item.roles.includes(role ?? ''))

Type rules:
- No `any`. ALL_NAV type is inferred (no explicit annotation needed).
- `role` from `useAuthStore(s => s.role)` — type is `string | null`; the `?? ''` handles null safely.
- No raw hex values — Tailwind tokens only.
- No emoji — MaterialIcon only.
- All interactive elements (toggle button, NavLinks, sign-out button) must have
  `min-h-[44px]` and `min-w-[44px]` per coding rules.

Do NOT import useLogout or call logout — the sign-out button in ClinicLayout uses
`useLogout`. SettingsLayout must also import and use `useLogout` from
'../hooks/useAuth' for the sign-out button (same as ClinicLayout).

The component must export `default SettingsLayout`.
  </action>

  <verify>
    <automated>cd D:\Development\AnimalClinic\src\frontend && npx tsc --noEmit 2>&1 | head -30</automated>
  </verify>

  <acceptance_criteria>
    - File exists at `src/frontend/src/layouts/SettingsLayout.tsx`
    - `export default function SettingsLayout` is present
    - `ALL_NAV` array contains exactly 7 items with `roles` field on each
    - `ALL_NAV.filter(item => item.roles.includes(role ?? ''))` produces the filtered NAV
    - `useEffect` auto-collapse is present: `if (window.innerWidth < 768 && sidebarOpen) toggleSidebar()`
    - Header shows "Settings" subtitle when sidebar is expanded
    - No `any` types
    - No raw hex colors (grep for `#` in the file returns 0 matches)
    - No emoji characters in JSX
    - `npx tsc --noEmit` exits with 0 errors on this file
  </acceptance_criteria>

  <done>SettingsLayout.tsx compiles cleanly; role-filtered nav array renders correct items per role; auto-collapse useEffect present for LAYOUT-04.</done>
</task>

<task type="auto">
  <name>Task 2: Register /settings route in App.tsx</name>
  <files>src/frontend/src/App.tsx</files>

  <read_first>
    - src/frontend/src/App.tsx — read full file before editing; understand exact import block and Routes structure
    - src/frontend/src/layouts/SettingsLayout.tsx — confirm the default export name matches the import
  </read_first>

  <action>
Edit `src/frontend/src/App.tsx` to register the `/settings` route tree.

Step 1 — Add eager import for SettingsLayout alongside AdminLayout and ClinicLayout
(NOT lazy — layouts are eagerly imported per existing pattern):
  import SettingsLayout from './layouts/SettingsLayout'

Step 2 — Add lazy import for ClinicProfilePage in the "Settings pages" group
(create this comment group below the Phase 4 admin pages group):
  // ── Settings pages ───────────────────────────────────────────────────────────
  const ClinicProfilePage = lazy(() => import('./views/settings/ClinicProfilePage'))

Step 3 — Add the /settings route block inside `<Routes>`, after the /clinic block
and before the legacy/catch-all routes:
  {/* ── Settings section (/settings/*) ── auth-only, role filtered in layout */}
  <Route path="/settings" element={<ProtectedRoute><SettingsLayout/></ProtectedRoute>}>
    <Route index element={<Navigate to="/settings/clinic-profile" replace/>}/>
    <Route path="clinic-profile" element={<ClinicProfilePage/>}/>
  </Route>

Important: `ClinicProfilePage` does not exist yet (created in Plan 01B). The lazy
import is safe to register now — Suspense will show the Loader fallback until the
component resolves, and an import error won't occur until the route is actually
navigated to. The TypeScript compiler may warn about the missing file; this is
acceptable for now and resolves when Plan 01B creates the file.

Do NOT modify any existing routes. Do NOT remove the /dashboard legacy redirect or
any catch-all route.
  </action>

  <verify>
    <automated>cd D:\Development\AnimalClinic\src\frontend && npx tsc --noEmit 2>&1 | grep -v "views/settings/ClinicProfilePage" | head -20</automated>
  </verify>

  <acceptance_criteria>
    - `import SettingsLayout from './layouts/SettingsLayout'` appears in the eager import block
    - `const ClinicProfilePage = lazy(() => import('./views/settings/ClinicProfilePage'))` appears in a "Settings pages" lazy group
    - `<Route path="/settings" element={<ProtectedRoute><SettingsLayout/></ProtectedRoute>}>` is present
    - `<Route index element={<Navigate to="/settings/clinic-profile" replace/>}/>` is present inside the /settings block
    - `<Route path="clinic-profile" element={<ClinicProfilePage/>}/>` is present inside the /settings block
    - All existing /admin and /clinic routes are unchanged
    - `npx tsc --noEmit` produces zero new errors (errors about missing ClinicProfilePage are expected until Plan 01B)
  </acceptance_criteria>

  <done>App.tsx registers /settings route; navigating to /settings redirects to /settings/clinic-profile; SettingsLayout renders with role-filtered sidebar.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Browser → SettingsLayout | Role claim read from Zustand store (loaded from JWT at login); no server call at layout render |
| NavLink → /settings/* routes | Frontend-only nav filtering; backend enforces `adminOnly` RBAC on every API call |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-01 | Elevation of Privilege | SettingsLayout NAV filter | mitigate | Role read from `useAuthStore(s => s.role)` populated from JWT at login; backend `rbacMiddleware(['admin'])` enforces access on all `/api/v1/settings/clinic` endpoints — frontend filter is UX only, not a security gate |
| T-01-02 | Information Disclosure | Direct URL navigation to /settings/clinic-profile by non-admin | accept | Backend 403 on API call; ClinicProfilePage will handle error state; no sensitive data rendered before API responds |
| T-01-03 | Tampering | Role spoofing via browser devtools modifying Zustand store | accept | Backend RBAC is authoritative; frontend role is display-only; risk is low (UX confusion, not data breach) |
</threat_model>

<verification>
Manual verification steps after execution:

1. Start frontend dev server: `cd src/frontend && npm run dev`
2. Log in as `admin` role → navigate to `/settings` → should redirect to `/settings/clinic-profile`
3. Confirm sidebar shows: Clinic Profile, Operating Hours, Notifications, Payment, Integrations, My Preferences (6 items)
4. Log in as `staff` role → navigate to `/settings` → sidebar shows only: My Preferences (1 item)
5. Log in as `superadmin` role → navigate to `/settings` → sidebar shows only: System Settings (1 item)
6. Resize browser to 768px width → sidebar should collapse to icon-only strip on load
7. Click toggle button → sidebar expands; click again → collapses
8. Console shows zero errors on all role scenarios
</verification>

<success_criteria>
- `src/frontend/src/layouts/SettingsLayout.tsx` exists and exports `default SettingsLayout`
- `src/frontend/src/App.tsx` contains `path="/settings"` route block with ProtectedRoute + SettingsLayout
- `npx tsc --noEmit` exits 0 (ignoring missing ClinicProfilePage)
- Manual: admin sees 6 nav items; staff sees 1; superadmin sees 1
- Manual: sidebar auto-collapses at 768px on mount
- No raw hex colors, no emoji, no `any` types in SettingsLayout.tsx
</success_criteria>

<output>
Create `.planning/phases/01-settings-shell-clinic-profile/01A-SUMMARY.md` when done.
</output>
