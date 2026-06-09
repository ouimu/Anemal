// @uiux-agent spec: toggle rows, time pickers, slot duration — tablet-friendly
import React, { useState, useEffect } from 'react'
import { useAdminSettings, useUpdateSettings } from '../../hooks/useAdmin'

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} aria-pressed={checked}
      className={`w-11 h-6 rounded-full relative transition-colors flex-shrink-0 ${checked ? 'bg-secondary' : 'bg-surface-container-high'}`}>
      <span className={`absolute top-1 w-4 h-4 bg-surface rounded-full shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`}/>
    </button>
  )
}

export default function ClinicSettingsTab() {
  const { data, isLoading } = useAdminSettings()
  const update = useUpdateSettings()
  const [form, setForm] = useState({
    defaultSlotMinutes: 30, workStartTime: '08:00', workEndTime: '18:00',
    smsRemindersEnabled: true, lineRemindersEnabled: true,
  })
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (data) setForm({
      defaultSlotMinutes:  data.defaultSlotMinutes,
      workStartTime:       data.workStartTime,
      workEndTime:         data.workEndTime,
      smsRemindersEnabled: data.smsRemindersEnabled,
      lineRemindersEnabled:data.lineRemindersEnabled,
    })
  }, [data])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    await update.mutateAsync(form)
    setSaved(true); setTimeout(() => setSaved(false), 2500)
  }

  if (isLoading) return <p className="text-sm text-on-surface-variant py-8 text-center">Loading…</p>

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Appointments */}
      <section>
        <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-3">Appointment defaults</h3>
        <div className="bg-surface border border-outline-variant rounded-xl p-5 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-on-surface-variant">Default slot (min)</label>
              <select value={form.defaultSlotMinutes} onChange={e => setForm(p => ({ ...p, defaultSlotMinutes: Number(e.target.value) }))}
                className="min-h-[44px] px-3 border border-outline-variant rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20">
                {[15,20,30,45,60,90,120].map(v => <option key={v} value={v}>{v} min</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-on-surface-variant">Work start</label>
              <input type="time" value={form.workStartTime} onChange={e => setForm(p => ({ ...p, workStartTime: e.target.value }))}
                className="min-h-[44px] px-3 border border-outline-variant rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"/>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-on-surface-variant">Work end</label>
              <input type="time" value={form.workEndTime} onChange={e => setForm(p => ({ ...p, workEndTime: e.target.value }))}
                className="min-h-[44px] px-3 border border-outline-variant rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"/>
            </div>
          </div>
        </div>
      </section>

      {/* Notifications */}
      <section>
        <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-3">Notifications</h3>
        <div className="bg-surface border border-outline-variant rounded-xl divide-y divide-outline-variant">
          {[
            { key: 'smsRemindersEnabled',  label: 'SMS reminders',  sub: 'Send appointment reminders via SMS 24h and 1h before' },
            { key: 'lineRemindersEnabled', label: 'LINE reminders', sub: 'Send appointment reminders via LINE OA' },
          ].map(({ key, label, sub }) => (
            <div key={key} className="flex items-center gap-4 px-5 py-4 min-h-[56px]">
              <div className="flex-1">
                <p className="text-sm font-medium text-on-surface">{label}</p>
                <p className="text-xs text-on-surface-variant mt-0.5">{sub}</p>
              </div>
              <Toggle checked={form[key as keyof typeof form] as boolean}
                onChange={v => setForm(p => ({ ...p, [key]: v }))}/>
            </div>
          ))}
        </div>
      </section>

      <div className="flex items-center justify-end gap-3">
        {saved && <span className="text-sm text-secondary-on-container">✓ Saved</span>}
        <button type="submit" disabled={update.isPending}
          className="min-h-[44px] px-6 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-on text-sm font-semibold rounded-lg transition-colors">
          {update.isPending ? 'Saving…' : 'Save settings'}
        </button>
      </div>
    </form>
  )
}
