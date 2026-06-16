import { Suspense, lazy, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useUiStore } from './store/uiStore'
import { usePreferenceHydration } from './hooks/usePersonalPreferences'
import { RequireAuth, RequirePlane } from './guards'
import LoginView from './views/LoginView'
import AdminLayout from './layouts/AdminLayout'
import ClinicLayout from './layouts/ClinicLayout'
import SettingsLayout from './layouts/SettingsLayout'

// ── Admin pages ──────────────────────────────────────────────────────────────
const AdminDashboard    = lazy(() => import('./views/admin/AdminDashboard'))
const AdminUsers        = lazy(() => import('./views/admin/AdminUsers'))
const AdminProfile      = lazy(() => import('./views/admin/AdminProfile'))
const AdminUsage        = lazy(() => import('./views/admin/AdminUsage'))
const AdminSettings     = lazy(() => import('./views/admin/AdminSettings'))
const AdminSubscription = lazy(() => import('./views/admin/AdminSubscription'))

// ── Clinic pages ─────────────────────────────────────────────────────────────
const ClinicDashboard    = lazy(() => import('./views/clinic/ClinicDashboard'))
const ClinicAppointments = lazy(() => import('./views/clinic/ClinicAppointments'))
const ClinicPets         = lazy(() => import('./views/clinic/ClinicPets'))
const ClinicEMR          = lazy(() => import('./views/clinic/ClinicEMR'))
const ClinicInventory    = lazy(() => import('./views/clinic/ClinicInventory'))
const ClinicBilling      = lazy(() => import('./views/clinic/ClinicBilling'))
const ClinicInpatient    = lazy(() => import('./views/clinic/ClinicInpatient'))
const ClinicGrooming     = lazy(() => import('./views/clinic/ClinicGrooming'))

// ── Phase 4 admin pages (Session B stubs) ────────────────────────────────────
const AdminBranches  = lazy(() => import('./views/admin/AdminBranches'))
const AdminBloodBank = lazy(() => import('./views/admin/AdminBloodBank'))
const AdminAudit     = lazy(() => import('./views/admin/AdminAudit'))

// ── Settings pages ───────────────────────────────────────────────────────────
const ClinicProfilePage  = lazy(() => import('./views/settings/ClinicProfilePage'))
const OperatingHoursPage = lazy(() => import('./views/settings/OperatingHoursPage'))
const NotificationsPage  = lazy(() => import('./views/settings/NotificationsPage'))
const PaymentPage        = lazy(() => import('./views/settings/PaymentPage'))
const IntegrationsPage   = lazy(() => import('./views/settings/IntegrationsPage'))
const PreferencesPage    = lazy(() => import('./views/settings/PreferencesPage'))
const SystemSettingsPage = lazy(() => import('./views/settings/SystemSettingsPage'))

const Loader = () => (
  <div className="flex items-center justify-center h-screen">
    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"/>
  </div>
)

/** Stub 403 view — full implementation deferred to T-5E-03+. */
const ForbiddenView = () => (
  <div className="flex flex-col items-center justify-center h-screen gap-4 text-center">
    <span className="material-symbols-outlined text-6xl text-error">lock</span>
    <h1 className="font-headline text-2xl text-primary">Access Denied</h1>
    <p className="font-sans text-sm text-secondary">
      You do not have permission to view this page.
    </p>
  </div>
)

export default function App() {
  const theme    = useUiStore(s => s.theme)
  const language = useUiStore(s => s.language)

  // Hydrate theme/language from the server once authenticated (cross-device sync).
  usePreferenceHydration()

  // Apply appearance + language to <html> whenever they change (single effect).
  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    root.setAttribute('data-theme', theme) // back-compat with earlier attribute usage
    root.lang = language
  }, [theme, language])

  return (
    <Suspense fallback={<Loader/>}>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<LoginView/>}/>

        {/* ── Clinic-admin section (/clinic-admin/*) ── plane=clinic, role=clinic_admin */}
        <Route path="/clinic-admin" element={<RequireAuth><RequirePlane plane="clinic"><AdminLayout/></RequirePlane></RequireAuth>}>
          <Route index element={<Navigate to="/clinic-admin/dashboard" replace/>}/>
          <Route path="dashboard"    element={<AdminDashboard/>}/>
          <Route path="users"        element={<AdminUsers/>}/>
          <Route path="profile"      element={<AdminProfile/>}/>
          <Route path="usage"        element={<AdminUsage/>}/>
          <Route path="settings"     element={<AdminSettings/>}/>
          <Route path="subscription" element={<AdminSubscription/>}/>
          <Route path="branches"     element={<AdminBranches/>}/>
          <Route path="blood-bank"   element={<AdminBloodBank/>}/>
          <Route path="audit"        element={<AdminAudit/>}/>
        </Route>

        {/* ── Legacy /admin/* redirects → /clinic-admin/* ── */}
        <Route path="/admin"              element={<Navigate to="/clinic-admin/dashboard" replace/>}/>
        <Route path="/admin/dashboard"    element={<Navigate to="/clinic-admin/dashboard" replace/>}/>
        <Route path="/admin/users"        element={<Navigate to="/clinic-admin/users" replace/>}/>
        <Route path="/admin/profile"      element={<Navigate to="/clinic-admin/profile" replace/>}/>
        <Route path="/admin/usage"        element={<Navigate to="/clinic-admin/usage" replace/>}/>
        <Route path="/admin/settings"     element={<Navigate to="/clinic-admin/settings" replace/>}/>
        <Route path="/admin/subscription" element={<Navigate to="/clinic-admin/subscription" replace/>}/>
        <Route path="/admin/branches"     element={<Navigate to="/clinic-admin/branches" replace/>}/>
        <Route path="/admin/blood-bank"   element={<Navigate to="/clinic-admin/blood-bank" replace/>}/>
        <Route path="/admin/audit"        element={<Navigate to="/clinic-admin/audit" replace/>}/>

        {/* ── Platform section (/platform/*) ── plane=platform, screens TBD */}
        <Route path="/platform" element={<RequireAuth><RequirePlane plane="platform"><div>Platform Console — coming soon</div></RequirePlane></RequireAuth>}>
          <Route index element={<Navigate to="/platform/dashboard" replace/>}/>
          <Route path="dashboard" element={<div className="p-8 font-headline text-2xl">Platform Console</div>}/>
        </Route>

        {/* ── Clinic section (/clinic/*) ── plane=clinic, role=doctor|staff */}
        <Route path="/clinic" element={<RequireAuth><RequirePlane plane="clinic"><ClinicLayout/></RequirePlane></RequireAuth>}>
          <Route index element={<Navigate to="/clinic/dashboard" replace/>}/>
          <Route path="dashboard"    element={<ClinicDashboard/>}/>
          <Route path="appointments" element={<ClinicAppointments/>}/>
          <Route path="pets"         element={<ClinicPets/>}/>
          <Route path="emr"          element={<ClinicEMR/>}/>
          <Route path="inventory"    element={<ClinicInventory/>}/>
          <Route path="billing"      element={<ClinicBilling/>}/>
          <Route path="inpatient"    element={<ClinicInpatient/>}/>
          <Route path="grooming"     element={<ClinicGrooming/>}/>
        </Route>

        {/* ── Settings section (/settings/*) ── auth-only, role filtered in layout */}
        <Route path="/settings" element={<RequireAuth><SettingsLayout/></RequireAuth>}>
          <Route index element={<Navigate to="/settings/clinic-profile" replace/>}/>
          <Route path="clinic-profile" element={<ClinicProfilePage/>}/>
          <Route path="hours"         element={<OperatingHoursPage/>}/>
          <Route path="notifications" element={<NotificationsPage/>}/>
          <Route path="payment"       element={<PaymentPage/>}/>
          <Route path="integrations"  element={<IntegrationsPage/>}/>
          <Route path="preferences"   element={<PreferencesPage/>}/>
          <Route path="system"        element={<SystemSettingsPage/>}/>
        </Route>

        {/* Access denied stub — target of RequirePermission on deny */}
        <Route path="/403" element={<ForbiddenView/>}/>

        {/* Legacy + catch-all */}
        <Route path="/dashboard" element={<Navigate to="/clinic/dashboard" replace/>}/>
        <Route path="/" element={<Navigate to="/login" replace/>}/>
        <Route path="*" element={<Navigate to="/login" replace/>}/>
      </Routes>
    </Suspense>
  )
}
