import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../../store/authStore'
import api from '../../utils/api'
import { Link } from 'react-router-dom'
import MaterialIcon from '../../components/MaterialIcon'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface Usage {
  totalPets: number; totalOwners: number; totalUsers: number; activeUsers: number
  appointmentsThisMonth: number; appointmentsToday: number; invoicesThisMonth: number; planTier: string
}

interface BranchRevenueRow { branchId: number; branchName: string; total: number; count: number }

function dateStr(d: Date) { return d.toISOString().split('T')[0] }
function firstOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1) }

const STATS = (u: Usage) => [
  { icon: 'calendar_today', label: "Today's appointments", value: u.appointmentsToday,     color: 'bg-primary-fixed border-primary/30' },
  { icon: 'calendar_month', label: 'This month',           value: u.appointmentsThisMonth, color: 'bg-surface-container border-outline-variant' },
  { icon: 'pets',           label: 'Active patients',      value: u.totalPets,             color: 'bg-secondary-container/30 border-secondary/20' },
  { icon: 'person',         label: 'Pet owners',           value: u.totalOwners,           color: 'bg-surface-container border-outline-variant' },
  { icon: 'receipt',        label: 'Invoices this month',  value: u.invoicesThisMonth,     color: 'bg-surface-container border-outline-variant' },
  { icon: 'group',          label: 'Active staff',         value: u.activeUsers,           color: 'bg-surface-container border-outline-variant' },
]

function formatTHB(n: number) {
  return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 }).format(n)
}

export default function AdminDashboard() {
  const name = useAuthStore(s => s.name)
  const today = new Date()
  const todayStr = dateStr(today)
  const [revenueFrom, setRevenueFrom] = useState(dateStr(firstOfMonth(today)))
  const [revenueTo,   setRevenueTo]   = useState(todayStr)

  const { data, isLoading } = useQuery<Usage>({
    queryKey: ['admin', 'usage'],
    queryFn: () => api.get('/admin/usage').then(r => r.data.data),
  })

  const { data: inpatients = [] } = useQuery<{ id: number }[]>({
    queryKey: ['inpatient-active'],
    queryFn: () => api.get('/hospitalizations/active').then(r => r.data.data),
    refetchInterval: 60_000,
  })

  const { data: groomingToday = [] } = useQuery<{ id: number }[]>({
    queryKey: ['grooming', todayStr],
    queryFn: () => api.get(`/grooming/bookings?date=${todayStr}`).then(r => r.data.data),
  })

  const { data: branchRevenue = [], isLoading: revenueLoading } = useQuery<BranchRevenueRow[]>({
    queryKey: ['branch-revenue', revenueFrom, revenueTo],
    queryFn: () => api.get(`/reports/branch-revenue?from=${revenueFrom}&to=${revenueTo}`).then(r => r.data.data),
  })

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h2 className="text-headline-sm font-headline font-bold text-primary">Welcome back, {name}</h2>
        <p className="text-body-sm text-on-surface-variant mt-1">Clinic overview · Admin panel</p>
      </div>

      {/* Core KPI grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-24 bg-surface-container rounded-xl animate-pulse" />
          ))}
        </div>
      ) : data ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {STATS(data).map(s => (
            <div key={s.label} className={`border rounded-xl p-4 ${s.color}`}>
              <MaterialIcon name={s.icon} size={20} className="text-on-surface-variant mb-1" />
              <p className="text-headline-md font-headline font-bold text-on-surface">{s.value}</p>
              <p className="text-label-md text-on-surface-variant mt-1">{s.label}</p>
            </div>
          ))}
          {/* Phase 4 KPIs */}
          <div className="border rounded-xl p-4 bg-surface-container-low border-outline-variant">
            <MaterialIcon name="local_hospital" size={20} className="text-error mb-1" />
            <p className="text-headline-md font-headline font-bold text-on-surface">{inpatients.length}</p>
            <p className="text-label-md text-on-surface-variant mt-1">Inpatients now</p>
          </div>
          <div className="border rounded-xl p-4 bg-surface-container-low border-outline-variant">
            <MaterialIcon name="content_cut" size={20} className="text-secondary mb-1" />
            <p className="text-headline-md font-headline font-bold text-on-surface">{groomingToday.length}</p>
            <p className="text-label-md text-on-surface-variant mt-1">Grooming today</p>
          </div>
        </div>
      ) : null}

      {/* Branch Revenue chart */}
      <div className="bg-surface border border-outline-variant rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between flex-wrap gap-sm mb-4">
          <h3 className="font-semibold text-on-surface text-body-md">Revenue by Branch</h3>
          <div className="flex items-center gap-sm">
            <label className="text-label-md text-on-surface-variant">From</label>
            <input
              type="date"
              value={revenueFrom}
              onChange={e => setRevenueFrom(e.target.value)}
              className="rounded-lg border border-outline-variant bg-surface px-sm py-xs text-body-sm text-on-surface focus:outline-none focus:border-primary transition-colors min-h-[36px]"
            />
            <label className="text-label-md text-on-surface-variant">To</label>
            <input
              type="date"
              value={revenueTo}
              onChange={e => setRevenueTo(e.target.value)}
              className="rounded-lg border border-outline-variant bg-surface px-sm py-xs text-body-sm text-on-surface focus:outline-none focus:border-primary transition-colors min-h-[36px]"
            />
          </div>
        </div>
        {revenueLoading ? (
          <div className="h-48 bg-surface-container rounded-xl animate-pulse" />
        ) : branchRevenue.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-on-surface-variant text-body-md">
            No revenue data for selected period.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={branchRevenue} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#c6c6cd" />
              <XAxis dataKey="branchName" tick={{ fontSize: 12, fill: '#45464d' }} />
              <YAxis tickFormatter={v => `฿${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12, fill: '#45464d' }} />
              <Tooltip
                formatter={(value: number) => [formatTHB(value), 'Revenue']}
                contentStyle={{ borderRadius: '8px', border: '1px solid #c6c6cd', fontSize: 13 }}
              />
              <Bar dataKey="total" fill="#0369a1" radius={[4, 4, 0, 0]} maxBarSize={60} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-surface border border-outline-variant rounded-xl p-5">
          <h3 className="font-semibold text-on-surface mb-3 text-body-sm">Quick actions</h3>
          {[
            { href: '/admin/users',    icon: 'group',      label: 'Manage users & roles' },
            { href: '/admin/profile',  icon: 'business',   label: 'Edit clinic profile' },
            { href: '/admin/usage',    icon: 'bar_chart',  label: 'View usage report' },
            { href: '/admin/branches', icon: 'apartment',  label: 'Manage branches' },
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
