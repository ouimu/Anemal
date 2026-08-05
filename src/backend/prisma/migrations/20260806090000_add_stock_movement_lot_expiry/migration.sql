-- R3-HI-05: per-receipt lot/expiry traceability on stock_movements.
-- Narrowed fix (BA-approved) — no new InventoryLot table. Nullable columns,
-- no backfill: existing rows stay NULL, only new receipts populate them.
ALTER TABLE "stock_movements" ADD COLUMN "lotNo" VARCHAR(100);
ALTER TABLE "stock_movements" ADD COLUMN "expiryDate" DATE;
