import { useState } from 'react'
import api from '../utils/api'

interface Attachment {
  id:               number
  fileName:         string
  fileUrl?:         string | null
  fileType?:        string | null
  mimeType?:        string | null
  fileSize?:        number | null
  storageKey?:      string | null
  uploadedByUserId?: number | null
  createdAt?:       string
}

interface UseEmrAttachmentUploadResult {
  uploadAttachment:   (medicalRecordId: number, file: File, fileType?: string) => Promise<Attachment>
  downloadAttachment: (medicalRecordId: number, attachmentId: number) => Promise<void>
  isUploading:        boolean
  uploadError:        string | null
  clearUploadError:   () => void
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  const asAxios = err as { response?: { data?: { error?: string } } }
  return asAxios?.response?.data?.error ?? 'Upload failed'
}

/**
 * Single multipart POST to the local-disk-backed EMR attachment route
 * (emr.attach-gated). Replaces the retired presign → PUT → confirm flow
 * (ADR-0022) — the server now builds the storage key and streams the file
 * straight to disk.
 */
export function useEmrAttachmentUpload(): UseEmrAttachmentUploadResult {
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const clearUploadError = () => setUploadError(null)

  const uploadAttachment = async (medicalRecordId: number, file: File, fileType?: string): Promise<Attachment> => {
    setIsUploading(true)
    setUploadError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      if (fileType) formData.append('fileType', fileType)

      const res = await api.post(`/api/medical-records/${medicalRecordId}/attachments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return res.data.data as Attachment
    } catch (err: unknown) {
      setUploadError(extractErrorMessage(err))
      throw err
    } finally {
      setIsUploading(false)
    }
  }

  const downloadAttachment = async (medicalRecordId: number, attachmentId: number): Promise<void> => {
    try {
      const res = await api.get(`/api/medical-records/${medicalRecordId}/attachments/${attachmentId}/download`, {
        responseType: 'blob',
      })
      const objectUrl = URL.createObjectURL(res.data as Blob)
      window.open(objectUrl, '_blank', 'noopener,noreferrer')
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10000)
    } catch (err: unknown) {
      setUploadError(extractErrorMessage(err))
      throw err
    }
  }

  return { uploadAttachment, downloadAttachment, isUploading, uploadError, clearUploadError }
}
