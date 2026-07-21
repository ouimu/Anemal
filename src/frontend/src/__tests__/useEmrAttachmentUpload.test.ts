import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const postMock = vi.fn()
vi.mock('../utils/api', () => ({ default: { post: (...args: unknown[]) => postMock(...args) } }))

import { useEmrAttachmentUpload } from '../hooks/useEmrAttachmentUpload'

const file = new File(['%PDF-1.4 fake'], 'lab.pdf', { type: 'application/pdf' })

beforeEach(() => {
  postMock.mockReset()
  global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 }) as unknown as typeof fetch
  global.open  = vi.fn()
})

describe('useEmrAttachmentUpload', () => {
  it('presigns, PUTs to S3, then confirms and returns the created attachment', async () => {
    postMock
      .mockResolvedValueOnce({ data: { data: { uploadUrl: 'https://s3.example.com/put?sig=x', storageKey: 'tenants/1/emr/9/uuid-lab.pdf' } } })
      .mockResolvedValueOnce({ data: { data: { id: 55, fileName: 'lab.pdf', mimeType: 'application/pdf', fileSize: file.size } } })

    const { result } = renderHook(() => useEmrAttachmentUpload())

    let attachment
    await act(async () => {
      attachment = await result.current.uploadAttachment(9, file, 'lab')
    })

    expect(postMock).toHaveBeenNthCalledWith(1, '/api/medical-records/9/attachments/presign', {
      fileName: 'lab.pdf', contentType: 'application/pdf', fileSizeBytes: file.size,
    })
    expect(global.fetch).toHaveBeenCalledWith('https://s3.example.com/put?sig=x', expect.objectContaining({ method: 'PUT' }))
    expect(postMock).toHaveBeenNthCalledWith(2, '/api/medical-records/9/attachments', {
      fileName: 'lab.pdf', storageKey: 'tenants/1/emr/9/uuid-lab.pdf', mimeType: 'application/pdf', fileSizeBytes: file.size, fileType: 'lab',
    })
    expect((attachment as unknown as { id: number }).id).toBe(55)
    expect(result.current.isUploading).toBe(false)
    expect(result.current.uploadError).toBeNull()
  })

  it('sets uploadError and rethrows when the S3 PUT fails', async () => {
    postMock.mockResolvedValueOnce({ data: { data: { uploadUrl: 'https://s3.example.com/put?sig=x', storageKey: 'tenants/1/emr/9/uuid-lab.pdf' } } })
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch

    const { result } = renderHook(() => useEmrAttachmentUpload())

    await act(async () => {
      await expect(result.current.uploadAttachment(9, file)).rejects.toThrow()
    })
    await waitFor(() => expect(result.current.uploadError).toContain('500'))
  })

  it('surfaces the backend error message when presign is rejected (e.g. 403)', async () => {
    postMock.mockRejectedValueOnce({ response: { data: { error: "Access denied: missing permission 'emr.attach'" } } })

    const { result } = renderHook(() => useEmrAttachmentUpload())

    await act(async () => {
      await expect(result.current.uploadAttachment(9, file)).rejects.toBeTruthy()
    })
    await waitFor(() => expect(result.current.uploadError).toBe("Access denied: missing permission 'emr.attach'"))
  })
})
