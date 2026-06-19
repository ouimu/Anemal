# Database Rules

> **Audience:** Database engineers, backend developers  
> **See also:** [Index](00-index.md) | [Security Rules](05-security-rules.md)

---

## Query Safety (Iron Rule)

- **Every query on a tenant-scoped table includes `WHERE tenant_id = :tenantId`** — no exceptions
- Repository functions receive `tenantId` as the **first parameter**
- No raw SQL with string interpolation — use Prisma ORM only
- Validate UUIDs before any DB lookup to prevent injection

```typescript
// GOOD
await prisma.pet.findMany({ where: { tenant_id: tenantId } });

// BAD — cross-tenant data leak
await prisma.pet.findUnique({ where: { id: petId } }); // FORBIDDEN
```

---

## Schema & Migration Rules

- Every migration has `up` and `down` scripts
- New indexes on live tables: `CREATE INDEX CONCURRENTLY` (no lock)
- Composite indexes lead with `tenant_id`: `(tenant_id, created_at DESC)`
- Foreign keys must have indexes
- Column renames: add new → dual-write → backfill → drop (separate migrations)

---

## Performance Rules

- **Pagination required:** All list endpoints paginated
  - Small tables: `LIMIT`/`OFFSET`
  - Large tables: cursor-based pagination
  
- **Avoid N+1 queries:** Use Prisma `include()` or explicit `JOIN`

- **No `SELECT *`:** Name the columns you need

- **Long reports:** Async jobs, not on main request path

---

## Tenant Isolation Checklist

Before any DB change, verify:
- [ ] Every SELECT filters by tenant_id
- [ ] Every INSERT includes tenant_id
- [ ] Every UPDATE includes tenant_id in WHERE
- [ ] Every DELETE includes tenant_id in WHERE
- [ ] tenantId comes from JWT, never request body
- [ ] Cross-tenant access returns 404 (not 403)

---

**See also:** [Security Rules](05-security-rules.md) | [Backend Rules](01-backend-rules.md)
