# ADR-0005 — Codex Audit Batch 3: QA Automation Design

Date: 2026-07-07
Status: Accepted
Context: Batch 3 of Codex audit remediation (source: RecomendByCodex/06-recommendations.md "QA automation to add"). BA validation found items 1 and 4 largely delivered by Batch 1; adversarial grill (Step 3.5) initially FAILED the design with 4 blocking findings; all were resolved by amending the design as below. Decision authority delegated to agents by product owner.

## Decisions

### D1 — Seed credential smoke: add platform login case
Extend `src/backend/tests/integration/seedCredentialSmoke.test.ts` with one case: `POST /platform/auth/login` using `process.env.PLATFORM_ADMIN_EMAIL || 'admin@anemal.app'` / `process.env.PLATFORM_ADMIN_PASSWORD || 'PlatformAdmin1!'` (verify fallbacks against seed.ts at implementation), assert 200 + platform JWT. No branch selection on platform plane. Clinic coverage (6 credentials, two-step login) already delivered in Batch 1.

### D2 — Role-route matrix test (grill-corrected design)
ONE new file `src/backend/tests/integration/roleRouteMatrix.test.ts` + helper `src/backend/tests/helpers/expressRouteWalker.ts`:
- **Route enumeration:** recursive walk of `app._router.stack` (Express 4.19, nested routers via layer.handle.stack, mount paths reconstructed from layer.regexp). Walker lives in helpers/ with its own unit assertion (3-route fixture app) so a regexp bug can't silently under-enumerate.
- **Guard annotation (grill F4):** `requirePermission` AND `requireAnyPermission` in permission.middleware.ts each set `permissionCodes: string[]` + `mode: 'all'|'any'` on the returned closure. Behavior unchanged. Two live `requireAnyPermission(['roles.view','roles.manage'])` routes (clinic.routes.ts:20, role.routes.ts:29) are thereby representable.
- **Expected grants (grill F2/F3):** derived at runtime by querying the seeded system roles (`clinicRole` + `rolePermission` where `tenantId = null`) — the proven rbac-regression pattern. NO import of seed-rbac.ts (module-private SYSTEM_ROLES + top-level PrismaClient side effect stays untouched).
- **Semantics:** allowed = status NOT IN {401,403} (2xx/400/404/422 all prove not-denied; POST/PUT send `{}`); denied = exactly 403; no-token sweep = 401. `:id` → dummy 999999 (verified: guards run before controllers, no router.param, no id-dependent permissions).
- **Unmapped-route guard:** mounted clinic route with no annotation FAILS unless on an explicit allowlist; each allowlisted route verified intentionally-unguarded by reading its route file at implementation (not hardcoded blind).
- **Plane sweeps:** clinic token on /platform/* → 403; platform token on guarded clinic routes → 403.
- **DB safety (grill F8):** fixtures created ONCE in beforeAll (isolated test tenant + admin/doctor/staff via user_roles, rbac-regression.test.ts:54-101 pattern); afterAll deletes ONLY the test's own rows by id; shared `tenantId=null` system roles never deleted. Sequential requests, shared listener, keepAliveTimeout=0.
- Runtime budget ~1-3 min accepted; escalate to separate npm script only if CI pain materializes.

### D3 — Platform contract tests (fallback-first per grill F11)
ONE new file `src/backend/tests/integration/platformContract.test.ts` (unit-style, no server): representative payload literals per contract (customer create/edit, plan create/edit, settings save) validated at runtime via `safeParse` against the real exported Zod schemas, + one negative case per contract. Payload literals carry `// KEEP IN SYNC with <frontend hook>` comments. Cross-tree `import type` of frontend DTOs is a spike, not the primary path (ts-jest rootDir '.' likely rejects it — grill-confirmed). Existing frontend `@ts-expect-error` tests stay.

### D4 — Third audit sink assertion (strengthened per grill F12)
Extend `auditRedaction.test.ts`: after settings update via real route, query `settings_audit_logs` rows for the test tenant and assert (a) full sentinel absent AND (b) stored value equals the exact masked form `'••••••••' + sentinel.slice(-4)` — pinning maskSecret's contract (utils/encryption.ts:52-54), not just full-string absence. Sentinel ≥5 chars so masking is actually exercised.

### D5 — Browser smoke: manual gate now, automation deferred
No Playwright (not in deps; heavyweight; ponytail-fail). Formalize `.claude/skills/anemal-smoke-walkthrough` as the release-gate step: add "Browser smoke (manual, gated)" section to `.claude/roadmap/qa-protocols.md` (required at Step 7 for release-bound branches touching frontend/auth, report table = sign-off artifact); extend the skill with "create/edit one key record per plane". Backlog entry: automated E2E revisited at Phase 10/11. Explicit deferral per audit's own "resolved or formally deferred" language.

## Grill record
Initial verdict FAIL (F2, F3, F4, F8 blocking). All four resolved by design amendments above; F1 (paths), F11 (fallback-first), F12 (sentinel shape) strengthenings folded in. F5, F6, F7, F9, F10, F13, F14, F15 resolved during grill. Final: cleared for write-plan.

## Glossary additions
- **Role-route matrix**: CI-enforced sweep asserting the authorization outcome (not functional correctness) of every mounted route for every system role; unmapped routes fail by default.
- **Guard annotation**: metadata (`permissionCodes[]`, `mode`) attached to permission-middleware closures enabling route introspection without behavior change.
- **Audit sink**: any table persisting audit details — three exist: `audit_logs`, `platform_audit_logs`, `settings_audit_logs`; all must have redaction/masking regression coverage.
