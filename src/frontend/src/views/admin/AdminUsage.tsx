import React from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../utils/api'
import { useAdminSettings } from '../../hooks/useAdmin'
import MaterialIcon from '../../components/MaterialIcon'

interface Usage {
  totalPets: number; totalOwners: number; totalUsers: number; activeUsers: number
  appointmentsThisMonth: number; appointmentsToday: number; invoicesThisMonth: number; planTier: string
}

const PLAN_LIMITS: Record<string, { users: number; pets: number }> = {
  starter:      { users: 3,   pets: 500 },
  professional: { users: 999, pets: 999999 },
  enterprise:   { users: 999, pets: 999999 },
}

function Bar({ value, max, color = 'bg-secondary' }: { value: number; max: number; color?: string }) {
  const pct = Math.min(100, Math.round((value / Math.max(max, 1)) * 100))
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 bg-gray-100 rounded-full h-2">
        <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }}/>
      </div>
      <span className="text-xs text-gray-500 w-10 text-right">{pct}%</span>
    </div>
  )
}

export default function AdminUsage() {
  const { data, isLoading } = useQuery<Usage>({
    queryKey: ['admin', 'usage'],
    queryFn: () => api.get('/admin/usage').then(r => r.data.data),
  })
  const { data: settings } = useAdminSettings()
  const tier = data?.planTier ?? 'starter'
  const limits = PLAN_LIMITS[tier] ?? PLAN_LIMITS.starter

  if (isLoading) return <div className="p-6 text-sm text-gray-400">Loading…</div>
  if (!data) return null

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-800">Usage statistics</h2>
        <p className="text-sm text-gray-400 mt-1">
          Plan: <span className="capitalize font-medium text-gray-600">{tier}</span>
          {' · '}{settings?.tenant.subdomain}.vetclinic.app
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Patients',          value: data.totalPets,             icon: 'pets' },
          { label: 'Owners',            value: data.totalOwners,           icon: 'person' },
          { label: 'Appts this month',  value: data.appointmentsThisMonth, icon: 'calendar_today' },
          { label: 'Invoices (month)',  value: data.invoicesThisMonth,     icon: 'receipt_long' },
        ].map(({ label, value, icon }) => (
          <div key={label} className="bg-white border border-gray-200 rounded-xl p-4 text-center">
            <MaterialIcon name={icon} className="text-secondary mb-1" size={28} />
            <p className="text-2xl font-bold text-gray-800">{value}</p>
            <p className="text-xs text-gray-400 mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Quota bars */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Plan quota</h3>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Users</span>
              <span>{data.activeUsers} / {limits.users === 999 ? '∞' : limits.users}</span>
            </div>
            <Bar value={data.activeUsers} max={limits.users}
              color={data.activeUsers / limits.users > 0.9 ? 'bg-error' : 'bg-secondary'}/>
          </div>
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Registered patients</span>
              <span>{data.totalPets} / {limits.pets === 999999 ? '∞' : limits.pets}</span>
            </div>
            <Bar value={data.totalPets} max={limits.pets}
              color={data.totalPets / limits.pets > 0.9 ? 'bg-amber-400' : 'bg-green-500'}/>
          </div>
        </div>
      </div>

      {/* Clinic info */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Clinic summary</h3>
        <div className="divide-y divide-gray-100">
          {[
            { label: 'Total staff accounts', value: data.totalUsers },
            { label: 'Active staff', value: data.activeUsers },
            { label: 'Inactive / deactivated', value: data.totalUsers - data.activeUsers },
            { label: 'Appointments today', value: data.appointmentsToday },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between py-2.5 text-sm min-h-[44px] items-center">
              <span className="text-gray-500">{label}</span>
              <span className="font-semibold text-gray-800">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
