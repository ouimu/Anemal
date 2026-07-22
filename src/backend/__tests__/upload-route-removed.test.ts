// src/backend/__tests__/upload-route-removed.test.ts
import request from 'supertest'
import { Server } from 'http'
import app from '../app'

let server: Server

beforeAll(async () => {
  await new Promise<void>((resolve) => { server = app.listen(0, resolve) })
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

describe('POST /api/upload/presign — retired (ADR-0022)', () => {
  test('returns 404 NOT_FOUND — the S3 presign route no longer exists', async () => {
    const res = await request(server).post('/api/upload/presign').send({})
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('NOT_FOUND')
  })
})
