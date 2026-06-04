import { Request, Response } from 'express'
import { createPetSchema, updatePetSchema, listPets, getPet, createPet, updatePet, PetError } from '../services/petService'

function handleError(res: Response, err: unknown) {
  if (err instanceof PetError) return res.status(err.statusCode).json({ success: false, error: err.message })
  res.status(500).json({ success: false, error: 'Internal server error' })
}

export async function handleListPets(req: Request, res: Response) {
  try {
    const page    = parseInt(String(req.query.page    ?? '1'))
    const limit   = parseInt(String(req.query.limit   ?? '20'))
    const ownerId = req.query.ownerId ? parseInt(String(req.query.ownerId)) : undefined
    const species = req.query.species as string | undefined
    const data    = await listPets(req.context!.tenantId, page, limit, ownerId, species)
    res.json({ success: true, data })
  } catch (err) { handleError(res, err) }
}

export async function handleGetPet(req: Request, res: Response) {
  try {
    const data = await getPet(req.context!.tenantId, parseInt(req.params.id))
    res.json({ success: true, data })
  } catch (err) { handleError(res, err) }
}

export async function handleCreatePet(req: Request, res: Response) {
  const parsed = createPetSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, error: 'Validation failed', details: parsed.error.flatten() })
  try {
    const data = await createPet(req.context!.tenantId, parsed.data)
    res.status(201).json({ success: true, data })
  } catch (err) { handleError(res, err) }
}

export async function handleUpdatePet(req: Request, res: Response) {
  const parsed = updatePetSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, error: 'Validation failed', details: parsed.error.flatten() })
  try {
    const data = await updatePet(req.context!.tenantId, parseInt(req.params.id), parsed.data)
    res.json({ success: true, data })
  } catch (err) { handleError(res, err) }
}
