-- AlterTable
ALTER TABLE "tenant_settings" ADD COLUMN     "gbprimepayPublic" VARCHAR(255),
ADD COLUMN     "gbprimepaySecret" TEXT,
ADD COLUMN     "labApiKey" TEXT,
ADD COLUMN     "labApiUrl" VARCHAR(500),
ADD COLUMN     "lineOaToken" TEXT,
ADD COLUMN     "operatingHours" JSONB,
ADD COLUMN     "paymentQrUrl" TEXT,
ADD COLUMN     "promptpayId" VARCHAR(50),
ADD COLUMN     "smsApiKey" TEXT,
ADD COLUMN     "smsProvider" VARCHAR(50),
ADD COLUMN     "smsSenderName" VARCHAR(100),
ADD COLUMN     "updatedBy" INTEGER;

-- CreateTable
CREATE TABLE "system_settings" (
    "key" VARCHAR(100) NOT NULL,
    "value" TEXT NOT NULL,
    "description" VARCHAR(500),
    "category" VARCHAR(50) NOT NULL DEFAULT 'platform',
    "isSecret" BOOLEAN NOT NULL DEFAULT false,
    "updatedBy" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "settings_audit_log" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER,
    "changedBy" INTEGER,
    "tableName" VARCHAR(100) NOT NULL,
    "fieldName" VARCHAR(100) NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settings_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "system_settings_category_idx" ON "system_settings"("category");

-- CreateIndex
CREATE INDEX "settings_audit_log_tenantId_changedAt_idx" ON "settings_audit_log"("tenantId", "changedAt");

-- CreateIndex
CREATE INDEX "settings_audit_log_tableName_fieldName_changedAt_idx" ON "settings_audit_log"("tableName", "fieldName", "changedAt");

-- AddForeignKey
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings_audit_log" ADD CONSTRAINT "settings_audit_log_changedBy_fkey" FOREIGN KEY ("changedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed system_settings defaults (idempotent — safe on every environment)
INSERT INTO "system_settings" ("key","value","description","category","isSecret","updatedAt") VALUES
  ('app_name','Anemal','Application display name','platform',false,NOW()),
  ('app_base_url','https://anemal.app','Base URL for links in emails','platform',false,NOW()),
  ('maintenance_mode','false','Set true to show maintenance page','platform',false,NOW()),
  ('default_trial_days','30','Free trial duration (days)','platform',false,NOW()),
  ('smtp_host','','SMTP server hostname','smtp',false,NOW()),
  ('smtp_port','587','SMTP server port','smtp',false,NOW()),
  ('smtp_user','','SMTP authentication username','smtp',false,NOW()),
  ('smtp_password','','SMTP authentication password','smtp',true,NOW()),
  ('smtp_from_email','no-reply@anemal.app','From address','smtp',false,NOW()),
  ('smtp_from_name','Anemal','From name','smtp',false,NOW())
ON CONFLICT ("key") DO NOTHING;
