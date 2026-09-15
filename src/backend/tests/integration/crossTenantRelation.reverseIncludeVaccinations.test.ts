/**
 * XTI-13 shape 6 (arch §9) — REVERSE include (parent -> children):
 * `pet.repository.findPetById` includes `vaccinations` and `medicalRecords`.
 *
 * WHY THIS SHAPE IS SEPARATE FROM SHAPE 1, even though it is the same function.
 * BA sign-off E-2 originally declared reverse includes "safe by construction" — the
 * parent is tenant-filtered and the children carry their own tenantId. QA's C-1
 * reproduction falsified that: an `include` applies NO predicate to the child rows
 * unless one is written, and a child carrying a tenantId helps only if something
 * FILTERS on it. The leak also runs the OTHER WAY from shape 1: a corrupt child row
 * owned by tenant B, hanging off tenant A's pet, pushes B's data into A's response —
 * and the victim (A) did nothing wrong.
 *
 * ADR-0027 dialect 2 is the fix: the predicate lives in the nested `where`.
 */
import { Server } from 'http'
import request from 'supertest'
import prisma from '../../config/db'
import {
  TenantFixture, cleanupTenants, expectNoForeignTrace,
  fixtureStamp, seedCrossTenantPair, startFixtureServer, stopFixtureServer,
} from '../helpers/crossTenantRelationFixture'

let server: Server
let A: TenantFixture
let B: TenantFixture
let foreignVaccinationId = 0
let ownVaccinationId = 0
let foreignRecordId = 0
let ownRecordId = 0

beforeAll(async () => {
  server = await startFixtureServer()
  const pair = await seedCrossTenantPair(server, fixtureStamp())
  A = pair.A
  B = pair.B

  ownVaccinationId = (await prisma.vaccination.create({
    data: { tenantId: A.tenantId, petId: A.petId, vaccineName: 'OwnVax', administeredAt: new Date() },
  })).id
  // THE CORRUPT CHILD: a vaccination owned by tenant B, hanging off tenant A's pet.
  foreignVaccinationId = (await prisma.vaccination.create({
    data: { tenantId: B.tenantId, petId: A.petId, vaccineName: `ForeignVax${B.label}`, administeredAt: new Date() },
  })).id

  ownRecordId = (await prisma.medicalRecord.create({
    data: { tenantId: A.tenantId, branchId: A.branchId, petId: A.petId, doctorId: A.doctorUserId, assessment: 'OwnAssessment' },
  })).id
  foreignRecordId = (await prisma.medicalRecord.create({
    data: { tenantId: B.tenantId, branchId: B.branchId, petId: A.petId, doctorId: B.doctorUserId, assessment: `ForeignAssessment${B.label}` },
  })).id
}, 180_000)

afterAll(async () => {
  await cleanupTenants([A?.tenantId, B?.tenantId].filter((v): v is number => typeof v === 'number'))
  await stopFixtureServer(server)
}, 180_000)

interface PetDetail {
  id: number
  vaccinations: { id: number; tenantId: number; vaccineName: string }[]
  medicalRecords: { id: number; assessment: string | null }[]
}

describe('XTI-13 shape 6 — reverse include (pet -> vaccinations / medicalRecords)', () => {
  it('the corrupt children really do hang off A\'s pet while belonging to B — precondition', async () => {
    const vax = await prisma.vaccination.findUniqueOrThrow({
      where: { id: foreignVaccinationId }, select: { tenantId: true, petId: true },
    })
    expect(vax.tenantId).toBe(B.tenantId)
    expect(vax.petId).toBe(A.petId)

    const rec = await prisma.medicalRecord.findUniqueOrThrow({
      where: { id: foreignRecordId }, select: { tenantId: true, petId: true },
    })
    expect(rec.tenantId).toBe(B.tenantId)
    expect(rec.petId).toBe(A.petId)
  })

  it('AC-1: the foreign vaccination is NOT returned through the reverse include', async () => {
    const res = await request(server).get(`/api/pets/${A.petId}`)
      .set('Authorization', `Bearer ${A.adminToken}`)
    expect(res.status).toBe(200)
    const pet = res.body.data as PetDetail
    const ids = pet.vaccinations.map((v) => v.id)
    expect(ids).not.toContain(foreignVaccinationId)
    expect(ids).toContain(ownVaccinationId)
    expect(pet.vaccinations.every((v) => v.tenantId === A.tenantId)).toBe(true)
  })

  it('AC-1: the foreign medical record is NOT returned through the reverse include', async () => {
    const res = await request(server).get(`/api/pets/${A.petId}`)
      .set('Authorization', `Bearer ${A.adminToken}`)
    expect(res.status).toBe(200)
    const pet = res.body.data as PetDetail
    const ids = pet.medicalRecords.map((r) => r.id)
    expect(ids).not.toContain(foreignRecordId)
    expect(ids).toContain(ownRecordId)
    expectNoForeignTrace(res.body, B)
    expect(JSON.stringify(res.body)).not.toContain('ForeignAssessment')
    expect(JSON.stringify(res.body)).not.toContain('ForeignVax')
  })

  it('the E-2 premise is closed at the REPOSITORY level, not only at the route', async () => {
    // Calls the real repository function rather than an inlined copy of its query, so
    // this assertion tracks the shipped code if the include is ever restructured.
    const petRepo = await import('../../models/pet.repository')
    const pet = await petRepo.findPetById(A.tenantId, A.petId, true)
    expect(pet).not.toBeNull()
    const withChildren = pet as unknown as {
      vaccinations: { tenantId: number }[]
      medicalRecords: { id: number }[]
    }
    expect(withChildren.vaccinations.some((v) => v.tenantId !== A.tenantId)).toBe(false)
    expect(withChildren.medicalRecords.map((r) => r.id)).not.toContain(foreignRecordId)
  })

  it('the reverse leak does not run the other way either — B reading its own pet sees no A child', async () => {
    const strayForB = await prisma.vaccination.create({
      data: { tenantId: A.tenantId, petId: B.petId, vaccineName: `StrayFromA${A.label}`, administeredAt: new Date() },
    })
    try {
      const res = await request(server).get(`/api/pets/${B.petId}`)
        .set('Authorization', `Bearer ${B.adminToken}`)
      expect(res.status).toBe(200)
      const pet = res.body.data as PetDetail
      expect(pet.vaccinations.map((v) => v.id)).not.toContain(strayForB.id)
      expect(JSON.stringify(res.body)).not.toContain('StrayFromA')
    } finally {
      await prisma.vaccination.delete({ where: { id: strayForB.id } })
    }
  })
})
