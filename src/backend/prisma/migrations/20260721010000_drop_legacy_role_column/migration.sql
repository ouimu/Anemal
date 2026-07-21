-- AlterTable
ALTER TABLE "users" DROP COLUMN "role",
ALTER COLUMN "roleId" SET NOT NULL;

-- DropEnum
DROP TYPE "Role";
