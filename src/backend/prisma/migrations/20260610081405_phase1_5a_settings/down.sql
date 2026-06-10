-- Down migration for phase1_5a_settings
-- Reverses: tenant_settings Phase 1.5 columns, system_settings, settings_audit_log

DROP TABLE IF EXISTS "settings_audit_log";
DROP TABLE IF EXISTS "system_settings";

ALTER TABLE "tenant_settings" DROP CONSTRAINT IF EXISTS "tenant_settings_updatedBy_fkey";
ALTER TABLE "tenant_settings"
  DROP COLUMN IF EXISTS "gbprimepayPublic",
  DROP COLUMN IF EXISTS "gbprimepaySecret",
  DROP COLUMN IF EXISTS "labApiKey",
  DROP COLUMN IF EXISTS "labApiUrl",
  DROP COLUMN IF EXISTS "lineOaToken",
  DROP COLUMN IF EXISTS "operatingHours",
  DROP COLUMN IF EXISTS "paymentQrUrl",
  DROP COLUMN IF EXISTS "promptpayId",
  DROP COLUMN IF EXISTS "smsApiKey",
  DROP COLUMN IF EXISTS "smsProvider",
  DROP COLUMN IF EXISTS "smsSenderName",
  DROP COLUMN IF EXISTS "updatedBy";
