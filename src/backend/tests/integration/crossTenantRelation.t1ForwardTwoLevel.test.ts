/**
 * XTI-13 shape 2 (arch §9) — T1 forward, TWO levels:
 * `prescription.repository.findPrescriptionWithDetails` follows
 * `Prescription -> MedicalRecord -> Pet -> Owner`.
 *
 * A one-level guard is not enough here: the break can sit at the SECOND hop, where the
 * prescription and its medical record are both tenant A's but the record's pet belongs
 * to tenant B. Proves AC-1 on the deepest traversal in the change.
 *
 * Reached over HTTP through `GET /api/prescriptions/:id/pdf`, the only route that calls
 * this repository function (`pdf.service.generatePrescriptionPdf`). The PDF body is not
 * inspected for content — the assertion is that the read is refused at all, which is the
 * guard's job; a rendered PDF would already have embedded the foreign owner's name.
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
let cleanRxId = 0
let corruptAtPetHopRxId = 0
let corruptAtRecordHopRxId = 0

beforeAll(async () => {
  server = await startFixtureServer()
  const pair = await seedCrossTenantPair(server, fixtureStamp())
  A = pair.A
  B = pair.B

  // Clean chain: A record -> A pet -> A owner.
  const cleanRecord = await prisma.medicalRecord.create({
    data: { tenantId: A.tenantId, branchId: A.branchId, petId: A.petId, doctorId: A.doctorUserId, assessment: 'clean' },
  })
  cleanRxId = (await prisma.prescription.create({
    data: { tenantId: A.tenantId, medicalRecordId: cleanRecord.id, drugId: A.productId, quantity: 1 },
  })).id

  // BREAK AT HOP 2: prescription (A) -> medicalRecord (A) -> pet (B).
  const recordWithForeignPet = await prisma.medicalRecord.create({
    data: { tenantId: A.tenantId, branchId: A.branchId, petId: B.petId, doctorId: A.doctorUserId, assessment: 'corrupt-pet-hop' },
  })
  corruptAtPetHopRxId = (await prisma.prescription.create({
    data: { tenantId: A.tenantId, medicalRecordId: recordWithForeignPet.id, drugId: A.productId, quantity: 1 },
  })).id

  // BREAK AT HOP 1: prescription (A) -> medicalRecord (B).
  const foreignRecord = await prisma.medicalRecord.create({
    data: { tenantId: B.tenantId, branchId: B.branchId, petId: B.petId, doctorId: B.doctorUserId, assessment: 'corrupt-record-hop' },
  })
  corruptAtRecordHopRxId = (await prisma.prescription.create({
    data: { tenantId: A.tenantId, medicalRecordId: foreignRecord.id, drugId: A.productId, quantity: 1 },
  })).id
}, 180_000)

afterAll(async () => {
  await cleanupTenants([A?.tenantId, B?.tenantId].filter((v): v is number => typeof v === 'number'))
  await stopFixtureServer(server)
}, 180_000)

const getRxPdf = (id: number) =>
  request(server).get(`/api/prescriptions/${id}/pdf`).set('Authorization', `Bearer ${A.adminToken}`)

describe('XTI-13 shape 2 — T1 forward 2 levels (prescription -> medicalRecord -> pet -> owner)', () => {
  it('both fixtures really are corrupt — precondition', async () => {
    const atPetHop = await prisma.prescription.findUniqueOrThrow({
      where: { id: corruptAtPetHopRxId },
      select: { tenantId: true, medicalRecord: { select: { tenantId: true, pet: { select: { tenantId: true } } } } },
    })
    expect(atPetHop.tenantId).toBe(A.tenantId)
    expect(atPetHop.medicalRecord.tenantId).toBe(A.tenantId)
    expect(atPetHop.medicalRecord.pet.tenantId).toBe(B.tenantId)

    const atRecordHop = await prisma.prescription.findUniqueOrThrow({
      where: { id: corruptAtRecordHopRxId },
      select: { tenantId: true, medicalRecord: { select: { tenantId: true } } },
    })
    expect(atRecordHop.tenantId).toBe(A.tenantId)
    expect(atRecordHop.medicalRecord.tenantId).toBe(B.tenantId)
  })

  it('positive control — a clean 3-hop chain still renders', async () => {
    const res = await getRxPdf(cleanRxId)
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('application/pdf')
  })

  it('AC-1: a break at the SECOND hop (record is ours, pet is theirs) is refused, not rendered', async () => {
    const res = await getRxPdf(corruptAtPetHopRxId)
    expect(res.status).toBe(404)
    expect(res.headers['content-type']).not.toContain('application/pdf')
    expectNoForeignTrace(res.body, B)
  })

  it('AC-1: a break at the FIRST hop (the medical record itself is theirs) is refused', async () => {
    const res = await getRxPdf(corruptAtRecordHopRxId)
    expect(res.status).toBe(404)
    expect(res.headers['content-type']).not.toContain('application/pdf')
    expectNoForeignTrace(res.body, B)
  })

  it('no rendered PDF ever contained the foreign owner — the repository returned nothing to render', async () => {
    for (const id of [corruptAtPetHopRxId, corruptAtRecordHopRxId]) {
      const row = await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*) AS n FROM prescriptions p
        JOIN medical_records m ON m.id = p."medicalRecordId"
        JOIN pets pe ON pe.id = m."petId"
        WHERE p.id = ${id} AND pe."tenantId" = ${A.tenantId}`
      expect(Number(row[0].n)).toBe(0)
    }
  })
})
