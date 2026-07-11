// @qa-agent — Integration tests: D-1-02 Refresh Token Flow
// Covers POST /auth/refresh, POST /auth/logout, POST /platform/auth/refresh,
// replay detection, expiry, and family revocation.

import request from 'supertest'
import { Server } from 'http'
import app from '../../app'

const CLINIC_CREDS = { subdomain: 'dev-clinic', username: 'admin_a', password: 'AdminPass1!' }
const PLATFORM_EMAIL    = process.env.PLATFORM_ADMIN_EMAIL    || 'admin@anemal.app'
const PLATFORM_PASSWORD = process.env.PLATFORM_ADMIN_PASSWORD || 'PlatformAdmin1!'

let server: Server

async function clinicLogin(): Promise<{ token: string; refreshToken: string }> {
  const step1 = await request(server).post('/auth/login').send(CLINIC_CREDS)
  if (step1.body.data.requiresBranchSelection === false) return step1.body.data as { token: string; refreshToken: string }
  const { pendingToken, branches } = step1.body.data
  const step2 = await request(server).post('/auth/select-branch').send({ pendingToken, branchId: branches[0].id })
  return step2.body.data as { token: string; refreshToken: string }
}

beforeAll(async () => {
  await new Promise<void>(resolve => { server = app.listen(0, resolve) })
  server.keepAliveTimeout = 0
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
})

// ─── Clinic login returns refreshToken ───────────────────────────────────────
describe('POST /auth/login — refresh token in response', () => {
  it('returns refreshToken alongside the access token', async () => {
    const data = await clinicLogin()
    expect(typeof data.refreshToken).toBe('string')
    expect(data.refreshToken.length).toBeGreaterThan(10)
  })
})

// ─── POST /auth/refresh ───────────────────────────────────────────────────────
describe('POST /auth/refresh (clinic)', () => {
  let initialRefreshToken: string

  beforeEach(async () => {
    const data = await clinicLogin()
    initialRefreshToken = data.refreshToken
  })

  it('returns 200 with new access + refresh tokens on valid token', async () => {
    const res = await request(server)
      .post('/auth/refresh')
      .send({ refreshToken: initialRefreshToken })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(typeof res.body.data.token).toBe('string')
    expect(typeof res.body.data.refreshToken).toBe('string')
    expect(typeof res.body.data.expiresIn).toBe('number')
    expect(res.body.data.expiresIn).toBe(28800)
  })

  it('new refresh token is different from the original', async () => {
    const res = await request(server)
      .post('/auth/refresh')
      .send({ refreshToken: initialRefreshToken })

    expect(res.body.data.refreshToken).not.toBe(initialRefreshToken)
  })

  it('old refresh token is rejected after rotation (401)', async () => {
    // Use the token once to rotate it
    await request(server)
      .post('/auth/refresh')
      .send({ refreshToken: initialRefreshToken })

    // Attempt to use the old (now rotated) token
    const res = await request(server)
      .post('/auth/refresh')
      .send({ refreshToken: initialRefreshToken })

    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
  })

  it('replay attack: reusing a consumed token revokes the family and returns 401', async () => {
    // First use — rotates the token
    const firstRefresh = await request(server)
      .post('/auth/refresh')
      .send({ refreshToken: initialRefreshToken })
    const newRefreshToken = firstRefresh.body.data.refreshToken

    // Replay the original consumed token
    const replayRes = await request(server)
      .post('/auth/refresh')
      .send({ refreshToken: initialRefreshToken })
    expect(replayRes.status).toBe(401)

    // The new token from the first rotation should also be revoked (family killed)
    const newTokenRes = await request(server)
      .post('/auth/refresh')
      .send({ refreshToken: newRefreshToken })
    expect(newTokenRes.status).toBe(401)
  })

  it('returns 401 for a completely invalid (non-existent) token', async () => {
    const res = await request(server)
      .post('/auth/refresh')
      .send({ refreshToken: 'deadbeef'.repeat(8) })

    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
  })

  it('returns 400 when refreshToken field is missing', async () => {
    const res = await request(server)
      .post('/auth/refresh')
      .send({})

    expect(res.status).toBe(400)
  })

  it('error message is generic (no detail leak)', async () => {
    const res = await request(server)
      .post('/auth/refresh')
      .send({ refreshToken: 'invalid-token-value' })

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Invalid or expired token')
  })
})

// ─── POST /auth/logout ────────────────────────────────────────────────────────
describe('POST /auth/logout (clinic)', () => {
  it('returns 204 and revokes the token family', async () => {
    const { refreshToken } = await clinicLogin()

    const logoutRes = await request(server)
      .post('/auth/logout')
      .send({ refreshToken })

    expect(logoutRes.status).toBe(204)

    // Token should now be revoked
    const refreshRes = await request(server)
      .post('/auth/refresh')
      .send({ refreshToken })
    expect(refreshRes.status).toBe(401)
  })

  it('is idempotent — second logout with same token returns 204', async () => {
    const { refreshToken } = await clinicLogin()

    await request(server).post('/auth/logout').send({ refreshToken })
    const res = await request(server).post('/auth/logout').send({ refreshToken })

    expect(res.status).toBe(204)
  })

  it('returns 204 even for a non-existent token (idempotent)', async () => {
    const res = await request(server)
      .post('/auth/logout')
      .send({ refreshToken: 'nonexistent'.repeat(5) })

    expect(res.status).toBe(204)
  })

  it('returns 400 when refreshToken field is missing', async () => {
    const res = await request(server)
      .post('/auth/logout')
      .send({})

    expect(res.status).toBe(400)
  })
})

// ─── Platform login returns refreshToken ─────────────────────────────────────
describe('POST /platform/auth/login — refresh token in response', () => {
  it('returns refreshToken alongside the platform access token', async () => {
    const res = await request(server)
      .post('/platform/auth/login')
      .send({ email: PLATFORM_EMAIL, password: PLATFORM_PASSWORD })

    expect(res.status).toBe(200)
    expect(typeof res.body.data.refreshToken).toBe('string')
    expect(res.body.data.refreshToken.length).toBeGreaterThan(10)
  })
})

// ─── POST /platform/auth/refresh ─────────────────────────────────────────────
describe('POST /platform/auth/refresh', () => {
  let platformRefreshToken: string

  beforeEach(async () => {
    const res = await request(server)
      .post('/platform/auth/login')
      .send({ email: PLATFORM_EMAIL, password: PLATFORM_PASSWORD })
    platformRefreshToken = res.body.data.refreshToken
  })

  it('returns 200 with new token pair on valid platform refresh token', async () => {
    const res = await request(server)
      .post('/platform/auth/refresh')
      .send({ refreshToken: platformRefreshToken })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(typeof res.body.data.token).toBe('string')
    expect(typeof res.body.data.refreshToken).toBe('string')
    expect(res.body.data.expiresIn).toBe(28800)
    // New refresh token must be different (opaque random bytes — always new)
    expect(res.body.data.refreshToken).not.toBe(platformRefreshToken)
  })

  it('old platform refresh token is rejected after rotation', async () => {
    await request(server)
      .post('/platform/auth/refresh')
      .send({ refreshToken: platformRefreshToken })

    const res = await request(server)
      .post('/platform/auth/refresh')
      .send({ refreshToken: platformRefreshToken })

    expect(res.status).toBe(401)
  })

  it('returns 401 for a clinic refresh token used on platform endpoint', async () => {
    const { refreshToken: clinicRefreshToken } = await clinicLogin()

    const res = await request(server)
      .post('/platform/auth/refresh')
      .send({ refreshToken: clinicRefreshToken })

    expect(res.status).toBe(401)
  })

  it('returns 401 for a platform refresh token used on clinic endpoint', async () => {
    const res = await request(server)
      .post('/auth/refresh')
      .send({ refreshToken: platformRefreshToken })

    expect(res.status).toBe(401)
  })
})
