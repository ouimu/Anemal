import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../../utils/api'
import MaterialIcon from '../../components/MaterialIcon'
import { useReportSnapshot } from '../../hooks/useReports'
import { useAuthStore } from '../../store/authStore'
import { useT } from '../../i18n'

interface Usage {
  appointmentsToday:    number
  totalPets:            number
  invoicesThisMonth:    number
  appointmentsThisMonth: number
  vaccinationsDueSoon:  number
}

const baht = (n: number) => '฿' + n.toLocaleString('en-US', { maximumFractionDigits: 0 })

export default function ClinicDashboard() {
  const t             = useT()
  const hasPermission = useAuthStore(s => s.hasPermission)

  const QUICK_ACTIONS = [
    { icon: 'add_circle', label: t('clinic.dashboard.newAppointment'), to: '/clinic/appointments', color: 'text-secondary' },
    { icon: 'pets',       label: t('clinic.dashboard.registerPet'),    to: '/clinic/pets',         color: 'text-primary' },
    { icon: 'description',label: t('clinic.dashboard.newEMR'),         to: '/clinic/emr',          color: 'text-primary' },
    { icon: 'receipt',    label: t('clinic.dashboard.createInvoice'),  to: '/clinic/billing',      color: 'text-secondary' },
  ]

  const { data, isLoading } = useQuery<Usage>({
    queryKey: ['clinic', 'usage'],
    queryFn: () => api.get('/clinic/usage').then(r => r.data.data),
    retry: false,
  })
  const { data: snapshot } = useReportSnapshot()

  const now     = new Date()
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const val = (v: number | undefined) => isLoading ? '…' : (v ?? '—')

  return (
    <div className="p-lg">
      {/* Page header */}
      <div className="flex items-start justify-between mb-lg">
        <div>
          <h2 className="text-headline-lg font-headline font-bold text-primary">{t('clinic.dashboard.title')}</h2>
          <p className="text-body-md text-on-surface-variant mt-xs">{dateStr}</p>
        </div>
        <Link
          to="/clinic/appointments"
          className="flex items-center gap-sm bg-primary text-primary-on rounded-lg px-lg py-sm min-h-[44px] font-semibold text-body-sm hover:bg-primary/90 transition-colors"
        >
          <MaterialIcon name="add" size={18} />
          {t('clinic.dashboard.newAppointment')}
        </Link>
      </div>

      <div className="bento-grid">
        {/* KPI cards */}
        <LinkableStatCard
          to={hasPermission('appointments.view') ? '/clinic/appointments' : undefined}
          border="border-secondary" chip="Today" chipCls="bg-secondary-container text-secondary-on-container"
          icon="trending_up" iconCls="text-success"
          value={val(data?.appointmentsToday)} label={t('clinic.dashboard.appointmentsToday')}
        />
        <LinkableStatCard
          to={hasPermission('appointments.view') ? '/clinic/appointments?view=month' : undefined}
          border="border-info" chip="This month" chipCls="bg-surface-container text-on-surface-variant"
          icon="calendar_month" iconCls="text-info"
          value={val(data?.appointmentsThisMonth)} label={t('clinic.dashboard.totalAppointments')}
        />
        {hasPermission('billing.view') && (
          <LinkableStatCard
            to="/clinic/transactions?period=today"
            border="border-secondary" chip="Today" chipCls="bg-secondary-container text-secondary-on-container"
            icon="payments" iconCls="text-secondary"
            value={snapshot ? baht(snapshot.revenueToday) : '…'} label={t('clinic.dashboard.revenueToday')}
          />
        )}
        <LinkableStatCard
          to={hasPermission('emr.view') ? '/clinic/vaccinations-due' : undefined}
          border="border-warning" chip="Next 7 days" chipCls="bg-warning/10 text-warning"
          icon="vaccines" iconCls="text-warning"
          value={val(data?.vaccinationsDueSoon)} label={t('clinic.dashboard.vaccinationsDue')}
        />

        {/* Today's Schedule */}
        <div className="col-span-12 lg:col-span-8 glass-card rounded-xl shadow-lvl1 overflow-hidden">
          <div className="bg-primary text-primary-on px-lg py-md flex items-center justify-between">
            <h3 className="text-headline-xs font-headline font-semibold">Today's Appointments</h3>
            <Link to="/clinic/appointments" className="flex items-center gap-xs text-label-md text-primary-on/80 hover:text-primary-on transition-colors">
              View all <MaterialIcon name="chevron_right" size={16} />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-body-sm">
              <thead className="bg-surface-container-low">
                <tr>
                  {['Time', 'Patient', 'Owner', 'Doctor', 'Status'].map(h => (
                    <th key={h} className="text-left px-md py-sm text-label-md text-on-surface-variant uppercase tracking-wider font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                <tr className="hover:bg-surface-container transition-colors">
                  <td colSpan={5} className="px-md py-xl text-center text-on-surface-variant text-body-sm">
                    <MaterialIcon name="calendar_today" size={32} className="text-outline mb-sm block mx-auto" />
                    Open the Schedule to view today's appointments
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Inventory alerts */}
        <Link to="/clinic/inventory" className="col-span-12 lg:col-span-4 glass-card rounded-xl shadow-lvl1 p-md hover:shadow-lvl2 transition-shadow flex flex-col">
          <div className="flex items-center gap-sm mb-md">
            <div className="w-8 h-8 rounded-lg bg-error-container flex items-center justify-center">
              <MaterialIcon name="inventory_2" fill={1} size={18} className="text-error" />
            </div>
            <div>
              <h3 className="text-headline-xs font-headline font-semibold text-on-surface">{t('clinic.dashboard.inventoryAlerts')}</h3>
              <p className="text-label-md text-on-surface-variant">{t('clinic.dashboard.stockRequiringAttention')}</p>
            </div>
          </div>
          <div className="space-y-sm flex-1">
            <AlertRow icon="warning" tone="text-error" label={t('clinic.dashboard.lowStock')} value={snapshot?.lowStockCount ?? 0} />
            <AlertRow icon="schedule" tone="text-warning" label={t('clinic.dashboard.expiringSoon')} value={snapshot?.expiringSoonCount ?? 0} />
            <AlertRow icon="pending_actions" tone="text-info" label={t('clinic.dashboard.unpaidInvoices')} value={snapshot?.pendingInvoices ?? 0} />
          </div>
          <div className="mt-md border-t border-outline-variant pt-sm flex items-center justify-between text-label-md text-on-surface-variant">
            <span>{t('clinic.dashboard.manageInventory')}</span><MaterialIcon name="chevron_right" size={16} />
          </div>
        </Link>

        {/* Quick Actions */}
        <div className="col-span-12 grid grid-cols-2 md:grid-cols-4 gap-md">
          {QUICK_ACTIONS.map(action => (
            <Link key={action.to} to={action.to}
                  className="glass-card rounded-xl shadow-lvl1 p-md flex flex-col items-center gap-sm min-h-[88px] justify-center hover:shadow-lvl2 transition-shadow">
              <MaterialIcon name={action.icon} fill={1} size={28} className={action.color} />
              <span className="text-label-md text-on-surface-variant text-center leading-tight">{action.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

function LinkableStatCard({ to, border, chip, chipCls, icon, iconCls, value, label }: {
  to?: string; border: string; chip: string; chipCls: string
  icon: string; iconCls: string; value: number | string; label: string
}) {
  const inner = (
    <>
      <div className="flex items-center justify-between mb-sm">
        <span className={`rounded-full px-sm py-xs text-label-md font-medium ${chipCls}`}>{chip}</span>
        <MaterialIcon name={icon} size={18} className={iconCls} />
      </div>
      <p className="text-headline-md font-headline font-bold text-primary">{value}</p>
      <p className="text-body-sm text-on-surface-variant mt-xs">{label}</p>
    </>
  )
  const cls = `col-span-6 md:col-span-3 glass-card rounded-xl shadow-lvl1 border-l-4 ${border} p-md`
  return to
    ? <Link to={to} className={`${cls} hover:shadow-lvl2 transition-shadow`}>{inner}</Link>
    : <div className={cls}>{inner}</div>
}

function AlertRow({ icon, tone, label, value }: { icon: string; tone: string; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between bg-surface rounded-lg px-md py-sm min-h-[44px]">
      <span className="flex items-center gap-sm text-body-sm text-on-surface">
        <MaterialIcon name={icon} size={18} className={tone} /> {label}
      </span>
      <span className="font-bold text-on-surface font-code">{value}</span>
    </div>
  )
}
