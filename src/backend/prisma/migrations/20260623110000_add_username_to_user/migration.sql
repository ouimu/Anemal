-- Migration: add_username_to_user
-- Session D-1: add username (NOT NULL unique per tenant), phone (nullable), make email nullable
-- @db-agent: backfill username = 'user' || id before applying NOT NULL; safe for existing rows

-- UP -------------------------------------------------------------------------

-- 1. Add username as nullable first (allows safe backfill before NOT NULL constraint)
ALTER TABLE "users"
  ADD COLUMN "username" VARCHAR(20);

-- 2. Add phone as nullable
ALTER TABLE "users"
  ADD COLUMN "phone" VARCHAR(20);

-- 3. Backfill username for all existing rows: 'user' || id (e.g. user1, user42)
UPDATE "users"
  SET "username" = 'user' || "id"
  WHERE "username" IS NULL;

-- 4. Now apply NOT NULL constraint (all rows have a value after backfill)
ALTER TABLE "users"
  ALTER COLUMN "username" SET NOT NULL;

-- 5. Make email nullable (was NOT NULL before)
ALTER TABLE "users"
  ALTER COLUMN "email" DROP NOT NULL;

-- 6. Drop old unique index on (tenant_id, email) — email is no longer the unique login key
--    Prisma named this index: users_tenantId_email_key
DROP INDEX IF EXISTS "users_tenantId_email_key";

-- 7. Add new unique index on (tenantId, username) — leads with tenant_id per composite index rule
CREATE UNIQUE INDEX "users_tenantId_username_key" ON "users"("tenantId", "username");


-- DOWN -----------------------------------------------------------------------
-- Run in reverse to undo:
--
-- DROP INDEX IF EXISTS "users_tenantId_username_key";
-- -- Restore email unique index (only if all email values are non-null and unique per tenant)
-- CREATE UNIQUE INDEX "users_tenantId_email_key" ON "users"("tenantId", "email");
-- ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL;
-- ALTER TABLE "users" DROP COLUMN IF EXISTS "phone";
-- ALTER TABLE "users" DROP COLUMN IF EXISTS "username";
