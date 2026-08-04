-- Rollback Phase 1.5-B settings API migration.

-- Drop the personal-preference columns
ALTER TABLE "users" DROP COLUMN IF EXISTS "defaultCalendarView";
ALTER TABLE "users" DROP COLUMN IF EXISTS "language";

-- Postgres cannot drop a single enum value — rebuild the type without 'superadmin'.
-- A rollback must never silently destroy platform identities. Abort instead of
-- deleting: an operator must migrate or re-role superadmin users first.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "users" WHERE "role" = 'superadmin') THEN
    RAISE EXCEPTION
      'Rollback blocked: superadmin users exist. Migrate or re-role them before running this rollback (see R2-HI-03).';
  END IF;
END $$;
ALTER TYPE "Role" RENAME TO "Role_old";
CREATE TYPE "Role" AS ENUM ('admin', 'doctor', 'staff');
ALTER TABLE "users" ALTER COLUMN "role" TYPE "Role" USING ("role"::text::"Role");
DROP TYPE "Role_old";
