-- down.sql — reverses 20260614163551_rbac_foundation
-- Run BEFORE re-running up if a rollback is needed.

-- Drop FKs on users and tenants first (they depend on the new tables)
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_roleId_fkey";
ALTER TABLE "tenants" DROP CONSTRAINT IF EXISTS "tenants_planId_fkey";

-- Remove new columns from existing tables
ALTER TABLE "users" DROP COLUMN IF EXISTS "roleId";
ALTER TABLE "tenants" DROP COLUMN IF EXISTS "planId";

-- Drop join tables (reference roles/permissions)
DROP TABLE IF EXISTS "user_roles";
DROP TABLE IF EXISTS "role_permissions";

-- Drop new standalone tables
DROP TABLE IF EXISTS "tenant_quotas";
DROP TABLE IF EXISTS "platform_users";
DROP TABLE IF EXISTS "roles";
DROP TABLE IF EXISTS "permissions";
DROP TABLE IF EXISTS "plans";

-- Drop enum
DROP TYPE IF EXISTS "platform_role";
