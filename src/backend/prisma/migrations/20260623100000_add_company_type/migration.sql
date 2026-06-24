-- Migration: add_company_type
-- Session D-1: create company_types reference table and add companyTypeId FK to tenants
-- @db-agent: company_types is global reference data (no tenant_id); tenants.company_type_id is nullable

-- UP -------------------------------------------------------------------------

-- 1. Create company_types reference table
CREATE TABLE "company_types" (
  "id"         SERIAL       NOT NULL,
  "key"        VARCHAR(50)  NOT NULL,
  "nameEn"     VARCHAR(100) NOT NULL,
  "nameTh"     VARCHAR(100) NOT NULL,
  "isActive"   BOOLEAN      NOT NULL DEFAULT true,
  "sortOrder"  INTEGER      NOT NULL DEFAULT 0,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "company_types_pkey" PRIMARY KEY ("id")
);

-- 2. Unique constraint on key (used for upsert by seed)
CREATE UNIQUE INDEX "company_types_key_key" ON "company_types"("key");

-- 3. Add nullable companyTypeId column to tenants
ALTER TABLE "tenants"
  ADD COLUMN "companyTypeId" INTEGER;

-- 4. FK from tenants -> company_types (SetNull: deleting a type leaves tenants unscoped)
ALTER TABLE "tenants"
  ADD CONSTRAINT "tenants_companyTypeId_fkey"
  FOREIGN KEY ("companyTypeId")
  REFERENCES "company_types"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

-- 5. Index on tenants.companyTypeId (FK must be indexed per migration rules)
CREATE INDEX "tenants_companyTypeId_idx" ON "tenants"("companyTypeId");


-- DOWN -----------------------------------------------------------------------
-- Run in reverse to undo:
--
-- DROP INDEX IF EXISTS "tenants_companyTypeId_idx";
-- ALTER TABLE "tenants" DROP CONSTRAINT IF EXISTS "tenants_companyTypeId_fkey";
-- ALTER TABLE "tenants" DROP COLUMN IF EXISTS "companyTypeId";
-- DROP TABLE IF EXISTS "company_types";
