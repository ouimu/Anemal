// src/frontend/src/__tests__/AddPetModal.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const postMock = vi.fn().mockResolvedValue({ data: { data: { id: 1 } } })
vi.mock('../utils/api', () => ({
  default: { post: (...args: unknown[]) => postMock(...args) },
}))
vi.mock('../hooks/usePhotoUpload', () => ({
  usePhotoUpload: () => ({ uploadPhoto: vi.fn(), isUploading: false, uploadError: '' }),
}))

import { AddPetModal } from '../views/clinic/ClinicPets'

describe('AddPetModal — weightKg field', () => {
  it('renders a weight input with the correct placeholder', () => {
    render(<AddPetModal ownerId={1} ownerName="Jane Doe" onClose={vi.fn()} onSuccess={vi.fn()} />)
    expect(screen.getByPlaceholderText(/weight in kg/i)).toBeInTheDocument()
  })

  it('submits weightKg as a number in the create-pet payload', async () => {
    postMock.mockClear()
    render(<AddPetModal ownerId={1} ownerName="Jane Doe" onClose={vi.fn()} onSuccess={vi.fn()} />)
    await userEvent.type(screen.getByPlaceholderText(/pet name/i), 'Rex')
    await userEvent.type(screen.getByPlaceholderText(/weight in kg/i), '12.5')
    await userEvent.click(screen.getByText('Save Pet'))
    expect(postMock).toHaveBeenCalledWith('/api/pets', expect.objectContaining({ weightKg: 12.5 }))
  })

  it('submits weightKg as null when left blank', async () => {
    postMock.mockClear()
    render(<AddPetModal ownerId={1} ownerName="Jane Doe" onClose={vi.fn()} onSuccess={vi.fn()} />)
    await userEvent.type(screen.getByPlaceholderText(/pet name/i), 'Rex')
    await userEvent.click(screen.getByText('Save Pet'))
    expect(postMock).toHaveBeenCalledWith('/api/pets', expect.objectContaining({ weightKg: null }))
  })
})
