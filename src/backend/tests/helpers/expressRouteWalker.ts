/**
 * Recursively enumerates every mounted route on an Express app, including
 * routes nested inside `express.Router()` sub-routers, and surfaces the
 * `permissionCodes`/`mode` guard annotations (ADR-0005 D2) carried by any
 * `requirePermission`/`requireAnyPermission` handler in the route's handler
 * chain.
 *
 * This walker is load-bearing for `roleRouteMatrix.test.ts`'s security
 * coverage — a bug here could silently under-enumerate routes and produce a
 * false-negative "everything is guarded" result, which is why it carries its
 * own fixture-app unit test (`__tests__/expressRouteWalker.test.ts`) proven
 * green before any real-route sweep depends on it.
 *
 * @module expressRouteWalker
 */

import type { Express, RequestHandler } from 'express'

/** HTTP methods this walker recognizes on `layer.route.methods`. */
const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const

/** One route discovered by {@link walkRoutes}. */
export interface EnumeratedRoute {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** Reconstructed full mount path, e.g. `/clinic/roles/:roleId/permissions`. */
  path: string
  /** Present only if a `requirePermission`/`requireAnyPermission` layer guards this route. */
  permissionCodes?: string[]
  mode?: 'all' | 'any'
}

/** Minimal shape of the internal `_router` property Express attaches to an app instance. */
interface AppWithRouter {
  _router: { stack: InternalLayer[] }
}

/** Minimal shape of Express's internal (undocumented) route-stack layer. */
interface InternalLayer {
  name: string
  regexp: { fast_slash: boolean; source: string }
  route?: {
    path: string
    methods: Partial<Record<(typeof HTTP_METHODS)[number], boolean>>
    stack: Array<{ handle: RequestHandler }>
  }
  handle?: { stack?: InternalLayer[] }
}

/**
 * Reconstructs the static mount-path segment a router layer was mounted at.
 *
 * Express compiles `app.use(mountPath, router)` into a path-to-regexp
 * pattern stored on `layer.regexp`; there is no public API that returns the
 * original string, so this reverses the small, stable subset of that pattern
 * produced for static (non-`:param`) mount paths — which is the only shape
 * used anywhere in this codebase (verified: no `app.use()` call mounts a
 * parameterized path).
 *
 * @param regexp - The layer's compiled mount regexp.
 * @returns The mount path (e.g. `/nested`), or `''` for a root (`/`) mount.
 */
function reconstructMountPath(regexp: { fast_slash: boolean; source: string }): string {
  if (regexp.fast_slash) {
    return ''
  }
  return regexp.source
    .replace(/^\^/, '')
    .replace(/\\\/\?\(\?=\\\/\|\$\)$/, '')
    .replace(/\$$/, '')
    .replace(/\\\//g, '/')
}

/**
 * Extracts guard annotations from a route's handler chain, if present.
 *
 * @param stack - The per-route handler chain (`layer.route.stack`).
 * @returns The `permissionCodes`/`mode` pair from the first annotated
 *   handler in the chain, or `undefined` if none carries annotations.
 */
function findGuardAnnotation(
  stack: Array<{ handle: RequestHandler }>,
): Pick<EnumeratedRoute, 'permissionCodes' | 'mode'> | undefined {
  for (const { handle } of stack) {
    const annotated = handle as RequestHandler & { permissionCodes?: string[]; mode?: 'all' | 'any' }
    if (annotated.permissionCodes && annotated.mode) {
      return { permissionCodes: annotated.permissionCodes, mode: annotated.mode }
    }
  }
  return undefined
}

/**
 * Recursively walks a stack of Express layers, accumulating enumerated
 * routes under the given mount-path prefix.
 *
 * @param stack - The layer stack to walk (`app._router.stack` or a nested
 *   router's `layer.handle.stack`).
 * @param prefix - The mount-path prefix accumulated from parent routers.
 * @param routes - Accumulator array (mutated in place).
 */
function walkStack(stack: InternalLayer[], prefix: string, routes: EnumeratedRoute[]): void {
  for (const layer of stack) {
    if (layer.route) {
      const routePath = `${prefix}${layer.route.path}`
      const annotation = findGuardAnnotation(layer.route.stack)
      for (const method of HTTP_METHODS) {
        if (layer.route.methods[method]) {
          routes.push({
            method: method.toUpperCase() as EnumeratedRoute['method'],
            path: routePath,
            ...annotation,
          })
        }
      }
      continue
    }
    if (layer.name === 'router' && layer.handle?.stack) {
      const mountPath = reconstructMountPath(layer.regexp)
      walkStack(layer.handle.stack, `${prefix}${mountPath}`, routes)
    }
    // Anything else (bare middleware like helmet()/cors()/express.json()) is skipped.
  }
}

/**
 * Enumerates every mounted route on an Express app.
 *
 * @param app - The Express application instance.
 * @returns Every discovered route, each with its guard annotation if guarded.
 */
export function walkRoutes(app: Express): EnumeratedRoute[] {
  const routes: EnumeratedRoute[] = []
  walkStack((app as unknown as AppWithRouter)._router.stack, '', routes)
  return routes
}
