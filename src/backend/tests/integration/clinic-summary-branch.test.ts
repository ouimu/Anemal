import request from 'supertest'
import { Server } from 'http'
import app from '../../app'

const TENANT_A = { subdomain: 'dev-clinic', username: 'admin_a', password: 'AdminPass1!' }

let server: Server
let token: string

beforeAll(async () => {
  await new Promise<void>(resolve => { server = app.listen(0, resolve) })
  server.keepAliveTimeout = 0

  const step1 = await request(server).post('/auth/login').send(TENANT_A)
  if (step1.body.data.requiresBranchSelection === false) {
    // Admin bypass: full JWT issued immediately (branchId: null = all-branches scope).
    token = step1.body.data.token as string
    return
  }
  const { pendingToken, branches } = step1.body.data
  const step2 = await request(server).post('/auth/select-branch').send({ pendingToken, branchId: branches[0].id })
  token = step2.body.data.token
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
})

describe('GET /clinic/usage branch-scoping', () => {
  it('returns 200 with appointmentsToday scoped to branch', async () => {
    const res = await request(server)
      .get('/clinic/usage')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(typeof res.body.data.appointmentsToday).toBe('number')
    expect(typeof res.body.data.vaccinationsDueSoon).toBe('number')
  })
})
