-- CreateTable
CREATE TABLE "platform_audit_logs" (
    "id" SERIAL NOT NULL,
    "action" VARCHAR(255) NOT NULL,
    "targetTenantId" INTEGER,
    "performedByPlatformUserId" INTEGER NOT NULL,
    "plane" VARCHAR(20) NOT NULL DEFAULT 'platform',
    "details" JSONB,
    "ipAddress" VARCHAR(50),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "platform_audit_logs_performedByPlatformUserId_createdAt_idx" ON "platform_audit_logs"("performedByPlatformUserId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "platform_audit_logs_targetTenantId_createdAt_idx" ON "platform_audit_logs"("targetTenantId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "platform_audit_logs" ADD CONSTRAINT "platform_audit_logs_targetTenantId_fkey" FOREIGN KEY ("targetTenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_audit_logs" ADD CONSTRAINT "platform_audit_logs_performedByPlatformUserId_fkey" FOREIGN KEY ("performedByPlatformUserId") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
