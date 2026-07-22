import { Request, Response, NextFunction } from 'express'
import { listPets, getPet, createPet, updatePet, uploadPetPhoto, getPetPhotoFile } from '../services/pet.service'
import { resolvePermissions } from '../services/permission.service'
import { ValidationError } from '../utils/errors'

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

export async function handleUploadPetPhoto(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.file) throw new ValidationError({ file: ['file is required'] })
    const data = await uploadPetPhoto(req.context!.tenantId, parseInt(req.params.id), {
      buffer: req.file.buffer, mimetype: req.file.mimetype, size: req.file.size,
    })
    res.status(201).json({ success: true, data })
  } catch (err) { next(err) }
}

export async function handleGetPetPhoto(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await getPetPhotoFile(req.context!.tenantId, parseInt(req.params.id))
    res.setHeader('Content-Type', data.contentType)
    // no-store, not private+max-age: the URL (/api/pets/:id/photo) is not
    // tenant-qualified in the path and the storage key is stable (overwrite
    // in place), so a timed private cache both risks cross-tenant reuse on a
    // shared/tablet browser after re-login and serves a stale photo for up to
    // the max-age after an in-place re-upload. The frontend refetches per
    // mount and revokes the object URL on unmount, so HTTP caching adds no
    // real benefit here.
    res.setHeader('Cache-Control', 'no-store')
    res.send(data.buffer)
  } catch (err) { next(err) }
}
