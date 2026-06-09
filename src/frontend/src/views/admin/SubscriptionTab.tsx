// Subscription & tenant info — multi-tenant expansion panel
import { useAdminSettings } from '../../hooks/useAdmin'
import { useSubscriptionStatus } from '../../hooks/useSubscription'

const PLANS = [
  { tier: 'starter',      label: 'Starter',      price: '฿990/mo',   features: ['1 clinic','Up to 3 users','Basic reports'] },
  { tier: 'professional', label: 'Professional', price: '฿2,490/mo', features: ['1 clinic','Unlimited users','Advanced reports','LINE & SMS'] },
  { tier: 'enterprise',   label: 'Enterprise',   price: 'Custom',    features: ['Multiple clinics','Multi-tenant','API access','Dedicated support'] },
]

export default function SubscriptionTab() {
  const { data, isLoading } = useAdminSettings()
  const { data: sub } = useSubscriptionStatus()
  if (isLoading) return <p className="text-sm text-on-surface-variant py-8 text-center">Loading…</p>

  const current = data?.planTier ?? 'starter'

  const maxUsers = sub?.limits.maxUsers ?? null
  const usedUsers = sub?.usage.users ?? 0
  const atLimit = maxUsers !== null && usedUsers >= maxUsers
  const usagePct = maxUsers ? Math.min(100, Math.round((usedUsers / maxUsers) * 100)) : 0

  return (
    <div className="space-y-6">
      {/* Plan usage */}
      {sub && (
        <section>
          <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-3">Plan usage</h3>
          <div className="bg-surface border border-outline-variant rounded-xl p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-on-surface">Active users</span>
              <span className={`text-sm font-medium ${atLimit ? 'text-error' : 'text-on-surface'}`}>
                {usedUsers} / {maxUsers === null ? 'Unlimited' : maxUsers}
              </span>
            </div>
            {maxUsers !== null && (
              <div className="h-2 w-full rounded-full bg-surface-container-high overflow-hidden">
                <div className={`h-full rounded-full ${atLimit ? 'bg-error' : 'bg-secondary'}`} style={{ width: `${usagePct}%` }} />
              </div>
            )}
            {atLimit && (
              <p className="text-xs text-error mt-2">User limit reached — upgrade your plan to add more team members.</p>
            )}
          </div>
        </section>
      )}

      {/* Tenant info */}
      <section>
        <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-3">Tenant information</h3>
        <div className="bg-surface border border-outline-variant rounded-xl divide-y divide-outline-variant">
          {[
            { label: 'Clinic name',  value: data?.tenant.name ?? '—' },
            { label: 'Subdomain',    value: `${data?.tenant.subdomain ?? ''}.anemal.app` },
            { label: 'Current plan', value: current.charAt(0).toUpperCase() + current.slice(1) },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between px-5 py-3 min-h-[44px]">
              <span className="text-sm text-on-surface-variant">{label}</span>
              <span className="text-sm font-medium text-on-surface">{value}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Plan cards */}
      <section>
        <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-3">Plans</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {PLANS.map(plan => {
            const isCurrent = plan.tier === current
            return (
              <div key={plan.tier}
                className={`bg-surface border rounded-xl p-5 flex flex-col gap-3 ${isCurrent ? 'border-primary ring-1 ring-primary/20' : 'border-outline-variant'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-on-surface">{plan.label}</span>
                  {isCurrent && <span className="text-xs px-2 py-0.5 rounded-full bg-secondary-container text-secondary-on-container font-medium">Current</span>}
                </div>
                <p className="text-xl font-bold text-on-surface">{plan.price}</p>
                <ul className="space-y-1 flex-1">
                  {plan.features.map(f => (
                    <li key={f} className="text-xs text-on-surface-variant flex items-center gap-1.5">
                      <span className="text-success">✓</span>{f}
                    </li>
                  ))}
                </ul>
                {!isCurrent && (
                  <button className="min-h-[44px] w-full border border-primary text-primary text-sm rounded-lg font-medium hover:bg-surface-container-low transition-colors">
                    {plan.tier === 'enterprise' ? 'Contact us' : 'Upgrade'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* Multi-tenant note */}
      <div className="bg-primary-fixed border border-primary/30 rounded-xl p-4">
        <p className="text-sm font-medium text-primary mb-1">Expanding to more clinics?</p>
        <p className="text-xs text-primary">Each clinic runs as a separate tenant with full data isolation. Upgrade to Enterprise or contact us to provision additional clinic subdomains under your account.</p>
      </div>
    </div>
  )
}
