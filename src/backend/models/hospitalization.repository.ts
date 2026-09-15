// Hospitalization (inpatient) repository (Phase 4, FR-08). Tenant + branch scoped.
import { Prisma } from '@prisma/client'
import prisma from '../config/db'
import { ConflictError, NotFoundError } from '../utils/errors'
import type { AdmitInput, EditInput, CareInput } from '../services/hospitalization.service'

type Client = Prisma.TransactionClient | typeof prisma

const petSelect = { select: { id: true, name: true, species: true, photoUrl: true, owner: { select: { firstName: true, lastName: true } } } }

// Cross-tenant FK guard (CR-01): client-supplied petId/doctorInCharge must belong to
// this tenant, validated inside the same transaction as the write.
export function admit(tenantId: number, branchId: number | null, data: AdmitInput) {
  return prisma.$transaction(async (tx) => {
    const pet = await tx.pet.findFirst({ where: { id: data.petId, tenantId }, select: { id: true } })
    if (!pet) throw new NotFoundError('Pet')
    if (data.doctorInCharge != null) {
      const doctor = await tx.user.findFirst({ where: { id: data.doctorInCharge, tenantId }, select: { id: true } })
      if (!doctor) throw new NotFoundError('Doctor')
    }
    return tx.hospitalization.create({
      data: {
        tenantId, branchId,
        petId: data.petId, reason: data.reason, cageNo: data.cageNo ?? null,
        doctorInCharge: data.doctorInCharge ?? null, dailyRate: data.dailyRate ?? 0, notes: data.notes ?? null,
      },
    })
  })
}

// XTI-9 (arch §3.1 dialect 1, T2 site): Hospitalization.petId and Pet.ownerId are both
// required FKs — the tenant predicate mirrors the two-level include path in the root
// `where`, per ADR-0027.
export function findActive(tenantId: number, branchId?: number | null) {
  return prisma.hospitalization.findMany({
    where: {
      tenantId,
      status: 'admitted',
      pet: { is: { tenantId, owner: { is: { tenantId } } } },
      ...(branchId != null ? { branchId } : {}),
    },
    include: { pet: petSelect, _count: { select: { careLogs: true } } },
    orderBy: { admittedAt: 'asc' },
  })
}

// Performer names are resolved via a separate tenant-scoped query rather than a Prisma
// relation `include`, because `performedBy` is a bare FK to User.id with no tenantId in
// its join condition — an `include` would resolve any tenant's user for a malformed/
// legacy-imported row. Filtering the batch lookup by tenantId keeps names tenant-safe.
// `client` defaults to the shared `prisma` instance but accepts a `Prisma.TransactionClient`
// so R3-HI-02's discharge claim can read back the row inside its own open transaction
// (a read against the plain `prisma` client would not see that transaction's uncommitted
// write).
async function findByIdWith(client: Client, tenantId: number, branchId: number | null | undefined, id: number) {
  const hosp = await client.hospitalization.findFirst({
    where: {
      id,
      tenantId,
      pet: { is: { tenantId, owner: { is: { tenantId } } } },
      ...(branchId != null ? { branchId } : {}),
    },
    include: {
      pet: petSelect,
      careLogs: { where: { tenantId }, orderBy: { recordedAt: 'desc' } },
    },
  })
  if (!hosp) return null

  const performerIds = [...new Set(hosp.careLogs.map(c => c.performedBy).filter((v): v is number => v != null))]
  const performers = performerIds.length
    ? await client.user.findMany({ where: { id: { in: performerIds }, tenantId }, select: { id: true, name: true } })
    : []
  const performerMap = new Map(performers.map(p => [p.id, p]))

  return {
    ...hosp,
    careLogs: hosp.careLogs.map(c => ({
      ...c,
      performedByUser: c.performedBy != null ? (performerMap.get(c.performedBy) ?? null) : null,
    })),
  }
}

export function findById(tenantId: number, branchId: number | null | undefined, id: number) {
  return findByIdWith(prisma, tenantId, branchId, id)
}

export function findByIdWithCareCount(tenantId: number, branchId: number | null | undefined, id: number) {
  return prisma.hospitalization.findFirst({
    where: { id, tenantId, ...(branchId != null ? { branchId } : {}) },
    include: { _count: { select: { careLogs: true } } },
  })
}

export function update(tenantId: number, branchId: number | null | undefined, id: number, data: EditInput) {
  return prisma.$transaction(async (tx) => {
    if (data.doctorInCharge != null) {
      const doctor = await tx.user.findFirst({ where: { id: data.doctorInCharge, tenantId }, select: { id: true } })
      if (!doctor) throw new NotFoundError('Doctor')
    }
    return tx.hospitalization.updateMany({
      where: { id, tenantId, ...(branchId != null ? { branchId } : {}) },
      data: {
        reason: data.reason, cageNo: data.cageNo ?? null, doctorInCharge: data.doctorInCharge ?? null,
        dailyRate: data.dailyRate ?? 0, notes: data.notes ?? null,
      },
    })
  }).then(() => findById(tenantId, branchId, id))
}

export function remove(tenantId: number, branchId: number | null | undefined, id: number) {
  return prisma.hospitalization.deleteMany({ where: { id, tenantId, ...(branchId != null ? { branchId } : {}) } })
}

export function addCare(tenantId: number, hospitalizationId: number, data: CareInput, performedBy?: number) {
  return prisma.dailyInpatientCare.create({
    data: {
      tenantId, hospitalizationId,
      timeSlot: data.timeSlot, temperatureC: data.temperatureC ?? null, heartRateBpm: data.heartRateBpm ?? null,
      respRateRpm: data.respRateRpm ?? null, feedingStatus: data.feedingStatus ?? null,
      medicationGiven: data.medicationGiven ?? null, notes: data.notes ?? null, performedBy: performedBy ?? null,
    },
  })
}

/**
 * R3-HI-02: atomically claim the discharge inside the caller's transaction. The
 * `status: 'admitted'` predicate + `count !== 1` check make this the single authoritative
 * write — a second concurrent discharge request (or a replay) loses the race and gets a
 * ConflictError instead of re-billing an already-discharged stay. The caller is expected
 * to create the auto-billed invoice in the SAME transaction, so an invoice-creation
 * failure rolls the discharge back too (patient stays admitted, no orphaned invoice).
 */
export async function claimDischarged(
  tx: Prisma.TransactionClient, tenantId: number, branchId: number | null | undefined, id: number,
) {
  const claimed = await tx.hospitalization.updateMany({
    where: { id, tenantId, ...(branchId != null ? { branchId } : {}), status: 'admitted' },
    data: { status: 'discharged', dischargedAt: new Date() },
  })
  if (claimed.count !== 1) throw new ConflictError('Patient is not currently admitted', 'HOSPITALIZATION_NOT_ADMITTED')
  const h = await findByIdWith(tx, tenantId, branchId, id)
  if (!h) throw new NotFoundError('Hospitalization')
  return h
}
