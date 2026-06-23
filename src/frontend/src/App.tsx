import { Suspense, lazy, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useUiStore } from './store/uiStore'
import { usePreferenceHydration } from './hooks/usePersonalPreferences'
import { RequireAuth, RequirePlane, RequirePermission } from './guards'
import LoginView from './views/LoginView'
import AdminLayout from './layouts/AdminLayout'
import ClinicLayout from './layouts/ClinicLayout'
import SettingsLayout from './layouts/SettingsLayout'
import PlatformLayout from './layouts/PlatformLayout'

// ── Admin pages ──────────────────────────────────────────────────────────────
const AdminDashboard    = lazy(() => import('./views/admin/AdminDashboard'))
const AdminUsers        = lazy(() => import('./views/admin/AdminUsers'))
const UserManagementTab = lazy(() => import('./views/admin/UserManagementTab'))
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

// ── T-5F-01: Clinic Role Editor ──────────────────────────────────────────────
const RoleEditorView = lazy(() => import('./views/clinic/RoleEditorView'))

// ── T-5F-02: Platform Console ────────────────────────────────────────────────
const PlatformLoginView    = lazy(() => import('./views/platform/PlatformLoginView'))
const CustomerListView     = lazy(() => import('./views/platform/CustomerListView'))
const CustomerDetailView   = lazy(() => import('./views/platform/CustomerDetailView'))
const PlatformPlansView    = lazy(() => import('./views/platform/PlatformPlansView'))
const PlatformSettingsView = lazy(() => import('./views/platform/PlatformSettingsView'))
const PlatformAuditView    = lazy(() => import('./views/platform/PlatformAuditView'))

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
          <Route path="dashboard"    element={<RequirePermission perm="clinic.profile.view"><AdminDashboard/></RequirePermission>}/>
          <Route path="users"        element={<RequirePermission perm="staff.view"><UserManagementTab/></RequirePermission>}/>
          <Route path="profile"      element={<RequirePermission perm="clinic.profile.view"><AdminProfile/></RequirePermission>}/>
          <Route path="usage"        element={<RequirePermission perm="clinic.profile.view"><AdminUsage/></RequirePermission>}/>
          <Route path="settings"     element={<RequirePermission perm="clinic.profile.view"><AdminSettings/></RequirePermission>}/>
          <Route path="subscription" element={<RequirePermission perm="clinic.profile.view"><AdminSubscription/></RequirePermission>}/>
          <Route path="branches"     element={<RequirePermission perm="clinic.branch.view"><AdminBranches/></RequirePermission>}/>
          <Route path="blood-bank"   element={<RequirePermission perm="bloodbank.view"><AdminBloodBank/></RequirePermission>}/>
          <Route path="audit"        element={<RequirePermission perm="audit.view"><AdminAudit/></RequirePermission>}/>
          <Route path="roles"        element={<RequirePermission perm="roles.view"><RoleEditorView/></RequirePermission>}/>
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

        {/* ── Platform Console (/platform/*) ── platform-plane JWT only, no permission codes */}
        <Route path="/platform/login" element={<PlatformLoginView/>}/>
        <Route path="/platform" element={<PlatformLayout/>}>
          <Route index element={<Navigate to="/platform/customers" replace/>}/>
          <Route path="customers"     element={<CustomerListView/>}/>
          <Route path="customers/:id" element={<CustomerDetailView/>}/>
          <Route path="plans"         element={<PlatformPlansView/>}/>
          <Route path="settings"      element={<PlatformSettingsView/>}/>
          <Route path="audit"         element={<PlatformAuditView/>}/>
        </Route>

        {/* ── Clinic section (/clinic/*) ── plane=clinic, role=doctor|staff */}
        <Route path="/clinic" element={<RequireAuth><RequirePlane plane="clinic"><ClinicLayout/></RequirePlane></RequireAuth>}>
          <Route index element={<Navigate to="/clinic/dashboard" replace/>}/>
          <Route path="dashboard"    element={<RequirePermission perm="dashboard.view"><ClinicDashboard/></RequirePermission>}/>
          <Route path="appointments" element={<RequirePermission perm="appointments.view"><ClinicAppointments/></RequirePermission>}/>
          <Route path="pets"         element={<RequirePermission perm="crm.view"><ClinicPets/></RequirePermission>}/>
          <Route path="emr"          element={<RequirePermission perm="emr.view"><ClinicEMR/></RequirePermission>}/>
          <Route path="inventory"    element={<RequirePermission perm="inventory.view"><ClinicInventory/></RequirePermission>}/>
          {/* Doctor has no billing/POS access — gate on billing.create which doctor role lacks */}
          <Route path="billing"      element={<RequirePermission perm="billing.create"><ClinicBilling/></RequirePermission>}/>
          <Route path="inpatient"    element={<RequirePermission perm="inpatient.view"><ClinicInpatient/></RequirePermission>}/>
          {/* Doctor has no grooming access — gate on grooming.view which doctor role lacks */}
          <Route path="grooming"     element={<RequirePermission perm="grooming.view"><ClinicGrooming/></RequirePermission>}/>
        </Route>

        {/* ── Settings section (/settings/*) ── auth-only, role filtered in layout */}
        <Route path="/settings" element={<RequireAuth><SettingsLayout/></RequireAuth>}>
          <Route index element={<Navigate to="/settings/clinic-profile" replace/>}/>
          <Route path="clinic-profile" element={<RequirePermission perm="clinic.profile.view"><ClinicProfilePage/></RequirePermission>}/>
          <Route path="hours"         element={<RequirePermission perm="clinic.hours.edit"><OperatingHoursPage/></RequirePermission>}/>
          <Route path="notifications" element={<RequirePermission perm="clinic.integrations.edit"><NotificationsPage/></RequirePermission>}/>
          <Route path="payment"       element={<RequirePermission perm="clinic.payment.edit"><PaymentPage/></RequirePermission>}/>
          <Route path="integrations"  element={<RequirePermission perm="clinic.integrations.edit"><IntegrationsPage/></RequirePermission>}/>
          <Route path="preferences"   element={<PreferencesPage/>}/>
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
