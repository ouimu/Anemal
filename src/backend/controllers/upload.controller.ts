import { Request, Response, NextFunction } from 'express'
import { generatePresignedUpload } from '../services/upload.service'

export async function handlePresign(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await generatePresignedUpload(req.context!.tenantId, req.body)
    res.status(201).json({ success: true, data })
  } catch (err) { next(err) }
}
