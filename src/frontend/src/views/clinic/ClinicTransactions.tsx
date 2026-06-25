import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { useTransactions, useTransactionRevenue } from '../../hooks/useTransactions'

const CHART = { secondary: '#006c4a', grid: '#e0e3e5', axis: '#45464d' }
const baht  = (n: number) => '฿' + n.toLocaleString('en-US', { maximumFractionDigits: 0 })

export default function ClinicTransactions() {
  const [searchParams, setSearchParams] = useSearchParams()
  const period      = (searchParams.get('period') as 'today' | 'month') ?? 'today'
  const [page, setPage]                = useState(1)
  const [chartPeriod, setChartPeriod]  = useState<'daily' | 'monthly'>('daily')

  const { data, isLoading }  = useTransactions(period, page)
  const { data: revenue }    = useTransactionRevenue(chartPeriod)

  const setPeriod = (p: 'today' | 'month') => { setSearchParams({ period: p }); setPage(1) }

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleString('th-TH', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="p-lg">
      <div className="flex items-center justify-between mb-lg">
        <h2 className="text-headline-lg font-headline font-bold text-primary">Transaction History</h2>
        <div className="flex bg-surface-container-low rounded-lg p-xs">
          {(['today', 'month'] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
                    className={`min-h-[36px] px-md rounded-md text-label-md capitalize transition-colors ${period === p ? 'bg-surface text-primary font-semibold shadow-lvl1' : 'text-on-surface-variant'}`}>
              {p === 'today' ? 'Today' : 'This Month'}
            </button>
          ))}
        </div>
      </div>

      {/* Revenue chart */}
      <div className="glass-card rounded-xl shadow-lvl1 p-md mb-lg">
        <div className="flex items-center justify-between mb-md">
          <div>
            <h3 className="text-headline-xs font-headline font-semibold text-on-surface">Revenue (received)</h3>
            <p className="text-label-md text-on-surface-variant">
              {chartPeriod === 'daily' ? 'Last 14 days' : 'Last 6 months'}
              {revenue ? ` · ${baht(revenue.total)} total` : ''}
            </p>
          </div>
          <div className="flex bg-surface-container-low rounded-lg p-xs">
            {(['daily', 'monthly'] as const).map(p => (
              <button key={p} onClick={() => setChartPeriod(p)}
                      className={`min-h-[36px] px-md rounded-md text-label-md capitalize transition-colors ${chartPeriod === p ? 'bg-surface text-primary font-semibold shadow-lvl1' : 'text-on-surface-variant'}`}>
                {p}
              </button>
            ))}
          </div>
        </div>
        {revenue && revenue.series.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={revenue.series} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="rev-tx" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART.secondary} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={CHART.secondary} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: CHART.axis }} tickLine={false} axisLine={{ stroke: CHART.grid }} />
              <YAxis tick={{ fontSize: 11, fill: CHART.axis }} width={56} tickLine={false} axisLine={false}
                     tickFormatter={v => baht(Number(v))} />
              <Tooltip formatter={v => [baht(Number(v)), 'Revenue']}
                       contentStyle={{ borderRadius: 12, border: `1px solid ${CHART.grid}`, fontSize: 12 }} />
              <Area type="monotone" dataKey="revenue" stroke={CHART.secondary} strokeWidth={2} fill="url(#rev-tx)" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-on-surface-variant text-body-sm">No data</div>
        )}
      </div>

      {/* Transaction list */}
      <div className="glass-card rounded-xl shadow-lvl1 overflow-hidden">
        <table className="w-full text-body-sm">
          <thead className="bg-surface-container-low">
            <tr>
              {['Time', 'Invoice', 'Method', 'Amount', 'Received by', 'Note'].map(h => (
                <th key={h} className="text-left px-md py-sm text-label-md text-on-surface-variant uppercase tracking-wider font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant">
            {isLoading && (
              <tr><td colSpan={6} className="text-center py-xl text-on-surface-variant">Loading…</td></tr>
            )}
            {!isLoading && !data?.rows.length && (
              <tr><td colSpan={6} className="text-center py-xl text-on-surface-variant">No transactions for this period.</td></tr>
            )}
            {data?.rows.map((row, i) => (
              <tr key={i} className="hover:bg-surface-container transition-colors">
                <td className="px-md py-sm text-on-surface-variant">{formatTime(row.paidAt)}</td>
                <td className="px-md py-sm">
                  <Link to={`/clinic/billing/${row.invoiceId}`} className="text-primary hover:underline">
                    #{row.invoiceNo}
                  </Link>
                </td>
                <td className="px-md py-sm capitalize text-on-surface-variant">{row.method ?? '—'}</td>
                <td className="px-md py-sm font-semibold text-on-surface">{baht(row.amount)}</td>
                <td className="px-md py-sm text-on-surface-variant">{row.receivedByName ?? '—'}</td>
                <td className="px-md py-sm text-on-surface-variant">{row.note ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.total > 20 && (
          <div className="flex items-center justify-between px-md py-sm border-t border-outline-variant">
            <span className="text-label-md text-on-surface-variant">
              {(page - 1) * 20 + 1}–{Math.min(page * 20, data.total)} of {data.total}
            </span>
            <div className="flex gap-xs">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                      className="min-h-[36px] px-md rounded-lg border border-outline-variant text-label-md disabled:opacity-40">Prev</button>
              <button onClick={() => setPage(p => p + 1)} disabled={page * 20 >= data.total}
                      className="min-h-[36px] px-md rounded-lg border border-outline-variant text-label-md disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
