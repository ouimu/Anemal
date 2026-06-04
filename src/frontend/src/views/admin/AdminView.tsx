// @uiux-agent spec: 4 tabs — admin-only, redirect non-admins
import React, { lazy, Suspense, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

const ClinicProfileTab  = lazy(() => import('./ClinicProfileTab'))
const UserManagementTab = lazy(() => import('./UserManagementTab'))
const ClinicSettingsTab = lazy(() => import('./ClinicSettingsTab'))
const SubscriptionTab   = lazy(() => import('./SubscriptionTab'))

const TABS = [
  { id: 'profile',      label: 'Clinic profile' },
  { id: 'users',        label: 'User management' },
  { id: 'settings',     label: 'Settings' },
  { id: 'subscription', label: 'Subscription' },
]

export default function AdminView() {
  const role = useAuthStore(s => s.role)
  const [tab, setTab] = useState('profile')

  // Guard: non-admins are redirected
  if (role !== 'admin') return <Navigate to="/dashboard" replace/>

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Page header */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-800">Admin panel</h2>
        <p className="text-sm text-gray-400 mt-1">Manage clinic profile, users, and settings</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-gray-200 mb-6 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={[
              'px-5 py-3 text-sm whitespace-nowrap border-b-2 transition-colors',
              tab === t.id
                ? 'border-primary text-primary font-medium'
                : 'border-transparent text-on-surface-variant hover:text-on-surface',
            ].join(' ')}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <Suspense fallback={<div className="text-sm text-gray-400 py-12 text-center">Loading…</div>}>
        {tab === 'profile'      && <ClinicProfileTab/>}
        {tab === 'users'        && <UserManagementTab/>}
        {tab === 'settings'     && <ClinicSettingsTab/>}
        {tab === 'subscription' && <SubscriptionTab/>}
      </Suspense>
    </div>
  )
}
