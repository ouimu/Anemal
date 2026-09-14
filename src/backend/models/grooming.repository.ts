// Grooming booking repository (Phase 4, FR-09). Tenant + branch scoped.
import prisma from '../config/db'
import { NotFoundError } from '../utils/errors'
import type { BookingInput } from '../services/grooming.service'

const petSel = { select: { id: true, name: true, species: true } }

// Cross-tenant FK guard (CR-01): client-supplied petId/groomerId must belong to this
// tenant, validated inside the same transaction as the write.
export function createBooking(tenantId: number, branchId: number | null, data: BookingInput, createdBy?: number) {
  return prisma.$transaction(async (tx) => {
    const pet = await tx.pet.findFirst({ where: { id: data.petId, tenantId }, select: { id: true } })
    if (!pet) throw new NotFoundError('Pet')
    if (data.groomerId != null) {
      const groomer = await tx.user.findFirst({ where: { id: data.groomerId, tenantId }, select: { id: true } })
      if (!groomer) throw new NotFoundError('Groomer')
    }
    return tx.groomingBooking.create({
      data: {
        tenantId, branchId,
        petId: data.petId, groomerId: data.groomerId ?? null, serviceType: data.serviceType,
        scheduledAt: new Date(data.scheduledAt), durationMin: data.durationMin ?? 60,
        specialInstructions: data.specialInstructions ?? null, createdBy: createdBy ?? null,
      },
    })
  })
}

export function listBookings(tenantId: number, branchId?: number, date?: string) {
  let scheduledAt: { gte: Date; lt: Date } | undefined
  if (date) {
    const start = new Date(date); start.setHours(0, 0, 0, 0)
    const end = new Date(start); end.setDate(end.getDate() + 1)
    scheduledAt = { gte: start, lt: end }
  }
  return prisma.groomingBooking.findMany({
    where: {
      tenantId,
      pet: { is: { tenantId } },
      ...(branchId ? { branchId } : {}),
      ...(scheduledAt ? { scheduledAt } : {}),
    },
    include: { pet: petSel },
    orderBy: { scheduledAt: 'asc' },
  })
}

export function countGroomerBookingsOnDay(tenantId: number, groomerId: number, day: Date) {
  const start = new Date(day); start.setHours(0, 0, 0, 0)
  const end = new Date(start); end.setDate(end.getDate() + 1)
  return prisma.groomingBooking.count({
    where: { tenantId, groomerId, scheduledAt: { gte: start, lt: end }, status: { notIn: ['cancelled'] } },
  })
}

export function findById(tenantId: number, id: number) {
  return prisma.groomingBooking.findFirst({ where: { id, tenantId } })
}

export function updateStatus(tenantId: number, id: number, status: string) {
  return prisma.groomingBooking.updateMany({ where: { id, tenantId }, data: { status } })
    .then(() => findById(tenantId, id))
}
