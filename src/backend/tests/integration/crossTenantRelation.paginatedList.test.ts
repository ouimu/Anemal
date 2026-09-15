/**
 * XTI-13 shape 5 (arch §9) — PAGINATED LIST, `take` + `count` (AC-3, risk E-7).
 * `pet.repository.findPets` / `countPets` behind `GET /api/pets`.
 *
 * The E-7 concern: a list endpoint runs TWO queries — the page (`findMany` with
 * skip/take) and the total (`count`). Attach the tenant predicate to one and not the
 * other and the endpoint "works" while reporting a total that no amount of paging can
 * reach: the last page comes back short, the UI shows a phantom row count, and a
 * hidden row is precisely the corrupt one. ADR-0027 dialect 1 resolves this by having
 * both calls share `buildWhere`.
 *
 * AC-3 is therefore not "the corrupt row is missing" alone. It is: the request
 * succeeds, the corrupt row is absent, AND the reported total equals the number of
 * rows actually returned across the full pagination range.
 */
import { Server } from 'http'
import request from 'supertest'
import prisma from '../../config/db'
import {
  TenantFixture, cleanupTenants, expectNoForeignTrace, expectNoOwnerPiiFields,
  fixtureStamp, seedCrossTenantPair, startFixtureServer, stopFixtureServer,
} from '../helpers/crossTenantRelationFixture'

let server: Server
let A: TenantFixture
let B: TenantFixture
const ownExtraPetIds: number[] = []
const corruptPetIds: number[] = []

beforeAll(async () => {
  server = await startFixtureServer()
  const pair = await seedCrossTenantPair(server, fixtureStamp())
  A = pair.A
  B = pair.B

  // Enough of A's own pets that the list spans several pages at limit=2.
  for (let i = 0; i < 4; i++) {
    const p = await prisma.pet.create({
      data: { tenantId: A.tenantId, ownerId: A.ownerId, branchId: A.branchId, name: `AOwn${i}${A.petName}`, species: 'Dog' },
    })
    ownExtraPetIds.push(p.id)
  }
  // THE CORRUPT ROWS: A's pets pointing at B's owner. Two of them, so an off-by-one
  // in either query cannot coincidentally balance out.
  for (let i = 0; i < 2; i++) {
    const p = await prisma.pet.create({
      data: { tenantId: A.tenantId, ownerId: B.ownerId, branchId: A.branchId, name: `ACorrupt${i}${A.petName}`, species: 'Cat' },
    })
    corruptPetIds.push(p.id)
  }
}, 180_000)

afterAll(async () => {
  await cleanupTenants([A?.tenantId, B?.tenantId].filter((v): v is number => typeof v === 'number'))
  await stopFixtureServer(server)
}, 180_000)

interface PetRow { id: number; name: string }
interface ListBody { success: boolean; data: { pets: PetRow[]; total: number; page: number; limit: number } }

async function readAllPages(limit: number): Promise<{ rows: PetRow[]; reportedTotal: number; pages: number }> {
  const rows: PetRow[] = []
  let reportedTotal = -1
  let page = 1
  // Hard stop well above any legitimate page count, so a broken endpoint fails the
  // assertion rather than looping forever.
  for (; page <= 25; page++) {
    const res = await request(server).get(`/api/pets?page=${page}&limit=${limit}`)
      .set('Authorization', `Bearer ${A.adminToken}`)
    expect(res.status).toBe(200)
    const body = res.body as ListBody
    if (reportedTotal < 0) reportedTotal = body.data.total
    else expect(body.data.total).toBe(reportedTotal) // total must be stable across pages
    rows.push(...body.data.pets)
    if (body.data.pets.length < limit) break
  }
  return { rows, reportedTotal, pages: page }
}

describe('XTI-13 shape 5 — paginated list, take + count must not desync (AC-3 / E-7)', () => {
  it('the fixtures really are corrupt — precondition', async () => {
    for (const id of corruptPetIds) {
      const row = await prisma.pet.findUniqueOrThrow({
        where: { id }, select: { tenantId: true, owner: { select: { tenantId: true } } },
      })
      expect(row.tenantId).toBe(A.tenantId)
      expect(row.owner.tenantId).toBe(B.tenantId)
    }
    // and they are physically in A's table, so an unguarded count WOULD see them
    const rawCount = await prisma.pet.count({ where: { tenantId: A.tenantId, isActive: true } })
    expect(rawCount).toBe(1 + ownExtraPetIds.length + corruptPetIds.length)
  })

  it('AC-3: the request succeeds and the corrupt rows are absent from every page', async () => {
    const { rows } = await readAllPages(2)
    const ids = rows.map((r) => r.id)
    for (const id of corruptPetIds) expect(ids).not.toContain(id)
    expect(ids).toContain(A.petId)
    for (const id of ownExtraPetIds) expect(ids).toContain(id)
  })

  it('AC-3: the reported total equals the rows actually returned across the full range', async () => {
    for (const limit of [1, 2, 3, 20]) {
      const { rows, reportedTotal } = await readAllPages(limit)
      expect(rows).toHaveLength(reportedTotal)
      expect(reportedTotal).toBe(1 + ownExtraPetIds.length) // own pets only, corrupt excluded
    }
  })

  it('the last page is not short — a take/count desync shows up here first', async () => {
    const limit = 2
    const { reportedTotal } = await readAllPages(limit)
    const lastPage = Math.max(1, Math.ceil(reportedTotal / limit))
    const res = await request(server).get(`/api/pets?page=${lastPage}&limit=${limit}`)
      .set('Authorization', `Bearer ${A.adminToken}`)
    expect(res.status).toBe(200)
    const expectedOnLastPage = reportedTotal - (lastPage - 1) * limit
    expect((res.body as ListBody).data.pets).toHaveLength(expectedOnLastPage)
  })

  it('AC-1/AC-8: no foreign marker and no owner PII field anywhere in the list response', async () => {
    const res = await request(server).get('/api/pets?page=1&limit=20')
      .set('Authorization', `Bearer ${A.adminToken}`)
    expect(res.status).toBe(200)
    expectNoForeignTrace(res.body, B)
    expectNoOwnerPiiFields(res.body)
  })

  it('the owner-filtered list is guarded too — asking for B\'s ownerId returns nothing, not B\'s pets', async () => {
    const res = await request(server).get(`/api/pets?ownerId=${B.ownerId}&limit=20`)
      .set('Authorization', `Bearer ${A.adminToken}`)
    expect(res.status).toBe(200)
    const body = res.body as ListBody
    expect(body.data.pets).toHaveLength(0)
    expect(body.data.total).toBe(0)
    expectNoForeignTrace(res.body, B)
  })
})
