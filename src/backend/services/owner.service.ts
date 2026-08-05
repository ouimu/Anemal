import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { AppError } from '../utils/errors'
import * as ownerRepo from '../models/owner.repository'
import { createWithQuotaLock } from './subscription.service'
import { resolvePermissions } from './permission.service'

/**
 * Validates a 13-digit Thai national ID using the standard mod-11 checksum.
 * Weights 13..2 are applied to the first 12 digits; the resulting checksum
 * must equal the 13th digit. Returns false for anything that isn't exactly
 * 13 digits.
 */
export function isValidThaiId(id: string): boolean {
  if (!/^\d{13}$/.test(id)) return false
  let sum = 0
  for (let i = 0; i < 12; i++) {
    sum += Number(id[i]) * (13 - i)
  }
  const checkDigit = (11 - (sum % 11)) % 10
  return checkDigit === Number(id[12])
}

const idCardShape = z.object({
  idCardType:   z.enum(['thai_id', 'passport']).optional().nullable(),
  idCardNumber: z.string().max(20).optional().nullable(),
}).superRefine((val, ctx) => {
  const hasType   = val.idCardType   != null
  const hasNumber = val.idCardNumber != null && val.idCardNumber !== ''
  if (hasType !== hasNumber) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'idCardType and idCardNumber must both be set or both be omitted', path: ['idCardNumber'] })
    return
  }
  if (!hasType) return
  if (val.idCardType === 'thai_id' && !isValidThaiId(val.idCardNumber!)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid Thai national ID (13 digits, checksum failed)', path: ['idCardNumber'] })
  }
  if (val.idCardType === 'passport' && !/^[A-Za-z0-9]{6,20}$/.test(val.idCardNumber!)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Passport number must be 6-20 alphanumeric characters', path: ['idCardNumber'] })
  }
})

export const createOwnerSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName:  z.string().min(1).max(100),
  phone:     z.string().min(1).max(50),
  email:     z.string().email().optional().nullable(),
  lineId:    z.string().max(100).optional().nullable(),
  address:   z.string().optional().nullable(),
}).and(idCardShape)

export const updateOwnerSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName:  z.string().min(1).max(100).optional(),
  phone:     z.string().min(1).max(50).optional(),
  email:     z.string().email().optional().nullable(),
  lineId:    z.string().max(100).optional().nullable(),
  address:   z.string().optional().nullable(),
  isActive:  z.boolean().optional(),
}).and(idCardShape)

export type CreateOwnerInput = z.infer<typeof createOwnerSchema>
export type UpdateOwnerInput = z.infer<typeof updateOwnerSchema>

export class OwnerError extends AppError {
  constructor(message: string, statusCode: number) {
    super(statusCode, message, 'OWNER_ERROR')
  }
}

export async function listOwners(
  tenantId: number, userId: number, page = 1, limit = 20, search?: string, includeInactive?: boolean,
) {
  const canSeeInactive = includeInactive
    ? (await resolvePermissions(userId, tenantId)).has('crm.delete')
    : false
  const skip = (page - 1) * limit
  const [owners, total] = await Promise.all([
    ownerRepo.findOwners(tenantId, { skip, take: limit, search, includeInactive: canSeeInactive }),
    ownerRepo.countOwners(tenantId, search, canSeeInactive),
  ])
  return { owners, total, page, limit }
}

export async function getOwner(tenantId: number, id: number) {
  const owner = await ownerRepo.findOwnerById(tenantId, id)
  if (!owner) throw new OwnerError('Owner not found', 404)
  return owner
}

// R3-HI-04: quota check + insert now happen inside one advisory-lock-serialized
// transaction (subscription.service.createWithQuotaLock) instead of a preceding,
// independent count check that a concurrent request could race past.
export async function createOwner(tenantId: number, data: CreateOwnerInput) {
  const existingPhone = await ownerRepo.findOwnerByPhone(tenantId, data.phone)
  if (existingPhone) throw new OwnerError('Phone number already registered in this clinic', 409)
  if (data.idCardNumber) {
    const existingIdCard = await ownerRepo.findOwnerByIdCard(tenantId, data.idCardNumber)
    if (existingIdCard) throw new OwnerError('ID card number already registered in this clinic', 409)
  }
  try {
    return await createWithQuotaLock(tenantId, 'owners', (tx) => ownerRepo.createOwner(tenantId, data, tx))
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new OwnerError('ID card number already registered in this clinic', 409)
    }
    throw err
  }
}

export async function updateOwner(tenantId: number, userId: number, id: number, data: UpdateOwnerInput) {
  const existing = await getOwner(tenantId, id)

  if (data.isActive !== undefined && data.isActive !== existing.isActive) {
    const perms = await resolvePermissions(userId, tenantId)
    if (!perms.has('crm.delete')) {
      throw new OwnerError('Changing owner active status requires the crm.delete permission', 403)
    }
  }

  if (data.phone) {
    const existingPhone = await ownerRepo.findOwnerByPhone(tenantId, data.phone, id)
    if (existingPhone) throw new OwnerError('Phone number already registered in this clinic', 409)
  }
  if (data.idCardNumber) {
    const existingIdCard = await ownerRepo.findOwnerByIdCard(tenantId, data.idCardNumber, id)
    if (existingIdCard) throw new OwnerError('ID card number already registered in this clinic', 409)
  }

  try {
    return await ownerRepo.updateOwner(tenantId, id, data)
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new OwnerError('ID card number already registered in this clinic', 409)
    }
    throw err
  }
}

/**
 * Soft-deletes (deactivates) an owner within a tenant. Blocked with a 409
 * if the owner still has active pets, since deactivating would orphan them
 * from an active caregiver.
 */
export async function deleteOwner(tenantId: number, id: number): Promise<void> {
  await getOwner(tenantId, id)
  const activePets = await ownerRepo.countActivePetsForOwner(tenantId, id)
  if (activePets > 0) {
    throw new OwnerError('Cannot delete: owner has active pets', 409)
  }
  await ownerRepo.deactivateOwner(tenantId, id)
}
