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
 * Orchestrates the presign → PUT → confirm flow for EMR file attachments.
 *
 * Mirrors `usePhotoUpload.ts`'s shape but targets the EMR-specific,
 * `emr.attach`-gated routes (`/api/medical-records/:id/attachments/presign`
 * and `/api/medical-records/:id/attachments`) instead of the generic
 * pet-photo upload route.
 */
export function useEmrAttachmentUpload(): UseEmrAttachmentUploadResult {
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const clearUploadError = () => setUploadError(null)

  const uploadAttachment = async (medicalRecordId: number, file: File, fileType?: string): Promise<Attachment> => {
    setIsUploading(true)
    setUploadError(null)
    try {
      const presignRes = await api.post(`/api/medical-records/${medicalRecordId}/attachments/presign`, {
        fileName:      file.name,
        contentType:   file.type,
        fileSizeBytes: file.size,
      })
      const { uploadUrl, storageKey } = presignRes.data.data as { uploadUrl: string; storageKey: string }

      const putRes = await fetch(uploadUrl, {
        method:  'PUT',
        headers: { 'Content-Type': file.type },
        body:    file,
      })
      if (!putRes.ok) throw new Error(`S3 upload failed: ${putRes.status}`)

      const confirmRes = await api.post(`/api/medical-records/${medicalRecordId}/attachments`, {
        fileName:      file.name,
        storageKey,
        mimeType:      file.type,
        fileSizeBytes: file.size,
        fileType,
      })
      return confirmRes.data.data as Attachment
    } catch (err: unknown) {
      setUploadError(extractErrorMessage(err))
      throw err
    } finally {
      setIsUploading(false)
    }
  }

  const downloadAttachment = async (medicalRecordId: number, attachmentId: number): Promise<void> => {
    try {
      const res = await api.get(`/api/medical-records/${medicalRecordId}/attachments/${attachmentId}/download`)
      const { downloadUrl } = res.data.data as { downloadUrl: string }
      window.open(downloadUrl, '_blank', 'noopener,noreferrer')
    } catch (err: unknown) {
      setUploadError(extractErrorMessage(err))
      throw err
    }
  }

  return { uploadAttachment, downloadAttachment, isUploading, uploadError, clearUploadError }
}
