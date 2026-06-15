-- T-5C-03: migrate superadmin users to platform_users, then drop superadmin from Role enum
-- Step 1: copy superadmin users to platform_users (ON CONFLICT = skip if email already exists)
INSERT INTO platform_users (name, email, "passwordHash", role, "isActive", "createdAt")
SELECT name, email, "passwordHash", 'platform_super_admin'::"platform_role", "isActive", "createdAt"
FROM users
WHERE role = 'superadmin'::"Role"
ON CONFLICT (email) DO NOTHING;

-- Step 2: delete superadmin rows from users (must happen BEFORE enum alter)
DELETE FROM users WHERE role = 'superadmin'::"Role";

-- Step 3: replace Role enum (superadmin removed)
ALTER TYPE "Role" RENAME TO "Role_old";
CREATE TYPE "Role" AS ENUM ('admin', 'doctor', 'staff');
ALTER TABLE users ALTER COLUMN role TYPE "Role" USING role::text::"Role";
DROP TYPE "Role_old";
