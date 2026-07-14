/**
 * PasswordField — typed-or-generate password control (Q-10).
 * Reused by ClinicAdminsTab's create form (CO-8) and reset-password action
 * (CO-10) so there is exactly one implementation of this UI pattern.
 */
import { useState } from 'react'
import MaterialIcon from '../MaterialIcon'

interface Props {
  value:    string
  onChange: (value: string) => void
  id:       string
  label?:   string
}

export default function PasswordField({ value, onChange, id, label = 'Password' }: Props) {
  const [mode, setMode] = useState<'typed' | 'generated'>('generated')

  const handleGenerate = () => {
    // Server generates the real password on submit; this is a placeholder
    // toggle state only (empty value signals "server should generate").
    setMode('generated')
    onChange('')
  }

  return (
    <div>
      <label className="block text-label-md text-on-surface-variant mb-xs" htmlFor={id}>
        {label}
      </label>
      <div className="flex items-center gap-sm">
        <input
          id={id}
          type="text"
          value={value}
          disabled={mode === 'generated'}
          onChange={(e) => { setMode('typed'); onChange(e.target.value) }}
          placeholder={mode === 'generated' ? 'Server will generate a password' : 'Type a password (min 8 characters)'}
          className="flex-1 min-h-[44px] px-md border border-outline-variant rounded text-body-md text-on-surface bg-surface focus:outline-none focus:border-secondary disabled:bg-surface-container disabled:text-on-surface-variant"
        />
        {mode === 'typed' && (
          <button
            type="button"
            onClick={handleGenerate}
            className="flex items-center gap-xs min-h-[44px] px-md border border-outline-variant rounded text-body-sm text-on-surface-variant hover:bg-surface-container transition-colors"
          >
            <MaterialIcon name="autorenew" size={16} />
            Generate instead
          </button>
        )}
      </div>
      {mode === 'typed' && value.length > 0 && value.length < 8 && (
        <p className="text-label-md text-error mt-xs">Password must be at least 8 characters.</p>
      )}
    </div>
  )
}
