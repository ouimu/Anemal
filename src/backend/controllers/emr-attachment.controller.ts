// src/backend/controllers/emr-attachment.controller.ts
import { Request, Response, NextFunction } from 'express'
import { generateEmrAttachmentPresign } from '../services/emr-attachment.service'

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
