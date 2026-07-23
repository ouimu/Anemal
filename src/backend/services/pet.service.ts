import { z } from 'zod'
import { AppError } from '../utils/errors'
import * as petRepo from '../models/pet.repository'
import { assertCanAddPet } from './subscription.service'
import { getStorageDriver } from '../config/storage-driver'

export const createPetSchema = z.object({
  ownerId:             z.number().int().positive(),
  name:                z.string().min(1).max(100),
  species:             z.string().min(1).max(50),
  breed:               z.string().max(100).optional().nullable(),
  color:               z.string().max(100).optional().nullable(),
  birthDate:           z.string().optional().nullable(),
  gender:              z.enum(['male', 'female', 'unknown']).optional().nullable(),
  weightKg:            z.number().positive().max(999.99).optional().nullable(),
  microchipId:         z.string().max(50).optional().nullable(),
  allergies:           z.string().optional().nullable(),
  underlyingConditions:z.string().optional().nullable(),
})

export const updatePetSchema = createPetSchema.partial().omit({ ownerId: true }).extend({
  isActive: z.boolean().optional(),
})

export type CreatePetInput = z.infer<typeof createPetSchema>
export type UpdatePetInput = z.infer<typeof updatePetSchema>

export class PetError extends AppError {
  constructor(message: string, statusCode: number) {
    super(statusCode, message, 'PET_ERROR')
  }
}

export async function listPets(tenantId: number, page = 1, limit = 20, ownerId?: number, species?: string) {
  const skip = (page - 1) * limit
  const [pets, total] = await Promise.all([
    petRepo.findPets(tenantId, { skip, take: limit, ownerId, species }),
    petRepo.countPets(tenantId, ownerId, species),
  ])
  return { pets, total, page, limit }
}

export async function getPet(tenantId: number, id: number, includeEmr = true) {
  const pet = await petRepo.findPetById(tenantId, id, includeEmr)
  if (!pet) throw new PetError('Pet not found', 404)
  return pet
}

export async function createPet(tenantId: number, data: CreatePetInput) {
  await assertCanAddPet(tenantId)
  const owner = await petRepo.findOwner(tenantId, data.ownerId)
  if (!owner) throw new PetError('Owner not found', 404)
  return petRepo.createPet(tenantId, data)
}

export async function updatePet(tenantId: number, id: number, data: UpdatePetInput) {
  await getPet(tenantId, id)
  return petRepo.updatePet(tenantId, id, data)
}

const PET_PHOTO_MIME_ALLOWLIST = ['image/jpeg', 'image/png', 'image/webp'] as const
export const PET_PHOTO_MAX_SIZE_BYTES = 5 * 1024 * 1024
const PET_PHOTO_EXTENSION: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const PET_PHOTO_CONTENT_TYPE: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

export interface PetPhotoUploadFile {
  buffer:   Buffer
  mimetype: string
  size:     number
}

function buildPetPhotoKey(tenantId: number, petId: number, mimetype: string): string {
  return `tenants/${tenantId}/photo/pet-${petId}.${PET_PHOTO_EXTENSION[mimetype]}`
}

function isOwnTenantPhotoKey(tenantId: number, photoUrl: string): boolean {
  return photoUrl.startsWith(`tenants/${tenantId}/photo/`)
}

/**
 * Stable per-pet key (grill G2) — a same-format re-upload overwrites in
 * place (zero orphan, zero delete code). A format change (different
 * extension) triggers a best-effort delete of the previous file.
 *
 * Tenant-prefix guard on delete (mirrors the read-side guard, BA sign-off
 * §2.3 R-1): a pre-existing row could carry a forged/legacy photoUrl from
 * before photoUrl became server-managed-only — without this check,
 * uploading a new photo would delete whatever file that forged key points
 * at, including another tenant's, via LocalDiskDriver (which permits any
 * in-baseDir path).
 */
export async function uploadPetPhoto(tenantId: number, petId: number, file: PetPhotoUploadFile) {
  const pet = await getPet(tenantId, petId, false)

  if (!(PET_PHOTO_MIME_ALLOWLIST as readonly string[]).includes(file.mimetype)) {
    throw new PetError('Image type not allowed', 400)
  }
  if (file.size > PET_PHOTO_MAX_SIZE_BYTES) {
    throw new PetError('Image exceeds the 5 MB limit', 400)
  }

  const storageKey = buildPetPhotoKey(tenantId, petId, file.mimetype)
  const driver = await getStorageDriver(tenantId)

  if (pet.photoUrl && pet.photoUrl !== storageKey && isOwnTenantPhotoKey(tenantId, pet.photoUrl)) {
    await driver.delete(pet.photoUrl)
  }
  await driver.save(storageKey, file.buffer, file.mimetype)
  return petRepo.updatePetPhotoUrl(tenantId, petId, storageKey)
}

export interface PetPhotoFileResult {
  buffer:      Buffer
  contentType: string
}

/**
 * Serve-time prefix guard (BA sign-off §2.3, R-1): even though photoUrl is
 * now server-managed only, this is defense-in-depth against any value that
 * predates this fix or is set by direct DB access — the guard, not the
 * schema change alone, is what actually stops a cross-tenant/cross-module
 * read at the point driver.read is called.
 */
export async function getPetPhotoFile(tenantId: number, petId: number): Promise<PetPhotoFileResult> {
  const pet = await getPet(tenantId, petId, false)
  if (!pet.photoUrl) throw new PetError('Pet has no photo', 404)

  if (!isOwnTenantPhotoKey(tenantId, pet.photoUrl)) {
    throw new PetError('Invalid photo reference', 404)
  }

  const driver = await getStorageDriver(tenantId)
  if (!(await driver.exists(pet.photoUrl))) {
    throw new PetError('Photo file is missing', 404)
  }
  const buffer = await driver.read(pet.photoUrl)
  const ext = pet.photoUrl.split('.').pop() ?? ''
  return { buffer, contentType: PET_PHOTO_CONTENT_TYPE[ext] ?? 'application/octet-stream' }
}
