-- AlterTable
ALTER TABLE "owners" ADD COLUMN "idCardType" VARCHAR(10);
ALTER TABLE "owners" ADD COLUMN "idCardNumber" VARCHAR(20);

-- CreateIndex (unique, tenant-scoped; NULLs are not considered duplicates in Postgres)
CREATE UNIQUE INDEX "owners_tenantId_idCardNumber_key" ON "owners"("tenantId", "idCardNumber");
