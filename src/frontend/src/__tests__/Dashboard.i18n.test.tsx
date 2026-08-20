import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../store/uiStore', () => ({
  useUiStore: (selector: (s: { language: string }) => unknown) =>
    selector({ language: 'th' }),
}))
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({ data: undefined, isLoading: false }),
}))
vi.mock('../store/authStore', () => ({
  useAuthStore: (selector: (s: { hasPermission: (code: string) => boolean }) => unknown) =>
    selector({ hasPermission: () => true }),
}))

import ClinicDashboard from '../views/clinic/ClinicDashboard'

describe('ClinicDashboard — Thai i18n', () => {
  it('renders Thai quick action: new appointment', () => {
    render(<MemoryRouter><ClinicDashboard /></MemoryRouter>)
    expect(screen.getAllByText('นัดหมายใหม่').length).toBeGreaterThan(0)
  })
  it('renders Thai section: appointments today', () => {
    render(<MemoryRouter><ClinicDashboard /></MemoryRouter>)
    expect(screen.getByText(/นัดหมายวันนี้/i)).toBeInTheDocument()
  })
  it('renders Thai revenue label', () => {
    render(<MemoryRouter><ClinicDashboard /></MemoryRouter>)
    expect(screen.getAllByText(/รายได้/i).length).toBeGreaterThan(0)
  })
})
