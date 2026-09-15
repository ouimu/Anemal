/**
 * XTI-13 shape 1 (arch §9) — T1 forward, ONE level: `pet.repository.findPetById`
 * follows `Pet -> Owner`, the highest-severity traversal in the change (Owner carries
 * idCardNumber / address / lineId).
 *
 * Proves AC-1 (no field of the foreign row appears), AC-2 (single-resource read is a
 * flat 404, not 403 and not 200-with-partial) and AC-8 (the former `owner: true`
 * endpoints no longer ship owner PII for ANY owner, the caller's own included).
 *
 * The conformance analyzer (XTI-1) only proves the guard is SPELLED correctly. This
 * suite proves it WORKS: it fabricates the corrupt row the schema permits but no app
 * write path can create, then reads it back over real HTTP.
 */
import { Server } from 'http'
import request from 'supertest'
import prisma from '../../config/db'
import {
  TenantFixture, cleanupTenants, expectNoForeignTrace, expectNoOwnerPiiFields,
  fixtureStamp, seedCrossTenantPair, startFixtureServer, stopFixtureServer,
} from '../helpers/crossTenantRelationFixture'

let server: Server
let A: TenantFixture // READER — the caller
let B: TenantFixture // FOREIGN — must never surface
let corruptPetId = 0

beforeAll(async () => {
  server = await startFixtureServer()
  const pair = await seedCrossTenantPair(server, fixtureStamp())
  A = pair.A
  B = pair.B

  // THE CORRUPT ROW: a pet owned by tenant A whose ownerId points at tenant B's owner.
  // `pets.owner_id` has no composite FK on tenant_id, so Postgres accepts this; only
  // the repository predicate stands between it and a PII leak.
  const corrupt = await prisma.pet.create({
    data: { tenantId: A.tenantId, ownerId: B.ownerId, branchId: A.branchId, name: `Corrupt${A.label}`, species: 'Cat' },
  })
  corruptPetId = corrupt.id
}, 180_000)

afterAll(async () => {
  await cleanupTenants([A?.tenantId, B?.tenantId].filter((v): v is number => typeof v === 'number'))
  await stopFixtureServer(server)
}, 180_000)

const getPet = (id: number, token: string) =>
  request(server).get(`/api/pets/${id}`).set('Authorization', `Bearer ${token}`)

describe('XTI-13 shape 1 — T1 forward 1 level (GET /api/pets/:id -> owner)', () => {
  it('the fixture really is corrupt — precondition, so a passing test cannot be vacuous', async () => {
    const row = await prisma.pet.findUniqueOrThrow({
      where: { id: corruptPetId }, select: { tenantId: true, owner: { select: { tenantId: true } } },
    })
    expect(row.tenantId).toBe(A.tenantId)
    expect(row.owner.tenantId).toBe(B.tenantId)
    expect(row.owner.tenantId).not.toBe(row.tenantId)
  })

  it('AC-2: the single-resource read of a corrupt row is 404, and the body names no other tenant', async () => {
    const res = await getPet(corruptPetId, A.adminToken)
    expect(res.status).toBe(404)
    expect(res.status).not.toBe(403)
    expect(res.status).not.toBe(200)
    expectNoForeignTrace(res.body, B)
    // The 404 body must not confirm that the row exists elsewhere.
    expect(JSON.stringify(res.body)).not.toContain(String(B.tenantId))
  })

  it('AC-1: no field of the foreign owner reaches the caller through the corrupt row', async () => {
    const res = await getPet(corruptPetId, A.adminToken)
    expectNoForeignTrace(res.body, B)
    expect(JSON.stringify(res.body)).not.toContain(B.ownerAddress)
    expect(JSON.stringify(res.body)).not.toContain(B.ownerIdCard)
    expect(JSON.stringify(res.body)).not.toContain(B.ownerLineId)
  })

  it('the guard is not a blanket 404 — the caller still reads its OWN pet (positive control)', async () => {
    const res = await getPet(A.petId, A.adminToken)
    expect(res.status).toBe(200)
    expect(res.body.data.id).toBe(A.petId)
    expect(res.body.data.owner.id).toBe(A.ownerId)
    expect(res.body.data.owner.firstName).toBe(A.ownerFirstName)
  })

  it('AC-8: the response carries no idCardNumber / address / lineId — not even for the caller\'s OWN owner', async () => {
    const res = await getPet(A.petId, A.adminToken)
    expect(res.status).toBe(200)
    expectNoOwnerPiiFields(res.body)
    // and the frozen ownerSummarySelect contract (arch §4.2) is exactly what did ship
    expect(Object.keys(res.body.data.owner).sort()).toEqual(['firstName', 'id', 'lastName', 'phone'])
  })

  it('the foreign tenant cannot read the corrupt row either — it is not "theirs" just because their owner is on it', async () => {
    const res = await getPet(corruptPetId, B.adminToken)
    expect(res.status).toBe(404)
  })
})
