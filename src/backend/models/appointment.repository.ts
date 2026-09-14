// Appointment repository — all Prisma access (incl. the raw-SQL overlap check).

import prisma from '../config/db'
import { ConflictError } from '../utils/errors'
import type { CreateAppointmentInput, AppointmentStatus } from '../services/appointment.service'
import { ownerSummarySelect } from './owner.repository'

export function findInRange(tenantId: number, branchId: number | null | undefined, start: Date, end: Date, doctorId?: number) {
  return prisma.appointment.findMany({
    where: {
      tenantId,
      ...(branchId != null ? { branchId } : {}),
      scheduledAt: { gte: start, lt: end },
      ...(doctorId ? { doctorId } : {}),
      pet:    { is: { tenantId } },
      doctor: { is: { tenantId } },
    },
    include: {
      pet:    { select: { id: true, name: true, species: true, photoUrl: true } },
      doctor: { select: { id: true, name: true } },
    },
    orderBy: { scheduledAt: 'asc' },
  })
}

/**
 * Users bookable as a doctor for the given branch scope.
 * branchId === null means "no branch filter" (all-branches session), matching
 * the same convention findInRange already uses.
 * Doctor membership: any assigned role is either the system 'doctor' role
 * directly, or a custom role whose sourceRoleId traces back to it.
 */
export async function findDoctorsForBranch(tenantId: number, branchId: number | null) {
  const doctorSystemRole = await prisma.clinicRole.findFirst({
    where:  { key: 'doctor', tenantId: null, isSystem: true },
    select: { id: true },
  })
  const doctorRoleMatch = doctorSystemRole
    ? [{ key: 'doctor' }, { sourceRoleId: doctorSystemRole.id }]
    : [{ key: 'doctor' }]

  return prisma.user.findMany({
    where: {
      tenantId,
      isActive: true,
      ...(branchId != null ? { userBranches: { some: { tenantId, branchId } } } : {}),
      userRoles: {
        some: {
          tenantId,
          role: { OR: doctorRoleMatch },
        },
      },
    },
    select:  { id: true, name: true },
    orderBy: { name: 'asc' },
  })
}

/**
 * Single doctor lookup for tenant-ownership validation before booking.
 * Same doctor-role match as findDoctorsForBranch; no branch filter.
 */
export async function findDoctorById(tenantId: number, id: number) {
  const doctorSystemRole = await prisma.clinicRole.findFirst({
    where:  { key: 'doctor', tenantId: null, isSystem: true },
    select: { id: true },
  })
  const doctorRoleMatch = doctorSystemRole
    ? [{ key: 'doctor' }, { sourceRoleId: doctorSystemRole.id }]
    : [{ key: 'doctor' }]

  return prisma.user.findFirst({
    where: {
      id,
      tenantId,
      isActive: true,
      userRoles: {
        some: {
          tenantId,
          role: { OR: doctorRoleMatch },
        },
      },
    },
    select: { id: true, name: true },
  })
}

export function findById(tenantId: number, branchId: number | null | undefined, id: number) {
  return prisma.appointment.findFirst({
    where: {
      id,
      tenantId,
      ...(branchId != null ? { branchId } : {}),
      pet:    { is: { tenantId, owner: { is: { tenantId } } } },
      doctor: { is: { tenantId } },
    },
    include: {
      pet:    { include: { owner: { select: ownerSummarySelect } } },
      doctor: { select: { id: true, name: true } },
    },
  })
}

// Overlap: existingStart < newEnd AND (existingStart + existingDuration) > newStart
// branchId filter applied when present: a doctor's schedule is branch-scoped.
async function countDoctorConflictsTx(
  tx: PrismaTxOrClient, tenantId: number, branchId: number | null | undefined, doctorId: number, start: Date, end: Date,
): Promise<number> {
  // DB columns are camelCase (Prisma maps tables, not columns) — must be double-quoted in raw SQL.
  if (branchId != null) {
    const rows = await tx.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM appointments
      WHERE "tenantId" = ${tenantId}
        AND "branchId" = ${branchId}
        AND "doctorId" = ${doctorId}
        AND status NOT IN ('cancelled', 'no_show')
        AND "scheduledAt" < ${end}
        AND "scheduledAt" + ("durationMin" * interval '1 minute') > ${start}
    `
    return Number(rows[0]?.count ?? 0)
  }
  const rows = await tx.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count FROM appointments
    WHERE "tenantId" = ${tenantId}
      AND "doctorId" = ${doctorId}
      AND status NOT IN ('cancelled', 'no_show')
      AND "scheduledAt" < ${end}
      AND "scheduledAt" + ("durationMin" * interval '1 minute') > ${start}
  `
  return Number(rows[0]?.count ?? 0)
}

type PrismaTxOrClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0] | typeof prisma

/**
 * R3-HI-01: conflict-check + insert wrapped in one transaction, serialized by a
 * `pg_advisory_xact_lock` keyed on tenant+doctor+day. Two concurrent booking requests
 * for the same doctor/day now execute the check-then-insert sequentially — the second
 * transaction blocks on the lock until the first commits (or rolls back), so it always
 * sees the first booking's row and correctly loses the race with a 409. An application-
 * level count check alone (no lock) cannot prevent this because both requests can read
 * "0 conflicts" before either writes. A DB-level GiST exclusion constraint would be the
 * durable long-term fix (see BA finding R3-HI-01); this advisory lock is the accepted
 * interim per the BA-approved remediation plan.
 */
export async function createAppointment(
  tenantId: number, branchId: number | null, data: CreateAppointmentInput, scheduledAt: Date,
) {
  const durationMin = data.durationMin
  const end = new Date(scheduledAt.getTime() + durationMin * 60_000)
  const lockKey = `appt:${tenantId}:${data.doctorId}:${scheduledAt.toISOString().slice(0, 10)}`

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`

    const conflicts = await countDoctorConflictsTx(tx, tenantId, branchId, data.doctorId, scheduledAt, end)
    if (conflicts > 0) {
      throw new ConflictError('Doctor already has an appointment in this time slot', 'APPOINTMENT_CONFLICT')
    }

    return tx.appointment.create({ data: { ...data, tenantId, branchId, scheduledAt } })
  })
}

export function createWalkIn(tenantId: number, branchId: number | null, petId: number, doctorId: number, reason?: string | null) {
  return prisma.appointment.create({
    data: {
      tenantId,
      branchId,
      petId,
      doctorId,
      scheduledAt: new Date(),
      durationMin: 30,
      status: 'arrived',
      reason: reason ?? null,
    },
  })
}

// HI-02: a single scoped `updateMany` closes the check/use gap between the
// preceding `getAppointment` read and this write — the caller must check `count`.
export function updateStatus(tenantId: number, branchId: number | null | undefined, id: number, status: AppointmentStatus) {
  return prisma.appointment.updateMany({
    where: { id, tenantId, ...(branchId != null ? { branchId } : {}) },
    data: { status },
  })
}
