// src/frontend/src/__tests__/ClinicAppointments.i18n.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../store/uiStore', () => ({
  useUiStore: (s: (s: { language: string }) => unknown) => s({ language: 'th' }),
}))
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({ data: [], isLoading: false }),
  useMutation: () => ({ mutate: vi.fn() }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

import ClinicAppointments from '../views/clinic/ClinicAppointments'

describe('ClinicAppointments — Thai i18n', () => {
  it('renders Thai book button', () => {
    render(<MemoryRouter><ClinicAppointments /></MemoryRouter>)
    expect(screen.getByRole('button', { name: /นัดหมายใหม่/i })).toBeInTheDocument()
  })
  it('renders Thai patient label', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><ClinicAppointments /></MemoryRouter>)
    await user.click(screen.getByRole('button', { name: /นัดหมายใหม่/i }))
    expect(screen.getByText(/ผู้ป่วย/i)).toBeInTheDocument()
  })
})
