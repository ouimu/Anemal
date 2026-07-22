// src/backend/services/emr-attachment.constants.ts
// Single source of truth for EMR attachment MIME allow-list, size cap, and
// S3 key-prefix rules (ADR-0021 / design §5). Imported by both the confirm
// schema (medical-record.service.ts) and the presign service
// (emr-attachment.service.ts) — kept dependency-free to avoid a cycle
// between those two files.
import { AppError } from '../utils/errors'

/** Accepted MIME types for EMR attachments (design §5). Excludes SVG/HTML
 *  (active-content XSS), executables, archives, DICOM, video, HEIC/TIFF. */
export const EMR_ATTACHMENT_MIME_ALLOWLIST = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
] as const

export type EmrAttachmentMimeType = typeof EMR_ATTACHMENT_MIME_ALLOWLIST[number]

/** 25 MB per file (brainstorm §3.2). */
export const EMR_ATTACHMENT_MAX_SIZE_BYTES = 25 * 1024 * 1024

/** BR-3: the S3 key prefix an attachment for this tenant/record MUST live under. */
export function buildEmrStorageKeyPrefix(tenantId: number, medicalRecordId: number): string {
  return `tenants/${tenantId}/emr/${medicalRecordId}/`
}

/**
 * BR-3 / EMR-ATTACH-7: reject a storageKey whose prefix doesn't match the
 * caller's tenant + target record. Prevents registering a foreign/arbitrary
 * S3 object as an attachment (IDOR).
 */
export function assertStorageKeyPrefix(tenantId: number, medicalRecordId: number, storageKey: string): void {
  const expectedPrefix = buildEmrStorageKeyPrefix(tenantId, medicalRecordId)
  if (!storageKey.startsWith(expectedPrefix)) {
    throw new AppError(400, 'storageKey does not match this tenant/record', 'INVALID_STORAGE_KEY')
  }
}
