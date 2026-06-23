---
name: anemal-db-context
description: >
  Anemal database schema, multi-tenancy enforcement rules, and query safety patterns
  for @db-agent. Use this skill for any task touching the database — writing or reviewing
  migrations, designing new tables, writing queries, adding indexes, reviewing PRs that
  touch DB models or repositories, or verifying tenant isolation compliance. If the
  task involves Prisma schema, SQL, a repository file, or any mention of tenant_id or
  branch_id, this skill must be active.
---

# Anemal DB Context

## Iron Rule — Multi-Tenancy (non-negotiable)

Every `SELECT`, `INSERT`, `UPDATE`, `DELETE` on a tenant-scoped table **must** include:
```sql
WHERE tenant_id = :currentTenantId
```

Branch-scoped tables (`appointments`, `stock_movements`, `invoices`, `grooming_bookings`) **also** require:
```sql
AND branch_id = :currentBranchId
```

**In Prisma — correct vs forbidden:**
```typescript
// CORRECT — always scoped
await prisma.pet.findMany({ where: { tenant_id: tenantId } });
await prisma.pet.update({ where: { id: petId, tenant_id: tenantId }, data });

// FORBIDDEN — cross-tenant data leak
await prisma.pet.findUnique({ where: { id: petId } });
```

Return `404` (not `403`) when a cross-tenant ID is accessed — never confirm record existence.

## Schema sections

| Section | Tables |
|---|---|
| Core tenant & user | `tenants`, `branches`, `users`, `refresh_tokens` |
| Pet & owner | `owners`, `pets`, `pet_allergies`, `vaccinations` |
| Appointments | `appointments` |
| EMR | `medical_records`, `prescriptions`, `prescription_items`, `lab_tests`, `lab_results` |
| Inventory | `products`, `stock_movements` |
| Billing | `invoices`, `invoice_items`, `payments` |
| Inpatient | `inpatient_admissions`, `inpatient_care_logs` |
| Grooming | `grooming_bookings` |
| Blood bank | `blood_donors`, `blood_collections`, `blood_transfusions` |
| Loyalty | `memberships`, `loyalty_transactions` |
| Audit | `audit_logs` |

## Migration rules

- Every migration requires a `down` script
- New indexes on live tables: `CREATE INDEX CONCURRENTLY` — no table lock
- Composite indexes lead with `tenant_id`: e.g. `(tenant_id, created_at DESC)`
- Foreign keys require indexes — verify before adding any FK
- Column renames: add new → dual-write → backfill → drop old (three separate migrations)
- `SELECT *` is forbidden — name columns explicitly

## Tenant isolation test (mandatory for every new protected endpoint)

```typescript
it('returns 404 when tenant B accesses tenant A resource', async () => {
  const res = await request(app)
    .get(`/api/v1/pets/${tenantAPetId}`)
    .set('Authorization', `Bearer ${tenantBToken}`);
  expect(res.status).toBe(404);
});
```

## Reference file

Full DDL — all tables, columns, constraints, indexes: `references/database-schema.sql`

Read the schema before designing any new table or writing any migration.

## Authorization & Platform tables (designed)

Proposed in `.Codex/specs/RBAC_Platform_Restructure_Spec.md` section 9 (not yet migrated):
`permissions`, `roles`, `role_permissions`, `users.role_id`, `platform_users` (no `tenant_id`),
`plans`, `tenants.plan_id`, `tenant_quotas`. Rules unchanged: tenant-scoped tables keep
`WHERE tenant_id`; `roles` with `tenant_id = NULL` are system templates; `platform_users` is the
ONLY non-tenant identity table. `@db-agent` writes these migrations with `down` scripts when
this work is implemented. See skill `anemal-rbac-matrix` for the seed data.
