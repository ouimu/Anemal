import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const h = vi.hoisted(() => ({ mutate: vi.fn() }))
const state = vi.hoisted(() => ({ isPending: false, isSuccess: false, isError: false, error: null as unknown }))

vi.mock('../hooks/useChangePassword', () => ({
  useChangePassword: () => ({ mutate: h.mutate, ...state }),
}))
vi.mock('../hooks/usePersonalPreferences', () => ({
  useSavePreferences: () => ({ mutate: vi.fn() }),
}))
vi.mock('../store/uiStore', () => ({
  useUiStore: (selector: (s: { theme: string; language: string; toggleTheme: () => void; setLanguage: () => void }) => unknown) =>
    selector({ theme: 'light', language: 'en', toggleTheme: vi.fn(), setLanguage: vi.fn() }),
}))

import PreferencesPage from '../views/settings/PreferencesPage'

function renderPage() {
  const qc = new QueryClient()
  return render(<QueryClientProvider client={qc}><PreferencesPage /></QueryClientProvider>)
}

beforeEach(() => {
  h.mutate.mockReset()
  state.isPending = false
  state.isSuccess = false
  state.isError = false
  state.error = null
})

describe('PreferencesPage — Change password card', () => {
  it('renders current/new/confirm password fields', () => {
    renderPage()
    expect(screen.getByLabelText(/Current password/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^New password/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Confirm new password/i)).toBeInTheDocument()
  })

  it('blocks submit and shows a mismatch error when new !== confirm, with zero network calls', () => {
    renderPage()
    fireEvent.change(screen.getByLabelText(/Current password/i), { target: { value: 'OldPass1!' } })
    fireEvent.change(screen.getByLabelText(/^New password/i), { target: { value: 'NewPass1!' } })
    fireEvent.change(screen.getByLabelText(/Confirm new password/i), { target: { value: 'Mismatch1!' } })
    fireEvent.click(screen.getByRole('button', { name: /Change password/i }))

    expect(screen.getByText(/do not match/i)).toBeInTheDocument()
    expect(h.mutate).not.toHaveBeenCalled()
  })

  it('submits matching passwords via useChangePassword', () => {
    renderPage()
    fireEvent.change(screen.getByLabelText(/Current password/i), { target: { value: 'OldPass1!' } })
    fireEvent.change(screen.getByLabelText(/^New password/i), { target: { value: 'NewPass1!' } })
    fireEvent.change(screen.getByLabelText(/Confirm new password/i), { target: { value: 'NewPass1!' } })
    fireEvent.click(screen.getByRole('button', { name: /Change password/i }))

    expect(h.mutate).toHaveBeenCalledWith(
      { currentPassword: 'OldPass1!', newPassword: 'NewPass1!' },
      expect.anything(),
    )
  })

  it('shows the real server message on a 401 (wrong current password)', async () => {
    h.mutate.mockImplementation((_data, opts) => {
      opts.onError({ response: { data: { error: 'Current password is incorrect' } } })
    })
    renderPage()
    fireEvent.change(screen.getByLabelText(/Current password/i), { target: { value: 'Wrong1!' } })
    fireEvent.change(screen.getByLabelText(/^New password/i), { target: { value: 'NewPass1!' } })
    fireEvent.change(screen.getByLabelText(/Confirm new password/i), { target: { value: 'NewPass1!' } })
    fireEvent.click(screen.getByRole('button', { name: /Change password/i }))

    await waitFor(() => expect(screen.getByText(/Current password is incorrect/i)).toBeInTheDocument())
  })

  it('shows the real server message on a 422 (new password too short)', async () => {
    h.mutate.mockImplementation((_data, opts) => {
      opts.onError({ response: { data: { error: 'Password must be at least 8 characters' } } })
    })
    renderPage()
    fireEvent.change(screen.getByLabelText(/Current password/i), { target: { value: 'OldPass1!' } })
    fireEvent.change(screen.getByLabelText(/^New password/i), { target: { value: 'short' } })
    fireEvent.change(screen.getByLabelText(/Confirm new password/i), { target: { value: 'short' } })
    fireEvent.click(screen.getByRole('button', { name: /Change password/i }))

    await waitFor(() => expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument())
  })

  it('shows an inline success message and clears the fields on 204', async () => {
    h.mutate.mockImplementation((_data, opts) => { opts.onSuccess() })
    renderPage()
    fireEvent.change(screen.getByLabelText(/Current password/i), { target: { value: 'OldPass1!' } })
    fireEvent.change(screen.getByLabelText(/^New password/i), { target: { value: 'NewPass1!' } })
    fireEvent.change(screen.getByLabelText(/Confirm new password/i), { target: { value: 'NewPass1!' } })
    fireEvent.click(screen.getByRole('button', { name: /Change password/i }))

    await waitFor(() => expect(screen.getByText(/Password changed/i)).toBeInTheDocument())
    expect((screen.getByLabelText(/Current password/i) as HTMLInputElement).value).toBe('')
  })
})
