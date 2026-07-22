import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

const getMock = vi.fn()
vi.mock('../utils/api', () => ({ default: { get: (...args: unknown[]) => getMock(...args) } }))

import AuthedPetImage from '../components/AuthedPetImage'

beforeEach(() => {
  getMock.mockReset()
  globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-pet-photo')
  globalThis.URL.revokeObjectURL = vi.fn()
})

describe('AuthedPetImage', () => {
  it('renders a placeholder icon while there is no photo (404)', async () => {
    getMock.mockRejectedValueOnce({ response: { status: 404 } })
    render(<AuthedPetImage petId={1} alt="Rex" />)
    await waitFor(() => expect(getMock).toHaveBeenCalledWith('/api/pets/1/photo', { responseType: 'blob' }))
    expect(screen.queryByAltText('Rex')).not.toBeInTheDocument()
  })

  it('renders the fetched photo as an <img> with an object URL', async () => {
    const blob = new Blob(['jpeg-bytes'], { type: 'image/jpeg' })
    getMock.mockResolvedValueOnce({ data: blob })
    render(<AuthedPetImage petId={2} alt="Fido" />)
    const img = await screen.findByAltText('Fido')
    expect(img).toHaveAttribute('src', 'blob:mock-pet-photo')
  })
})
