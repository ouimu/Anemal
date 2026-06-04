import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../../store/authStore'
import api from '../../utils/api'
import { Link } from 'react-router-dom'
import MaterialIcon from '../../components/MaterialIcon'

interface Usage {
  totalPets: number; totalOwners: number; totalUsers: number; activeUsers: number
  appointmentsThisMonth: number; appointmentsToday: number; invoicesThisMonth: number; planTier: string
}

const STATS = (u: Usage) => [
  { icon: 'calendar_today', label: "Today's appointments", value: u.appointmentsToday,        color: 'bg-blue-50 border-blue-200' },
  { icon: 'calendar_month', label: 'This month',           value: u.appointmentsThisMonth,    color: 'bg-surface-container border-outline-variant' },
  { icon: 'pets',           label: 'Active patients',      value: u.totalPets,                color: 'bg-secondary-container/30 border-secondary/20' },
  { icon: 'person',         label: 'Pet owners',           value: u.totalOwners,              color: 'bg-surface-container border-outline-variant' },
  { icon: 'receipt',        label: 'Invoices this month',  value: u.invoicesThisMonth,        color: 'bg-surface-container border-outline-variant' },
  { icon: 'group',          label: 'Active staff',         value: u.activeUsers,              color: 'bg-surface-container border-outline-variant' },
]

export default function AdminDashboard() {
  const name = useAuthStore(s => s.name)
  const { data, isLoading } = useQuery<Usage>({
    queryKey: ['admin', 'usage'],
    queryFn: () => api.get('/admin/usage').then(r => r.data.data),
  })

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h2 className="text-headline-sm font-headline font-bold text-primary">Welcome back, {name}</h2>
        <p className="text-body-sm text-on-surface-variant mt-1">Clinic overview · Admin panel</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-24 bg-surface-container rounded-xl animate-pulse" />
          ))}
        </div>
      ) : data ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
          {STATS(data).map(s => (
            <div key={s.label} className={`border rounded-xl p-4 ${s.color}`}>
              <MaterialIcon name={s.icon} size={20} className="text-on-surface-variant mb-1" />
              <p className="text-headline-md font-headline font-bold text-on-surface">{s.value}</p>
              <p className="text-label-md text-on-surface-variant mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-surface border border-outline-variant rounded-xl p-5">
          <h3 className="font-semibold text-on-surface mb-3 text-body-sm">Quick actions</h3>
          {[
            { href: '/admin/users',   icon: 'group',     label: 'Manage users & roles' },
            { href: '/admin/profile', icon: 'business',  label: 'Edit clinic profile' },
            { href: '/admin/usage',   icon: 'bar_chart', label: 'View usage report' },
          ].map(a => (
            <Link key={a.href} to={a.href}
              className="flex items-center gap-3 min-h-[44px] px-2 rounded-lg hover:bg-surface-container-low text-body-sm text-on-surface transition-colors">
              <MaterialIcon name={a.icon} size={18} className="text-on-surface-variant" />
              {a.label}
            </Link>
          ))}
        </div>

        <div className="bg-surface border border-outline-variant rounded-xl p-5">
          <h3 className="font-semibold text-on-surface mb-3 text-body-sm">Plan</h3>
          <p className="text-headline-md font-headline font-bold text-on-surface capitalize mb-1">
            {data?.planTier ?? '—'}
          </p>
          <p className="text-label-md text-on-surface-variant mb-4">Current subscription tier</p>
          <Link to="/admin/subscription"
            className="inline-flex items-center min-h-[44px] px-4 py-2 border border-primary text-primary text-body-sm rounded-lg hover:bg-surface-container-low transition-colors">
            Manage subscription
            <MaterialIcon name="chevron_right" size={16} className="ml-1" />
          </Link>
        </div>
      </div>
    </div>
  )
}
