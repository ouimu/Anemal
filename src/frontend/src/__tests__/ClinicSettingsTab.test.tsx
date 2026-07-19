import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const { mutateAsync, settingsData } = vi.hoisted(() => ({
  mutateAsync: vi.fn().mockResolvedValue({}),
  settingsData: {
    defaultSlotMinutes: 30, workStartTime: '08:00', workEndTime: '18:00',
    smsRemindersEnabled: true, lineRemindersEnabled: true, idleTimeoutMinutes: 15,
  },
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: settingsData, isLoading: false }),
  useMutation: () => ({ mutateAsync, isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

import ClinicSettingsTab from '../views/admin/ClinicSettingsTab'

describe('ClinicSettingsTab (Appointment Settings)', () => {
  it('renders appointment defaults', () => {
    render(<ClinicSettingsTab />)
    expect(screen.getByText(/Appointment defaults/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save settings/i })).toBeInTheDocument()
  })

  it('no longer renders the idle-timeout Security field (moved to Users & Roles)', () => {
    render(<ClinicSettingsTab />)
    expect(screen.queryByLabelText(/idle timeout/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Security$/i)).not.toBeInTheDocument()
  })
})
