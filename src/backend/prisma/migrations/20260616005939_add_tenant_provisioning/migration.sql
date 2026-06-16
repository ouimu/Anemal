-- CreateTable
CREATE TABLE "tenant_provisioning" (
    "tenantId" INTEGER NOT NULL,
    "s3Bucket" VARCHAR(255),
    "s3Prefix" VARCHAR(255),
    "s3Region" VARCHAR(50),
    "baseSmsProvider" VARCHAR(50),
    "baseSmsApiKey" TEXT,
    "smtpHost" VARCHAR(255),
    "smtpPort" INTEGER,
    "smtpUser" VARCHAR(255),
    "smtpPassword" TEXT,
    "lineChannelId" VARCHAR(100),
    "lineChannelSecret" TEXT,
    "updatedByPlatformUserId" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_provisioning_pkey" PRIMARY KEY ("tenantId")
);

-- AddForeignKey
ALTER TABLE "tenant_provisioning" ADD CONSTRAINT "tenant_provisioning_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_provisioning" ADD CONSTRAINT "tenant_provisioning_updatedByPlatformUserId_fkey" FOREIGN KEY ("updatedByPlatformUserId") REFERENCES "platform_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
