import { useState, useRef, useEffect } from 'react'

// ─── Vital stepper ────────────────────────────────────────────────────────────
/**
 * Numeric vital-sign input (weight/temperature/HR/RR) — free-text `<input type="number">`
 * alongside the existing +/- stepper buttons.
 *
 * Commit is idempotent: it parses the DOM input's current value via `valueAsNumber`,
 * rounds to `step` precision, and clamps to `[>0, max]`. A `justCommitted` flag guards
 * against double-dispatch when Enter fires a commit and the blur it naturally triggers
 * fires a second one immediately after with no intervening edit — the second call is a
 * no-op, and the flag clears on the next real keystroke (spec §1/§8.6).
 */
export function VitalStepper({ label, unit, value, onChange, step = 0.1, min = 0, max }: {
  label: string; unit: string; value: number | null; onChange: (v: number | null) => void; step?: number; min?: number; max?: number
}) {
  const [draft, setDraft] = useState(value !== null ? value.toString() : '')
  const inputRef = useRef<HTMLInputElement>(null)
  const justCommittedRef = useRef(false)

  useEffect(() => {
    setDraft(value !== null ? value.toString() : '')
  // draft re-syncs only when the external value changes (e.g. +/- button clicks),
  // not on every keystroke — the input owns its own draft string while focused.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const inc = () => {
    const next = Math.round(((value ?? 0) + step) * 10) / 10
    onChange(max !== undefined && next > max ? max : next)
  }
  const dec = () => { const v = Math.round(((value ?? 0) - step) * 10) / 10; onChange(v < min ? null : v) }

  const commit = () => {
    if (justCommittedRef.current) { justCommittedRef.current = false; return }
    const raw = inputRef.current?.valueAsNumber
    let result: number | null
    if (raw === undefined || Number.isNaN(raw)) {
      result = null
    } else {
      let rounded = Math.round(raw / step) * step
      rounded = Math.round(rounded * 100) / 100 // avoid float drift before the ≤0 recheck
      result = rounded <= 0 ? null : (max !== undefined && rounded > max ? max : rounded)
    }
    onChange(result)
    setDraft(result !== null ? result.toString() : '')
    justCommittedRef.current = true
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); commit() }
  }
  const onWheel = () => inputRef.current?.blur()

  return (
    <div className="flex flex-col items-center gap-xs bg-surface-container-low rounded-xl p-md min-w-[90px]">
      <span className="text-label-md text-on-surface-variant">{label}</span>
      <div className="flex items-center gap-sm">
        <button type="button" onClick={dec} className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-surface hover:bg-surface-container border border-outline-variant text-headline-sm font-bold transition-colors">−</button>
        <input
          ref={inputRef}
          type="number"
          step={step}
          min={min}
          max={max}
          value={draft}
          onChange={e => { setDraft(e.target.value); justCommittedRef.current = false }}
          onBlur={commit}
          onKeyDown={onKeyDown}
          onWheel={onWheel}
          aria-label={label}
          className="text-headline-xs font-bold min-w-[48px] min-h-[44px] text-center bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-primary rounded-lg"
        />
        <button type="button" onClick={inc} className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-surface hover:bg-surface-container border border-outline-variant text-headline-sm font-bold transition-colors">+</button>
      </div>
      <span className="text-label-md text-on-surface-variant">{unit}</span>
    </div>
  )
}
