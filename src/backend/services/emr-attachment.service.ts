// src/backend/services/emr-attachment.service.ts
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { AppError } from '../utils/errors'
import { createS3Client, getStorageConfig, isStorageConfigured } from '../config/storage'
import { sanitizeFilename } from './upload.service'
import { getMedicalRecord } from './medical-record.service'
import { EMR_ATTACHMENT_MIME_ALLOWLIST, EMR_ATTACHMENT_MAX_SIZE_BYTES } from './emr-attachment.constants'

export const emrPresignSchema = z.object({
  fileName:      z.string().min(1).max(200),
  contentType:   z.enum(EMR_ATTACHMENT_MIME_ALLOWLIST),
  fileSizeBytes: z.number().int().positive().max(EMR_ATTACHMENT_MAX_SIZE_BYTES),
})

export type EmrPresignInput = z.infer<typeof emrPresignSchema>

export interface EmrPresignResult {
  uploadUrl:  string
  storageKey: string
}

/**
 * Generate a presigned S3 PUT URL for an EMR attachment upload.
 *
 * Verifies the target medical record is within the caller's tenant/branch
 * scope (BR-2 — 404 if not, existence-leak precedent) before signing. The
 * signed `ContentLength` binds the client's PUT to the declared size
 * (ADR-0021 F1) — S3 rejects a PUT that doesn't send exactly that many bytes.
 */
export async function generateEmrAttachmentPresign(
  tenantId: number,
  branchId: number | null | undefined,
  medicalRecordId: number,
  input: EmrPresignInput,
): Promise<EmrPresignResult> {
  await getMedicalRecord(tenantId, branchId, medicalRecordId)

  if (!isStorageConfigured()) {
    throw new AppError(503, 'Storage not configured', 'STORAGE_NOT_CONFIGURED')
  }

  const cfg  = getStorageConfig()
  const safe = sanitizeFilename(input.fileName)
  const storageKey = `tenants/${tenantId}/emr/${medicalRecordId}/${randomUUID()}-${safe}`

  const client  = createS3Client()
  const command = new PutObjectCommand({
    Bucket:        cfg.bucket,
    Key:           storageKey,
    ContentType:   input.contentType,
    ContentLength: input.fileSizeBytes,
  })

  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 300 })
  return { uploadUrl, storageKey }
}
