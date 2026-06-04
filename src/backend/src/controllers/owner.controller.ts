import { Request, Response, NextFunction } from 'express'
import { listOwners, getOwner, createOwner, updateOwner } from '../services/owner.service'

export async function handleListOwners(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page   = parseInt(String(req.query.page  ?? '1'))
    const limit  = parseInt(String(req.query.limit ?? '20'))
    const search = req.query.q as string | undefined
    const data   = await listOwners(req.context!.tenantId, page, limit, search)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export async function handleGetOwner(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await getOwner(req.context!.tenantId, parseInt(req.params.id))
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export async function handleCreateOwner(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await createOwner(req.context!.tenantId, req.body)
    res.status(201).json({ success: true, data })
  } catch (err) { next(err) }
}

export async function handleUpdateOwner(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await updateOwner(req.context!.tenantId, parseInt(req.params.id), req.body)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}
