import { Request, Response } from 'express'
import { createOwnerSchema, updateOwnerSchema, listOwners, getOwner, createOwner, updateOwner, OwnerError } from '../services/ownerService'

function handleError(res: Response, err: unknown) {
  if (err instanceof OwnerError) return res.status(err.statusCode).json({ success: false, error: err.message })
  res.status(500).json({ success: false, error: 'Internal server error' })
}

export async function handleListOwners(req: Request, res: Response) {
  try {
    const page   = parseInt(String(req.query.page  ?? '1'))
    const limit  = parseInt(String(req.query.limit ?? '20'))
    const search = req.query.q as string | undefined
    const data   = await listOwners(req.context!.tenantId, page, limit, search)
    res.json({ success: true, data })
  } catch (err) { handleError(res, err) }
}

export async function handleGetOwner(req: Request, res: Response) {
  try {
    const data = await getOwner(req.context!.tenantId, parseInt(req.params.id))
    res.json({ success: true, data })
  } catch (err) { handleError(res, err) }
}

export async function handleCreateOwner(req: Request, res: Response) {
  const parsed = createOwnerSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, error: 'Validation failed', details: parsed.error.flatten() })
  try {
    const data = await createOwner(req.context!.tenantId, parsed.data)
    res.status(201).json({ success: true, data })
  } catch (err) { handleError(res, err) }
}

export async function handleUpdateOwner(req: Request, res: Response) {
  const parsed = updateOwnerSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, error: 'Validation failed', details: parsed.error.flatten() })
  try {
    const data = await updateOwner(req.context!.tenantId, parseInt(req.params.id), parsed.data)
    res.json({ success: true, data })
  } catch (err) { handleError(res, err) }
}
