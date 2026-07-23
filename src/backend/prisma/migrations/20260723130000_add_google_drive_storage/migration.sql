-- src/backend/prisma/migrations/20260723130000_add_google_drive_storage/migration.sql
ALTER TABLE "tenant_storage_config" ADD COLUMN "googleAccessTokenEncrypted" TEXT;
ALTER TABLE "tenant_storage_config" ADD COLUMN "googleRefreshTokenEncrypted" TEXT;
ALTER TABLE "tenant_storage_config" ADD COLUMN "googleRootFolderId" TEXT;
ALTER TABLE "tenant_storage_config" ADD COLUMN "googleEmrFolderId" TEXT;
ALTER TABLE "tenant_storage_config" ADD COLUMN "googlePhotoFolderId" TEXT;

CREATE TABLE "oauth_connect_nonce" (
    "nonceHash"  TEXT NOT NULL,
    "tenantId"   INTEGER NOT NULL,
    "userId"     INTEGER NOT NULL,
    "provider"   VARCHAR(20) NOT NULL,
    "expiresAt"  TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "oauth_connect_nonce_pkey" PRIMARY KEY ("nonceHash")
);

CREATE INDEX "oauth_connect_nonce_expiresAt_idx" ON "oauth_connect_nonce"("expiresAt");
