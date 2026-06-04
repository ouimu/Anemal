import { z } from 'zod'
import { AppError } from '../utils/errors'
import * as ownerRepo from '../models/owner.repository'

export const createOwnerSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName:  z.string().min(1).max(100),
  phone:     z.string().min(1).max(50),
  email:     z.string().email().optional().nullable(),
  lineId:    z.string().max(100).optional().nullable(),
  address:   z.string().optional().nullable(),
})

export const updateOwnerSchema = createOwnerSchema.partial()

export type CreateOwnerInput = z.infer<typeof createOwnerSchema>
export type UpdateOwnerInput = z.infer<typeof updateOwnerSchema>

export class OwnerError extends AppError {
  constructor(message: string, statusCode: number) {
    super(statusCode, message, 'OWNER_ERROR')
  }
}

export async function listOwners(tenantId: number, page = 1, limit = 20, search?: string) {
  const skip = (page - 1) * limit
  const [owners, total] = await Promise.all([
    ownerRepo.findOwners(tenantId, { skip, take: limit, search }),
    ownerRepo.countOwners(tenantId, search),
  ])
  return { owners, total, page, limit }
}

export async function getOwner(tenantId: number, id: number) {
  const owner = await ownerRepo.findOwnerById(tenantId, id)
  if (!owner) throw new OwnerError('Owner not found', 404)
  return owner
}

export async function createOwner(tenantId: number, data: CreateOwnerInput) {
  const existing = await ownerRepo.findOwnerByPhone(tenantId, data.phone)
  if (existing) throw new OwnerError('Phone number already registered in this clinic', 409)
  return ownerRepo.createOwner(tenantId, data)
}

export async function updateOwner(tenantId: number, id: number, data: UpdateOwnerInput) {
  await getOwner(tenantId, id)

  if (data.phone) {
    const existing = await ownerRepo.findOwnerByPhone(tenantId, data.phone, id)
    if (existing) throw new OwnerError('Phone number already registered in this clinic', 409)
  }

  return ownerRepo.updateOwner(tenantId, id, data)
}
