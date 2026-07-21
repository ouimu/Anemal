-- AlterTable
ALTER TABLE "tenant_settings" ADD COLUMN     "vatMode" VARCHAR(20) NOT NULL DEFAULT 'exclusive',
ADD COLUMN     "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 7;
