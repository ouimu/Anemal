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
WHERE "tenantId" = :currentTenantId
```

**Casing note:** the live DB uses quoted camelCase identifiers (`"tenantId"`, `"branchId"`), not
snake_case — same convention as `.claude/specs/database-schema.sql`'s header note. Examples below
use this casing; adapt to whatever quoting the query-building layer (Prisma / raw SQL) requires.

There are 13 branch-scoped tables in the live schema. 4 have `"branchId"` **NOT NULL** — always
filter on it: `branch_inventory`, `user_branches`, `doctor_shifts`, `payment_history`. 9 have
`"branchId"` **nullable** (optional/primary-branch semantics — filter only when the feature is
branch-scoped, and handle NULL explicitly): `users`, `pets`, `appointments`, `medical_records`,
`stock_movements`, `invoices`, `hospitalizations`, `grooming_bookings`, `refresh_tokens`.
```sql
AND "branchId" = :currentBranchId
```

**In Prisma — correct vs forbidden:**
```typescript
// CORRECT — always scoped
await prisma.pet.findMany({ where: { tenantId } });
await prisma.pet.update({ where: { id: petId, tenantId }, data });

// FORBIDDEN — cross-tenant data leak
await prisma.pet.findUnique({ where: { id: petId } });
```

Return `404` (not `403`) when a cross-tenant ID is accessed — never confirm record existence.

## Schema sections

29 clinic-plane tables (the 14 authorization/platform tables are listed separately below).

| Section | Tables |
|---|---|
| Core tenant & user | `tenants`, `branches`, `users`, `user_branches`, `refresh_tokens` |
| Settings | `tenant_settings`, `tenant_storage_config`, `system_settings`, `settings_audit_log`, `oauth_connect_nonce`, `company_types` |
| Pet & owner | `owners`, `pets`, `vaccinations`, `pet_reminders` |
| Appointments | `appointments`, `doctor_shifts` |
| EMR | `medical_records`, `prescriptions`, `attachments` |
| Inventory | `inventory_items`, `branch_inventory`, `stock_movements` |
| Billing | `invoices`, `invoice_items`, `payment_history` |
| Inpatient | `hospitalizations`, `daily_inpatient_care` |
| Grooming | `grooming_bookings` |
| Blood bank | `blood_donors`, `blood_donations`, `blood_transfusions` |
| Loyalty | `loyalty_transactions` |
| Audit | `audit_logs` |

## Migration rules

- Every migration requires a `down` script
- New indexes on live tables: `CREATE INDEX CONCURRENTLY` — no table lock
- Composite indexes lead with `"tenantId"`: e.g. `("tenantId", "createdAt" DESC)`
- Foreign keys require indexes — verify before adding any FK
- Column renames: add new → dual-write → backfill → drop old (three separate migrations)
- `SELECT *` is forbidden — name columns explicitly

## Tenant isolation test (mandatory for every new protected endpoint)

```typescript
it('returns 404 when tenant B accesses tenant A resource', async () => {
  const res = await request(app)
    .get(`/api/pets/${tenantAPetId}`)
    .set('Authorization', `Bearer ${tenantBToken}`);
  expect(res.status).toBe(404);
});
```

## Reference file

Full DDL — all tables, columns, constraints, indexes: `.claude/specs/database-schema.sql`
(canonical, single copy — the former references/database-schema.sql duplicate was removed 2026-09-09
after the two copies had drifted; `.claude/specs/` now holds the complete superset)

Read the schema before designing any new table or writing any migration.

## Authorization & Platform tables (live)

Migrated and live — `.claude/specs/RBAC_Platform_Restructure_Spec.md` is **historical** rationale
only, not a pending-work list: `permissions`, `roles` (Prisma model `ClinicRole`), `role_permissions`,
`user_roles`, `platform_users` (no `tenantId`), `plans`, `tenant_quotas`, `tenant_provisioning`,
`platform_audit_logs`, `refresh_tokens`, `tenant_storage_config`, `oauth_connect_nonce`,
`company_types`, `payment_history`.

- `tenants."planId"` (not `plan_id`) FKs to `plans`.
- `users."roleId"` is **NOT NULL** (FK to `roles`, set by ADR-0019) and still exists — it was never
  dropped. What migration `20260721010000_drop_legacy_role_column` dropped is the separate legacy
  `users.role` **string/enum** column (and its `Role` enum type). `roleId`/`roleRef` is a
  display/fallback pointer kept in sync by `user.repository.ts`; **effective permissions are
  resolved from the `user_roles` join table** (`permission.service.ts resolvePermissions`), not by
  reading `roleRef` alone.
- `roles` with `tenantId = NULL` are system templates; `platform_users` is the ONLY non-tenant
  identity table.

See skill `anemal-rbac-matrix` for the seed data and permission catalogue.
