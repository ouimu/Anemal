// Blood bank repository (Phase 4, FR-10) — donors, donations, transfusions. Tenant-scoped.
import { Prisma } from '@prisma/client'
import prisma from '../config/db'
import { ConflictError } from '../utils/errors'

const petSel = { select: { id: true, name: true, species: true } }

export function findDonorByPet(tenantId: number, petId: number) {
  return prisma.bloodDonor.findUnique({ where: { tenantId_petId: { tenantId, petId } } })
}

export function findDonorById(tenantId: number, id: number) {
  return prisma.bloodDonor.findFirst({
    where: { id, tenantId, pet: { is: { tenantId } } },
    include: { pet: petSel },
  })
}

// FK validation for registerDonor — pet table, scoped to tenant (arch §4.1 rev 3: new function,
// moved out of blood-bank.service.ts's inline `prisma.pet.findFirst` check). `client` defaults to
// the shared `prisma` instance but accepts a `Prisma.TransactionClient` so the service can run this
// check inside the same write transaction as `createDonor` (arch §8.2 atomicity fix).
export function findDonorPet(tenantId: number, petId: number, client: Prisma.TransactionClient | typeof prisma = prisma) {
  return client.pet.findFirst({ where: { id: petId, tenantId } })
}

// `client` defaults to the shared `prisma` instance but accepts a `Prisma.TransactionClient` so
// `registerDonor` (blood-bank.service.ts) can run the FK check and this write inside one transaction.
export function createDonor(
  tenantId: number,
  data: { petId: number; bloodType: string; notes?: string | null },
  client: Prisma.TransactionClient | typeof prisma = prisma,
) {
  return client.bloodDonor.create({ data: { tenantId, ...data } })
}

// ponytail: NULL-branch pets (no branch assigned) show up in every branch's view, same rule as usage.repository's vaccination query.
function petBranchFilter(branchId?: number | null) {
  return branchId ? { OR: [{ branchId }, { branchId: null }] } : undefined
}

export function listDonors(tenantId: number, branchId?: number | null) {
  return prisma.bloodDonor.findMany({
    where: {
      tenantId,
      pet: { is: { tenantId, ...(branchId ? { OR: [{ branchId }, { branchId: null }] } : {}) } },
    },
    include: { pet: petSel },
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * R3-HI-03: `eligibleCutoff` is the caller-computed boundary (now − species interval).
 * The `OR: [{ lastDonationAt: null }, { lastDonationAt: { lte: eligibleCutoff } }]`
 * predicate re-checks eligibility atomically at write time, not just at the service's
 * earlier read — two concurrent collection requests for the same donor can no longer
 * both pass a stale eligibility read and both create a donation within the safety
 * interval. The loser gets a ConflictError instead of a double collection.
 */
export function createDonation(
  tenantId: number,
  data: { donorId: number; volumeMl: number; expiryDate: Date; collectedBy?: number | null; notes?: string | null },
  eligibleCutoff: Date,
) {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.bloodDonor.updateMany({
      where: {
        id: data.donorId,
        tenantId,
        OR: [{ lastDonationAt: null }, { lastDonationAt: { lte: eligibleCutoff } }],
      },
      data: { lastDonationAt: new Date(), isEligible: false },
    })
    if (claimed.count !== 1) throw new ConflictError('Donor is not currently eligible for collection', 'DONOR_NOT_ELIGIBLE')
    return tx.bloodDonation.create({ data: { tenantId, ...data } })
  })
}

export function listDonations(tenantId: number, status?: string, branchId?: number | null) {
  return prisma.bloodDonation.findMany({
    where: {
      tenantId,
      ...(status ? { status } : {}),
      donor: {
        is: {
          tenantId,
          pet: { is: { tenantId, ...(branchId ? { OR: [{ branchId }, { branchId: null }] } : {}) } },
        },
      },
    },
    include: { donor: { include: { pet: petSel } } },
    orderBy: { collectedAt: 'desc' },
  })
}

export function findDonationById(tenantId: number, id: number) {
  return prisma.bloodDonation.findFirst({
    where: { id, tenantId, donor: { is: { tenantId } } },
    include: { donor: true },
  })
}

/**
 * R3-HI-03: atomically claim the bag before recording the transfusion — the
 * `status: 'available'` + `volumeMl: { gte }` predicate and `count !== 1` check make this
 * the single authoritative write. Two concurrent transfusions against the same bag can no
 * longer both pass an earlier "is it available" read; the loser gets a ConflictError.
 * A transfusion requesting more volume than the bag currently holds is rejected the same
 * way (the `gte` predicate simply never matches).
 */
export function createTransfusion(
  tenantId: number,
  data: { recipientPetId: number; donationId?: number | null; volumeMl: number; reactions?: string | null; notes?: string | null; administeredBy?: number | null },
) {
  return prisma.$transaction(async (tx) => {
    if (data.donationId) {
      const claimed = await tx.bloodDonation.updateMany({
        where: { id: data.donationId, tenantId, status: 'available', volumeMl: { gte: data.volumeMl } },
        data: { status: 'used' },
      })
      if (claimed.count !== 1) throw new ConflictError('Bag unavailable or insufficient volume', 'BLOOD_BAG_UNAVAILABLE')
    }
    return tx.bloodTransfusion.create({ data: { tenantId, ...data } })
  })
}

export function listTransfusions(tenantId: number, branchId?: number | null) {
  return prisma.bloodTransfusion.findMany({
    where: { tenantId, ...(branchId ? { recipientPet: petBranchFilter(branchId) } : {}) },
    orderBy: { administeredAt: 'desc' },
    take: 100,
  })
}
