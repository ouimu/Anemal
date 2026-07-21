// src/backend/controllers/emr-attachment.controller.ts
import { Request, Response, NextFunction } from 'express'
import { generateEmrAttachmentPresign, generateAttachmentDownloadUrl } from '../services/emr-attachment.service'

export async function handlePresignAttachment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await generateEmrAttachmentPresign(
      req.context!.tenantId,
      req.context?.branchId,
      parseInt(req.params.id),
      req.body,
    )
    res.status(201).json({ success: true, data })
  } catch (err) { next(err) }
}

export async function handleDownloadAttachment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await generateAttachmentDownloadUrl(
      req.context!.tenantId,
      req.context?.branchId,
      parseInt(req.params.id),
      parseInt(req.params.attId),
    )
    res.json({ success: true, data })
  } catch (err) { next(err) }
}
