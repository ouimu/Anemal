import prisma from '../config/db'
import { AppError } from '../utils/errors'
import { z } from 'zod'

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
  const where = {
    tenantId,
    ...(search ? {
      OR: [
        { firstName: { contains: search, mode: 'insensitive' as const } },
        { lastName:  { contains: search, mode: 'insensitive' as const } },
        { phone:     { contains: search } },
      ],
    } : {}),
  }

  const [owners, total] = await Promise.all([
    prisma.owner.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' }, include: { pets: { where: { isActive: true }, select: { id: true, name: true, species: true } } } }),
    prisma.owner.count({ where }),
  ])

  return { owners, total, page, limit }
}

export async function getOwner(tenantId: number, id: number) {
  const owner = await prisma.owner.findFirst({
    where: { id, tenantId },
    include: { pets: { where: { isActive: true } } },
  })
  if (!owner) throw new OwnerError('Owner not found', 404)
  return owner
}

export async function createOwner(tenantId: number, data: CreateOwnerInput) {
  const existing = await prisma.owner.findFirst({ where: { tenantId, phone: data.phone } })
  if (existing) throw new OwnerError('Phone number already registered in this clinic', 409)

  return prisma.owner.create({ data: { ...data, tenantId } })
}

export async function updateOwner(tenantId: number, id: number, data: UpdateOwnerInput) {
  await getOwner(tenantId, id)

  if (data.phone) {
    const existing = await prisma.owner.findFirst({ where: { tenantId, phone: data.phone, NOT: { id } } })
    if (existing) throw new OwnerError('Phone number already registered in this clinic', 409)
  }

  return prisma.owner.update({ where: { id, tenantId }, data })
}
