import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const h = vi.hoisted(() => ({ mutateAsync: vi.fn() }))
const state = vi.hoisted(() => ({
  data: { provider: 'local', configured: false } as {
    provider: 'local' | 'custom_path'; configured: boolean; smbHost?: string; smbShare?: string; smbUsername?: string
  },
  isLoading: false,
  error: null as unknown,
  isPending: false,
}))

vi.mock('../hooks/useStorageConfig', () => ({
  useStorageConfig: () => ({ data: state.data, isLoading: state.isLoading }),
  useUpdateStorageConfig: () => ({ mutateAsync: h.mutateAsync, error: state.error, isPending: state.isPending }),
}))

import StoragePage from '../views/settings/StoragePage'

function renderPage() {
  const qc = new QueryClient()
  return render(
    <MemoryRouter><QueryClientProvider client={qc}><StoragePage /></QueryClientProvider></MemoryRouter>,
  )
}

beforeEach(() => {
  h.mutateAsync.mockReset()
  h.mutateAsync.mockResolvedValue({ provider: 'local', configured: false })
  state.data = { provider: 'local', configured: false }
  state.error = null
  state.isPending = false
})

describe('StoragePage', () => {
  it('renders "Local" selected by default when configured: false', () => {
    renderPage()
    const localRadio = screen.getByRole('radio', { name: /Local \(default\)/i }) as HTMLInputElement
    expect(localRadio.checked).toBe(true)
  })

  it('selecting "Network share" reveals the host/share/username/password fields', () => {
    renderPage()
    fireEvent.click(screen.getByRole('radio', { name: /Network share/i }))
    expect(screen.getByLabelText(/Host \/ IP address/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Share name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Username/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Password/i)).toBeInTheDocument()
  })

  it('save with a pending switch-confirmation error opens the confirmation dialog, and confirming resubmits with confirmBaseChange: true', async () => {
    h.mutateAsync.mockRejectedValueOnce({ response: { data: { code: 'STORAGE_SWITCH_CONFIRMATION_REQUIRED' } } })
    renderPage()
    fireEvent.click(screen.getByRole('radio', { name: /Network share/i }))
    fireEvent.change(screen.getByLabelText(/Host \/ IP address/i), { target: { value: '10.0.0.5' } })
    fireEvent.change(screen.getByLabelText(/Share name/i), { target: { value: 'vetfiles' } })
    fireEvent.change(screen.getByLabelText(/Username/i), { target: { value: 'clinicuser' } })
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }))

    await waitFor(() => expect(screen.getByText(/Change storage location\?/i)).toBeInTheDocument())

    h.mutateAsync.mockResolvedValueOnce({ provider: 'custom_path', configured: true })
    fireEvent.click(screen.getByRole('button', { name: /^Confirm$/i }))

    await waitFor(() => expect(h.mutateAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({ provider: 'custom_path', confirmBaseChange: true }),
    ))
  })

  it('an SMB_HOST_UNREACHABLE error renders under the host field', () => {
    state.error = { response: { data: { code: 'SMB_HOST_UNREACHABLE' } } }
    renderPage()
    fireEvent.click(screen.getByRole('radio', { name: /Network share/i }))
    expect(screen.getByText(/Cannot reach this host/i)).toBeInTheDocument()
  })
})
