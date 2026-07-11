import { Request, Response, NextFunction } from 'express'
import { listPets, getPet, createPet, updatePet } from '../services/pet.service'
import { resolvePermissions } from '../services/permission.service'

export async function handleListPets(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page    = parseInt(String(req.query.page    ?? '1'))
    const limit   = parseInt(String(req.query.limit   ?? '20'))
    const ownerId = req.query.ownerId ? parseInt(String(req.query.ownerId)) : undefined
    const species = req.query.species as string | undefined
    const data    = await listPets(req.context!.tenantId, page, limit, ownerId, species)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export async function handleGetPet(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await resolvePermissions(req.context!.userId, req.context!.tenantId)
    const data = await getPet(req.context!.tenantId, parseInt(req.params.id), perms.has('emr.view'))
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export async function handleCreatePet(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await createPet(req.context!.tenantId, req.body)
    res.status(201).json({ success: true, data })
  } catch (err) { next(err) }
}

export async function handleUpdatePet(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await updatePet(req.context!.tenantId, parseInt(req.params.id), req.body)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}
