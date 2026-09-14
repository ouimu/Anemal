// Vaccination repository — all Prisma access for the vaccinations table.

import prisma from '../config/db'
import type { CreateVaccinationInput } from '../services/vaccination.service'

export function findPet(tenantId: number, petId: number) {
  return prisma.pet.findFirst({ where: { id: petId, tenantId } })
}

export function findByPet(tenantId: number, petId: number) {
  return prisma.vaccination.findMany({ where: { tenantId, petId }, orderBy: { administeredAt: 'desc' } })
}

export function createVaccination(tenantId: number, data: CreateVaccinationInput) {
  return prisma.vaccination.create({
    data: {
      ...data,
      tenantId,
      administeredAt: new Date(data.administeredAt),
      nextDueAt: data.nextDueAt ? new Date(data.nextDueAt) : null,
    },
  })
}

// HOTFIX: vaccinations.pet_id has no composite FK on tenant_id, so a corrupt row
// (vaccination.tenantId matching but pointing at a pet in a different tenant) is
// possible without violating any DB constraint. Prisma cannot filter a to-one
// `include` by a field on the related row, so we select the pet's tenantId and
// drop any row that fails the check before it ever reaches the caller.
//
// CORRECTION (XTI-4, 2026-09-11): this comment previously claimed the same
// defense-in-depth as "the explicit tenantId join guards in findDueSoonWorklist"
// — that claim was false (BA F-1) both here and in PR #73's commit message
// (1add331): findDueSoonWorklist's raw-SQL JOINs to pets/owners below have no
// tenantId predicate in their ON clause today. The actual guard is added by
// XTI-8 (ADR-0027 dialect 3); until that lands, do not assume this function is
// tenant-guarded. See `.claude/roadmap/index.md`'s PR #73 correction note.
export function findDueSoon(tenantId: number, from: Date, to: Date) {
  return prisma.vaccination.findMany({
    where: {
      tenantId,
      nextDueAt: { lte: to, gte: from },
      pet: { is: { tenantId, owner: { is: { tenantId } } } },
    },
    include: {
      pet: { select: { id: true, name: true, species: true, owner: { select: { firstName: true, lastName: true, phone: true } } } },
    },
    orderBy: { nextDueAt: 'asc' },
  })
}

export interface WorklistRow {
  petId:       number
  petName:     string
  species:     string
  breed:       string | null
  ownerName:   string
  ownerPhone:  string | null
  vaccineName: string
  nextDueAt:   Date
  daysDue:     number   // negative = overdue
}

// ponytail: raw SQL for latest-per-(pet, normalised vaccineName) dedup.
// normalised = LOWER(TRIM(vaccineName)). NULL-branch pets appear in every branch list.
export function findDueSoonWorklist(
  tenantId: number,
  branchId: number | null,
  cutoff:   Date,    // today + 7 days
): Promise<WorklistRow[]> {
  if (branchId) {
    return prisma.$queryRaw<WorklistRow[]>`
      WITH ranked AS (
        SELECT v.id, v."petId", v."vaccineName", v."nextDueAt",
               ROW_NUMBER() OVER (
                 PARTITION BY v."petId", LOWER(TRIM(v."vaccineName"))
                 ORDER BY v."administeredAt" DESC, v.id DESC
               ) AS rn
        FROM vaccinations v
        JOIN pets p ON p.id = v."petId" AND p."tenantId" = ${tenantId}
        WHERE v."tenantId" = ${tenantId}
          AND v."nextDueAt" IS NOT NULL
          AND v."nextDueAt" <= ${cutoff}
          AND (p."branchId" = ${branchId} OR p."branchId" IS NULL)
      )
      SELECT r."petId", p.name AS "petName", p.species, p.breed,
             CONCAT(o."firstName", ' ', o."lastName") AS "ownerName",
             o.phone AS "ownerPhone",
             r."vaccineName",
             r."nextDueAt",
             EXTRACT(DAY FROM r."nextDueAt" - NOW())::int AS "daysDue"
      FROM ranked r
      JOIN pets p ON p.id = r."petId" AND p."tenantId" = ${tenantId}
      JOIN owners o ON o.id = p."ownerId" AND o."tenantId" = ${tenantId}
      WHERE r.rn = 1
      ORDER BY r."nextDueAt" ASC
    `
  }
  return prisma.$queryRaw<WorklistRow[]>`
    WITH ranked AS (
      SELECT v.id, v."petId", v."vaccineName", v."nextDueAt",
             ROW_NUMBER() OVER (
               PARTITION BY v."petId", LOWER(TRIM(v."vaccineName"))
               ORDER BY v."administeredAt" DESC, v.id DESC
             ) AS rn
      FROM vaccinations v
      WHERE v."tenantId" = ${tenantId}
        AND v."nextDueAt" IS NOT NULL
        AND v."nextDueAt" <= ${cutoff}
    )
    SELECT r."petId", p.name AS "petName", p.species, p.breed,
           CONCAT(o."firstName", ' ', o."lastName") AS "ownerName",
           o.phone AS "ownerPhone",
           r."vaccineName",
           r."nextDueAt",
           EXTRACT(DAY FROM r."nextDueAt" - NOW())::int AS "daysDue"
    FROM ranked r
    JOIN pets p ON p.id = r."petId" AND p."tenantId" = ${tenantId}
    JOIN owners o ON o.id = p."ownerId" AND o."tenantId" = ${tenantId}
    WHERE r.rn = 1
    ORDER BY r."nextDueAt" ASC
  `
}
