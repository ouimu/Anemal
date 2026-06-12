import { useState } from 'react'
import api from '../utils/api'

interface UsePhotoUploadResult {
  uploadPhoto: (file: File) => Promise<string>
  isUploading: boolean
  uploadError: string | null
  clearUploadError: () => void
}

export function usePhotoUpload(): UsePhotoUploadResult {
  const [isUploading, setIsUploading]   = useState(false)
  const [uploadError, setUploadError]   = useState<string | null>(null)

  const clearUploadError = () => setUploadError(null)

  const uploadPhoto = async (file: File): Promise<string> => {
    setIsUploading(true)
    setUploadError(null)
    try {
      // Step 1: Get presigned URL from backend
      const presignRes = await api.post('/api/upload/presign', {
        filename:    file.name,
        contentType: file.type,
      })
      const { uploadUrl, publicUrl } = presignRes.data.data as { uploadUrl: string; publicUrl: string }

      // Step 2: PUT file directly to S3 — no app auth header (presigned URL includes its own signature)
      const putRes = await fetch(uploadUrl, {
        method:  'PUT',
        headers: { 'Content-Type': file.type },
        body:    file,
      })
      if (!putRes.ok) throw new Error(`S3 upload failed: ${putRes.status}`)

      return publicUrl
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message :
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Upload failed'
      setUploadError(msg)
      throw err
    } finally {
      setIsUploading(false)
    }
  }

  return { uploadPhoto, isUploading, uploadError, clearUploadError }
}
