# Enforce Multi-Tenancy

**Skill Description:** The critical skill for reviewing database interaction to prevent cross-tenant data leaks.

## The Iron Rule
**Every SELECT, INSERT, UPDATE, DELETE on a tenant-scoped table MUST include `WHERE tenant_id = <current_tenant_id>`.**
No exceptions.

## Instructions
1. Read the provided DB queries, ORM models, or Repository code.
2. Verify that `tenantId` is accepted as an explicit parameter in the function signature.
3. Verify that the SQL query or Prisma/SQLAlchemy operation filters by `tenantId`.
4. If `tenantId` is missing from the filter or the arguments, FLAG IT immediately and rewrite the code to include it.
