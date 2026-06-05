import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../../utils/api'
import MaterialIcon from '../../components/MaterialIcon'

interface Usage {
  appointmentsToday: number
  totalPets: number
  invoicesThisMonth: number
  appointmentsThisMonth: number
  vaccinationsDueSoon: number
}

const QUICK_ACTIONS = [
  { icon: 'add_circle', label: 'New Appointment', to: '/clinic/appointments', color: 'text-secondary' },
  { icon: 'pets',       label: 'Register Pet',    to: '/clinic/pets',         color: 'text-primary' },
  { icon: 'description',label: 'New EMR Record',  to: '/clinic/emr',          color: 'text-primary' },
  { icon: 'receipt',    label: 'Create Invoice',  to: '/clinic/billing',      color: 'text-secondary' },
]

export default function ClinicDashboard() {
  const { data, isLoading } = useQuery<Usage>({
    queryKey: ['clinic', 'usage'],
    queryFn: () => api.get('/clinic/usage').then(r => r.data.data),
    retry: false,
  })

  const now     = new Date()
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const val = (v: number | undefined) => isLoading ? '…' : (v ?? '—')

  return (
    <div className="p-lg">
      {/* Page header */}
      <div className="flex items-start justify-between mb-lg">
        <div>
          <h2 className="text-headline-lg font-headline font-bold text-primary">Clinic Overview</h2>
          <p className="text-body-md text-on-surface-variant mt-xs">{dateStr}</p>
        </div>
        <Link
          to="/clinic/appointments"
          className="flex items-center gap-sm bg-primary text-on-primary rounded-lg px-lg py-sm min-h-[44px] font-semibold text-body-sm hover:bg-primary/90 transition-colors"
        >
          <MaterialIcon name="add" size={18} />
          New Appointment
        </Link>
      </div>

      {/* Bento grid */}
      <div className="bento-grid">

        {/* Today's Appointments — col-span-3 */}
        <div className="col-span-6 md:col-span-3 glass-card rounded-xl shadow-lvl1 border-l-4 border-secondary p-md">
          <div className="flex items-center justify-between mb-sm">
            <span className="bg-secondary-container text-on-secondary-container rounded-full px-sm py-xs text-label-md font-medium">
              Today
            </span>
            <MaterialIcon name="trending_up" size={18} className="text-success" />
          </div>
          <p className="text-headline-md font-headline font-bold text-primary">
            {val(data?.appointmentsToday)}
          </p>
          <p className="text-body-sm text-on-surface-variant mt-xs">Appointments today</p>
        </div>

        {/* Monthly Visits — col-span-3 */}
        <div className="col-span-6 md:col-span-3 glass-card rounded-xl shadow-lvl1 border-l-4 border-info p-md">
          <div className="flex items-center justify-between mb-sm">
            <span className="bg-surface-container text-on-surface-variant rounded-full px-sm py-xs text-label-md font-medium">
              This month
            </span>
            <MaterialIcon name="calendar_month" size={18} className="text-info" />
          </div>
          <p className="text-headline-md font-headline font-bold text-primary">
            {val(data?.appointmentsThisMonth)}
          </p>
          <p className="text-body-sm text-on-surface-variant mt-xs">Total appointments</p>
        </div>

        {/* Vaccinations Due Soon — col-span-3 */}
        <Link to="/clinic/pets" className="col-span-6 md:col-span-3 glass-card rounded-xl shadow-lvl1 border-l-4 border-warning p-md hover:shadow-lvl2 transition-shadow">
          <div className="flex items-center justify-between mb-sm">
            <span className="bg-warning/10 text-warning rounded-full px-sm py-xs text-label-md font-medium">
              Next 7 days
            </span>
            <MaterialIcon name="vaccines" size={18} className="text-warning" />
          </div>
          <p className="text-headline-md font-headline font-bold text-primary">
            {val(data?.vaccinationsDueSoon)}
          </p>
          <p className="text-body-sm text-on-surface-variant mt-xs">Vaccinations due soon</p>
        </Link>

        {/* System Status — col-span-6 */}
        <div className="col-span-12 md:col-span-6 glass-card rounded-xl shadow-lvl1 p-md">
          <div className="flex items-center gap-sm mb-md">
            <div className="w-8 h-8 rounded-lg bg-secondary-container flex items-center justify-center">
              <MaterialIcon name="shield_check" fill={1} size={18} className="text-secondary" />
            </div>
            <div>
              <h3 className="text-headline-xs font-headline font-semibold text-on-surface">System Status</h3>
              <p className="text-label-md text-on-surface-variant">Multi-tenant data isolation</p>
            </div>
          </div>
          <div className="space-y-sm">
            {[
              { label: 'Tenant isolation', status: 'Active', ok: true },
              { label: 'JWT auth', status: 'Active', ok: true },
              { label: 'RBAC enforcement', status: 'Active', ok: true },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between bg-surface rounded-lg px-md py-sm min-h-[44px]">
                <span className="text-body-sm text-on-surface">{row.label}</span>
                <span className={`text-label-md font-medium rounded px-sm py-xs uppercase ${row.ok ? 'bg-secondary-container text-on-secondary-container' : 'bg-error-container text-on-error-container'}`}>
                  {row.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Today's Schedule — col-span-8 */}
        <div className="col-span-12 lg:col-span-8 glass-card rounded-xl shadow-lvl1 overflow-hidden">
          <div className="bg-primary text-on-primary px-lg py-md flex items-center justify-between">
            <h3 className="text-headline-xs font-headline font-semibold">Today's Appointments</h3>
            <Link to="/clinic/appointments" className="flex items-center gap-xs text-label-md text-on-primary/80 hover:text-on-primary transition-colors">
              View all <MaterialIcon name="chevron_right" size={16} />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-body-sm">
              <thead className="bg-surface-container-low">
                <tr>
                  {['Time', 'Patient', 'Owner', 'Doctor', 'Status'].map(h => (
                    <th key={h} className="text-left px-md py-sm text-label-md text-on-surface-variant uppercase tracking-wider font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                <tr className="hover:bg-surface-container transition-colors">
                  <td colSpan={5} className="px-md py-xl text-center text-on-surface-variant text-body-sm">
                    <MaterialIcon name="calendar_today" size={32} className="text-outline mb-sm block mx-auto" />
                    Appointment data available in Phase 2
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Waiting Queue — col-span-4 */}
        <div className="col-span-12 lg:col-span-4 glass-card rounded-xl shadow-lvl1 p-md">
          <div className="flex items-center justify-between mb-md">
            <h3 className="text-headline-xs font-headline font-semibold text-on-surface">Waiting Queue</h3>
            <span className="bg-surface-container text-on-surface-variant rounded-full px-sm text-label-md">0</span>
          </div>
          <div className="space-y-sm">
            <div className="flex items-center gap-sm bg-surface-container-low rounded-lg px-md py-sm min-h-[48px]">
              <div className="w-8 h-8 rounded-full bg-primary-container flex items-center justify-center flex-shrink-0">
                <MaterialIcon name="pets" size={16} fill={1} className="text-on-surface" />
              </div>
              <p className="text-body-sm text-on-surface-variant italic flex-1">No patients waiting</p>
            </div>
          </div>
          <div className="mt-md border-t border-outline-variant pt-md">
            <div className="flex items-center justify-between text-body-sm">
              <span className="text-on-surface-variant">Total patients</span>
              <span className="font-bold text-primary text-headline-xs">{val(data?.totalPets)}</span>
            </div>
            <div className="flex items-center justify-between text-body-sm mt-sm">
              <span className="text-on-surface-variant">Invoices this month</span>
              <span className="font-bold text-primary text-headline-xs">{val(data?.invoicesThisMonth)}</span>
            </div>
          </div>
        </div>

        {/* Quick Actions — col-span-12 */}
        <div className="col-span-12 grid grid-cols-2 md:grid-cols-4 gap-md">
          {QUICK_ACTIONS.map(action => (
            <Link
              key={action.to}
              to={action.to}
              className="glass-card rounded-xl shadow-lvl1 p-md flex flex-col items-center gap-sm min-h-[88px] justify-center hover:shadow-lvl2 transition-shadow"
            >
              <MaterialIcon name={action.icon} fill={1} size={28} className={action.color} />
              <span className="text-label-md text-on-surface-variant text-center leading-tight">{action.label}</span>
            </Link>
          ))}
        </div>

      </div>
    </div>
  )
}
