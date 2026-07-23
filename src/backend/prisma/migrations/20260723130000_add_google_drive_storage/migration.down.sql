-- Rollback: remove Google Drive columns from tenant_storage_config and drop oauth_connect_nonce.
DROP TABLE IF EXISTS "oauth_connect_nonce";

ALTER TABLE "tenant_storage_config" DROP COLUMN "googleAccessTokenEncrypted";
ALTER TABLE "tenant_storage_config" DROP COLUMN "googleRefreshTokenEncrypted";
ALTER TABLE "tenant_storage_config" DROP COLUMN "googleRootFolderId";
ALTER TABLE "tenant_storage_config" DROP COLUMN "googleEmrFolderId";
ALTER TABLE "tenant_storage_config" DROP COLUMN "googlePhotoFolderId";
