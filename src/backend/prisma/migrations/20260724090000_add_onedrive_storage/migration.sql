-- src/backend/prisma/migrations/20260724090000_add_onedrive_storage/migration.sql
ALTER TABLE "tenant_storage_config" ADD COLUMN "googleAccountIdHash" TEXT;

ALTER TABLE "tenant_storage_config" ADD COLUMN "oneDriveAccessTokenEncrypted" TEXT;
ALTER TABLE "tenant_storage_config" ADD COLUMN "oneDriveRefreshTokenEncrypted" TEXT;
ALTER TABLE "tenant_storage_config" ADD COLUMN "oneDriveTokenExpiresAt" TIMESTAMP(3);
ALTER TABLE "tenant_storage_config" ADD COLUMN "oneDriveAccountIdHash" TEXT;
