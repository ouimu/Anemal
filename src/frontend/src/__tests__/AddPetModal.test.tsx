// src/frontend/src/__tests__/AddPetModal.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { uploadPhotoMock } = vi.hoisted(() => ({ uploadPhotoMock: vi.fn().mockResolvedValue(undefined) }))

const postMock = vi.fn().mockResolvedValue({ data: { data: { id: 1 } } })
vi.mock('../utils/api', () => ({
  default: { post: (...args: unknown[]) => postMock(...args) },
}))
vi.mock('../hooks/usePhotoUpload', () => ({
  usePhotoUpload: () => ({ uploadPhoto: uploadPhotoMock, isUploading: false, uploadError: '' }),
}))

import { AddPetModal } from '../views/clinic/ClinicPets'

beforeEach(() => {
  postMock.mockClear()
  postMock.mockResolvedValue({ data: { data: { id: 1 } } })
  uploadPhotoMock.mockClear()
  uploadPhotoMock.mockResolvedValue(undefined)
})

describe('AddPetModal — weightKg field', () => {
  it('renders a weight input with the correct placeholder', () => {
    render(<AddPetModal ownerId={1} ownerName="Jane Doe" onClose={vi.fn()} onSuccess={vi.fn()} />)
    expect(screen.getByPlaceholderText(/weight in kg/i)).toBeInTheDocument()
  })

  it('submits weightKg as a number in the create-pet payload', async () => {
    render(<AddPetModal ownerId={1} ownerName="Jane Doe" onClose={vi.fn()} onSuccess={vi.fn()} />)
    await userEvent.type(screen.getByPlaceholderText(/pet name/i), 'Rex')
    await userEvent.type(screen.getByPlaceholderText(/weight in kg/i), '12.5')
    await userEvent.click(screen.getByText('Save Pet'))
    expect(postMock).toHaveBeenCalledWith('/api/pets', expect.objectContaining({ weightKg: 12.5 }))
  })

  it('submits weightKg as null when left blank', async () => {
    render(<AddPetModal ownerId={1} ownerName="Jane Doe" onClose={vi.fn()} onSuccess={vi.fn()} />)
    await userEvent.type(screen.getByPlaceholderText(/pet name/i), 'Rex')
    await userEvent.click(screen.getByText('Save Pet'))
    expect(postMock).toHaveBeenCalledWith('/api/pets', expect.objectContaining({ weightKg: null }))
  })

  it('does not send photoUrl in the create-pet payload (server-managed only, ADR-0022)', async () => {
    render(<AddPetModal ownerId={1} ownerName="Jane Doe" onClose={vi.fn()} onSuccess={vi.fn()} />)
    await userEvent.type(screen.getByPlaceholderText(/pet name/i), 'Rex')
    await userEvent.click(screen.getByText('Save Pet'))
    const payload = postMock.mock.calls[0][1] as Record<string, unknown>
    expect(payload).not.toHaveProperty('photoUrl')
  })
})

describe('AddPetModal — create-then-upload photo (grill G2/G3)', () => {
  it('creates the pet first, then uploads the photo referencing the new pet id', async () => {
    render(<AddPetModal ownerId={1} ownerName="Jane Doe" onClose={vi.fn()} onSuccess={vi.fn()} />)
    await userEvent.type(screen.getByPlaceholderText(/pet name/i), 'Rex')
    const file = new File(['jpeg-bytes'], 'rex.jpg', { type: 'image/jpeg' })
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(fileInput, file)
    await userEvent.click(screen.getByText('Save Pet'))

    await waitFor(() => expect(postMock).toHaveBeenCalledWith('/api/pets', expect.objectContaining({ name: 'Rex' })))
    expect(uploadPhotoMock).toHaveBeenCalledWith(1, file)
  })

  it('does not block pet creation when the photo upload fails (G3 — no rollback)', async () => {
    uploadPhotoMock.mockRejectedValueOnce(new Error('Upload failed'))
    const onSuccess = vi.fn()
    render(<AddPetModal ownerId={1} ownerName="Jane Doe" onClose={vi.fn()} onSuccess={onSuccess} />)
    await userEvent.type(screen.getByPlaceholderText(/pet name/i), 'Rex')
    const file = new File(['jpeg-bytes'], 'rex.jpg', { type: 'image/jpeg' })
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(fileInput, file)
    await userEvent.click(screen.getByText('Save Pet'))

    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
  })
})
