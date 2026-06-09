// Blood bank repository (Phase 4, FR-10) — donors, donations, transfusions. Tenant-scoped.
import prisma from '../config/db'

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

export function listDonors(tenantId: number) {
  return prisma.bloodDonor.findMany({ where: { tenantId }, include: { pet: petSel }, orderBy: { createdAt: 'desc' } })
}

export function createDonation(
  tenantId: number,
  data: { donorId: number; volumeMl: number; expiryDate: Date; collectedBy?: number | null; notes?: string | null },
) {
  return prisma.$transaction(async (tx) => {
    const donation = await tx.bloodDonation.create({ data: { tenantId, ...data } })
    await tx.bloodDonor.update({ where: { id: data.donorId }, data: { lastDonationAt: new Date(), isEligible: false } })
    return donation
  })
}

export function listDonations(tenantId: number, status?: string) {
  return prisma.bloodDonation.findMany({
    where: { tenantId, ...(status ? { status } : {}) },
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

export function listTransfusions(tenantId: number) {
  return prisma.bloodTransfusion.findMany({ where: { tenantId }, orderBy: { administeredAt: 'desc' }, take: 100 })
}
