-- CreateTable
CREATE TABLE "tenant_storage_config" (
    "tenantId" INTEGER NOT NULL,
    "provider" VARCHAR(20) NOT NULL DEFAULT 'local',
    "smbHost" VARCHAR(255),
    "smbShare" VARCHAR(500),
    "smbUsername" VARCHAR(255),
    "smbPasswordEncrypted" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_storage_config_pkey" PRIMARY KEY ("tenantId")
);

-- AddForeignKey
ALTER TABLE "tenant_storage_config" ADD CONSTRAINT "tenant_storage_config_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
