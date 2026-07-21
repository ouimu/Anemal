-- Rollback: remove VAT config columns from tenant_settings.
ALTER TABLE "tenant_settings" DROP COLUMN "vatMode";
ALTER TABLE "tenant_settings" DROP COLUMN "vatRate";
