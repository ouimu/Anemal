import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const postMock = vi.fn()
vi.mock('../utils/api', () => ({ default: { post: (...args: unknown[]) => postMock(...args) } }))

import { usePhotoUpload } from './usePhotoUpload'

const file = new File(['jpeg-bytes'], 'rex.jpg', { type: 'image/jpeg' })

beforeEach(() => { postMock.mockReset() })

describe('usePhotoUpload', () => {
  it('uploads via a single multipart POST to /api/pets/:id/photo', async () => {
    postMock.mockResolvedValueOnce({ data: { data: { id: 1, photoUrl: 'tenants/1/photo/pet-1.jpg' } } })
    const { result } = renderHook(() => usePhotoUpload())

    await act(async () => {
      await result.current.uploadPhoto(1, file)
    })

    expect(postMock).toHaveBeenCalledTimes(1)
    const [url, body, config] = postMock.mock.calls[0]
    expect(url).toBe('/api/pets/1/photo')
    expect(body).toBeInstanceOf(FormData)
    expect(config).toEqual({ headers: { 'Content-Type': 'multipart/form-data' } })
    expect(result.current.isUploading).toBe(false)
    expect(result.current.uploadError).toBeNull()
  })

  it('surfaces the backend error message on rejection', async () => {
    postMock.mockRejectedValueOnce({ response: { data: { error: 'Image exceeds the 5 MB limit' } } })
    const { result } = renderHook(() => usePhotoUpload())

    await act(async () => {
      await expect(result.current.uploadPhoto(1, file)).rejects.toBeTruthy()
    })
    await waitFor(() => expect(result.current.uploadError).toBe('Image exceeds the 5 MB limit'))
  })
})
