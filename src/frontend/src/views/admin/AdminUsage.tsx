import { useQuery } from '@tanstack/react-query'
import api from '../../utils/api'
import { useAdminSettings } from '../../hooks/useAdmin'
import { useAuthStore } from '../../store/authStore'
import MaterialIcon from '../../components/MaterialIcon'
import BranchSwitcher from '../../components/BranchSwitcher'

interface QuotaCaps {
  maxBranches: number | null
  maxUsers: number | null
  maxOwners: number | null
  maxPets: number | null
}

interface Usage {
  totalPets: number; totalOwners: number; totalUsers: number; activeUsers: number
  appointmentsThisMonth: number; appointmentsToday: number; invoicesThisMonth: number; planTier: string
  caps: QuotaCaps
}

function formatCap(cap: number | null): string {
  return cap === null ? '∞' : String(cap)
}

function Bar({ value, max, color = 'bg-secondary' }: { value: number; max: number | null; color?: string }) {
  const effectiveMax = max === null ? Math.max(value, 1) : max
  const pct = max === null ? 0 : Math.min(100, Math.round((value / Math.max(effectiveMax, 1)) * 100))
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 bg-surface-container rounded-full h-2">
        <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }}/>
      </div>
      <span className="text-xs text-on-surface-variant w-10 text-right">{max === null ? '—' : `${pct}%`}</span>
    </div>
  )
}

export default function AdminUsage() {
  const branchId = useAuthStore(s => s.branchId)
  const { data, isLoading } = useQuery<Usage>({
    queryKey: ['admin', 'usage', branchId],
    queryFn: () => api.get('/admin/usage').then(r => r.data.data),
  })
  const { data: settings } = useAdminSettings()
  const tier = data?.planTier ?? 'starter'

  if (isLoading) return <div className="p-6 text-sm text-on-surface-variant">Loading…</div>
  if (!data) return null

  const caps = data.caps

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-md flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-on-surface">Usage statistics</h2>
          <p className="text-sm text-on-surface-variant mt-1">
            Plan: <span className="capitalize font-medium text-on-surface-variant">{tier}</span>
            {' · '}{settings?.tenant.subdomain}.anemal.app
          </p>
        </div>
        <BranchSwitcher />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Patients',          value: data.totalPets,             icon: 'pets' },
          { label: 'Owners',            value: data.totalOwners,           icon: 'person' },
          { label: 'Appts this month',  value: data.appointmentsThisMonth, icon: 'calendar_today' },
          { label: 'Invoices (month)',  value: data.invoicesThisMonth,     icon: 'receipt_long' },
        ].map(({ label, value, icon }) => (
          <div key={label} className="bg-surface border border-outline-variant rounded-xl p-4 text-center">
            <MaterialIcon name={icon} className="text-secondary mb-1" size={28} />
            <p className="text-2xl font-bold text-on-surface">{value}</p>
            <p className="text-xs text-on-surface-variant mt-1">{label}</p>
          </div>
        ))}
      </div>

      <div className="bg-surface border border-outline-variant rounded-2xl p-5 mb-6">
        <h3 className="text-sm font-semibold text-on-surface mb-4">Plan quota</h3>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-xs text-on-surface-variant mb-1">
              <span>Users</span>
              <span>{data.activeUsers} / {formatCap(caps.maxUsers)}</span>
            </div>
            <Bar value={data.activeUsers} max={caps.maxUsers}
              color={caps.maxUsers !== null && data.activeUsers / caps.maxUsers > 0.9 ? 'bg-error' : 'bg-secondary'}/>
          </div>
          <div>
            <div className="flex justify-between text-xs text-on-surface-variant mb-1">
              <span>Customer (Pet's Owners)</span>
              <span>{data.totalOwners} / {formatCap(caps.maxOwners)}</span>
            </div>
            <Bar value={data.totalOwners} max={caps.maxOwners}
              color={caps.maxOwners !== null && data.totalOwners / caps.maxOwners > 0.9 ? 'bg-warning' : 'bg-success'}/>
          </div>
          <div>
            <div className="flex justify-between text-xs text-on-surface-variant mb-1">
              <span>Registered patients (Pets)</span>
              <span>{data.totalPets} / {formatCap(caps.maxPets)}</span>
            </div>
            <Bar value={data.totalPets} max={caps.maxPets}
              color={caps.maxPets !== null && data.totalPets / caps.maxPets > 0.9 ? 'bg-warning' : 'bg-success'}/>
          </div>
        </div>
      </div>

      <div className="bg-surface border border-outline-variant rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-on-surface mb-3">Clinic summary</h3>
        <div className="divide-y divide-outline-variant">
          {[
            { label: 'Total staff accounts', value: data.totalUsers },
            { label: 'Active staff', value: data.activeUsers },
            { label: 'Inactive / deactivated', value: data.totalUsers - data.activeUsers },
            { label: 'Appointments today', value: data.appointmentsToday },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between py-2.5 text-sm min-h-[44px] items-center">
              <span className="text-on-surface-variant">{label}</span>
              <span className="font-semibold text-on-surface">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
