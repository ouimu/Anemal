-- Phase 4 — multi-branch + advanced operations. Data-preserving, ordered manually:
-- create branches → seed Main Branch per tenant → backfill branchId cols →
-- backfill branch_inventory from flat stock → drop old stock cols → create rest.

-- ── 1. Branches ──────────────────────────────────────────────────────────────
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
CREATE INDEX "branches_tenantId_isActive_idx" ON "branches"("tenantId", "isActive");
CREATE UNIQUE INDEX "branches_tenantId_name_key" ON "branches"("tenantId", "name");
ALTER TABLE "branches" ADD CONSTRAINT "branches_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One default branch per existing tenant.
INSERT INTO "branches" ("tenantId", "name", "updatedAt")
SELECT "id", 'Main Branch', CURRENT_TIMESTAMP FROM "tenants";

-- ── 2. branchId columns on existing tables + backfill to the tenant's Main Branch ──
ALTER TABLE "users" ADD COLUMN "allowedEndTime" VARCHAR(5),
  ADD COLUMN "allowedStartTime" VARCHAR(5),
  ADD COLUMN "branchId" INTEGER,
  ADD COLUMN "lastLoginAt" TIMESTAMP(3);
ALTER TABLE "appointments" ADD COLUMN "branchId" INTEGER;
ALTER TABLE "invoices" ADD COLUMN "branchId" INTEGER;
ALTER TABLE "medical_records" ADD COLUMN "branchId" INTEGER;
ALTER TABLE "stock_movements" ADD COLUMN "branchId" INTEGER, ADD COLUMN "destinationBranchId" INTEGER;

UPDATE "users" u           SET "branchId" = b."id" FROM "branches" b WHERE b."tenantId" = u."tenantId";
UPDATE "appointments" a    SET "branchId" = b."id" FROM "branches" b WHERE b."tenantId" = a."tenantId";
UPDATE "invoices" i        SET "branchId" = b."id" FROM "branches" b WHERE b."tenantId" = i."tenantId";
UPDATE "medical_records" m SET "branchId" = b."id" FROM "branches" b WHERE b."tenantId" = m."tenantId";
UPDATE "stock_movements" s SET "branchId" = b."id" FROM "branches" b WHERE b."tenantId" = s."tenantId";

CREATE INDEX "users_tenantId_branchId_idx" ON "users"("tenantId", "branchId");
CREATE INDEX "stock_movements_tenantId_branchId_itemId_createdAt_idx" ON "stock_movements"("tenantId", "branchId", "itemId", "createdAt");
ALTER TABLE "users" ADD CONSTRAINT "users_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 3. branch_inventory (source of truth) + backfill from flat stock ─────────
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
CREATE INDEX "branch_inventory_tenantId_branchId_productId_idx" ON "branch_inventory"("tenantId", "branchId", "productId");
CREATE UNIQUE INDEX "branch_inventory_tenantId_branchId_productId_key" ON "branch_inventory"("tenantId", "branchId", "productId");
ALTER TABLE "branch_inventory" ADD CONSTRAINT "branch_inventory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "branch_inventory" ADD CONSTRAINT "branch_inventory_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "branch_inventory" ADD CONSTRAINT "branch_inventory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Move each product's flat stock into its tenant's Main Branch.
INSERT INTO "branch_inventory" ("tenantId", "branchId", "productId", "stockQty", "minStockQty", "expiryDate", "updatedAt")
SELECT i."tenantId", b."id", i."id", i."stockQuantity", i."minStockLevel", i."expiryDate", CURRENT_TIMESTAMP
FROM "inventory_items" i JOIN "branches" b ON b."tenantId" = i."tenantId";

-- ── 4. Drop flat stock columns (now migrated) ───────────────────────────────
ALTER TABLE "inventory_items" DROP COLUMN "expiryDate", DROP COLUMN "minStockLevel", DROP COLUMN "stockQuantity";

-- ── 5. Owner loyalty / soft-delete columns ──────────────────────────────────
ALTER TABLE "owners" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "loyaltyPoints" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "membershipTier" VARCHAR(50) NOT NULL DEFAULT 'standard';

-- ── 6. New Phase 4 tables ───────────────────────────────────────────────────
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
CREATE INDEX "doctor_shifts_tenantId_branchId_doctorId_idx" ON "doctor_shifts"("tenantId", "branchId", "doctorId");
CREATE UNIQUE INDEX "doctor_shifts_tenantId_branchId_doctorId_dayOfWeek_key" ON "doctor_shifts"("tenantId", "branchId", "doctorId", "dayOfWeek");
ALTER TABLE "doctor_shifts" ADD CONSTRAINT "doctor_shifts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
CREATE INDEX "hospitalizations_tenantId_petId_status_idx" ON "hospitalizations"("tenantId", "petId", "status");
CREATE INDEX "hospitalizations_tenantId_branchId_status_idx" ON "hospitalizations"("tenantId", "branchId", "status");
ALTER TABLE "hospitalizations" ADD CONSTRAINT "hospitalizations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hospitalizations" ADD CONSTRAINT "hospitalizations_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
CREATE INDEX "daily_inpatient_care_tenantId_hospitalizationId_recordedAt_idx" ON "daily_inpatient_care"("tenantId", "hospitalizationId", "recordedAt");
ALTER TABLE "daily_inpatient_care" ADD CONSTRAINT "daily_inpatient_care_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "daily_inpatient_care" ADD CONSTRAINT "daily_inpatient_care_hospitalizationId_fkey" FOREIGN KEY ("hospitalizationId") REFERENCES "hospitalizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
CREATE INDEX "grooming_bookings_tenantId_branchId_scheduledAt_idx" ON "grooming_bookings"("tenantId", "branchId", "scheduledAt");
CREATE INDEX "grooming_bookings_tenantId_groomerId_scheduledAt_idx" ON "grooming_bookings"("tenantId", "groomerId", "scheduledAt");
ALTER TABLE "grooming_bookings" ADD CONSTRAINT "grooming_bookings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "grooming_bookings" ADD CONSTRAINT "grooming_bookings_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
CREATE INDEX "blood_donors_tenantId_bloodType_idx" ON "blood_donors"("tenantId", "bloodType");
CREATE UNIQUE INDEX "blood_donors_tenantId_petId_key" ON "blood_donors"("tenantId", "petId");
ALTER TABLE "blood_donors" ADD CONSTRAINT "blood_donors_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "blood_donors" ADD CONSTRAINT "blood_donors_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
CREATE INDEX "blood_donations_tenantId_status_expiryDate_idx" ON "blood_donations"("tenantId", "status", "expiryDate");
ALTER TABLE "blood_donations" ADD CONSTRAINT "blood_donations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "blood_donations" ADD CONSTRAINT "blood_donations_donorId_fkey" FOREIGN KEY ("donorId") REFERENCES "blood_donors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
CREATE INDEX "blood_transfusions_tenantId_recipientPetId_idx" ON "blood_transfusions"("tenantId", "recipientPetId");
ALTER TABLE "blood_transfusions" ADD CONSTRAINT "blood_transfusions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "blood_transfusions" ADD CONSTRAINT "blood_transfusions_recipientPetId_fkey" FOREIGN KEY ("recipientPetId") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
CREATE INDEX "loyalty_transactions_tenantId_ownerId_idx" ON "loyalty_transactions"("tenantId", "ownerId");
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
CREATE INDEX "audit_logs_tenantId_createdAt_idx" ON "audit_logs"("tenantId", "createdAt");
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
CREATE INDEX "pet_reminders_tenantId_dueDate_status_idx" ON "pet_reminders"("tenantId", "dueDate", "status");
CREATE INDEX "pet_reminders_tenantId_petId_idx" ON "pet_reminders"("tenantId", "petId");
ALTER TABLE "pet_reminders" ADD CONSTRAINT "pet_reminders_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pet_reminders" ADD CONSTRAINT "pet_reminders_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
