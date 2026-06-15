import http from 'http'
import type { Express } from 'express'


let signToken: (p: { userId: number; tenantId: number; plane: 'clinic' | 'platform'; permSetVersion: number; role: string }) => string
let server: http.Server
let baseUrl: string

beforeAll(async () => {
  jest.resetModules()

  jest.doMock('@prisma/client', () => ({
    PrismaClient: class MockPrisma {
      $connect    = () => Promise.resolve()
      $disconnect = () => Promise.resolve()
      appointment    = { count: () => Promise.resolve(0) }
      pet            = { count: () => Promise.resolve(0) }
      invoice        = { count: () => Promise.resolve(0) }
      user           = { count: () => Promise.resolve(0) }
      owner          = { count: () => Promise.resolve(0) }
      tenant         = { findUnique: () => Promise.resolve(null) }
      tenantSettings = { findUnique: () => Promise.resolve(null) }
      // Phase 8 (T-5B-01): resolvePermissions queries userRole; return full admin permission set
      userRole = {
        findMany: () => Promise.resolve([{
          role: {
            permissions: [
              { permissionCode: 'clinic.profile.view' },
            ],
          },
        }]),
      }
      clinicRole = { findMany: () => Promise.resolve([]) }
    },
  }))

  jest.doMock('../services/usage.service', () => ({
    getClinicSummary: jest.fn().mockResolvedValue({
      appointmentsToday:     3,
      appointmentsThisMonth: 12,
      totalPets:             50,
      invoicesThisMonth:     8,
    }),
    getClinicUsage: jest.fn(),
  }))

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const app: Express = require('../app').default
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  signToken = require('../config/jwt').signToken

  await new Promise<void>(resolve => {
    server = (app as any).listen(0, resolve)
  })
  const addr = server.address() as { port: number }
  baseUrl = `http://127.0.0.1:${addr.port}`
})

afterAll(() => new Promise<void>(resolve => server.close(() => resolve())))

const token = (role: 'admin' | 'doctor' | 'staff') =>
  signToken({ userId: 1, tenantId: 1, plane: 'clinic', permSetVersion: 1, role })

async function get(path: string, authToken?: string) {
  const headers: Record<string, string> = {}
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`
  const res = await fetch(`${baseUrl}${path}`, { headers })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = await res.json() as any
  return { status: res.status, body }
}

describe('GET /clinic/usage', () => {
  it('returns 200 for doctor', async () => {
    const { status, body } = await get('/clinic/usage', token('doctor'))
    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toMatchObject({
      appointmentsToday:     3,
      appointmentsThisMonth: 12,
      totalPets:             50,
      invoicesThisMonth:     8,
    })
  })

  it('returns 200 for staff', async () => {
    const { status, body } = await get('/clinic/usage', token('staff'))
    expect(status).toBe(200)
    expect(body.success).toBe(true)
  })

  it('returns 200 for admin', async () => {
    const { status } = await get('/clinic/usage', token('admin'))
    expect(status).toBe(200)
  })

  it('returns 401 with no token', async () => {
    const { status } = await get('/clinic/usage')
    expect(status).toBe(401)
  })

  it('returns 401 with an invalid token', async () => {
    const { status } = await get('/clinic/usage', 'not.a.real.token')
    expect(status).toBe(401)
  })
})
