/**
 * QuotaBar — visual progress bar showing current usage vs quota limit.
 * Turns warning colour at ≥80%, error colour at ≥100%.
 */

const WARN_THRESHOLD  = 0.8
const ERROR_THRESHOLD = 1.0

interface Props {
  label:    string
  current:  number
  limit:    number | null
  /** Optional CSS class override for the wrapper. */
  className?: string
}

export default function QuotaBar({ label, current, limit, className = '' }: Props) {
  const isUnlimited = limit === null
  const pct         = isUnlimited ? 0 : Math.min(current / limit, 1)

  const barColor = isUnlimited
    ? 'bg-secondary'
    : pct >= ERROR_THRESHOLD
      ? 'bg-error'
      : pct >= WARN_THRESHOLD
        ? 'bg-warning'
        : 'bg-secondary'

  return (
    <div className={`space-y-xs ${className}`}>
      <div className="flex justify-between items-center">
        <span className="text-body-sm text-on-surface">{label}</span>
        <span className="text-label-md text-on-surface-variant font-medium">
          {current}{isUnlimited ? '' : ` / ${limit}`}
          {isUnlimited && <span className="ml-xs text-success">(unlimited)</span>}
        </span>
      </div>
      {!isUnlimited && (
        <div className="h-2 bg-surface-container rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${barColor}`}
            style={{ width: `${pct * 100}%` }}
          />
        </div>
      )}
    </div>
  )
}
