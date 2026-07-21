-- down.sql — reverses drop_legacy_role_column
-- Run BEFORE re-running up if a rollback is needed.
-- LOSSY for custom-role users: their real role identity does not round-trip
-- (they are repopulated as legacy 'staff'). Emergency escape hatch only —
-- the real fallback is the pg_dump backup taken in Task 4 Step 1.

CREATE TYPE "Role" AS ENUM ('admin', 'doctor', 'staff');

ALTER TABLE "users" ADD COLUMN "role" "Role";

UPDATE "users" u
SET "role" = CASE
  WHEN r."key" = 'clinic_admin' THEN 'admin'::"Role"
  WHEN r."key" = 'doctor'       THEN 'doctor'::"Role"
  ELSE 'staff'::"Role"
END
FROM "roles" r
WHERE u."roleId" = r."id";

ALTER TABLE "users" ALTER COLUMN "role" SET NOT NULL;

ALTER TABLE "users" ALTER COLUMN "roleId" DROP NOT NULL;
