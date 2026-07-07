/**
 * Test Suite: T-5F PRE-3 — GET /platform/audit (platform-plane audit log reader)
 * @qa-agent | Protocol: qa-protocols.md §2 (RBAC + plane isolation on every protected endpoint)
 *
 * Strategy: fully-mocked Prisma (matching clinicUsage.test.ts pattern) so the
 * endpoint is exercised in isolation, without a live DB. The mock captures the
 * args passed to `platformAuditLog.findMany` / `.count` so we can assert:
 *   - the `details` column is never SELECTed (PII leak guard)
 *   - filters (from/to/action/tenantId) are translated into the correct `where`
 *   - `to` is extended to end-of-day (23:59:59.999)
 *   - pagination (skip/take) is computed correctly
 *
 * Acceptance criteria covered (T-5F PRE-3):
 *   AC1 platform JWT → 200 + { success, data:{ items,total,page,limit } }
 *   AC2 items contain id/action/targetTenantId/performedByPlatformUserId/ipAddress/createdAt; NO details
 *   AC3 clinic JWT → 403 (plane mismatch)
 *   AC4 unauthenticated → 401
 *   AC5 pagination ?page=2&limit=10
 *   AC6 filters from/to/action/tenantId (individual + combined)
 *   AC7 ?to=YYYY-MM-DD extended to end-of-day
 *   AC8 invalid query params handled gracefully (no 500 / no crash)
 *
 * Run: npm test -- --testPathPattern=platformAudit
 */
import http from 'http'
import type { Express } from 'express'

// Captured args from the most recent repository DB calls (set inside the mock).
let lastFindManyArgs: any
let lastCountArgs: any

// A representative row as it comes back from Prisma WITH the SELECT applied
// (i.e. details already excluded). Includes the performedBy / targetTenant
// join fields that the repository SELECT now requests.
const SAMPLE_ROW = {
  id: 101,
  action: 'tenant.suspend',
  targetTenantId: 7,
  performedByPlatformUserId: 3,
  ipAddress: '203.0.113.9',
  createdAt: new Date('2026-06-10T08:30:00.000Z'),
  performedBy: { name: 'Admin User' },
  targetTenant: { name: 'Acme Clinic' },
}

let signToken: (p: {
  userId: number
  tenantId: number
  plane: 'clinic' | 'platform'
  permSetVersion: number
  role: string
}) => string
let signPlatformToken: (p: { platformUserId: number; plane: 'platform'; role: string }) => string

let server: http.Server
let baseUrl: string

beforeAll(async () => {
  jest.resetModules()

  jest.doMock('@prisma/client', () => ({
    PrismaClient: class MockPrisma {
      $connect = () => Promise.resolve()
      $disconnect = () => Promise.resolve()
      // authMiddleware only hits tenant.findUnique for clinic-plane tokens with a tenantId.
      tenant = { findUnique: () => Promise.resolve({ isActive: true }) }
      platformAuditLog = {
        findMany: (args: any) => {
          lastFindManyArgs = args
          return Promise.resolve([SAMPLE_ROW])
        },
        count: (args: any) => {
          lastCountArgs = args
          return Promise.resolve(1)
        },
      }
    },
  }))

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const app: Express = require('../app').default
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const jwtMod = require('../config/jwt')
  signToken = jwtMod.signToken
  signPlatformToken = jwtMod.signPlatformToken

  await new Promise<void>(resolve => {
    server = (app as any).listen(0, resolve)
  })
  const addr = server.address() as { port: number }
  baseUrl = `http://127.0.0.1:${addr.port}`
})

afterAll(() => new Promise<void>(resolve => server.close(() => resolve())))

beforeEach(() => {
  lastFindManyArgs = undefined
  lastCountArgs = undefined
})

// Role must match the PlatformRole enum value used in requirePlatformPermission resolution.
const platformToken = () =>
  signPlatformToken({ platformUserId: 3, plane: 'platform', role: 'platform_super_admin' })

const clinicToken = () =>
  signToken({ userId: 1, tenantId: 1, plane: 'clinic', permSetVersion: 1, role: 'admin' })

async function get(path: string, authToken?: string) {
  const headers: Record<string, string> = {}
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`
  const res = await fetch(`${baseUrl}${path}`, { headers })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = (await res.json().catch(() => null)) as any
  return { status: res.status, body }
}

// ═══════════════════════════════════════════════════════════════════════════
// AC1 — happy path: platform JWT → 200 + envelope
// ═══════════════════════════════════════════════════════════════════════════
describe('GET /platform/audit — success envelope (AC1)', () => {
  it('pa-01: platform JWT → 200 with { success, data:{ items,total,page,limit } }', async () => {
    const { status, body } = await get('/platform/audit', platformToken())
    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data.items)).toBe(true)
    expect(body.data.total).toBe(1)
    expect(body.data.page).toBe(1)
    expect(body.data.limit).toBe(50)
    expect(body.data.items).toHaveLength(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// AC2 — PII guard: items expose the safe columns and NEVER `details`
// ═══════════════════════════════════════════════════════════════════════════
describe('GET /platform/audit — PII / column shape (AC2)', () => {
  it('pa-02: item contains the normalized safe fields', async () => {
    const { body } = await get('/platform/audit', platformToken())
    const item = body.data.items[0]
    // Repository normalizes raw Prisma row to frontend-friendly shape
    expect(item).toEqual({
      id: 101,
      action: 'tenant.suspend',
      actorId: 3,
      actorName: 'Admin User',
      tenantId: 7,
      tenantName: 'Acme Clinic',
      details: {},
      ipAddress: '203.0.113.9',
      // createdAt is serialised to an ISO string over the wire
      createdAt: '2026-06-10T08:30:00.000Z',
    })
  })

  it('pa-03: `details` field is present but safe (always empty object, never raw DB PII)', async () => {
    const { body } = await get('/platform/audit', platformToken())
    // Repository returns details: {} — a safe empty object, never the raw DB blob
    expect(body.data.items[0]).toHaveProperty('details')
    expect(body.data.items[0].details).toEqual({})
  })

  it('pa-04: repository SELECT excludes raw `details` DB column (PII leak guard)', async () => {
    await get('/platform/audit', platformToken())
    // The select object passed to Prisma must not include `details: true`.
    expect(lastFindManyArgs.select).toBeDefined()
    expect(lastFindManyArgs.select).not.toHaveProperty('details')
    // SELECT includes the 6 raw columns + performedBy and targetTenant joins for normalization
    const keys = Object.keys(lastFindManyArgs.select).sort()
    expect(keys).toContain('id')
    expect(keys).toContain('action')
    expect(keys).toContain('targetTenantId')
    expect(keys).toContain('performedByPlatformUserId')
    expect(keys).toContain('ipAddress')
    expect(keys).toContain('createdAt')
    expect(keys).toContain('performedBy')
    expect(keys).toContain('targetTenant')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// AC3/AC4 — plane isolation & authentication
// ═══════════════════════════════════════════════════════════════════════════
describe('GET /platform/audit — auth & plane isolation (AC3/AC4)', () => {
  it('pa-05: clinic-plane JWT → 403 (plane mismatch)', async () => {
    const { status, body } = await get('/platform/audit', clinicToken())
    expect(status).toBe(403)
    expect(body.success).toBe(false)
  })

  it('pa-06: no token → 401', async () => {
    const { status } = await get('/platform/audit')
    expect(status).toBe(401)
  })

  it('pa-07: malformed/invalid token → 401', async () => {
    const { status } = await get('/platform/audit', 'not.a.real.token')
    expect(status).toBe(401)
  })

  it('pa-08: clinic token must NOT reach the repository (no DB query fired)', async () => {
    await get('/platform/audit', clinicToken())
    expect(lastFindManyArgs).toBeUndefined()
    expect(lastCountArgs).toBeUndefined()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// AC5 — pagination
// ═══════════════════════════════════════════════════════════════════════════
describe('GET /platform/audit — pagination (AC5)', () => {
  it('pa-09: ?page=2&limit=10 echoes page/limit and computes skip/take', async () => {
    const { status, body } = await get('/platform/audit?page=2&limit=10', platformToken())
    expect(status).toBe(200)
    expect(body.data.page).toBe(2)
    expect(body.data.limit).toBe(10)
    // skip = (page-1)*limit = 10, take = limit = 10
    expect(lastFindManyArgs.skip).toBe(10)
    expect(lastFindManyArgs.take).toBe(10)
  })

  it('pa-10: defaults to page=1, limit=50, skip=0', async () => {
    await get('/platform/audit', platformToken())
    expect(lastFindManyArgs.skip).toBe(0)
    expect(lastFindManyArgs.take).toBe(50)
  })

  it('pa-11: orders by createdAt desc (most recent first)', async () => {
    await get('/platform/audit', platformToken())
    expect(lastFindManyArgs.orderBy).toEqual({ createdAt: 'desc' })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// AC6 — filters (individual + combined). Verified at the `where` clause.
// ═══════════════════════════════════════════════════════════════════════════
describe('GET /platform/audit — filters (AC6)', () => {
  it('pa-12: ?action= filters on action', async () => {
    await get('/platform/audit?action=tenant.suspend', platformToken())
    expect(lastFindManyArgs.where.action).toBe('tenant.suspend')
  })

  it('pa-13: ?tenantId= filters on targetTenantId', async () => {
    await get('/platform/audit?tenantId=7', platformToken())
    expect(lastFindManyArgs.where.targetTenantId).toBe(7)
  })

  it('pa-14: ?from= sets createdAt.gte', async () => {
    await get('/platform/audit?from=2026-06-01', platformToken())
    expect(lastFindManyArgs.where.createdAt.gte).toBeInstanceOf(Date)
    expect(lastFindManyArgs.where.createdAt.gte.toISOString()).toBe(
      new Date('2026-06-01').toISOString(),
    )
  })

  it('pa-15: combined from+to+action+tenantId all applied to where + count', async () => {
    await get(
      '/platform/audit?from=2026-06-01&to=2026-06-17&action=tenant.suspend&tenantId=7',
      platformToken(),
    )
    const where = lastFindManyArgs.where
    expect(where.action).toBe('tenant.suspend')
    expect(where.targetTenantId).toBe(7)
    expect(where.createdAt.gte).toBeInstanceOf(Date)
    expect(where.createdAt.lte).toBeInstanceOf(Date)
    // count() must receive the identical where (so total reflects the filter)
    expect(lastCountArgs.where).toEqual(where)
  })

  it('pa-16: no filters → empty where (no createdAt/action/targetTenantId keys)', async () => {
    await get('/platform/audit', platformToken())
    expect(lastFindManyArgs.where).toEqual({})
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// AC7 — `to` extended to end-of-day
// ═══════════════════════════════════════════════════════════════════════════
describe('GET /platform/audit — end-of-day `to` (AC7)', () => {
  it('pa-17: ?to=2026-06-17 is extended to 23:59:59.999 UTC (ADR-0003 D6)', async () => {
    await get('/platform/audit?to=2026-06-17', platformToken())
    const lte: Date = lastFindManyArgs.where.createdAt.lte
    expect(lte).toBeInstanceOf(Date)
    // BUG-008 fix: controller parses `to` as a pure UTC calendar-day bound
    // (T23:59:59.999Z), independent of server-local timezone.
    expect(lte.toISOString()).toBe('2026-06-17T23:59:59.999Z')
  })

  it('pa-18: end-of-day `to` is NOT start-of-day (regression guard)', async () => {
    await get('/platform/audit?to=2026-06-17', platformToken())
    const lte: Date = lastFindManyArgs.where.createdAt.lte
    const startOfDay = new Date('2026-06-17')
    expect(lte.getTime()).toBeGreaterThan(startOfDay.getTime())
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// AC8 — invalid query params handled gracefully
// ═══════════════════════════════════════════════════════════════════════════
describe('GET /platform/audit — invalid params (AC8)', () => {
  it('pa-19: ?limit=abc → not a 200 success, does not 500-crash with no body', async () => {
    const { status, body } = await get('/platform/audit?limit=abc', platformToken())
    // Zod coercion of "abc" yields NaN → validation error; must be a client error
    // (400) routed through the global error handler, never an unhandled 500.
    expect(status).not.toBe(200)
    expect(status).toBeGreaterThanOrEqual(400)
    expect(status).toBeLessThan(500)
    expect(body).not.toBeNull()
    expect(body.success).toBe(false)
  })

  it('pa-20: ?page=0 (below min) → rejected, not a silent 200', async () => {
    const { status } = await get('/platform/audit?page=0', platformToken())
    expect(status).toBeGreaterThanOrEqual(400)
    expect(status).toBeLessThan(500)
  })

  it('pa-21: ?limit=99999 (above MAX_LIMIT=200) → rejected', async () => {
    const { status } = await get('/platform/audit?limit=99999', platformToken())
    expect(status).toBeGreaterThanOrEqual(400)
    expect(status).toBeLessThan(500)
  })

  it('pa-22: ?tenantId=-1 (not positive) → rejected', async () => {
    const { status } = await get('/platform/audit?tenantId=-1', platformToken())
    expect(status).toBeGreaterThanOrEqual(400)
    expect(status).toBeLessThan(500)
  })
})
