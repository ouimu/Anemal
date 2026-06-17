/**
 * StatusBadge — displays tenant / customer status with design-system colours.
 * @param status - 'active' | 'trial' | 'suspended'
 */

type Status = 'active' | 'trial' | 'suspended'

const STATUS_CLASSES: Record<Status, string> = {
  active:    'bg-secondary/10 text-secondary border border-secondary/20',
  trial:     'bg-info/10 text-info border border-info/20',
  suspended: 'bg-error/10 text-error border border-error/20',
}

const STATUS_LABELS: Record<Status, string> = {
  active:    'Active',
  trial:     'Trial',
  suspended: 'Suspended',
}

interface Props {
  status: Status
  className?: string
}

export default function StatusBadge({ status, className = '' }: Props) {
  return (
    <span
      className={`inline-flex items-center px-sm py-xs rounded-full text-label-md font-medium ${STATUS_CLASSES[status]} ${className}`}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}
