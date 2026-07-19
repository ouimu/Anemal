-- AlterTable
ALTER TABLE "plans" ADD COLUMN "maxPets" INTEGER;
ALTER TABLE "tenant_quotas" ADD COLUMN "maxPets" INTEGER;

-- Seed maxPets for the 3 existing plans (starter=500, professional=5000, clinic_plus=unlimited)
UPDATE "plans" SET "maxPets" = 500  WHERE "key" = 'starter';
UPDATE "plans" SET "maxPets" = 5000 WHERE "key" = 'professional';
UPDATE "plans" SET "maxPets" = NULL WHERE "key" = 'clinic_plus';
