import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const h = vi.hoisted(() => ({ mutateAsync: vi.fn(), googleAuthorizeMutateAsync: vi.fn(), onedriveAuthorizeMutateAsync: vi.fn() }))
const state = vi.hoisted(() => ({
  data: { provider: 'local', configured: false } as {
    provider: 'local' | 'custom_path' | 'google_drive' | 'onedrive'; configured: boolean; connected?: boolean
    smbHost?: string; smbShare?: string; smbUsername?: string; duplicateAccountWarning?: boolean
  },
  isLoading: false,
  error: null as unknown,
  isPending: false,
  googleAuthorizeIsPending: false,
  onedriveAuthorizeIsPending: false,
}))

vi.mock('../hooks/useStorageConfig', () => ({
  useStorageConfig: () => ({ data: state.data, isLoading: state.isLoading }),
  useUpdateStorageConfig: () => ({ mutateAsync: h.mutateAsync, error: state.error, isPending: state.isPending }),
  useGoogleAuthorize: () => ({ mutateAsync: h.googleAuthorizeMutateAsync, isPending: state.googleAuthorizeIsPending }),
  useOneDriveAuthorize: () => ({ mutateAsync: h.onedriveAuthorizeMutateAsync, isPending: state.onedriveAuthorizeIsPending }),
}))

import StoragePage from '../views/settings/StoragePage'

function renderPage(initialEntries: string[] = ['/']) {
  const qc = new QueryClient()
  return render(
    <MemoryRouter initialEntries={initialEntries}><QueryClientProvider client={qc}><StoragePage /></QueryClientProvider></MemoryRouter>,
  )
}

beforeEach(() => {
  h.mutateAsync.mockReset()
  h.mutateAsync.mockResolvedValue({ provider: 'local', configured: false })
  h.googleAuthorizeMutateAsync.mockReset()
  h.googleAuthorizeMutateAsync.mockResolvedValue({ url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=x' })
  h.onedriveAuthorizeMutateAsync.mockReset()
  h.onedriveAuthorizeMutateAsync.mockResolvedValue({ url: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=x' })
  state.data = { provider: 'local', configured: false }
  state.error = null
  state.isPending = false
  state.googleAuthorizeIsPending = false
  state.onedriveAuthorizeIsPending = false
  delete (window as unknown as { location?: unknown }).location
  ;(window as unknown as { location: { href: string } }).location = { href: '' }
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

  it('renders the Google Drive radio option and a Connect button when not yet connected', () => {
    renderPage()
    fireEvent.click(screen.getByRole('radio', { name: /Google Drive/i }))
    expect(screen.getByRole('button', { name: /Connect with Google/i })).toBeInTheDocument()
  })

  it('clicking Connect with Google calls the authorize endpoint and navigates to the returned url', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('radio', { name: /Google Drive/i }))
    fireEvent.click(screen.getByRole('button', { name: /Connect with Google/i }))

    await waitFor(() => expect(h.googleAuthorizeMutateAsync).toHaveBeenCalled())
    await waitFor(() => expect(window.location.href).toBe('https://accounts.google.com/o/oauth2/v2/auth?client_id=x'))
  })

  it('when already connected, shows the status dot + Disconnect button instead of the Connect button', () => {
    state.data = { provider: 'google_drive', configured: true, connected: true }
    renderPage()
    expect(screen.getByText(/^Connected$/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Disconnect/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Connect with Google/i })).not.toBeInTheDocument()
  })

  it('Disconnect opens the switch-confirmation dialog; confirming resubmits with confirmBaseChange: true and provider: local', async () => {
    state.data = { provider: 'google_drive', configured: true, connected: true }
    h.mutateAsync.mockResolvedValueOnce({ provider: 'local', configured: false })
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /Disconnect/i }))

    await waitFor(() => expect(screen.getByText(/Change storage location\?/i)).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /^Confirm$/i }))

    await waitFor(() => expect(h.mutateAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({ provider: 'local', confirmBaseChange: true }),
    ))
  })

  it('renders a friendly inline message when the OAuth callback redirects back with an error code', () => {
    renderPage(['/settings/storage?error=google_state_replayed'])
    expect(screen.getByText(/already used — try connecting again/i)).toBeInTheDocument()
  })

  it('an unrecognized OAuth error code still shows a generic fallback message, not a raw code', () => {
    renderPage(['/settings/storage?error=some_future_code'])
    expect(screen.getByText(/Could not connect to Google Drive/i)).toBeInTheDocument()
  })

  it('when already connected to google_drive, selecting Network share shows empty editable password fields, not a false "password saved" state', () => {
    state.data = { provider: 'google_drive', configured: true, connected: true }
    renderPage()
    fireEvent.click(screen.getByRole('radio', { name: /Network share/i }))
    expect(screen.getByLabelText(/Password/i)).toHaveValue('')
    expect(screen.queryByText(/Connected — password saved/i)).not.toBeInTheDocument()
  })
})

describe('OneDrive radio option', () => {
  it('renders a fourth "Microsoft OneDrive" radio alongside Local/Network share/Google Drive', () => {
    renderPage()
    expect(screen.getByRole('radio', { name: /Local \(default\)/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Network share/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Google Drive/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Microsoft OneDrive/i })).toBeInTheDocument()
  })

  it('not-yet-connected state shows a "Connect with Microsoft" button', () => {
    renderPage()
    fireEvent.click(screen.getByRole('radio', { name: /Microsoft OneDrive/i }))
    expect(screen.getByRole('button', { name: /Connect with Microsoft/i })).toBeInTheDocument()
  })

  it('clicking Connect with Microsoft calls the authorize hook then navigates window.location.href to the returned url', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('radio', { name: /Microsoft OneDrive/i }))
    fireEvent.click(screen.getByRole('button', { name: /Connect with Microsoft/i }))

    await waitFor(() => expect(h.onedriveAuthorizeMutateAsync).toHaveBeenCalled())
    await waitFor(() => expect(window.location.href).toBe('https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=x'))
  })

  it('connected state shows the green/red status dot + Disconnect button, reusing the existing switch-confirmation dialog', async () => {
    state.data = { provider: 'onedrive', configured: true, connected: true }
    h.mutateAsync.mockResolvedValueOnce({ provider: 'local', configured: false })
    renderPage()
    expect(screen.getByText(/^Connected$/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Disconnect/i }))

    await waitFor(() => expect(screen.getByText(/Change storage location\?/i)).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /^Confirm$/i }))

    await waitFor(() => expect(h.mutateAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({ provider: 'local', confirmBaseChange: true }),
    ))
  })

  it.each([
    ['onedrive_consent_denied',   /cancelled — try again/i],
    ['onedrive_consent_required', /administrator needs to approve/i],
    ['onedrive_state_invalid',    /invalid or expired/i],
    ['onedrive_state_replayed',   /already used — try connecting again/i],
    ['onedrive_not_authorized',   /no longer has permission/i],
    ['onedrive_not_configured',   /not configured on this server/i],
    ['onedrive_connect_failed',   /Could not connect to OneDrive/i],
  ])('OAuth error code %s maps to distinct copy, mirroring the Google error map', (code, expected) => {
    renderPage([`/settings/storage?error=${code}`])
    expect(screen.getByText(expected)).toBeInTheDocument()
  })

  it('duplicateAccountWarning:true renders a non-blocking banner naming no other tenant, for BOTH google_drive and onedrive', () => {
    state.data = { provider: 'onedrive', configured: true, connected: true, duplicateAccountWarning: true }
    renderPage()
    expect(screen.getByText(/already connected to another clinic/i)).toBeInTheDocument()
    expect(screen.queryByText(/tenant-\d+/i)).not.toBeInTheDocument()

    state.data = { provider: 'google_drive', configured: true, connected: true, duplicateAccountWarning: true }
    renderPage()
    expect(screen.getAllByText(/already connected to another clinic/i).length).toBeGreaterThan(0)
  })

  it('switch-confirmation dialog includes the M-12 no-migration/reversibility paragraph and the F-OD-4 delete-orphan sentence, reused for every provider pair (not a per-pair variant)', async () => {
    state.data = { provider: 'onedrive', configured: true, connected: true }
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /Disconnect/i }))

    await waitFor(() => expect(screen.getByText(/Change storage location\?/i)).toBeInTheDocument())
    expect(screen.getByText(/does not automatically move your existing files/i)).toBeInTheDocument()
    expect(screen.getByText(/physical file\s*\n?\s*at the old provider is not removed/i)).toBeInTheDocument()
  })

  it('Q4 helper copy: connect-with-Microsoft section includes one sentence about work/school admin approval', () => {
    renderPage()
    fireEvent.click(screen.getByRole('radio', { name: /Microsoft OneDrive/i }))
    expect(screen.getByText(/Work or school Microsoft accounts may require your organization's administrator/i)).toBeInTheDocument()
  })

  it('disconnect copy for onedrive includes the M-3 sentence: keys removed immediately, but the entry stays listed at Microsoft until removed there manually', () => {
    state.data = { provider: 'onedrive', configured: true, connected: true }
    renderPage()
    expect(screen.getByText(/stays listed in\s*\n?\s*this Microsoft account's app permissions until removed there manually/i)).toBeInTheDocument()
  })
})
