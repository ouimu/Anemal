import { z } from 'zod'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { randomUUID } from 'crypto'
import { AppError } from '../utils/errors'
import { createS3Client, getStorageConfig, isStorageConfigured } from '../config/storage'

export const presignSchema = z.object({
  filename:    z.string().min(1).max(200),
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
})

export type PresignInput = z.infer<typeof presignSchema>

export interface PresignResult {
  uploadUrl: string
  publicUrl: string
  key:       string
}

// Sanitize filename — keep extension, strip path chars.
export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)
}

export async function generatePresignedUpload(
  tenantId: number,
  input: PresignInput,
): Promise<PresignResult> {
  if (!isStorageConfigured()) {
    throw new AppError(503, 'Storage not configured', 'STORAGE_NOT_CONFIGURED')
  }

  const cfg  = getStorageConfig()
  const safe = sanitizeFilename(input.filename)
  const key  = `tenants/${tenantId}/pets/${randomUUID()}-${safe}`

  const client  = createS3Client()
  const command = new PutObjectCommand({
    Bucket:      cfg.bucket,
    Key:         key,
    ContentType: input.contentType,
  })

  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 300 })
  const publicUrl = `https://${cfg.bucket}.s3.${cfg.region}.amazonaws.com/${key}`

  return { uploadUrl, publicUrl, key }
}
