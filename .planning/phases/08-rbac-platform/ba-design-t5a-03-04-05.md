# BA Design — Phase 8 T-5A-03/04/05

## T-5A-03: Permission Resolution + Cache

### Algorithm
1. `resolvePermissions(userId, tenantId)` — called by permission middleware per request
2. Cache check: key = `${tenantId}:${userId}`, TTL = 5 min, in-memory Map
3. Cache miss: `prisma.userRole.findMany({ where: { userId, tenantId }, include: { role: { include: { permissions: true } } } })`
4. Union all `rp.permissionCode` values across all assigned roles → `Set<string>`
5. Store in cache, return set
6. `invalidatePermCache(userId, tenantId)` — call whenever user roles change (T-5B-04)
7. `clearPermCache()` — test helper only

### Cache design
- Key: `${tenantId}:${userId}` (no permSetVersion in key — version is in JWT for observability only)
- TTL: 5 minutes (role changes take effect within 5 min without re-login — meets AC-12)
- Interface: `CacheStore { get(k): Entry|null, set(k, v, ttl): void, delete(k): void }` — in-memory default, Redis-swappable later

### permSetVersion
- Computed at login: `Math.max(...userRoles.map(ur => ur.role.permVersion), 0)` → floor at 1
- Stored in JWT for observability + future Redis cache-key support
- NOT used for cache lookup in this MVP (TTL-based invalidation is sufficient)

## T-5A-04: Permission Middleware

### Middleware chain
```
authMiddleware → requirePlane('clinic') → requirePermission('billing.create') → controller
```
- `requirePlane` and `requirePermission` are factory functions returning Express `RequestHandler`
- Both check `req.context` exists (set by `authMiddleware`) — 401 if absent

### Error contract
| Condition | Status | Message |
|-----------|--------|---------|
| No token / bad token | 401 | Handled by authMiddleware (upstream) |
| Wrong plane | 403 | "Access denied: wrong plane" |
| Missing permission | 403 | "Access denied: missing permission '<code>'" |
| Cross-tenant resource | 404 | Handled at repository layer (not middleware) |

### Integration
- `rbacMiddleware` is NOT removed here (T-5B-02 removes it after all routes migrate)
- Both can coexist on routes; `requirePermission` supersedes `rbacMiddleware` where applied

## T-5A-05: JWT Payload Extension

### New payload shape
```typescript
interface JwtPayload {
  userId:         number
  tenantId:       number
  branchId?:      number
  plane:          'clinic' | 'platform'
  permSetVersion: number
  role:           string   // transitional — kept until T-5B-02 removes rbacMiddleware
  iat?:           number
  exp?:           number
}
```

### Migration strategy
- Both sign sites updated atomically (login + switch-branch)
- Login: set `plane: 'clinic'`, compute `permSetVersion`
- Old tokens (missing `plane`/`permSetVersion`): `requirePlane` will 403 — acceptable (re-login required)
- Test tokens: all test beforeAll helpers must include `plane: 'clinic'` and `permSetVersion: 1`

### C-1 doc debt
Spec §7, §8, and T-5A-05 task description use `roleIds[]`/`branchIds[]` in JWT.
CR-01 (§15) supersedes: no arrays in token. This file is authoritative.
