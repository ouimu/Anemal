# Generate Migration

**Skill Description:** Structures schema changes properly with required indexes.

## Instructions
1. When generating a schema migration, always define both the `UP` and `DOWN` scripts.
2. Ensure any new tenant-scoped table includes the `tenant_id` discriminator column.
3. Add composite indexes on `(tenant_id, <search_column>)` for columns that will be frequently filtered (e.g., pet name, phone number, microchip ID).
4. Update the core `.claude/specs/database-schema.sql` documentation.
5. Notify `@qa-agent` to add data-isolation test cases for the new tables.
