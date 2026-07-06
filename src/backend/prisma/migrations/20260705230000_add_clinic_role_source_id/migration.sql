-- AlterTable
ALTER TABLE "roles" ADD COLUMN "sourceRoleId" INTEGER;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_sourceRoleId_fkey" FOREIGN KEY ("sourceRoleId") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
