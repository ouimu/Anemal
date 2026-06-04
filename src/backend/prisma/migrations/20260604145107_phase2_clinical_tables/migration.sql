/*
  Warnings:

  - You are about to drop the column `anatomyNotes` on the `medical_records` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "medical_records" DROP COLUMN "anatomyNotes",
ADD COLUMN     "anatomyAnnotation" JSONB,
ADD COLUMN     "heartRateBpm" INTEGER,
ADD COLUMN     "respRateRpm" INTEGER,
ADD COLUMN     "temperatureC" DECIMAL(4,1),
ADD COLUMN     "weightKg" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "pets" ADD COLUMN     "allergies" TEXT,
ADD COLUMN     "color" VARCHAR(100),
ADD COLUMN     "underlyingConditions" TEXT;

-- CreateTable
CREATE TABLE "vaccinations" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "petId" INTEGER NOT NULL,
    "vaccineName" VARCHAR(100) NOT NULL,
    "administeredAt" DATE NOT NULL,
    "nextDueAt" DATE,
    "batchNo" VARCHAR(50),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vaccinations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "medicalRecordId" INTEGER NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" VARCHAR(50),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vaccinations_tenantId_petId_idx" ON "vaccinations"("tenantId", "petId");

-- CreateIndex
CREATE INDEX "vaccinations_tenantId_nextDueAt_idx" ON "vaccinations"("tenantId", "nextDueAt");

-- CreateIndex
CREATE INDEX "attachments_tenantId_medicalRecordId_idx" ON "attachments"("tenantId", "medicalRecordId");

-- AddForeignKey
ALTER TABLE "vaccinations" ADD CONSTRAINT "vaccinations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccinations" ADD CONSTRAINT "vaccinations_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_medicalRecordId_fkey" FOREIGN KEY ("medicalRecordId") REFERENCES "medical_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
