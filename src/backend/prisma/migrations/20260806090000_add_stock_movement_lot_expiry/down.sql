-- Rollback: drop the lot/expiry traceability columns added for R3-HI-05.
ALTER TABLE "stock_movements" DROP COLUMN IF EXISTS "expiryDate";
ALTER TABLE "stock_movements" DROP COLUMN IF EXISTS "lotNo";
