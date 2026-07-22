// src/backend/controllers/emr-attachment.controller.ts
import { Request, Response, NextFunction } from 'express'
import { ValidationError } from '../utils/errors'
import { uploadEmrAttachment, getAttachmentFileForDownload, deleteAttachment } from '../services/emr-attachment.service'
import { registerAttachmentUrl, registerAttachmentUrlSchema } from '../services/medical-record.service'

/**
 * Dual-mode POST /:id/attachments: a multipart request (req.file present,
 * set by the multer middleware in the route) is a real file upload; a JSON
 * request is a legacy URL-reference registration (ADR-0021 backward-compat).
 */
export async function handleAttachmentSubmit(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const medicalRecordId = parseInt(req.params.id)

    if (req.file) {
      const fileType = typeof req.body?.fileType === 'string' ? req.body.fileType : undefined
      const data = await uploadEmrAttachment(
        req.context!.tenantId,
        req.context?.branchId,
        medicalRecordId,
        { buffer: req.file.buffer, mimetype: req.file.mimetype, originalname: req.file.originalname, size: req.file.size },
        fileType,
        req.context!.userId,
      )
      res.status(201).json({ success: true, data })
      return
    }

    const parsed = registerAttachmentUrlSchema.safeParse(req.body)
    if (!parsed.success) {
      next(new ValidationError(parsed.error.flatten()))
      return
    }
    const data = await registerAttachmentUrl(req.context!.tenantId, req.context?.branchId, medicalRecordId, parsed.data)
    res.status(201).json({ success: true, data })
  } catch (err) { next(err) }
}

export async function handleDownloadAttachment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const file = await getAttachmentFileForDownload(
      req.context!.tenantId,
      req.context?.branchId,
      parseInt(req.params.id),
      parseInt(req.params.attId),
    )
    res.setHeader('Content-Type', file.mimeType)
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.fileName)}"`)
    res.send(file.buffer)
  } catch (err) { next(err) }
}

export async function handleDeleteAttachment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await deleteAttachment(
      req.context!.tenantId,
      req.context?.branchId,
      parseInt(req.params.id),
      parseInt(req.params.attId),
    )
    res.status(204).send()
  } catch (err) { next(err) }
}
