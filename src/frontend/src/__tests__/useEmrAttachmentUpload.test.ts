import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const postMock = vi.fn()
const getMock  = vi.fn()
vi.mock('../utils/api', () => ({
  default: { post: (...args: unknown[]) => postMock(...args), get: (...args: unknown[]) => getMock(...args) },
}))

import { useEmrAttachmentUpload } from '../hooks/useEmrAttachmentUpload'

const file = new File(['%PDF-1.4 fake'], 'lab.pdf', { type: 'application/pdf' })

beforeEach(() => {
  postMock.mockReset()
  getMock.mockReset()
  globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url')
  globalThis.URL.revokeObjectURL = vi.fn()
  globalThis.open = vi.fn()
})

describe('useEmrAttachmentUpload', () => {
  it('uploads via a single multipart POST and returns the created attachment', async () => {
    postMock.mockResolvedValueOnce({ data: { data: { id: 55, fileName: 'lab.pdf', mimeType: 'application/pdf', fileSize: file.size } } })

    const { result } = renderHook(() => useEmrAttachmentUpload())

    let attachment
    await act(async () => {
      attachment = await result.current.uploadAttachment(9, file, 'lab')
    })

    expect(postMock).toHaveBeenCalledTimes(1)
    const [url, body, config] = postMock.mock.calls[0]
    expect(url).toBe('/api/medical-records/9/attachments')
    expect(body).toBeInstanceOf(FormData)
    expect(config).toEqual({ headers: { 'Content-Type': 'multipart/form-data' } })
    expect((attachment as unknown as { id: number }).id).toBe(55)
    expect(result.current.isUploading).toBe(false)
    expect(result.current.uploadError).toBeNull()
  })

  it('surfaces the backend error message when upload is rejected', async () => {
    postMock.mockRejectedValueOnce({ response: { data: { error: 'File type not allowed' } } })

    const { result } = renderHook(() => useEmrAttachmentUpload())

    await act(async () => {
      await expect(result.current.uploadAttachment(9, file)).rejects.toBeTruthy()
    })
    await waitFor(() => expect(result.current.uploadError).toBe('File type not allowed'))
  })

  it('downloads via a blob GET and opens an object URL', async () => {
    const blob = new Blob(['pdf-bytes'], { type: 'application/pdf' })
    getMock.mockResolvedValueOnce({ data: blob })

    const { result } = renderHook(() => useEmrAttachmentUpload())
    await act(async () => {
      await result.current.downloadAttachment(9, 55)
    })

    expect(getMock).toHaveBeenCalledWith('/api/medical-records/9/attachments/55/download', { responseType: 'blob' })
    expect(globalThis.URL.createObjectURL).toHaveBeenCalledWith(blob)
    expect(globalThis.open).toHaveBeenCalledWith('blob:mock-url', '_blank', 'noopener,noreferrer')
  })
})
