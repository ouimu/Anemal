/**
 * The route walker is load-bearing for roleRouteMatrix.test.ts's security
 * coverage (ADR-0005 D2) — a regexp bug here could silently under-enumerate
 * routes and produce a false-negative "everything is guarded" result. This
 * test pins the walker's behavior against a small, known 3-route fixture app
 * BEFORE it is trusted against the real app tree.
 */
import express from 'express'
import { walkRoutes, EnumeratedRoute } from '../expressRouteWalker'

function buildFixtureApp(): express.Express {
  const app = express()
  const nested = express.Router()

  const guarded: express.RequestHandler = ((_req, _res, next) => next()) as express.RequestHandler & {
    permissionCodes: string[]
    mode: 'all' | 'any'
  }
  ;(guarded as any).permissionCodes = ['fixture.view']
  ;(guarded as any).mode = 'all'

  nested.get('/:id', guarded, (_req, res) => res.json({ ok: true }))
  app.use('/nested', nested)
  app.post('/plain', (_req, res) => res.json({ ok: true })) // unguarded, top-level
  app.get('/health', (_req, res) => res.json({ status: 'ok' })) // unguarded, top-level

  return app
}

describe('expressRouteWalker — fixture app (3 routes)', () => {
  const routes = walkRoutes(buildFixtureApp())

  it('enumerates exactly 3 routes', () => {
    expect(routes).toHaveLength(3)
  })

  it('reconstructs the nested mount path with param placeholder intact', () => {
    const nested = routes.find((r: EnumeratedRoute) => r.method === 'GET' && r.path === '/nested/:id')
    expect(nested).toBeDefined()
    expect(nested?.permissionCodes).toEqual(['fixture.view'])
    expect(nested?.mode).toBe('all')
  })

  it('enumerates top-level unguarded routes with no permissionCodes', () => {
    const plain = routes.find((r: EnumeratedRoute) => r.method === 'POST' && r.path === '/plain')
    expect(plain).toBeDefined()
    expect(plain?.permissionCodes).toBeUndefined()

    const health = routes.find((r: EnumeratedRoute) => r.method === 'GET' && r.path === '/health')
    expect(health).toBeDefined()
    expect(health?.permissionCodes).toBeUndefined()
  })
})
