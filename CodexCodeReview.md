# Codex Code Review — Anemal

> Prepared for handoff to Claude Code  
> Review date: 2026-08-04  
> Scope: repository-wide production-readiness, security, architecture, performance, and error-handling audit  
> Stack: Node.js, Express, TypeScript, Prisma, PostgreSQL, React, Vite, Zustand, TanStack Query

## Executive verdict

**Status: NOT PRODUCTION READY — QA sign-off rejected.**

The current implementation contains exploitable tenant/branch isolation gaps, stored XSS, authentication-token confusion, replay/race conditions, financial consistency failures, and PII retention risks. The critical and high findings below must be resolved before staging or production approval.

### Review totals

| Severity | Round 1 | Round 2 | Round 3 | Total |
|---|---:|---:|---:|---:|
| CRITICAL | 2 | 0 | 0 | 2 |
| HIGH | 9 | 4 | 7 | 20 |
| MEDIUM | 2 | 12 | 11 | 25 |
| LOW | 0 | 1 | 1 | 2 |

## Required remediation order

Claude Code should address the findings in this order; later steps depend on invariants introduced by earlier steps.

1. Block cross-tenant and cross-branch object references.
2. Remove stored XSS in receipt printing.
3. Separate pending-login tokens from API access tokens.
4. Make refresh rotation, checkout, payment, scheduling, hospitalization, blood-bank, quota, and loyalty operations atomic and idempotent.
5. Correct RBAC seed/matrix contradictions and enforce exactly one role per user.
6. Clear identity-bound frontend caches on logout/login/branch changes.
7. Stop persisting clinical/PII field values in audit logs.
8. Fail closed for cron authentication and validate uploaded file bytes.
9. Bound upload memory and nested JSON traversal before exposing the API to production traffic.
10. Add isolation, replay, concurrency, resource-exhaustion, and XSS regression tests before refactoring lower-severity issues.

---

# Round 1 — Core Security and Data Integrity

## Module: Multi-tenancy and database integrity

### CR-01 — Cross-tenant foreign-key injection can disclose PII

- **File:** `src/backend/services/invoice.service.ts:68` (`createInvoice`)
- **Related:** `models/invoice.repository.ts:67`, `services/hospitalization.service.ts:42`, `models/hospitalization.repository.ts:7`, `services/grooming.service.ts:29`, `models/grooming.repository.ts:7`, `services/reminder.service.ts:26`, `services/medical-record.service.ts:53`, `prisma/schema.prisma:332`
- **Severity:** CRITICAL
- **Issue:** Client-supplied `petId`, `doctorId`, and `appointmentId` values are inserted without proving that the referenced row belongs to the current tenant. Prisma relations use global, single-column IDs rather than tenant-qualified foreign keys.
- **Impact:** A Tenant B user can submit a sequential ID belonging to Tenant A, persist the relationship, then retrieve Tenant A pet, owner, phone, or staff data through Prisma `include` relations.
- **Recommended Fix:** Validate every foreign ID inside the same transaction as the write, then add composite database constraints so application mistakes cannot create malformed relationships.

```ts
return prisma.$transaction(async (tx) => {
  const pet = await tx.pet.findFirst({
    where: { id: data.petId, tenantId },
    select: { id: true },
  })
  if (!pet) throw new NotFoundError('Pet')

  return tx.hospitalization.create({
    data: { ...data, tenantId, branchId },
  })
})
```

```prisma
model Pet {
  @@unique([tenantId, id])
}

model Hospitalization {
  pet Pet @relation(
    fields: [tenantId, petId],
    references: [tenantId, id]
  )
}
```

Apply the composite-key relationship pattern to every tenant-scoped parent/child relation.

### HI-01 — Branch-scoped users can access other branches

- **File:** `src/backend/controllers/grooming.controller.ts:11`
- **Related:** `services/grooming.service.ts:43`, `models/grooming.repository.ts:40`, `models/prescription.repository.ts:19`, `services/promptpay-qr.service.ts:10`, `models/appointment.repository.ts:6`, `models/medical-record.repository.ts:9`, `models/invoice.repository.ts:117`
- **Severity:** HIGH
- **Issue:** Grooming trusts `req.query.branchId`; prescription PDF and PromptPay/invoice read paths omit the JWT branch. Several repositories interpret `undefined` branch as tenant-wide access.
- **Impact:** Branch B staff can read or mutate Branch A clinical and billing resources inside the same tenant.
- **Recommended Fix:** A branch-scoped token must always override request filters. Tenant-wide methods should be separate, explicitly named, and admin-authorized.

```ts
const { tenantId, branchId } = req.context!

if (branchId == null) {
  return service.listTenantWide(tenantId, validatedAdminFilter)
}

return service.listForBranch(tenantId, branchId)
```

```ts
return prisma.groomingBooking.findFirst({
  where: { id, tenantId, branchId },
})
```

### HI-02 — Tenant-scoped mutations use bare global IDs

- **File:** `src/backend/models/appointment.repository.ts:144` (`updateStatus`)
- **Related:** `models/auth.repository.ts:47`, `models/blood-bank.repository.ts:35`, `models/loyalty.repository.ts:24`, `models/reminder.repository.ts:43`
- **Severity:** HIGH
- **Issue:** Multiple mutations call `update({ where: { id } })` after a separate scoped read.
- **Impact:** This violates the tenant isolation iron rule, leaves a check/use gap, and makes repository reuse unsafe.
- **Recommended Fix:** Pass tenant and applicable branch scope into every repository mutation and make the scoped mutation itself authoritative.

```ts
const result = await prisma.appointment.updateMany({
  where: { id, tenantId, branchId },
  data: { status },
})

if (result.count !== 1) {
  throw new NotFoundError('Appointment')
}
```

## Module: Authentication and RBAC

### HI-03 — Pending branch-selection tokens are accepted as API access tokens

- **File:** `src/backend/config/jwt.ts:53` (`signPendingToken`)
- **Related:** `middlewares/auth.middleware.ts:28`, `middlewares/permission.middleware.ts:40`, `models/medical-record.repository.ts:14`, `models/invoice.repository.ts:122`
- **Severity:** HIGH
- **Issue:** Pending and full access tokens share the same signing secret and generic verifier. `authMiddleware` never rejects `scope: 'branch_select'`.
- **Impact:** A user can call clinic APIs before selecting a branch. The missing `branchId` removes branch predicates from several queries.
- **Recommended Fix:** Give token types different audiences and validate the full runtime payload before attaching it to request context.

```ts
export function verifyAccessToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, config.jwtSecret, {
    algorithms: ['HS256'],
    audience: 'anemal-api',
  })

  const payload = AccessTokenSchema.parse(decoded)
  if (payload.scope !== undefined) throw new UnauthorizedError()
  return payload
}
```

```ts
jwt.sign(pendingPayload, secret, {
  expiresIn: '5m',
  audience: 'anemal-branch-selection',
})
```

### HI-04 — Refresh-token rotation race permits multiple valid descendants

- **File:** `src/backend/services/auth.service.ts:284` (`refreshClinicToken`)
- **Related:** `models/refresh-token.repository.ts:60` (`rotateToken`), `services/platform-auth.service.ts`
- **Severity:** HIGH
- **Issue:** Concurrent refresh requests can both observe `rotatedAt = null`; rotation then updates by ID without a conditional claim.
- **Impact:** Replay detection is bypassed and multiple live descendants can be minted from one refresh token.
- **Recommended Fix:** Atomically claim an unused token before creating its descendant. Apply the same implementation to clinic and platform refresh flows.

```ts
return prisma.$transaction(async (tx) => {
  const claimed = await tx.refreshToken.updateMany({
    where: {
      id: oldId,
      rotatedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { rotatedAt: new Date() },
  })

  if (claimed.count !== 1) {
    throw new UnauthorizedError('Invalid or replayed token')
  }

  return tx.refreshToken.create({ data: nextToken })
})
```

### HI-05 — RBAC seed contradicts the authoritative business policy

- **File:** `src/backend/prisma/seed-rbac.ts:132`
- **Related:** `routes/invoice.routes.ts:11`, `routes/report.routes.ts:9`, `.claude/skills/anemal-rbac-matrix/references/permission-matrix.md`
- **Severity:** HIGH
- **Issue:** Doctor receives `billing.view`; Clinic Staff receives revenue, cost, and export permissions, while the authoritative prose says Doctor has no billing/POS access and financial reports are admin-only.
- **Impact:** Doctor can read invoices/payment history/PDFs, and staff can access revenue/cost reporting.
- **Recommended Fix:** Resolve the documentation conflict with BA approval, then update the seed, matrix, and role-route regression suite together.

```ts
const doctorPermissions = [
  // remove 'billing.view'
  'inventory.view',
  'reports.inventory.view',
]

const clinicStaffPermissions = [
  'billing.view',
  'billing.create',
  'billing.payment',
  'reports.inventory.view',
  // remove reports.revenue.view, reports.cost.view, reports.export
]
```

### HI-06 — Exactly-one-role invariant is not enforced

- **File:** `src/backend/prisma/schema.prisma:929` (`UserRole`)
- **Related:** `services/permission.service.ts:112` (`resolvePermissions`)
- **Severity:** HIGH
- **Issue:** `UserRole` still permits multiple roles per user and the permission resolver unions all rows, although ADR-0019 defines exactly one role.
- **Impact:** A duplicate, legacy, or corrupt join row silently escalates effective privileges.
- **Recommended Fix:** Collapse existing duplicates, add a unique constraint, and resolve the canonical `User.roleId` rather than unioning join rows.

```prisma
model UserRole {
  userId   Int @unique
  roleId   Int
  tenantId Int

  @@index([tenantId, userId])
}
```

### HI-07 — Cron authentication fails open when the secret is missing

- **File:** `src/backend/routes/cron.routes.ts:9`
- **Related:** `config/env.ts:13`, `.env.example`
- **Severity:** HIGH
- **Issue:** If `CRON_SECRET` is unset, the literal header `Bearer undefined` passes the comparison.
- **Impact:** An unauthenticated caller can run a cross-tenant reminder dispatch and mark reminders sent.
- **Recommended Fix:** Validate the secret at startup, document it in `.env.example`, and fail closed at the route.

```ts
const cronSecret = process.env.CRON_SECRET
if (!cronSecret) throw new Error('CRON_SECRET is required')

if (req.headers.authorization !== `Bearer ${cronSecret}`) {
  res.status(401).json({ error: 'unauthorized' })
  return
}
```

## Module: Billing and frontend session security

### CR-02 — Stored XSS in receipt printing can steal the clinic JWT

- **File:** `src/frontend/src/views/clinic/ClinicBilling.tsx:687` (`printReceipt`)
- **Severity:** CRITICAL
- **Issue:** Invoice descriptions, patient labels, invoice numbers, and payment methods are interpolated into an HTML string passed to `document.write()` without escaping.
- **Impact:** A stored payload executes in a same-origin `about:blank` window and can access `window.opener.sessionStorage.vc_auth` or call authenticated APIs.
- **Recommended Fix:** Prefer a printable React component. If an HTML template remains, escape every dynamic string, remove inline executable content, and sever the opener before writing.

```ts
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]!)
}

const receiptWindow = window.open('', '_blank', 'width=420,height=640')
if (receiptWindow) {
  receiptWindow.opener = null
  receiptWindow.document.write(renderEscapedReceipt(invoice))
  receiptWindow.document.close()
}
```

### HI-08 — Payment and loyalty operations are non-atomic and replayable

- **File:** `src/backend/services/invoice.service.ts:150` (`recordPayment`)
- **Related:** `models/invoice.repository.ts:162`, `services/loyalty.service.ts:54`, `models/loyalty.repository.ts:28`, `frontend/src/views/clinic/ClinicBilling.tsx:146`
- **Severity:** HIGH
- **Issue:** Mark-paid, payment history, earn/redeem, and discount application occur across separate transactions and HTTP calls. The frontend intentionally swallows redemption failures.
- **Impact:** Concurrent or retried requests can award points twice, overdraw loyalty, grant a free discount, or leave paid invoices without complete ledger history.
- **Recommended Fix:** Implement a server-side idempotent checkout transaction that conditionally claims the invoice and applies stock, payment, and loyalty ledger changes together.

```ts
await prisma.$transaction(async (tx) => {
  const claimed = await tx.invoice.updateMany({
    where: {
      id: invoiceId,
      tenantId,
      branchId,
      paymentStatus: { not: 'paid' },
    },
    data: { paymentStatus: 'paid', paidAt: new Date() },
  })

  if (claimed.count !== 1) throw new ConflictError('Already paid')

  await redeemPointsTx(tx, tenantId, ownerId, points)
  await tx.paymentHistory.create({ data: payment })
  await earnPointsTx(tx, tenantId, invoiceId)
})
```

Add an idempotency key or a unique payment-event constraint.

### HI-09 — PII-bearing query cache survives logout and branch changes

- **File:** `src/frontend/src/main.tsx:8`
- **Related:** `hooks/useAuth.ts:136`, `utils/api.ts:30`, `utils/platformApi.ts:33`, `hooks/usePlatformCustomers.ts`
- **Severity:** HIGH
- **Issue:** Clinic and platform users share one `QueryClient`; logout and 401 handlers clear auth stores but not query/mutation caches. Many keys omit tenant, branch, or user scope.
- **Impact:** A subsequent user on the same tablet can receive cached owner, pet, EMR, billing, staff, or platform-customer data from the prior session.
- **Recommended Fix:** Export the QueryClient, cancel and clear it at every identity transition, and scope all protected query keys.

```ts
export const queryClient = new QueryClient()

export async function clearServerState(): Promise<void> {
  await queryClient.cancelQueries()
  queryClient.clear()
}

async function logout(): Promise<void> {
  await clearServerState()
  clearAuth()
  navigate('/login', { replace: true })
}
```

```ts
queryKey: ['pets', tenantId, branchId, userId, filters]
```

## Module: Audit and file upload security

### ME-01 — Audit logs persist full clinical and PII request bodies

- **File:** `src/backend/middlewares/audit.middleware.ts:27`
- **Related:** `utils/audit-sanitize.ts:11`, `models/audit.repository.ts:61`
- **Severity:** MEDIUM (QA stop-ship privacy finding)
- **Issue:** The sanitizer redacts credential-like keys but retains names, phone numbers, addresses, ID-card data, SOAP notes, diagnoses, and reactions.
- **Impact:** Sensitive data is duplicated into a long-lived audit table and returned to every authorized audit viewer.
- **Recommended Fix:** Store event metadata and changed field names, not request values. Explicitly allowlist any value that must be retained.

```ts
const details = {
  changedFields: Object.keys(req.body ?? {}),
  resourceId: req.params.id ?? null,
}

await auditRepo.create({ ...entry, details })
```

### ME-02 — File upload validation trusts the client MIME header

- **File:** `src/backend/services/pet.service.ts:95`
- **Related:** `services/emr-attachment.service.ts:34`, `controllers/pet.controller.ts:42`, `controllers/emr-attachment.controller.ts:23`
- **Severity:** MEDIUM
- **Issue:** Upload allowlists use Multer's `req.file.mimetype`, which is derived from the multipart header and is attacker-controlled.
- **Impact:** Executable, HTML, or polyglot content can be stored while labeled as an image, Office file, or PDF.
- **Recommended Fix:** Detect content from magic bytes before selecting an extension or storage Content-Type.

```ts
import { fileTypeFromBuffer } from 'file-type'

const detected = await fileTypeFromBuffer(file.buffer)
if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime)) {
  throw new ValidationError({ file: ['Unsupported file content'] })
}

await driver.save(storageKey, file.buffer, detected.mime)
```

## Round 1 regression tests required

```ts
it('rejects a pending branch-selection token on normal clinic APIs', async () => {
  const response = await request(app)
    .get('/api/medical-records?petId=1')
    .set('Authorization', `Bearer ${pendingToken}`)

  expect(response.status).toBe(401)
})

it('returns 404 when tenant B references tenant A pet', async () => {
  const response = await request(app)
    .post('/api/hospitalizations')
    .set('Authorization', `Bearer ${tenantBToken}`)
    .send({ petId: tenantAPetId, reason: 'test', dailyRate: 0 })

  expect(response.status).toBe(404)
})

it('allows only one successful concurrent refresh', async () => {
  const results = await Promise.all([
    refresh(refreshToken),
    refresh(refreshToken),
  ])

  expect(results.filter((result) => result.status === 200)).toHaveLength(1)
  expect(results.filter((result) => result.status === 401)).toHaveLength(1)
})
```

## Verification status after Round 1

- Backend TypeScript `tsc --noEmit`: PASS
- Frontend TypeScript `tsc --noEmit`: PASS
- Tracked source secret scan: no hardcoded production secret found
- Unsafe raw SQL scan: no `$queryRawUnsafe` found
- Backend Jest suite: BLOCKED — PostgreSQL unavailable at `localhost:5432`
- Frontend complete test/build run: INCONCLUSIVE — exceeded 120 seconds
- Dependency advisory lookup: NOT RUN — environment denied external disclosure of dependency metadata
- Git worktree after review: clean

---

# Round 2 — Architecture, Migrations, Performance, and Error Handling

## Module: Database defense in depth

### R2-HI-01 — Canonical RLS policies are absent from executable migrations

- **File:** `.claude/specs/database-schema.sql:521`
- **Related:** `src/backend/prisma/migrations/`, `src/backend/config/db.ts`
- **Severity:** HIGH
- **Issue:** The canonical schema defines tenant RLS policies, but no executable Prisma migration enables RLS or creates policies. Runtime code never sets `app.current_tenant_id`.
- **Impact:** Every application-layer scoping defect reaches real rows. The cross-tenant findings in Round 1 have no database backstop.
- **Recommended Fix:** Introduce RLS using a non-owner application DB role, force RLS on tenant tables, and set tenant context transaction-locally. Platform operations need a separate narrowly privileged role/path.

```sql
ALTER TABLE pets ENABLE ROW LEVEL SECURITY;
ALTER TABLE pets FORCE ROW LEVEL SECURITY;

CREATE POLICY pets_tenant_policy ON pets
USING ("tenantId" = current_setting('app.current_tenant_id')::int)
WITH CHECK ("tenantId" = current_setting('app.current_tenant_id')::int);
```

```ts
await prisma.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT set_config(
    'app.current_tenant_id',
    ${String(tenantId)},
    true
  )`
  return operation(tx)
})
```

Do not deploy RLS until connection-pool behavior and the platform-plane bypass role have integration coverage.

### R2-HI-02 — Raw joins do not tenant-filter every tenant table

- **File:** `src/backend/models/product.repository.ts:149`
- **Related:** `models/report.repository.ts:48`, `models/usage.repository.ts:66`
- **Severity:** HIGH
- **Issue:** Queries filter `branch_inventory`, `stock_movements`, or `vaccinations` by tenant but join `inventory_items` or `pets` only by global ID.
- **Impact:** A malformed cross-tenant foreign key—currently possible—can expose another tenant's item/pet data or corrupt aggregate reports.
- **Recommended Fix:** Scope each tenant-bearing table independently in the join condition.

```ts
return prisma.$queryRaw<AlertRow[]>`
  SELECT i.id, i.name, bi."stockQty"
  FROM branch_inventory bi
  JOIN inventory_items i
    ON i.id = bi."productId"
   AND i."tenantId" = ${tenantId}
  WHERE bi."tenantId" = ${tenantId}
    AND bi."branchId" = ${branchId}
`
```

### R2-ME-01 — Role counts leak cross-tenant usage and foreign roles are an existence oracle

- **File:** `src/backend/models/role.repository.ts:22`
- **Related:** `services/role.service.ts:130`, `services/role.service.ts:172`, `models/user.repository.ts`
- **Severity:** MEDIUM
- **Issue:** `_count.userRoles` is unfiltered for system roles and therefore counts users across all tenants. Role mutation first performs a global ID lookup and returns 403 for a foreign role.
- **Impact:** Tenants can infer cross-tenant role usage and whether another tenant's role ID exists. Cross-tenant resources should return 404.
- **Recommended Fix:** Scope counts and lookup visibility in the query itself.

```ts
return prisma.clinicRole.findMany({
  where: { OR: [{ tenantId: null }, { tenantId }] },
  include: {
    permissions: { select: { permissionCode: true } },
    _count: {
      select: { userRoles: { where: { tenantId } } },
    },
  },
})
```

```ts
return prisma.clinicRole.findFirst({
  where: {
    id: roleId,
    OR: [{ tenantId }, { tenantId: null, isSystem: true }],
  },
})
```

## Module: Migration and rollback safety

### R2-HI-03 — Rollback migration permanently deletes platform identities

- **File:** `src/backend/prisma/migrations/20260610134121_phase1_5b_settings_api/down.sql:9`
- **Severity:** HIGH
- **Issue:** The down migration executes `DELETE FROM "users" WHERE "role" = 'superadmin'` before rebuilding the enum.
- **Impact:** A rollback can irreversibly delete identities and related data instead of restoring the prior application version.
- **Recommended Fix:** Never silently delete business identities during rollback. Abort with an actionable precondition or migrate identities into a reversible staging table first.

```sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE role = 'superadmin') THEN
    RAISE EXCEPTION
      'Rollback blocked: migrate or re-role superadmin identities first';
  END IF;
END $$;
```

### R2-ME-02 — 24 of 31 migration directories have no down script

- **File:** `src/backend/prisma/migrations/`
- **Severity:** MEDIUM
- **Issue:** Most migration directories contain only `migration.sql`, contrary to the repository's rollback standard.
- **Impact:** Incident rollback is undocumented and may require unsafe, improvised production SQL.
- **Recommended Fix:** Add reviewed rollback instructions/scripts for every reversible migration. For intentionally irreversible data migrations, provide an explicit guard and documented restore procedure rather than a misleading destructive down script.

Minimum verification:

```powershell
$migrations = Get-ChildItem src/backend/prisma/migrations -Directory
$migrations | Where-Object {
  -not (Test-Path (Join-Path $_.FullName 'down.sql'))
}
```

### R2-ME-03 — Live-table indexes are non-concurrent and hot branch queries lack matching indexes

- **File:** `src/backend/prisma/migrations/20260713090000_add_care_performed_by_index/migration.sql:3`
- **Related:** `20260721074507_index_users_roleid/migration.sql:2`, `20260721160000_add_attachment_upload_metadata/migration.sql:19`, `prisma/schema.prisma:378`, `prisma/schema.prisma:419`, `prisma/schema.prisma:539`
- **Severity:** MEDIUM
- **Issue:** New indexes use blocking `CREATE INDEX`; tenant table indexes do not lead with `tenantId`. Appointment, medical-record, and invoice branch/date/status filters lack matching composite indexes.
- **Impact:** Deployments can lock large tables, and common branch dashboards degrade into broad scans as data grows.
- **Recommended Fix:** Add production indexes concurrently in a non-transactional migration and align order with query predicates.

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS
  appointments_tenant_branch_scheduled_idx
  ON appointments ("tenantId", "branchId", "scheduledAt");

CREATE INDEX CONCURRENTLY IF NOT EXISTS
  invoices_tenant_branch_status_issued_idx
  ON invoices ("tenantId", "branchId", "paymentStatus", "issuedAt");
```

## Module: Backend architecture and error handling

### R2-ME-04 — Controllers bypass the required service/repository layering

- **File:** `src/backend/controllers/appointment.controller.ts:6`
- **Related:** `controllers/oauth-google.controller.ts`, `controllers/oauth-onedrive.controller.ts`, `controllers/platform-audit.controller.ts`, `controllers/role.controller.ts`, `controllers/settings.controller.ts`, `controllers/transaction.controller.ts`
- **Severity:** MEDIUM
- **Issue:** Controllers import repositories or Prisma directly, bypassing the required Route → Controller → Service → Repository flow.
- **Impact:** Authorization, tenant validation, audit behavior, and business rules become duplicated and easy to bypass; controller tests require database coupling.
- **Recommended Fix:** Keep controllers limited to validated HTTP mapping and move orchestration into services.

```ts
// controller
export async function handleMonth(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await appointmentService.listMonth(
      req.context!.tenantId,
      req.context!.branchId,
      parsedQuery,
    )
    res.json({ success: true, data: result })
  } catch (error) {
    next(error)
  }
}
```

### R2-ME-05 — Internal storage/provider errors are returned to clients

- **File:** `src/backend/config/storage-driver.ts:39`
- **Related:** `middlewares/error-handler.middleware.ts:28`
- **Severity:** MEDIUM
- **Issue:** `StorageUnavailableError` stores `String(cause)` in `AppError.details`; the global handler returns all `AppError.details` to the client.
- **Impact:** Responses can disclose absolute paths, SMB host/share details, or cloud-provider error payloads.
- **Recommended Fix:** Log private diagnostic context server-side and expose details only for explicitly public validation errors.

```ts
if (err instanceof ValidationError) {
  res.status(400).json({
    success: false,
    code: err.code,
    error: err.message,
    details: err.details,
  })
  return
}

if (err instanceof AppError) {
  logger.warn({ err, tenantId, path: req.path }, err.message)
  res.status(err.statusCode).json({
    success: false,
    code: err.code,
    error: err.message,
  })
}
```

### R2-ME-06 — Process lifecycle can continue after unhandled rejection and does not drain cleanly

- **File:** `src/backend/server.ts:6`
- **Related:** `config/db.ts`, `workers/reminder.worker.ts`
- **Severity:** MEDIUM
- **Issue:** `unhandledRejection` is logged but the potentially inconsistent process continues. `SIGTERM`/`SIGINT` do not stop the HTTP server/worker or disconnect Prisma.
- **Impact:** Deploys can terminate active requests and transactions; an undefined process state may continue serving traffic.
- **Recommended Fix:** Retain server and worker handles, stop accepting traffic, clear timers, disconnect Prisma, and terminate on fatal errors.

```ts
const worker = startReminderWorker()
const server = app.listen(config.port)

async function shutdown(exitCode: number): Promise<void> {
  clearInterval(worker)
  server.close(async () => {
    await prisma.$disconnect()
    process.exit(exitCode)
  })
}

process.on('SIGTERM', () => void shutdown(0))
process.on('SIGINT', () => void shutdown(0))
process.on('unhandledRejection', (error) => {
  logger.error({ err: error }, 'Unhandled rejection')
  void shutdown(1)
})
```

## Module: Background jobs and performance

### R2-HI-04 — Reminder dispatcher marks messages sent without sending and has no atomic claim

- **File:** `src/backend/services/reminder.service.ts:38`
- **Related:** `models/reminder.repository.ts:33`, `workers/reminder.worker.ts:18`, `routes/cron.routes.ts`
- **Severity:** HIGH
- **Issue:** The active worker loads every due reminder across all tenants and marks each row `sent`, while the real LINE/SMS/email integration is explicitly absent. Multiple app replicas/cron invocations can process the same rows concurrently.
- **Impact:** Reminders are permanently recorded as sent even though patients received nothing. Future provider integration will risk duplicates under concurrent workers.
- **Recommended Fix:** Disable production dispatch until a provider exists. Then atomically claim bounded batches, send, and mark `sent` only after provider acknowledgement.

```ts
const claimed = await tx.petReminder.updateMany({
  where: {
    id: reminderId,
    tenantId,
    status: 'pending',
  },
  data: { status: 'processing' },
})

if (claimed.count !== 1) return

await provider.send(message)

await tx.petReminder.updateMany({
  where: { id: reminderId, tenantId, status: 'processing' },
  data: { status: 'sent', sentAt: new Date() },
})
```

Process a bounded batch such as 100 rows and retry failed `processing` rows with an attempt counter/dead-letter state.

### R2-LO-01 — Search-as-you-type requests are not debounced or cancelled

- **File:** `src/frontend/src/views/clinic/ClinicAppointments.tsx:94`
- **Related:** `ClinicBilling.tsx`, `ClinicGrooming.tsx`, `hooks/useInventory.ts`
- **Severity:** LOW
- **Issue:** Every keystroke creates a new query and Axios request; the TanStack Query abort signal is ignored.
- **Impact:** Superseded requests continue using API/database capacity and accumulate short-lived cache entries.
- **Recommended Fix:** Debounce input and forward `AbortSignal` to Axios.

```ts
const debouncedSearch = useDebouncedValue(search.trim(), 300)

useQuery({
  queryKey: ['search', tenantId, branchId, debouncedSearch],
  enabled: debouncedSearch.length >= 2,
  queryFn: ({ signal }) => api.get('/api/search', {
    params: { q: debouncedSearch },
    signal,
  }).then((response) => response.data.data),
})
```

## Module: Frontend authorization and state consistency

### R2-ME-07 — Persisted permission snapshots remain trusted after reload

- **File:** `src/frontend/src/store/authStore.ts:89`
- **Related:** `guards/RequirePermission.tsx:41`, `hooks/useAuth.ts`
- **Severity:** MEDIUM
- **Issue:** A persisted non-empty permission array sets `permissionsLoaded = true`, so page reload does not re-fetch `/auth/me`. A legitimate zero-permission custom role stays in a permanent loading state.
- **Impact:** Revoked controls remain visible for the session; zero-permission users can be trapped on a spinner. Backend guards limit direct escalation, but UI state violates deny-by-default behavior.
- **Recommended Fix:** Never hydrate effective permissions as authoritative. Clear them at boot and load current permissions in the authenticated root with explicit pending/error states.

```ts
const persisted = loadPersisted()

export const useAuthStore = create<AuthState>((set, get) => ({
  ...EMPTY,
  ...(persisted ?? {}),
  permissions: [],
  permissionsLoaded: false,
}))
```

### R2-ME-08 — Frontend permission guards are incomplete, especially for platform support

- **File:** `src/frontend/src/App.tsx:125`
- **Related:** `store/platformAuthStore.ts:11`, `views/clinic/ClinicAppointments.tsx`, `views/clinic/ClinicInventory.tsx`
- **Severity:** MEDIUM
- **Issue:** Platform routes and management controls have no permission model. Clinic pages often guard only `.view` at route level while exposing create/edit/adjust controls inside the page.
- **Impact:** Read-only users repeatedly see actions that the backend rejects. `platform_support` receives management UI despite its read-only role, increasing accidental operations and authorization drift.
- **Recommended Fix:** Load platform permissions from `/platform/auth/me` and guard every write control separately. The backend remains the security boundary.

```tsx
<Can perm="appointments.create">
  <CreateAppointmentButton />
</Can>

<RequirePlatformPermission perm="platform.customers.view">
  <CustomerListView />
</RequirePlatformPermission>

<CanPlatform perm="platform.customers.manage">
  <CreateCustomerButton />
</CanPlatform>
```

### R2-ME-09 — OAuth navigation accepts an arbitrary executable URL

- **File:** `src/frontend/src/views/settings/StoragePage.tsx:99`
- **Related:** `hooks/useStorageConfig.ts`
- **Severity:** MEDIUM
- **Issue:** The page assigns an unchecked API response directly to `window.location.href`.
- **Impact:** A compromised or malformed response can execute a `javascript:` URL in the authenticated page or redirect the user to a phishing origin.
- **Recommended Fix:** Allowlist HTTPS protocol and exact provider hosts before navigation.

```ts
function requireOAuthUrl(raw: string, expectedHost: string): string {
  const url = new URL(raw)
  if (url.protocol !== 'https:' || url.hostname !== expectedHost) {
    throw new Error('Invalid OAuth authorization URL')
  }
  return url.href
}

window.location.assign(
  requireOAuthUrl(url, 'accounts.google.com'),
)
```

### R2-ME-10 — Clinic activity can keep a privileged platform session alive

- **File:** `src/frontend/src/hooks/useIdleLogout.ts:14`
- **Related:** `guards/RequireAuth.tsx`, `layouts/PlatformLayout.tsx`
- **Severity:** MEDIUM
- **Issue:** Every clinic and platform session broadcasts the same `vc_idle_ping` localStorage key.
- **Impact:** Activity in a clinic tab can reset an unrelated platform-super-admin timeout indefinitely.
- **Recommended Fix:** Namespace the synchronization key by plane and identity.

```ts
const syncKey = plane === 'platform'
  ? `vc_idle_ping:platform:${platformUserId}`
  : `vc_idle_ping:clinic:${userId}`

function handleStorage(event: StorageEvent): void {
  if (event.key === syncKey) scheduleTimers()
}
```

### R2-ME-11 — Query refetches can overwrite dirty settings forms

- **File:** `src/frontend/src/views/settings/ClinicProfilePage.tsx:36`
- **Related:** `NotificationsPage.tsx`, `IntegrationsPage.tsx`, `PaymentPage.tsx`, `OperatingHoursPage.tsx`, `StoragePage.tsx`
- **Severity:** MEDIUM
- **Issue:** Each page copies query data into local form state whenever `data` changes. TanStack Query refetch-on-focus can replace unsaved edits.
- **Impact:** A clinic admin can silently lose edited integration, payment, hours, or profile values when returning to the tab.
- **Recommended Fix:** Track dirty state or use a form library reset mode that preserves dirty fields.

```ts
useEffect(() => {
  if (!data || dirty) return
  setForm(toForm(data))
}, [data, dirty])

function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
  setDirty(true)
  setForm((current) => ({ ...current, [key]: value }))
}
```

## Module: Quality gates and release readiness

### R2-ME-12 — Mandatory security and CI gates are not executable

- **File:** `src/backend/package.json:6`
- **Related:** `src/backend/jest.config.js`, `.claude/roadmap/qa-protocols.md`, repository root
- **Severity:** MEDIUM
- **Issue:** QA protocol mandates `npm run test:security`, but no such script exists. No `.github/workflows` CI pipeline exists. Backend `lint` references ESLint although backend has no ESLint dependency/configuration. Jest requires a live database for every invocation and uses `forceExit` because Prisma handles leak.
- **Impact:** Tenant-isolation regressions are not enforced automatically, lint cannot be relied upon, and failing/open-handle tests can be hidden by forced termination.
- **Recommended Fix:** Add explicit unit/integration/security commands and a CI workflow backed by PostgreSQL. Disconnect Prisma instead of forcing Jest to exit.

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test:unit": "jest --runInBand tests/unit",
    "test:integration": "jest --runInBand tests/integration",
    "test:security": "jest --runInBand tenantIsolation roleRouteMatrix",
    "lint": "eslint . --ext .ts --max-warnings=0"
  }
}
```

Required CI order:

1. Install locked dependencies.
2. Start PostgreSQL test service and apply migrations.
3. Typecheck backend/frontend.
4. Lint backend/frontend.
5. Run unit tests.
6. Run integration and tenant-isolation tests.
7. Build production bundles.

## Round 2 regression and verification requirements

```ts
it('does not return storage provider internals', async () => {
  storage.read.mockRejectedValue(new Error('C:\\secret\\tenant-file'))
  const response = await request(app).get(downloadUrl).set(authHeader)

  expect(response.status).toBe(503)
  expect(JSON.stringify(response.body)).not.toContain('C:\\secret')
})

it('does not show platform management controls to support users', () => {
  renderPlatform({ permissions: ['platform.customers.view'] })
  expect(screen.queryByRole('button', { name: /create customer/i }))
    .not.toBeInTheDocument()
})
```

Database verification must include:

- RLS integration tests using the actual non-owner application role.
- Cross-tenant malformed-reference attempts rejected by composite constraints.
- `EXPLAIN (ANALYZE, BUFFERS)` for branch appointment, EMR, and invoice queries.
- Concurrent reminder workers proving single delivery.
- Migration up/down rehearsal against a production-like data snapshot.

# Round 3 — Closure Audit: Concurrency, Resource Exhaustion, and Runtime Races

## Module: Transactional invariants and concurrency

### R3-HI-01 — Concurrent requests can double-book a doctor

- **File:** `src/backend/services/appointment.service.ts:65-83` (`createAppointment`)
- **Related:** `models/appointment.repository.ts:100-126`, `prisma/schema.prisma:359-381`
- **Severity:** HIGH
- **Issue:** Conflict counting and appointment insertion are separate operations. No transaction lock or database exclusion constraint protects the time range.
- **Impact:** Two overlapping requests can both observe zero conflicts and both succeed, producing a clinically impossible schedule.
- **Recommended Fix:** Enforce the invariant in PostgreSQL. A transaction/advisory lock may be used as an immediate patch, but a GiST exclusion constraint is the durable boundary.

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE appointments
ADD CONSTRAINT appointments_no_doctor_overlap
EXCLUDE USING gist (
  "tenantId" WITH =,
  "doctorId" WITH =,
  tstzrange(
    "scheduledAt",
    "scheduledAt" + make_interval(mins => "durationMin"),
    '[)'
  ) WITH &&
)
WHERE (status NOT IN ('cancelled', 'no_show'));
```

Translate the constraint violation to HTTP 409. Race two overlapping creates and assert exactly one row exists.

### R3-ME-01 — Groomer daily capacity is a check-then-insert race

- **File:** `src/backend/services/grooming.service.ts:29-36` (`createBooking`)
- **Related:** `models/grooming.repository.ts:32-37`
- **Severity:** MEDIUM
- **Issue:** Two requests can both count seven bookings and both insert, exceeding the eight-booking limit.
- **Impact:** The calendar can commit more work than a groomer is allowed to accept.
- **Recommended Fix:** Serialize the capacity check and insert by tenant, groomer, and service day.

```ts
return prisma.$transaction(async (tx) => {
  const day = new Date(data.scheduledAt).toISOString().slice(0, 10)
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(
      hashtext(${`${tenantId}:${data.groomerId}:${day}`})
    )
  `

  const count = await countGroomerBookingsOnDay(tx, tenantId, data.groomerId!, day)
  if (count >= GROOMER_DAILY_CAPACITY) throw new GroomingError('Groomer is fully booked', 409)
  return createBooking(tx, tenantId, branchId, data, createdBy)
})
```

Add a seven-existing-plus-two-concurrent regression test; one create must return 409 and the final count must be eight.

### R3-ME-02 — Invoice numbering races under valid concurrent checkout

- **File:** `src/backend/models/invoice.repository.ts:47-67` (`createInvoice`)
- **Related:** `prisma/schema.prisma:510-542`
- **Severity:** MEDIUM
- **Issue:** Invoice numbers are generated from `count + 1`. Concurrent transactions derive the same value. The unique constraint prevents duplicates, but one valid checkout fails with Prisma `P2002` and normally becomes a 500.
- **Impact:** Routine concurrent billing is unreliable and staff may retry a transaction whose outcome they cannot confidently determine.
- **Recommended Fix:** Use an atomic tenant/month sequence row rather than counting invoices.

```ts
const sequence = await tx.$queryRaw<{ nextNo: number }[]>`
  INSERT INTO invoice_sequences ("tenantId", "yearMonth", "nextNo")
  VALUES (${tenantId}, ${ym}, 1)
  ON CONFLICT ("tenantId", "yearMonth")
  DO UPDATE SET "nextNo" = invoice_sequences."nextNo" + 1
  RETURNING "nextNo"
`
const invoiceNo = `INV-${ym}-${String(sequence[0].nextNo).padStart(4, '0')}`
```

Concurrently create multiple invoices and require every request to succeed with a unique number.

### R3-HI-02 — Discharge, care history, and billing are not one atomic lifecycle

- **File:** `src/backend/services/hospitalization.service.ts:56-102`
- **Related:** `models/hospitalization.repository.ts:54-94`
- **Severity:** HIGH
- **Issue:** The service reads `admitted`, marks the row discharged, then creates an invoice through a separate transaction. Care logging and deletion also use read-then-write guards.
- **Impact:** Concurrent discharge can generate duplicate invoices; invoice failure leaves a discharged patient unbilled; care may be added during discharge or cascade-deleted during a racing delete.
- **Recommended Fix:** Lock the hospitalization and perform the state transition plus invoice creation through one transaction-aware repository. Add a unique hospitalization-to-invoice link.

```ts
return prisma.$transaction(async (tx) => {
  const claimed = await tx.hospitalization.updateMany({
    where: { id, tenantId, branchId, status: 'admitted' },
    data: { status: 'discharged', dischargedAt: new Date() },
  })
  if (claimed.count !== 1) throw new HospitalizationError('Patient is not currently admitted', 409)

  const invoice = await createHospitalizationInvoice(tx, {
    tenantId, branchId, hospitalizationId: id, createdBy,
  })
  return { hospitalizationId: id, invoice }
})
```

```prisma
model Invoice {
  hospitalizationId Int? @unique
}
```

Test concurrent discharge, forced invoice failure, and care-vs-delete/discharge interleavings.

### R3-HI-03 — Blood donation eligibility and bag consumption are raceable

- **File:** `src/backend/services/blood-bank.service.ts:54-97`
- **Related:** `models/blood-bank.repository.ts:31-68`
- **Severity:** HIGH
- **Issue:** Donor eligibility and bag availability are checked outside the write transaction. Bag status is later updated without `status: 'available'`, and the affected-row count is ignored. Requested transfusion volume is not checked against bag volume.
- **Impact:** A donor can be collected twice inside the safety interval, or one blood bag can be recorded as transfused to multiple patients. Excess-volume records can also be committed.
- **Recommended Fix:** Atomically claim the resource and validate volume before creating the clinical event.

```ts
return prisma.$transaction(async (tx) => {
  const claimed = await tx.bloodDonation.updateMany({
    where: {
      id: data.donationId,
      tenantId,
      status: 'available',
      volumeMl: { gte: data.volumeMl },
    },
    data: { status: 'used' },
  })
  if (claimed.count !== 1) throw new BloodBankError('Bag unavailable or insufficient', 409)

  return tx.bloodTransfusion.create({ data: { tenantId, ...data } })
})
```

Use the same conditional-claim pattern for donor eligibility. Race two collections and two transfusions; only one operation in each pair may succeed.

### R3-HI-04 — Subscription quotas can be exceeded by concurrent creation

- **File:** `src/backend/services/subscription.service.ts:88-146`
- **Related:** `services/branch.service.ts:47-49`, `owner.service.ts:91-100`, `pet.service.ts:49-53`, `user.service.ts:182-229`, `platform-customers.service.ts:440`
- **Severity:** HIGH
- **Issue:** Quota enforcement counts active resources before creation/reactivation, with no shared transaction or tenant/quota lock.
- **Impact:** Concurrent requests at `limit - 1` can all pass and exceed contracted branch, user, owner, or pet limits.
- **Recommended Fix:** Lock a per-tenant quota row and perform the check plus mutation in one transaction, or maintain an atomic usage counter.

```ts
return prisma.$transaction(async (tx) => {
  await tx.$executeRaw`
    SELECT 1 FROM tenant_quotas
    WHERE "tenantId" = ${tenantId} AND resource = ${resource}
    FOR UPDATE
  `
  await assertQuotaAvailable(tx, tenantId, resource)
  return createResource(tx, input)
})
```

For every quota type, race two operations at `limit - 1` and assert final usage equals the limit.

### R3-HI-05 — Inventory receipts overwrite lot and expiry identity

- **File:** `src/backend/models/product.repository.ts:106-129` (`stockIn`)
- **Related:** `prisma/schema.prisma:467-484` (`BranchInventory`)
- **Severity:** HIGH
- **Issue:** One branch/product row aggregates all stock while each receipt overwrites `lotNo` and `expiryDate`. Sequential or concurrent lots become indistinguishable.
- **Impact:** Expiry alerts can point to the wrong batch; recalls and FEFO dispensing cannot be performed reliably; clinical inventory traceability is lost.
- **Recommended Fix:** Model lots as first-class tenant/branch/product records and reference the lot from stock movements.

```prisma
model InventoryLot {
  id         Int      @id @default(autoincrement())
  tenantId   Int
  branchId   Int
  productId  Int
  lotNo      String
  expiryDate DateTime? @db.Date
  stockQty   Decimal   @db.Decimal(10, 2)

  @@unique([tenantId, branchId, productId, lotNo])
  @@index([tenantId, branchId, productId, expiryDate])
}
```

Upsert the matching lot, not the aggregate row. Test receipts for lots A and B retaining both expiries while aggregate quantity remains correct.

### R3-ME-03 — Role deletion races role assignment and returns 500

- **File:** `src/backend/services/role.service.ts:172-189` (`deleteRole`)
- **Related:** `models/role.repository.ts:153-164`
- **Severity:** MEDIUM
- **Issue:** Usage is counted before deletion. A concurrent assignment can occur between the count and the FK-restricted delete.
- **Impact:** A supported business conflict becomes a Prisma/FK failure and a 500, while clients receive inconsistent role-management behavior.
- **Recommended Fix:** Lock role assignment/deletion on the same role row and translate the FK conflict to 409 as defense in depth.

```ts
return prisma.$transaction(async (tx) => {
  await tx.$queryRaw`SELECT id FROM clinic_roles WHERE id = ${roleId} AND "tenantId" = ${tenantId} FOR UPDATE`
  const usage = await tx.userRole.count({ where: { tenantId, roleId } })
  if (usage > 0) throw new RoleError('Role is assigned to users', 409)
  await tx.clinicRole.delete({ where: { id: roleId } })
})
```

Coordinate assignment against deletion and assert the losing operation returns 409, never 500.

## Module: Security boundaries, resource exhaustion, and failure handling

### R3-HI-06 — Audit sanitization can crash the API process

- **File:** `src/backend/utils/audit-sanitize.ts:18-24`
- **Related:** `middlewares/audit.middleware.ts:22-27`, `services/branch.service.ts:9-16`, `services/medical-record.service.ts:5-18`
- **Severity:** HIGH
- **Issue:** `sanitize()` recursively traverses arbitrary objects without a depth limit. `operatingHours: z.record(z.unknown())` and `anatomyAnnotation: z.any()` accept deeply nested input. Sanitization runs from `res.on('finish')`, outside Express error handling.
- **Impact:** An authenticated user with branch-management or EMR-write permission can submit a sub-100 KB deeply nested object. A reproduced 10,000-level payload throws `RangeError: Maximum call stack size exceeded`, which can terminate or recycle the API process after the mutation response.
- **Recommended Fix:** Reject unknown/deep JSON at validation and make redaction iterative with explicit node/depth limits.

```ts
const anatomyAnnotationSchema = z.object({
  template: z.enum(['canine', 'feline']),
  imageData: z.string().max(80_000),
}).strict()

function sanitizeBounded(root: unknown, maxDepth = 12, maxNodes = 2_000): unknown {
  const output = structuredClone(root)
  const stack: Array<{ value: unknown; depth: number }> = [{ value: output, depth: 0 }]
  let nodes = 0

  while (stack.length) {
    const { value, depth } = stack.pop()!
    if (++nodes > maxNodes || depth > maxDepth) return '[TRUNCATED]'
    if (value && typeof value === 'object') {
      for (const child of Object.values(value)) stack.push({ value: child, depth: depth + 1 })
    }
  }
  return redactSecrets(output)
}
```

Submit a 5,000-level payload and require a controlled 400 response with no process exit.

### R3-HI-07 — In-memory uploads have no aggregate resource control

- **File:** `src/backend/routes/medical-record.routes.ts:14,22`
- **Related:** `routes/pet.routes.ts:9,17`, `services/emr-attachment.constants.ts:25-26`
- **Severity:** HIGH
- **Issue:** Multer `memoryStorage()` buffers each upload completely. An EMR request may allocate 25 MB, but there is no upload-specific rate limit, per-tenant/user semaphore, or aggregate memory budget.
- **Impact:** Tens of concurrent authenticated uploads can consume hundreds of megabytes and exhaust the Node heap before service-level MIME validation.
- **Recommended Fix:** Stream directly to the selected storage provider. Until then, apply per-identity rate and concurrency limits and reduce the in-memory cap.

```ts
const uploadLimiter = rateLimit({ windowMs: 60_000, limit: 10 })
const uploadSlots = new TenantSemaphore({ perTenant: 2, global: 8 })

router.post(
  '/:id/attachments',
  uploadLimiter,
  uploadSlots.middleware((req) => req.context!.tenantId),
  streamingUpload.single('file'),
  handleAttachmentSubmit,
)
```

Load-test concurrent maximum-size uploads; excess requests must receive 429/503 while heap use remains bounded.

### R3-ME-04 — Pagination, identifiers, and dates are broadly unvalidated

- **File:** `src/backend/controllers/owner.controller.ts:6-17`
- **Related:** `pet.controller.ts:8-20`, `medical-record.controller.ts:9-20`, `invoice.controller.ts:10-50`, `appointment.controller.ts:14-41`, `report.controller.ts:29-30`
- **Severity:** MEDIUM
- **Issue:** Raw `Number()`, `parseInt()`, and `new Date()` results reach Prisma without finite, positive, range, or validity checks. Several list services accept an arbitrary `limit`.
- **Impact:** Huge limits can produce expensive result sets; negative/NaN pagination and invalid dates produce Prisma errors and 500 responses instead of controlled 400 errors.
- **Recommended Fix:** Add request schemas for body, params, and query—not body-only validation—and cap pagination.

```ts
const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  date: z.string().date().optional(),
}).strict()

const idParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
}).strict()

router.get('/', validateQuery(listQuerySchema), controller)
router.get('/:id', validateParams(idParamsSchema), controller)
```

Test huge, negative, nonnumeric, and invalid-date inputs; expect 400 and no repository call.

### R3-ME-05 — OAuth callback rejections can bypass Express

- **File:** `src/backend/controllers/oauth-google.controller.ts:50,64-70`
- **Related:** `controllers/oauth-onedrive.controller.ts:65,77-84`
- **Severity:** MEDIUM
- **Issue:** Nonce consumption, tenant/user reads, and permission resolution are awaited before the handlers enter their `try` blocks. Express 4 does not automatically forward rejected async handlers.
- **Impact:** A DB or permission-resolution failure can leave the callback hanging and emit an unhandled rejection rather than a sanitized response/redirect.
- **Recommended Fix:** Wrap the entire callback or use a shared Express 4 async adapter.

```ts
export const asyncHandler = (fn: RequestHandler): RequestHandler =>
  (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

router.get('/google/callback', asyncHandler(handleGoogleCallback))

async function handleGoogleCallback(req: Request, res: Response): Promise<void> {
  const verified = verifyOAuthState(String(req.query.state))
  if (!(await consumeNonce(verified.nonce, 'google'))) throw new OAuthError('Invalid state', 400)
  // every remaining await stays inside this promise boundary
}
```

Mock `consumeNonce()` and permission resolution failures; assert a completed sanitized response and zero `unhandledRejection` events.

### R3-ME-06 — Successful mutations can permanently lack an audit record

- **File:** `src/backend/middlewares/audit.middleware.ts:18-50`
- **Severity:** MEDIUM
- **Issue:** Audit persistence begins only after `res.finish`; failures are logged but never retried.
- **Impact:** Process termination or a transient DB failure after a privileged mutation produces a permanent audit gap even though the client received success.
- **Recommended Fix:** Write a durable audit/outbox entry in the same transaction as the mutation and deliver/materialize it with retry and dead-letter handling.

```ts
await prisma.$transaction(async (tx) => {
  const result = await mutateBusinessState(tx, command)
  await tx.auditOutbox.create({
    data: { tenantId, userId, action, recordId: result.id, details: sanitized },
  })
  return result
})
```

Force audit delivery failure and prove the transaction leaves a durable outbox row or rolls back.

### R3-ME-07 — Pet photo replacement deletes the good copy first

- **File:** `src/backend/services/pet.service.ts:92-109` (`uploadPetPhoto`)
- **Severity:** MEDIUM
- **Issue:** A format change deletes the existing file before saving the new one and updating the database.
- **Impact:** If storage or the DB fails, the pet row can still reference a deleted file; the replacement may also become orphaned.
- **Recommended Fix:** Save new, update DB, then delete old; compensate by deleting the new object if the DB update fails.

```ts
await driver.save(newKey, file.buffer, file.mimetype)
try {
  await petRepo.updatePetPhotoUrl(tenantId, petId, newKey)
} catch (error) {
  await driver.delete(newKey).catch(() => undefined)
  throw error
}
if (oldKey && oldKey !== newKey && isOwnTenantPhotoKey(tenantId, oldKey)) {
  await driver.delete(oldKey).catch((error) => logger.warn({ error, oldKey }, 'old photo cleanup failed'))
}
```

Fail a JPEG-to-PNG replacement during `save()` and DB update; the original file/reference must remain usable.

## Module: Frontend asynchronous state and resource lifecycle

### R3-ME-08 — Maintenance-mode mutations can resolve out of order

- **File:** `src/frontend/src/views/platform/PlatformSettingsView.tsx:42,141`
- **Severity:** MEDIUM
- **Issue:** The toggle and full-form save issue unrestricted updates against overlapping settings state. The optimistic toggle has no rollback and requests can resolve out of order.
- **Impact:** The UI can claim maintenance mode is off while the server has enabled it, unexpectedly blocking clinic logins, or vice versa.
- **Recommended Fix:** Serialize the mutation, separate maintenance from the form payload, and rollback/refetch on failure.

```ts
const maintenance = useMutation({
  mutationFn: (enabled: boolean) => api.patch('/platform/settings/maintenance', { enabled }),
  onMutate: async (enabled) => {
    await queryClient.cancelQueries({ queryKey: ['platform-settings'] })
    const previous = queryClient.getQueryData(['platform-settings'])
    queryClient.setQueryData(['platform-settings'], (old: Settings) => ({ ...old, maintenanceMode: enabled }))
    return { previous }
  },
  onError: (_error, _enabled, ctx) => queryClient.setQueryData(['platform-settings'], ctx?.previous),
  onSettled: () => queryClient.invalidateQueries({ queryKey: ['platform-settings'] }),
})
```

Disable both save paths while pending and test deferred responses resolving in reverse order.

### R3-ME-09 — Notification tests race across channels

- **File:** `src/frontend/src/views/settings/NotificationsPage.tsx:43,165,231`
- **Severity:** MEDIUM
- **Issue:** One shared channel string drives two buttons, but each button disables only for its own channel. LINE and SMS tests can run together; either completion clears the other's loading state and overwrites its result.
- **Impact:** Users can send duplicate/costly test notifications and see a success/failure belonging to the wrong channel.
- **Recommended Fix:** Disable all test actions while any test is pending and apply results only to the matching request generation.

```ts
const requestId = useRef(0)

async function testChannel(channel: 'line' | 'sms') {
  if (testingChannel) return
  const id = ++requestId.current
  setTestingChannel(channel)
  try {
    const result = await api.post(`/api/settings/notifications/test/${channel}`)
    if (id === requestId.current) setTestResult({ channel, ok: true, message: result.data.message })
  } finally {
    if (id === requestId.current) setTestingChannel(null)
  }
}
```

Test LINE and SMS deferred requests completing in both orders.

### R3-ME-10 — An old EMR timer can erase a newer save failure

- **File:** `src/frontend/src/views/clinic/ClinicEMR.tsx:476-495` (`saveRecord`)
- **Severity:** MEDIUM
- **Issue:** Every successful save schedules an uncancelled timeout that clears the shared message. A later failed save can set an error which the earlier success timer then removes; the timer also survives unmount.
- **Impact:** Unsaved clinical data can appear successfully saved or lose its visible error state.
- **Recommended Fix:** Own the timer in a ref, clear it before every save and on unmount, and couple it to the current save generation.

```ts
const clearMessageTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

useEffect(() => () => {
  if (clearMessageTimer.current) clearTimeout(clearMessageTimer.current)
}, [])

async function saveRecord() {
  if (clearMessageTimer.current) clearTimeout(clearMessageTimer.current)
  setSaveMsg('')
  try {
    await persistRecord()
    setSaveMsg('Saved')
    clearMessageTimer.current = setTimeout(() => setSaveMsg(''), 2_000)
  } catch {
    setSaveMsg('Save failed')
  }
}
```

Test success, then a second rejection, then advance fake timers; the failure must remain visible.

### R3-ME-11 — Attachment viewing can be silently blocked by popup policy

- **File:** `src/frontend/src/hooks/useEmrAttachmentUpload.ts:64-70`
- **Severity:** MEDIUM
- **Issue:** `window.open()` occurs only after the asynchronous Axios download. Browsers may no longer treat it as user-initiated, and a null popup result is ignored.
- **Impact:** A clinician clicks an attachment and sees nothing, with no indication that the browser blocked it.
- **Recommended Fix:** Open a placeholder synchronously or use a controlled download anchor, and surface popup blocking.

```ts
async function viewAttachment(id: number) {
  const popup = window.open('', '_blank', 'noopener,noreferrer')
  if (!popup) throw new Error('Popup blocked. Allow popups to view this attachment.')
  try {
    const blob = await downloadAttachment(id)
    const url = URL.createObjectURL(blob)
    popup.location.replace(url)
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  } catch (error) {
    popup.close()
    throw error
  }
}
```

Verify `window.open` happens before a deferred request resolves and null handles produce a visible error.

### R3-LO-01 — Pet-photo preview object URLs are never revoked

- **File:** `src/frontend/src/views/clinic/ClinicPets.tsx:221-225,351-355`
- **Severity:** LOW
- **Issue:** Both pet modals create a new blob URL for every selected file without revoking the previous URL or the final URL on unmount.
- **Impact:** Repeated large camera-image previews retain browser memory until page unload.
- **Recommended Fix:** Centralize preview ownership and revoke on replacement/unmount.

```ts
useEffect(() => {
  if (!photoFile) { setPhotoPreview(null); return }
  const url = URL.createObjectURL(photoFile)
  setPhotoPreview(url)
  return () => URL.revokeObjectURL(url)
}, [photoFile])
```

Select A then B and close the modal; tests must observe revocation of both URLs.

## Round 3 regression and verification requirements

Minimum new concurrency suites:

- overlapping appointment creation;
- groomer capacity at the final slot;
- parallel invoice sequence allocation;
- discharge vs discharge, care, and delete;
- donor collection and blood-bag claim races;
- every subscription quota at `limit - 1`;
- role assignment vs deletion;
- receipts for distinct inventory lots.

Minimum new failure/resource suites:

- deeply nested audit payload rejected without process exit;
- bounded-memory concurrent uploads;
- invalid/huge query, path, and date input rejected before repository access;
- OAuth dependency rejection handled without `unhandledRejection`;
- durable audit outbox behavior;
- pet-photo storage/DB compensation;
- reverse-order frontend mutation results and timer cleanup.

## Audit coverage and residual verification

| Check | Result | Evidence / limitation |
|---|---|---|
| Repository-wide static review | **COMPLETE** | Backend, frontend, Prisma schema/migrations, auth/RBAC, storage, jobs, and tests reviewed across three rounds. |
| Backend TypeScript | **PASS** | `node node_modules/typescript/bin/tsc --noEmit` completed successfully on 2026-08-04. |
| Frontend TypeScript | **PASS** | `node node_modules/typescript/bin/tsc --noEmit` completed successfully on 2026-08-04. |
| Backend integration/security tests | **BLOCKED** | Test bootstrap requires PostgreSQL; `localhost:5432` was unavailable. This is an environment limitation, not a pass. |
| Frontend full test/build | **INCONCLUSIVE** | Prior run transformed 1,299 modules but exceeded the 120-second audit window. |
| Dependency vulnerability scan | **BLOCKED** | Registry/network access was unavailable; package versions must not be considered cleared. |
| Dynamic concurrency/load tests | **NOT PRESENT** | The required races and upload memory cases above are not currently covered. |

This document is complete as a **static repository audit and remediation handoff**. It does not claim runtime, dependency, load, or database-security clearance. Claude Code must keep each finding open until its regression test passes against the real PostgreSQL application role and production-like storage configuration.

## Final production-readiness decision

**REJECTED until all CRITICAL and HIGH findings are closed and the security test gate passes against PostgreSQL.**

Medium findings affecting error disclosure, migrations, CI, permission freshness, and session isolation should also block production because they directly weaken diagnosis and prevention of the critical tenant/RBAC failures.
