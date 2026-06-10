-- Rollback Phase 1.5-B settings API migration.

-- Drop the personal-preference columns
ALTER TABLE "users" DROP COLUMN IF EXISTS "defaultCalendarView";
ALTER TABLE "users" DROP COLUMN IF EXISTS "language";

-- Postgres cannot drop a single enum value — rebuild the type without 'superadmin'.
-- Any superadmin users must be deleted or re-roled first.
DELETE FROM "users" WHERE "role" = 'superadmin';
ALTER TYPE "Role" RENAME TO "Role_old";
CREATE TYPE "Role" AS ENUM ('admin', 'doctor', 'staff');
ALTER TABLE "users" ALTER COLUMN "role" TYPE "Role" USING ("role"::text::"Role");
DROP TYPE "Role_old";
