// Blood bank repository (Phase 4, FR-10) — donors, donations, transfusions. Tenant-scoped.
import prisma from '../config/db'
import { NotFoundError } from '../utils/errors'

const petSel = { select: { id: true, name: true, species: true } }

export function findDonorByPet(tenantId: number, petId: number) {
  return prisma.bloodDonor.findUnique({ where: { tenantId_petId: { tenantId, petId } } })
}

export function findDonorById(tenantId: number, id: number) {
  return prisma.bloodDonor.findFirst({ where: { id, tenantId }, include: { pet: petSel } })
}

export function createDonor(tenantId: number, data: { petId: number; bloodType: string; notes?: string | null }) {
  return prisma.bloodDonor.create({ data: { tenantId, ...data } })
}

// ponytail: NULL-branch pets (no branch assigned) show up in every branch's view, same rule as usage.repository's vaccination query.
function petBranchFilter(branchId?: number | null) {
  return branchId ? { OR: [{ branchId }, { branchId: null }] } : undefined
}

export function listDonors(tenantId: number, branchId?: number | null) {
  return prisma.bloodDonor.findMany({
    where: { tenantId, ...(branchId ? { pet: petBranchFilter(branchId) } : {}) },
    include: { pet: petSel },
    orderBy: { createdAt: 'desc' },
  })
}

export function createDonation(
  tenantId: number,
  data: { donorId: number; volumeMl: number; expiryDate: Date; collectedBy?: number | null; notes?: string | null },
) {
  return prisma.$transaction(async (tx) => {
    const donation = await tx.bloodDonation.create({ data: { tenantId, ...data } })
    // HI-02: scoped `updateMany` instead of a bare `update({where:{id}})`.
    const updated = await tx.bloodDonor.updateMany({
      where: { id: data.donorId, tenantId },
      data: { lastDonationAt: new Date(), isEligible: false },
    })
    if (updated.count !== 1) throw new NotFoundError('Donor')
    return donation
  })
}

export function listDonations(tenantId: number, status?: string, branchId?: number | null) {
  return prisma.bloodDonation.findMany({
    where: {
      tenantId,
      ...(status ? { status } : {}),
      ...(branchId ? { donor: { pet: petBranchFilter(branchId) } } : {}),
    },
    include: { donor: { include: { pet: petSel } } },
    orderBy: { collectedAt: 'desc' },
  })
}

export function findDonationById(tenantId: number, id: number) {
  return prisma.bloodDonation.findFirst({ where: { id, tenantId }, include: { donor: true } })
}

export function createTransfusion(
  tenantId: number,
  data: { recipientPetId: number; donationId?: number | null; volumeMl: number; reactions?: string | null; notes?: string | null; administeredBy?: number | null },
) {
  return prisma.$transaction(async (tx) => {
    const transfusion = await tx.bloodTransfusion.create({ data: { tenantId, ...data } })
    if (data.donationId) {
      await tx.bloodDonation.updateMany({ where: { id: data.donationId, tenantId }, data: { status: 'used' } })
    }
    return transfusion
  })
}

export function listTransfusions(tenantId: number, branchId?: number | null) {
  return prisma.bloodTransfusion.findMany({
    where: { tenantId, ...(branchId ? { recipientPet: petBranchFilter(branchId) } : {}) },
    orderBy: { administeredAt: 'desc' },
    take: 100,
  })
}
