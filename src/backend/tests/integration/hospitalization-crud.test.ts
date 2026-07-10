// @qa-agent — Item 3 (inpatient create/edit/delete) integration tests.
// Covers: edit (PUT /:id) status guard, delete (DELETE /:id) care-log + status guards,
// tenant isolation on both new routes. See docs/superpowers/specs/2026-07-10-inpatient-crud-design.md.

import request from 'supertest'
import { Server } from 'http'
import app from '../../app'

let server: Server

beforeAll(async () => {
  await new Promise<void>(resolve => { server = app.listen(0, resolve) })
  server.keepAliveTimeout = 0
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
})

async function getToken(subdomain: string, username: string, password: string): Promise<string> {
  const step1 = await request(server).post('/auth/login').send({ subdomain, username, password })
  if (step1.body.data.requiresBranchSelection === false) return step1.body.data.token as string
  const { pendingToken, branches } = step1.body.data
  const step2 = await request(server).post('/auth/select-branch').send({ pendingToken, branchId: branches[0].id })
  return step2.body.data?.token
}

let adminA: string
let adminB: string
let petId: number

beforeAll(async () => {
  adminA = await getToken('dev-clinic',  'admin_a', 'AdminPass1!')
  adminB = await getToken('test-clinic', 'admin_b', 'AdminPass2!')

  const branchRes = await request(server).get('/api/branches').set('Authorization', `Bearer ${adminA}`)
  const branchId: number = branchRes.body.data[0].id
  const switchRes = await request(server)
    .post('/auth/switch-branch')
    .set('Authorization', `Bearer ${adminA}`)
    .send({ branchId })
  adminA = switchRes.body.data.token

  const uniq = `${Date.now()}`
  const ownerRes = await request(server).post('/api/owners').set('Authorization', `Bearer ${adminA}`)
    .send({ firstName: 'P4CRUD', lastName: `Tester${uniq}`, phone: `09${uniq.slice(-8)}` })
  const ownerId = ownerRes.body.data.id

  const petRes = await request(server).post('/api/pets').set('Authorization', `Bearer ${adminA}`)
    .send({ ownerId, name: 'Buddy', species: 'dog', microchipId: `MCX${uniq}` })
  petId = petRes.body.data.id
})

describe('Item 3 — Inpatient edit (PUT /api/hospitalizations/:id)', () => {
  let hospId: number

  beforeAll(async () => {
    const res = await request(server).post('/api/hospitalizations').set('Authorization', `Bearer ${adminA}`)
      .send({ petId, reason: 'Observation', cageNo: 'B-1', dailyRate: 300 })
    hospId = res.body.data.id
  })

  it('✅ edits reason/cageNo/dailyRate while admitted → 200', async () => {
    const res = await request(server).put(`/api/hospitalizations/${hospId}`).set('Authorization', `Bearer ${adminA}`)
      .send({ reason: 'Post-op recovery', cageNo: 'B-2', dailyRate: 450 })
    expect(res.status).toBe(200)
    expect(res.body.data.reason).toBe('Post-op recovery')
    expect(res.body.data.cageNo).toBe('B-2')
  })

  it('❌ rejects a petId in the edit payload (strict schema, petId not editable) → 400', async () => {
    const res = await request(server).put(`/api/hospitalizations/${hospId}`).set('Authorization', `Bearer ${adminA}`)
      .send({ reason: 'x', petId: 999999 })
    expect(res.status).toBe(400)
  })

  it('❌ rejects dailyRate above the Decimal(10,2) ceiling → 400', async () => {
    const res = await request(server).put(`/api/hospitalizations/${hospId}`).set('Authorization', `Bearer ${adminA}`)
      .send({ reason: 'x', dailyRate: 100000000 })
    expect(res.status).toBe(400)
  })

  it('❌ Tenant B cannot edit a Tenant A hospitalization → 404', async () => {
    const res = await request(server).put(`/api/hospitalizations/${hospId}`).set('Authorization', `Bearer ${adminB}`)
      .send({ reason: 'hijack' })
    expect(res.status).toBe(404)
  })

  it('❌ editing after discharge → 409', async () => {
    await request(server).put(`/api/hospitalizations/${hospId}/discharge`).set('Authorization', `Bearer ${adminA}`).send({})
    const res = await request(server).put(`/api/hospitalizations/${hospId}`).set('Authorization', `Bearer ${adminA}`)
      .send({ reason: 'too late' })
    expect(res.status).toBe(409)
  })
})

describe('Item 3 — Inpatient delete (DELETE /api/hospitalizations/:id)', () => {
  it('✅ deletes an admitted hospitalization with zero care logs → 204', async () => {
    const admit = await request(server).post('/api/hospitalizations').set('Authorization', `Bearer ${adminA}`)
      .send({ petId, reason: 'Typo admission', cageNo: 'C-1', dailyRate: 0 })
    const hospId = admit.body.data.id

    const res = await request(server).delete(`/api/hospitalizations/${hospId}`).set('Authorization', `Bearer ${adminA}`)
    expect(res.status).toBe(204)

    const getRes = await request(server).get(`/api/hospitalizations/${hospId}`).set('Authorization', `Bearer ${adminA}`)
    expect(getRes.status).toBe(404)
  })

  it('❌ cannot delete an admission with at least one care log → 409', async () => {
    const admit = await request(server).post('/api/hospitalizations').set('Authorization', `Bearer ${adminA}`)
      .send({ petId, reason: 'Has care', cageNo: 'C-2', dailyRate: 0 })
    const hospId = admit.body.data.id
    await request(server).post(`/api/hospitalizations/${hospId}/care`).set('Authorization', `Bearer ${adminA}`)
      .send({ timeSlot: '08:00', temperatureC: 38.0 })

    const res = await request(server).delete(`/api/hospitalizations/${hospId}`).set('Authorization', `Bearer ${adminA}`)
    expect(res.status).toBe(409)
  })

  it('❌ cannot delete a discharged admission → 409', async () => {
    const admit = await request(server).post('/api/hospitalizations').set('Authorization', `Bearer ${adminA}`)
      .send({ petId, reason: 'Will discharge', cageNo: 'C-3', dailyRate: 0 })
    const hospId = admit.body.data.id
    await request(server).put(`/api/hospitalizations/${hospId}/discharge`).set('Authorization', `Bearer ${adminA}`).send({})

    const res = await request(server).delete(`/api/hospitalizations/${hospId}`).set('Authorization', `Bearer ${adminA}`)
    expect(res.status).toBe(409)
  })

  it('❌ Tenant B cannot delete a Tenant A hospitalization → 404', async () => {
    const admit = await request(server).post('/api/hospitalizations').set('Authorization', `Bearer ${adminA}`)
      .send({ petId, reason: 'Cross-tenant guard', cageNo: 'C-4', dailyRate: 0 })
    const hospId = admit.body.data.id

    const res = await request(server).delete(`/api/hospitalizations/${hospId}`).set('Authorization', `Bearer ${adminB}`)
    expect(res.status).toBe(404)
  })
})

describe('Item 3 — active list carries care-log count for delete-button gating (AC3)', () => {
  it('✅ findActive includes _count.careLogs', async () => {
    const admit = await request(server).post('/api/hospitalizations').set('Authorization', `Bearer ${adminA}`)
      .send({ petId, reason: 'Count check', cageNo: 'D-1', dailyRate: 0 })
    const hospId = admit.body.data.id

    const list = await request(server).get('/api/hospitalizations/active').set('Authorization', `Bearer ${adminA}`)
    const row = (list.body.data as Array<{ id: number; _count?: { careLogs: number } }>).find(h => h.id === hospId)
    expect(row?._count?.careLogs).toBe(0)
  })
})
