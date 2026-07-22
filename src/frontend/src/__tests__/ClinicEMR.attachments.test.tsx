import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

const getMock  = vi.fn()
const postMock = vi.fn()

vi.mock('../utils/api', () => ({
  default: {
    get:  (...args: unknown[]) => getMock(...(args as [string, unknown])),
    post: (...args: unknown[]) => postMock(...args),
  },
}))
// Can-gated controls call useAuthStore with a selector (s => s.hasPermission);
// ClinicEMR itself calls useAuthStore() with no selector to destructure userId.
// The mock below supports both call shapes so the Attachments panel's Can
// gates (upload / delete buttons) render during this test.
vi.mock('../store/authStore', () => ({
  useAuthStore: (selector?: (s: { userId: number; hasPermission: (perm: string) => boolean }) => unknown) => {
    const state = { userId: 1, hasPermission: () => true }
    return selector ? selector(state) : state
  },
}))

import ClinicEMR from '../views/clinic/ClinicEMR'

const pet = { id: 42, name: 'Rex', species: 'canine', owner: { firstName: 'Jane', lastName: 'Doe', phone: '0812345678' } }
const recordWithAttachment = {
  id: 7, petId: 42, createdAt: '2026-07-21T00:00:00.000Z',
  attachments: [
    { id: 55, fileName: 'lab.pdf', mimeType: 'application/pdf', fileSize: 20480, fileType: 'lab', createdAt: '2026-07-21T00:00:00.000Z', uploadedByUser: { id: 1, name: 'Dr. Rex' } },
  ],
}

beforeEach(() => {
  getMock.mockReset()
  postMock.mockReset()
  getMock.mockImplementation((url: string, config?: { params?: Record<string, unknown> }) => {
    if (url === '/api/search') {
      const q = config?.params?.q as string | undefined
      if (q && q.length >= 2) return Promise.resolve({ data: { data: [{ petId: 42, petName: 'Rex', species: 'canine', ownerName: 'Jane Doe', phone: '0812345678' }] } })
      return Promise.resolve({ data: { data: [] } })
    }
    if (url === '/api/pets/42') return Promise.resolve({ data: { data: pet } })
    if (url === '/api/medical-records') return Promise.resolve({ data: { data: { records: [{ id: 7, createdAt: recordWithAttachment.createdAt }] } } })
    if (url === '/api/medical-records/7') return Promise.resolve({ data: { data: recordWithAttachment } })
    return Promise.resolve({ data: { data: null } })
  })
})

function renderEMR() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ClinicEMR />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

async function selectRexAndOpenRecord() {
  await userEvent.type(screen.getByPlaceholderText(/pet or owner/i), 'Rex')
  await userEvent.click(await screen.findByText('Rex'))
  // recordWithAttachment has no `assessment`, so the recent-visits row renders "Visit".
  await userEvent.click(await screen.findByText('Visit'))
}

describe('ClinicEMR — Attachments panel', () => {
  it('renders existing attachment metadata: name, size, uploader, category badge', async () => {
    renderEMR()
    await selectRexAndOpenRecord()

    expect(await screen.findByText('lab.pdf')).toBeInTheDocument()
    expect(screen.getByText(/20(\.0)? ?KB|20480/i)).toBeInTheDocument()
    expect(screen.getByText('Dr. Rex')).toBeInTheDocument()
    expect(screen.getByText('lab')).toBeInTheDocument()
  })

  it('rejects an oversized file client-side without calling the upload hook', async () => {
    renderEMR()
    await selectRexAndOpenRecord()
    await screen.findByText('lab.pdf')

    const bigFile = new File([new Uint8Array(26 * 1024 * 1024)], 'huge.pdf', { type: 'application/pdf' })
    const input = screen.getByTestId('emr-attachment-file-input') as HTMLInputElement
    await userEvent.upload(input, bigFile)

    expect(await screen.findByText(/25 ?MB|too large/i)).toBeInTheDocument()
    expect(postMock).not.toHaveBeenCalledWith(expect.stringContaining('/presign'), expect.anything())
  })

  it('rejects an unsupported file type client-side', async () => {
    renderEMR()
    await selectRexAndOpenRecord()
    await screen.findByText('lab.pdf')

    const badFile = new File(['<svg></svg>'], 'evil.svg', { type: 'image/svg+xml' })
    const input = screen.getByTestId('emr-attachment-file-input') as HTMLInputElement
    await userEvent.upload(input, badFile)

    expect(await screen.findByText(/not supported|unsupported/i)).toBeInTheDocument()
  })
})
