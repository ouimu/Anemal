# Security, TypeScript & Validation Rules

> **Audience:** All developers; critical for security-sensitive work  
> **See also:** [Index](00-index.md)

---

## TypeScript Rules (Strict Mode)

**Required tsconfig.json:**
```json
{
  "strict": true,
  "noImplicitAny": true,
  "noUnusedLocals": true,
  "noUnusedParameters": true
}
```

**Rules:**
- **No `any` types** — use `unknown` then narrow with Zod
- **Explicit return types** on all exports
  ```typescript
  // GOOD
  export async function getPetById(id: string): Promise<Pet | null> { ... }
  
  // BAD
  export async function getPetById(id: string) { ... }
  ```
- **DTOs for API boundaries** — clear in/out contracts
- **Enums for fixed value sets**

---

## Authentication & JWT

- Token embeds: `tenant_id`, `branch_id`, `user_id`, `role`
- Access token TTL: 8 hours
- Refresh token: 30 days (rotated on each use)
- **`tenant_id` ALWAYS from `req.user`** — never from request body

```typescript
// GOOD
const { tenantId, userId, role } = req.user;

// BAD
const tenantId = req.body.tenantId; // FORBIDDEN
const tenantId = req.headers['x-tenant-id']; // FORBIDDEN
```

---

## Multi-Tenant Isolation (Iron Rule)

Every `SELECT`, `INSERT`, `UPDATE`, `DELETE`:
```typescript
// GOOD
await prisma.pet.findMany({ where: { tenant_id: tenantId } });

// BAD
await prisma.pet.findUnique({ where: { id: petId } }); // Data leak!
```

**Return 404 (not 403) on cross-tenant access** — never leak that record exists.

---

## SQL & Injection Prevention

- Prisma ORM exclusively — never string-interpolate user input
- For raw SQL: use `$queryRaw` with tagged templates
- Validate all IDs are valid UUIDs before query

```typescript
// GOOD
await prisma.$queryRaw`SELECT * FROM pets WHERE tenant_id = ${tenantId}`;

// BAD
await prisma.$queryRawUnsafe(`SELECT * FROM pets WHERE id = '${petId}'`);
```

---

## Input Validation (Zod at Every Endpoint)

```typescript
// routes
router.post('/', authMiddleware, validate(CreatePetSchema), controller.create);

// middleware
function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        fields: result.error.flatten().fieldErrors,
      });
    }
    req.validatedBody = result.data;
    next();
  };
}
```

**Rules:**
- Use `.strict()` to reject unknown fields
- Always `.trim()` strings
- Validate UUIDs: `z.string().uuid()`
- Cross-field validation with `.refine()`

---

## File Upload Security

- Validate MIME type from **magic bytes**, not Content-Type header
- Allowed types: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`
- Max size: 20 MB (enforce in multer AND service)
- Store in S3 — never on app server
- Generate fresh UUID for filename — never use original

---

## HTTP Security

- Use `helmet` middleware
- CORS: whitelist known origins (no `*` in production)
- Rate-limit `/auth/login` and `/auth/refresh`: 10 req/min per IP
- Never return `password_hash`, other-tenant IDs, or server version

---

## Error Handling

```typescript
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code: string,
  ) {
    super(message);
  }
}
```

**Rules:**
- Never swallow errors — log or rethrow
- Log internally, sanitize externally
- 404 for cross-tenant access
- Return appropriate HTTP status codes

---

## Secrets Management

- **No secrets in code** — not in comments either
- `.env` local only — use `.env.example` with placeholders
- Production secrets in AWS Secrets Manager
- Rotate `JWT_SECRET` on any breach
- Audit secret access via IAM logs

---

## Logging (Structured Only)

```typescript
// GOOD — structured JSON
logger.info({ tenantId, userId, action: 'create_pet' }, 'Pet created');

// BAD — console.log
console.log('Pet created'); // FORBIDDEN
```

**Log levels:** `error` (failed) | `warn` (suspicious) | `info` (business) | `debug` (dev only)

---

**See also:** [Database Rules](04-database-rules.md) | [Testing Rules](03-testing-rules.md)
