import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

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

describe('ClinicSettingsTab — Security section', () => {
  it('renders the idle-timeout input with the loaded value', () => {
    render(<ClinicSettingsTab />)
    expect(screen.getByLabelText(/idle timeout/i)).toHaveValue(15)
  })

  it('submits the updated idle-timeout value on save', async () => {
    render(<ClinicSettingsTab />)
    fireEvent.change(screen.getByLabelText(/idle timeout/i), { target: { value: '45' } })
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }))
    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ idleTimeoutMinutes: 45 }))
  })
})
