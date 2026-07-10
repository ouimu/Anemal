// src/frontend/src/__tests__/EditPetModal.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const putMock = vi.fn().mockResolvedValue({ data: { data: { id: 1 } } })
const invalidateQueriesMock = vi.fn()
const uploadPhotoMock = vi.fn().mockResolvedValue('https://cdn.example.com/new-photo.jpg')

vi.mock('../utils/api', () => ({
  default: { put: (...args: unknown[]) => putMock(...args) },
}))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: invalidateQueriesMock }),
}))
vi.mock('../hooks/usePhotoUpload', () => ({
  usePhotoUpload: () => ({ uploadPhoto: uploadPhotoMock, isUploading: false, uploadError: '' }),
}))

import { EditPetModal } from '../views/clinic/ClinicPets'

const mockPet = {
  id: 1, ownerId: 1, name: 'Rex', species: 'canine', breed: 'Labrador', color: 'Golden',
  // Full ISO datetime, exactly as the API serializes Prisma DateTime @db.Date —
  // regression guard: the modal must slice it to yyyy-MM-dd for <input type="date">.
  birthDate: '2020-01-15T00:00:00.000Z', gender: 'male', weightKg: 12.5, microchipId: 'CHIP123',
  photoUrl: 'https://cdn.example.com/rex.jpg',
  allergies: 'Pollen', underlyingConditions: 'None', isActive: true,
}

describe('EditPetModal — pre-population', () => {
  it('pre-populates all fields from the pet prop', () => {
    render(<EditPetModal pet={mockPet} onClose={vi.fn()} onSuccess={vi.fn()} />)
    expect(screen.getByDisplayValue('Rex')).toBeInTheDocument()
    expect(screen.getByDisplayValue('12.5')).toBeInTheDocument()
    expect(screen.getByDisplayValue('CHIP123')).toBeInTheDocument()
    // ISO datetime must be sliced to yyyy-MM-dd or the date input renders blank
    expect(screen.getByDisplayValue('2020-01-15')).toBeInTheDocument()
  })
})

describe('EditPetModal — submit handler', () => {
  beforeEach(() => {
    putMock.mockClear()
    invalidateQueriesMock.mockClear()
    uploadPhotoMock.mockClear()
  })

  it('submits PUT /api/pets/:id with typed field values', async () => {
    render(<EditPetModal pet={mockPet} onClose={vi.fn()} onSuccess={vi.fn()} />)
    const weightInput = screen.getByDisplayValue('12.5')
    await userEvent.clear(weightInput)
    await userEvent.type(weightInput, '15')
    await userEvent.click(screen.getByText('Save Changes'))
    expect(putMock).toHaveBeenCalledWith('/api/pets/1', expect.objectContaining({ weightKg: 15 }))
  })

  it('sends null for a cleared optional field', async () => {
    render(<EditPetModal pet={mockPet} onClose={vi.fn()} onSuccess={vi.fn()} />)
    const microchipInput = screen.getByDisplayValue('CHIP123')
    await userEvent.clear(microchipInput)
    await userEvent.click(screen.getByText('Save Changes'))
    expect(putMock).toHaveBeenCalledWith('/api/pets/1', expect.objectContaining({ microchipId: null }))
  })

  it('save refreshes detail view', async () => {
    const onSuccess = vi.fn()
    render(<EditPetModal pet={mockPet} onClose={vi.fn()} onSuccess={onSuccess} />)
    await userEvent.click(screen.getByText('Save Changes'))
    expect(onSuccess).toHaveBeenCalled()
  })

  it('invalidates the pet query on save (query invalidation, A5)', async () => {
    render(<EditPetModal pet={mockPet} onClose={vi.fn()} onSuccess={vi.fn()} />)
    await userEvent.click(screen.getByText('Save Changes'))
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ['pet', 1] })
  })

  it('photo-change path — uses the uploaded photo URL, not the existing one', async () => {
    render(<EditPetModal pet={mockPet} onClose={vi.fn()} onSuccess={vi.fn()} />)
    const file = new File(['data'], 'new-photo.jpg', { type: 'image/jpeg' })
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(fileInput, file)
    await userEvent.click(screen.getByText('Save Changes'))
    expect(uploadPhotoMock).toHaveBeenCalledWith(file)
    expect(putMock).toHaveBeenCalledWith('/api/pets/1', expect.objectContaining({ photoUrl: 'https://cdn.example.com/new-photo.jpg' }))
  })
})
