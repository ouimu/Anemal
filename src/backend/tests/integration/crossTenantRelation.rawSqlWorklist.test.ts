/**
 * XTI-13 shape 4 (arch §9) — RAW SQL, BOTH VARIANTS:
 * `vaccination.repository.findDueSoonWorklist`, driven by
 * `GET /api/vaccinations/due-worklist`.
 *
 * This function is not Prisma — it is two hand-written `$queryRaw` template literals,
 * chosen by whether the caller's token carries a branchId. Prisma's relation predicates
 * do nothing here; the guard is an `AND p."tenantId" = ${tenantId}` in each JOIN's ON
 * clause. BOTH branches must be exercised: a guard added to only one of them passes any
 * test that happens to use the other token.
 *
 * Branch-pinned token  -> the `if (branchId)` variant (CTE joins pets, then joins again)
 * All-branches token   -> the `branchId === null` variant (CTE does NOT join pets)
 *
 * This is also the function BA F-1 / XTI-4 was about: PR #73's comment claimed it was
 * tenant-guarded when it was not. AC-10's comment check lives in the standing-guards
 * suite; this file proves the CODE.
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
let cleanVaccinationId = 0
let corruptVaccinationId = 0

const inDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d }

beforeAll(async () => {
  server = await startFixtureServer()
  const pair = await seedCrossTenantPair(server, fixtureStamp())
  A = pair.A
  B = pair.B

  // Clean row: A's vaccination on A's pet, due inside the 7-day worklist cutoff.
  cleanVaccinationId = (await prisma.vaccination.create({
    data: {
      tenantId: A.tenantId, petId: A.petId, vaccineName: 'CleanRabies',
      administeredAt: new Date(), nextDueAt: inDays(3),
    },
  })).id

  // THE CORRUPT ROW: A's vaccination whose petId points at B's pet. Pre-fix, the
  // worklist's unguarded `JOIN pets ... JOIN owners` rendered B's pet name and the
  // owner's full name + phone straight into A's worklist.
  corruptVaccinationId = (await prisma.vaccination.create({
    data: {
      tenantId: A.tenantId, petId: B.petId, vaccineName: 'CorruptRabies',
      administeredAt: new Date(), nextDueAt: inDays(2),
    },
  })).id
}, 180_000)

afterAll(async () => {
  await cleanupTenants([A?.tenantId, B?.tenantId].filter((v): v is number => typeof v === 'number'))
  await stopFixtureServer(server)
}, 180_000)

const worklist = (token: string) =>
  request(server).get('/api/vaccinations/due-worklist').set('Authorization', `Bearer ${token}`)

interface WorklistRow { petId: number; petName: string; ownerName: string; ownerPhone: string | null; vaccineName: string }

describe('XTI-13 shape 4 — raw SQL worklist, both branch variants', () => {
  it('the fixture really is corrupt, and the two tokens really do take different code paths', async () => {
    const row = await prisma.vaccination.findUniqueOrThrow({
      where: { id: corruptVaccinationId }, select: { tenantId: true, pet: { select: { tenantId: true } } },
    })
    expect(row.tenantId).toBe(A.tenantId)
    expect(row.pet.tenantId).toBe(B.tenantId)
    // If both tokens were branch-pinned, only one SQL variant would ever run and half
    // this suite would be decorative — assert the difference instead of assuming it.
    expect(A.adminToken).not.toBe(A.adminAllBranchToken)
  })

  it('branch-pinned variant: the corrupt row is absent and no foreign PII is rendered', async () => {
    const res = await worklist(A.adminToken)
    expect(res.status).toBe(200)
    const rows = res.body.data as WorklistRow[]
    expect(rows.some((r) => r.vaccineName === 'CorruptRabies')).toBe(false)
    expect(rows.some((r) => r.petId === B.petId)).toBe(false)
    expectNoForeignTrace(res.body, B)
  })

  it('all-branches variant: the corrupt row is absent and no foreign PII is rendered', async () => {
    const res = await worklist(A.adminAllBranchToken)
    expect(res.status).toBe(200)
    const rows = res.body.data as WorklistRow[]
    expect(rows.some((r) => r.vaccineName === 'CorruptRabies')).toBe(false)
    expect(rows.some((r) => r.petId === B.petId)).toBe(false)
    expectNoForeignTrace(res.body, B)
  })

  it('positive control — both variants still return the caller\'s own due vaccination', async () => {
    for (const token of [A.adminToken, A.adminAllBranchToken]) {
      const res = await worklist(token)
      expect(res.status).toBe(200)
      const rows = res.body.data as WorklistRow[]
      const own = rows.find((r) => r.vaccineName === 'CleanRabies')
      expect(own).toBeDefined()
      expect(own!.petId).toBe(A.petId)
      expect(own!.petName).toBe(A.petName)
    }
    expect(cleanVaccinationId).toBeGreaterThan(0)
  })

  it('the foreign tenant\'s own worklist is unaffected by the corrupt row planted in A', async () => {
    const res = await worklist(B.adminToken)
    expect(res.status).toBe(200)
    const rows = res.body.data as WorklistRow[]
    expect(rows.some((r) => r.vaccineName === 'CorruptRabies')).toBe(false)
  })

  it('the non-raw sibling read (GET /api/vaccinations/due-soon) is guarded too', async () => {
    // findDueSoon is the Prisma twin of the same worklist; PR #73 hotfixed it with a
    // post-filter that XTI-7 replaced with a root-`where` predicate. Same corrupt row,
    // different dialect — worth one assertion so the replacement is not a regression.
    const res = await request(server).get('/api/vaccinations/due-soon')
      .set('Authorization', `Bearer ${A.adminToken}`)
    expect(res.status).toBe(200)
    const ids = (res.body.data as { id: number }[]).map((r) => r.id)
    expect(ids).not.toContain(corruptVaccinationId)
    expect(ids).toContain(cleanVaccinationId)
    expectNoForeignTrace(res.body, B)
  })
})
