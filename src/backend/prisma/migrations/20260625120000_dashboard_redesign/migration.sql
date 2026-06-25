-- Dashboard Redesign: add Pet.branchId + Vaccination.administeredExternally + backfill
-- Task 1: DB Migration foundation for dashboard redesign tasks 3, 5, 6.
-- Tenant-scoped: pet.branchId is nullable; backfill sets it from most-recent appointment
-- or falls back to tenant's oldest active branch.

-- AlterTable pets: add branchId (nullable FK to branches)
ALTER TABLE "pets" ADD COLUMN IF NOT EXISTS "branchId" INTEGER;

-- AddForeignKey pets.branchId -> branches.id (SET NULL on branch delete)
ALTER TABLE "pets"
  ADD CONSTRAINT "pets_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "branches"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex: composite index for branch-scoped pet queries
CREATE INDEX IF NOT EXISTS "pets_tenantId_branchId_idx" ON "pets"("tenantId", "branchId");

-- AlterTable vaccinations: add administeredExternally flag
ALTER TABLE "vaccinations" ADD COLUMN IF NOT EXISTS "administeredExternally" BOOLEAN NOT NULL DEFAULT false;

-- Backfill pet.branchId: set to branch of most-recent appointment,
-- fallback to tenant's oldest active branch.
UPDATE pets p
SET "branchId" = COALESCE(
  (
    SELECT a."branchId"
    FROM appointments a
    WHERE a."petId" = p.id AND a."tenantId" = p."tenantId" AND a."branchId" IS NOT NULL
    ORDER BY a."scheduledAt" DESC
    LIMIT 1
  ),
  (
    SELECT b.id
    FROM branches b
    WHERE b."tenantId" = p."tenantId" AND b."isActive" = true
    ORDER BY b.id ASC
    LIMIT 1
  )
)
WHERE p."branchId" IS NULL;
