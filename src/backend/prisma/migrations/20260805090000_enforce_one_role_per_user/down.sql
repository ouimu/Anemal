-- Rollback: restore the plain (non-unique) index. This does NOT restore any
-- user_roles rows deleted by the deduplication passes in migration.sql — that
-- data loss is intentional and irreversible (ADR-0019 requires exactly one
-- role per user; the deleted rows were policy violations, not valid data).
DROP INDEX IF EXISTS "user_roles_tenantId_userId_key";
CREATE INDEX "user_roles_tenantId_userId_idx" ON "user_roles"("tenantId", "userId");
