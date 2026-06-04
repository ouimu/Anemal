import React, { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import LoginView from './views/LoginView'
import AdminLayout from './layouts/AdminLayout'
import ClinicLayout from './layouts/ClinicLayout'

// ── Admin pages ──────────────────────────────────────────────────────────────
const AdminDashboard    = lazy(() => import('./views/admin/AdminDashboard'))
const AdminUsers        = lazy(() => import('./views/admin/AdminUsers'))
const AdminProfile      = lazy(() => import('./views/admin/AdminProfile'))
const AdminUsage        = lazy(() => import('./views/admin/AdminUsage'))
const AdminSettings     = lazy(() => import('./views/admin/AdminSettings'))
const AdminSubscription = lazy(() => import('./views/admin/AdminSubscription'))

// ── Clinic pages ─────────────────────────────────────────────────────────────
const ClinicDashboard   = lazy(() => import('./views/clinic/ClinicDashboard'))
const ClinicAppointments= lazy(() => import('./views/clinic/ClinicAppointments'))
const ClinicPets        = lazy(() => import('./views/clinic/ClinicPets'))
const ClinicEMR         = lazy(() => import('./views/clinic/ClinicEMR'))
const ClinicInventory   = lazy(() => import('./views/clinic/ClinicInventory'))
const ClinicBilling     = lazy(() => import('./views/clinic/ClinicBilling'))

const Loader = () => (
  <div className="flex items-center justify-center h-screen">
    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"/>
  </div>
)

export default function App() {
  return (
    <Suspense fallback={<Loader/>}>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<LoginView/>}/>

        {/* ── Admin section (/admin/*) ── role=admin only */}
        <Route path="/admin" element={<ProtectedRoute><AdminLayout/></ProtectedRoute>}>
          <Route index element={<Navigate to="/admin/dashboard" replace/>}/>
          <Route path="dashboard"    element={<AdminDashboard/>}/>
          <Route path="users"        element={<AdminUsers/>}/>
          <Route path="profile"      element={<AdminProfile/>}/>
          <Route path="usage"        element={<AdminUsage/>}/>
          <Route path="settings"     element={<AdminSettings/>}/>
          <Route path="subscription" element={<AdminSubscription/>}/>
        </Route>

        {/* ── Clinic section (/clinic/*) ── role=doctor|staff only */}
        <Route path="/clinic" element={<ProtectedRoute><ClinicLayout/></ProtectedRoute>}>
          <Route index element={<Navigate to="/clinic/dashboard" replace/>}/>
          <Route path="dashboard"    element={<ClinicDashboard/>}/>
          <Route path="appointments" element={<ClinicAppointments/>}/>
          <Route path="pets"         element={<ClinicPets/>}/>
          <Route path="emr"          element={<ClinicEMR/>}/>
          <Route path="inventory"    element={<ClinicInventory/>}/>
          <Route path="billing"      element={<ClinicBilling/>}/>
        </Route>

        {/* Legacy + catch-all */}
        <Route path="/dashboard" element={<Navigate to="/clinic/dashboard" replace/>}/>
        <Route path="/" element={<Navigate to="/login" replace/>}/>
        <Route path="*" element={<Navigate to="/login" replace/>}/>
      </Routes>
    </Suspense>
  )
}
