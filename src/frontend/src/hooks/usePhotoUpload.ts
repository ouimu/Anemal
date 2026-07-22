import { useState } from 'react'
import api from '../utils/api'

interface UsePhotoUploadResult {
  uploadPhoto: (petId: number, file: File) => Promise<void>
  isUploading: boolean
  uploadError: string | null
  clearUploadError: () => void
}

/**
 * Single multipart POST to the local-disk-backed pet-photo route
 * (crm.edit-gated). Replaces the retired presign → PUT flow (ADR-0022).
 * Requires a pet id — new pets are created first, then the photo is
 * uploaded referencing the new id (AddPetModal's create-then-upload
 * ordering, grill G3).
 */
export function usePhotoUpload(): UsePhotoUploadResult {
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const clearUploadError = () => setUploadError(null)

  const uploadPhoto = async (petId: number, file: File): Promise<void> => {
    setIsUploading(true)
    setUploadError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      await api.post(`/api/pets/${petId}/photo`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
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
