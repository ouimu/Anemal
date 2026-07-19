/**
 * Toggle — pill switch matching the Compassionate Care design system.
 * Visual pill is track w-14 h-8, knob w-6 h-6 (iOS-style, knob nearly fills
 * track height). The *button* itself is expanded to a min-h-[44px]
 * min-w-[44px] hit area per the design system's touch-target rule
 * (references/tokens.md "Touch Target Rules") since the visual pill alone
 * is narrower than 44px tall.
 * tone="danger" turns the ON track red for destructive settings (e.g. maintenance mode).
 */
interface ToggleProps {
  checked: boolean
  onChange: (v: boolean) => void
  tone?: 'default' | 'danger'
  ariaLabel?: string
  disabled?: boolean
}

export default function Toggle({ checked, onChange, tone = 'default', ariaLabel, disabled }: ToggleProps) {
  const onColor = tone === 'danger' ? 'bg-error' : 'bg-secondary'
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="min-h-[44px] min-w-[44px] flex items-center justify-center flex-shrink-0
        disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-full"
    >
      <span
        className={`w-14 h-8 rounded-full relative transition-colors ${checked ? onColor : 'bg-outline/30'}`}
      >
        <span
          className={`absolute top-1 left-1 w-6 h-6 bg-surface rounded-full shadow-lvl1 transition-transform ${checked ? 'translate-x-6' : 'translate-x-0'}`}
        />
      </span>
    </button>
  )
}
