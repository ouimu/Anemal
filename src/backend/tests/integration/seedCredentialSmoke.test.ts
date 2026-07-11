/**
 * BUG-005 regression: every credential documented in HOW-TO-RUN.md must be able to
 * complete a full two-step login (credentials -> branch select -> JWT), so the
 * documented walkthrough never silently drifts from the live seeded DB again.
 */
import request from 'supertest'
import { Server } from 'http'
import app from '../../app'

let server: Server

beforeAll(async () => {
  await new Promise<void>(resolve => { server = app.listen(0, resolve) })
  server.keepAliveTimeout = 0
})

afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()))
})

// Sourced from HOW-TO-RUN.md + prisma/seed.ts seed data — keep in sync with both.
const SEEDED_CLINIC_CREDENTIALS: Array<{ subdomain: string; username: string; password: string }> = [
  { subdomain: 'dev-clinic',  username: 'admin_a',  password: 'AdminPass1!' },
  { subdomain: 'dev-clinic',  username: 'doctor_a', password: 'DoctorPass1!' },
  { subdomain: 'dev-clinic',  username: 'staff_a',  password: 'StaffPass1!' },
  { subdomain: 'test-clinic', username: 'admin_b',  password: 'AdminPass2!' },
  { subdomain: 'test-clinic', username: 'doctor_b', password: 'DoctorPass2!' },
  { subdomain: 'test-clinic', username: 'staff_b',  password: 'StaffPass2!' },
]

describe('seeded credential smoke test — every HOW-TO-RUN credential logs in', () => {
  it.each(SEEDED_CLINIC_CREDENTIALS)(
    'completes two-step login for $username @ $subdomain',
    async ({ subdomain, username, password }) => {
      const step1 = await request(server)
        .post('/auth/login')
        .send({ subdomain, username, password })
      expect(step1.status).toBe(200)

      if (step1.body.data.requiresBranchSelection === false) {
        expect(typeof step1.body.data.token).toBe('string')
        return
      }

      const { pendingToken, branches } = step1.body.data
      expect(branches.length).toBeGreaterThan(0)
      const step2 = await request(server)
        .post('/auth/select-branch')
        .send({ pendingToken, branchId: branches[0].id })
      expect(step2.status).toBe(200)
      expect(typeof step2.body.data.token).toBe('string')
    },
  )
})

describe('seeded credential smoke test — platform admin login', () => {
  it('completes single-step platform login for the seeded platform admin', async () => {
    const email    = process.env.PLATFORM_ADMIN_EMAIL    || 'admin@anemal.app'
    const password = process.env.PLATFORM_ADMIN_PASSWORD || 'PlatformAdmin1!'

    const res = await request(server)
      .post('/platform/auth/login')
      .send({ email, password })

    expect(res.status).toBe(200)
    expect(typeof res.body.data.token).toBe('string')
    // No branch selection on the platform plane (ADR-0005 D1) — this is a single-step login.
    expect(res.body.data.requiresBranchSelection).toBeUndefined()
  })
})
