# Coding Rules & Developer Guidelines — VetClinic SaaS

**Version:** 1.0  
**Applies to:** All agents and human developers  
**Last Updated:** 2026-06-04

> These rules are non-negotiable. Every PR must pass these standards before merge.

---

## Table of Contents

1. [Directory Structure & Naming Conventions](#1-directory-structure--naming-conventions)
2. [Architecture Patterns](#2-architecture-patterns)
3. [TypeScript Rules](#3-typescript-rules-strict-mode)
4. [Security](#4-security)
5. [Input Validation](#5-input-validation)
6. [Error Handling](#6-error-handling)
7. [Database Rules](#7-database-rules)
8. [Code Style & Quality](#8-code-style--quality)
9. [Testing Rules](#9-testing-rules)
10. [Frontend Component Rules](#10-frontend-component-rules)
11. [Design Patterns Reference](#11-design-patterns-reference)
12. [GitHub Workflow](#12-github-workflow)
13. [CI/CD & Environment](#13-cicd--environment)

---

## 1. Directory Structure & Naming Conventions

### Backend (`src/backend/`)

```
src/backend/
  config/           # env, db, jwt config — one file per concern
  controllers/      # thin HTTP handlers only
  middlewares/      # auth, rbac, validate, rate-limit
  models/           # Prisma schema + repository layer
  services/         # business logic — no req/res objects here
  routes/           # route definitions — import controller + middleware
  utils/            # shared helpers (logger, crypto, pagination)
  types/            # shared TypeScript interfaces & enums
```

| Layer | File Pattern | Example |
|---|---|---|
| Route | `routes/<module>.routes.ts` | `routes/appointment.routes.ts` |
| Controller | `controllers/<module>.controller.ts` | `controllers/appointment.controller.ts` |
| Service | `services/<module>.service.ts` | `services/appointment.service.ts` |
| Repository | `models/<module>.repository.ts` | `models/appointment.repository.ts` |
| Middleware | `middlewares/<name>.middleware.ts` | `middlewares/auth.middleware.ts` |

### Frontend (`src/frontend/src/`)

```
src/frontend/src/
  components/       # generic, reusable — no business logic
  views/
    clinic/         # ClinicDashboard, ClinicPets, ClinicEMR …
    admin/          # AdminView
  hooks/            # custom React hooks
  store/            # Zustand stores
  utils/            # shared helpers
  types/            # shared TS interfaces
```

| Layer | File Pattern | Example |
|---|---|---|
| View | `views/<domain>/<Name>View.tsx` | `views/clinic/ClinicPetsView.tsx` |
| Component | `components/<Name>.tsx` | `components/PetCard.tsx` |
| Hook | `hooks/use<Name>.ts` | `hooks/useAppointments.ts` |
| Store | `store/<name>Store.ts` | `store/authStore.ts` |
| Util | `utils/<name>.util.ts` | `utils/date.util.ts` |

### Shared (`src/shared/`)

```
src/shared/
  schemas/          # Zod schemas shared between frontend and backend
  constants/        # app-wide enums, status codes, role definitions
  types/            # DTOs and shared TypeScript types
```

> **TIP:** Keeping Zod schemas in `src/shared/schemas/` means frontend and backend validate the same contract — a schema change cannot go unnoticed on one side.

### Naming Rules

- **Files:** `kebab-case` (e.g., `pet-owner.repository.ts`)
- **Classes/Components:** `PascalCase` (e.g., `AppointmentService`)
- **Functions/Variables:** `camelCase` (e.g., `getActivePets`)
- **Constants/Enums:** `UPPER_SNAKE_CASE` (e.g., `MAX_FILE_SIZE_BYTES`)
- **Database tables:** `snake_case` (e.g., `pet_medical_records`)
- **API routes:** `kebab-case` (e.g., `/api/v1/pet-owners`)
- One default export per view/component file; named exports for utilities.
- Test files co-located: `<name>.test.ts` (unit) and `<name>.integration.test.ts`.

---

## 2. Architecture Patterns

### Backend: Layered Architecture (non-negotiable)

```
HTTP Request
  → Route (express router)
  → authMiddleware (verify JWT, attach req.user)
  → rbacMiddleware (check role permission)
  → validateMiddleware (Zod parse body/params)
  → Controller (parse req, call service, send res)
  → Service (business logic — pure functions)
  → Repository (DB queries — always receives tenantId)
  → PostgreSQL
```

**Controller — thin handler only:**
```typescript
// GOOD — controller does exactly three things: parse, call, respond
async create(req: Request, res: Response): Promise<void> {
  const dto = req.validatedBody as CreateAppointmentDto;
  const { tenantId } = req.user;
  const result = await appointmentService.create(tenantId, dto);
  res.status(201).json(result);
}
```

**Service — owns all business rules:**
```typescript
// GOOD — no req/res, receives plain values, returns plain data
async create(tenantId: string, dto: CreateAppointmentDto): Promise<Appointment> {
  await this.checkConflict(tenantId, dto.doctorId, dto.scheduledAt);
  return appointmentRepository.create(tenantId, dto);
}

// BAD — service must never touch req/res
async create(req: Request) { ... }
```

**Repository — owns all DB interaction:**
```typescript
// GOOD — tenantId is always the first explicit parameter
async create(tenantId: string, dto: CreateAppointmentDto): Promise<Appointment> {
  return prisma.appointment.create({
    data: { ...dto, tenant_id: tenantId }
  });
}
```

> **TIP:** If a service needs another service, pass it as a constructor parameter. Never import and `new` inside a method — that breaks unit testing.

### Frontend: Component Hierarchy

```
View (page-level, routes here)
  └── Feature Components (domain-specific, may call React Query)
        └── Shared Components (generic — Button, Modal, Input)
              └── Primitives (icons, typography tokens)
```

- Views compose feature components — they contain no raw HTML logic.
- React Query hooks live in `hooks/` and are called in Views or Feature Components.
- Shared components receive all data via props — no direct store access.
- Zustand stores hold only local UI state (sidebar open, active tab, form draft).

---

## 3. TypeScript Rules (Strict Mode)

```jsonc
// tsconfig.json — required settings
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

**Explicit types on all exported functions:**
```typescript
// GOOD
export async function getPetById(tenantId: string, petId: string): Promise<Pet | null> { ... }

// BAD — implicit return type
export async function getPetById(tenantId: string, petId: string) { ... }
```

**No `any` — use `unknown` then narrow:**
```typescript
// BAD
function processPayload(data: any) { ... }

// GOOD
function processPayload(data: unknown) {
  const parsed = PayloadSchema.parse(data); // Zod narrows to typed value
}
```

**DTOs for all API boundaries:**
```typescript
// Define clear in/out contracts
interface CreatePetDto {
  readonly name: string;
  readonly species: PetSpecies;
  readonly weight: number;
  readonly dateOfBirth?: string;
}

interface PetResponse {
  id: string;
  name: string;
  species: PetSpecies;
  createdAt: string;
}
```

**Enums for fixed value sets:**
```typescript
enum AppointmentStatus {
  Scheduled = 'scheduled',
  Confirmed = 'confirmed',
  InProgress = 'in_progress',
  Completed = 'completed',
  Cancelled = 'cancelled',
  NoShow = 'no_show',
}
```

---

## 4. Security

### 4.1 Authentication & JWT

- Token must embed `tenant_id`, `branch_id`, `user_id`, `role`. Middleware signs and verifies.
- Access token TTL: 8 hours. Refresh token: 30 days (rotated on each use).
- `tenant_id` is ALWAYS taken from `req.user` (set by middleware). Never from `req.body`.
- Refresh tokens stored hashed in DB. On logout, invalidate the stored hash.

```typescript
// GOOD — from verified token
const { tenantId, userId, role } = req.user;

// BAD — never trust client-supplied tenant
const tenantId = req.body.tenantId; // FORBIDDEN
const tenantId = req.headers['x-tenant-id']; // FORBIDDEN
```

### 4.2 Multi-Tenant Isolation (Iron Rule)

Every `SELECT`, `INSERT`, `UPDATE`, `DELETE` on a tenant-scoped table **must** filter by `tenant_id`:

```typescript
// GOOD — always scoped
await prisma.pet.findMany({ where: { tenant_id: tenantId } });
await prisma.pet.update({ where: { id: petId, tenant_id: tenantId }, data });

// BAD — cross-tenant data leak
await prisma.pet.findUnique({ where: { id: petId } }); // FORBIDDEN
```

> Return `404` (not `403`) when cross-tenant resource access is detected — never leak that the record exists.

### 4.3 SQL & Injection Prevention

- Use Prisma ORM or parameterized queries exclusively — never string-interpolate user input into SQL.
- For raw SQL (reporting only): use `$queryRaw` with tagged template literals, never string concatenation.
- Validate all IDs are valid UUIDs before query (prevents NoSQL-style injection on Prisma's `where` clauses).

```typescript
// GOOD — parameterized
await prisma.$queryRaw`SELECT * FROM pets WHERE tenant_id = ${tenantId} AND id = ${petId}`;

// BAD — string interpolation
await prisma.$queryRawUnsafe(`SELECT * FROM pets WHERE id = '${petId}'`);
```

### 4.4 Input & File Security

- Validate MIME type from **magic bytes** (first bytes of file buffer), not from `Content-Type` header or file extension.
- Allowed file types: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`. All others rejected.
- Maximum file size: 20 MB. Enforce in multer config AND re-validate in service.
- Store uploaded files in S3 (or equivalent). Never serve files from the app server.
- Generate a fresh UUID for the stored filename — never use the original filename.

```typescript
import fileType from 'file-type';

async function validateFileBuffer(buffer: Buffer): Promise<void> {
  const type = await fileType.fromBuffer(buffer);
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (!type || !allowed.includes(type.mime)) {
    throw new AppError(400, 'Invalid file type', 'INVALID_FILE_TYPE');
  }
}
```

### 4.5 HTTP Security Headers

Apply `helmet` middleware to every Express app:

```typescript
import helmet from 'helmet';
app.use(helmet()); // sets CSP, X-Frame-Options, HSTS, etc.
```

Additional rules:
- CORS: whitelist only known frontend origins. No wildcard `*` in production.
- Rate-limit `/auth/login` and `/auth/refresh`: 10 requests per minute per IP.
- Responses never include `password_hash`, raw DB IDs from other tenants, or server version headers.

### 4.6 Secrets Management

- **No secrets in code** — not even in comments or examples.
- `.env` files are local only — never committed. Use `.env.example` with placeholder values.
- Production secrets stored in AWS Secrets Manager (or equivalent). Loaded at app startup.
- Rotate `JWT_SECRET` on any suspected breach. All active tokens are immediately invalidated.
- Audit secret access in production via IAM role logs.

---

## 5. Input Validation

### 5.1 Backend — Zod at Every Endpoint

Every route must pass through a `validate()` middleware before the controller runs:

```typescript
// routes/pet.routes.ts
router.post('/', authMiddleware, rbacMiddleware('staff'), validate(CreatePetSchema), petController.create);

// middleware/validate.middleware.ts
function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        fields: result.error.flatten().fieldErrors,
      });
    }
    req.validatedBody = result.data; // strip unknown fields automatically
    next();
  };
}
```

**Zod schema patterns:**
```typescript
// src/shared/schemas/pet.schema.ts
export const CreatePetSchema = z.object({
  name:        z.string().trim().min(1, 'Name required').max(100),
  species:     z.enum(['dog', 'cat', 'rabbit', 'bird', 'other']),
  weight:      z.number().positive('Weight must be positive').max(500),
  dateOfBirth: z.string().datetime().optional(),
  microchipId: z.string().max(50).optional(),
});

// Cross-field validation example
export const CreateAppointmentSchema = z.object({
  scheduledAt: z.string().datetime(),
  durationMin: z.number().int().min(15).max(480),
}).refine(
  (data) => new Date(data.scheduledAt) > new Date(),
  { message: 'Appointment must be in the future', path: ['scheduledAt'] }
);
```

**Rules:**
- Use `.strict()` on all schemas to reject unknown fields (prevents mass-assignment attacks).
- Always `.trim()` string inputs.
- Validate UUID format for all ID parameters: `z.string().uuid()`.
- Validate query params separately with a `validateQuery()` variant middleware.

### 5.2 Frontend — React Hook Form + Zod

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CreatePetSchema } from '@shared/schemas/pet.schema';

const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
  resolver: zodResolver(CreatePetSchema),
});
```

- Show inline errors on `blur` (not only on submit).
- Disable the submit button while `isSubmitting` is true (prevent double-submit).
- Numeric inputs: use `type="number"` with `min`/`max` attributes.
- Server-side validation errors (400 response): map field errors back to form fields.

---

## 6. Error Handling

### 6.1 Typed Error Classes

```typescript
// src/backend/utils/errors.ts

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(404, `${resource} not found`, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code = 'CONFLICT') {
    super(409, message, code);
  }
}

export class ForbiddenError extends AppError {
  constructor() {
    super(403, 'Access denied', 'FORBIDDEN');
  }
}
```

### 6.2 Global Error Handler Middleware

```typescript
// middlewares/errorHandler.middleware.ts
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof AppError) {
    logger.warn({ code: err.code, path: req.path }, err.message);
    return res.status(err.statusCode).json({ error: err.message, code: err.code });
  }
  // Unexpected errors — log full stack, return generic message
  logger.error({ err }, 'Unhandled error');
  return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
});
```

### 6.3 Error Handling Rules

| Rule | Detail |
|---|---|
| Never swallow errors | `catch (e) {}` is forbidden. Log or rethrow. |
| Log internally, sanitize externally | Stack traces never reach API responses. |
| 404 for cross-tenant | Return 404 (not 403) when a cross-tenant ID is guessed. |
| Idempotent errors | If the same operation is retried, return the same result — not a new error. |
| HTTP status codes | 400 bad input · 401 unauthenticated · 403 no permission · 404 not found · 409 conflict · 422 semantic error · 429 rate limited · 500 server fault |

### 6.4 Frontend Error Handling

```typescript
// React Query mutation pattern
const mutation = useMutation({
  mutationFn: createPet,
  onSuccess: () => toast.success('Pet saved'),
  onError: (error: ApiError) => {
    if (error.statusCode === 400) {
      // Map server field errors back to form
      Object.entries(error.fields ?? {}).forEach(([field, msg]) =>
        setError(field as keyof CreatePetDto, { message: String(msg) })
      );
    } else {
      toast.error('Something went wrong. Please try again.');
    }
  },
});
```

- Wrap the app root with an `ErrorBoundary` to catch unhandled render errors.
- Show a persistent offline banner when `navigator.onLine` is false.
- Never expose raw error objects in the UI — always map to user-friendly messages.

### 6.5 Structured Logging Format

```typescript
// All logs must be structured JSON (pino or winston)
logger.info({ tenantId, userId, action: 'create_pet', petId: result.id }, 'Pet created');
logger.error({ tenantId, err, path: req.path }, 'Failed to create pet');
```

Log levels: `error` (action failed) · `warn` (suspicious/recoverable) · `info` (business events) · `debug` (dev only, never in production).

---

## 7. Database Rules

### 7.1 Query Safety

- Every query on a tenant-scoped table includes `WHERE tenant_id = :tenantId` — no exceptions.
- Repository functions receive `tenantId` as the **first parameter**, always.
- No raw SQL with string interpolation. Use Prisma ORM or `$queryRaw` tagged templates.
- Validate UUIDs before any DB lookup to prevent injection through ID params.

### 7.2 Schema & Migration Rules

- Every migration has an `up` and `down` script.
- New indexes on live tables: `CREATE INDEX CONCURRENTLY` (no table lock).
- Composite indexes lead with `tenant_id`: `(tenant_id, created_at DESC)`.
- Foreign keys must have indexes. Never add an FK without checking the index.
- Column renames: add the new column → dual-write → backfill → drop old column across separate migrations.

### 7.3 Performance Rules

- All list endpoints paginated. Small tables: `LIMIT`/`OFFSET`. Large tables: cursor-based.
- Avoid N+1 queries. Use Prisma `include` or explicit JOIN.
- `SELECT *` is forbidden. Always name the columns you need.
- Long-running reports go to a read replica or an async job — never on the primary write path.

---

## 8. Code Style & Quality

### General Rules

- No `console.log` in committed code — use the logger (`pino` or `winston`).
- No magic numbers or strings — define named constants or enums.
- Functions ≤ 40 lines. If longer, extract a named helper with a clear name.
- Maximum cyclomatic complexity: 5. If higher, split or simplify.
- No commented-out code — delete it. Git history preserves it.
- No `TODO` comments in committed code. Open a GitHub Issue instead.
- `readonly` on all DTO and config properties that must not mutate.

### Import Order (enforced by ESLint)

```typescript
// 1. Node built-ins
import path from 'path';

// 2. External packages
import express from 'express';
import { z } from 'zod';

// 3. Internal absolute imports (@shared, @backend, @frontend)
import { AppError } from '@backend/utils/errors';
import { CreatePetSchema } from '@shared/schemas/pet.schema';

// 4. Relative imports
import { petRepository } from '../models/pet.repository';
```

---

## 9. Testing Rules

### Test Pyramid

| Type | Tool | Target Coverage |
|---|---|---|
| Unit | Jest | Services: 90%+ |
| Integration | Jest + supertest | API routes: 80%+ |
| Security (isolation) | Jest custom | Tenant isolation: 100% |
| E2E | Playwright | Critical user flows: 100% |

### Unit Tests

```typescript
// Pattern: Arrange → Act → Assert
describe('AppointmentService.create', () => {
  it('throws ConflictError when doctor is double-booked', async () => {
    mockRepo.hasConflict.mockResolvedValue(true);
    await expect(
      appointmentService.create(TENANT_ID, dto)
    ).rejects.toThrow(ConflictError);
  });
});
```

- Mock only external dependencies (DB, email, S3). Never mock the service under test.
- Every service method: 1 happy path + minimum 2 edge cases (empty input, boundary value, conflict).

### Integration Tests

- **Must hit a real test database** — no mocking the repository layer in integration tests.
- Use a separate `test` database schema seeded in `beforeAll`.
- Clean state between tests: wrap in a transaction rolled back after each test.

### Security / Tenant Isolation Tests

```typescript
// Verify cross-tenant rejection for every protected resource
it('returns 404 when tenant B tries to access tenant A pet', async () => {
  const res = await request(app)
    .get(`/api/v1/pets/${tenantAPetId}`)
    .set('Authorization', `Bearer ${tenantBToken}`);
  expect(res.status).toBe(404);
});
```

These tests are mandatory before every PR merge. Run with `npm run test:security`.

---

## 10. Frontend Component Rules

- No inline styles — Tailwind only. No raw hex colors in JSX.
- Token names only: `bg-primary` not `bg-black`. All tokens from `tailwind.config.js`.
- All tap targets: `min-h-[44px] min-w-[44px]`.
- No hover-only interactive states — touch devices have no hover.
- Icons: Material Symbols Outlined exclusively. No emoji in navigation.
- Lazy-load all heavy views:
  ```typescript
  const ClinicEMR = React.lazy(() => import('./views/clinic/ClinicEMR'));
  ```
- No `useEffect` for data fetching — use React Query hooks.
- `key` props on lists must be stable IDs, not array indexes.
- Memoize only when a profiler confirms a render performance problem.

---

## 11. Design Patterns Reference

### Repository Pattern
**Use:** All database access — never call Prisma/SQL directly from a service.  
**Why:** Keeps services unit-testable; swapping the database requires changes in one place.  
**When NOT to use:** Simple one-off scripts or admin tools that never need testing.

### Middleware Chain
**Use:** Auth verification, RBAC, input validation, rate limiting, logging.  
**Why:** Single-responsibility functions composable in any route definition.  
**Order is critical:** `auth → rbac → validate → controller`.

### DTO (Data Transfer Object)
**Use:** Typed contracts at every API boundary (request body in, response body out).  
**Why:** Prevents accidental exposure of internal DB fields.  
**Rule:** DTOs should never extend DB models — they are separate types.

### Strategy Pattern
**Use:** Payment methods (PromptPay, credit card, cash), notification channels (LINE, SMS, email).  
**Why:** Adding a new payment method requires one new class, zero changes to existing code.
```typescript
interface PaymentStrategy {
  charge(amount: number, details: PaymentDetails): Promise<Receipt>;
}
class PromptPayStrategy implements PaymentStrategy { ... }
class CreditCardStrategy implements PaymentStrategy { ... }
```

### Observer / Event Emitter
**Use:** Audit logs, push notifications, EMR save triggers.  
**Why:** Decouples the core action from side effects; side effects can be added without touching the core.  
**When NOT to use:** Critical business logic that must succeed synchronously (e.g., inventory deduction).

### Optimistic Lock
**Use:** Any record two staff members can edit simultaneously — inventory deduct, EMR save.  
**How:** Add a `version` integer column. On update: `WHERE id = $id AND version = $expectedVersion`. If 0 rows updated → throw `ConflictError`.

### Idempotency Key
**Use:** Payment processing, file uploads, any operation that must not execute twice.  
**How:** Client sends a UUID `Idempotency-Key` header. Server caches the result for 24h and returns it on replay.

---

## 12. GitHub Workflow

### Branch Naming

```
main          — production-ready code only; deploys automatically
staging       — integration testing; merges from feature branches
feature/<ticket-id>-short-description    e.g. feature/VET-142-add-microchip-search
fix/<ticket-id>-short-description        e.g. fix/VET-201-double-booking-race
chore/<description>                      e.g. chore/upgrade-prisma-5
hotfix/<ticket-id>-short-description     e.g. hotfix/VET-305-payment-null-crash
```

Rules:
- Branch from `staging` (not `main`) for feature/fix work.
- Hotfixes branch from `main` and must be back-merged to `staging` immediately after.
- Delete branches after merge. No long-lived personal branches.

### Commit Message Convention (Conventional Commits)

```
<type>(<scope>): <short imperative summary under 72 chars>

[optional body — why, not what]

[optional footer: Closes #issue-number]
```

**Types:**
| Type | When |
|---|---|
| `feat` | New feature visible to users |
| `fix` | Bug fix |
| `refactor` | Code restructure, no behavior change |
| `test` | Adding or updating tests |
| `chore` | Deps, tooling, config — no src changes |
| `docs` | Documentation only |
| `perf` | Performance improvement |

**Examples:**
```
feat(appointments): add double-booking conflict detection

fix(auth): return 401 on expired refresh token instead of 500

test(pets): add cross-tenant isolation test for GET /pets/:id

Closes #142
```

- No generic messages: `"fix bug"`, `"update"`, `"wip"` are rejected by CI.
- Each commit is a coherent unit — one concern per commit.

### Pull Request Rules

**PR title** must follow Conventional Commits format (same as commit messages).

**PR must include:**
- [ ] Description: what changed and why (link to ticket)
- [ ] Test plan: steps to verify manually
- [ ] Screenshots for any UI change (before/after)

**PR size:**
- Aim for < 400 lines of diff per PR.
- If a feature is large, split into a base PR (types + schema) and a follow-up PR (implementation).

**Required approvals before merge:**
- 1 approval for `chore`/`docs`/`test`
- 2 approvals for `feat`/`fix` touching backend or database
- `@db-agent` review required for any migration or query change
- `@qa-agent` sign-off required for any change touching auth or tenant isolation

**Merge strategy:**
- Use **Squash and Merge** for `feature/*` and `fix/*` branches (keeps `staging` history clean).
- Use **Merge Commit** for `hotfix/*` → `main` (preserves the fix context).
- Never force-push to `staging` or `main`.

### Code Review Checklist

Reviewers must check:
- [ ] Multi-tenant: every DB query filtered by `tenantId`
- [ ] No `any` TypeScript types
- [ ] Zod validation on every new endpoint
- [ ] No raw SQL string interpolation
- [ ] No secrets or `.env` values in diff
- [ ] Tests added/updated for new behavior
- [ ] Error returned is the correct HTTP status code
- [ ] No `console.log` statements

---

## 13. CI/CD & Environment

### Environment Tiers

| Tier | Branch | Purpose |
|---|---|---|
| `development` | local | Individual developer machines |
| `staging` | `staging` | Integration testing, QA sign-off |
| `production` | `main` | Live tenant data |

**Parity rule:** Staging must mirror production — same Node.js version, same OS, same database engine version, same env var names (different values only).

### Environment Variables

- Every env var is documented in `.env.example` with a description and example format.
- Required vars fail loudly at startup if missing (no silent fallback to defaults).
- No default values for security-critical vars (`JWT_SECRET`, `DB_PASSWORD`, `AWS_SECRET_ACCESS_KEY`).

```typescript
// config/env.ts — fail fast on missing required vars
function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export const config = {
  jwtSecret:   requireEnv('JWT_SECRET'),
  databaseUrl: requireEnv('DATABASE_URL'),
  port:        parseInt(process.env.PORT ?? '3000', 10),
};
```

### Secrets Rules

- **Never commit secrets.** Pre-commit hook checks for common patterns (API keys, passwords).
- Rotate `JWT_SECRET` when any developer leaves the team or on any suspected breach.
- Production secrets live in AWS Secrets Manager (or equivalent), loaded at startup.
- Different `JWT_SECRET` per tier — staging secret never equals production.

### CI Pipeline (GitHub Actions)

Every PR to `staging` or `main` must pass this pipeline before merge:

```
1. Lint (ESLint + TypeScript compile — zero errors)
2. Unit tests (npm run test — 100% pass)
3. Security tests (npm run test:security — 100% pass)
4. Build (Vite frontend + tsc backend — zero errors)
5. Integration tests (npm run test:integration — against test DB)
6. E2E smoke test (Playwright — critical paths only)
```

No `--no-verify` flag allowed. If a hook fails, fix the root cause.

### Deployment Rules

- **Staging** deploys automatically on merge to `staging` branch (after CI passes).
- **Production** requires manual approval in GitHub Actions after staging passes.
- Database migrations run before the new app version starts.
- Rollback plan documented in every PR that includes a migration.
- Health check endpoint (`GET /health`) must respond 200 within 30s after deploy or rollback triggers.

### Pre-Production Checklist

Before any production deploy:
- [ ] `npm run test` — 100% pass
- [ ] `npm run test:security` — 100% pass  
- [ ] TypeScript build — zero errors
- [ ] No `console.log` in diff
- [ ] Migration dry-run passes on staging DB
- [ ] Rollback SQL script prepared
- [ ] New index created with `CONCURRENTLY` (no table lock)
- [ ] `JWT_SECRET` and `DB_PASSWORD` confirmed different from staging values
- [ ] Sentry / error tracking connected to new version
- [ ] Database backup verified within last 24h

---

*Version: 1.0 | VetClinic SaaS | Maintained by: @dev-agent + @qa-agent | Updated: 2026-06-04*
