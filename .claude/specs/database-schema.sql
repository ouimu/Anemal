-- ============================================================
-- Anemal SaaS — Complete Database Schema (canonical DDL)
-- DB-Agent controlled — DO NOT modify without DB-Agent review
-- Pattern: Shared Database, Shared Schema + tenantId isolation
-- Database: PostgreSQL 15+
-- Last Updated: 2026-09-18
-- ============================================================
-- PROVENANCE — this file is GENERATED, not hand-written.
--
--   Source of truth : src/backend/prisma/schema.prisma (43 models)
--   Regenerate with :
--     cd src/backend
--     npx prisma migrate diff \
--       --from-empty \
--       --to-schema-datamodel prisma/schema.prisma \
--       --script > ../../.claude/specs/database-schema.sql
--     (then re-attach this header and the RLS note in SECTION 4)
--
-- Regenerating this file is a DOCS-ONLY operation. It never creates or
-- edits anything under src/backend/prisma/migrations/. If this file and
-- schema.prisma disagree, schema.prisma wins and this file is stale.
--
-- Identifier casing: columns are quoted camelCase ("tenantId", "branchId")
-- exactly as Prisma deploys them. Earlier revisions of this file were
-- hand-written in snake_case and did not match the live database.
--
-- Previous revision (2026-05-30) covered 27 tables and predated Phase 8
-- RBAC / Platform Console, ADR-0019 and ADR-0023. Now at 43 tables.
-- ============================================================


-- ============================================================
-- IRON RULE
-- ============================================================
-- Every SELECT / INSERT / UPDATE / DELETE on a tenant-scoped table MUST
-- include:
--     WHERE "tenantId" = :currentTenantId
-- Branch-scoped tables MUST additionally include:
--     AND "branchId" = :currentBranchId
--
-- tenantId is an EXPLICIT repository parameter. It is never derived
-- inside a repository, never read from a module-level variable, and never
-- defaulted. Cross-tenant access returns 404 — never 403, never a message
-- that confirms the row exists.
-- ============================================================


-- ============================================================
-- TENANCY CLASSIFICATION — read this before writing any query
-- ============================================================
--
-- A. TENANT ROOT (1)
--    tenants                     -- "id" IS the tenant discriminator
--
-- B. TENANT-SCOPED — "tenantId" NOT NULL, filter is MANDATORY (32)
--    appointments                blood_donations             blood_donors
--    blood_transfusions          branch_inventory            branches
--    daily_inpatient_care        doctor_shifts               grooming_bookings
--    hospitalizations            inventory_items             invoice_items
--    invoices                    loyalty_transactions        medical_records
--    oauth_connect_nonce         owners                      payment_history
--    pet_reminders               pets                        prescriptions
--    stock_movements             tenant_provisioning         tenant_quotas
--    tenant_settings             tenant_storage_config       user_branches
--    user_roles                  users                       vaccinations
--    attachments                 audit_logs
--
-- C. NULLABLE "tenantId" — dual-purpose, NULL has a defined meaning (3)
--    roles               -- NULL = SYSTEM ROLE TEMPLATE, shared across all
--                           tenants. A tenant-owned row has tenantId set and
--                           may point at its template via "sourceRoleId".
--                           Queries for a tenant's roles must read
--                           ("tenantId" = :tenantId OR "tenantId" IS NULL)
--                           deliberately — never as an accidental fallback.
--    settings_audit_log  -- NULL = a system_settings (platform) change.
--                           Deliberately NO tenant FK: audit rows must
--                           survive tenant deletion.
--    refresh_tokens      -- NULL = platform-plane token. The "plane" column
--                           is the discriminator; "userId" is set for the
--                           clinic plane and "platformUserId" for the
--                           platform plane. No FKs by design.
--
-- D. NON-TENANT — global catalogue or platform plane, NO tenantId (7)
--    company_types           -- global lookup
--    permissions             -- global permission catalogue
--    role_permissions        -- join over global permissions
--    plans                   -- global plan catalogue
--    system_settings         -- platform-global key/value, super-admin only
--    platform_users          -- THE ONLY non-tenant identity table
--    platform_audit_logs     -- platform-plane trail, never holds tenant PII
--
-- E. BRANCH-SCOPED — also filter on "branchId"
--    "branchId" NOT NULL (4):
--       branch_inventory  user_branches  doctor_shifts  payment_history
--    "branchId" NULLABLE (9) — NULL means tenant-wide / not yet assigned;
--    a branch filter must be applied only when the caller is branch-bound:
--       users  pets  appointments  medical_records  stock_movements
--       invoices  hospitalizations  grooming_bookings  refresh_tokens
--
-- Composite indexes lead with "tenantId". Never SELECT *.
-- ============================================================


-- ============================================================
-- SECTION 1: ENUMS
-- SECTION 2: TABLES
-- SECTION 3: INDEXES & FOREIGN KEYS
--   (generated verbatim by prisma migrate diff — do not hand-edit)
-- ============================================================

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female', 'unknown');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('scheduled', 'arrived', 'in_progress', 'completed', 'cancelled', 'no_show');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'paid', 'partial', 'void', 'refunded');

-- CreateEnum
CREATE TYPE "platform_role" AS ENUM ('platform_super_admin', 'platform_support');

-- CreateTable
CREATE TABLE "company_types" (
    "id" SERIAL NOT NULL,
    "key" VARCHAR(50) NOT NULL,
    "nameEn" VARCHAR(100) NOT NULL,
    "nameTh" VARCHAR(100) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenants" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "subdomain" VARCHAR(100) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "planId" INTEGER,
    "companyTypeId" INTEGER,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_settings" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "logoUrl" TEXT,
    "phone" VARCHAR(50),
    "email" VARCHAR(255),
    "website" VARCHAR(255),
    "address" TEXT,
    "taxId" VARCHAR(50),
    "defaultSlotMinutes" INTEGER NOT NULL DEFAULT 30,
    "workStartTime" VARCHAR(5) NOT NULL DEFAULT '08:00',
    "workEndTime" VARCHAR(5) NOT NULL DEFAULT '18:00',
    "smsRemindersEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lineRemindersEnabled" BOOLEAN NOT NULL DEFAULT true,
    "planTier" VARCHAR(50) NOT NULL DEFAULT 'starter',
    "idleTimeoutMinutes" INTEGER NOT NULL DEFAULT 15,
    "operatingHours" JSONB,
    "lineOaToken" TEXT,
    "smsProvider" VARCHAR(50),
    "smsApiKey" TEXT,
    "smsSenderName" VARCHAR(100),
    "promptpayId" VARCHAR(50),
    "paymentQrUrl" TEXT,
    "gbprimepayPublic" VARCHAR(255),
    "gbprimepaySecret" TEXT,
    "labApiUrl" VARCHAR(500),
    "labApiKey" TEXT,
    "vatMode" VARCHAR(20) NOT NULL DEFAULT 'exclusive',
    "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 7,
    "updatedBy" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_storage_config" (
    "tenantId" INTEGER NOT NULL,
    "provider" VARCHAR(20) NOT NULL DEFAULT 'local',
    "smbHost" VARCHAR(255),
    "smbShare" VARCHAR(500),
    "smbUsername" VARCHAR(255),
    "smbPasswordEncrypted" TEXT,
    "googleAccessTokenEncrypted" TEXT,
    "googleRefreshTokenEncrypted" TEXT,
    "googleRootFolderId" TEXT,
    "googleEmrFolderId" TEXT,
    "googlePhotoFolderId" TEXT,
    "googleAccountIdHash" TEXT,
    "oneDriveAccessTokenEncrypted" TEXT,
    "oneDriveRefreshTokenEncrypted" TEXT,
    "oneDriveTokenExpiresAt" TIMESTAMP(3),
    "oneDriveAccountIdHash" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_storage_config_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "oauth_connect_nonce" (
    "nonceHash" TEXT NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "provider" VARCHAR(20) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "oauth_connect_nonce_pkey" PRIMARY KEY ("nonceHash")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "branchId" INTEGER,
    "name" VARCHAR(255) NOT NULL,
    "username" VARCHAR(20) NOT NULL,
    "email" VARCHAR(255),
    "phone" VARCHAR(20),
    "passwordHash" VARCHAR(255) NOT NULL,
    "roleId" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "allowedStartTime" VARCHAR(5),
    "allowedEndTime" VARCHAR(5),
    "language" VARCHAR(5) NOT NULL DEFAULT 'th',
    "defaultCalendarView" VARCHAR(10) NOT NULL DEFAULT 'week',
    "theme" VARCHAR(10) NOT NULL DEFAULT 'light',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "owners" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "firstName" VARCHAR(100) NOT NULL,
    "lastName" VARCHAR(100) NOT NULL,
    "phone" VARCHAR(50) NOT NULL,
    "email" VARCHAR(255),
    "lineId" VARCHAR(100),
    "address" TEXT,
    "idCardType" VARCHAR(10),
    "idCardNumber" VARCHAR(20),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "loyaltyPoints" INTEGER NOT NULL DEFAULT 0,
    "membershipTier" VARCHAR(50) NOT NULL DEFAULT 'standard',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pets" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "species" VARCHAR(50) NOT NULL,
    "breed" VARCHAR(100),
    "color" VARCHAR(100),
    "birthDate" DATE,
    "gender" "Gender",
    "weightKg" DECIMAL(5,2),
    "microchipId" VARCHAR(50),
    "photoUrl" TEXT,
    "allergies" TEXT,
    "underlyingConditions" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "branchId" INTEGER,

    CONSTRAINT "pets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "branchId" INTEGER,
    "petId" INTEGER NOT NULL,
    "doctorId" INTEGER NOT NULL,
    "room" VARCHAR(50),
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 30,
    "reason" TEXT,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'scheduled',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medical_records" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "branchId" INTEGER,
    "petId" INTEGER NOT NULL,
    "appointmentId" INTEGER,
    "doctorId" INTEGER NOT NULL,
    "subjective" TEXT,
    "objective" TEXT,
    "assessment" TEXT,
    "plan" TEXT,
    "weightKg" DECIMAL(5,2),
    "temperatureC" DECIMAL(4,1),
    "heartRateBpm" INTEGER,
    "respRateRpm" INTEGER,
    "anatomyAnnotation" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medical_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescriptions" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "medicalRecordId" INTEGER NOT NULL,
    "drugId" INTEGER NOT NULL,
    "quantity" DECIMAL(8,2) NOT NULL,
    "unit" VARCHAR(50),
    "dosageInstruction" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prescriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "category" VARCHAR(100),
    "barcode" VARCHAR(100),
    "unit" VARCHAR(50),
    "unitCost" DECIMAL(10,2),
    "unitPrice" DECIMAL(10,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_inventory" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "stockQty" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "minStockQty" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "lotNo" VARCHAR(100),
    "expiryDate" DATE,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branch_inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "branchId" INTEGER,
    "itemId" INTEGER NOT NULL,
    "movementType" VARCHAR(20) NOT NULL,
    "qty" DECIMAL(10,2) NOT NULL,
    "referenceType" VARCHAR(50),
    "referenceId" INTEGER,
    "destinationBranchId" INTEGER,
    "notes" TEXT,
    "performedBy" INTEGER,
    "lotNo" VARCHAR(100),
    "expiryDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "branchId" INTEGER,
    "petId" INTEGER,
    "medicalRecordId" INTEGER,
    "invoiceNo" VARCHAR(100) NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subtotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discountReason" TEXT,
    "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 7,
    "taxAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "paymentMethod" VARCHAR(50),
    "paidAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "description" VARCHAR(255) NOT NULL,
    "quantity" DECIMAL(8,2) NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "totalPrice" DECIMAL(10,2) NOT NULL,
    "itemType" VARCHAR(50),

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vaccinations" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "petId" INTEGER NOT NULL,
    "vaccineName" VARCHAR(100) NOT NULL,
    "administeredAt" DATE NOT NULL,
    "nextDueAt" DATE,
    "batchNo" VARCHAR(50),
    "notes" TEXT,
    "administeredExternally" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vaccinations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "medicalRecordId" INTEGER NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "fileUrl" TEXT,
    "fileType" VARCHAR(50),
    "storageKey" TEXT,
    "mimeType" VARCHAR(255),
    "fileSize" INTEGER,
    "uploadedByUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(50),
    "email" VARCHAR(255),
    "address" TEXT,
    "operatingHours" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_branches" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,

    CONSTRAINT "user_branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctor_shifts" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "doctorId" INTEGER NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" VARCHAR(5) NOT NULL,
    "endTime" VARCHAR(5) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doctor_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hospitalizations" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "branchId" INTEGER,
    "petId" INTEGER NOT NULL,
    "admittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dischargedAt" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "cageNo" VARCHAR(50),
    "status" VARCHAR(20) NOT NULL DEFAULT 'admitted',
    "doctorInCharge" INTEGER,
    "dailyRate" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hospitalizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_inpatient_care" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "hospitalizationId" INTEGER NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "timeSlot" VARCHAR(20) NOT NULL,
    "temperatureC" DECIMAL(4,1),
    "heartRateBpm" INTEGER,
    "respRateRpm" INTEGER,
    "feedingStatus" VARCHAR(255),
    "medicationGiven" TEXT,
    "notes" TEXT,
    "performedBy" INTEGER,

    CONSTRAINT "daily_inpatient_care_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grooming_bookings" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "branchId" INTEGER,
    "petId" INTEGER NOT NULL,
    "groomerId" INTEGER,
    "serviceType" VARCHAR(255) NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 60,
    "status" VARCHAR(20) NOT NULL DEFAULT 'scheduled',
    "specialInstructions" TEXT,
    "notes" TEXT,
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grooming_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blood_donors" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "petId" INTEGER NOT NULL,
    "bloodType" VARCHAR(50) NOT NULL,
    "lastDonationAt" TIMESTAMP(3),
    "isEligible" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blood_donors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blood_donations" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "donorId" INTEGER NOT NULL,
    "volumeMl" DECIMAL(10,2) NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "collectedBy" INTEGER,
    "expiryDate" DATE NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'available',
    "notes" TEXT,

    CONSTRAINT "blood_donations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blood_transfusions" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "recipientPetId" INTEGER NOT NULL,
    "donationId" INTEGER,
    "volumeMl" DECIMAL(10,2) NOT NULL,
    "administeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "administeredBy" INTEGER,
    "reactions" TEXT,
    "notes" TEXT,

    CONSTRAINT "blood_transfusions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_transactions" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "invoiceId" INTEGER,
    "pointsEarned" INTEGER NOT NULL DEFAULT 0,
    "pointsRedeemed" INTEGER NOT NULL DEFAULT 0,
    "transactionType" VARCHAR(20) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "userId" INTEGER,
    "action" VARCHAR(255) NOT NULL,
    "tableName" VARCHAR(100),
    "recordId" INTEGER,
    "details" JSONB,
    "ipAddress" VARCHAR(50),
    "userAgent" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pet_reminders" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "petId" INTEGER NOT NULL,
    "reminderType" VARCHAR(100) NOT NULL,
    "message" TEXT NOT NULL,
    "dueDate" DATE NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "sentAt" TIMESTAMP(3),
    "channel" VARCHAR(20) NOT NULL DEFAULT 'line',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pet_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "code" VARCHAR(80) NOT NULL,
    "module" VARCHAR(50) NOT NULL,
    "action" VARCHAR(30) NOT NULL,
    "description" VARCHAR(255),

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER,
    "name" VARCHAR(80) NOT NULL,
    "key" VARCHAR(50) NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "description" VARCHAR(255),
    "permVersion" INTEGER NOT NULL DEFAULT 1,
    "sourceRoleId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "roleId" INTEGER NOT NULL,
    "permissionCode" VARCHAR(80) NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId","permissionCode")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "userId" INTEGER NOT NULL,
    "roleId" INTEGER NOT NULL,
    "tenantId" INTEGER NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "platform_users" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "role" "platform_role" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" SERIAL NOT NULL,
    "key" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "priceMonth" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "maxBranches" INTEGER NOT NULL DEFAULT 1,
    "maxUsers" INTEGER NOT NULL DEFAULT 5,
    "maxOwners" INTEGER,
    "maxPets" INTEGER,
    "features" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_quotas" (
    "tenantId" INTEGER NOT NULL,
    "maxBranches" INTEGER,
    "maxUsers" INTEGER,
    "maxOwners" INTEGER,
    "maxPets" INTEGER,
    "updatedById" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_quotas_pkey" PRIMARY KEY ("tenantId")
);

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

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "userId" INTEGER,
    "platformUserId" INTEGER,
    "tenantId" INTEGER,
    "branchId" INTEGER,
    "plane" VARCHAR(20) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "rotatedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_history" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "method" VARCHAR(50) NOT NULL,
    "receivedById" INTEGER NOT NULL,
    "note" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_types_key_key" ON "company_types"("key");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_subdomain_key" ON "tenants"("subdomain");

-- CreateIndex
CREATE INDEX "tenants_companyTypeId_idx" ON "tenants"("companyTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_settings_tenantId_key" ON "tenant_settings"("tenantId");

-- CreateIndex
CREATE INDEX "oauth_connect_nonce_expiresAt_idx" ON "oauth_connect_nonce"("expiresAt");

-- CreateIndex
CREATE INDEX "users_tenantId_idx" ON "users"("tenantId");

-- CreateIndex
CREATE INDEX "users_tenantId_branchId_idx" ON "users"("tenantId", "branchId");

-- CreateIndex
CREATE INDEX "users_roleId_idx" ON "users"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenantId_username_key" ON "users"("tenantId", "username");

-- CreateIndex
CREATE INDEX "system_settings_category_idx" ON "system_settings"("category");

-- CreateIndex
CREATE INDEX "settings_audit_log_tenantId_changedAt_idx" ON "settings_audit_log"("tenantId", "changedAt");

-- CreateIndex
CREATE INDEX "settings_audit_log_tableName_fieldName_changedAt_idx" ON "settings_audit_log"("tableName", "fieldName", "changedAt");

-- CreateIndex
CREATE INDEX "owners_tenantId_idx" ON "owners"("tenantId");

-- CreateIndex
CREATE INDEX "owners_tenantId_phone_idx" ON "owners"("tenantId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "owners_tenantId_idCardNumber_key" ON "owners"("tenantId", "idCardNumber");

-- CreateIndex
CREATE INDEX "pets_tenantId_idx" ON "pets"("tenantId");

-- CreateIndex
CREATE INDEX "pets_tenantId_branchId_idx" ON "pets"("tenantId", "branchId");

-- CreateIndex
CREATE INDEX "pets_tenantId_ownerId_idx" ON "pets"("tenantId", "ownerId");

-- CreateIndex
CREATE INDEX "pets_tenantId_microchipId_idx" ON "pets"("tenantId", "microchipId");

-- CreateIndex
CREATE INDEX "pets_tenantId_name_idx" ON "pets"("tenantId", "name");

-- CreateIndex
CREATE INDEX "appointments_tenantId_idx" ON "appointments"("tenantId");

-- CreateIndex
CREATE INDEX "appointments_tenantId_doctorId_scheduledAt_idx" ON "appointments"("tenantId", "doctorId", "scheduledAt");

-- CreateIndex
CREATE INDEX "appointments_tenantId_petId_idx" ON "appointments"("tenantId", "petId");

-- CreateIndex
CREATE INDEX "medical_records_tenantId_idx" ON "medical_records"("tenantId");

-- CreateIndex
CREATE INDEX "medical_records_tenantId_petId_idx" ON "medical_records"("tenantId", "petId");

-- CreateIndex
CREATE INDEX "prescriptions_tenantId_idx" ON "prescriptions"("tenantId");

-- CreateIndex
CREATE INDEX "prescriptions_tenantId_medicalRecordId_idx" ON "prescriptions"("tenantId", "medicalRecordId");

-- CreateIndex
CREATE INDEX "inventory_items_tenantId_idx" ON "inventory_items"("tenantId");

-- CreateIndex
CREATE INDEX "inventory_items_tenantId_barcode_idx" ON "inventory_items"("tenantId", "barcode");

-- CreateIndex
CREATE INDEX "branch_inventory_tenantId_branchId_productId_idx" ON "branch_inventory"("tenantId", "branchId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "branch_inventory_tenantId_branchId_productId_key" ON "branch_inventory"("tenantId", "branchId", "productId");

-- CreateIndex
CREATE INDEX "stock_movements_tenantId_itemId_createdAt_idx" ON "stock_movements"("tenantId", "itemId", "createdAt");

-- CreateIndex
CREATE INDEX "stock_movements_tenantId_branchId_itemId_createdAt_idx" ON "stock_movements"("tenantId", "branchId", "itemId", "createdAt");

-- CreateIndex
CREATE INDEX "invoices_tenantId_petId_idx" ON "invoices"("tenantId", "petId");

-- CreateIndex
CREATE INDEX "invoices_tenantId_issuedAt_idx" ON "invoices"("tenantId", "issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_tenantId_invoiceNo_key" ON "invoices"("tenantId", "invoiceNo");

-- CreateIndex
CREATE INDEX "invoice_items_tenantId_invoiceId_idx" ON "invoice_items"("tenantId", "invoiceId");

-- CreateIndex
CREATE INDEX "vaccinations_tenantId_petId_idx" ON "vaccinations"("tenantId", "petId");

-- CreateIndex
CREATE INDEX "vaccinations_tenantId_nextDueAt_idx" ON "vaccinations"("tenantId", "nextDueAt");

-- CreateIndex
CREATE INDEX "attachments_tenantId_medicalRecordId_idx" ON "attachments"("tenantId", "medicalRecordId");

-- CreateIndex
CREATE INDEX "attachments_uploadedByUserId_idx" ON "attachments"("uploadedByUserId");

-- CreateIndex
CREATE INDEX "branches_tenantId_isActive_idx" ON "branches"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "branches_tenantId_name_key" ON "branches"("tenantId", "name");

-- CreateIndex
CREATE INDEX "user_branches_tenantId_userId_idx" ON "user_branches"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_branches_tenantId_userId_branchId_key" ON "user_branches"("tenantId", "userId", "branchId");

-- CreateIndex
CREATE INDEX "doctor_shifts_tenantId_branchId_doctorId_idx" ON "doctor_shifts"("tenantId", "branchId", "doctorId");

-- CreateIndex
CREATE UNIQUE INDEX "doctor_shifts_tenantId_branchId_doctorId_dayOfWeek_key" ON "doctor_shifts"("tenantId", "branchId", "doctorId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "hospitalizations_tenantId_petId_status_idx" ON "hospitalizations"("tenantId", "petId", "status");

-- CreateIndex
CREATE INDEX "hospitalizations_tenantId_branchId_status_idx" ON "hospitalizations"("tenantId", "branchId", "status");

-- CreateIndex
CREATE INDEX "daily_inpatient_care_tenantId_hospitalizationId_recordedAt_idx" ON "daily_inpatient_care"("tenantId", "hospitalizationId", "recordedAt");

-- CreateIndex
CREATE INDEX "daily_inpatient_care_performedBy_idx" ON "daily_inpatient_care"("performedBy");

-- CreateIndex
CREATE INDEX "grooming_bookings_tenantId_branchId_scheduledAt_idx" ON "grooming_bookings"("tenantId", "branchId", "scheduledAt");

-- CreateIndex
CREATE INDEX "grooming_bookings_tenantId_groomerId_scheduledAt_idx" ON "grooming_bookings"("tenantId", "groomerId", "scheduledAt");

-- CreateIndex
CREATE INDEX "blood_donors_tenantId_bloodType_idx" ON "blood_donors"("tenantId", "bloodType");

-- CreateIndex
CREATE UNIQUE INDEX "blood_donors_tenantId_petId_key" ON "blood_donors"("tenantId", "petId");

-- CreateIndex
CREATE INDEX "blood_donations_tenantId_status_expiryDate_idx" ON "blood_donations"("tenantId", "status", "expiryDate");

-- CreateIndex
CREATE INDEX "blood_transfusions_tenantId_recipientPetId_idx" ON "blood_transfusions"("tenantId", "recipientPetId");

-- CreateIndex
CREATE INDEX "loyalty_transactions_tenantId_ownerId_idx" ON "loyalty_transactions"("tenantId", "ownerId");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_createdAt_idx" ON "audit_logs"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "pet_reminders_tenantId_dueDate_status_idx" ON "pet_reminders"("tenantId", "dueDate", "status");

-- CreateIndex
CREATE INDEX "pet_reminders_tenantId_petId_idx" ON "pet_reminders"("tenantId", "petId");

-- CreateIndex
CREATE INDEX "roles_tenantId_idx" ON "roles"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "roles_tenantId_name_key" ON "roles"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_tenantId_userId_key" ON "user_roles"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "platform_users_email_key" ON "platform_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "plans_key_key" ON "plans"("key");

-- CreateIndex
CREATE INDEX "platform_audit_logs_performedByPlatformUserId_createdAt_idx" ON "platform_audit_logs"("performedByPlatformUserId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "platform_audit_logs_targetTenantId_createdAt_idx" ON "platform_audit_logs"("targetTenantId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_familyId_idx" ON "refresh_tokens"("familyId");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_tenantId_idx" ON "refresh_tokens"("userId", "tenantId");

-- CreateIndex
CREATE INDEX "refresh_tokens_expiresAt_idx" ON "refresh_tokens"("expiresAt");

-- CreateIndex
CREATE INDEX "payment_history_tenantId_branchId_idx" ON "payment_history"("tenantId", "branchId");

-- CreateIndex
CREATE INDEX "payment_history_tenantId_paidAt_idx" ON "payment_history"("tenantId", "paidAt");

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_companyTypeId_fkey" FOREIGN KEY ("companyTypeId") REFERENCES "company_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_storage_config" ADD CONSTRAINT "tenant_storage_config_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings_audit_log" ADD CONSTRAINT "settings_audit_log_changedBy_fkey" FOREIGN KEY ("changedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owners" ADD CONSTRAINT "owners_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pets" ADD CONSTRAINT "pets_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pets" ADD CONSTRAINT "pets_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pets" ADD CONSTRAINT "pets_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_medicalRecordId_fkey" FOREIGN KEY ("medicalRecordId") REFERENCES "medical_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_drugId_fkey" FOREIGN KEY ("drugId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_inventory" ADD CONSTRAINT "branch_inventory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_inventory" ADD CONSTRAINT "branch_inventory_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_inventory" ADD CONSTRAINT "branch_inventory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_medicalRecordId_fkey" FOREIGN KEY ("medicalRecordId") REFERENCES "medical_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccinations" ADD CONSTRAINT "vaccinations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccinations" ADD CONSTRAINT "vaccinations_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_medicalRecordId_fkey" FOREIGN KEY ("medicalRecordId") REFERENCES "medical_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_branches" ADD CONSTRAINT "user_branches_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_branches" ADD CONSTRAINT "user_branches_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_branches" ADD CONSTRAINT "user_branches_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_shifts" ADD CONSTRAINT "doctor_shifts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospitalizations" ADD CONSTRAINT "hospitalizations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospitalizations" ADD CONSTRAINT "hospitalizations_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_inpatient_care" ADD CONSTRAINT "daily_inpatient_care_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_inpatient_care" ADD CONSTRAINT "daily_inpatient_care_hospitalizationId_fkey" FOREIGN KEY ("hospitalizationId") REFERENCES "hospitalizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_inpatient_care" ADD CONSTRAINT "daily_inpatient_care_performedBy_fkey" FOREIGN KEY ("performedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grooming_bookings" ADD CONSTRAINT "grooming_bookings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grooming_bookings" ADD CONSTRAINT "grooming_bookings_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blood_donors" ADD CONSTRAINT "blood_donors_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blood_donors" ADD CONSTRAINT "blood_donors_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blood_donations" ADD CONSTRAINT "blood_donations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blood_donations" ADD CONSTRAINT "blood_donations_donorId_fkey" FOREIGN KEY ("donorId") REFERENCES "blood_donors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blood_transfusions" ADD CONSTRAINT "blood_transfusions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blood_transfusions" ADD CONSTRAINT "blood_transfusions_recipientPetId_fkey" FOREIGN KEY ("recipientPetId") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_reminders" ADD CONSTRAINT "pet_reminders_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_reminders" ADD CONSTRAINT "pet_reminders_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_sourceRoleId_fkey" FOREIGN KEY ("sourceRoleId") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionCode_fkey" FOREIGN KEY ("permissionCode") REFERENCES "permissions"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_quotas" ADD CONSTRAINT "tenant_quotas_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_audit_logs" ADD CONSTRAINT "platform_audit_logs_targetTenantId_fkey" FOREIGN KEY ("targetTenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_audit_logs" ADD CONSTRAINT "platform_audit_logs_performedByPlatformUserId_fkey" FOREIGN KEY ("performedByPlatformUserId") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_provisioning" ADD CONSTRAINT "tenant_provisioning_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_provisioning" ADD CONSTRAINT "tenant_provisioning_updatedByPlatformUserId_fkey" FOREIGN KEY ("updatedByPlatformUserId") REFERENCES "platform_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_history" ADD CONSTRAINT "payment_history_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_history" ADD CONSTRAINT "payment_history_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_history" ADD CONSTRAINT "payment_history_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_history" ADD CONSTRAINT "payment_history_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- ============================================================
-- SECTION 4: ROW-LEVEL SECURITY (RLS) — NOT DEPLOYED
-- ============================================================
-- R2-HI-01: RLS is a design target, not an executable migration set. It
-- has never been applied to any Anemal environment.
--
-- The previous revision of this file carried ~130 lines of
-- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` / `CREATE POLICY` statements.
-- They have been REMOVED rather than regenerated, because they were not
-- runnable and were actively misleading:
--   * they were written in snake_case ("tenant_id") while the live database
--     uses quoted camelCase ("tenantId");
--   * they referenced a table `products` that no longer exists — it is now
--     `inventory_items`;
--   * they covered 25 of the 43 live tables and had not been updated since
--     before Phase 8, so every RBAC, platform and storage table was absent.
-- Keeping non-executable DDL in the canonical DDL file is exactly the drift
-- this file exists to prevent. The rationale below is preserved because it
-- records a real decision; the statements are not.
--
-- Deploying RLS for real requires, at minimum:
--   1. A second, non-owner DB role — the app's current role bypasses RLS as
--      table owner — plus a separate DATABASE_URL for that role.
--   2. Wrapping every request in an interactive transaction so
--      `SET LOCAL app.current_tenant_id` is scoped correctly. The current
--      architecture uses one shared PrismaClient pool with no per-request
--      transaction wrapper, so SET LOCAL has no safe place to attach.
--   3. Integration coverage for the platform-plane bypass role: platform
--      users have no tenantId and must read across tenants by design.
--   4. A decision for every nullable-tenantId table in group C above —
--      a naive `"tenantId" = current_setting(...)` policy would silently
--      hide system role templates and platform refresh tokens.
--
-- Until all four exist, turning on FORCE ROW LEVEL SECURITY would return
-- zero rows for every tenant query — it would break the product, not
-- enforce isolation.
--
-- TENANT ISOLATION IS ENFORCED TODAY AT THE REPOSITORY LAYER ONLY:
-- an explicit `WHERE "tenantId" = :tenantId` on every query, with the value
-- passed in as a parameter from the JWT middleware. That is the control
-- @db-agent audits and @qa-agent tests (tenant B requesting a tenant A
-- resource must receive 404).
-- ============================================================
