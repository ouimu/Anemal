import React, { useState, useEffect } from 'react'
import MaterialIcon from '../../components/MaterialIcon'
import { useAuthStore } from '../../store/authStore'
import {
  useOperatingHours,
  useUpdateOperatingHours,
  type DayKey,
  type OperatingHoursMap,
} from '../../hooks/useOperatingHoursSettings'

interface DayState {
  enabled: boolean
  open: string
  close: string
}

const DAY_LABELS: Record<DayKey, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
}

const DAY_KEYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const DEFAULT_DAY: DayState = { enabled: false, open: '09:00', close: '18:00' }

export default function OperatingHoursPage() {
  const { data, isLoading } = useOperatingHours()
  const update = useUpdateOperatingHours()
  const userId = useAuthStore(s => s.userId)

  const [hours, setHours] = useState<Record<DayKey, DayState>>(
    () => Object.fromEntries(DAY_KEYS.map(k => [k, { ...DEFAULT_DAY }])) as Record<DayKey, DayState>
  )
  const [saved, setSaved] = useState(false)
  const [timeError, setTimeError] = useState<string | null>(null)

  useEffect(() => {
    if (!data?.operatingHours) return
    const oh = data.operatingHours
    setHours(prev => {
      const next = { ...prev }
      for (const k of DAY_KEYS) {
        const day = oh[k]
        next[k] = day
          ? { enabled: true, open: day.open, close: day.close }
          : { enabled: false, open: prev[k].open || '09:00', close: prev[k].close || '18:00' }
      }
      return next
    })
  }, [data])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setTimeError(null)
    for (const k of DAY_KEYS) {
      if (hours[k].enabled && hours[k].close <= hours[k].open) {
        setTimeError(`${DAY_LABELS[k]}: closing time must be after opening time`)
        return
      }
    }
    const operatingHours = Object.fromEntries(
      DAY_KEYS.map(k => [
        k,
        hours[k].enabled ? { open: hours[k].open, close: hours[k].close } : null,
      ])
    ) as OperatingHoursMap
    try {
      await update.mutateAsync({ operatingHours })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch {
      // error displayed via update.error
    }
  }

  const lastUpdated = data?.updatedAt
    ? new Date(data.updatedAt).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
    : null
  const byYou = data?.updatedBy != null && data.updatedBy === userId

  if (isLoading) return (
    <div className="p-xl flex items-center gap-sm text-on-surface-variant">
      <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      <span className="text-body-md">Loading…</span>
    </div>
  )

  return (
    <form onSubmit={handleSave} className="max-w-2xl mx-auto p-xl flex flex-col gap-lg">
      <h1 className="text-headline-md font-headline text-on-surface">Operating Hours</h1>

      {/* Success banner */}
      {saved && (
        <div className="mb-md px-md py-sm bg-surface-container-low border border-outline-variant rounded-xl text-body-md text-secondary flex items-center gap-sm">
          <MaterialIcon name="check_circle" size={18} />
          Changes saved successfully
        </div>
      )}

      {/* Error banner */}
      {update.error && (
        <div className="mb-md px-md py-sm bg-error/10 border border-error/30 rounded-xl text-body-md text-error">
          Failed to save: {(update.error as Error).message}
        </div>
      )}

      {/* Time validation error */}
      {timeError && (
        <div className="mb-md px-md py-sm bg-error/10 border border-error/30 rounded-xl text-body-md text-error">
          {timeError}
        </div>
      )}

      {/* Day rows */}
      <div className="bg-surface rounded-2xl border border-outline-variant p-lg flex flex-col">
        {DAY_KEYS.map(k => (
          <div key={k} className="flex items-center gap-md py-sm border-b border-outline-variant last:border-0">
            {/* Toggle button */}
            <button
              type="button"
              onClick={() => setHours(p => ({ ...p, [k]: { ...p[k], enabled: !p[k].enabled } }))}
              className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl transition-colors
                ${hours[k].enabled
                  ? 'bg-primary text-surface'
                  : 'bg-surface-container-low text-on-surface-variant border border-outline-variant'}`}
              aria-label={`Toggle ${DAY_LABELS[k]}`}
              aria-pressed={hours[k].enabled}
            >
              <MaterialIcon name={hours[k].enabled ? 'toggle_on' : 'toggle_off'} size={24} />
            </button>

            {/* Day label */}
            <span className="w-28 text-body-md text-on-surface font-medium">{DAY_LABELS[k]}</span>

            {/* Time inputs (visible when enabled) */}
            {hours[k].enabled ? (
              <div className="flex items-center gap-sm flex-1">
                <input
                  type="time"
                  value={hours[k].open}
                  onChange={e => setHours(p => ({ ...p, [k]: { ...p[k], open: e.target.value } }))}
                  aria-label={`${DAY_LABELS[k]} opening time`}
                  className="min-h-[44px] px-md border border-outline-variant rounded-xl text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary"
                />
                <span className="text-body-md text-on-surface-variant">to</span>
                <input
                  type="time"
                  value={hours[k].close}
                  onChange={e => setHours(p => ({ ...p, [k]: { ...p[k], close: e.target.value } }))}
                  aria-label={`${DAY_LABELS[k]} closing time`}
                  className="min-h-[44px] px-md border border-outline-variant rounded-xl text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary"
                />
              </div>
            ) : (
              <span className="text-body-md text-on-surface-variant">Closed</span>
            )}
          </div>
        ))}
      </div>

      {/* Sticky save bar */}
      <div className="sticky bottom-0 bg-background pt-sm pb-md flex items-center justify-between border-t border-outline-variant">
        <p className="text-label-md text-on-surface-variant">
          {lastUpdated
            ? `Last updated: ${lastUpdated}${byYou ? ' · by you' : ''}`
            : 'Never saved'}
        </p>
        <button
          type="submit"
          disabled={update.isPending}
          className="min-h-[44px] min-w-[44px] px-xl bg-primary text-surface rounded-xl text-body-md font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {update.isPending ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </form>
  )
}
