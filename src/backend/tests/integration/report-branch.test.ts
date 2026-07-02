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
  if (step1.body.data.requiresBranchSelection === false) return step1.body.data.token as string
  const { pendingToken, branches } = step1.body.data
  const step2 = await request(server).post('/auth/select-branch').send({ pendingToken, branchId: branches[0].id })
  token = step2.body.data.token
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
})

describe('GET /api/reports/snapshot branch-scoped revenue', () => {
  it('returns revenueToday as a number', async () => {
    const res = await request(server)
      .get('/api/reports/snapshot')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(typeof res.body.data.revenueToday).toBe('number')
  })
})
