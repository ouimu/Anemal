# Backend Coding Rules

> **Audience:** Backend engineers, API developers  
> **See also:** [Index](00-index.md) | [Security Rules](05-security-rules.md)

---

## Directory Structure (Backend)

```
src/backend/
  config/           # env, db, jwt config
  controllers/      # thin HTTP handlers only
  middlewares/      # auth, rbac, validate, rate-limit
  models/           # Prisma schema + repository layer
  services/         # business logic — no req/res objects
  routes/           # route definitions
  utils/            # shared helpers (logger, crypto)
  types/            # shared TypeScript interfaces
```

| Layer | Pattern | Example |
|-------|---------|---------|
| Route | `routes/<module>.routes.ts` | `routes/appointment.routes.ts` |
| Controller | `controllers/<module>.controller.ts` | `controllers/appointment.controller.ts` |
| Service | `services/<module>.service.ts` | `services/appointment.service.ts` |
| Repository | `models/<module>.repository.ts` | `models/appointment.repository.ts` |
| Middleware | `middlewares/<name>.middleware.ts` | `middlewares/auth.middleware.ts` |

### Naming Conventions

- **Files:** `kebab-case` (e.g., `pet-owner.repository.ts`)
- **Classes:** `PascalCase` (e.g., `AppointmentService`)
- **Functions:** `camelCase` (e.g., `getActivePets`)
- **Constants:** `UPPER_SNAKE_CASE` (e.g., `MAX_FILE_SIZE_BYTES`)
- **DB tables:** `snake_case` (e.g., `pet_medical_records`)
- **API routes:** `kebab-case` (e.g., `/api/v1/pet-owners`)

---

## Layered Architecture (Non-Negotiable)

```
HTTP Request
  → Route (express router)
  → authMiddleware (verify JWT, attach req.user)
  → rbacMiddleware (check role permission)
  → validateMiddleware (Zod parse body/params)
  → Controller (parse req, call service, send res)
  → Service (business logic)
  → Repository (DB queries)
  → PostgreSQL
```

### Controller — Thin Handler Only

```typescript
async create(req: Request, res: Response): Promise<void> {
  const dto = req.validatedBody as CreateAppointmentDto;
  const { tenantId } = req.user;
  const result = await appointmentService.create(tenantId, dto);
  res.status(201).json(result);
}
```

### Service — Owns All Business Rules

```typescript
async create(tenantId: string, dto: CreateAppointmentDto): Promise<Appointment> {
  await this.checkConflict(tenantId, dto.doctorId, dto.scheduledAt);
  return appointmentRepository.create(tenantId, dto);
}

// BAD — never touch req/res in service
async create(req: Request) { ... }
```

### Repository — Owns All DB Interaction

```typescript
async create(tenantId: string, dto: CreateAppointmentDto): Promise<Appointment> {
  return prisma.appointment.create({
    data: { ...dto, tenant_id: tenantId }
  });
}
```

**Rule:** `tenantId` is always the first explicit parameter.

---

## Code Style & Quality

- No `console.log` — use Winston logger
- No magic numbers — define constants
- Functions ≤ 40 lines. Extract helpers if longer.
- Maximum cyclomatic complexity: 5
- No commented-out code — delete it
- No `TODO` comments in code — open GitHub Issue
- `readonly` on all DTO and config properties

### Import Order

```typescript
// 1. Node built-ins
import path from 'path';

// 2. External packages
import express from 'express';
import { z } from 'zod';

// 3. Internal absolute imports
import { AppError } from '@backend/utils/errors';
import { CreatePetSchema } from '@shared/schemas/pet.schema';

// 4. Relative imports
import { petRepository } from '../models/pet.repository';
```

---

## Performance Rules

- All list endpoints paginated (LIMIT/OFFSET for small, cursor for large tables)
- Avoid N+1 queries — use Prisma `include` or explicit JOIN
- No `SELECT *` — name the columns you need
- Long-running reports go to async jobs, not on main request path

---

**See also:** [Security Rules](05-security-rules.md) | [Database Rules](04-database-rules.md)
