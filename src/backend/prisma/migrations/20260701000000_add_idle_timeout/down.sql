-- Down migration for add_idle_timeout
ALTER TABLE "tenant_settings" DROP CONSTRAINT IF EXISTS "tenant_settings_idleTimeoutMinutes_check";
ALTER TABLE "tenant_settings" DROP COLUMN IF EXISTS "idleTimeoutMinutes";
