// Blood bank service (Phase 4, FR-10) — donor eligibility + transfusion compatibility guards.
import { z } from 'zod'
import { AppError } from '../utils/errors'
import prisma from '../config/db'
import * as bbRepo from '../models/blood-bank.repository'

export const donorSchema = z.object({
  petId:     z.number().int().positive(),
  bloodType: z.string().trim().min(1).max(50),
  notes:     z.string().optional().nullable(),
}).strict()

export const collectionSchema = z.object({
  donorId:    z.number().int().positive(),
  volumeMl:   z.number().positive(),
  expiryDate: z.string().datetime(),
  notes:      z.string().optional().nullable(),
}).strict()

export const transfusionSchema = z.object({
  recipientPetId:     z.number().int().positive(),
  donationId:         z.number().int().positive().optional().nullable(),
  volumeMl:           z.number().positive(),
  recipientBloodType: z.string().max(50).optional().nullable(),
  reactions:          z.string().optional().nullable(),
  notes:              z.string().optional().nullable(),
  acknowledgeMismatch: z.boolean().optional(),
}).strict()

export type DonorInput = z.infer<typeof donorSchema>
export type CollectionInput = z.infer<typeof collectionSchema>
export type TransfusionInput = z.infer<typeof transfusionSchema>

export class BloodBankError extends AppError {
  constructor(message: string, statusCode: number, code = 'BLOOD_BANK_ERROR') {
    super(statusCode, message, code)
  }
}

const donationIntervalDays = (species: string) => (species.toLowerCase().startsWith('cat') ? 30 : 56)

export async function registerDonor(tenantId: number, data: DonorInput) {
  const pet = await prisma.pet.findFirst({ where: { id: data.petId, tenantId } })
  if (!pet) throw new BloodBankError('Pet not found', 404)
  const existing = await bbRepo.findDonorByPet(tenantId, data.petId)
  if (existing) throw new BloodBankError('Pet is already a registered donor', 409)
  return bbRepo.createDonor(tenantId, data)
}

export function listDonors(tenantId: number, branchId?: number | null) {
  return bbRepo.listDonors(tenantId, branchId)
}

export async function recordCollection(tenantId: number, data: CollectionInput, collectedBy?: number) {
  const donor = await bbRepo.findDonorById(tenantId, data.donorId)
  if (!donor) throw new BloodBankError('Donor not found', 404)

  // Eligibility: enforce minimum interval between donations (FR-10 safety). This is a
  // friendly pre-check for the common case; R3-HI-03's atomic claim inside
  // bbRepo.createDonation is what actually prevents a race between two concurrent
  // collection requests reading the same stale `lastDonationAt`.
  const interval = donationIntervalDays(donor.pet.species)
  if (donor.lastDonationAt) {
    const nextOk = new Date(donor.lastDonationAt); nextOk.setDate(nextOk.getDate() + interval)
    if (new Date() < nextOk) {
      throw new BloodBankError(`Donor not eligible until ${nextOk.toISOString().slice(0, 10)} (min ${interval}-day interval)`, 409, 'DONOR_NOT_ELIGIBLE')
    }
  }
  const eligibleCutoff = new Date()
  eligibleCutoff.setDate(eligibleCutoff.getDate() - interval)
  return bbRepo.createDonation(tenantId, {
    donorId: data.donorId, volumeMl: data.volumeMl, expiryDate: new Date(data.expiryDate),
    collectedBy: collectedBy ?? null, notes: data.notes ?? null,
  }, eligibleCutoff)
}

export function listBags(tenantId: number, status?: string, branchId?: number | null) {
  return bbRepo.listDonations(tenantId, status, branchId)
}

export async function recordTransfusion(tenantId: number, data: TransfusionInput, administeredBy?: number) {
  const pet = await prisma.pet.findFirst({ where: { id: data.recipientPetId, tenantId } })
  if (!pet) throw new BloodBankError('Recipient pet not found', 404)

  if (data.donationId) {
    const donation = await bbRepo.findDonationById(tenantId, data.donationId)
    if (!donation) throw new BloodBankError('Donation bag not found', 404)
    if (donation.status !== 'available') throw new BloodBankError(`Bag is ${donation.status}, not available`, 409)

    // Compatibility guard: block on known mismatch unless explicitly acknowledged.
    if (data.recipientBloodType && donation.donor.bloodType !== data.recipientBloodType && !data.acknowledgeMismatch) {
      throw new BloodBankError(
        `Blood type mismatch: bag is ${donation.donor.bloodType}, recipient is ${data.recipientBloodType}. Set acknowledgeMismatch to override.`,
        409, 'INCOMPATIBLE_BLOOD',
      )
    }
  }

  return bbRepo.createTransfusion(tenantId, {
    recipientPetId: data.recipientPetId, donationId: data.donationId ?? null, volumeMl: data.volumeMl,
    reactions: data.reactions ?? null, notes: data.notes ?? null, administeredBy: administeredBy ?? null,
  })
}

export function listTransfusions(tenantId: number, branchId?: number | null) {
  return bbRepo.listTransfusions(tenantId, branchId)
}
