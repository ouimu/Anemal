// @qa-agent — CRITICAL: Cross-tenant isolation tests
// These tests verify that Tenant A users CANNOT access Tenant B data
// This is the most important test suite in the project

import request from 'supertest'
import { Server } from 'http'
import app from '../../src/app'

let server: Server

beforeAll(async () => {
  await new Promise<void>(resolve => { server = app.listen(0, resolve) })
  server.keepAliveTimeout = 0
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
})

async function getToken(subdomain: string, email: string, password: string): Promise<string> {
  const res = await request(server).post('/auth/login').send({ subdomain, email, password })
  return res.body.data?.token
}

describe('Multi-Tenant Isolation — User Management', () => {
  let tokenA: string
  let tokenB: string
  let userIdFromA: number

  beforeAll(async () => {
    tokenA = await getToken('dev-clinic',  'admin@dev-clinic.com',  'AdminPass1!')
    tokenB = await getToken('test-clinic', 'admin@test-clinic.com', 'AdminPass2!')
  })

  it('✅ Tenant A admin can list own users', async () => {
    const res = await request(server)
      .get('/users')
      .set('Authorization', `Bearer ${tokenA}`)
    expect(res.status).toBe(200)
    const users = res.body.data as { tenantId: number }[]
    // All returned users must belong to Tenant A
    users.forEach((u) => expect(u.tenantId).toBe(res.body.data[0].tenantId))
    userIdFromA = res.body.data[0].id
  })

  it('✅ Tenant B admin can list own users', async () => {
    const res = await request(server)
      .get('/users')
      .set('Authorization', `Bearer ${tokenB}`)
    expect(res.status).toBe(200)
  })

  it('❌ Tenant B token cannot access users from Tenant A by ID', async () => {
    // userIdFromA exists in Tenant A; Tenant B token should get 404
    const res = await request(server)
      .get(`/users/${userIdFromA}`)
      .set('Authorization', `Bearer ${tokenB}`)
    expect(res.status).toBe(404)
  })

  it('❌ Request with no token returns 401', async () => {
    const res = await request(server).get('/users')
    expect(res.status).toBe(401)
  })

  it('❌ Staff token cannot access admin-only /users route → 403', async () => {
    const staffToken = await getToken('dev-clinic', 'staff@dev-clinic.com', 'StaffPass1!')
    const res = await request(server)
      .get('/users')
      .set('Authorization', `Bearer ${staffToken}`)
    expect(res.status).toBe(403)
  })

  it('❌ Tenant B cannot create user in Tenant A', async () => {
    // Even if Tenant B guesses a valid tenantId, the token gates them to their own tenant
    const res = await request(server)
      .post('/users')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: 'Intruder', email: 'intruder@dev-clinic.com', password: 'Pass1234!', role: 'staff' })
    // User would be created in Tenant B, not Tenant A — verify by listing Tenant A users
    if (res.status === 201) {
      const listA = await request(server).get('/users').set('Authorization', `Bearer ${tokenA}`)
      const intruder = (listA.body.data as { email: string }[]).find(u => u.email === 'intruder@dev-clinic.com')
      expect(intruder).toBeUndefined()
    }
  })
})
