// src/backend/services/emr-attachment.service.ts
import { randomUUID } from 'crypto'
import { AppError } from '../utils/errors'
import { getStorageDriver } from '../config/storage-driver'
import { sanitizeFilename } from '../utils/filename'
import { getMedicalRecord, MedicalRecordError } from './medical-record.service'
import * as recordRepo from '../models/medical-record.repository'
import { EMR_ATTACHMENT_MIME_ALLOWLIST, EMR_ATTACHMENT_MAX_SIZE_BYTES, assertStorageKeyPrefix } from './emr-attachment.constants'

export interface EmrUploadFile {
  buffer:       Buffer
  mimetype:     string
  originalname: string
  size:         number
}

/**
 * Store an EMR attachment via the active StorageDriver and create its row.
 * The server builds the storageKey (client never supplies one) — this
 * eliminates the IDOR vector the old presign-confirm flow needed
 * assertStorageKeyPrefix to defend on upload (BA sign-off §2.2).
 */
export async function uploadEmrAttachment(
  tenantId: number,
  branchId: number | null | undefined,
  medicalRecordId: number,
  file: EmrUploadFile,
  fileType: string | undefined,
  uploadedByUserId: number,
) {
  await getMedicalRecord(tenantId, branchId, medicalRecordId)

  if (!(EMR_ATTACHMENT_MIME_ALLOWLIST as readonly string[]).includes(file.mimetype)) {
    throw new AppError(400, 'File type not allowed', 'VALIDATION_ERROR')
  }
  if (file.size > EMR_ATTACHMENT_MAX_SIZE_BYTES) {
    throw new AppError(400, 'File exceeds the 25 MB limit', 'VALIDATION_ERROR')
  }

  const safeName   = sanitizeFilename(file.originalname)
  const storageKey = `tenants/${tenantId}/emr/${medicalRecordId}/${randomUUID()}-${safeName}`
  const driver     = getStorageDriver()

  await driver.save(storageKey, file.buffer, file.mimetype)

  try {
    return await recordRepo.createAttachment(
      tenantId,
      medicalRecordId,
      { fileName: file.originalname, storageKey, mimeType: file.mimetype, fileSizeBytes: file.size, fileType: fileType ?? null },
      uploadedByUserId,
    )
  } catch (err) {
    await driver.delete(storageKey)
    throw err
  }
}

export interface AttachmentFile {
  buffer:   Buffer
  mimeType: string
  fileName: string
}

/**
 * Read an EMR attachment's bytes for authenticated streaming download.
 * `Content-Disposition: attachment` (set by the controller) forces a
 * download rather than inline rendering — closes the SVG/HTML XSS vector
 * at the browser (carried over from ADR-0021 F2). assertStorageKeyPrefix
 * is defense-in-depth here (the value comes from a tenant/record-scoped DB
 * row, not the client — BA sign-off §2.2).
 */
export async function getAttachmentFileForDownload(
  tenantId: number,
  branchId: number | null | undefined,
  medicalRecordId: number,
  attachmentId: number,
): Promise<AttachmentFile> {
  await getMedicalRecord(tenantId, branchId, medicalRecordId)
  const attachment = await recordRepo.findAttachmentById(tenantId, medicalRecordId, attachmentId)
  if (!attachment) throw new MedicalRecordError('Attachment not found', 404)
  if (!attachment.storageKey) throw new MedicalRecordError('This attachment is a URL reference, not a stored file', 400)

  assertStorageKeyPrefix(tenantId, medicalRecordId, attachment.storageKey)

  const driver = getStorageDriver()
  if (!(await driver.exists(attachment.storageKey))) {
    throw new MedicalRecordError('Attachment file is missing', 404)
  }
  const buffer = await driver.read(attachment.storageKey)
  return { buffer, mimeType: attachment.mimeType ?? 'application/octet-stream', fileName: attachment.fileName }
}

/**
 * Delete an EMR attachment. Mirrors updateMedicalRecord's billed-record
 * guard (BR-6) — once the parent medical record has a paid invoice, its
 * attachments are frozen. driver.delete is idempotent (tolerates an
 * already-missing file), so prior data drift never blocks row deletion.
 */
export async function deleteAttachment(
  tenantId: number,
  branchId: number | null | undefined,
  medicalRecordId: number,
  attachmentId: number,
): Promise<void> {
  const record = await getMedicalRecord(tenantId, branchId, medicalRecordId)

  const hasPaidInvoice = record.invoices?.some((inv: { paymentStatus: string }) => inv.paymentStatus === 'paid')
  if (hasPaidInvoice) throw new MedicalRecordError('Cannot delete an attachment on a billed medical record', 403)

  const attachment = await recordRepo.findAttachmentById(tenantId, medicalRecordId, attachmentId)
  if (!attachment) throw new MedicalRecordError('Attachment not found', 404)

  await recordRepo.deleteAttachmentById(tenantId, medicalRecordId, attachmentId)

  if (attachment.storageKey) {
    await getStorageDriver().delete(attachment.storageKey)
  }
}
