-- AlterTable
ALTER TABLE "tenant_settings" ADD COLUMN "idleTimeoutMinutes" INTEGER NOT NULL DEFAULT 15;

-- CreateCheckConstraint
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_idleTimeoutMinutes_check"
  CHECK ("idleTimeoutMinutes" BETWEEN 5 AND 120);
